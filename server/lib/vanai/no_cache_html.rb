module Vanai
  # The static file server applies one far-future cache-control header to
  # everything under public/ (see config/environments/production.rb). That is
  # correct for the client bundles Vite fingerprints into /client/, but wrong for
  # public/index.html, which is the app shell and keeps the same URL forever. Left
  # alone, a returning player would hold a year-old shell pointing at hashed
  # bundles that no longer exist after a deploy. Revalidate HTML every time.
  class NoCacheHtml
    def initialize(app)
      @app = app
    end

    def call(env)
      status, headers, body = @app.call(env)
      headers["cache-control"] = "no-cache" if headers["content-type"].to_s.start_with?("text/html")
      [ status, headers, body ]
    end
  end
end
