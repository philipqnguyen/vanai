ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'

# The world thread's database work that runs on threads of its own
# (docs/SERVER-PERF.md rules 2 and 7): the periodic position saves
# (PositionWriter) and a join's reads (JoinLoader). Both are what a running
# world does; these tests switch them on, as boot! does, without the world's
# own thread. The threads' connections are the test's (pin_connection!), so the
# transaction rolls back what they write.
class WorldOffloadTest < Minitest::Test
  W = Vanai::World
  ZONE = 'caerdun'

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    # one connection for every thread, inside one transaction (what Rails's
    # own transactional tests pin)
    ActiveRecord::Base.connection_pool.pin_connection!(true)
    %i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades
       join_requests join_tokens join_loads].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@join_backlog, nil)
    W.instance_variable_set(:@join_ready, [])
    W.instance_variable_set(:@recompute_pending, Set.new)
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@next_party_id, 0)
    W.initialize_ferry
    @writer = Vanai::PositionWriter.new(inline: false)
    W.instance_variable_set(:@positions, @writer)
    test = self
    @messages = []
    @originals = %i[to_char broadcast_zone].to_h { |m| [m, W.method(m)] }
    W.define_singleton_method(:to_char) { |id, payload = nil, **kw| test.instance_variable_get(:@messages) << [id, payload || kw] }
    W.define_singleton_method(:broadcast_zone) { |*| nil }
    @user = User.create!(email: 'world-offload@example.invalid', password: 'isolated-test-password')
  end

  def teardown
    @originals&.each { |m, impl| W.define_singleton_method(m, impl) }
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    @writer&.flush
    W.instance_variable_set(:@positions, nil)
    W.instance_variable_set(:@loader, nil)
    W.instance_variable_set(:@join_backlog, nil)
    ActiveRecord::Base.connection_pool.unpin_connection!
    Vanai::Courts.instance_variable_set(:@courts_ensured, false)
  end

  def make_char(name, zone: ZONE)
    c = Character.provision!(user: @user, name: name, job: 'PLD', city: 'caerdun')
    c.update!(zone: zone)
    c
  end

  def me(id) = W.find_player(id)&.last
  def row(id) = Character.where(id: id).pick(:zone, :x, :z)

  # the world thread's own statements, not the writer's or the loaders'
  def world_sql
    mine = Thread.current
    seen = []
    sub = ActiveSupport::Notifications.subscribe('sql.active_record') do |*, p|
      next if p[:name] == 'SCHEMA' || p[:sql] =~ /\A\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/
      seen << p[:sql] if Thread.current == mine
    end
    yield
    seen
  ensure
    ActiveSupport::Notifications.unsubscribe(sub)
  end

  # ---------- PositionWriter ----------

  def test_a_ticks_saves_wait_for_the_commit_and_go_in_one_statement_off_this_thread
    a, b = make_char('Offloadone'), make_char('Offloadtwo', zone: 'caerdunfields')
    sql = world_sql do
      @writer.save([[a.id, ZONE, 11.0, 12.0, 0.5, false]])
      @writer.save([[b.id, 'caerdunfields', 21.0, 22.0, 0.5, false]])
    end
    assert_empty sql, 'a save waits for the commit'
    assert_equal [ZONE, a.x, a.z], row(a.id)
    writes = []
    sub = ActiveSupport::Notifications.subscribe('sql.active_record') { |*, p| writes << Thread.current if p[:name] == 'Vanai persist_positions' }
    @writer.commit
    @writer.flush
    ActiveSupport::Notifications.unsubscribe(sub)
    assert_equal 1, writes.size, 'two zones, one statement'
    refute_equal Thread.current, writes.first, 'written on the writer thread'
    assert_equal [ZONE, 11.0, 12.0], row(a.id)
    assert_equal ['caerdunfields', 21.0, 22.0], row(b.id)
  end

  # A crossing's synchronous write waits for the batch still queued, or the
  # batch would land after it and put them back where they stood.
  def test_a_synchronous_write_lands_after_every_queued_save
    c = make_char('Offloadthree')
    original = @writer.method(:statement)
    @writer.define_singleton_method(:statement) { |conn, rows| sleep 0.2; original.call(conn, rows) }
    W.join(c.id)
    ps = me(c.id)
    @writer.save([[c.id, ZONE, 5.0, 5.0, 0.0, false]])
    @writer.commit
    ps.x, ps.z = 40.0, 41.0
    W.persist_position(ps, ZONE)
    # whatever the writer still had, it has written by now
    @writer.flush
    assert_equal [ZONE, 40.0, 41.0], row(c.id)
  end

  # A database slower than the flush's patience: the flush says so and goes
  # on waiting, since writing past the queued batch would let it land after.
  def test_a_flush_waits_out_a_slow_database_rather_than_write_past_it
    c = make_char('Offloadslow')
    W.join(c.id)
    ps = me(c.id)
    original = @writer.method(:statement)
    @writer.define_singleton_method(:statement) { |conn, rows| sleep 0.4; original.call(conn, rows) }
    with_slow_flush(0.05) do
      @writer.save([[c.id, ZONE, 5.0, 5.0, 0.0, false]])
      @writer.commit
      ps.x, ps.z = 40.0, 41.0
      W.persist_position(ps, ZONE)
    end
    @writer.flush
    assert_equal [ZONE, 40.0, 41.0], row(c.id)
  end

  # A fall mid-tick is not waited for: it is queued behind the saves before
  # it, so an older save that still had them standing cannot clear it.
  def test_a_death_is_queued_behind_the_saves_and_the_tick_does_not_wait
    c = make_char('Offloaddeath')
    W.join(c.id)
    ps = me(c.id)
    original = @writer.method(:statement)
    @writer.define_singleton_method(:statement) { |conn, rows| sleep 0.2; original.call(conn, rows) }
    @writer.save([[c.id, ZONE, 5.0, 5.0, 0.0, false]])
    @writer.commit
    @writer.save([[c.id, ZONE, 6.0, 6.0, 0.0, false]]) # this tick's, not yet committed
    ps.dead = true
    t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    sql = world_sql { W.persist_death(ps) }
    assert_operator Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0, :<, 0.1, 'the tick did not wait'
    assert_empty sql
    @writer.flush
    assert Character.where(id: c.id).pick(:dead_at), 'the fall stands'
    assert_equal [ZONE, 6.0, 6.0], row(c.id)
  end

  def with_slow_flush(seconds)
    old = Vanai::PositionWriter::SLOW_FLUSH
    Vanai::PositionWriter.send(:remove_const, :SLOW_FLUSH)
    Vanai::PositionWriter.const_set(:SLOW_FLUSH, seconds)
    yield
  ensure
    Vanai::PositionWriter.send(:remove_const, :SLOW_FLUSH)
    Vanai::PositionWriter.const_set(:SLOW_FLUSH, old)
  end

  # A save for the zone they have left writes nothing, should one ever be
  # queued past a crossing that did not flush.
  def test_a_save_for_a_zone_left_writes_nothing
    c = make_char('Offloadfour')
    Character.where(id: c.id).update_all(zone: 'caerdunfields', x: 1.0, z: 2.0)
    @writer.save([[c.id, ZONE, 9.0, 9.0, 0.0, false]])
    @writer.commit
    @writer.flush
    assert_equal ['caerdunfields', 1.0, 2.0], row(c.id)
  end

  def test_the_zone_tick_hands_its_saves_to_the_writer
    c = make_char('Offloadfive')
    W.join(c.id)
    ps = me(c.id)
    ps.x, ps.z = 7.0, 8.0
    ps.last_save_at = 0.0
    sql = world_sql { W.zone(ZONE).tick(Vanai.now) }
    assert_empty sql.grep(/UPDATE characters/i), 'the tick itself writes no save'
    @writer.commit
    @writer.flush
    assert_equal [ZONE, 7.0, 8.0], row(c.id)
  end

  # ---------- JoinLoader ----------

  def with_loader
    W.instance_variable_set(:@loader, Vanai::JoinLoader.new)
  end

  def loaded(cid, timeout: 5)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + timeout
    until (t = W.join_loads[cid]) && (t[:loaded] || t[:error])
      flunk "no load for #{cid}" if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
      sleep 0.005
    end
  end

  def tick_until_online(cid, ticks: 40)
    ticks.times do
      W.run_tick
      return me(cid) if me(cid)
      sleep 0.01
    end
    nil
  end

  def test_a_join_reads_its_rows_off_the_world_thread
    with_loader
    c = make_char('Offloadsix')
    Character.where(id: c.id).update_all(x: 3.5, z: -2.25, gold: 77)
    W.request_join(c.id, 'sess')
    W.run_tick # dispatches the load
    refute me(c.id), 'joined once the rows are read, not before'
    loaded(c.id)
    sql = world_sql { W.run_tick }
    ps = me(c.id)
    assert ps, 'installed'
    assert_equal [3.5, -2.25, 77], [ps.x, ps.z, ps.gold]
    # what the loader read (the mute check, the mail badge and the courts'
    # payloads still ask here)
    assert_empty sql.grep(/"character_jobs"|"quest_progresses"|"inventory_items"\.\* FROM|SELECT 1 AS one FROM "discoveries"/),
                 "the world thread read the rows again: #{sql.inspect}"
    assert_equal 'sess', W.instance_variable_get(:@sessions)[c.id]
  end

  def test_the_same_player_whichever_thread_reads_the_rows
    c = make_char('Offloadseven')
    W.join(c.id)
    inline = me(c.id).self_payload.merge(me(c.id).public_payload)
    W.leave(c.id)
    with_loader
    W.request_join(c.id, 'again')
    assert tick_until_online(c.id)
    assert_equal inline, me(c.id).self_payload.merge(me(c.id).public_payload)
  end

  def test_a_subscription_gone_while_its_rows_are_read_never_joins
    with_loader
    c = make_char('Offloadeight')
    W.request_join(c.id, 'gone')
    W.run_tick
    W.cancel_join(c.id, 'gone')
    assert_empty W.join_loads, 'the load is forgotten at once'
    # whenever the read finishes, it is dropped
    sleep 0.2
    3.times { W.run_tick }
    refute me(c.id)
  end

  # A request's write after the rows were read: the world reads them again
  # rather than install what the load saw.
  def test_a_load_a_request_changed_is_read_again
    with_loader
    c = make_char('Offloadnine')
    W.request_join(c.id, 'sess')
    W.run_tick
    loaded(c.id)
    Character.where(id: c.id).update_all(gold: 555)
    W.request_recompute(c.id)
    assert tick_until_online(c.id)
    assert_equal 555, me(c.id).gold
  end

  # A loader thread that dies mid-read still hands its ticket back: the world
  # reads the rows itself, and the thread is replaced.
  def test_a_load_that_dies_still_joins
    with_loader
    loader = W.instance_variable_get(:@loader)
    fatal = Class.new(Exception)
    loader.define_singleton_method(:read) { |_| Thread.current.report_on_exception = false; raise fatal }
    c = make_char('Offloaddies')
    W.request_join(c.id, 'sess')
    assert tick_until_online(c.id), 'joined'
    assert_empty W.join_loads
    assert_equal Vanai::JoinLoader::THREADS, loader.instance_variable_get(:@threads).count(&:alive?) + 1,
                 'one died' # and the next load replaces it
    loader.singleton_class.send(:remove_method, :read)
    d = make_char('Offloadnext')
    W.request_join(d.id, 'sess2')
    assert tick_until_online(d.id)
    assert_equal Vanai::JoinLoader::THREADS, loader.instance_variable_get(:@threads).count(&:alive?)
  end

  # A refresh while online takes no load, so it never waits on them.
  def test_a_rejoin_while_online_does_not_wait_for_full_loads
    with_loader
    c = make_char('Offloadfull')
    W.join(c.id, session_id: 'old')
    W.singleton_class::LOADS_IN_FLIGHT.times { |i| W.join_loads[-1 - i] = { char_id: -1 - i } }
    W.request_join(c.id, 'new')
    W.run_tick
    assert_equal 'new', W.instance_variable_get(:@sessions)[c.id]
  end

  # A court's purse paid while the loader reads their rows: the world reads
  # them again, and they arrive with it (World.touch).
  def test_a_purse_paid_during_the_load_is_read_again
    with_loader
    c = make_char('Offloadpurse')
    W.request_join(c.id, 'sess')
    W.run_tick
    loaded(c.id)
    gold = Character.where(id: c.id).pick(:gold)
    letter = CourtLetter.create!(character_id: c.id, character_name: c.name, court: 'heartwood', kind: 'purse',
                                 amount: 25, text: 'A purse.', cycle: 1, status: 'unread')
    Vanai::Courts::Letters.pay_purse!(letter)
    assert tick_until_online(c.id)
    assert_equal gold + 25, me(c.id).gold
  end

  # Online already (a refresh): their leave writes the rows, so the join
  # reads them itself after it, as before.
  def test_a_rejoin_while_online_reads_after_the_leave
    with_loader
    c = make_char('Offloadten')
    W.join(c.id, session_id: 'old')
    me(c.id).x = 19.0
    W.request_join(c.id, 'new')
    W.run_tick
    assert_equal 'new', W.instance_variable_get(:@sessions)[c.id]
    assert_equal 19.0, me(c.id).x
    assert_empty W.join_loads
  end
end
