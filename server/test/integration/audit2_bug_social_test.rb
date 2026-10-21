ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'stringio'
require 'ostruct'
require 'action_dispatch/testing/integration'

# Audit round two, bug-social: each test fails on the code as found and should
# pass once its finding is fixed. The world harness is security_realtime_test.rb's.
class Audit2BugSocialWorldTest < Minitest::Test
  W = Vanai::World

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
    @log = StringIO.new
    @original_logger = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(@log)
    @user = User.create!(email: 'audit2-bug-social@example.invalid', password: 'isolated-test-password')
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

  def to(id) = @messages.select { |cid, _| cid == id }.map(&:last)
  def said(id) = to(id).filter_map { |p| p[:msg] }
  def parties = W.instance_variable_get(:@parties)
  def trades = W.instance_variable_get(:@trades)

  def partied(leader, member)
    W.party_invite(leader.id, member.name)
    W.party_respond(member.id, true)
    party = parties.values.first
    assert party, 'the party formed'
    party
  end

  PORTAL = { 'to' => 'caerdunfields', 'tx' => -300, 'tz' => -30 }.freeze

  # A crossing keeps the seat but never starts the grace: a member who never
  # arrives (the tab closed on the loading screen) holds it, and the lead,
  # until the server restarts.
  def test_bug_social_transit_party_seat_forever
    a = make_char('Leada'); b = make_char('Membb'); c = make_char('Thirdc')
    W.join(a.id, session_id: 'sa'); W.join(b.id, session_id: 'sb'); W.join(c.id, session_id: 'sc')
    party = partied(a, b)
    assert_equal a.id, party.leader_id
    W.travel(a.id, PORTAL)                 # the crossing: leave(transferring: true)
    W.leave(a.id, session_id: 'sa')        # the old channel's unsubscribe, which is all that follows
    W.reap_party_grace(Vanai.now + W::PARTY_GRACE + 3600) # an hour past any grace
    refute_includes party.member_ids, a.id, 'a member who never arrived still holds the seat'
    @messages.clear
    W.party_invite(b.id, c.name)
    refute_includes said(b.id), 'Only the leader may invite.', 'the lead never passed to the member still here'
  end

  # A party that disbands while a member is crossing leaves that member's
  # frame showing it: join sends nothing when there is no party to restore.
  def test_bug_social_stale_party_frame_after_crossing
    a = make_char('Stayer'); b = make_char('Crosser')
    W.join(a.id, session_id: 'sa'); W.join(b.id, session_id: 'sb')
    partied(a, b)
    W.travel(b.id, PORTAL)
    W.party_leave(a.id)                    # two members: the party disbands
    assert_empty parties
    @messages.clear                        # what was sent to b in transit reached no subscription
    W.join(b.id, session_id: 'sb2')        # b's new zone subscription
    party_msgs = to(b.id).select { |p| p[:t] == 'party' }
    refute_empty party_msgs, 'the arriving member is never told the party is gone'
    assert_equal [], party_msgs.last[:members]
  end

  # trade_respond opens a second trade for a player already in one.
  def test_bug_social_trade_respond_double_trade
    a = make_char('Tradera'); b = make_char('Traderb', x: 80); c = make_char('Traderc', x: 81)
    [a, b, c].each { |ch| W.join(ch.id) }
    W.trade_invite(a.id, b.name)
    W.trade_invite(a.id, c.name)           # allowed: a is not trading yet
    W.trade_respond(b.id, true)
    W.trade_respond(c.id, true)            # accepted although a is now trading with b
    in_a = trades.values.count { |t| t[:a] == a.id || t[:b] == a.id }
    assert_operator in_a, :<=, 1, "a is in #{in_a} trades at once"
  end

  # The kill's gold is split with ceil: six members are paid more than it dropped.
  def test_bug_social_loot_gold_share_ceil
    chars = 6.times.map { |i| make_char("Looter#{%w[a b c d e f][i]}", x: 79 + i) }
    chars.each { |ch| W.join(ch.id) }
    zone = W.zone('caerdun')
    members = chars.map { |ch| W.find_player(ch.id).last }
    before = members.sum(&:gold)
    m = OpenStruct.new(definition: { 'gold' => [2, 2], 'drops' => [] })
    relics = Vanai::Courts::Relics
    on_kill = relics.method(:on_kill)
    relics.define_singleton_method(:on_kill) { |*| }
    begin
      Vanai::Combat.award_loot(zone, m, members)
    ensure
      relics.define_singleton_method(:on_kill, on_kill)
    end
    paid = members.sum(&:gold) - before
    assert_equal 2, paid, "a drop of 2 gold paid #{paid} to a party of 6"
  end
end

# The craft response's inventory loses every row's named_relic.
class Audit2BugSocialCraftTest < Minitest::Test
  W = Vanai::World

  def setup
    raise 'Test database only' unless Rails.env.test?
    @previous = %i[queue online].to_h { |k| [k, W.instance_variable_get("@#{k}")] }
    @to_char = W.method(:to_char)
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@online, {})
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    W.define_singleton_method(:to_char) { |*| }
    @api = ActionDispatch::Integration::Session.new(Rails.application)
    @api.host! 'localhost'
    @api.post '/api/register', params: { email: 'audit2-craft@example.invalid', password: 'isolated-test-password' }, as: :json
    @api.post '/api/characters', params: { name: 'Crafter', race: 'aedri', job: 'PLD', city: 'caerdun' }, as: :json
    @char = Character.find(JSON.parse(@api.response.body).dig('character', 'id'))
    @api.post "/api/characters/#{@char.id}/select", as: :json
  end

  def teardown
    W.define_singleton_method(:to_char, @to_char)
    @previous.each { |k, v| W.instance_variable_set("@#{k}", v) }
    ActiveRecord::Base.connection.rollback_transaction
  end

  def test_bug_social_craft_inventory_drops_relic_info
    relic = NamedRelic.create!(cycle: 1, zone: 'glassworks', slot: 1, kind: 'documents', name: 'A Tally',
                               finder_id: @char.id, finder_name: @char.name, found_at: Time.current - 60)
    row = InventoryItem.create!(character_id: @char.id, item_key: 'named_relic', qty: 1, named_relic_id: relic.id)
    @char.inventory_items.create!(item_key: 'sprite_dust', qty: 2)
    @api.post '/api/craft', params: { recipe_id: 'al_ether' }, as: :json
    assert_equal 200, @api.response.status, @api.response.body
    inv = JSON.parse(@api.response.body)['inventory']
    relic_row = inv.find { |r| r['id'] == row.id }
    assert relic_row, 'the relic is in the returned bags'
    assert relic_row['named_relic'], "the craft's inventory row drops named_relic: #{relic_row.inspect}"
  end
end
