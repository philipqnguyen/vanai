module ApplicationCable
  class Channel < ActionCable::Channel::Base
    # ActionCable calls these; a client must never name them as an action. A
    # channel's own public `subscribed` is otherwise an action like any other
    # ({"action":"subscribed"} runs it again: one more join and one more pair
    # of streams per message), and so are `unsubscribed` and an overridden
    # `perform_action`.
    LIFECYCLE = %w[subscribed unsubscribed perform_action].freeze

    # Asked on every message (processable_action?): kept, as Rails keeps its
    # own, rather than a new Set each time. Rails forgets its own when a method
    # is added; so does this.
    def self.action_methods = (@vanai_action_methods ||= super - LIFECYCLE)

    def self.clear_action_methods!
      super
      @vanai_action_methods = nil
    end

    private

    # Streams a broadcasting to this subscription's client as it was published,
    # behind `gate` when one is given (asked per message; false drops it).
    #
    # The world encodes each payload once (Server::Broadcasting). The stock
    # handler then decoded it and Connection#transmit encoded it again, once
    # per subscriber, each in a worker-pool job of its own: with 200 players in
    # one zone the 4 Hz pos cost ~170 us a delivery, all of it holding the GVL
    # the world thread ticks with. Spliced into the envelope #transmit would
    # have built, the frame is the same bytes (the payload's own
    # ActiveSupport::JSON encoding; the identifier encoded the same way), and it
    # is written on the thread the adapter hands the message over on, with no
    # second hop to the worker pool and no executor wrap: the handler touches no
    # database and no reloadable code. What goes with them is the
    # transmit.action_cable notification and its debug log line, which nothing
    # here reads.
    def stream_raw(broadcasting, &gate)
      raw_streams << broadcasting
      stream_from broadcasting, raw_transmitter(broadcasting, gate)
    end

    def raw_transmitter(broadcasting, gate = nil)
      head = %({"identifier":#{ActiveSupport::JSON.encode(identifier)},"message":)
      lambda do |raw|
        next if gate && !gate.call
        # a Redis reply can come back binary; the frame is text
        raw = raw.dup.force_encoding(Encoding::UTF_8) unless raw.encoding == Encoding::UTF_8
        if connection.respond_to?(:transmit_raw)
          connection.transmit_raw("#{head}#{raw}}")
        else
          # ActionCable::Channel::TestCase's connection stub has no socket and
          # records Hashes
          transmit ActiveSupport::JSON.decode(raw), via: "streamed from #{broadcasting}"
        end
      rescue => e
        # The adapter's thread pool would swallow it without a word; the one
        # message is lost either way, so at least say so.
        logger.error("#{self.class.name} could not stream from #{broadcasting}: #{e.class}: #{e.message}")
      end
    end

    # stream_raw's handlers run on the thread the adapter delivers on, not as
    # a worker-pool job: the event loop's streamer pool (StreamEventLoop#post)
    # for every adapter ActionCable ships but Inline, which would run them on
    # the broadcasting thread.
    def worker_pool_stream_handler(broadcasting, user_handler, coder: nil)
      raw_streams.include?(broadcasting) ? stream_handler(broadcasting, user_handler, coder: coder) : super
    end

    def raw_streams
      @raw_streams ||= Set.new
    end
  end
end
