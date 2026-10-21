module Api
  class CraftController < BaseController
    before_action :require_character!
    # Per character, well past any hand at the bench: a craft is locked rows
    # and writes, and a loop of them is a script (GameController::ACTIONS).
    CRAFTS = 30
    CRAFTS_WINDOW = 10.seconds
    rate_limit to: CRAFTS, within: CRAFTS_WINDOW, only: :create, by: -> { session[:character_id] }, with: :too_many_attempts

    # POST /api/craft { recipe_id }
    def create
      recipe = find_recipe(params[:recipe_id].to_s)
      return render json: { error: "Unknown recipe." }, status: :unprocessable_entity unless recipe
      c = current_character
      out_key = recipe["output"]
      short = nil
      # Counted and taken under the character's lock, from rows read under
      # theirs: two crafts at once from one set of materials make one thing,
      # and the second is told what it lacks.
      ActiveRecord::Base.transaction do
        c.lock!
        recipe["inputs"].each do |key, qty|
          rows = c.inventory_items.where(item_key: key, equipped_slot: nil).order(:id).lock.to_a
          have = rows.sum(&:qty)
          if have < qty
            short = [key, qty, have]
            raise ActiveRecord::Rollback
          end
          remaining = qty
          rows.each do |row|
            break if remaining <= 0
            take = [row.qty, remaining].min
            row.qty -= take
            remaining -= take
            row.qty.zero? ? row.destroy! : row.save!
          end
        end
        Vanai::Mail.give!(c, [{ "item_key" => out_key, "qty" => 1 }])
      end
      if short
        key, qty, have = short
        item = Vanai::Data.items[key]
        return render json: { error: "You need #{qty}× #{item ? item["name"] : key} (have #{have})." },
                      status: :unprocessable_entity
      end
      out_name = Vanai::Data.items[out_key]&.dig("name") || out_key
      render json: { ok: true, crafted: out_name,
                     inventory: c.inventory_items.order(:id).map { |ii| inv_payload(ii) } }
    end

    private

    def find_recipe(id)
      Vanai::Data.recipes.each_value do |craft|
        (craft["recipes"] || []).each { |r| return r if r["id"] == id }
      end
      nil
    end

    # the same rows as GameController's: the client replaces its bags with
    # these, and a relic without its record shows as tradeable and unbound
    def inv_payload(ii)
      { id: ii.id, item_key: ii.item_key, qty: ii.qty, equipped_slot: ii.equipped_slot,
        named_relic: Vanai::Courts::Relics.inv_info(ii) }
    end
  end
end
