ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'stringio'
require 'action_dispatch/testing/integration'
require 'action_cable/channel/test_case'

# Second audit, "sec-fixes": cases round one's security fixes (e22536fd) missed.
# Each test fails on the code as it stands and is named after its finding.

# ---------- the world: dungeon stalls, the dead after the hold ----------
class Audit2SecFixesWorldTest < Minitest::Test
  W = Vanai::World

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
    @original_move_now = W.method(:move_now)
    @original_now = Vanai.method(:now)
    W.define_singleton_method(:to_char) { |id, payload = nil, **kw| test.instance_variable_get(:@messages) << [id, payload || kw] }
    W.define_singleton_method(:move_now) { test.instance_variable_get(:@clock) }
    Vanai.define_singleton_method(:now) { test.instance_variable_get(:@clock) }
    @log = StringIO.new
    @original_logger = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(@log)
    @user = User.create!(email: 'audit2-sec-fixes@example.invalid', password: 'isolated-test-password')
    @char = Character.provision!(user: @user, name: 'Fixwarden', job: 'PLD', city: 'caerdun')
  end

  def teardown
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    Rails.logger = @original_logger
    W.define_singleton_method(:to_char, @original_send)
    W.define_singleton_method(:move_now, @original_move_now)
    Vanai.define_singleton_method(:now, @original_now)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def me = W.find_player(@char.id)&.last

  # An honest client walks a corridor bend at the run speed, 10 moves a
  # second; its line stalls for `stall` seconds around the bend and then
  # delivers the held moves at once; it stops at the far end and sends nothing
  # more. The world settles every tick for five seconds after. Returns how far
  # the server's position is from where the client stopped.
  def stalled_bend(zone, corridor, stall)
    cell = Vanai::Data.zones[zone]['layout']['cell'].to_f
    pts = corridor.map { |x, z| [x * cell, z * cell] }
    W.leave(@char.id, transferring: true) if W.find_player(@char.id)
    @char.update!(zone: zone, x: pts[0][0], z: pts[0][1])
    W.join(@char.id)
    samples = []
    t = 0.0
    pos = pts[0].dup
    bend_at = nil
    pts[1..].each do |target|
      loop do
        d = Math.hypot(target[0] - pos[0], target[1] - pos[1])
        break if d < 1e-6
        s = [0.8, d].min
        pos = [pos[0] + (target[0] - pos[0]) / d * s, pos[1] + (target[1] - pos[1]) / d * s]
        t += 0.1
        samples << [t, pos.dup]
      end
      bend_at ||= t
    end
    t0 = bend_at - stall / 2
    t1 = bend_at + stall / 2
    events = samples.map { |tt, p| [tt >= t0 && tt < t1 ? t1 : tt, 0, p] }
    ticks = (0..((samples.last[0] + 5) / 0.25).ceil).map { |i| [i * 0.25, 1, nil] }
    (events + ticks).sort_by { |tt, kind, _| [tt, kind] }.each do |tt, kind, p|
      @clock = 1000.0 + tt
      kind.zero? ? W.apply_move(@char.id, p[0], p[1], 0.0, 'run') : W.settle_moves
    end
    stop = samples.last[1]
    Math.hypot(stop[0] - me.x, stop[1] - me.z)
  end

  # sec-fixes-dungeon-stall-strands-player
  def test_sec_fixes_dungeon_stall_strands_player
    # the Mausoleum's corridor bends [8,-10] -> [8,-3] -> [13,-3] and
    # [15,22] -> [22,22] -> [22,27] (zones.json layout.corridors, in cells)
    gaps = [[[8, -10], [8, -3], [13, -3]], [[15, 22], [22, 22], [22, 27]]].to_h do |corridor|
      [corridor, stalled_bend('mausoleum', corridor, 3.0).round(1)]
    end
    stranded = gaps.select { |_, gap| gap >= 1.0 }
    assert_empty stranded, 'after a 3 s stall at these bends the server still stands this many metres ' \
                           'from where the client stopped, 5 s after its last move'

  end

  # sec-fixes-dead-revive-after-hold
  def test_sec_fixes_dead_revive_after_hold
    @char.update!(zone: 'caerdunfields', x: 0, z: 0)
    W.join(@char.id)
    z, ps = W.find_player(@char.id)
    ps.x = 12.0
    ps.z = 34.0
    Vanai::Combat.player_death(z, ps)
    assert ps.dead
    W.leave(@char.id)
    # within the hold the death is kept (round one's fix)...
    @clock += 60
    W.join(@char.id)
    assert me.dead, 'a rejoin within VITALS_HOLD is still dead'
    W.leave(@char.id)
    # ...but past it, the row alone rebuilds them: alive, whole, where they fell
    @clock += W.singleton_class::VITALS_HOLD + 1
    W.join(@char.id)
    p_ = me
    assert p_.dead || [p_.x, p_.z] != [12.0, 34.0],
           "past VITALS_HOLD a fallen character logs back in alive (dead=#{p_.dead}, hp=#{p_.hp}/#{p_.max_hp}) " \
           "on the spot they fell (#{p_.x}, #{p_.z}), with no release and no Raise"
  end
end

# ---------- the cable: a resubscribe loop ----------
class Audit2SecFixesChannelTest < ActionCable::Channel::TestCase
  tests ZoneChannel
  W = Vanai::World

  def setup
    super
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    W.instance_variable_set(:@queue, Queue.new)
    ZoneChannel::BUCKET_LOCK.synchronize { ZoneChannel::BUCKETS_BY_CHAR.clear }
    @user = User.create!(email: 'audit2-sec-fixes-cable@example.invalid', password: 'isolated-test-password')
    @char = Character.provision!(user: @user, name: 'Fixcabler', job: 'PLD', city: 'caerdun')
    stub_connection current_user_id: @user.id, current_character_id: @char.id
  end

  def teardown
    ActiveRecord::Base.connection.rollback_transaction
    super
  end

  def queued_calls(name)
    calls = 0
    original = W.method(name)
    W.define_singleton_method(name) { |*| calls += 1 }
    q = W.instance_variable_get(:@queue)
    others = 0
    until q.empty?
      before = calls
      q.pop.call
      others += 1 if calls == before
    end
    calls
  ensure
    W.define_singleton_method(name, original)
  end

  # sec-fixes-subscribe-cycle-flood
  def test_sec_fixes_subscribe_cycle_flood
    subscribe
    assert subscription.confirmed?
    100.times do
      unsubscribe
      subscribe
      assert subscription.confirmed?, 'the same identifier, unsubscribed, is let in again'
    end
    q = W.instance_variable_get(:@queue)
    total = q.size
    joins = queued_calls(:join)
    # perform_action's buckets would hold 100 messages to their burst; the
    # subscribe path has none: every cycle queues a full join and a leave
    assert_operator joins, :<=, ZoneChannel::BUCKETS[:talk][1].to_i,
                    "100 unsubscribe/subscribe cycles on one socket queued #{joins} world joins " \
                    "(#{total} world actions in all), with no throttle"
  end
end

# ---------- REST: equip against a job change ----------
class Audit2SecFixesEquipTest < Minitest::Test
  W = Vanai::World

  # Runs the pending rival once, on the next Character#lock! in this thread:
  # what a job change committing on the world thread at that moment would do.
  module RivalBeforeLock
    def lock!(*args, **opts)
      rival = Thread.current[:audit2_sec_fixes_rival]
      Thread.current[:audit2_sec_fixes_rival] = nil
      rival&.call
      super
    end
  end
  Character.prepend(RivalBeforeLock) unless Character.ancestors.include?(RivalBeforeLock)

  def setup
    raise 'Test database only' unless Rails.env.test?
    @previous_queue = W.instance_variable_get(:@queue)
    W.instance_variable_set(:@queue, Queue.new)
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @api = ActionDispatch::Integration::Session.new(Rails.application)
    @api.host! 'localhost'
    @api.post '/api/register', params: { email: 'audit2-sec-fixes-equip@example.invalid', password: 'isolated-test-password' }, as: :json
    @api.post '/api/characters', params: { name: 'Fixequip', race: 'aedri', job: 'PLD', city: 'caerdun' }, as: :json
    @char = Character.find(JSON.parse(@api.response.body).dig('character', 'id'))
    @api.post "/api/characters/#{@char.id}/select", as: :json
  end

  def teardown
    Thread.current[:audit2_sec_fixes_rival] = nil
    W.instance_variable_set(:@queue, @previous_queue)
    ActiveRecord::Base.connection.rollback_transaction
  end

  # sec-fixes-equip-job-change-race
  def test_sec_fixes_equip_job_change_race
    blade_key = 'palegarden_blade'
    blade = Vanai::Data.items.fetch(blade_key)
    assert_includes Vanai::Data.eligible_jobs(blade), 'PLD'
    refute_includes Vanai::Data.eligible_jobs(blade), 'BLM'
    @char.character_jobs.find_by!(job: 'PLD').update!(level: 50)
    row = @char.inventory_items.create!(item_key: blade_key, qty: 1)
    id = @char.id
    # World.change_job's database half (world.rb:1124-1129), committing after
    # equip's pre-check read active_job PLD and before its lock
    Thread.current[:audit2_sec_fixes_rival] = lambda do
      c = Character.find(id)
      c.update!(active_job: 'BLM')
      c.unequip_incompatible_job_gear!
    end
    @api.post '/api/game/equip', params: { inventory_item_id: row.id }, as: :json
    @char.reload
    assert_equal 'BLM', @char.active_job
    assert_equal 1, @char.job_record.level
    refute_equal 'weapon', row.reload.equipped_slot,
                 "a level-#{@char.job_record.level} #{@char.active_job} now wields the level-#{blade['lvl']} sword " \
                 "(response #{@api.response.body[0, 80]})"
  end
end
