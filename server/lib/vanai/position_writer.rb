module Vanai
  # The periodic position saves, written off the world thread (SERVER-PERF.md
  # rule 2). Every zone's saves due in a tick used to be one UPDATE per zone on
  # the world thread: 17 round trips a tick at 2000 explorers, 50 of a 57 ms
  # player phase, the tick waiting on Postgres each time. Now the tick only
  # copies the due rows; `commit` hands the tick's rows over as one batch, and
  # this thread writes every batch waiting in one statement, the latest row
  # for a character winning.
  #
  # A periodic save is the one write that can wait: nothing reads a position
  # back while its character is online (the world holds it), and an offline
  # character has none queued, since leaving saves synchronously. What must
  # never happen is a queued row landing after a newer write of the same
  # columns (a portal, a release, a sailing, a leave, a death) and putting the
  # character back where they were, or up again from a fall. So every
  # synchronous write of zone, x, z, heading or dead_at goes through
  # World.pos_db, which `flush`es first and never gives up waiting (a write
  # past a batch still queued is the very thing to prevent); a fall or a Raise
  # mid-tick, which nothing reads back at once, is queued behind the saves
  # instead (`later`), so the tick does not wait on the database for it; and
  # the batch writes a row only while its zone is still the zone on the
  # character (a crossing that forgot to flush is not undone).
  #
  # Inline (tests, the harness, any process without the world's thread) it
  # writes at once on the caller's thread, the same statement.
  class PositionWriter
    # a flush waiting longer than this says so, and goes on waiting
    SLOW_FLUSH = 5.0

    def initialize(inline:)
      @inline = inline
      @pending = []
      @lock = Mutex.new
      @written = ConditionVariable.new
      @queued_seq = 0
      @written_seq = 0
      @batches = Queue.new
      @thread = nil
    end

    def inline? = @inline

    # Rows for this tick: [char_id, zone, x, z, heading, dead] each, copied
    # on the world thread as they stand.
    def save(rows)
      return if rows.empty?
      return write(rows) if @inline
      # under the lock: the exit's flush commits from another thread
      @lock.synchronize { @pending.concat(rows) }
    end

    # The tick's rows, handed over as one batch (World.run_tick, after the
    # zones).
    def commit
      return if @inline
      @lock.synchronize do
        next if @pending.empty?
        push(@pending, nil)
        @pending = []
      end
    end

    # A write of the same columns that nothing waits on, run on this thread
    # after every row saved before it (World.persist_death). Inline, at once.
    def later(&block)
      return run_write(block) if @inline
      @lock.synchronize do
        push(@pending, nil) unless @pending.empty?
        @pending = []
        push(nil, block)
      end
    end

    # Returns once every row saved before the call is written. The world
    # thread calls it before a synchronous write of the same columns; the
    # tick's own uncommitted rows go first.
    def flush
      return if @inline
      commit
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      warned = false
      @lock.synchronize do
        target = @queued_seq
        while @written_seq < target
          start
          waited = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
          @written.wait(@lock, warned ? 1.0 : [SLOW_FLUSH - waited, 0.01].max)
          next if warned || Process.clock_gettime(Process::CLOCK_MONOTONIC) - started < SLOW_FLUSH
          warned = true
          Rails.logger.error("[vanai] position writer: a flush has waited #{SLOW_FLUSH}s (#{target - @written_seq} batches behind)")
        end
      end
    end

    def backlog = @batches.size

    private

    # under @lock
    def push(rows, block)
      start
      @batches << [@queued_seq += 1, rows, block]
    end

    def start
      return if @thread&.alive?
      @thread = Thread.new { run }
      @thread.name = "vanai-positions"
    end

    def run
      loop do
        items = [@batches.pop]
        # everything else already waiting goes too, consecutive rows in one
        # statement, a later write after the rows before it (this thread is
        # the only one taking from the queue)
        items << @batches.pop(true) until @batches.empty?
        items.slice_when { |a, b| a[2] || b[2] }.each do |group|
          Rails.application.executor.wrap do
            group.first[2] ? run_write(group.first[2]) : write(group.flat_map { |_, rows| rows })
          end
        ensure
          @lock.synchronize do
            @written_seq = group.last[0]
            @written.broadcast
          end
        end
      end
    end

    def run_write(block)
      ActiveRecord::Base.connection_pool.with_connection(&block)
    rescue => e
      Rails.logger.error("[vanai] position writer: #{e.class}: #{e.message}")
    end

    def write(rows)
      latest = {}
      rows.each { |r| latest[r[0]] = r }
      rows = latest.values
      ActiveRecord::Base.connection_pool.with_connection do |conn|
        statement(conn, rows)
      rescue ActiveRecord::ActiveRecordError => e
        # one bad row must not lose the others
        Rails.logger.error("[vanai] persist_positions: #{e.message}")
        rows.each do |r|
          statement(conn, [r])
        rescue ActiveRecord::ActiveRecordError => e2
          Rails.logger.error("[vanai] persist_position #{r[0]}: #{e2.message}")
        end
      end
    rescue => e
      Rails.logger.error("[vanai] position writer: #{e.class}: #{e.message}")
    end

    # World.persist_position's UPDATE, row for row, the dead_at CASE included.
    def statement(conn, rows)
      values = rows.map do |id, zone, x, z, heading, dead|
        "(#{conn.quote(id.to_i)}, #{conn.quote(zone.to_s)}, #{conn.quote(x.to_f)}, " \
          "#{conn.quote(z.to_f)}, #{conn.quote(heading.to_f)}, #{conn.quote(!!dead)})"
      end
      conn.exec_update(<<~SQL, "Vanai persist_positions")
        UPDATE characters AS c
        SET x = v.x, z = v.z, heading = v.heading,
            dead_at = CASE WHEN v.dead THEN COALESCE(c.dead_at, CURRENT_TIMESTAMP) END
        FROM (VALUES #{values.join(", ")}) AS v(id, zone, x, z, heading, dead)
        WHERE c.id = v.id::bigint AND c.zone = v.zone
      SQL
    end
  end
end
