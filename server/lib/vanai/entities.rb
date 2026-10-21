require_relative "cutscenes"

module Vanai
  class PlayerState
    attr_accessor :char_id, :name, :race, :appearance, :job, :level, :xp, :title,
                  :x, :z, :heading, :anim, :hp, :mp, :tp, :sheet,
                  :target_mid, :engaged, :atk_ready_at, :casting, :buffs,
                  :party_id, :dead, :xp_lost, :chain_count, :chain_at,
                  :gcd_at, :cooldowns, :quests, :resting, :zone,
                  :last_save_at, :last_regen_at, :gold, :look, :pending_raise, :last_ws,
                  :lit_milestones, :jumped_at, :site_levels,
                  :cutscene, :cutscene_at, :cutscenes_seen, :cutscenes_due, :court
    attr_reader :zone_seen

    def initialize(character)
      @char_id = character.id
      @name = character.name
      @race = character.race
      @appearance = character.appearance_payload
      @job = character.active_job
      @title = character.title
      @zone = character.zone
      @court = character.court if character.respond_to?(:court)
      @x = character.x
      @z = character.z
      @heading = character.heading
      @anim = "idle"
      @site_levels = {}
      @gold = character.gold
      jr = character.job_record
      @level = jr.level
      @xp = jr.xp
      equipped = character.equipped.to_a
      equipped_defs = equipped.map { |ii| Data.items[ii.item_key] }
      @look = look_from(equipped)
      @sheet = Stats.sheet(race: @race, job: @job, level: @level, equipped: equipped_defs)
      @hp = @sheet["max_hp"]
      @mp = @sheet["max_mp"]
      @tp = 0
      @buffs = []
      @cooldowns = {}
      @gcd_at = 0.0
      @atk_ready_at = 0.0
      @dead = false
      @xp_lost = 0
      @chain_count = 0
      @chain_at = 0.0
      @resting = false
      @quests = {}
      # Plucked, not loaded: this runs on the world thread at every join, and
      # a long journey is hundreds of quest and discovery rows whose objects
      # cost more to build than the query does. (A preloaded association
      # plucks from the rows it holds.)
      character.quest_progresses.pluck(:quest_key, :status, :progress, :credited_targets).each do |key, status, progress, credited|
        # a row whose quest quests.json no longer has (the story pivot retired
        # 155 keys, and nothing deleted their rows): every reader looks the
        # key up, so it is left out here rather than raising there
        next unless Data.quests.key?(key)
        @quests[key] = { "status" => status, "progress" => progress, "credited" => credited || [] }
      end
      landmarks = character.discoveries.pluck(:landmark_key)
      # whether they had been to the zone they join in (World.record_zone_visit)
      @zone_seen = landmarks.include?("zone_#{@zone}")
      # crystals this character has attuned by touch ("milestone_<id>" discoveries)
      @lit_milestones = landmarks.filter_map do |k|
        k.delete_prefix("milestone_") if k.start_with?("milestone_")
      end.to_set
      # the scene playing now (nil when none) and when it began; and the
      # scenes this character has watched and is owed (Cutscenes)
      @cutscene = nil
      @cutscene_at = nil
      @cutscenes_seen, @cutscenes_due = Cutscenes.load_keys(landmarks)
      @last_save_at = 0.0
      @last_regen_at = 0.0
    end

    # the single definition of "lit for this character": a crystal counts as
    # attuned when this character has touched it
    def milestone_lit?(w) = @lit_milestones.include?(w["id"])

    def id = "p#{@char_id}"
    def max_hp = @sheet["max_hp"]
    def max_mp = @sheet["max_mp"]
    def tnl = Stats.tnl(@level)
    def alive? = !@dead

    def recompute!(character)
      @appearance = character.appearance_payload
      @job = character.active_job
      jr = character.job_record
      @level = jr.level
      @xp = jr.xp
      @gold = character.gold
      @court = character.court if character.respond_to?(:court)
      equipped = character.equipped.to_a
      equipped_defs = equipped.map { |ii| Data.items[ii.item_key] }
      @look = look_from(equipped)
      @sheet = Stats.sheet(race: @race, job: @job, level: @level, equipped: equipped_defs)
      @hp = [@hp, max_hp].min
      @mp = [@mp, max_mp].min
    end

    def look_from(equipped)
      look = {}
      equipped.each do |ii|
        item = Data.items[ii.item_key]
        next unless item
        case item["slot"]
        when "weapon" then look["w"] = ii.item_key
        when "body" then look["b"] = ii.item_key
        when "head" then look["h"] = ii.item_key
        when "legs" then look["l"] = ii.item_key
        when "feet" then look["f"] = ii.item_key
        end
      end
      look
    end

    def buff_power(kind)
      @buffs.select { |b| b[:kind] == kind }.sum { |b| b[:power] } # stacking additive
    end

    def dist_to(ox, oz)
      Math.hypot(@x - ox, @z - oz)
    end

    # The server is the HUD's only source for what each effect is and how long
    # every timer has left. Times go out as seconds remaining (one decimal, so
    # the client's countdowns are smooth) because Vanai.now is this process's
    # monotonic clock and means nothing to a browser.
    def self_payload
      now = Vanai.now
      {
        t: "self", hp: @hp, max_hp: max_hp, mp: @mp, max_mp: max_mp, tp: @tp.round,
        level: @level, xp: @xp, tnl: tnl, job: @job, gold: @gold, dead: @dead,
        buffs: buffs_payload(now), cooldowns: cooldowns_payload(now),
        gcd: tenths_up([@gcd_at - now, 0].max),
        stats: {
          str: @sheet["str"], vit: @sheet["vit"], agi: @sheet["agi"],
          int: @sheet["int"], mnd: @sheet["mnd"], def: @sheet["def"],
          weapon_dmg: @sheet["weapon_dmg"], delay: @sheet["delay"]
        }
      }
    end

    def buffs_payload(now)
      @buffs.map do |b|
        { name: b[:name], kind: b[:kind], remain: [b[:ends_at] - now, 0].max.round(1),
          duration: b[:duration], harm: Combat::AILMENT_KINDS.include?(b[:kind]) }
      end
    end

    # Only cooldowns still running; an ability absent from the map is ready.
    # Spent entries are dropped here so the hash never outgrows the job's list.
    def cooldowns_payload(now)
      @cooldowns.delete_if { |_, at| at <= now }
      @cooldowns.transform_values { |at| tenths_up(at - now) }
    end

    # Timers that gate a press round up: a slot that reads ready a few
    # hundredths early earns a "Not yet." from use_ability.
    def tenths_up(sec) = (sec * 10).ceil / 10.0

    def public_payload
      { id: id, name: @name, race: @race, appearance: @appearance, job: @job, level: @level, title: @title,
        x: @x.round(2), z: @z.round(2), h: @heading.round(2), anim: @anim,
        hp_pct: (100.0 * @hp / max_hp).round, dead: @dead, party: @party_id,
        look: @look, cs: !@cutscene.nil? }
    end
  end

  class MonsterState
    attr_accessor :mid, :key, :level, :x, :z, :spawn_x, :spawn_z, :camp,
                  :hp, :max_hp, :sheet, :state, :target_pid, :enmity,
                  :atk_ready_at, :move_goal, :respawn_at, :wander_at,
                  :sleep_until, :stun_until, :casting, :sc_element, :sc_at,
                  :burst_element, :burst_until, :adds_done, :telegraph,
                  :cast_cycle

    def initialize(mid, key, level, x, z, camp = nil)
      @mid = mid
      @key = key
      @level = level
      @spawn_x = x
      @spawn_z = z
      @camp = camp
      @x = x
      @z = z
      @sheet = Stats.monster_sheet(key, level)
      @max_hp = @sheet["hp"]
      @hp = @max_hp
      @state = :idle
      @enmity = Hash.new(0)
      @atk_ready_at = 0.0
      @wander_at = 0.0
      @sleep_until = 0.0
      @stun_until = 0.0
      @sc_at = 0.0
      @burst_until = 0.0
      @adds_done = {}
      @cast_cycle = 0
    end

    def definition = Data.monsters[@key]
    def name = definition["name"]
    def alive? = @state != :dead
    def undead? = !!definition["undead"]

    def dist_to(ox, oz)
      Math.hypot(@x - ox, @z - oz)
    end

    # Its footprint (monsters.json radius_m: the bestiary creature's measured
    # size, tools/data/monster_sizes.py). Reach is measured to this edge, so a
    # 6 m boss is fought at its flank and not from inside it.
    def radius = (definition["radius_m"] || 0.5).to_f

    # From a point to this monster's edge (0 inside it).
    def edge_dist_to(ox, oz) = [dist_to(ox, oz) - radius, 0.0].max

    def top_enmity
      @enmity.max_by { |_, v| v }&.first
    end

    def public_payload
      { id: @mid, key: @key, name: name, level: @level,
        x: @x.round(2), z: @z.round(2), hp_pct: (100.0 * @hp / @max_hp).round,
        state: @state, target: @target_pid, family: definition["family"] }
    end
  end

  class Party
    attr_accessor :pid, :leader_id, :member_ids, :invites, :snapshots, :capital_version

    def initialize(pid, leader_id)
      @pid = pid
      @leader_id = leader_id
      @member_ids = [leader_id]
      @invites = {} # invited char_id => invited_at
      # char_id => last roster payload, so a member crossing zones or briefly
      # offline still has a seat to show
      @snapshots = {}
    end

    def full? = @member_ids.size >= 6
  end

  def self.now
    Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end
end
