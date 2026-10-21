# The dev client is Vite on its own port, so its /api calls cross origins. In
# production the client is served by Rails itself (same origin), and allowing
# credentialed requests from localhost there would let any page a player opens
# on their own machine call the API as them.
if Rails.env.local?
  Rails.application.config.middleware.insert_before 0, Rack::Cors do
    allow do
      # VANAI_DEV_ORIGINS adds a worktree's or an audit agent's own client port in development
      extra = Rails.env.development? ? ENV.fetch("VANAI_DEV_ORIGINS", "").split(",").map(&:strip).reject(&:empty?) : []
      origins "http://localhost:5173", "http://127.0.0.1:5173", *extra
      resource "/api/*",
               headers: :any,
               methods: [:get, :post, :put, :patch, :delete, :options, :head],
               credentials: true
    end
  end
end
