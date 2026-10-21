ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'stringio'
require 'action_dispatch/testing/integration'

# Audit round two, bug-systems: each test fails on the code as found and should
# pass once its finding is fixed. The world harness is security_realtime_test.rb's
# and ferry_test.rb's.
class Audit2BugSystemsTest < Minitest::Test
  W = Vanai::World
  F = Vanai::Ferry

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades trade_invites].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@next_party_id, 0)
    @messages = []
    test = self
    @original_send = W.method(:to_char)
    W.define_singleton_method(:to_char) { |id, payload = nil, **kw| test.instance_variable_get(:@messages) << [id, payload || kw] }
    @original_clock = W.method(:ferry_now)
    @time = 500.0
    W.define_singleton_method(:ferry_now) { test.instance_variable_get(:@time) }
    @log = StringIO.new
    @original_logger = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(@log)
    W.initialize_ferry
    @user = User.create!(email: 'audit2-bug-systems@example.invalid', password: 'isolated-test-password')
  end

  def teardown
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    Rails.logger = @original_logger
    W.define_singleton_method(:to_char, @original_send)
    W.define_singleton_method(:ferry_now, @original_clock)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def make_char(name, x: 79, z: -18, zone: 'caerdun', user: @user)
    c = Character.provision!(user: user, name: name, job: 'PLD', city: 'caerdun')
    c.update!(x: x, z: z, zone: zone)
    c
  end

  def to(id) = @messages.select { |cid, _| cid == id }.map(&:last)
  def said(id) = to(id).filter_map { |p| p[:msg] }
  def me(c) = W.find_player(c.id)&.last

  # ---------- the ferry ----------

  def passenger(name, gold: 50, user: @user)
    npc = Vanai::Data.zones['moonmereshores']['npcs'].find { |n| n['id'] == F.port('moonmereshores')['npc'] }
    c = make_char(name, x: npc['x'] + 1, z: npc['z'], zone: 'moonmereshores', user: user)
    c.update!(gold: gold)
    W.join(c.id)
    c
  end

  # what run_tick does with the ferry
  def ferry_tick(t)
    @time = t
    W.guarded('ferry') { W.tick_ferry(t) }
  end

  def sail_two(a, b)
    @time = 420
    [a, b].each { |c| W.ferry_register(c.id, 600) }
    ferry_tick(600)
    assert_equal 'gulf_to_caerdun', a.reload.zone
    assert_equal 'gulf_to_caerdun', b.reload.zone
  end

  # bug-systems-ferry-arrival-batch-wedge: a passenger whose account is deleted
  # at sea holds every arrival, and every later departure, at sea for good.
  def test_bug_systems_ferry_arrival_batch_wedge_deleted_passenger
    other = User.create!(email: 'audit2-bug-systems-gone@example.invalid', password: 'isolated-test-password')
    gone = passenger('Gonepax', user: other)
    stay = passenger('Staypax')
    sail_two(gone, stay)
    other.delete_account!                   # bin/rails 'accounts:delete[...]', another process
    refute Character.exists?(gone.id)
    ferry_tick(1020 + 1)                    # the arrival is due
    ferry_tick(1020 + 2)
    assert_equal 'caerdunfields', stay.reload.zone,
                 "an honest passenger stays at sea (#{stay.zone}) because another's row is gone; " \
                 "log: #{@log.string.lines.grep(/ferry error/).first&.strip}"
  end

  # ...and no boat leaves either: a registration for the next sailing is never boarded.
  def test_bug_systems_ferry_arrival_batch_wedge_blocks_departures
    other = User.create!(email: 'audit2-bug-systems-gone2@example.invalid', password: 'isolated-test-password')
    gone = passenger('Gonepaxx', user: other)
    stay = passenger('Staypaxx')
    sail_two(gone, stay)
    later = passenger('Laterpax')
    other.delete_account!
    @time = 1100                            # docked for the 1200 sailing
    W.ferry_register(later.id, 1200)
    assert W.instance_variable_get(:@ferry_registrations).key?(later.id), 'registered for 1200'
    ferry_tick(1200)
    assert_equal 'gulf_to_caerdun', later.reload.zone, "the 1200 sailing never boards (#{later.zone}, gold #{later.gold})"
  end

  # The same wedge from a row that fails Character's own validations.
  def test_bug_systems_ferry_arrival_batch_wedge_invalid_row
    bad = passenger('Badpax')
    stay = passenger('Okaypax')
    sail_two(bad, stay)
    # a row the current valid_appearance rejects (a key no race offers)
    Character.where(id: bad.id).update_all(appearance: { 'face' => 'male', 'hair' => 'waves', 'scar' => 'left' })
    refute Character.find(bad.id).valid?
    ferry_tick(1020 + 1)
    ferry_tick(1020 + 2)
    assert_equal 'caerdunfields', stay.reload.zone,
                 "an honest passenger stays at sea (#{stay.zone}); log: #{@log.string.lines.grep(/ferry error/).first&.strip}"
  end

  # ---------- parties ----------

  PORTAL = { 'to' => 'caerdunfields', 'tx' => -300, 'tz' => -30 }.freeze

  # bug-systems-party-seat-held-forever-after-crossing
  def test_bug_systems_party_seat_held_forever_after_crossing
    a = make_char('Leadsys'); b = make_char('Membsys'); c = make_char('Thirdsys')
    W.join(a.id, session_id: 'sa'); W.join(b.id, session_id: 'sb'); W.join(c.id, session_id: 'sc')
    W.party_invite(a.id, b.name)
    W.party_respond(b.id, true)
    party = W.instance_variable_get(:@parties).values.first
    assert_equal a.id, party.leader_id
    W.travel(a.id, PORTAL)                 # leave(transferring: true)
    W.leave(a.id, session_id: 'sa')        # the old channel's unsubscribe; no join follows
    W.reap_party_grace(Vanai.now + W::PARTY_GRACE + 3600)
    @messages.clear
    W.party_invite(b.id, c.name)
    refute_includes party.member_ids, a.id, 'a member who never arrived holds the seat an hour later'
    refute_includes said(b.id), 'Only the leader may invite.'
  end

  # ---------- death ----------

  # bug-systems-dead-player-revives-after-vitals-hold
  def test_bug_systems_dead_player_revives_after_vitals_hold
    c = make_char('Fallen', zone: 'caerdunfields', x: 0, z: 0)
    W.join(c.id)
    z, ps = W.find_player(c.id)
    Vanai::Combat.player_death(z, ps)
    assert ps.dead
    W.leave(c.id)
    W.kept_vitals[c.id][:at] -= W.singleton_class::VITALS_HOLD + 1 # ten minutes away
    W.join(c.id)
    p_ = me(c)
    assert p_.dead || p_.zone != 'caerdunfields' || [p_.x, p_.z] != [0.0, 0.0],
           "past VITALS_HOLD a fallen character logs back in alive (hp #{p_.hp}/#{p_.max_hp}) where they fell"
  end

  # The same after a restart, which empties kept_vitals.
  def test_bug_systems_dead_player_revives_after_restart
    c = make_char('Fallentoo', zone: 'caerdunfields', x: 0, z: 0)
    W.join(c.id)
    z, ps = W.find_player(c.id)
    Vanai::Combat.player_death(z, ps)
    W.leave(c.id)
    W.instance_variable_set(:@kept_vitals, {})                       # the world restarted
    W.join(c.id)
    p_ = me(c)
    assert p_.dead || [p_.x, p_.z] != [0.0, 0.0],
           "after a restart a fallen character logs back in alive (hp #{p_.hp}/#{p_.max_hp}) where they fell"
  end

  # ---------- floors ----------

  # bug-systems-floor-lost-on-reconnect: Merle Tarrant on the observatory's
  # floor 5. A player who walked up may talk to her; the same player after a
  # refresh, on the same spot, may not.
  def test_bug_systems_floor_lost_on_reconnect_observatory
    npc = Vanai::Data.zones['moonmere']['npcs'].find { |n| n['id'] == 'mm_resident_merle_tarrant' }
    site = Vanai::Data.zones['moonmere']['sites'][npc['site']]
    c = make_char('Climber', zone: 'moonmere', x: npc['x'] + 1, z: npc['z'])
    W.join(c.id)
    z, ps = W.find_player(c.id)
    ps.site_levels = { npc['site'] => site['floors'][npc['floor']] } # as the stair walk leaves it
    assert_nil W.npc_refusal(z, ps, npc), 'walked up: she answers'
    W.leave(c.id)
    W.join(c.id)                                                      # a refresh, same spot
    z, ps = W.find_player(c.id)
    assert_nil W.npc_refusal(z, ps, npc), 'after a reconnect on her floor the server has the player on the ground'
  end

  # The Mausoleum's exit rune stands on the raised chamber's floor 1.
  def test_bug_systems_floor_lost_on_reconnect_mausoleum_exit
    portal = Vanai::Data.zones['mausoleum']['portals'].find { |p| p['id'] == 'ms_out' }
    site = Vanai::Data.zones['mausoleum']['sites'][portal['site']]
    c = make_char('Delver', zone: 'mausoleum', x: portal['x'], z: portal['z'] - 1)
    W.join(c.id)
    _, ps = W.find_player(c.id)
    ps.site_levels = { portal['site'] => site['floors'][portal['floor']] }
    assert Vanai::SiteLevels.reachable?(Vanai::Data.zones['mausoleum'], ps.site_levels, portal, ps.x, ps.z), 'walked up: the rune is in reach'
    W.leave(c.id)
    W.join(c.id)
    @messages.clear
    W.interact(c.id, 'ms_out')
    refute_includes said(c.id), 'Reach the gate on the same floor.'
  end

  # ---------- trading ----------

  # bug-systems-trade-two-at-once
  def test_bug_systems_trade_two_at_once
    a = make_char('Tradesa'); b = make_char('Tradesb', x: 80); c = make_char('Tradesc', x: 81)
    [a, b, c].each { |ch| W.join(ch.id) }
    W.trade_invite(a.id, b.name)           # B leaves it unanswered
    W.trade_invite(c.id, a.name)           # allowed: A has no trade yet
    W.trade_respond(a.id, true)            # trade A-C
    W.trade_respond(b.id, true)            # B accepts A's old invite: trade A-B as well
    trades = W.instance_variable_get(:@trades).values
    in_a = trades.count { |t| t[:a] == a.id || t[:b] == a.id }
    assert_operator in_a, :<=, 1, "A is in #{in_a} trades at once"
  end
end
