require "active_support/core_ext/integer/time"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Turn on fragment caching in view templates.
  config.action_controller.perform_caching = true

  # Cache assets for far-future expiry since they are all digest stamped. The one
  # exception is the client's public/index.html shell, which keeps a stable URL —
  # NoCacheHtml walks that header back for HTML responses only.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }
  require Rails.root.join("lib/vanai/no_cache_html")
  config.middleware.insert_before 0, Vanai::NoCacheHtml

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Store uploaded files on the local file system (see config/storage.yml for options).
  config.active_storage.service = :local

  # Behind kamal-proxy or a Cloudflare tunnel, TLS ends before the app: assume it,
  # force it, send HSTS and Secure cookies. VANAI_FORCE_SSL=false is for plain
  # HTTP, e.g. a LAN game night (DEPLOY.md), where a Secure session cookie would
  # be dropped and no login would stick.
  ssl = ENV.fetch("VANAI_FORCE_SSL", "true") != "false"
  config.assume_ssl = ssl
  config.force_ssl = ssl

  # WebSocket origin allowlist: APP_ORIGIN is the public URL of the game, or several
  # separated by commas (https://play.vanai.example,https://vanai.example). Empty,
  # every handshake is rejected and all realtime play stops, so say so at boot.
  origins = ENV.fetch("APP_ORIGIN", "").split(",").map(&:strip).reject(&:empty?)
  config.action_cable.allowed_request_origins = origins
  config.after_initialize do
    Rails.logger.warn("APP_ORIGIN is not set: every WebSocket handshake will be rejected (DEPLOY.md)") if origins.empty?
  end

  # DNS rebinding protection: only the game's own hostnames, read off APP_ORIGIN.
  # With no APP_ORIGIN the game is already broken (above), and an empty list here
  # would let every Host through, so nothing is lost. kamal-proxy's health check
  # asks for /up without the public hostname.
  hosts = origins.filter_map { |o| URI.parse(o).host rescue nil }
  config.hosts.concat(hosts) if hosts.any?
  config.host_authorization = { exclude: ->(request) { request.path == "/up" } }

  # Skip http-to-https redirect for the default health check endpoint.
  # config.ssl_options = { redirect: { exclude: ->(request) { request.path == "/up" } } }

  # Log to STDOUT with the current request id as a default log tag.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)

  # Change to "debug" to log everything (including potentially personally-identifiable information!).
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Replace the default in-process memory cache store with Redis. The cache Redis
  # runs allkeys-lru with no persistence, so treat a miss — or an outage — as
  # non-fatal and keep serving requests.
  config.cache_store = :redis_cache_store, {
    url: ENV["REDIS_CACHE_URL"],
    namespace: "vanai:cache",
    connect_timeout: 1,
    read_timeout: 0.2,
    write_timeout: 0.2,
    reconnect_attempts: 1,
    error_handler: ->(method:, returning:, exception:) {
      Rails.logger.error("[cache] #{method} failed: #{exception.class}: #{exception.message}")
    }
  }

  # Replace the default in-process and non-durable queuing backend for Active Job.
  config.active_job.queue_adapter = :sidekiq

  # Ignore bad email addresses and do not raise email delivery errors.
  # Set this to true and configure the email server for immediate delivery to raise delivery errors.
  # config.action_mailer.raise_delivery_errors = false

  # Set host to be used by links generated in mailer templates.
  config.action_mailer.default_url_options = { host: "example.com" }

  # Specify outgoing SMTP server. Secrets come from the environment (.env.production).
  # config.action_mailer.smtp_settings = {
  #   user_name: ENV["SMTP_USER_NAME"],
  #   password: ENV["SMTP_PASSWORD"],
  #   address: "smtp.example.com",
  #   port: 587,
  #   authentication: :plain
  # }

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]
end
