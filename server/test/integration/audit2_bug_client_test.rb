ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'stringio'

# Audit round two, bug-client: the world's halves of the client findings. Each
# test fails on the code as found and should pass once its finding is fixed.
# The world harness is security_realtime_test.rb's.
class Audit2BugClientWorldTest < Minitest::Test
  W = Vanai::World
  C = Vanai::Cutscenes

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
    @user = User.create!(email: 'audit2-bug-client@example.invalid', password: 'isolated-test-password')
  end

  def teardown
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    Rails.logger = @original_logger
    W.define_singleton_method(:to_char, @original_send)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def make_char(name, x: 79, z: -18, zone: 'caerdun', city: 'caerdun')
    c = Character.provision!(user: @user, name: name, job: 'PLD', city: city)
    c.update!(x: x, z: z, zone: zone)
    c
  end

  def to(id) = @messages.select { |cid, _| cid == id }.map(&:last)

  # A dungeon step the world refuses is never answered: the client walked
  # round the bend (or on through a dropped line) and the world holds the old
  # spot, and no message ever tells the client where the world has them.
  # keep: (-48,-36) and (-48,-24) are both floor, joined by floor, 12 m apart,
  # with a wall between and a detour longer than floor_route?'s limit
  # (scratchpad audit2/bc_nav_pairs.rb found the pair).
  def test_bug_client_no_server_position_correction
    a = [-48.0, -36.0]; b = [-48.0, -24.0]
    zone = W.zone('keep')
    assert zone.navigation, 'keep is a dungeon with a floor plan'
    refute zone.walkable_step?(*a, *b), 'the chord crosses a wall'
    c = make_char('Corner', x: a[0], z: a[1], zone: 'keep')
    W.join(c.id, session_id: 's1')
    _, ps = W.find_player(c.id)
    assert_in_delta a[0], ps.x, 0.01
    @messages.clear
    # the client stands at b now, and reports it for ten seconds
    clock = Vanai.now
    original_move_now = W.method(:move_now)
    W.define_singleton_method(:move_now) { clock }
    begin
      100.times do |i|
        clock += 0.1
        W.apply_move(c.id, b[0], b[1] + (i % 2) * 0.05, 0.0, 'idle')
      end
    ensure
      # put the world's own clock back (removing the stand-in removed it too)
      W.define_singleton_method(:move_now, original_move_now)
    end
    # (a clamped first step may carry them a metre to the wall, no further)
    assert_operator Math.hypot(ps.x - b[0], ps.z - b[1]), :>, 8, 'the world still has them on the far side of the wall'
    told = to(c.id).any? { |p| p[:t].to_s != 'zone_change' && p[:x].is_a?(Numeric) && p[:z].is_a?(Numeric) }
    assert told, 'every move was refused and the client was never told where the world holds it'
  end

  # trade_confirm names no offer: a confirm sent while the window showed one
  # offer lands on the one the partner swapped in a moment before it.
  def test_bug_client_trade_confirm_not_bound_to_offer
    a = make_char('Buyera'); b = make_char('Sellerb', x: 80)
    a.update!(gold: 500)
    sword = b.inventory_items.create!(item_key: 'iron_sword', qty: 1)
    junk = b.inventory_items.create!(item_key: 'wolf_fang', qty: 1)
    W.join(a.id); W.join(b.id)
    W.trade_invite(a.id, b.name)
    W.trade_respond(b.id, true)
    W.trade_offer(a.id, 400, [])
    W.trade_offer(b.id, 0, [{ 'inv_id' => sword.id, 'qty' => 1 }])
    seen = to(a.id).select { |p| p[:t] == 'trade_state' }.last
    assert_equal ['iron_sword'], seen[:theirs][:items].map { |i| i[:item_key] }, 'A is shown the sword'
    # B's swap reaches the world first; A's click, made on the sword, follows
    W.trade_offer(b.id, 0, [{ 'inv_id' => junk.id, 'qty' => 1 }])
    rev = seen[:rev] || seen[:revision] || seen[:version]
    W.method(:trade_confirm).arity == 1 ? W.trade_confirm(a.id) : W.trade_confirm(a.id, rev)
    theirs_flag = to(b.id).select { |p| p[:t] == 'trade_state' }.last
    W.trade_confirm(b.id) if theirs_flag && theirs_flag[:their_confirm]
    got = a.inventory_items.reload.pluck(:item_key)
    refute_includes got, 'wolf_fang', 'A paid 400 gold for the junk B swapped in under the confirm meant for the sword'
    assert_equal 500, a.reload.gold, 'the trade executed on an offer A never saw'
  end

  # A reconnect mid-scene builds a PlayerState with no scene; the client plays
  # on (the re-sent `cutscene` matches what it is playing) and its end is
  # dropped, so the scene stays owed and plays again.
  def test_bug_client_reconnect_during_cutscene_not_told
    c = Character.provision!(user: @user, name: 'Rewatcher', job: 'PLD', city: 'caerdun')
    opening = C.opening_for('caerdun')
    W.join(c.id, session_id: 'old')
    W.cutscene_begin(c.id, opening)
    assert_equal opening, W.find_player(c.id).last.cutscene
    # ActionCable reconnects: the new subscription joins; the client, still
    # playing, sends nothing new until the scene ends
    W.join(c.id, session_id: 'new')
    W.cutscene_end(c.id, opening)
    keys = c.discoveries.reload.pluck(:landmark_key)
    assert_includes keys, "#{C::SEEN}#{opening}", 'the scene, watched to the end, is not recorded as seen'
    refute_includes keys, "#{C::DUE}#{opening}", 'and is still owed, so it plays again'
  end
end
