module Api
  class SessionsController < BaseController
    rate_limit to: AUTH_ATTEMPTS, within: AUTH_WINDOW, only: :create, with: :too_many_attempts
    # Per account too, for guesses spread over many addresses. Generous, since
    # anyone who knows an address can spend it and lock its owner out a while.
    rate_limit to: AUTH_ATTEMPTS_PER_EMAIL, within: AUTH_EMAIL_WINDOW, only: :create, with: :too_many_attempts,
               by: -> { params[:email].to_s.downcase.strip.first(254) }, name: "per-email"

    def create
      user = User.find_by_email(params[:email])
      user = nil unless user&.authenticate(params[:password].to_s)
      # only the right password learns that the account is banned
      if user&.banned?
        render json: { error: "This account has been banned." }, status: :forbidden
      elsif user
        sign_in(user)
        render json: { ok: true, user: { id: user.id, email: user.email } }
      else
        render json: { error: "Wrong email or password." }, status: :unauthorized
      end
    end

    # Every copy of this session ends, not just this browser's.
    def destroy
      current_user&.sign_out_everywhere!
      reset_session
      render json: { ok: true }
    end

    def me
      if current_user
        render json: {
          user: { id: current_user.id, email: current_user.email },
          character_id: session[:character_id]
        }
      else
        render json: { user: nil }
      end
    end
  end
end
