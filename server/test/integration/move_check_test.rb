ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'stringio'

# The speed limit on reported positions (move_check.rb): an honest walk is
# taken as sent, bunched packets after a stall included; a jump no run could
# make is cut to what the budget allows and finished at the speed limit; and
# every placement the server makes itself -- a portal, a crystal, a release, a
# scene's mark -- starts a fresh budget, so none of them is ever clamped.
class MoveCheckTest < Minitest::Test
  W = Vanai::World
  M = Vanai::MoveCheck

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions move_checks].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@trades, {})
    W.initialize_ferry
    @messages = []
    @clock = 1000.0
    test = self
    @original_send = W.method(:to_char)
    @original_now = W.method(:move_now)
    W.define_singleton_method(:to_char) { |id, payload| test.instance_variable_get(:@messages) << [id, payload] }
    W.define_singleton_method(:move_now) { test.instance_variable_get(:@clock) }
    @log = StringIO.new
    @original_logger = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(@log)
    @user = User.create!(email: 'move-check-test@example.invalid', password: 'isolated-test-password')
    @char = Character.provision!(user: @user, name: 'Strider', job: 'PLD', city: 'caerdun')
    @char.update!(x: 79, z: -18)
    W.join(@char.id)
  end

  def teardown
    W.leave(@char.id, persist: false) if W.find_player(@char.id)
    Rails.logger = @original_logger
    W.define_singleton_method(:to_char, @original_send)
    W.define_singleton_method(:move_now, @original_now)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def me = W.find_player(@char.id)&.last
  def at = [me.x, me.z]
  def move(x, z) = W.apply_move(@char.id, x, z, 0.0, 'run')
  def wait(s) = @clock += s
  def warnings = @log.string.lines.grep(/fast move/)

  # a run as the client sends it: 10 Hz, 8 m/s
  def run_for(dx, dz, seconds)
    x0, z0 = at
    steps = (seconds * 10).round
    len = Math.hypot(dx, dz)
    1.upto(steps) do |i|
      wait(0.1)
      d = M::RUN_SPEED * 0.1 * i
      move(x0 + dx / len * d, z0 + dz / len * d)
    end
  end

  def test_a_run_at_full_speed_is_taken_as_sent
    run_for(1, 0, 6.0) # 48 m, longer than the whole budget
    assert_in_delta 79 + 48, me.x, 1e-6
    assert_in_delta(-18, me.z, 1e-6)
    assert_empty warnings
  end

  def test_a_stalled_line_delivering_its_moves_at_once_is_not_clamped
    wait(1.5) # nothing heard for a second and a half...
    # ...then the whole second and a half of moves lands in one tick
    1.upto(15) { |i| move(79 + 0.8 * i, -18) }
    assert_in_delta 79 + 12, me.x, 1e-6
    assert_empty warnings
  end

  def test_a_teleport_sized_jump_is_cut_to_the_budget_and_walked_the_rest
    wait(30) # standing still stores no more than the cap
    move(79 + 200, -18)
    assert_in_delta 79 + M::CAP, me.x, 1e-6, 'cut to the budget, along its direction'
    assert_in_delta(-18, me.z, 1e-6)
    assert_equal 1, warnings.size
    assert_match(/char=#{@char.id}/, warnings.first)
    # the world walks them on at the speed limit, and no faster
    wait(1.0)
    W.settle_moves
    assert_in_delta 79 + M::CAP + M::RUN_SPEED * M::SPEED_SLACK, me.x, 1e-6
    80.times { wait(W::TICK); W.settle_moves }
    assert_in_delta 79 + 200, me.x, 1e-6, 'an honest client held back by lag still ends up where it stands'
    assert_nil W.move_checks[@char.id].pending
  end

  def test_offenders_are_logged_at_most_once_per_interval
    10.times { |i| wait(0.1); move(i.even? ? 300 : -300, -18) }
    assert_equal 1, warnings.size
    wait(W::MOVE_LOG_EVERY)
    move(300, 100)
    assert_equal 2, warnings.size
    assert_match(/10 since the last report/, warnings.last)
  end

  def test_refusing_spends_nothing_and_leaves_them_standing
    check = M.new
    assert_equal [0, 0, true], check.step(0, 0, 100, 0, 1.0, clamp: false)
    assert_equal [10, 0, false], check.step(0, 0, 10, 0, 1.0, clamp: false)
  end

  def test_a_portal_is_never_clamped
    portal = Vanai::Data.zones['caerdun']['portals'].find { |p| p['id'] == 'cd_fields' }
    W.travel(@char.id, portal)
    assert_nil me, 'gone until the client joins the new zone'
    W.join(@char.id) # the client's new subscription
    z, = W.find_player(@char.id)
    assert_equal 'caerdunfields', z.key
    assert_equal [portal['tx'], portal['tz']], at
    # a fresh budget at the landing: a full one, measured from there
    move(portal['tx'] + M::CAP, portal['tz'])
    assert_in_delta portal['tx'] + M::CAP, me.x, 1e-6
    assert_empty warnings
  end

  def test_a_crystal_and_a_release_are_never_clamped
    move(80, -18) # some budget spent beforehand
    W.teleport_to_crystal(@char.id, 'caerdun', { 'x' => -100, 'z' => 50 })
    W.join(@char.id)
    assert_equal [-95, 53], at
    move(-95 + M::CAP, 53)
    assert_in_delta(-95 + M::CAP, me.x, 1e-6)
    me.dead = true
    W.release(@char.id)
    W.join(@char.id)
    landing = @messages.reverse.find { |id, p| id == @char.id && p[:t] == 'zone_change' }.last
    assert landing[:respawn]
    assert_equal [landing[:x], landing[:z]], at
    move(landing[:x] + 5, landing[:z])
    assert_in_delta landing[:x] + 5, me.x, 1e-6
    assert_empty warnings
  end

  def test_a_scene_with_a_mark_leaves_its_watcher_on_it
    id, scene = Vanai::Data.cutscenes.find { |_, s| s['zone'] == 'caerdun' && s['mark'] && s.dig('trigger', 'type') == 'opening' }
    assert id, 'the Caerdun opening stands its subject on a mark'
    move(80, -18)
    W.cutscene_begin(@char.id, id)
    W.cutscene_end(@char.id, id)
    assert_equal scene['mark'][0, 2], at, 'the world puts them where the scene did'
    # the scene's own walk away from it is a step, not a jump
    move(scene['mark'][0] + 5, scene['mark'][1])
    assert_in_delta scene['mark'][0] + 5, me.x, 1e-6
    assert_empty warnings
  end
end
