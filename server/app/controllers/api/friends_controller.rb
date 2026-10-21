module Api
  class FriendsController < BaseController
    before_action :require_character!

    # the most names one friends list holds
    MAX_FRIENDS = 100

    # GET /api/friends
    def index
      friends = Friendship.where(character_id: current_character.id).order(:friend_name).pluck(:friend_name)
      co = current_character.company_id && Company.find_by(id: current_character.company_id)
      members = co ? Character.where(company_id: co.id).order(:name).pluck(:name) : []
      # presence for these names alone, read off the world's name index: the
      # map of everyone abroad cost O(online) a request to use a hundred
      presence = Vanai::World.presence_for(friends + members)
      # The roster is every member, which the Company window pages through
      # itself (hud.ts renderCompany); a member is a name and their presence.
      company = co && { name: co.name, members: members.map { |n| presence_payload(presence, n) } }
      render json: { friends: friends.map { |n| presence_payload(presence, n) }, company: company }
    end

    # POST /api/friends { name, op } — op "add" or "remove" from the menus,
    # which name the one they mean; with no op (/friend Name) it toggles
    def create
      name = params[:name].to_s.strip[0, 24]
      op = params[:op].to_s
      return render json: { error: "Who?" }, status: :unprocessable_entity if name.empty?
      return render json: { error: "That would be yourself." }, status: :unprocessable_entity if name.casecmp?(current_character.name)
      existing = Friendship.where(character_id: current_character.id).find_by("LOWER(friend_name) = ?", name.downcase)
      if existing && op != "add"
        existing.destroy!
        render json: { ok: true, removed: existing.friend_name }
      elsif existing
        render json: { ok: true, added: existing.friend_name, already: true }
      elsif op == "remove"
        render json: { error: "#{name} is not among your friends." }, status: :unprocessable_entity
      elsif Friendship.where(character_id: current_character.id).count >= MAX_FRIENDS
        render json: { error: "Your friends list is full (#{MAX_FRIENDS}). Remove someone first." }, status: :unprocessable_entity
      else
        target = Character.find_by("LOWER(name) = ?", name.downcase)
        return render json: { error: "No one by that name walks Ardenfell." }, status: :unprocessable_entity unless target
        full = Character.transaction do
          # Counted under the character's lock: parallel adds of different
          # names would each see room and together go past the cap.
          current_character.lock!
          next true if Friendship.where(character_id: current_character.id).count >= MAX_FRIENDS
          Friendship.create!(character_id: current_character.id, friend_name: target.name)
          false
        end
        if full
          render json: { error: "Your friends list is full (#{MAX_FRIENDS}). Remove someone first." }, status: :unprocessable_entity
        else
          render json: { ok: true, added: target.name }
        end
      end
    rescue ActiveRecord::RecordNotUnique => e
      # the same name added twice at once: the index keeps one. Any other
      # index is a bug, not a friend already listed.
      raise unless e.message.include?("index_friendships_on_character_id_and_friend_name")
      render json: { error: "#{target&.name || name} is already among your friends." }, status: :unprocessable_entity
    end

    private

    def presence_payload(presence, name)
      { name: name }.merge(presence[name.downcase] || { online: false })
    end
  end
end
