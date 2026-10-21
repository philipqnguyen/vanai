module Vanai
  # A join's database reads, off the world thread (SERVER-PERF.md rule 7). A
  # join read the character's row, job, equipped pieces, journal and
  # discoveries on the world thread, 8-17 ms of it waiting on Postgres, so the
  # tick's 40 ms join budget let in three or four a tick and a 2000-player
  # reconnect took a couple of minutes. Here two threads build the PlayerState
  # from the rows; the world thread only installs it (World.install_join).
  #
  # Nothing here touches the world: a load reads rows and builds objects no
  # one else holds. Whether what it read is still true is the world's to
  # decide when it installs (World.join_load_current?): a character who joined
  # or left since, or whom a request changed, is read again on the world
  # thread, as every join was before.
  class JoinLoader
    THREADS = 2

    def initialize
      @requests = Queue.new
      @done = Queue.new
      @threads = []
    end

    # `ticket` is the world's record of the join; it comes back through
    # `finished` with ticket[:loaded] set (or ticket[:error]).
    def load(char_id, ticket)
      start
      @requests << [char_id, ticket]
    end

    # Every load finished since the last call, in the order they finished.
    def finished
      out = []
      loop { out << @done.pop(true) }
    rescue ThreadError
      out
    end

    private

    # a thread that died is replaced (the world thread calls this)
    def start
      THREADS.times do |i|
        next if @threads[i]&.alive?
        @threads[i] = Thread.new { run }.tap { |t| t.name = "vanai-join-#{i}" }
      end
    end

    def run
      loop do
        char_id, ticket = @requests.pop
        begin
          ticket[:loaded] = Rails.application.executor.wrap { read(char_id) }
        rescue => e
          ticket[:error] = e
          Rails.logger.error("[vanai] join load char=#{char_id}: #{e.class}: #{e.message}")
        ensure
          # whatever ends the read, the ticket goes back: one the world never
          # saw again would hold its character out, and its slot, for good
          # (with no :loaded the world reads the rows itself)
          @done << ticket
        end
      end
    end

    def read(char_id)
      ActiveRecord::Base.connection_pool.with_connection do
        char = Character.find_by(id: char_id)
        next { char: nil } unless char
        { char: char, ps: PlayerState.new(char) }
      end
    end
  end
end
