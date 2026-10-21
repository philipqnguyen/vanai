module Vanai
  module Combat
    # Reach to a monster is measured to its edge (MonsterState#edge_dist_to,
    # its radius_m). 2.8 keeps the median monster (0.6 m) reached exactly
    # where centre-to-centre 3.4 reached it before the bestiary's sizes; a hare
    # is closed on, a 6 m boss fought at its flank. hotbar_state.ts mirrors it.
    # (2.7 against a median of 0.7 until round 2 measured footprints without
    # held props: a sentinel's bill is not its body.)
    MELEE_RANGE = 2.8
    SPELL_RANGE = 30.0
    GCD = 1.2
    SC_WINDOW = 8.0
    BURST_WINDOW = 6.0
    SC_TRANSITIONS = {
      %w[steel shadow]    => { "name" => "Umbral Rend",   "element" => "shadow" },
      %w[shadow radiance] => { "name" => "Dawnbreak",     "element" => "radiance" },
      %w[radiance steel] => { "name" => "Tempered Edge", "element" => "steel" }
    }.freeze

    module_function

    def rng = @rng ||= Random.new

    def variance = 0.88 + rng.rand * 0.24

    def hit?(att_agi, def_agi, evade_bonus = 0.0)
      chance = (0.90 + (att_agi - def_agi) * 0.004 - evade_bonus).clamp(0.55, 0.99)
      rng.rand < chance
    end

    def crit?(att_agi, def_agi)
      rng.rand < (0.05 + (att_agi - def_agi) * 0.002).clamp(0.02, 0.25)
    end

    # ---- Auto-attack ----

    def player_swing(zone, p, m)
      return unless m&.alive? && p.alive?
      return unless zone.line_of_sight?(p.x,p.z,m.x,m.z)
      dmg_bonus = 1.0 + p.buff_power("buff_dmg") / 100.0
      blind = p.buffs.any? { |b| b[:kind] == "blind" } ? 0.28 : 0.0
      if hit?(p.sheet["agi"], m.sheet["agi"], (m.definition["evasive"] ? 0.10 : 0.0) + blind)
        base = (p.sheet["weapon_dmg"] + p.sheet["str"] * 0.7 - m.sheet["def"] * 0.22)
        dmg = [(base * variance * dmg_bonus).round, 1].max
        crit = crit?(p.sheet["agi"], m.sheet["agi"])
        dmg = (dmg * 1.5).round if crit
        soul = p.buffs.find { |b| b[:kind] == "soul_hits" }
        if soul
          dmg = (dmg * 1.3).round
          soul[:power] -= 1
          p.buffs.delete(soul) if soul[:power] <= 0
        end
        zone.push_event(k: "hit", src: p.id, tgt: m.mid, dmg: dmg, crit: crit)
        p.tp = [p.tp + p.sheet["delay"] * 13, 300].min
        damage_monster(zone, p, m, dmg)
      else
        zone.push_event(k: "miss", src: p.id, tgt: m.mid)
      end
    end

    def monster_swing(zone, m, p)
      return unless p.alive?
      eye = p.buffs.find { |b| b[:kind] == "evade_charges" }
      if eye
        eye[:power] -= 1
        p.buffs.delete(eye) if eye[:power] <= 0
        zone.push_event(k: "miss", src: m.mid, tgt: p.id, anticipated: true)
        return
      end
      if hit?(m.sheet["agi"], p.sheet["agi"])
        base = (m.sheet["dmg"] * 1.15 - p.sheet["def"] * 0.35)
        dmg = [(base * variance).round, 1].max
        dmg = (dmg * (1.0 - [p.buff_power("buff_def"), 75].min / 100.0)).round
        dmg = [dmg, 1].max
        zone.push_event(k: "hit", src: m.mid, tgt: p.id, dmg: dmg, crit: false)
        p.tp = [p.tp + 8, 300].min
        damage_player(zone, p, dmg)
        inflict_ailment(zone, m, p)
      else
        zone.push_event(k: "miss", src: m.mid, tgt: p.id)
      end
    end

    # The effects a monster inflicts, as buff-record kinds. self_payload marks
    # these as harm for the HUD and Cure lifts exactly these, so the list lives
    # once, here, rather than as names in each place that cares.
    AILMENT_KINDS = %w[poison blind].freeze
    AILMENT_DURATION = 18.0

    # Every effect on a player is one of these records. `duration` rides along
    # with `ends_at` so self_payload can tell the HUD the effect's full length
    # exactly, rather than the client guessing it from ability data.
    def buff_record(kind, name, power, duration)
      { kind: kind, name: name, power: power, duration: duration.to_f, ends_at: Vanai.now + duration.to_f }
    end

    def inflict_ailment(zone, m, p)
      inf = m.definition["inflicts"]
      return unless inf && p.alive?
      kind = inf["kind"]
      return if p.buffs.any? { |b| b[:kind] == kind }
      return unless rng.rand < inf["chance"]
      # monsters.json's own numbers where it gives them; the level formula
      # and the common duration for the rest
      power = kind == "poison" ? (inf["dmg"] || (2 + m.level * 0.6).round) : 0
      name = kind == "poison" ? "Poison" : "Blind"
      p.buffs << buff_record(kind, name, power, inf["dur"] || AILMENT_DURATION)
      World.to_char(p.char_id, t: "system",
                    msg: kind == "poison" ? "Venom burns through you — you are poisoned!" : "Ash clouds your eyes — you are blinded!")
      zone.mark_self_dirty(p)
    end

    def cure_ailments(zone, p, kinds)
      before = p.buffs.size
      p.buffs.reject! { |b| kinds.include?(b[:kind]) }
      cured = before > p.buffs.size
      World.to_char(p.char_id, t: "system", msg: cured ? "The ailment lifts." : "Nothing to cure.")
      zone.mark_self_dirty(p)
    end

    # ---- Damage application ----

    def damage_monster(zone, p, m, dmg, enmity_mult = 1.0)
      return unless m.alive?
      m.sleep_until = 0.0
      m.hp -= dmg
      m.enmity[p.id] += (dmg * enmity_mult).round
      aggro!(zone, m, p) if m.state == :idle
      if m.hp <= 0
        monster_death(zone, m, p)
      end
    end

    def damage_player(zone, p, dmg, _src = nil)
      return if p.dead
      p.resting = false
      p.hp -= dmg
      if p.hp <= 0
        p.hp = 0
        player_death(zone, p)
      end
      zone.mark_self_dirty(p)
    end

    def aggro!(zone, m, p)
      m.state = :aggro
      m.target_pid = p.id
      m.enmity[p.id] += 1 if m.enmity[p.id].zero?
      # camp links
      if m.definition["links"] && m.camp
        zone.monsters.each_value do |o|
          next unless o.alive? && o.state == :idle && o.camp == m.camp && o.key == m.key
          if o.dist_to(m.x, m.z) < 18
            o.state = :aggro
            o.target_pid = p.id
            o.enmity[p.id] += 1
          end
        end
      end
    end

    # ---- Abilities ----

    def use_ability(zone, p, ability_id, target_id)
      ab = Data.abilities[ability_id]
      return err(zone, p, "Unknown ability.") unless ab
      return err(zone, p, "You cannot use that yet.") if ab["job"] != p.job || ab["lvl"] > p.level
      return err(zone, p, "You are down.") if p.dead
      t = Vanai.now
      if t < p.gcd_at || t < (p.cooldowns[ability_id] || 0)
        # the client's timers come from self_payload; a press it thought was
        # ready means it is out of step, so resend them (once per tick at most)
        zone.mark_self_dirty(p)
        return err(zone, p, "Not yet.")
      end
      return err(zone, p, "You are casting.") if p.casting
      return err(zone, p, "Not enough TP.") if ab["tp"] && p.tp < ab["tp"]
      return err(zone, p, "Not enough MP.") if ab["mp"] && p.mp < ab["mp"]

      target = resolve_target(zone, p, ab, target_id)
      return err(zone, p, target) if target.is_a?(String)

      p.resting = false
      p.gcd_at = t + GCD
      if ab["kind"] == "spell"
        p.casting = { ability: ability_id, target_id: target_id, ends_at: t + ab["cast"].to_f }
        zone.push_event(k: "cast_start", src: p.id, name: ab["name"], ms: (ab["cast"].to_f * 1000).round)
      else
        p.cooldowns[ability_id] = t + ab["cd"].to_f if ab["cd"]
        execute_ability(zone, p, ab, ability_id, target)
      end
      # self_payload is the client's only source for the GCD and cooldowns
      zone.mark_self_dirty(p)
    end

    def resolve_target(zone, p, ab, target_id)
      case ab["target"]
      when "enemy"
        m = zone.monsters[target_id]
        return "No target." unless m&.alive?
        range = ab["kind"] == "ws" ? MELEE_RANGE + 0.6 : SPELL_RANGE
        return "Too far away." if m.edge_dist_to(p.x, p.z) > range
        return "The tomb walls block your target." unless zone.line_of_sight?(p.x,p.z,m.x,m.z)
        m
      when "ally"
        tgt = target_id ? zone.players[target_id] : p
        tgt ||= p
        return "Too far away." if tgt != p && tgt.dist_to(p.x, p.z) > SPELL_RANGE
        return "They are beyond mending." if tgt.dead
        tgt
      when "dead_ally"
        tgt = zone.players[target_id]
        return "No fallen ally there." unless tgt&.dead
        return "Too far away." if tgt.dist_to(p.x, p.z) > SPELL_RANGE
        tgt
      when "party", "self"
        p
      else
        p
      end
    end

    def finish_cast(zone, p)
      c = p.casting
      p.casting = nil
      ab = Data.abilities[c[:ability]]
      # use_ability judged the caster when the cast began; a job change or a
      # piece of MP gear taken off since must not land a spell they cannot pay
      # for, and a scene begun since stops it (Philip, 2026-10-19)
      target =
        if ab["job"] != p.job || ab["lvl"] > p.level then "You cannot use that yet."
        elsif ab["mp"] && p.mp < ab["mp"] then "Not enough MP."
        elsif p.cutscene then "Not while you watch the scene."
        else resolve_target(zone, p, ab, c[:target_id])
        end
      if target.is_a?(String)
        World.to_char(p.char_id, t: "system", msg: "Your #{ab["name"]} fizzles. (#{target})")
        return
      end
      p.cooldowns[c[:ability]] = Vanai.now + ab["cd"].to_f if ab["cd"]
      execute_ability(zone, p, ab, c[:ability], target)
      # sends the cooldown just started, whatever the spell did (a resisted
      # Sleep and a Raise awaiting its answer push no event of their own)
      zone.mark_self_dirty(p)
    end

    def execute_ability(zone, p, ab, ability_id, target)
      p.tp -= ab["tp"] if ab["tp"] && ab["kind"] == "ws"
      p.mp -= ab["mp"].to_i if ab["mp"]
      if ab["hp_cost_pct"]
        cost = (p.max_hp * ab["hp_cost_pct"] / 100.0).round
        p.hp = [p.hp - cost, 1].max
      end

      case ab["kind"]
      when "ws" then execute_ws(zone, p, target, ab)
      when "ja" then execute_ja(zone, p, target, ab)
      when "spell" then execute_spell(zone, p, target, ab)
      end
    end

    def execute_ws(zone, p, m, ab)
      tp_bonus = 1.0
      dmg_bonus = 1.0 + p.buff_power("buff_dmg") / 100.0
      # combo: following the right opener within 10s sharpens the strike
      combo = false
      if ab["combo_after"] && p.last_ws && p.last_ws[:id] == ab["combo_after"] && Vanai.now - p.last_ws[:at] < 10.0
        dmg_bonus *= 1.3
        combo = true
      end
      ws_blind = p.buffs.any? { |b| b[:kind] == "blind" } ? 0.28 : 0.0
      if hit?(p.sheet["agi"] + 5, m.sheet["agi"], ws_blind)
        base = (p.sheet["weapon_dmg"] + p.sheet["str"] * 0.7 - m.sheet["def"] * 0.22)
        dmg = [(base * ab["power"].to_f * tp_bonus * variance * dmg_bonus).round, 2].max
        dmg = (dmg * 1.25).round if ab["element"] == "radiance" && m.undead?
        zone.push_event(k: "ws", src: p.id, tgt: m.mid, dmg: dmg, name: ab["name"], element: ab["element"], combo: combo)
        World.to_char(p.char_id, t: "system", msg: "Combo! #{ab["name"]} strikes true.") if combo
        t = Vanai.now
        # skillchain check
        if m.sc_element && t - m.sc_at <= SC_WINDOW
          if (sc = SC_TRANSITIONS[[m.sc_element, ab["element"]]])
            sc_dmg = [(dmg * 0.45 + p.level * 2).round, 3].max
            zone.push_event(k: "sc", tgt: m.mid, name: sc["name"], dmg: sc_dmg, element: sc["element"])
            m.burst_element = sc["element"]
            m.burst_until = t + BURST_WINDOW
            interrupt_telegraph(zone, m)
            damage_monster(zone, p, m, dmg + sc_dmg, 1.1)
            m.sc_element = sc["element"] # chains can continue off the SC element
            m.sc_at = t
            p.last_ws = { id: ab_id_for(ab), at: t }
            return
          end
        end
        m.sc_element = ab["element"]
        m.sc_at = t
        p.last_ws = { id: ab_id_for(ab), at: t }
        damage_monster(zone, p, m, dmg, 1.1)
      else
        zone.push_event(k: "miss", src: p.id, tgt: m.mid, name: ab["name"])
        m.sc_element = nil
      end
    end

    # abilities are stored by id key; resolve the key for a definition
    def ab_id_for(ab)
      @ab_ids ||= Data.abilities.each_with_object({}) { |(k, v), h| h[v] = k }
      @ab_ids[ab]
    end

    def execute_ja(zone, p, target, ab)
      case ab["effect"]
      when "enmity"
        m = target
        m.enmity[p.id] += ab["power"].to_i
        m.target_pid = p.id
        aggro!(zone, m, p) if m.state == :idle
        zone.push_event(k: "ja", src: p.id, tgt: m.mid, name: ab["name"])
      when "buff_def", "buff_dmg"
        add_buff(zone, p, p, ab)
      when "evade_charges"
        p.buffs << buff_record("evade_charges", ab["name"], ab["power"].to_i, ab["duration"])
        zone.push_event(k: "ja", src: p.id, tgt: p.id, name: ab["name"])
      when "tp_gain"
        p.tp = [p.tp + ab["power"].to_i, 300].min
        zone.push_event(k: "ja", src: p.id, tgt: p.id, name: ab["name"])
      when "stun"
        m = target
        m.stun_until = Vanai.now + ab["duration"].to_f
        m.casting = nil
        interrupt_telegraph(zone, m)
        zone.push_event(k: "ja", src: p.id, tgt: m.mid, name: ab["name"], stun: true)
      end
      if ab["name"] == "Soul Eater"
        p.buffs << buff_record("soul_hits", "Soul Eater", 3, 30)
      end
    end

    def execute_spell(zone, p, target, ab)
      case ab["effect"]
      when "damage"
        spell_damage(zone, p, target, ab)
      when "heal"
        heal_amount = [(ab["power"] + p.sheet["mnd"] * 0.75).round, 1].max
        apply_heal(zone, p, target, heal_amount, ab["name"])
      when "drain"
        dmg = spell_damage(zone, p, target, ab)
        if dmg && dmg > 0
          p.hp = [p.hp + (dmg * 0.8).round, p.max_hp].min
          zone.push_event(k: "heal", src: p.id, tgt: p.id, amount: (dmg * 0.8).round, name: ab["name"])
        end
      when "mp_drain"
        amount = [(ab["power"] + p.sheet["int"] * 0.4).round, 6].max
        p.mp = [p.mp + amount, p.max_mp].min
        zone.push_event(k: "spell", src: p.id, tgt: target.mid, name: ab["name"], drain_mp: amount)
        damage_monster(zone, p, target, 1, 2.0)
      when "sleep"
        m = target
        if m.definition["boss"] || m.definition["miniboss"] || m.definition["notorious"]
          World.to_char(p.char_id, t: "system", msg: "#{m.name} resists your #{ab["name"]}!")
        else
          m.sleep_until = Vanai.now + ab["duration"].to_f
          # an idle monster only sleeps: enmity on one that is not fighting
          # would hold the caster in combat until it died
          m.enmity[p.id] += 10 if m.state == :aggro
          zone.push_event(k: "spell", src: p.id, tgt: m.mid, name: ab["name"], sleep: true)
        end
      when "hot", "mp_regen", "buff_def"
        party_targets(zone, p).each { |member| add_buff(zone, p, member, ab) }
      when "cure"
        cure_ailments(zone, target, AILMENT_KINDS)
        zone.push_event(k: "heal", src: p.id, tgt: target.id, amount: 0, name: ab["name"])
      when "revive"
        # the fallen player chooses whether to accept — being raised amid
        # monsters is often worse than waiting them out
        tgt = target
        tgt.pending_raise = { from_id: p.id, from_name: p.name, at: Vanai.now }
        World.to_char(tgt.char_id, t: "raise_offer", from: p.name)
        World.to_char(p.char_id, t: "system", msg: "Your Raise reaches for #{tgt.name} — they may accept when ready.")
      end
    end

    RAISE_OFFER_TTL = 120.0

    def complete_raise(zone, tgt, offer)
      tgt.dead = false
      World.persist_death(tgt)
      tgt.hp = (tgt.max_hp * 0.3).round
      tgt.anim = "idle"
      refund = (tgt.xp_lost * 0.5).round
      if refund > 0
        World.grant_xp_raw(zone, tgt, refund)
        tgt.xp_lost = 0
      end
      zone.push_event(k: "revive", src: offer[:from_id], tgt: tgt.id, name: "Raise")
      World.to_char(tgt.char_id, t: "system", msg: "#{offer[:from_name]}'s Raise calls you back to your feet. Half your lost experience returns.")
      zone.mark_self_dirty(tgt)
    end

    def spell_damage(zone, p, m, ab)
      return nil unless m.respond_to?(:mid) && m.alive?
      base = (ab["power"] + p.sheet["int"] * 0.85 - m.level * 0.7)
      dmg = [(base * variance).round, 1].max
      dmg = (dmg * 1.25).round if ab["element"] == "radiance" && m.undead?
      burst = false
      t = Vanai.now
      if m.burst_element && t <= m.burst_until && m.burst_element == ab["element"]
        dmg = (dmg * 1.75).round
        burst = true
        m.burst_until = 0.0
        interrupt_telegraph(zone, m)
      end
      zone.push_event(k: "spell", src: p.id, tgt: m.mid, dmg: dmg, name: ab["name"], element: ab["element"], burst: burst)
      damage_monster(zone, p, m, dmg, 1.3)
      dmg
    end

    def apply_heal(zone, healer, target, amount, name)
      return if target.dead
      real = [amount, target.max_hp - target.hp].min
      target.hp += real
      zone.push_event(k: "heal", src: healer.id, tgt: target.id, amount: amount, name: name)
      zone.mark_self_dirty(target)
      # healing enmity on the monsters already fighting the one healed, and
      # no others: a potion beside someone else's fight joins no one to it
      if real > 0
        zone.monsters.each_value do |m|
          next unless m.alive? && m.state == :aggro && m.enmity[target.id] > 0
          m.enmity[healer.id] += (real * 0.5).round
        end
      end
    end

    def add_buff(zone, src, target, ab)
      target.buffs.reject! { |b| b[:name] == ab["name"] }
      target.buffs << buff_record(ab["effect"], ab["name"], ab["power"].to_i, ab["duration"])
      zone.push_event(k: "buff", src: src.id, tgt: target.id, name: ab["name"])
      zone.mark_self_dirty(target)
    end

    def party_targets(zone, p)
      if p.party_id && (party = World.parties[p.party_id])
        party.member_ids.filter_map { |cid| zone.players["p#{cid}"] }.select { |mem| mem.alive? && mem.dist_to(p.x, p.z) < 30 }
      else
        [p]
      end
    end

    # Kill rewards reach the whole party regardless of distance, unlike party_targets'
    # spell-range filter.
    def reward_members(zone, killer)
      members =
        if killer.party_id && (party = World.parties[killer.party_id])
          party.member_ids.filter_map { |cid| zone.players["p#{cid}"] }.select(&:alive?)
        else
          []
        end
      members.empty? ? [killer] : members
    end

    def interrupt_telegraph(zone, m)
      return unless m.telegraph
      m.telegraph = nil
      zone.push_event(k: "boss_interrupt", tgt: m.mid)
      zone.broadcast_system("The skillchain tears the silence from #{m.name}'s grasp!")
    end

    # ---- Items ----

    # One consumable a second, whichever it is: the server paces them, not
    # the hotbar (whose own lock, hud.ts itemLocks, is a second per item and
    # lifts early). Sent with the ability cooldowns under ITEM_CD_KEY.
    ITEM_COOLDOWN = 1.0
    ITEM_CD_KEY = "item"

    def use_item(zone, p, inv_id)
      return err(zone, p, "You are down.") if p.dead
      return err(zone, p, "You are casting.") if p.casting
      t = Vanai.now
      if t < (p.cooldowns[ITEM_CD_KEY] || 0)
        zone.mark_self_dirty(p)
        return err(zone, p, "Not yet.")
      end
      row = World.db { InventoryItem.find_by(id: inv_id, character_id: p.char_id) }
      return err(zone, p, "You don't have that.") unless row && row.qty > 0
      item = Data.items[row.item_key]
      return err(zone, p, "You can't use that.") unless item && item["slot"] == "consumable"
      # Taken from the row before it works, in one conditional update: a sale,
      # a listing or a second use racing this one cannot both have it.
      taken = World.db { InventoryItem.where(id: row.id, character_id: p.char_id).where("qty >= 1").update_all("qty = qty - 1") }
      return err(zone, p, "You don't have that.") if taken.zero?
      World.db { InventoryItem.where(id: row.id, qty: 0).delete_all }
      p.cooldowns[ITEM_CD_KEY] = t + ITEM_COOLDOWN
      case item["effect"]
      when "heal"
        apply_heal(zone, p, p, item["power"], item["name"])
      when "mp"
        p.mp = [p.mp + item["power"], p.max_mp].min
        zone.push_event(k: "heal", src: p.id, tgt: p.id, amount: 0, name: item["name"])
      when "cure_poison"
        cure_ailments(zone, p, ["poison"])
      when "cure_blind"
        cure_ailments(zone, p, ["blind"])
      when "cure_all"
        cure_ailments(zone, p, ["poison", "blind"])
      end
      World.to_char(p.char_id, t: "inventory_dirty")
      zone.mark_self_dirty(p)
    end

    # ---- Death, XP, loot ----

    def player_death(zone, p)
      p.dead = true
      p.anim = "dead"
      p.engaged = false
      p.target_mid = nil
      p.casting = nil
      p.buffs = []
      p.tp = 0
      # xp loss
      loss = (Stats.tnl(p.level) * 0.10).round
      loss = [loss, p.xp].min
      if p.level >= Stats::MAX_LEVEL then loss = 0 end
      p.xp -= loss
      p.xp_lost = loss
      p.chain_count = 0
      World.persist_job(p)
      # on the row now, not at the next save: a restart must not stand them up
      World.persist_death(p)
      zone.push_event(k: "die", tgt: p.id)
      World.to_char(p.char_id, t: "death", xp_lost: loss)
      # drop enmity
      zone.monsters.each_value { |m| m.enmity.delete(p.id) }
    end

    def monster_death(zone, m, killer)
      m.state = :dead
      m.hp = 0
      m.target_pid = nil
      m.casting = nil
      m.telegraph = nil
      m.sc_element = nil
      m.burst_element = nil
      m.respawn_at = Vanai.now + (m.camp ? m.camp["respawn"].to_f : 60.0)
      zone.push_event(k: "mdie", tgt: m.mid)
      zone.broadcast_system("#{killer.name} defeats #{m.name}.") if m.definition["notorious"] || m.definition["boss"] || m.definition["miniboss"]

      members = reward_members(zone, killer)
      award_xp(zone, m, members)
      award_loot(zone, m, members, killer)
      members.each { |mem| Quests.on_kill(zone, mem, m.key); Courts::Bounties.on_kill(zone, mem, m.key) }
      Courts::Claims.on_kill(zone, m, members)
      m.enmity.clear
      # the household it called does not outlive it
      zone.dismiss_adds(m)
    end

    XP_DIFF = [
      [4, 1.6], [2, 1.3], [-1, 1.0], [-3, 0.65], [-5, 0.35]
    ].freeze

    def diff_mult(diff)
      return 1.6 if diff >= 4
      return 1.3 if diff >= 2
      return 1.0 if diff >= -1
      return 0.65 if diff >= -3
      return 0.35 if diff >= -5
      0.0
    end

    def award_xp(zone, m, members)
      # the quadratic term keeps kill counts per level sane at 30-50, where the
      # tnl curve (l^1.7) would otherwise outrun linear kill xp
      base = (16 + m.level * 9 + m.level * m.level * 0.55) * m.sheet["xp_mult"]
      t = Vanai.now
      # a level-up saves itself; the plain gains are saved together, in one
      # statement, once every member has theirs
      owed = members.select do |p|
        mult = diff_mult(m.level - p.level)
        next false if mult.zero? || p.level >= Stats::MAX_LEVEL
        p.chain_count = (t - p.chain_at <= 30) ? p.chain_count + 1 : 0
        p.chain_at = t
        chain_mult = 1.0 + 0.12 * [p.chain_count, 8].min
        xp = (base * mult * chain_mult).round
        World.grant_xp(zone, p, xp, p.chain_count, persist: false)
      end
      World.persist_jobs(owed)
    end

    # `killer` first in line for the gold that does not split evenly
    def award_loot(zone, m, members, killer = nil)
      d = m.definition
      gold = rng.rand(d["gold"][0]..d["gold"][1])
      # the shares add up to the drop: each member its even part, the
      # remainder a gold apiece to the first in line, the killer leading
      line = members.include?(killer) ? [killer] + (members - [killer]) : members
      base, rem = gold.divmod(line.size)
      paid = line.each_with_index.filter_map do |p, i|
        share = base + (i < rem ? 1 : 0)
        [p, share] unless share.zero?
      end
      credit_gold(paid)
      paid.each do |p, share|
        p.gold += share
        World.to_char(p.char_id, t: "loot", gold: share)
        zone.mark_self_dirty(p)
      end
      (d["drops"] || []).each do |drop|
        # one roll, two bands: the controlling court's members' +50% (courts/benefits.rb)
        recipient = Courts::Benefits.drop_recipient(zone, members, drop, rng) { |pool| pick_recipient(zone, pool, drop["item"]) }
        next unless recipient
        World.grant_item(recipient, drop["item"], 1)
        World.to_char(recipient.char_id, t: "loot", item: drop["item"], name: Data.items[drop["item"]]["name"])
      end
      Courts::Relics.on_kill(zone, m, members) # the zone's relics, common and named (courts/relics.rb)
    end

    # The party's shares in one statement rather than one a member, still an
    # atomic increment so a REST purchase racing the kill loses nothing. The
    # rows are locked by id first, the order every transaction that holds two
    # characters takes them in (trades, mail, the auction house, the
    # council), so a party's payout can never deadlock with one of those and
    # stall the tick. A lone share needs no ordering.
    def credit_gold(paid)
      return if paid.empty?
      World.db do
        if paid.size == 1
          p, share = paid.first
          Character.where(id: p.char_id).update_all(["gold = gold + ?", share])
        else
          ids = paid.map { |p, _| p.char_id }
          Character.where(id: Character.where(id: ids).order(:id).lock.select(:id))
                   .update_all(["gold = gold + CASE id #{'WHEN ? THEN ? ' * paid.size}END", *paid.flat_map { |p, share| [p.char_id, share] }])
        end
      end
    end

    def pick_recipient(zone, members, item_key)
      # the counts each member's active quests still collect this item to,
      # from the journal in memory: the bags are asked only when the answer
      # could change the pick, which with no such quest, or one member, it
      # cannot
      wanted = members.filter_map do |p|
        counts = p.quests.filter_map do |qk, st|
          next unless st["status"] == QuestProgress::ACTIVE
          # a journal row whose quest has left quests.json needs nothing
          obj = Data.quests.dig(qk, "objective")
          obj["count"] if obj && obj["type"] == "collect" && obj["targets"].include?(item_key)
        end
        [p, counts] unless counts.empty?
      end
      have =
        if wanted.empty? || members.size == 1
          {}
        else
          # one grouped lookup for the whole party rather than a query per member per quest
          World.db do
            # the bags only, as the hand-in counts them (Quests.objective_met?)
            InventoryItem.where(character_id: wanted.map { |p, _| p.char_id }, item_key: item_key, equipped_slot: nil)
                         .group(:character_id).sum(:qty)
          end
        end
      # prefer someone whose active quest needs this item
      needing = wanted.filter_map { |p, counts| p if counts.any? { |n| have.fetch(p.char_id, 0) < n } }
      (needing.presence || members).sample(random: rng)
    end

    def err(zone, p, msg)
      World.to_char(p.char_id, t: "system", msg: msg)
      nil
    end
  end
end
