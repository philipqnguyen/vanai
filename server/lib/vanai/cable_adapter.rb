require "action_cable/subscription_adapter/redis"
require "action_cable/subscription_adapter/async"

module Vanai
  # Production's cable adapter (cable.yml `adapter: vanai`, loaded through
  # lib/action_cable/subscription_adapter/vanai.rb): the game's own streams in
  # process, everything else through Redis.
  #
  # Every zone:/char: broadcast comes from the world thread (World.broadcast_zone
  # and World.to_char), and the world lives in this one process (DEPLOY.md), so
  # they never needed to leave it. Through Redis each one was a PUBLISH round
  # trip on the world thread, a GVL hand-off behind the cable's own work, and
  # the listener's CPU to read it back: 130 us of wall time and as much CPU a
  # publish measured locally, 20-50 ms a tick at a few hundred players. In
  # process they cost what the async adapter costs: a post to the event loop
  # per subscriber.
  #
  # ActionCable's own channels stay on Redis: remote_connections broadcasts on
  # action_cable/<connection identifier>, and that is how `accounts:ban`, a
  # password change and signing out everywhere (User#disconnect!) close the
  # sockets of the web process from another one. The price is that a zone:/char:
  # broadcast from any other process (Sidekiq, a console) reaches no one; none
  # does today, and none may.
  class CableAdapter < ActionCable::SubscriptionAdapter::Redis
    LOCAL = %w[zone: char:].freeze

    # ChannelPrefix is prepended to Redis, so these run before it and see the
    # names as the game wrote them; only what goes on to `super` is prefixed.
    def broadcast(channel, payload)
      local?(channel) ? local_map.broadcast(channel, payload) : super
    end

    def subscribe(channel, callback, success_callback = nil)
      local?(channel) ? local_map.add_subscriber(channel, callback, success_callback) : super
    end

    def unsubscribe(channel, callback)
      local?(channel) ? local_map.remove_subscriber(channel, callback) : super
    end

    def local?(channel) = channel.start_with?(*LOCAL)

    private

    # The async adapter's map: subscribing and every delivery are posted to the
    # event loop's streamer pool, as Redis's listener posts them, so
    # stream_from's deferred confirmation still fires and the world thread only
    # queues a task per subscriber.
    def local_map
      @local_map || @server.mutex.synchronize do
        @local_map ||= ActionCable::SubscriptionAdapter::Async::AsyncSubscriberMap.new(@server.event_loop)
      end
    end
  end
end
