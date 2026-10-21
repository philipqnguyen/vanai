redis_options = { url: ENV.fetch("REDIS_SIDEKIQ_URL", "redis://localhost:6379/0") }

Sidekiq.configure_server do |config|
  config.redis = redis_options
end

Sidekiq.configure_client do |config|
  config.redis = redis_options
end
