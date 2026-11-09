# frozen_string_literal: true

# Good Sorcery error reporting. Every setting is optional; the defaults are
# shown. See https://app.goodsorcery.com and the goodsorcery README.
GoodSorcery.configure do |config|
  # --- Credentials -----------------------------------------------------------
  # Looked up in ENV["GOODSORCERY_API_KEY"], then in Rails credentials
  # (goodsorcery.api_key). Use one key per environment. Never commit it.
  config.api_key = ENV["GOODSORCERY_API_KEY"]

  # --- Environments ----------------------------------------------------------
  # config.environment = Rails.env                       # or ENV["GOODSORCERY_ENV"]
  # config.disabled_environments = %w[development test]
  # config.enabled_environments = %w[production staging] # allow-list instead
  # config.enabled = true                                # hard override; or GOODSORCERY_ENABLED=1/0

  # --- Filtering -------------------------------------------------------------
  # Strings/symbols match whole keys (case-insensitive, "-" and "_" equal);
  # regexps match any part of a key. Rails' filter_parameters apply too.
  # config.filter_params += %i[card_token ssn]
  # config.filter_params += [/_key\z/i]
  # config.use_rails_filter_parameters = true
  # config.send_request_params = true
  # config.send_request_headers = true
  # config.send_session = true
  # config.send_job_arguments = true                     # false = never send job arguments

  # --- Delivery --------------------------------------------------------------
  # config.delivery = :async                             # :sync (serverless, e.g. AWS Lambda) or :test
  # config.batch_size = 25
  # config.flush_interval = 2.0
  # config.max_queue_size = 1_000
  # config.max_retries = 3
  # config.shutdown_timeout = 5
  # config.open_timeout = 2
  # config.read_timeout = 5

  # --- What gets reported ----------------------------------------------------
  # config.release = ENV["GIT_SHA"]                      # auto-detected from deploy env vars or REVISION
  # config.ignore_exceptions += ["MyApp::NotFound"]      # class names; subclasses too
  # Errors from the ingest path itself (the events endpoints and the job that
  # processes what they accept) are dropped: reporting them would send more
  # events to the path that is failing, and could loop while it struggles.
  # ingest_url = %r{\Ahttps?://[^/]+/api/v1/events(?:[/?]|\z)}
  # config.before_send = lambda do |event|
  #   next nil if event.dig("request", "url").to_s.match?(ingest_url)
  #   next nil if event["transaction"] == "ProcessInboundEventJob"

  #   event
  # end
  # config.tags = { region: "eu" }
  # config.user_method = :current_user                   # controller method that returns the user
  # config.report_handled_errors = true                  # Rails.error.handle / report
  # config.send_code_context = true
  # config.breadcrumbs = true
  # config.max_breadcrumbs = 40

  # --- Performance monitoring (APM) -------------------------------------------
  # On unless GOODSORCERY_PERFORMANCE_MONITORING is 0/false/no/off. The guard
  # keeps boot working on gem versions before APM (0.1.x); drop it once the
  # Gemfile requires a release with performance monitoring.

  config.performance_monitoring =
    !%w[0 false no off].include?(ENV.fetch("GOODSORCERY_PERFORMANCE_MONITORING", "true").strip.downcase)


  # --- Development -----------------------------------------------------------
  # config.install_check = :verify                       # after bundle install: :verify, :test_event or false
  # config.logger = Rails.logger
end
