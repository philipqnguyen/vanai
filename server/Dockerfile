# syntax=docker/dockerfile:1
# check=error=true

# This Dockerfile is designed for production, not development. It is built from the
# REPOSITORY ROOT, not from server/, because the image needs three trees:
#   server/  - the Rails app
#   client/  - the Vite/Babylon client, built here and served from Rails public/
#   shared/  - the JSON game data both sides read (see lib/vanai/data.rb)
# Kamal handles this via `builder: context: ..` in config/deploy.yml. By hand:
#   docker build -f server/Dockerfile --build-arg VITE_ASSET_BASE=/runtime -t vanai .

# Make sure RUBY_VERSION matches the Ruby version in .ruby-version
ARG RUBY_VERSION=4.0.6
ARG NODE_VERSION=25.9.0


# Build the game client. Emits fingerprinted JS/CSS into dist/client/ plus the
# verbatim contents of client/public/ (models, textures) at the dist root.
FROM docker.io/library/node:$NODE_VERSION-slim AS client

WORKDIR /build

COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci

COPY client ./client
# The client aliases "@data" to ../shared/data, so the layout here must mirror the repo.
COPY shared ./shared
# vite.config.ts imports it; runtimeRoot() itself runs only in the dev/preview
# servers, so the build needs no VANAI_RUNTIME.
COPY scripts/runtime-root.mjs ./scripts/runtime-root.mjs

# The maker's assets (client/src/asset-index.json) are not in this image, and the
# client is built against where they are served: a bucket or CDN URL, or /runtime
# for the same-origin volume (DEPLOY.md "The maker's assets"). No default: one would
# point every player of every copy at somebody else's server.
ARG VITE_ASSET_BASE
ENV VITE_ASSET_BASE=$VITE_ASSET_BASE
RUN test -n "$VITE_ASSET_BASE" || { echo "Set --build-arg VITE_ASSET_BASE: a bucket URL or /runtime (DEPLOY.md \"The maker's assets\")" >&2; exit 1; }

RUN cd client && npm run build


FROM docker.io/library/ruby:$RUBY_VERSION-slim AS base

# Rails app lives here
WORKDIR /rails

# Install base packages
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl libjemalloc2 libvips postgresql-client && \
    ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Set production environment variables and enable jemalloc for reduced memory usage and latency.
ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so"

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build gems
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git libpq-dev libvips libyaml-dev pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Install application gems
COPY server/vendor/* ./vendor/
COPY server/Gemfile server/Gemfile.lock ./

RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    # -j 1 disable parallel compilation to avoid a QEMU bug: https://github.com/rails/bootsnap/issues/495
    bundle exec bootsnap precompile -j 1 --gemfile

# Copy application code
COPY server .

# Shared game data. lib/vanai/data.rb resolves it as ../shared/data relative to
# Rails.root, so with WORKDIR /rails it must live at /shared — and it must be in
# place before assets:precompile below, which boots the app and loads it.
COPY shared /shared

# The built client becomes Rails' static root: index.html at /, hashed bundles
# under /client/, models and textures at the paths the client already requests.
COPY --from=client /build/client/dist/. ./public/

# Precompile bootsnap code for faster boot times.
# -j 1 disable parallel compilation to avoid a QEMU bug: https://github.com/rails/bootsnap/issues/495
RUN bundle exec bootsnap precompile -j 1 app/ lib/

# Precompiling assets needs a secret key base, not the real one
RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile




# Final stage for app image
FROM base

# Run and own only the runtime files as a non-root user for security
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash
USER 1000:1000

# Copy built artifacts: gems, application, shared game data
COPY --chown=rails:rails --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --chown=rails:rails --from=build /rails /rails
COPY --chown=rails:rails --from=build /shared /shared

# Entrypoint prepares the database.
ENTRYPOINT ["/rails/bin/docker-entrypoint"]

# Start server via Thruster by default, this can be overwritten at runtime
EXPOSE 80
CMD ["./bin/thrust", "./bin/rails", "server"]
