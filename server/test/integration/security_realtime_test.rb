ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'stringio'
require 'action_dispatch/testing/integration'
require 'action_cable/channel/test_case'

# The realtime half's security fixes: the world's tick survives a client that
# sends anything at all; what a rejoin used to reset (vitals, the move budget)
# it keeps; dungeon walls hold on the server; a party, a quest hand-in, a
# crystal fare and a consumable are each judged on the world's own state.
class SecurityRealtimeWorldTest < Minitest::Test
  W = Vanai::World
  M = Vanai::MoveCheck

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@next_party_id, 0)
    W.initialize_ferry
    @messages = []
    @clock = 1000.0
    test = self
    @original_send = W.method(:to_char)
    @original_now = W.method(:move_now)
    W.define_singleton_method(:to_char) { |id, payload = nil, **kw| test.instance_variable_get(:@messages) << [id, payload || kw] }
    W.define_singleton_method(:move_now) { test.instance_variable_get(:@clock) }
    @log = StringIO.new
    @original_logger = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(@log)
    @user = User.create!(email: 'security-realtime@example.invalid', password: 'isolated-test-password')
    @char = make_char('Warden')
    W.join(@char.id)
  end

  def teardown
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    Rails.logger = @original_logger
    W.define_singleton_method(:to_char, @original_send)
    W.define_singleton_method(:move_now, @original_now)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def make_char(name, x: 79, z: -18, zone: 'caerdun')
    c = Character.provision!(user: @user, name: name, job: 'PLD', city: 'caerdun')
    c.update!(x: x, z: z, zone: zone)
    c
  end

  def me(id = @char.id) = W.find_player(id)&.last
  def to(id) = @messages.select { |cid, _| cid == id }.map(&:last)
  def said(id) = to(id).filter_map { |p| p[:msg] }
  def move(x, z, id = @char.id) = W.apply_move(id, x, z, 0.0, 'run')

  # ---------- the tick ----------

  def test_an_action_that_raises_costs_only_itself
    ticked = 0
    zone = W.zone('caerdun')
    zone.define_singleton_method(:tick) { |_t| ticked += 1 }
    ran = []
    W.enqueue { raise 'a malformed payload' }
    W.enqueue { ran << :after }
    W.run_tick
    assert_equal [:after], ran, 'the actions behind it still run'
    assert_equal 1, ticked, 'and the zones still tick'
    assert_match(/action error: RuntimeError: a malformed payload/, @log.string)
  end

  def test_a_zone_that_raises_does_not_stop_the_others
    W.zone('caerdunfields')
    ticked = []
    W.instance_variable_get(:@zones).each_value do |z|
      key = z.key
      z.define_singleton_method(:tick) { |_t| key == 'caerdun' ? raise('broken zone') : ticked << key }
    end
    W.run_tick
    assert_equal ['caerdunfields'], ticked
  end

  def test_only_what_was_queued_before_the_tick_runs_in_it
    ran = []
    W.enqueue { ran << 1; W.enqueue { ran << 2 } }
    W.run_tick
    assert_equal [1], ran, 'a flood arriving mid-drain waits for the next tick'
    W.run_tick
    assert_equal [1, 2], ran
  end

  def test_the_world_methods_take_any_type_the_cable_could_send
    assert_nil W.find_player_by_name(nil)
    W.party_invite(@char.id, nil)
    W.party_invite(@char.id, 5)
    W.trade_invite(@char.id, { 'x' => 1 })
    W.examine(@char.id, [1])
    W.who_list(@char.id, nil, {})
    W.who_list(@char.id, nil, Float::INFINITY)
    assert_equal 1, to(@char.id).reverse.find { |p| p[:t] == 'who_list' }[:page]
    move({}, -18)
    assert_equal [79, -18], [me.x, me.z]
    W.apply_move(@char.id, 80, -18, Float::INFINITY, 'run')
    assert_equal 0.0, me.heading, 'no Infinity stored or sent'
    Vanai::Courts::News.seen!(@char.id, news_id: [1], digest_cycle: { 'a' => 1 })
    Vanai::Courts::Letters.accept!(@char.id, true)
    Vanai::Courts::Letters.decline!(@char.id, [1])
    Vanai::Courts::Bounties.accept!(@char.id, {})
    Vanai::Courts::Bounties.deliver!(@char.id, [2])
    Vanai::Courts::Relics.register!(@char.id, { 'named_relic_id' => [1], 'qty' => {} })
    other = make_char('Trader')
    W.join(other.id)
    W.instance_variable_get(:@trades)[1] = { a: @char.id, b: other.id,
                                              offers: { @char.id => { gold: 0, items: [] }, other.id => { gold: 0, items: [] } },
                                              confirmed: { @char.id => false, other.id => false } }
    W.trade_offer(@char.id, { 'g' => 1 }, [5, 'x', nil, { 'inv_id' => [1], 'qty' => {} }])
    offer = W.instance_variable_get(:@trades)[1][:offers][@char.id]
    assert_equal 0, offer[:gold]
  end

  # ---------- a rejoin keeps what the world knows ----------

  def test_a_second_subscription_restores_nothing
    me.hp = 5
    me.mp = 1
    me.tp = 150
    me.cooldowns['sentinel'] = Vanai.now + 90
    me.buffs = [{ name: 'Poison', kind: 'poison', power: 3, ends_at: Vanai.now + 30, duration: 30 }]
    W.join(@char.id, session_id: 'another tab')
    assert_equal 5, me.hp
    assert_equal 1, me.mp
    assert_equal 150, me.tp
    assert me.cooldowns['sentinel'] > Vanai.now
    assert_equal ['poison'], me.buffs.map { |b| b[:kind] }
  end

  def test_the_dead_stay_dead_across_a_reconnect_until_they_release
    me.dead = true
    me.hp = 0
    me.xp_lost = 40
    W.leave(@char.id) # the line drops
    W.join(@char.id)
    assert me.dead, 'no standing up where they fell'
    assert_equal 0, me.hp
    assert to(@char.id).any? { |p| p[:t] == 'death' && p[:xp_lost] == 40 }, 'the Release button comes back with it'
    W.release(@char.id)
    W.join(@char.id)
    refute me.dead
    assert_equal me.max_hp, me.hp, 'the home point revives them whole'
  end

  def test_a_crossing_keeps_hp_and_starts_a_fresh_budget
    move(79 + M::CAP, -18) # the budget spent
    me.hp = 7
    portal = Vanai::Data.zones['caerdun']['portals'].find { |p| p['id'] == 'cd_fields' }
    W.travel(@char.id, portal)
    W.join(@char.id)
    assert_equal 7, me.hp
    move(portal['tx'] + M::CAP, portal['tz'])
    assert_in_delta portal['tx'] + M::CAP, me.x, 1e-6, 'placed by the server: a full budget'
  end

  def test_a_rejoin_where_they_stand_does_not_refill_the_budget
    move(79 + M::CAP, -18)
    W.join(@char.id, session_id: 'resubscribed')
    assert_in_delta 79 + M::CAP, me.x, 1e-6, 'the position read is the one just saved'
    move(79 + 2 * M::CAP, -18)
    assert_in_delta 79 + M::CAP, me.x, 1e-6, 'nothing left to spend: the clock has not moved'
  end

  def test_replaying_a_scene_does_not_refill_the_budget
    id, scene = Vanai::Data.cutscenes.find { |_, s| s['zone'] == '*' && !s['mark'] }
    assert id, 'a scene that plays anywhere, with no mark'
    me.cutscenes_seen << id
    move(79 + M::CAP, -18)
    W.cutscene_begin(@char.id, id)
    assert_equal id, me.cutscene, Array(said(@char.id)).last
    W.cutscene_end(@char.id, id)
    move(79 + 2 * M::CAP, -18)
    assert_in_delta 79 + M::CAP, me.x, 1e-6
    assert scene
  end

  def test_a_stale_subscription_stops_hearing_its_zone
    W.join(@char.id, session_id: 'first')
    assert W.current_session?(@char.id, 'first', 'caerdun')
    W.join(@char.id, session_id: 'second')
    refute W.current_session?(@char.id, 'first', 'caerdun'), 'replaced'
    portal = Vanai::Data.zones['caerdun']['portals'].find { |p| p['id'] == 'cd_fields' }
    W.travel(@char.id, portal)
    refute W.current_session?(@char.id, 'second', 'caerdun'), 'moved on'
  end

  # ---------- dungeon walls ----------

  # Two spots an honest player can stand on, a wall between them, within one
  # budget's reach, and no short way round.
  def wall_pair(key)
    layout = Vanai::Data.zones[key]['layout']
    nav = Vanai::DungeonNavigation.new(layout)
    zs = W.zone(key)
    cell = layout['cell']
    floor = layout['rooms'].flat_map { |r| (r['x']...r['x'] + r['w']).to_a.product((r['z']...r['z'] + r['d']).to_a) }
    floor.each do |cx, cz|
      [[1, 0], [0, 1]].product([2, 3, 4]).each do |(dx, dz), k|
        a = [cx * cell, cz * cell]
        b = [(cx + k * dx) * cell, (cz + k * dz) * cell]
        next if Math.hypot(b[0] - a[0], b[1] - a[1]) > M::CAP
        next if !nav.clear?(*a, 1.3) || !nav.clear?(*b, 1.3) || nav.line?(*a, *b, 0.2)
        return [a, b] unless zs.floor_route?(*a, *b)
      end
    end
    nil
  end

  def test_a_dungeon_wall_holds_on_the_server
    a, b = wall_pair('mausoleum')
    assert a, 'the Mausoleum has a wall with rooms either side'
    W.leave(@char.id, transferring: true)
    @char.update!(zone: 'mausoleum', x: a[0], z: a[1])
    W.join(@char.id)
    move(*b)
    assert_equal a, [me.x, me.z], 'through the masonry: refused'
    # an honest step within the room is taken as sent
    step = [a[0] + 0.5, a[1] + 0.5]
    move(*step)
    assert_equal step, [me.x, me.z]
  end

  def test_every_placement_in_a_dungeon_is_on_its_floor
    Vanai::Data.zones.each do |key, d|
      next unless d['kind'] == 'dungeon' && d['layout']
      nav = Vanai::DungeonNavigation.new(d['layout'])
      spots = (d['portals'] || []).map { |p| [p['id'], p['x'], p['z']] } +
              Vanai::Data.zones.flat_map { |ok, od| (od['portals'] || []).select { |p| p['to'] == key && p['tx'] }.map { |p| ["#{ok}/#{p['id']}", p['tx'], p['tz']] } }
      spots.each { |name, x, z| assert nav.clear?(x.to_f, z.to_f, Vanai::ZoneState::STEP_MARGIN), "#{key}: #{name} lands off the floor" }
    end
  end

  # ---------- parties ----------

  def test_one_party_at_a_time
    t = make_char('Tamsin')
    y = make_char('Yorrick')
    [t, y].each { |c| W.join(c.id) }
    W.party_invite(@char.id, 'Tamsin') # A invites T...
    W.party_invite(t.id, 'Yorrick')    # ...T forms their own party
    W.party_respond(y.id, true)
    led = me(t.id).party_id
    assert led
    W.party_respond(t.id, true) # then answers A's old invitation
    assert_equal led, me(t.id).party_id
    assert_nil me.party_id
    assert_includes said(t.id), 'You are already in a party.'
    assert_equal 1, W.parties.values.count { |pt| pt.member_ids.include?(t.id) }
  end

  def test_an_old_invitation_lapses
    t = make_char('Tamsin')
    W.join(t.id)
    W.party_invite(@char.id, 'Tamsin')
    W.instance_variable_get(:@pending_invites)[t.id][1] -= W.singleton_class::PARTY_INVITE_TTL + 1
    W.party_respond(t.id, true)
    assert_nil me(t.id).party_id
  end

  # ---------- a collect hand-in ----------

  def test_a_worn_ring_does_not_count_toward_a_collect_quest
    InventoryItem.create!(character_id: @char.id, item_key: 'glimmer_band', qty: 1, equipped_slot: 'ring')
    refute Vanai::Quests.objective_met?(me, 's_caer_4')
    assert_equal 0, W.consume_items(me, ['glimmer_band'], 1)
    assert InventoryItem.exists?(character_id: @char.id, item_key: 'glimmer_band'), 'the worn ring stays on'
    InventoryItem.create!(character_id: @char.id, item_key: 'glimmer_band', qty: 1)
    assert Vanai::Quests.objective_met?(me, 's_caer_4')
    assert_equal 1, W.consume_items(me, ['glimmer_band'], 1)
    assert_equal 1, InventoryItem.where(character_id: @char.id, item_key: 'glimmer_band').count
  end

  # ---------- the crystal fare ----------

  def test_the_fare_is_charged_against_the_row
    here = Vanai::Data.zones['caerdun']['milestones'].first
    dest_zone, dest = Vanai::Data.zones.find { |k, d| k != 'caerdun' && d['milestones']&.any? }.then { |k, d| [k, d['milestones'].first] }
    me.lit_milestones << here['id'] << dest['id']
    me.x, me.z = here['x'] + 1, here['z']
    me.gold = 10_000 # the copy says rich; a REST purchase spent the row
    Character.where(id: @char.id).update_all(gold: 0)
    W.milestone_travel(@char.id, dest['id'])
    assert_equal 'caerdun', W.find_player(@char.id).first.key, "no passage on credit (to #{dest_zone})"
    assert_equal 0, Character.find(@char.id).gold
    assert said(@char.id).any? { |m| m.start_with?('Not enough gold for the fare.') }
  end

  # ---------- consumables ----------

  def test_a_consumable_is_paced_and_taken_once
    row = InventoryItem.create!(character_id: @char.id, item_key: 'potion', qty: 5)
    me.hp = 1
    z, = W.find_player(@char.id)
    5.times { W.use_item(@char.id, row.id) } # one tick's burst
    assert_equal 4, row.reload.qty, 'one drunk, the rest refused'
    assert_includes said(@char.id), 'Not yet.'
    me.cooldowns[Vanai::Combat::ITEM_CD_KEY] = Vanai.now - 0.01
    W.use_item(@char.id, row.id)
    assert_equal 3, row.reload.qty
    me.cooldowns.clear
    me.dead = true
    W.use_item(@char.id, row.id)
    assert_equal 3, row.reload.qty, 'nothing works on the dead'
    me.dead = false
    me.casting = { ability: 'x', ends_at: Vanai.now + 2 }
    W.use_item(@char.id, row.id)
    assert_equal 3, row.reload.qty, 'nor mid-cast'
    assert z
  end

  def test_the_last_one_leaves_the_bags
    row = InventoryItem.create!(character_id: @char.id, item_key: 'ether', qty: 1)
    W.use_item(@char.id, row.id)
    refute InventoryItem.exists?(row.id)
  end

  def test_grant_item_merges_into_the_stack
    row = InventoryItem.create!(character_id: @char.id, item_key: 'mere_reed', qty: 2)
    W.grant_item(me, 'mere_reed', 3)
    assert_equal 5, row.reload.qty
  end

  # ---------- presence for REST threads ----------

  def test_presence_is_read_from_a_copy
    assert_equal true, W.presence_of('warden')[:online]
    assert_equal({ online: false }, W.presence_of('Nobody'))
    assert_equal({ online: false }, W.presence_of(nil))
    assert_includes W.presence_map.keys, 'warden'
  end
end

# The cable's edge: every payload coerced before the world thread sees it, a
# budget per subscription, and one zone subscription per connection.
class SecurityRealtimeChannelTest < ActionCable::Channel::TestCase
  tests ZoneChannel
  W = Vanai::World

  def setup
    super
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    W.instance_variable_set(:@queue, Queue.new)
    ZoneChannel::BUCKET_LOCK.synchronize { ZoneChannel::BUCKETS_BY_CHAR.clear }
    @user = User.create!(email: 'security-cable@example.invalid', password: 'isolated-test-password')
    @char = Character.provision!(user: @user, name: 'Cabler', job: 'PLD', city: 'caerdun')
    stub_connection current_user_id: @user.id, current_character_id: @char.id
  end

  def teardown
    ActiveRecord::Base.connection.rollback_transaction
    super
  end

  def queued = W.instance_variable_get(:@queue).size

  # Runs what the channel queued with one world method stood in for, and
  # returns the arguments it was called with.
  def drain_into(name)
    calls = []
    original = W.method(name)
    W.define_singleton_method(name) { |*args, **kw| calls << (kw.empty? ? args : args + [kw]) }
    q = W.instance_variable_get(:@queue)
    q.pop.call until q.empty?
    calls
  ensure
    W.define_singleton_method(name, original)
  end

  def test_subscribing_streams_the_zone_and_joins
    subscribe
    assert subscription.confirmed?
    assert_has_stream 'zone:caerdun'
    assert_has_stream "char:#{@char.id}"
    assert_equal 1, queued
  end

  def test_a_second_zone_subscription_on_one_connection_is_refused
    subscribe
    second = ZoneChannel.new(connection, { channel: 'ZoneChannel', n: 2 }.to_json, { 'channel' => 'ZoneChannel', 'n' => 2 })
    second.subscribe_to_channel
    assert second.send(:subscription_rejected?), 'another identifier: a second join, refused'
    unsubscribe
    subscribe
    assert subscription.confirmed?, 'the client resubscribing on a zone change is let in'
  end

  def test_payloads_are_coerced_at_the_edge
    subscribe
    drain_into(:join)
    perform :move, x: { 'a' => 1 }, z: 1
    perform :move, x: 1e400, z: 1
    assert_equal 0, queued, 'no position, no move'
    perform :move, x: '1.5', z: 2, h: [1], anim: { 'a' => 1 }
    assert_equal [[@char.id, 1.5, 2.0, 0.0, '{"a" => 1}'[0, 12]]], drain_into(:apply_move)
    perform :who_list, q: { 'x' => 1 }, page: { 'p' => 1 }
    assert_equal [[@char.id, '{"x" => 1}', 1]], drain_into(:who_list)
    perform :party_invite, name: nil
    assert_equal [[@char.id, '']], drain_into(:party_invite)
    perform :trade_offer, gold: [1], items: [5, { 'inv_id' => '7', 'qty' => [2] }, 'x']
    assert_equal [[@char.id, 0, [{ 'inv_id' => 7, 'qty' => nil }]]], drain_into(:trade_offer)
    perform :use_item, inv_id: { 'id' => 1 }
    assert_equal 0, queued
    perform :ability, id: 'cure', target: nil
    assert_equal [[@char.id, 'cure', nil]], drain_into(:ability)
  end

  def test_court_actions_reach_the_world_as_integers
    subscribe
    drain_into(:join)
    calls = []
    original = Vanai::Courts::News.method(:seen!)
    Vanai::Courts::News.define_singleton_method(:seen!) { |cid, **kw| calls << [cid, kw] }
    perform :court_seen, news_id: [1], digest_cycle: true
    q = W.instance_variable_get(:@queue)
    q.pop.call until q.empty?
    assert_equal [[@char.id, { news_id: nil, digest_cycle: nil }]], calls
  ensure
    Vanai::Courts::News.define_singleton_method(:seen!, original) if original
  end

  def test_a_flood_is_cut_to_the_budget
    subscribe
    drain_into(:join)
    50.times { perform :chat, channel: 'say', msg: 'x' }
    assert_equal ZoneChannel::BUCKETS[:talk][1].to_i, queued, 'the burst, and no more'
    drain_into(:chat)
    # moves have their own, larger budget: an honest stall's worth goes through
    30.times { |i| perform :move, x: i * 0.8, z: 0 }
    assert_equal 30, queued
  end

  def test_a_second_socket_brings_no_second_budget
    subscribe
    drain_into(:join)
    10.times { perform :chat, channel: 'say', msg: 'x' }
    drain_into(:chat)
    # the same character on another connection draws on the same bucket
    stub_connection current_user_id: @user.id, current_character_id: @char.id
    subscribe
    drain_into(:join)
    5.times { perform :chat, channel: 'say', msg: 'x' }
    assert_operator queued, :<=, 1, 'only what refilled in the meantime'
  end

  def test_the_lifecycle_is_not_an_action
    subscribe
    drain_into(:join)
    streams = subscription.send(:streams).size
    %w[subscribed unsubscribed perform_action].each do |name|
      refute_includes ZoneChannel.action_methods, name
      perform name.to_sym
    end
    assert_equal 0, queued, 'no second join, no leave'
    assert_equal streams, subscription.send(:streams).size, 'no second pair of streams'
    assert_includes ZoneChannel.action_methods, 'move'
  end

  def test_garbage_that_is_not_an_object_is_ignored
    subscribe
    drain_into(:join)
    subscription.perform_action([1, 2])
    assert_equal 0, queued
  end
end

# The friends list: signed in with a character, and capped.
class SecurityRealtimeFriendsTest < Minitest::Test
  PASSWORD = 'isolated-test-password'

  def setup
    raise 'Test database only' unless Rails.env.test?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @api = ActionDispatch::Integration::Session.new(Rails.application)
    @api.host! 'localhost'
  end

  def teardown
    ActiveRecord::Base.connection.rollback_transaction
  end

  def test_no_character_is_a_401_not_a_500
    @api.get '/api/friends'
    assert_equal 401, @api.response.status
    @api.post '/api/friends', params: { name: 'Anyone' }, as: :json
    assert_equal 401, @api.response.status
  end

  def test_the_list_holds_a_hundred
    user = User.create!(email: 'security-friends@example.invalid', password: PASSWORD)
    char = Character.provision!(user: user, name: 'Befriender', job: 'PLD', city: 'caerdun')
    @api.post '/api/login', params: { email: user.email, password: PASSWORD }, as: :json
    assert_equal 200, @api.response.status
    @api.post "/api/characters/#{char.id}/select", as: :json
    assert_equal 200, @api.response.status
    Api::FriendsController::MAX_FRIENDS.times { |i| Friendship.create!(character_id: char.id, friend_name: "Pal#{i}") }
    other = Character.provision!(user: user, name: 'Latecomer', job: 'PLD', city: 'caerdun')
    @api.post '/api/friends', params: { name: other.name }, as: :json
    assert_equal 422, @api.response.status
    assert_match(/full/, JSON.parse(@api.response.body)['error'])
    @api.get '/api/friends'
    assert_equal 200, @api.response.status
    assert_equal Api::FriendsController::MAX_FRIENDS, JSON.parse(@api.response.body)['friends'].size
  end
end
