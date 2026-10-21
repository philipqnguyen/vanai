module Vanai
  # Errors the world's own threads rescue, sent to Good Sorcery (DEPLOY.md
  # "Settings and secrets"). Requests, cable actions and jobs reach the gem
  # through its integrations; the world thread's rescues (World.guarded, the
  # persist_* writes, the courts' and mail's ticks) and the position writer's
  # and join loaders' threads catch their errors themselves, so the gem never
  # sees them unless they are handed over here.
  #
  # The gem builds an event on the thread that reports it: the backtrace
  # parsed, the source around ten frames read from disk, everything filtered.
  # That is file I/O and a millisecond or so of Ruby, which the world thread
  # may not spend (SERVER-PERF.md rule 1), and a bug that raises in every tick
  # would spend it four times a second. So `report` only counts and queues:
  #
  # - One report per site, class and raising line every EVERY seconds. The
  #   rest are counted, and the next report says how many it stands for.
  # - The queue holds QUEUE reports; past that they are dropped and counted.
  # - One thread of its own builds and hands them to the gem, whose own thread
  #   sends them. It runs below the world's priority and starts on the first
  #   report, so a quiet world never has it.
  # - Without GOODSORCERY_API_KEY (or in development and test) `report` is one
  #   memoized check and nothing else: no thread, no queue, nothing kept.
  module ErrorReports
    EVERY = 60.0
    QUEUE = 50
    # different sites and lines kept apart at most; past it the counts start over
    KEYS = 500
    # below the world's (World::WORLD_PRIORITY) and the request threads'
    PRIORITY = -1

    @lock = Mutex.new
    @last = {}       # key => [monotonic time of the last report, counted since]
    @queue = Queue.new
    @dropped = 0
    @pending = 0     # queued or being built (drain)
    @thread = nil
    @on = nil

    class << self
      # e: the rescued exception. where: the site, as the log line names it
      # ("zone caerdun", "action", "persist_jobs"). context: small values only;
      # they are kept until the report is built.
      def report(e, where, level: nil, **context)
        return unless on?
        # the raising line, from the locations: 5 us for a 70-frame stack where
        # the backtrace's strings cost 40 (a raise built with set_backtrace has
        # strings only)
        top = e.backtrace_locations&.first
        key = top ? [where, e.class, top.path, top.lineno] : [where, e.class, e.backtrace&.first]
        now = Vanai.now
        @lock.synchronize do
          @last.clear if @last.size >= KEYS && !@last.key?(key)
          seen = @last[key]
          if seen && now - seen[0] < EVERY
            seen[1] += 1
            return
          end
          @last[key] = [now, 0]
          if @queue.size >= QUEUE
            @dropped += 1
            return
          end
          @queue << [e, where, level, context.merge(suppressed: seen ? seen[1] : 0, dropped: @dropped)]
          @dropped = 0
          @pending += 1
          start unless @thread&.alive?
        end
      rescue StandardError
        nil # reporting never takes the world down
      end

      # Whether the gem would send anything at all, read once: the key and the
      # environment do not change while the process runs.
      def on?
        @on = GoodSorcery.client.reporting? if @on.nil?
        @on
      rescue StandardError
        @on = false
      end

      # Tests: wait until every queued report is built and handed to the gem.
      def drain(timeout = 2)
        deadline = Vanai.now + timeout
        sleep 0.005 until @pending.zero? || Vanai.now > deadline
      end

      # Tests: forget the switch, the counts and the queue.
      def reset!
        @lock.synchronize do
          @on = nil
          @last.clear
          @queue.clear
          @dropped = 0
          @pending = 0
        end
      end

      private

      def start
        @thread = Thread.new { run }
        @thread.priority = PRIORITY
        @thread.name = "vanai-error-reports"
      end

      def run
        loop do
          e, where, level, context = @queue.pop
          GoodSorcery.notify(e, context: { world: context.merge(where: where) }, tags: { world: where.split.first },
                                transaction: "World #{where}", level: level)
        rescue StandardError
          nil
        ensure
          @lock.synchronize { @pending -= 1 if @pending.positive? }
        end
      end
    end
  end
end
