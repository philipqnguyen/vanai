module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user_id, :current_character_id

    def connect
      session = cookies.encrypted[Rails.application.config.session_options[:key]] || {}
      self.current_user_id = session["user_id"]
      self.current_character_id = session["character_id"]
      reject_unauthorized_connection unless current_user_id && current_character_id
      char = Character.find_by(id: current_character_id, user_id: current_user_id)
      reject_unauthorized_connection unless char
      # a ban outlives the session cookie it was earned under; signing out or a
      # new password replaces the token every older cookie carries
      reject_unauthorized_connection unless User.not_banned.exists?(id: current_user_id, session_token: session["token"].to_s)
    end

    # Writes a frame that is already JSON (Channel#stream_raw). ActionCable
    # keeps the socket private and offers only #transmit, which encodes a Hash;
    # #transmit itself writes to the same socket from any worker thread, so
    # this is as safe from the event loop's streamer threads as it is there.
    def transmit_raw(json) = websocket.transmit(json)

    # A move skips the worker pool. Every explorer walking sends ten a second,
    # and each went the way of any message: a task posted to the worker pool,
    # a hand-off to its thread, the executor and connection callbacks wrapped
    # round it, the subscription found, the debug line built and dropped, the
    # perform_action notification, about 25 us of the GVL the world thread
    # ticks with, 60% of it at 2000 walking (docs/SERVER-PERF.md rule 10).
    # Here, on the thread that read it, a move for a confirmed ZoneChannel
    # passes its bucket and is queued for the world in a third of that.
    # Anything else, or a move this cannot place, goes the usual way.
    #
    # Only while none of this connection's messages wait in the pool: the
    # pool takes them in the order they came, and under load it runs behind,
    # so a move going round it would reach the world before an interact or a
    # gather sent first, and walk them out of its reach.
    MOVE_MARK = '\"action\":\"move\"'

    def initialize(...)
      super
      @in_pool = Concurrent::AtomicFixnum.new
    end

    def receive(websocket_message)
      return pool(websocket_message) unless @in_pool.value.zero? &&
                                            websocket_message.is_a?(String) && websocket_message.include?(MOVE_MARK)
      payload = decode(websocket_message)
      channel = subscriptions.send(:subscriptions)[payload["identifier"]] if payload.is_a?(Hash) && payload["command"] == "message"
      return if channel.respond_to?(:fast_move) && channel.fast_move(ActiveSupport::JSON.decode(payload["data"].to_s))
      pool(websocket_message)
    rescue JSON::ParserError, TypeError
      pool(websocket_message)
    rescue => e
      logger.error("[vanai] fast move: #{e.class}: #{e.message}")
      Vanai::ErrorReports.report(e, "fast move")
    end

    def dispatch_websocket_message(websocket_message)
      super
    ensure
      @in_pool.decrement
    end

    private

    # ActionCable's own receive: a task for the pool, counted until it has run
    def pool(websocket_message)
      @in_pool.increment
      send_async :dispatch_websocket_message, websocket_message
    end
  end
end
