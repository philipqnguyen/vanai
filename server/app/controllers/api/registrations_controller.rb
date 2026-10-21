module Api
  class RegistrationsController < BaseController
    rate_limit to: AUTH_ATTEMPTS, within: AUTH_WINDOW, only: :create, with: :too_many_attempts

    def create
      user = User.new(email: params[:email].to_s.strip, password: params[:password])
      if save(user)
        sign_in(user)
        render json: { ok: true, user: { id: user.id, email: user.email } }
      else
        render json: { error: user.errors.full_messages.first }, status: :unprocessable_entity
      end
    end

    private

    # Two sign-ups for one address at once both pass the uniqueness check; the
    # lower(email) index turns the second away, as the same validation error.
    def save(user)
      user.save
    rescue ActiveRecord::RecordNotUnique
      user.errors.add(:email, :taken)
      false
    end
  end
end
