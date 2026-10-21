require Rails.root.join("lib/vanai/data")
require Rails.root.join("lib/vanai/entities")
require Rails.root.join("lib/vanai/combat")
require Rails.root.join("lib/vanai/quests")
require Rails.root.join("lib/vanai/cutscenes")
require Rails.root.join("lib/vanai/zone_state")
require Rails.root.join("lib/vanai/world")
require Rails.root.join("lib/vanai/courts")
require Rails.root.join("lib/vanai/market")
require Rails.root.join("lib/vanai/mail")

Vanai::Data.load!(Rails.root)

Rails.application.config.after_initialize do
  # The world lives in the web process's memory and must exist exactly once, so it
  # boots for the web server and nothing else. Everything else that loads the full
  # app — Sidekiq, `bin/rails console`, `bin/rails db:migrate`, rake tasks, the
  # assets:precompile run inside the Docker build — would otherwise spin up its own
  # divergent copy of the world, ticking monsters for the life of the command.
  #
  # Rails::Server is defined by the `server` command before the app initializes, so
  # it is a reliable "am I the web process?" flag. Both entry points go through it:
  # bin/dev in development, `bin/thrust ./bin/rails server` in production. If the app
  # is ever booted some other way — bare `puma -C config/puma.rb`, `rackup` — the
  # world will not boot, and that launcher needs to be taught about it here.
  next unless defined?(Rails::Server)
  # `bin/rails test` with no path runs the test:prepare lookup, which loads every
  # command and so defines Rails::Server too: never boot the world in a test run.
  next if Rails.env.test?
  # puma.rb pins `workers 0`, so the variable no longer forks anything. Say so
  # rather than let an operator believe they scaled the server.
  if ENV["WEB_CONCURRENCY"].to_i > 0
    Rails.logger.warn("WEB_CONCURRENCY=#{ENV["WEB_CONCURRENCY"]} is ignored: Vanai runs one process (DEPLOY.md)")
  end
  Vanai::World.boot!
end
