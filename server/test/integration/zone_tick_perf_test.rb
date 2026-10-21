ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'

# The zone tick's performance fixes, pinned against what they replaced:
# pos frames as deltas (a row only when it changed, once more as it stops, a
# keyframe every 2 s and after a join, a resting row restamped ahead of a
# move), no rows built in a zone nobody is in, and the periodic position
# saves of a tick in one statement, each character on a phase of their own.
# The world is driven directly, as in audit2_sec_thin_test.rb.
class ZoneTickPerfTest < Minitest::Test
  W = Vanai::World
  ZONE = 'caerdunfields'

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades trade_invites].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@next_party_id, 0)
    W.initialize_ferry
    @frames = []
    test = self
    @original_send = W.method(:to_char)
    @original_zone = W.method(:broadcast_zone)
    W.define_singleton_method(:to_char) { |*| nil }
    W.define_singleton_method(:broadcast_zone) { |key, payload| test.instance_variable_get(:@frames) << [key, payload] }
    @user = User.create!(email: 'zone-tick-perf@example.invalid', password: 'isolated-test-password')
  end

  def teardown
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    W.define_singleton_method(:to_char, @original_send)
    W.define_singleton_method(:broadcast_zone, @original_zone)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def make_char(name, x:, z:, zone: ZONE)
    c = Character.provision!(user: @user, name: name, job: 'PLD', city: 'caerdun')
    c.update!(x: x, z: z, zone: zone)
    c
  end

  def me(id) = W.find_player(id)&.last

  # What the server sent every tick before the deltas, written out again.
  def full_rows(z)
    p = z.players.values.map { |ps| [ps.id, ps.x.round(2), ps.z.round(2), ps.heading.round(2), ps.anim] }
    m = z.monsters.values.select(&:alive?).map do |mo|
      [mo.mid, mo.x.round(2), mo.z.round(2), (100.0 * mo.hp / mo.max_hp).round, mo.state.to_s, mo.target_pid]
    end
    [p, m]
  end

  def pos_frames = @frames.select { |k, f| k == ZONE && f[:t] == 'pos' }.map(&:last)

  # ---------- pos-full-snapshot-every-tick / pos-sends-unchanged-monsters ----------

  # A client that applies the delta frames holds, every tick, exactly the
  # rows the full snapshot would have given it; a resting row restamped ahead
  # of a move is that entity's full row of the tick before, at that tick's s.
  def test_delta_frames_rebuild_the_full_snapshot_every_tick
    chars = 4.times.map { |i| make_char("Deltawalk#{%w[a b c d][i]}", x: -300 + i * 3, z: -30) }
    chars.each { |c| W.join(c.id) }
    z = W.zone(ZONE)
    walkers = chars.map { |c| me(c.id) }
    held = {}
    previous = nil
    sent_rows = full_count = 0
    t0 = 5000.0
    120.times do |k|
      # one walks all the way, one walks and rests in turns, two stand
      walkers[0].x += 0.5
      walkers[1].z += 0.4 if (k / 10).even?
      walkers[1].heading = (k / 10) * 0.3
      @frames.clear
      t = t0 + k * 0.25
      z.tick(t)
      p_full, m_full = full_rows(z)
      frames = pos_frames
      assert_operator frames.size, :<=, 1
      if (f = frames.first)
        assert_equal t.round(3), f[:s]
        if (r = f[:r])
          assert_equal (t - 0.25).round(3), r[:s], 'a resting row is restamped with the tick before'
          (r[:p] + r[:m]).each { |row| assert_equal previous[row[0]], row, "the restamped row of #{row[0]} is its row of the tick before" }
        end
        (f[:p] + f[:m]).each { |row| held[row[0]] = row }
        sent_rows += f[:p].size + f[:m].size
      end
      (p_full + m_full).each { |row| assert_equal row, held[row[0]], "tick #{k}: the client holds a stale row for #{row[0]}" }
      full_count += p_full.size + m_full.size
      previous = (p_full + m_full).to_h { |row| [row[0], row] }
    end
    assert_operator sent_rows, :<, full_count, 'the deltas sent no fewer rows than the full snapshots'
  end

  def test_a_row_goes_once_more_as_it_stops_and_its_rest_is_restamped_when_it_moves
    char = make_char('Deltastop', x: -300, z: -30)
    W.join(char.id)
    z = W.zone(ZONE)
    ps = me(char.id)
    row_of = ->(f) { f && f[:p].find { |r| r[0] == ps.id } }
    t = 6000.0
    tick = lambda do
      @frames.clear
      z.tick(t += 0.25)
      pos_frames.first
    end
    tick.call # the join's keyframe
    ps.x += 1.0
    moved = row_of.(tick.call)
    assert_equal ps.x.round(2), moved[1]
    assert_equal moved, row_of.(tick.call), 'the tick after it stops, its row goes once more'
    rested_at = t
    quiet = 3.times.map { row_of.(tick.call) }
    assert_equal [nil, nil, nil], quiet, 'a row at rest is not sent again'
    ps.x += 1.0
    f = tick.call
    assert_equal ps.x.round(2), row_of.(f)[1]
    assert_equal (t - 0.25).round(3), f[:r][:s]
    assert_equal [moved], f[:r][:p], 'the move is preceded by where it rested, at the tick before'
    assert_operator f[:r][:s], :>, rested_at
  end

  def test_a_keyframe_every_two_seconds_and_after_a_join
    a = make_char('Deltakeya', x: -300, z: -30)
    W.join(a.id)
    z = W.zone(ZONE)
    alive = -> { z.players.size + z.monsters.values.count(&:alive?) }
    t = 7000.0
    full = 20.times.map do
      @frames.clear
      z.tick(t += 0.25)
      f = pos_frames.first
      f && f[:p].size + f[:m].size == alive.()
    end
    keyframes = full.each_index.select { |i| full[i] }
    assert_equal 0, keyframes.first, 'the frame after a join carries every row'
    assert_equal [8], keyframes.each_cons(2).map { |x, y| y - x }.uniq, 'a keyframe every 8 ticks'
    # a second arrival brings the next one forward
    b = make_char('Deltakeyb', x: -298, z: -30)
    W.join(b.id)
    @frames.clear
    z.tick(t += 0.25)
    f = pos_frames.first
    assert_equal alive.(), f[:p].size + f[:m].size
  end

  # A monster that falls on the tick a player comes in leaves the row count
  # where it was; its respawn must still start afresh, never restamped from
  # where it fell.
  def test_a_respawn_is_never_restamped_from_where_it_fell
    a = make_char('Deltafalla', x: -300, z: -30)
    W.join(a.id)
    z = W.zone(ZONE)
    z.monsters.each_value { |m| m.wander_at = Float::INFINITY; m.move_goal = nil }
    m = z.monsters.values.find(&:alive?)
    t = 9500.0
    4.times { @frames.clear; z.tick(t += 0.25) }
    corpse = [m.x.round(2), m.z.round(2)]
    m.state = :dead
    W.join(make_char('Deltafallb', x: -298, z: -30).id)
    4.times { @frames.clear; z.tick(t += 0.25) }
    m.state = :idle
    m.x += 6.0
    @frames.clear
    z.tick(t += 0.25)
    f = pos_frames.first
    assert_equal [m.x.round(2), m.z.round(2)], f[:m].find { |r| r[0] == m.mid }[1, 2]
    back = (f[:r] || {})[:m] || []
    assert_nil back.find { |r| r[0] == m.mid }, "a respawn skated from its corpse at #{corpse}"
  end

  def test_a_tick_with_nothing_changed_sends_no_frame
    char = make_char('Deltaquiet', x: -300, z: -30)
    W.join(char.id)
    z = W.zone(ZONE)
    # monsters that stand still: none of them wanders, nothing changes
    z.monsters.each_value { |m| m.wander_at = Float::INFINITY; m.move_goal = nil }
    t = 8000.0
    counts = 10.times.map do
      @frames.clear
      z.tick(t += 0.25)
      pos_frames.size
    end
    assert_equal [1, 0, 0, 0, 0, 0, 0, 0, 1, 0], counts, 'only the keyframes go out over a still zone'
    me(char.id).anim = 'sit'
    @frames.clear
    z.tick(t += 0.25)
    assert_equal 1, pos_frames.size
    # a takeoff alone still goes out
    @frames.clear
    z.tick(t += 0.25) # the closing repeat
    @frames.clear
    z.note_jump(me(char.id), t + 0.1)
    z.tick(t += 0.25)
    f = pos_frames.first
    assert_equal [[me(char.id).id, (t - 0.15).round(3)]], f[:j]
    assert_equal [], f[:p]
  end

  # ---------- empty-zones-tick ----------

  def test_a_zone_nobody_is_in_builds_no_rows_and_its_monsters_still_wander
    z = W.zone(ZONE)
    before = z.monsters.values.to_h { |m| [m.mid, [m.x, m.z]] }
    t = 9000.0
    40.times { z.tick(t += 0.25) }
    assert_empty pos_frames
    assert_empty z.instance_variable_get(:@pos_memo)
    moved = z.monsters.values.count { |m| before[m.mid] && before[m.mid] != [m.x, m.z] }
    assert_operator moved, :>, 0, 'monster AI stopped in an empty zone'
    # the first arrival gets every row
    char = make_char('Deltafirst', x: -300, z: -30)
    W.join(char.id)
    @frames.clear
    z.tick(t += 0.25)
    assert_equal z.monsters.values.count(&:alive?), pos_frames.first[:m].size
  end

  # ---------- persist-on-world-thread / periodic-save-bunched-per-row ----------

  def saved(ids) = Character.where(id: ids).order(:id).pluck(:zone, :x, :z, :heading, :dead_at)

  # One statement writes what World.persist_position writes row by row,
  # dead_at's CASE included: a fall kept, a fall stamped, a stand cleared.
  def test_batched_save_writes_what_the_single_save_does
    fallen_at = Time.utc(2026, 10, 1, 12, 0, 0)
    states = [[true, fallen_at], [true, nil], [false, fallen_at], [false, nil]]
    one, many = %w[Single Batch].map do |tag|
      states.each_with_index.map do |(dead, at), i|
        c = make_char("Save#{tag}#{%w[a b c d][i]}", x: -300, z: -30)
        c.update_columns(dead_at: at)
        c
      end
    end
    [one, many].each { |cs| cs.each { |c| W.join(c.id) } }
    z = W.zone(ZONE)
    [one, many].each do |cs|
      cs.each_with_index do |c, i|
        ps = me(c.id)
        ps.x = -287.123456789 + i
        ps.z = 41.98765 - i
        ps.heading = 1.2345678 * i
        ps.dead = states[i][0]
      end
    end
    one.each { |c| W.persist_position(me(c.id), ZONE) }
    z.send(:persist_positions, many.map { |c| me(c.id) })
    assert_equal saved(one.map(&:id)), saved(many.map(&:id))
    assert_equal fallen_at, saved([many[0].id]).first.last, 'a fall already on the row keeps its time'
    refute_nil saved([many[1].id]).first.last
    assert_nil saved([many[2].id]).first.last
  end

  def test_a_failed_batch_falls_back_to_single_saves
    cs = %w[a b c].map { |s| make_char("Savefall#{s}", x: -300, z: -30) }
    cs.each { |c| W.join(c.id) }
    cs.each_with_index { |c, i| me(c.id).x = -250.5 - i }
    z = W.zone(ZONE)
    calls = 0
    original = W.method(:db)
    W.define_singleton_method(:db) { |&b| (calls += 1) == 1 ? raise(ActiveRecord::StatementInvalid, 'boom') : original.call(&b) }
    begin
      z.send(:persist_positions, cs.map { |c| me(c.id) })
    ensure
      W.define_singleton_method(:db, original)
    end
    assert_equal [-250.5, -251.5, -252.5], Character.where(id: cs.map(&:id)).order(:id).pluck(:x)
  end

  # Everyone who joined in one tick saves at once, as before, and from then on
  # on ticks of their own, every ~15 s each, instead of all together forever.
  def test_saves_of_players_who_joined_together_fall_on_different_ticks
    cs = 12.times.map { |i| make_char("Savestorm#{('a'.ord + i).chr}", x: -300 + i, z: -30) }
    cs.each { |c| W.join(c.id) }
    z = W.zone(ZONE)
    per_tick = Hash.new { |h, k| h[k] = [] }
    tick_no = 0
    z.define_singleton_method(:persist_positions) { |due| per_tick[tick_no].concat(due.map(&:char_id)) }
    t = 10_000.0
    (1..200).each do |k|
      tick_no = k
      z.tick(t += 0.25)
    end
    assert_equal cs.map(&:id).sort, per_tick[1].sort, 'the first save after a join comes at once'
    later = per_tick.reject { |k, _| k == 1 }
    assert_operator later.values.map(&:size).max, :<=, 1, "saves bunched: #{later.transform_values(&:size)}"
    cs.each do |c|
      ticks = per_tick.select { |_, ids| ids.include?(c.id) }.keys
      assert_operator ticks.size, :>=, 3
      gaps = ticks.each_cons(2).map { |a, b| b - a }
      assert_operator gaps.drop(1).uniq, :==, [61], "#{c.id} saves every 61 ticks after its first phase: #{gaps}"
      assert_operator gaps.first, :<=, 61
    end
  end
end
