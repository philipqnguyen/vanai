module Api
  class GameController < BaseController
    before_action :require_character!
    # Per character, and well past any hand at the bags or a merchant's
    # counter, a stack sold off one click a piece included: each of these asks
    # the world thread to read the character again, and a script posting them
    # in a loop held every zone's tick back.
    ACTIONS = 60
    ACTIONS_WINDOW = 10.seconds
    rate_limit to: ACTIONS, within: ACTIONS_WINDOW, only: %i[equip unequip vendor],
               by: -> { session[:character_id] }, with: :too_many_attempts

    EQUIP_SLOTS = %w[weapon head body legs feet ring].freeze

    def state
      c = current_character
      jr = c.job_record
      render json: {
        character: {
          id: c.id, name: c.name, race: c.race, appearance: c.appearance_payload, job: c.active_job, level: jr.level, xp: jr.xp,
          zone: c.zone, x: c.x, z: c.z, gold: c.gold, title: c.title, court: c.court,
          jobs: c.character_jobs.map { |j| { job: j.job, level: j.level, xp: j.xp } }
        },
        inventory: c.inventory_items.order(:id).map { |ii| inv_payload(ii) },
        quests: c.quest_progresses.map { |qp| { id: qp.quest_key, status: qp.status, progress: qp.progress, credited: qp.credited_targets || [] } },
        discoveries: c.discoveries.where.not("landmark_key LIKE 'milestone_%'").pluck(:landmark_key),
        abilities: Vanai::Data.abilities_for(c.active_job, jr.level).map { |id, a| a.merge("id" => id) },
        mail_unread: Vanai::Mail.unread_count(c.id)
      }
    end

    def equip
      c = current_character
      row = c.inventory_items.find_by(id: params[:inventory_item_id])
      return render json: { error: "No such item." }, status: :not_found unless row
      item = row.definition
      slot = item["slot"]
      return render json: { error: "That cannot be equipped." } unless EQUIP_SLOTS.include?(slot)
      refusal = equip_refusal(c, item)
      return render json: { error: refusal } if refusal

      worn = Character.transaction do
        # One equip at a time per character: two at once into the same slot
        # would each clear only what the other had not yet committed, and both
        # pieces would stay on.
        c.lock!
        # Judged again on the locked row: a job change committed since the
        # checks above has already unequipped what its job cannot use, and
        # would not see this piece go on after it.
        refusal = equip_refusal(c, item)
        next false if refusal
        row = c.inventory_items.lock.find_by(id: row.id)
        next false unless row
        c.inventory_items.where(equipped_slot: slot).update_all(equipped_slot: nil)
        row.update!(equipped_slot: slot)
        true
      end
      return render json: { error: refusal } if refusal
      return render json: { error: "No such item." }, status: :not_found unless worn
      Vanai::World.request_recompute(c.id)
      # an ordered relation is a fresh query: no reload first
      render json: { ok: true, inventory: c.inventory_items.order(:id).map { |ii| inv_payload(ii) } }
    end

    def unequip
      c = current_character
      slot = params[:slot].to_s
      # a slot that is none (or none at all, which matched every bag row and
      # rewrote each of them) is refused
      return render json: { error: "No such slot." }, status: :unprocessable_entity unless EQUIP_SLOTS.include?(slot)
      # nothing taken off, nothing for the world to read again
      taken = c.inventory_items.where(equipped_slot: slot).update_all(equipped_slot: nil)
      Vanai::World.request_recompute(c.id) if taken.positive?
      render json: { ok: true, inventory: c.inventory_items.order(:id).map { |ii| inv_payload(ii) } }
    end

    def vendor
      c = current_character
      zone = Vanai::Data.zones[c.zone]
      npc = (zone["npcs"] || []).find { |n| n["id"] == params[:npc_id] && n["kind"] == "vendor" }
      return render json: { error: "No merchant there." }, status: :not_found unless npc
      # The counter is where the merchant stands: same reach and same floor as
      # talking to them, judged by the world's own record of where you are.
      refusal = Vanai::World.npc_refusal_for(c.id, npc_id: npc["id"])
      return render json: { error: refusal }, status: :forbidden if refusal

      case params[:op]
      when "buy"
        key = params[:item_key]
        return render json: { error: "Not sold here." } unless npc["stock"].include?(key)
        item = Vanai::Data.items[key]
        price = item["price"].to_i
        return render json: { error: "Not for sale." } if price <= 0
        poor = false
        Character.transaction do
          c.lock! # Serialize with departure fares and direct trades.
          # Half price for the zone's controlling court, judged on the locked
          # row: a change of court committed since the request began pays full.
          price = Vanai::Courts::Benefits.vendor_price(c, c.zone, price)
          if c.gold < price
            poor = true
            raise ActiveRecord::Rollback
          end
          c.update!(gold: c.gold - price)
          # merged under the stack's lock, like a parcel or a cancelled listing
          Vanai::Mail.give!(c, [{ "item_key" => key, "qty" => 1 }])
        end
        return render json: { error: "Not enough gold." } if poor
      when "sell"
        row = c.inventory_items.find_by(id: params[:inventory_item_id], equipped_slot: nil)
        return render json: { error: "No such item." } unless row
        return render json: { error: "That relic is bound to you." } if row.named_relic_id
        item = row.definition
        value = item["price_sell"] || (item["price"].to_i * 0.25).round
        return render json: { error: "No one wants that." } if value <= 0
        sold = Character.transaction do
          c.lock!
          # Read again under the lock: the row above is only for the refusals.
          # A sell racing another sell, a listing or a parcel must find what
          # they left, or nothing, and be paid only for a piece still there.
          row = c.inventory_items.lock.find_by(id: row.id, equipped_slot: nil)
          next false unless row && row.qty.positive? && !row.named_relic_id
          c.update!(gold: c.gold + value)
          row.qty -= 1
          row.qty.zero? ? row.destroy! : row.save!
          true
        end
        return render json: { error: "No such item." } unless sold
      else
        return render json: { error: "Unknown operation." }
      end
      Vanai::World.request_recompute(c.id)
      render json: { ok: true, gold: c.reload.gold, inventory: c.inventory_items.order(:id).map { |ii| inv_payload(ii) } }
    end

    # The intro is watched before the world is joined, so it is reported seen
    # here rather than over the zone channel (World.cutscene_end, which every
    # scene filmed in a zone uses). Only a scene told in chapters, and only one
    # this character is owed or has already seen.
    def scene_seen
      c = current_character
      id = params[:id].to_s
      scene = Vanai::Data.cutscenes[id]
      return render json: { error: "No such scene." }, status: :not_found unless scene && scene["chapters"]
      due = "#{Vanai::Cutscenes::DUE}#{id}"
      seen = "#{Vanai::Cutscenes::SEEN}#{id}"
      keys = c.discoveries.where(landmark_key: [due, seen]).pluck(:landmark_key)
      return render json: { error: "That scene is not yours to watch." }, status: :forbidden if keys.empty?
      Character.transaction do
        c.discoveries.where(landmark_key: due).delete_all
        c.discoveries.find_or_create_by!(landmark_key: seen)
      end
      # a join being read now (a second tab, a refresh) is read again
      Vanai::World.touch(c.id)
      render json: { ok: true }
    rescue ActiveRecord::RecordNotUnique
      render json: { ok: true }
    end

    private

    # Why the character's active job may not put this on, or nil.
    def equip_refusal(c, item)
      unless Vanai::Data.eligible_jobs(item).include?(c.active_job)
        verb = item["slot"] == "weapon" ? "wield" : "wear"
        return "Your job cannot #{verb} that."
      end
      "You are not yet level #{item["lvl"]}." if item["lvl"].to_i > c.job_record.level
    end

    def inv_payload(ii)
      { id: ii.id, item_key: ii.item_key, qty: ii.qty, equipped_slot: ii.equipped_slot,
        named_relic: Vanai::Courts::Relics.inv_info(ii) }
    end
  end
end
