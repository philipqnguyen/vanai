require "json"
require_relative "site_levels"
require_relative "courts/halls"
require_relative "courts/claims" # with benefits: the claim and benefit hooks in quests, combat and world
require_relative "courts/benefits"
require_relative "courts/relics" # the relic hooks in combat and world, and the bound-row guard

module Vanai
  # Loads the shared JSON game data (single source of truth for server + client).
  module Data
    class << self
      attr_reader :jobs, :races, :items, :abilities, :monsters, :zones, :quests, :quest_prereq, :recipes, :ferry, :cutscenes

      def load!(root)
        dir = File.expand_path("../shared/data", root)
        @jobs      = read(dir, "jobs.json")
        @races     = @jobs.delete("races")
        @items     = read(dir, "items.json")
        @abilities = read(dir, "abilities.json")
        @monsters  = read(dir, "monsters.json")
        @zones     = read(dir, "zones.json")
        @quests    = read(dir, "quests.json")
        @recipes = read(dir, "recipes.json")
        @ferry = read(dir, "ferry.json")
        @cutscenes = read_cutscenes(dir)
        Courts::Halls.inject!(@zones, read(dir, "courts.json")) # the audience halls' heralds and stations
        # a quest can be unlocked by ANY of its predecessors (chains from the
        # three starting cities merge into shared quests)
        @quest_prereq = {}
        # `next` may name several quests (the merge fans out into three doorsteps)
        @quests.each { |key, q| Array(q["next"]).each { |n| (@quest_prereq[n] ||= []) << key } }
        validate_gear!
        validate_quests!
        validate_zones!
        validate_cutscenes!
        validate_monsters!
        # every site's deck grid, before the world thread walks one (SiteLevels)
        SiteLevels.index!(@zones)
        true
      end

      def validate_monsters!
        problems = monster_problems
        return true if problems.empty?
        msg = "[vanai] monster validation failed:\n  " + problems.join("\n  ")
        raise msg if Rails.env.development? || Rails.env.test?
        Rails.logger.error(msg) # never take a live world down over a data typo
        false
      end

      # Every monster is a generated creature of a planned size (BESTIARY.md),
      # and reach is measured to its edge (MonsterState#edge_dist_to): each
      # carries its standing height and footprint radius in metres
      # (tools/data/monster_sizes.py writes both; audit.py checks them against
      # the plan). The KayKit-era `scale` is retired.
      def monster_problems
        @monsters.flat_map do |key, m|
          out = []
          h, r = m["height_m"], m["radius_m"]
          out << "#{key}: height_m #{h.inspect} is not a height in metres (0.2-12)" unless h.is_a?(Numeric) && h >= 0.2 && h <= 12
          out << "#{key}: radius_m #{r.inspect} is not a footprint radius in metres (0.1-5)" unless r.is_a?(Numeric) && r >= 0.1 && r <= 5
          out << "#{key}: `scale` is retired (height_m sizes the creature)" if m.key?("scale")
          out
        end
      end

      # A scene's running time: its shots end to end. The world holds a
      # watcher's "in a cutscene" flag no longer than this and a margin
      # (Cutscenes.hold_limit), so a client that never reports the end cannot
      # leave anyone frozen with the film icon over their head.
      def cutscene_duration(id)
        Array(@cutscenes.dig(id, "shots")).sum { |shot| shot["dur"].to_f }
      end

      CUTSCENE_TRIGGERS = %w[intro opening quest_accept quest_complete zone_first_visit job_change attune interact landmark].freeze

      def validate_cutscenes!
        problems = cutscene_problems
        return true if problems.empty?
        msg = "[vanai] cutscene validation failed:\n  " + problems.join("\n  ")
        raise msg if Rails.env.development? || Rails.env.test?
        Rails.logger.error(msg) # never take a live world down over a data typo
        false
      end

      # The server's half of the rule (tools/data/audit.py checks every
      # reference inside the shots): each scene is filmed in a real zone, fires
      # on a trigger the world knows, and has shots that take time.
      def cutscene_problems
        @cutscenes.flat_map do |id, scene|
          trigger = scene["trigger"] || {}
          out = []
          # a scene in chapters (the intro) tours several zones and plays before
          # the world is joined; every other scene is filmed in one
          if scene["chapters"]
            Array(scene["chapters"]).each_with_index do |c, i|
              out << "#{id} chapter #{i + 1}: zone #{c["zone"].inspect} is not a zone" if c["zone"] && !@zones.key?(c["zone"])
            end
            out << "#{id}: only the intro is told in chapters" unless trigger["type"] == "intro"
            next out
          end
          anywhere = scene["zone"] == "*"
          out << "#{id}: zone #{scene["zone"].inspect} is not a zone" unless @zones.key?(scene["zone"]) || anywhere
          out << "#{id}: only a crystal's attunement plays anywhere" if anywhere && trigger["type"] != "attune"
          out << "#{id}: trigger #{trigger["type"].inspect} is not one of #{CUTSCENE_TRIGGERS.join(", ")}" unless CUTSCENE_TRIGGERS.include?(trigger["type"])
          out << "#{id}: an opening names its starting city" if trigger["type"] == "opening" && trigger["city"] != scene["zone"]
          if trigger["type"].to_s.start_with?("quest_") && !@quests.key?(trigger["quest"])
            out << "#{id}: trigger quest #{trigger["quest"].inspect} is not a quest"
          end
          shots = scene["shots"]
          if !shots.is_a?(Array) || shots.empty? || shots.any? { |shot| shot["dur"].to_f <= 0 }
            out << "#{id}: needs at least one shot, every one with a positive dur"
          end
          out
        end
      end

      def abilities_for(job, level)
        @abilities.select { |_, a| a["job"] == job && a["lvl"] <= level }
      end

      ARMOR_SLOTS = %w[head body legs feet].freeze
      # An armour piece open to every job says so out loud. Silence used to
      # mean the same thing, which is how 49 pieces ended up wearable by anyone
      # without anyone noticing.
      ANY_ARMOR = "any"

      # The single definition of who may use a piece of gear. The equip
      # endpoint, this validation and the compendium generator all read from it.
      def eligible_jobs(item)
        return [] unless item
        eligible = case item["slot"]
        when "weapon"
          @jobs.select { |_, j| j["weapon_type"] == item["wtype"] }.keys
        when *ARMOR_SLOTS
          item["atype"] == ANY_ARMOR ? @jobs.keys : @jobs.select { |_, j| j["armor"].include?(item["atype"]) }.keys
        else
          @jobs.keys # rings and consumables are open to all
        end
        # Explicit job gear remains subject to its material/weapon rules.
        if item.key?("allowed_jobs")
          return [] unless item["allowed_jobs"].is_a?(Array)
          eligible &= item["allowed_jobs"]
        end
        eligible
      end

      # No equippable item may exist that nobody can equip — and no armour may
      # exist without an explicit class, since absent means "everyone" and that
      # is too easy to do by accident.
      def validate_gear!
        untyped, orphans = [], []
        @items.each do |key, item|
          if item.key?("allowed_jobs")
            allowed = item["allowed_jobs"]
            unless allowed.is_a?(Array) && !allowed.empty? && allowed.uniq == allowed && allowed.all? { |job| @jobs.key?(job) }
              orphans << "#{key}: allowed_jobs must be a nonempty list of unique known jobs"
            end
          end
          slot = item["slot"]
          next unless slot == "weapon" || ARMOR_SLOTS.include?(slot)
          if ARMOR_SLOTS.include?(slot) && item["atype"].to_s.empty?
            untyped << "#{key} (#{slot}) has no atype — declare cloth/leather/chain, or \"#{ANY_ARMOR}\" if every job may wear it"
            next
          end
          next unless eligible_jobs(item).empty?
          what = slot == "weapon" ? "wtype #{item["wtype"].inspect}" : "atype #{item["atype"].inspect}"
          orphans << "#{key} (#{slot}) has #{what}, which no job can use"
        end
        problems = untyped + orphans
        return true if problems.empty?
        msg = "[vanai] gear validation failed:\n  " + problems.join("\n  ")
        raise msg if Rails.env.development? || Rails.env.test?
        Rails.logger.error(msg) # never take a live world down over a data typo
        false
      end

      # A guild quest names a job the world knows (never "races", which shares
      # jobs.json but was split off above), and no quest is given by a trainer:
      # World.talk short-circuits a sanctuary NPC, so its offers would never show.
      def validate_quests!
        problems = quest_problems
        return true if problems.empty?
        msg = "[vanai] quest validation failed:\n  " + problems.join("\n  ")
        raise msg if Rails.env.development? || Rails.env.test?
        Rails.logger.error(msg) # never take a live world down over a data typo
        false
      end

      # The rule itself, apart from whether a failure raises or logs.
      def quest_problems
        kinds = {}
        @zones.each_value { |z| (z["npcs"] || []).each { |n| kinds[n["id"]] = n["kind"] } }
        problems = []
        @quests.each do |key, q|
          if q.key?("job") && !(q["job"].is_a?(String) && @jobs.key?(q["job"]))
            problems << "#{key}: job #{q["job"].inspect} is not a job in jobs.json"
          end
          problems << "#{key}: giver #{q["giver"]} is a sanctuary NPC, which never offers quests" if kinds[q["giver"]] == "sanctuary"
          problems << "#{key}: giver #{q["giver"]} is a court herald, who never offers quests" if kinds[q["giver"]] == "herald"
        end
        problems
      end

      # Whether a zone has an auction house: brokers (NPC kind "auction") stand in
      # it. The three free cities and the returned Capital's Exchange; never the
      # empty Capital, whose Exchange stands with nobody at its counters. The
      # auction endpoints trade only here (Api::AuctionController), and then only
      # within a broker's reach on the broker's floor (World.npc_refusal_for).
      def auction_zone?(key)
        (@zones.dig(key, "npcs") || []).any? { |n| n["kind"] == "auction" }
      end

      # A zone's `services` mark a building on the client's maps -- the auction
      # house, an inn -- at its centre (client/src/map_services.ts). The server
      # never reads them, but a typo there draws the auction house in the sea
      # or drops it silently, so the shape is checked where the data loads.
      SERVICE_KINDS = %w[auction inn trainer vendor].freeze

      def validate_zones!
        problems = zone_problems
        return true if problems.empty?
        msg = "[vanai] zone validation failed:\n  " + problems.join("\n  ")
        raise msg if Rails.env.development? || Rails.env.test?
        Rails.logger.error(msg) # never take a live world down over a data typo
        false
      end

      # The rule itself, apart from whether a failure raises or logs.
      def zone_problems
        problems = []
        @zones.each do |key, z|
          next unless z.key?("services")
          list = z["services"]
          unless list.is_a?(Array)
            problems << "zone #{key}: services must be a list"
            next
          end
          npc_ids = (z["npcs"] || []).map { |n| n["id"] }
          covered = []
          half = z["size"].to_f / 2
          list.each_with_index do |s, i|
            at = "zone #{key}: services[#{i}]"
            unless s.is_a?(Hash)
              problems << "#{at} is not an object"
              next
            end
            problems << "#{at}: kind #{s["kind"].inspect} is not one of #{SERVICE_KINDS.join(", ")}" unless SERVICE_KINDS.include?(s["kind"])
            problems << "#{at}: needs a name" unless s["name"].is_a?(String) && !s["name"].strip.empty?
            %w[x z].each do |c|
              v = s[c]
              if !v.is_a?(Numeric)
                problems << "#{at}: #{c} must be a number"
              elsif v.abs > half
                problems << "#{at}: #{c} #{v} is outside the #{z["size"]} m plate"
              end
            end
            next unless s.key?("npcs")
            if !s["npcs"].is_a?(Array) || s["npcs"].empty?
              problems << "#{at}: npcs must be a nonempty list of this zone's NPC ids"
            else
              s["npcs"].each do |id|
                if !npc_ids.include?(id)
                  problems << "#{at}: npc #{id.inspect} is not an NPC in #{key}"
                elsif covered.include?(id)
                  problems << "#{at}: npc #{id.inspect} is covered by two services"
                end
                covered << id
              end
            end
          end
        end
        problems
      end

      private

      def read(dir, file)
        JSON.parse(File.read(File.join(dir, file)))
      end

      # shared/data/cutscenes/*.json: one file per group of scenes (the openings,
      # the intro, the dungeon reveals...), so several can be written at once.
      # Each maps scene ids to scenes; an id in two files is an error.
      def read_cutscenes(dir)
        Dir[File.join(dir, "cutscenes", "*.json")].sort.each_with_object({}) do |path, all|
          JSON.parse(File.read(path)).each do |id, scene|
            raise "[vanai] cutscene #{id} is in two files (#{File.basename(path)})" if all.key?(id)
            all[id] = scene
          end
        end
      end
    end
  end

  module Stats
    MAX_LEVEL = 50
    FISTS = { "dmg" => 4, "delay" => 2.8 }.freeze

    def self.tnl(level)
      (80 * (level**1.7)).floor
    end

    # Derives the full combat sheet for a character snapshot.
    # equipped: array of item definitions (hashes from items.json).
    def self.sheet(race:, job:, level:, equipped:)
      jd = Data.jobs.fetch(job)
      rm = Data.races.fetch(race)
      base = {}
      %w[str vit int mnd agi].each do |s|
        base[s] = ((jd["base"][s] + jd["growth"][s] * (level - 1)) * rm["mods"][s]).round
      end
      gear_def = 0
      weapon = nil
      hp_bonus = 0
      mp_bonus = 0
      equipped.each do |item|
        next unless item
        gear_def += item["def"].to_i
        weapon = item if item["slot"] == "weapon"
        (item["stats"] || {}).each do |s, v|
          if s == "hp" then hp_bonus += v
          elsif s == "mp" then mp_bonus += v
          else base[s] = base[s].to_i + v
          end
        end
      end
      weapon ||= FISTS
      max_hp = ((30 + jd["hp_per_level"] * level) * rm["hp_mod"]).round + hp_bonus + base["vit"]
      max_mp = ((10 + jd["mp_per_level"] * level) * rm["mp_mod"]).round + mp_bonus
      {
        "str" => base["str"], "vit" => base["vit"], "int" => base["int"],
        "mnd" => base["mnd"], "agi" => base["agi"],
        "def" => (base["vit"] * 0.9).round + gear_def,
        "weapon_dmg" => weapon["dmg"] || 4,
        "delay" => weapon["delay"] || 2.8,
        "max_hp" => max_hp, "max_mp" => max_mp
      }
    end

    # The party curve (Philip's ruling): levels 1-10 solo easily; past that
    # soloing gets hard and players party, ideal party three. MEASURED against
    # the combat formulas (scratchpad curve.py, vendor gear, auto-attack only):
    # with no band an even-level fight is ~22 s and ~30% of a tank's HP at every
    # level, so nothing ever asks for a party. The band leaves 1-10 a shade
    # easier than that and ramps to x1.8 HP / x1.35 damage by 20, where an
    # even-level solo fight costs the whole health bar (~40 s) while a
    # tank/healer/damage trio kills in ~15 s with the healer comfortably ahead.
    def self.band(level)
      return [0.9, 0.85] if level <= 10
      t = [(level - 10) / 10.0, 1.0].min
      [0.9 + 0.9 * t, 0.85 + 0.5 * t]
    end

    def self.monster_sheet(key, level)
      d = Data.monsters.fetch(key)
      hp_b, dmg_b = band(level)
      {
        "hp" => ((22 + level * 15) * d["hp_mult"] * hp_b).round,
        "dmg" => ((4 + level * 2.3) * d["dmg_mult"] * dmg_b).round,
        "def" => (3 + level * 2.2).round,
        "agi" => (4 + level * 1.6).round,
        "str" => (4 + level * 2.0).round,
        "delay" => d["delay"],
        "xp_mult" => d["boss"] ? 6.0 : d["miniboss"] ? 3.0 : d["notorious"] ? 2.5 : 1.0
      }
    end
  end
end
