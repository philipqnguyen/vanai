ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'action_dispatch/testing/integration'

# What the world thread is asked to do at a join and after a REST mutation,
# and how much of it one tick takes on: joins share a time budget per tick
# (World::JOIN_BUDGET) and wait their turn in order; a join reads the journal
# by pluck and builds the same player; REST mutations ask for one recompute
# per character however many arrive, and the zone hears of a recompute only
# when what it is shown changed; the mutating endpoints are paced per
# character. No world thread is started.
class WorldLoadTest < Minitest::Test
  W = Vanai::World

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades
       join_requests join_tokens].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@join_backlog, nil)
    W.instance_variable_set(:@recompute_pending, Set.new)
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@next_party_id, 0)
    W.initialize_ferry
    @messages = []
    @broadcasts = []
    test = self
    @originals = %i[to_char broadcast_zone join recompute].to_h { |m| [m, W.method(m)] }
    W.define_singleton_method(:to_char) { |id, payload = nil, **kw| test.instance_variable_get(:@messages) << [id, payload || kw] }
    W.define_singleton_method(:broadcast_zone) { |key, payload| test.instance_variable_get(:@broadcasts) << [key, payload] }
    @user = User.create!(email: 'world-load@example.invalid', password: 'isolated-test-password')
  end

  def teardown
    @originals.each { |m, impl| W.define_singleton_method(m, impl) }
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    W.instance_variable_set(:@join_backlog, nil)
    ActiveRecord::Base.connection.rollback_transaction
    # the court rows a join ensured are rolled back with everything else
    Vanai::Courts.instance_variable_set(:@courts_ensured, false)
  end

  def make_char(name, zone: 'caerdun')
    c = Character.provision!(user: @user, name: name, job: 'PLD', city: 'caerdun')
    c.update!(zone: zone)
    c
  end

  def queue = W.instance_variable_get(:@queue)
  def drain = (queue.pop.call until queue.empty?)
  def me(id) = W.find_player(id)&.last

  # Joins that each cost a known slice of the budget, recorded in the order
  # they run; the character ids need no rows.
  def slow_joins(per = W.singleton_class::JOIN_BUDGET / 2.5)
    ran = []
    W.define_singleton_method(:join) do |cid, session_id: nil|
      sleep per
      ran << cid
    end
    ran
  end

  # ---------- join-storm-single-tick: the per-tick join budget ----------

  def test_a_storm_of_joins_spreads_over_ticks_in_the_order_it_came
    ran = slow_joins
    ids = (1..12).map { |i| 9_000_000 + i }
    ids.each { |cid| W.request_join(cid, "s#{cid}") }
    W.run_tick
    first = ran.size
    assert_operator first, :>=, 1, 'at least one join runs a tick'
    assert_operator first, :<=, 3, "a tick ran #{first} joins of #{(W.singleton_class::JOIN_BUDGET / 2.5 * 1000).round} ms each against a #{(W.singleton_class::JOIN_BUDGET * 1000).round} ms budget"
    ticks = 1
    until ran.size == ids.size || ticks >= ids.size
      W.run_tick
      ticks += 1
    end
    assert_equal ids, ran, 'every join ran once, in the order they were asked'
    assert_operator ticks, :<=, ids.size
    assert_empty W.join_requests
  end

  def test_a_deferred_join_keeps_its_token
    ran = slow_joins
    ids = (1..6).map { |i| 9_100_000 + i }
    # one token each: a deferral that spent it would leave the join refused
    # for two more seconds
    now = Vanai.now
    ids.each { |cid| W.join_tokens[cid] = [1.0, now] }
    ids.each { |cid| W.request_join(cid, "s#{cid}") }
    W.run_tick
    deferred = ids - ran
    refute_empty deferred
    deferred.each { |cid| assert_in_delta 1.0, W.join_tokens[cid].first, 1e-9, "the budget spent #{cid}'s token" }
    W.run_tick until ran.size == ids.size || W.join_requests.empty?
    assert_equal ids, ran
  end

  def test_a_new_join_waits_behind_the_ones_the_budget_left
    ran = slow_joins
    old = (1..6).map { |i| 9_200_000 + i }
    old.each { |cid| W.request_join(cid, "s#{cid}") }
    W.run_tick
    refute_equal old.size, ran.size, 'the budget left some standing'
    late = 9_200_100
    W.request_join(late, 'late')
    6.times { W.run_tick }
    assert_equal old + [late], ran
  end

  def test_a_deferred_join_can_still_be_cancelled
    ran = slow_joins
    ids = (1..6).map { |i| 9_300_000 + i }
    ids.each { |cid| W.request_join(cid, "s#{cid}") }
    W.run_tick
    gone = (ids - ran).last
    W.cancel_join(gone, "s#{gone}")
    6.times { W.run_tick }
    assert_equal ids - [gone], ran
  end

  # The budget is the tick's: a caller outside run_tick (a test draining the
  # queue by hand) is never refused.
  def test_the_budget_applies_only_inside_a_tick
    ran = slow_joins
    ids = (1..6).map { |i| 9_400_000 + i }
    ids.each { |cid| W.request_join(cid, "s#{cid}") }
    drain
    assert_equal ids, ran
  end

  # ---------- join-on-world-thread: a cheaper join, the same player ----------

  def test_a_plucked_journal_builds_the_same_player
    c = make_char('Plucker')
    active, done = Vanai::Data.quests.keys.first(2)
    c.quest_progresses.create!(quest_key: active, status: QuestProgress::ACTIVE, progress: 2, credited_targets: %w[npc_a npc_b])
    c.quest_progresses.create!(quest_key: done, status: QuestProgress::COMPLETE, progress: 1)
    # retired by the story pivot: left out, never raising
    c.quest_progresses.create!(quest_key: 'retired_long_ago', status: QuestProgress::COMPLETE, progress: 1)
    %w[scene_seen_old_scene zone_caerdun milestone_somewhere].each { |k| c.discoveries.create!(landmark_key: k) }
    preloaded = Vanai::PlayerState.new(Character.includes(:character_jobs, :inventory_items, :quest_progresses, :discoveries).find(c.id))
    plain = Vanai::PlayerState.new(Character.find(c.id))
    %i[quests lit_milestones cutscenes_seen cutscenes_due look sheet level xp gold public_payload].each do |attr|
      assert_equal preloaded.public_send(attr), plain.public_send(attr), attr.to_s
    end
    refute plain.quests.key?('retired_long_ago')
    assert_equal %w[npc_a npc_b], plain.quests[active]['credited']
    assert_includes plain.lit_milestones, 'somewhere'
    assert_includes plain.cutscenes_seen, 'old_scene'
    refute_empty plain.cutscenes_due, "provision! owes the intro, which a plucked key still finds"
  end

  def test_a_join_builds_no_row_it_does_not_read
    c = make_char('Lightfoot')
    c.quest_progresses.create!(quest_key: Vanai::Data.quests.keys.first, status: QuestProgress::ACTIVE, progress: 0)
    sql = []
    main = Thread.current
    sub = ActiveSupport::Notifications.subscribe('sql.active_record') do |*, p|
      sql << p[:sql] if Thread.current == main && p[:name] != 'SCHEMA'
    end
    W.join(c.id)
    ActiveSupport::Notifications.unsubscribe(sub)
    assert me(c.id), 'joined'
    loads = sql.grep(/\ASELECT "(inventory_items|quest_progresses|discoveries|character_jobs)"\.\*/)
    bag = loads.grep(/inventory_items/).reject { |q| q.include?('equipped_slot') }
    assert_empty bag, "a join loaded the whole bag:\n#{bag.join("\n")}"
    journal = loads.grep(/quest_progresses|discoveries/)
    assert_empty journal, "a join built row objects for the journal:\n#{journal.join("\n")}"
  end

  # ---------- rest-mutation-recompute-flood: one recompute per character ----------

  def counting_recomputes
    calls = Hash.new(0)
    original = @originals[:recompute]
    W.define_singleton_method(:recompute) do |cid|
      calls[cid] += 1
      original.call(cid)
    end
    calls
  end

  def test_requests_fold_into_one_recompute_per_character
    a = make_char('Folda'); b = make_char('Foldb')
    W.join(a.id); W.join(b.id)
    drain
    calls = counting_recomputes
    10.times { W.request_recompute(a.id); W.request_recompute(b.id) }
    assert_equal 2, queue.size, 'one waiting recompute per character'
    drain
    assert_equal({ a.id => 1, b.id => 1 }, calls)
    W.request_recompute(a.id)
    assert_equal 1, queue.size, 'once it has run, the next request queues again'
  end

  # The id leaves the pending set before the read: a commit that lands while
  # the recompute is reading asks again and is not lost.
  def test_a_request_during_the_read_queues_another
    c = make_char('Midread')
    W.join(c.id)
    drain
    asked = false
    original = @originals[:recompute]
    W.define_singleton_method(:recompute) do |cid|
      unless asked
        asked = true
        W.request_recompute(cid)
      end
      original.call(cid)
    end
    W.request_recompute(c.id)
    queue.pop.call
    assert_equal 1, queue.size, 'the request made during the read was kept'
  end

  def test_a_recompute_reads_what_was_committed_before_it_ran
    c = make_char('Lastword')
    W.join(c.id)
    drain
    [120, 340, 560].each do |g|
      c.update_columns(gold: g)
      W.request_recompute(c.id)
    end
    drain
    assert_equal 560, me(c.id).gold
  end

  # recompute-preloads-unused-inventory: the job row and the equipped pieces,
  # no bag and no job list
  def test_a_recompute_loads_no_bag
    c = make_char('Nobag')
    W.join(c.id)
    drain
    sql = []
    main = Thread.current
    sub = ActiveSupport::Notifications.subscribe('sql.active_record') do |*, p|
      sql << p[:sql] if Thread.current == main && p[:name] != 'SCHEMA'
    end
    W.recompute(c.id)
    ActiveSupport::Notifications.unsubscribe(sub)
    preload = sql.grep(/"character_id" (IN|= \$1)/).grep(/\ASELECT "(inventory_items|character_jobs)"\.\*/)
                 .reject { |q| q.include?('equipped_slot') || q.include?('"job" =') }
    assert_empty preload, preload.join("\n")
    assert_operator sql.size, :<=, 3
  end

  # ---------- the zone hears only of a change it can see ----------

  def updates = @broadcasts.select { |_, p| p[:t] == 'player_update' }

  def test_a_gold_change_or_a_step_tells_only_the_player
    c = make_char('Quietpurse')
    W.join(c.id)
    drain
    @broadcasts.clear
    zone, ps = W.find_player(c.id)
    zone.instance_variable_get(:@self_dirty).clear
    c.update_columns(gold: c.gold + 75)
    ps.x += 3.0
    ps.anim = 'run'
    W.recompute(c.id)
    assert_empty updates, 'gold, a step and a stride are nothing the zone is shown by recompute'
    assert_equal c.gold, ps.gold
    assert_same ps, zone.instance_variable_get(:@self_dirty)[c.id], 'the player still hears of their purse'
  end

  def test_a_change_the_zone_can_see_is_broadcast
    c = make_char('Newcoat')
    W.join(c.id)
    drain
    @broadcasts.clear
    _, ps = W.find_player(c.id)
    c.inventory_items.where(equipped_slot: 'body').update_all(equipped_slot: nil)
    W.recompute(c.id)
    assert_equal 1, updates.size
    assert_equal ps.public_payload, updates.last.last[:player]
    refute updates.last.last[:player][:look].key?('b'), 'the body piece came off'
  end

  # ---------- the REST side ----------

  def api_for(char)
    api = ActionDispatch::Integration::Session.new(Rails.application)
    api.host! 'localhost'
    api.post '/api/login', params: { email: @user.email, password: 'isolated-test-password' }, as: :json
    api.post "/api/characters/#{char.id}/select", as: :json
    assert_equal 200, api.response.status, api.response.body
    api
  end

  def call(api, verb, path, params = {})
    api.send(verb, path, params: params, as: :json)
    [api.response.status, (JSON.parse(api.response.body) rescue {})]
  end

  def test_many_equips_queue_one_recompute
    c = make_char('Flicker')
    api = api_for(c)
    W.join(c.id)
    drain
    weapon = c.inventory_items.find_by(equipped_slot: 'weapon')
    6.times do
      assert_equal 200, call(api, :post, '/api/game/unequip', { slot: 'weapon' }).first
      assert_equal 200, call(api, :post, '/api/game/equip', { inventory_item_id: weapon.id }).first
    end
    assert_equal 1, queue.size, '12 bag changes, one recompute waiting'
    calls = counting_recomputes
    drain
    assert_equal({ c.id => 1 }, calls)
    assert_equal 'weapon', weapon.reload.equipped_slot
  end

  def test_an_unequip_that_changes_nothing_asks_nothing
    c = make_char('Emptyhand')
    api = api_for(c)
    status, body = call(api, :post, '/api/game/unequip', { slot: 'ring' })
    assert_equal [200, true], [status, body['ok']]
    assert_equal c.inventory_items.count, body['inventory'].size, 'the reply still carries the bags'
    assert queue.empty?, 'an empty ring slot queued a recompute'
  end

  def test_an_unequip_of_no_slot_is_refused_and_writes_nothing
    c = make_char('Noslot')
    api = api_for(c)
    stamps = c.inventory_items.order(:id).pluck(:id, :updated_at, :equipped_slot)
    [{}, { slot: '' }, { slot: 'tail' }, { slot: nil }].each do |params|
      status, body = call(api, :post, '/api/game/unequip', params)
      assert_equal 422, status, params.inspect
      assert_equal 'No such slot.', body['error']
    end
    assert queue.empty?
    assert_equal stamps, c.inventory_items.order(:id).pluck(:id, :updated_at, :equipped_slot)
  end

  # Only the read folds: the word to refresh the bags goes every time, after it.
  def test_a_collect_with_a_recompute_waiting_still_refreshes_the_bags
    c = make_char('Postbox')
    W.join(c.id)
    drain
    W.request_recompute(c.id)
    letter = MailLetter.create!(recipient_id: c.id, kind: MailLetter::SYSTEM, sender_name: 'The Post', subject: 'Gold', gold: 40)
    Vanai::Mail.collect!(c.id, letter.id)
    assert_equal 2, queue.size, 'the waiting recompute, and the refresh behind it'
    calls = counting_recomputes
    @messages.clear
    drain
    assert_equal({ c.id => 1 }, calls)
    assert_equal 1, @messages.count { |id, p| id == c.id && p[:t] == 'inventory_dirty' }
    assert_equal c.reload.gold, me(c.id).gold
  end

  def test_a_buy_with_a_recompute_waiting_still_tells_the_seller
    # the house's tax is paid to Caerdun's court; a join earlier in this
    # process may have marked rows ensured that its rollback took away
    Vanai::Courts.instance_variable_set(:@courts_ensured, false)
    Vanai::Courts.ensure_courts!
    seller = make_char('Sellsome'); buyer = make_char('Buysome')
    [seller, buyer].each { |ch| W.join(ch.id) }
    broker = Vanai::Data.zones['caerdun']['npcs'].find { |n| n['kind'] == 'auction' }
    _, ps = W.find_player(buyer.id)
    ps.x = broker['x'] + 1.5
    ps.z = broker['z']
    drain
    listing = AuctionListing.create!(seller: seller, item_key: 'potion', qty: 1, price: 10, status: AuctionListing::ACTIVE)
    buyer.update_columns(gold: 1_000)
    total = Vanai::Courts.quote('caerdun', 10)[:total]
    W.request_recompute(buyer.id)
    status, body = call(api_for(buyer), :post, '/api/auction/buy', { listing_id: listing.id, expected_total: total })
    assert_equal 200, status, body.inspect
    assert_equal 2, queue.size, "the buyer's waiting recompute, and the seller's notice"
    @messages.clear
    drain
    assert @messages.any? { |id, p| id == seller.id && p[:msg].to_s.start_with?('Auction: your') }, 'the seller heard'
    assert_equal 1_000 - total, me(buyer.id).gold
  end

  # ---------- pacing the mutations ----------

  def with_counting_store
    store = Api::GameController.cache_store
    counter = ActiveSupport::Cache::MemoryStore.new
    store.define_singleton_method(:increment) { |*args, **opts| counter.increment(*args, **opts) }
    yield
  ensure
    store.singleton_class.remove_method(:increment) if store.singleton_class.method_defined?(:increment, false)
  end

  def test_the_mutating_endpoints_are_paced_per_character
    c = make_char('Hammerer')
    other = make_char('Patient')
    api = api_for(c)
    with_counting_store do
      [['/api/game/unequip', { slot: 'ring' }, Api::GameController::ACTIONS],
       ['/api/craft', { recipe_id: 'no_such_recipe' }, Api::CraftController::CRAFTS],
       ['/api/mail/0/collect', {}, Api::MailController::COLLECTS]].each do |path, params, limit|
        limit.times { refute_equal 429, call(api, :post, path, params).first, path }
        status, body = call(api, :post, path, params)
        assert_equal 429, status, path
        assert_match(/Too many attempts/, body['error'])
      end
      # another character on the same account has its own count
      assert_equal 200, call(api_for(other), :post, '/api/game/unequip', { slot: 'ring' }).first
    end
  end

  def test_the_auction_trades_are_paced_per_character
    c = make_char('Haggler')
    W.join(c.id)
    broker = Vanai::Data.zones['caerdun']['npcs'].find { |n| n['kind'] == 'auction' }
    _, ps = W.find_player(c.id)
    ps.x = broker['x'] + 1.5
    ps.z = broker['z']
    api = api_for(c)
    with_counting_store do
      Api::AuctionController::TRADES.times { assert_equal 404, call(api, :post, '/api/auction/cancel', { listing_id: 0 }).first }
      status, body = call(api, :post, '/api/auction/buy', { listing_id: 0, expected_total: 1 })
      assert_equal 429, status, 'list, buy and cancel share the count'
      assert_match(/Too many attempts/, body['error'])
    end
  end
end
