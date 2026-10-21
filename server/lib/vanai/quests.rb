require_relative "cutscenes"

module Vanai
  module Quests
    module_function

    # nil for a key quests.json no longer has: a journal row can outlive its
    # quest (the 2026-08-31 story pivot retired 155), and every reader below
    # passes such a row over rather than failing on it
    def quest(key) = Data.quests[key]

    def status(p, key)
      p.quests.dig(key, "status")
    end

    # A quest with a "job" belongs to that job's guild: it is offered,
    # progressed and handed in only while that job is the active one. Taking
    # up another job at a trainer pauses it rather than failing it, so the
    # quest waits in the journal until the character returns to the job.
    def job_ok?(p, key_or_quest)
      q = key_or_quest.is_a?(Hash) ? key_or_quest : quest(key_or_quest)
      return false unless q
      q["job"].nil? || q["job"] == p.job
    end

    def available?(p, key)
      q = quest(key)
      return false unless q
      return false unless job_ok?(p, q)
      return false if p.quests[key] # already active or complete
      return false if p.level < (q["min_lvl"] || 1) - 2 # allow slightly early pickup
      prereqs = Data.quest_prereq[key] || []
      prereqs.empty? || prereqs.any? { |pk| status(p, pk) == QuestProgress::COMPLETE }
    end

    def objective_met?(p, key)
      q = quest(key)
      return false unless q
      obj = q["objective"]
      case obj["type"]
      when "collect"
        # what is in the bags: consume_items never takes what is worn, so a
        # worn ring must not count toward the hand-in either
        have = World.db { InventoryItem.where(character_id: p.char_id, item_key: obj["targets"], equipped_slot: nil).sum(:qty) }
        have >= obj["count"]
      else
        (p.quests.dig(key, "progress") || 0) >= obj["count"]
      end
    end

    # Build the dialog payload for talking to an NPC.
    def talk(zone, p, npc)
      npc_id = npc["id"]
      payload = { t: "npc_dialog", npc: npc_id, name: npc["name"], title: npc["title"], lines: [], offers: [], turnins: [] }

      # 1. talk-objective quests that target this npc. A single-target errand
      # ("carry this to X") completes here, with X speaking the hand-in. A
      # multi-target round ("ask each elder for a verse") credits this NPC once
      # and completes back at the giver, like every other objective.
      p.quests.each do |key, st|
        next unless st["status"] == QuestProgress::ACTIVE
        q = quest(key)
        next unless q
        obj = q["objective"]
        next unless obj["type"] == "talk" && obj["targets"].include?(npc_id)
        next unless job_ok?(p, q)
        credited = (st["credited"] ||= [])
        next if credited.include?(npc_id)
        unless interaction_in_order?(p, key, npc_id)
          payload[:lines].concat(q["progress"])
          next
        end
        credited.replace(obj["targets"].take(st["progress"].to_i)) if obj["ordered"] && credited.empty?
        credited << npc_id
        st["progress"] = [st["progress"].to_i, credited.size].max
        World.db do
          QuestProgress.where(character_id: p.char_id, quest_key: key)
                       .update_all(progress: st["progress"], credited_targets: credited)
        end
        if obj["count"].to_i <= 1
          complete!(zone, p, key)
          payload[:lines].concat(q["complete"])
        else
          notify(p, key)
          payload[:lines].concat(Array(obj["lines"] && obj["lines"][npc_id]))
        end
      end

      # 2. turn-ins at the giver (a one-target talk errand is handed in where it lands)
      p.quests.each do |key, st|
        next unless st["status"] == QuestProgress::ACTIVE
        q = quest(key)
        next unless q && q["giver"] == npc_id && !(q["objective"]["type"] == "talk" && q["objective"]["count"].to_i <= 1)
        unless job_ok?(p, q)
          payload[:lines] << "Come back to me as a #{Data.jobs.dig(q["job"], "name") || q["job"]}. This is that guild's business."
          next
        end
        if objective_met?(p, key)
          payload[:turnins] << { id: key, name: q["name"] }
        else
          payload[:lines].concat(q["progress"])
        end
      end

      # 3. new offers
      Data.quests.each do |key, q|
        next unless q["giver"] == npc_id
        payload[:offers] << { id: key, name: q["name"], lines: q["offer"], level: q["min_lvl"] } if available?(p, key)
      end

      payload[:lines].concat(npc["dialog"] || []) if payload[:lines].empty? && payload[:offers].empty? && payload[:turnins].empty?
      payload[:lines] = ["..."] if payload[:lines].empty? && payload[:offers].empty? && payload[:turnins].empty?
      payload[:ferry] = World.ferry_status(p.char_id) if npc["ferry"]
      # the keeper of a gated portal (Warden Morrow) offers the way into its
      # empty city on top of whatever else she has to say; World.gate_enter
      # runs the party's consent
      payload[:gate] = true if npc["gate"] && World.gate_portal(zone.definition, npc)
      World.to_char(p.char_id, payload)
    end

    def accept!(zone, p, key)
      return unless available?(p, key)
      q = quest(key)
      obj = q["objective"]
      progress = 0
      if obj["type"] == "reach"
        # landmarks the character has already discovered still count, so a
        # quest can never stick on a place they previously stood
        found = World.db { Discovery.where(character_id: p.char_id, landmark_key: obj["targets"]).count }
        progress = [found, obj["count"]].min
      end
      World.db { QuestProgress.create!(character_id: p.char_id, quest_key: key, status: QuestProgress::ACTIVE, progress: progress) }
      p.quests[key] = { "status" => QuestProgress::ACTIVE, "progress" => progress, "credited" => [] }
      notify(p, key)
      World.to_char(p.char_id, t: "system", msg: "Quest accepted: #{q["name"]}.")
      Cutscenes.triggered("quest_accept", zone.key, quest: key).each { |id| World.cutscene_trigger(p, id) }
    end

    def complete!(zone, p, key)
      st = p.quests[key]
      return unless st && st["status"] == QuestProgress::ACTIVE && job_ok?(p, key) && objective_met?(p, key)
      q = quest(key)
      obj = q["objective"]
      # nothing is paid for items the bags no longer hold
      if obj["type"] == "collect"
        return if World.consume_items(p, obj["targets"], obj["count"]) < obj["count"]
      end
      st["status"] = QuestProgress::COMPLETE
      World.db { QuestProgress.where(character_id: p.char_id, quest_key: key).update_all(status: QuestProgress::COMPLETE) }
      r = q["rewards"] || {}
      World.grant_xp(zone, p, r["xp"].to_i, 0) if r["xp"]
      if r["gold"]
        p.gold += r["gold"]
        World.db { Character.where(id: p.char_id).update_all(["gold = gold + ?", r["gold"]]) }
      end
      (r["items"] || []).each { |ik| World.grant_item(p, ik, 1) }
      if r["title"]
        p.title = r["title"]
        World.db { Character.where(id: p.char_id).update_all(title: r["title"]) }
        World.to_char(p.char_id, t: "system", msg: "You have earned the title “#{r["title"]}”.")
      end
      Courts::Claims.on_quest(zone, p, key)
      notify(p, key)
      World.to_char(p.char_id, t: "quest_complete", id: key, name: q["name"],
                    rewards: { xp: r["xp"], gold: r["gold"], items: (r["items"] || []).map { |ik| Data.items[ik]["name"] } })
      zone.mark_self_dirty(p)
      Cutscenes.triggered("quest_complete", zone.key, quest: key).each { |id| World.cutscene_trigger(p, id) }
    end

    def on_kill(zone, p, monster_key)
      p.quests.each do |key, st|
        next unless st["status"] == QuestProgress::ACTIVE
        q = quest(key)
        next unless q
        obj = q["objective"]
        next unless job_ok?(p, q)
        next unless obj["type"] == "kill" && obj["targets"].include?(monster_key)
        next if st["progress"] >= obj["count"]
        st["progress"] += 1
        World.db { QuestProgress.where(character_id: p.char_id, quest_key: key).update_all(progress: st["progress"]) }
        notify(p, key)
      end
    end

    def interaction_in_order?(p, key, object_id)
      obj = quest(key)["objective"]
      return true unless obj["ordered"]
      st = p.quests[key]
      credited = st["credited"] || []
      return true if credited.include?(object_id)
      # Old saves may have only a progress count; preserve that completed prefix.
      prefix = credited.empty? ? obj["targets"].take(st["progress"].to_i) : []
      obj["targets"].find { |id| !credited.include?(id) && !prefix.include?(id) } == object_id
    end

    # interact objectives credit each distinct target once, so a repeat interact
    # with the same object never advances progress
    def on_interact(zone, p, object_id)
      p.quests.each do |key, st|
        next unless st["status"] == QuestProgress::ACTIVE
        q = quest(key)
        next unless q
        obj = q["objective"]
        next unless job_ok?(p, q)
        next unless obj["type"] == "interact" && obj["targets"].include?(object_id)
        credited = (st["credited"] ||= [])
        next if credited.include?(object_id) || !interaction_in_order?(p, key, object_id)
        credited.replace(obj["targets"].take(st["progress"].to_i)) if obj["ordered"] && credited.empty?
        credited << object_id
        # legacy rows predate credited_targets, so never let progress walk backwards
        st["progress"] = [st["progress"].to_i, credited.size].max
        World.db do
          QuestProgress.where(character_id: p.char_id, quest_key: key)
                       .update_all(progress: st["progress"], credited_targets: credited)
        end
        notify(p, key)
      end
    end

    # Unlike the other objectives, reach credit is not gated on the job: a
    # landmark is discovered once and World.discover never calls back here for
    # it again, so a guild quest skipped while paused could never be credited
    # afterwards. accept! already counts discoveries made under any job, so
    # this matches it; the hand-in is still the guild's alone (complete!).
    def on_discover(zone, p, landmark_id)
      p.quests.each do |key, st|
        next unless st["status"] == QuestProgress::ACTIVE
        q = quest(key)
        next unless q
        obj = q["objective"]
        next unless obj["type"] == "reach" && obj["targets"].include?(landmark_id)
        next if st["progress"] >= obj["count"]
        st["progress"] += 1
        World.db { QuestProgress.where(character_id: p.char_id, quest_key: key).update_all(progress: st["progress"]) }
        notify(p, key)
      end
    end

    def notify(p, key)
      q = quest(key)
      return unless q
      st = p.quests[key]
      World.to_char(p.char_id, t: "quest_update", id: key, name: q["name"],
                    status: st["status"], progress: st["progress"], credited: st["credited"] || [],
                    count: q["objective"]["count"], label: q["objective"]["label"])
    end
  end
end
