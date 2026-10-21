module Api
  class CharactersController < BaseController
    before_action :require_user!
    # Per account, on top of Character::MAX_PER_USER: a name is reserved for
    # good the moment it is made, so making them is not a loop. Room for a few
    # names already taken on the way to one that is free.
    CREATE_ATTEMPTS = 10
    CREATE_WINDOW = 10.minutes
    rate_limit to: CREATE_ATTEMPTS, within: CREATE_WINDOW, only: :create, by: -> { session[:user_id] },
               with: :too_many_attempts

    def index
      chars = current_user.characters.includes(:character_jobs).map { |c| char_payload(c) }
      render json: { characters: chars }
    end

    def create
      char = current_user.with_lock do
        # counted under the account's lock, so two at once cannot both take
        # the last place
        next if current_user.characters.count >= Character::MAX_PER_USER
        Character.provision!(
          user: current_user,
          name: params[:name].to_s.strip,
          race: params.fetch(:race, "aedri").to_s,
          job: params[:job].to_s,
          city: params[:city].to_s,
          appearance: appearance_params
        )
      end
      unless char
        return render json: { error: "This account already has #{Character::MAX_PER_USER} characters." },
                      status: :unprocessable_entity
      end
      render json: { ok: true, character: char_payload(char) }
    rescue ActiveRecord::RecordInvalid => e
      render json: { error: e.record.errors.full_messages.first }, status: :unprocessable_entity
    rescue ActiveRecord::RecordNotUnique => e
      # two sign-ups for one name at once: the index refuses the second. Any
      # other index is a bug, not a taken name.
      raise unless e.message.include?("index_characters_on_lower_name")
      render json: { error: "Name is already taken" }, status: :unprocessable_entity
    end

    def select
      char = current_user.characters.find_by(id: params[:id])
      return render json: { error: "No such character." }, status: :not_found unless char
      session[:character_id] = char.id
      render json: { ok: true, character: char_payload(char) }
    end

    private

    def appearance_params
      value = params.fetch(:appearance, {})
      value.is_a?(ActionController::Parameters) ? value.to_unsafe_h : value
    end

    def char_payload(c)
      {
        id: c.id, name: c.name, race: c.race, appearance: c.appearance_payload, job: c.active_job, zone: c.zone,
        title: c.title, gold: c.gold,
        jobs: c.character_jobs.map { |j| { job: j.job, level: j.level, xp: j.xp } }
      }
    end
  end
end
