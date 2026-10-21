module Api
  class BaseController < ActionController::Base
    protect_from_forgery with: :null_session
    skip_before_action :verify_authenticity_token
    # What stands in for the token: a write must be JSON. A form, or a no-cors
    # fetch, from another page on the same site still carries the SameSite
    # cookie; a cross-origin JSON request needs a CORS preflight, which
    # production never grants (config/initializers/cors.rb). The client always
    # sends JSON (net.ts `api`).
    before_action :require_json
    # A named relic's row is bound (InventoryItem): any path that tries to move
    # it, the auction's listing included, gets a refusal rather than a 500.
    rescue_from("Vanai::Courts::Relics::Bound") { |e| render json: { error: e.message }, status: :unprocessable_entity }

    # Sign-in and sign-up, per address: enough for typos and a second try,
    # too few for guessing passwords or minting accounts.
    AUTH_ATTEMPTS = 10
    AUTH_WINDOW = 3.minutes
    # Sign-in, per account, however many addresses the guesses come from.
    AUTH_ATTEMPTS_PER_EMAIL = 20
    AUTH_EMAIL_WINDOW = 1.hour

    private

    # A banned account's session, still in its cookie, signs nobody in; nor
    # does one whose token was replaced (signed out, a new password).
    def current_user
      @current_user ||= User.not_banned.find_by(id: session[:user_id], session_token: session[:token].to_s) if session[:user_id]
    end

    # A fresh session for whoever just signed in or up, so nothing of the
    # cookie they arrived with carries over.
    def sign_in(user)
      reset_session
      session[:user_id] = user.id
      session[:token] = user.session_token
    end

    def require_json
      head :unsupported_media_type unless request.get? || request.head? || request.media_type == "application/json"
    end

    # rate_limit's answer, in the JSON shape the client shows (net.ts `api`)
    def too_many_attempts
      render json: { error: "Too many attempts. Wait a few minutes and try again." }, status: :too_many_requests
    end

    def current_character
      @current_character ||= current_user&.characters&.find_by(id: session[:character_id]) if session[:character_id]
    end

    def require_user!
      render json: { error: "Not signed in." }, status: :unauthorized unless current_user
    end

    def require_character!
      require_user!
      return if performed?
      render json: { error: "No character selected." }, status: :unauthorized unless current_character
    end
  end
end
