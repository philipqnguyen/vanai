ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'ostruct'

# What a kill asks of the database on the world thread (combat.rb award_loot,
# credit_gold, pick_recipient): the party's gold in one statement, taken in
# the characters-by-id lock order, and the bags read for a drop only when a
# quest could change who gets it. Every share and every pick stays what it
# was when each member had a statement of their own.
class KillPathDbTest < Minitest::Test
  W = Vanai::World
  CB = Vanai::Combat

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades trade_invites].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@next_party_id, 0)
    W.initialize_ferry
    @messages = []
    test = self
    @original_send = W.method(:to_char)
    W.define_singleton_method(:to_char) { |id, payload = nil, **kw| test.instance_variable_get(:@messages) << [id, payload || kw] }
    @rng = CB.instance_variable_get(:@rng)
    @user = User.create!(email: 'kill-path-db@example.invalid', password: 'isolated-test-password')
  end

  def teardown
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    W.define_singleton_method(:to_char, @original_send)
    CB.instance_variable_set(:@rng, @rng)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def party_of(n)
    chars = n.times.map do |i|
      c = Character.provision!(user: @user, name: "Killdb#{('a'.ord + i).chr}", job: 'PLD', city: 'caerdun')
      c.update!(x: 79 + i, z: -18, zone: 'caerdun')
      c
    end
    chars.each { |c| W.join(c.id) }
    [W.zone('caerdun'), chars.map { |c| W.find_player(c.id).last }]
  end

  # the statements the block runs, transaction bookkeeping left out
  def statements
    seen = []
    sub = ActiveSupport::Notifications.subscribe('sql.active_record') do |*, p|
      seen << p[:sql] unless p[:name] == 'SCHEMA' || p[:sql] =~ /\A\s*(BEGIN|COMMIT|SAVEPOINT|RELEASE)/
    end
    yield
    seen
  ensure
    ActiveSupport::Notifications.unsubscribe(sub)
  end

  def without_relics
    relics = Vanai::Courts::Relics
    on_kill = relics.method(:on_kill)
    relics.define_singleton_method(:on_kill) { |*| }
    yield
  ensure
    relics.define_singleton_method(:on_kill, on_kill)
  end

  def monster(gold, drops = [])
    OpenStruct.new(definition: { 'gold' => [gold, gold], 'drops' => drops })
  end

  # The split as it stood: each member its even part, the remainder a gold
  # apiece to the first in line, the killer leading.
  def shares(gold, members, killer)
    line = members.include?(killer) ? [killer] + (members - [killer]) : members
    base, rem = gold.divmod(line.size)
    line.each_with_index.to_h { |p, i| [p.char_id, base + (i < rem ? 1 : 0)] }
  end

  def test_party_gold_is_one_statement_with_every_share_unchanged
    zone, members = party_of(6)
    killer = members[3]
    [1, 2, 5, 6, 7, 61, 100].each do |gold|
      before = members.to_h { |p| [p.char_id, p.gold] }
      db_before = Character.where(id: before.keys).pluck(:id, :gold).to_h
      @messages.clear
      sql = without_relics { statements { CB.award_loot(zone, monster(gold), members, killer) } }
      gold_sql = sql.grep(/UPDATE "characters"/)
      assert_equal 1, gold_sql.size, "#{gold} gold took #{gold_sql.size} statements: #{gold_sql.inspect}"
      assert_equal 1, sql.size, "a drop with no items is the gold alone: #{sql.inspect}"
      want = shares(gold, members, killer)
      got = members.to_h { |p| [p.char_id, p.gold - before[p.char_id]] }
      assert_equal want, got, "the in-memory shares of #{gold}"
      db = Character.where(id: before.keys).pluck(:id, :gold).to_h
      assert_equal want, db.to_h { |id, g| [id, g - db_before[id]] }, "the rows' shares of #{gold}"
      assert_equal gold, got.values.sum
      # a loot message for each member paid, none for a share of nothing
      paid = @messages.select { |_, m| m[:t] == 'loot' }.to_h { |id, m| [id, m[:gold]] }
      assert_equal want.reject { |_, s| s.zero? }, paid
    end
  end

  # Trades, mail, the auction house and the council lock two characters by
  # id; a payout taking them in any other order could deadlock with one of
  # those and hold the tick for the deadlock timeout.
  def test_party_gold_locks_the_rows_by_id
    zone, members = party_of(3)
    sql = without_relics { statements { CB.award_loot(zone, monster(30), members.reverse, members.last) } }
    assert_equal 1, sql.size
    assert_match(/ORDER BY "characters"\."id" ASC FOR UPDATE/, sql.first)
    assert_match(/gold = gold \+ CASE id/, sql.first, 'still an increment, not a value read from memory')
  end

  def test_a_lone_share_is_one_plain_increment
    zone, members = party_of(1)
    sql = without_relics { statements { CB.award_loot(zone, monster(9), members, members.first) } }
    assert_equal 1, sql.size
    refute_match(/FOR UPDATE/, sql.first)
    assert_equal members.first.gold, Character.find(members.first.char_id).gold
  end

  def test_a_kill_with_no_gold_writes_nothing
    zone, members = party_of(2)
    sql = without_relics { statements { CB.award_loot(zone, monster(0), members, members.first) } }
    assert_empty sql
  end

  # ---- pick_recipient ----

  # pick_recipient as it stood: the grouped bag count read for every drop.
  def reference_pick(members, item_key, rng)
    have = InventoryItem.where(character_id: members.map(&:char_id), item_key: item_key, equipped_slot: nil)
                        .group(:character_id).sum(:qty)
    needing = members.select do |p|
      p.quests.any? do |qk, st|
        next false unless st['status'] == QuestProgress::ACTIVE
        obj = Vanai::Data.quests.dig(qk, 'objective')
        obj && obj['type'] == 'collect' && obj['targets'].include?(item_key) && have.fetch(p.char_id, 0) < obj['count']
      end
    end
    (needing.presence || members).sample(random: rng)
  end

  def collect_quest
    Vanai::Data.quests.find { |_, q| q.dig('objective', 'type') == 'collect' && q.dig('objective', 'count').to_i > 1 }
  end

  def test_no_bag_query_when_no_quest_wants_the_item
    zone, members = party_of(6)
    item = collect_quest.last['objective']['targets'].first
    sql = statements { CB.pick_recipient(zone, members, item) }
    assert_empty sql, 'nobody collects it, so the bags cannot change the pick'
  end

  def test_no_bag_query_for_one_member
    zone, members = party_of(1)
    key, q = collect_quest
    members.first.quests[key] = { 'status' => QuestProgress::ACTIVE, 'progress' => 0 }
    sql = statements { assert_equal members.first, CB.pick_recipient(zone, members, q['objective']['targets'].first) }
    assert_empty sql
  end

  # The same members, the same journal and bags, the same seed: the same
  # recipient as the query-every-drop version, drop after drop.
  def test_picks_match_the_old_pick_for_every_quest_state
    zone, members = party_of(6)
    key, q = collect_quest
    item = q['objective']['targets'].first
    count = q['objective']['count']
    a, b, c, d, e, _f = members
    a.quests[key] = { 'status' => QuestProgress::ACTIVE, 'progress' => 0 }        # needs it
    b.quests[key] = { 'status' => QuestProgress::ACTIVE, 'progress' => 0 }        # holds enough
    InventoryItem.create!(character_id: b.char_id, item_key: item, qty: count)
    c.quests[key] = { 'status' => QuestProgress::COMPLETE, 'progress' => count }  # done
    d.quests['retired_quest_key'] = { 'status' => QuestProgress::ACTIVE, 'progress' => 0 }
    e.quests[key] = { 'status' => QuestProgress::ACTIVE, 'progress' => 0 }        # worn, not in the bags
    InventoryItem.create!(character_id: e.char_id, item_key: item, qty: count, equipped_slot: 'ring1')
    pools = [members, [b, c, d], [c, d], [a, b], [e, a], [d], [a]]
    pools.each do |pool|
      CB.instance_variable_set(:@rng, Random.new(7))
      got = Array.new(30) { CB.pick_recipient(zone, pool, item) }
      ref_rng = Random.new(7)
      want = Array.new(30) { reference_pick(pool, item, ref_rng) }
      assert_equal want.map(&:char_id), got.map(&:char_id), "pool #{pool.map(&:name).inspect}"
    end
  end

  # ---- award_xp ----

  def foe(level)
    OpenStruct.new(level: level, sheet: { 'xp_mult' => 1.0 })
  end

  def job_rows(members)
    CharacterJob.where(character_id: members.map(&:char_id)).where(job: members.first.job).pluck(:character_id, :level, :xp).to_h { |id, l, x| [id, [l, x]] }
  end

  def test_party_xp_is_one_statement_and_the_rows_match_the_world
    zone, members = party_of(6)
    sql = statements { CB.award_xp(zone, foe(1), members) }
    xp_sql = sql.grep(/UPDATE "character_jobs"/)
    assert_equal 1, xp_sql.size, xp_sql.inspect
    assert_match(/ORDER BY "character_jobs"\."character_id" ASC FOR UPDATE/, xp_sql.first)
    assert members.all? { |p| p.xp.positive? }
    assert_equal members.to_h { |p| [p.char_id, [p.level, p.xp]] }, job_rows(members)
  end

  # A member who levels saves their own row before recompute! reads it back;
  # the rest still go together, and every row ends where the world has it.
  def test_a_level_up_saves_itself_and_the_rest_are_batched
    zone, members = party_of(4)
    members[2].xp = Vanai::Stats.tnl(members[2].level) - 1
    sql = statements { CB.award_xp(zone, foe(1), members) }
    assert_equal 2, members[2].level
    assert_equal 2, sql.grep(/UPDATE "character_jobs"/).size, sql.inspect
    assert_equal members.to_h { |p| [p.char_id, [p.level, p.xp]] }, job_rows(members)
  end

  def test_a_lone_kill_is_one_plain_update
    zone, members = party_of(1)
    sql = statements { CB.award_xp(zone, foe(1), members) }
    assert_equal 1, sql.size, sql.inspect
    refute_match(/FOR UPDATE/, sql.first)
    assert_equal({ members.first.char_id => [members.first.level, members.first.xp] }, job_rows(members))
  end
end
