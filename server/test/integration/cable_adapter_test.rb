ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'

# Production's cable adapter (cable.yml `adapter: vanai`): the game's zone: and
# char: streams in process, ActionCable's own channels (a ban's remote
# disconnect) through Redis. Built here on a server of its own, as cable.yml
# names it, with Redis stood in for.
class CableAdapterTest < Minitest::Test
  class FakeRedis
    attr_reader :published

    def initialize = @published = []
    def publish(channel, payload) = @published << [channel, payload]
  end

  class FakeListener
    attr_reader :calls

    def initialize = @calls = []
    def add_subscriber(*args) = @calls << [:add, *args.first(1)]
    def remove_subscriber(*args) = @calls << [:remove, *args.first(1)]
  end

  def setup
    @redis = FakeRedis.new
    @connector = ActionCable::SubscriptionAdapter::Redis.redis_connector
    redis = @redis
    ActionCable::SubscriptionAdapter::Redis.redis_connector = ->(_config) { redis }
    config = ActionCable::Server::Configuration.new
    config.cable = { adapter: 'vanai', url: 'redis://redis.invalid:6379/0', channel_prefix: 'vanai_test' }.with_indifferent_access
    config.logger = ActiveSupport::Logger.new(nil)
    config.connection_class = -> { ApplicationCable::Connection }
    @server = ActionCable::Server::Base.new(config: config)
    @listener = FakeListener.new
    listener = @listener
    @server.pubsub.define_singleton_method(:listener) { listener }
  end

  def teardown
    ActionCable::SubscriptionAdapter::Redis.redis_connector = @connector
    @server.event_loop.stop
  end

  def wait_until(seconds = 2.0)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + seconds
    until yield
      return false if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
      sleep 0.005
    end
    true
  end

  def test_cable_yml_names_it_for_production
    cable = ActiveSupport::ConfigurationFile.parse(Rails.root.join('config/cable.yml'))
    assert_equal 'vanai', cable.dig('production', 'adapter')
    assert_equal Vanai::CableAdapter, @server.pubsub.class
    assert_operator Vanai::CableAdapter, :<, ActionCable::SubscriptionAdapter::Redis
  end

  def test_zone_and_char_broadcasts_stay_in_the_process
    got = Queue.new
    confirmed = Queue.new
    %w[zone:caerdun char:42].each do |name|
      @server.pubsub.subscribe(name, ->(msg) { got << [name, msg] }, -> { confirmed << name })
    end
    assert wait_until { confirmed.size == 2 }, 'subscribing confirms, as stream_from waits for'
    @server.broadcast('zone:caerdun', { t: 'pos', s: 1.5 })
    @server.broadcast('char:42', { t: 'self', hp: 10 })
    assert wait_until { got.size == 2 }
    assert_equal [['char:42', '{"t":"self","hp":10}'], ['zone:caerdun', '{"t":"pos","s":1.5}']],
                 Array.new(2) { got.pop }.sort
    assert_empty @redis.published, 'no PUBLISH for the game streams'
    assert_empty @listener.calls, 'and no Redis subscription'
  end

  def test_unsubscribing_in_process_stops_delivery
    got = []
    callback = ->(msg) { got << msg }
    confirmed = false
    @server.pubsub.subscribe('zone:caerdun', callback, -> { confirmed = true })
    assert wait_until { confirmed }
    @server.pubsub.unsubscribe('zone:caerdun', callback)
    @server.broadcast('zone:caerdun', { t: 'pos' })
    sleep 0.05
    assert_empty got
  end

  def test_a_ban_still_reaches_the_web_process_through_redis
    @server.remote_connections.where(current_user_id: 7, current_character_id: 9).disconnect
    assert_equal [['vanai_test:action_cable/7:9', '{"type":"disconnect","reconnect":true}']], @redis.published
  end

  def test_actioncables_own_channels_subscribe_through_redis
    callback = ->(_msg) {}
    @server.pubsub.subscribe('action_cable/7:9', callback)
    @server.pubsub.unsubscribe('action_cable/7:9', callback)
    assert_equal [[:add, 'vanai_test:action_cable/7:9'], [:remove, 'vanai_test:action_cable/7:9']], @listener.calls
  end

  def test_only_the_game_streams_are_local
    adapter = @server.pubsub
    assert adapter.local?('zone:caerdun')
    assert adapter.local?('char:1')
    refute adapter.local?('action_cable/1:2')
    refute adapter.local?('zones:x')
    refute adapter.local?('_action_cable_internal')
  end

  # The adapter is only right while the world is the one broadcaster: a
  # zone:/char: message from Sidekiq or a console would reach no one.
  def test_only_the_world_broadcasts
    root = Rails.root
    files = Dir[root.join('{app,lib,config}/**/*.{rb,rake}')].select { |f| File.read(f).include?('ActionCable.server.broadcast') }
    assert_equal ['lib/vanai/world.rb'], files.map { |f| Pathname(f).relative_path_from(root).to_s }
  end
end

# Every thread in the web process that queries has a connection waiting: the
# Puma threads, ActionCable's worker pool, the world thread, its position
# writer and its join loaders.
class DatabasePoolTest < Minitest::Test
  def test_the_production_pool_covers_every_thread
    prod = ActiveRecord::Base.configurations.configs_for(env_name: 'production').first
    pool = prod.configuration_hash[:max_connections] || prod.configuration_hash[:pool]
    puma = ENV.fetch('RAILS_MAX_THREADS', 5).to_i
    set = File.read(Rails.root.join('config/environments/production.rb'))[/^\s*config\.action_cable\.worker_pool_size\s*=\s*(\d+)/, 1]
    cable = set ? set.to_i : ActionCable::Server::Configuration.new.worker_pool_size
    assert_operator pool.to_i, :>=, puma + cable + 1 + 1 + Vanai::JoinLoader::THREADS
  end
end
