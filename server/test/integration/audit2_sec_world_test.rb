ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'stringio'
require 'action_dispatch/testing/integration'
require 'action_cable/channel/test_case'

# Audit round two, "sec-world": each test fails on the code it was written
# against because of the finding it is named after, and passes once the fix
# lands. The world is driven directly, as in security_realtime_test.rb.
class Audit2SecWorldTest < Minitest::Test
  W = Vanai::World

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades trade_invites company_invites].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@next_party_id, 0)
    W.initialize_ferry
    @messages = []
    test = self
    @original_send = W.method(:to_char)
    W.define_singleton_method(:to_char) { |id, payload = nil, **kw| test.instance_variable_get(:@messages) << [id, payload || kw] }
    @log = StringIO.new
    @original_logger = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(@log)
    @user = User.create!(email: 'audit2-sec-world@example.invalid', password: 'isolated-test-password')
  end

  def teardown
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    Rails.logger = @original_logger
    W.define_singleton_method(:to_char, @original_send)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def make_char(name, x: 79, z: -18, zone: 'caerdun')
    c = Character.provision!(user: @user, name: name, job: 'PLD', city: 'caerdun')
    c.update!(x: x, z: z, zone: zone)
    c
  end

  def me(id) = W.find_player(id)&.last
  def to(id) = @messages.select { |cid, _| cid == id }.map(&:last)
  def said(id) = to(id).filter_map { |p| p[:msg] }
  def parties = W.instance_variable_get(:@parties)
  def trades = W.instance_variable_get(:@trades)

  # ---------- sec-world-party-seat-transfer-disconnect ----------

  def test_sec_world_party_seat_transfer_disconnect
    lead = make_char('Worldlead'); b = make_char('Worldmemb', x: 80); c = make_char('Worldthird', x: 81)
    W.join(lead.id, session_id: 'lead-old'); W.join(b.id, session_id: 'b'); W.join(c.id, session_id: 'c')
    W.party_invite(lead.id, b.name)
    W.party_respond(b.id, true)
    party = parties.values.first
    assert_equal lead.id, party.leader_id
    W.travel(lead.id, { 'to' => 'caerdunfields', 'tx' => -300, 'tz' => -30 }) # leave(transferring: true)
    W.leave(lead.id, session_id: 'lead-old') # the old channel's unsubscribe; no join ever follows
    W.reap_party_grace(Vanai.now + W::PARTY_GRACE + 3600)
    refute_includes party.member_ids, lead.id, 'the member who never arrived keeps the seat an hour past PARTY_GRACE'
    @messages.clear
    W.party_invite(b.id, c.name)
    refute_includes said(b.id), 'Only the leader may invite.', 'the lead stays with the ghost'
  end

  # ---------- sec-world-boss-adds-accumulate ----------

  def boss_fight
    hero = make_char('Bossfoe', x: 64, z: 100, zone: 'mausoleum')
    W.join(hero.id)
    z = W.zone('mausoleum')
    boss = z.monsters.values.find { |m| m.key == 'the_warden_of_the_mausoleum' }
    assert boss, 'the Mausoleum has its boss'
    ps = me(hero.id)
    boss.state = :aggro
    boss.enmity[ps.id] = 100
    [z, boss, ps]
  end

  def test_sec_world_boss_adds_accumulate_leak
    z, boss, ps = boss_fight
    before = z.monsters.size
    boss.hp = (boss.max_hp * 0.3).to_i # past both thresholds: four adds
    z.boss_tick(boss, Vanai.now)
    adds = z.monsters.values.select { |m| m.camp.nil? }
    assert_equal 4, adds.size, 'the boss called its four adds'
    adds.each { |a| Vanai::Combat.monster_death(z, a, ps) }
    Vanai::Combat.monster_death(z, boss, ps)
    z.tick_monsters(Vanai.now + 100_000) # long past every respawn
    assert_equal :idle, boss.state, 'the boss came back'
    assert_equal before, z.monsters.size, "#{z.monsters.size - before} dead adds stay in the zone for good"
  end

  def test_sec_world_boss_adds_accumulate_wipe
    z, boss, = boss_fight
    boss.hp = (boss.max_hp * 0.6).to_i
    z.boss_tick(boss, Vanai.now)
    assert_equal 2, z.monsters.values.count { |m| m.camp.nil? }, 'adds at 66%'
    z.reset_monster(boss) # the party wiped; the boss is whole again
    assert_equal boss.max_hp, boss.hp
    boss.state = :aggro
    boss.enmity['p0'] = 1
    boss.hp = (boss.max_hp * 0.6).to_i # the second attempt passes 66% again
    before = z.monsters.values.count { |m| m.camp.nil? && m.alive? }
    z.boss_tick(boss, Vanai.now)
    after = z.monsters.values.count { |m| m.camp.nil? && m.alive? }
    assert_equal before + 2, after, 'the second attempt gets no adds: adds_done survived the reset'
  end

  # ---------- sec-world-trade-double-membership ----------

  def test_sec_world_trade_double_membership
    a = make_char('Tradera'); b = make_char('Traderb', x: 80); c = make_char('Traderc', x: 81)
    [a, b, c].each { |ch| W.join(ch.id) }
    W.trade_invite(a.id, b.name)
    W.trade_invite(a.id, c.name)
    W.trade_respond(b.id, true)
    W.trade_respond(c.id, true)
    held = trades.values.count { |t| t[:a] == a.id || t[:b] == a.id }
    assert_operator held, :<=, 1, "A is in #{held} trades at once"
    W.leave(a.id)
    assert_nil W.trade_of(c.id), "C's trade with A outlives A's logout"
  end

  # ---------- sec-world-marked-cutscene-replay-teleport ----------

  def test_sec_world_marked_cutscene_replay_teleport
    # 129 m from story_regent_walls' mark (-7.9, -148.6)
    hero = make_char('Replayer', x: -7.9, z: -19.6, zone: 'burnedland')
    W.join(hero.id)
    ps = me(hero.id)
    ps.cutscenes_seen << 'story_regent_walls' # finished ash3 long ago
    W.cutscene_begin(hero.id, 'story_regent_walls')
    assert_equal 'story_regent_walls', ps.cutscene, 'the replay began'
    W.cutscene_end(hero.id, 'story_regent_walls')
    moved = Math.hypot(ps.x - -7.9, ps.z - -19.6)
    assert_operator moved, :<, 1.0, "a replay moved the player #{moved.round} m to (#{ps.x}, #{ps.z})"
  end

  # ---------- sec-world-per-character-hashes-unpruned ----------

  def test_sec_world_per_character_hashes_unpruned_invites
    a = make_char('Asker'); b = make_char('Ignorer', x: 80)
    W.join(a.id); W.join(b.id)
    W.party_invite(a.id, b.name)
    W.trade_invite(a.id, b.name)
    W.leave(b.id) # logs out without answering
    W.leave(a.id)
    left = { pending: W.instance_variable_get(:@pending_invites).key?(b.id),
             trade: W.instance_variable_get(:@trade_invites).key?(b.id) }
    assert_equal({ pending: false, trade: false }, left, 'invitations to a character who left stay for good')
  end
end

# ---------- sec-world-subscribe-churn and the bucket map ----------

class Audit2SecWorldChannelTest < ActionCable::Channel::TestCase
  tests ZoneChannel
  W = Vanai::World

  def setup
    super
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    W.instance_variable_set(:@queue, Queue.new)
    ZoneChannel::BUCKET_LOCK.synchronize { ZoneChannel::BUCKETS_BY_CHAR.clear }
    @user = User.create!(email: 'audit2-sec-world-cable@example.invalid', password: 'isolated-test-password')
    @char = Character.provision!(user: @user, name: 'Churner', job: 'PLD', city: 'caerdun')
    stub_connection current_user_id: @user.id, current_character_id: @char.id
  end

  def teardown
    ActiveRecord::Base.connection.rollback_transaction
    super
  end

  def drain
    calls = Hash.new(0)
    originals = %i[join leave].to_h { |n| [n, W.method(n)] }
    originals.each_key { |n| W.define_singleton_method(n) { |*_a, **_k| calls[n] += 1 } }
    q = W.instance_variable_get(:@queue)
    q.pop.call until q.empty?
    calls
  ensure
    originals.each { |n, m| W.define_singleton_method(n, m) }
  end

  def test_sec_world_subscribe_churn
    50.times do
      subscribe
      unsubscribe
    end
    calls = drain
    assert_operator calls[:join], :<=, 10, "50 subscribe/unsubscribe pairs in a burst queued #{calls[:join]} joins and #{calls[:leave]} leaves"
  end

  def test_sec_world_per_character_hashes_unpruned_buckets
    subscribe
    perform :chat, channel: 'say', msg: 'hello'
    unsubscribe
    drain
    refute ZoneChannel::BUCKETS_BY_CHAR.key?(@char.id), 'the bucket outlives the last subscription'
  end
end

# ---------- sec-world-equip-during-job-change ----------

# World.change_job's writes land between equip's job and level checks and its
# lock, as in security_economy_test.rb.
class Audit2SecWorldEquipTest < Minitest::Test
  module SecWorldRivalBeforeLock
    def lock!(*args, **opts)
      rival = Thread.current[:audit2_sec_world_rival]
      Thread.current[:audit2_sec_world_rival] = nil
      rival&.call
      super
    end
  end
  Character.prepend(SecWorldRivalBeforeLock) unless Character.ancestors.include?(SecWorldRivalBeforeLock)

  def setup
    raise 'Test database only' unless Rails.env.test?
    @previous_queue = Vanai::World.instance_variable_get(:@queue)
    Vanai::World.instance_variable_set(:@queue, Queue.new)
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @api = ActionDispatch::Integration::Session.new(Rails.application)
    @api.host! 'localhost'
    @api.post '/api/register', params: { email: 'audit2-sec-world-equip@example.invalid', password: 'isolated-test-password' }, as: :json
    @api.post '/api/characters', params: { name: 'Jobracer', race: 'aedri', job: 'PLD', city: 'caerdun' }, as: :json
    assert_equal 200, @api.response.status, @api.response.body
    @character = Character.find(JSON.parse(@api.response.body).dig('character', 'id'))
    @character.character_jobs.where(job: 'PLD').update_all(level: 50)
    @api.post "/api/characters/#{@character.id}/select", as: :json
  end

  def teardown
    Thread.current[:audit2_sec_world_rival] = nil
    Vanai::World.instance_variable_set(:@queue, @previous_queue)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def test_sec_world_equip_during_job_change
    blade = @character.inventory_items.create!(item_key: 'tideworn_blade', qty: 1) # a level-34 PLD sword
    id = @character.id
    # World.change_job's db block, as written: no lock, autocommits
    Thread.current[:audit2_sec_world_rival] = lambda do
      changed = Character.find(id)
      changed.update!(active_job: 'WHM')
      changed.unequip_incompatible_job_gear!
    end
    @api.post '/api/game/equip', params: { inventory_item_id: blade.id }, as: :json
    assert_nil Thread.current[:audit2_sec_world_rival], 'the rival ran'
    assert_equal 'WHM', @character.reload.active_job
    assert_nil blade.reload.equipped_slot,
               "a level-1 White Mage holds a level-34 Paladin sword (response #{@api.response.body[0, 60]})"
  end
end
