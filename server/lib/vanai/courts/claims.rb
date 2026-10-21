module Vanai
  module Courts
    # The claims race (COURTS.md "Claims"). A court's claim in each of the 15
    # wild zones grows from its sworn members' work there: level-weighted kills,
    # gathering, quests, bounties paid, relics registered from there (S5).
    # Discoveries do not count. Work in a dungeon credits its parent zone (the
    # Keep's parent is the Capital, which nobody contests, so it earns nothing).
    # Points are capped per character per cycle and decay each cycle; control
    # goes to the highest claim, decided at the boundary.
    #
    # Shared world state, on purpose: zone_claims holds one row per zone and
    # court, zone_controls the snapshot per cycle. Every credit runs on the world
    # thread, from hooks already there (combat, nodes, quest hand-ins, bounty
    # payouts). A kill is far too frequent for two writes per party member, so
    # credits are buffered in memory and flushed every few seconds in one
    # transaction (Courts.tick), and at each boundary before control is decided.
    #
    # In a party each member's share credits that member's own court, and a
    # contribution keeps the court it was earned for: an explorer who switches
    # takes nothing with them.
    module Claims
      BOSS_FLAGS = %w[notorious miniboss boss].freeze
      # A claim decayed below this is nobody's: without the floor a zone worked
      # once would be "held" on a few thousandths of a point for ever.
      FLOOR = 0.01

      class << self
        def cfg = Courts.config.claims

        # The court a player is sworn to. The pure quest and combat tests run
        # the hooks with stand-in players that have none: they earn nothing.
        def sworn(p) = p.respond_to?(:court) ? p.court : nil

        # ---- control: the snapshot the benefits and the maps read ----

        # zone => court for every controlled zone. Frozen and replaced whole at
        # the boundary, so a request thread (the vendor) never sees a torn one.
        def control
          @control ||= load_control
        end

        def controller(zone) = control[zone]

        # The latest cycle's zone_controls, as the snapshot.
        def load_control(before: nil)
          scope = ZoneControl.all
          scope = scope.where("cycle < ?", before) if before
          n = scope.maximum(:cycle)
          return {}.freeze unless n
          ZoneControl.where(cycle: n).where.not(court: nil).pluck(:zone, :court).to_h.freeze
        end

        # court => how many zones it controls, for the court window
        def counts
          KEYS.to_h { |k| [k, control.count { |_z, c| c == k }] }
        end

        # The 15 contested zones, in zones.json order.
        def zones
          @zones ||= Data.zones.keys.select { |k| Courts.contested?(k) }.freeze
        end

        # ---- credits (the world thread) ----

        # Combat.monster_death, after the loot: the monster's level (x3 for a
        # notorious monster, a miniboss or a boss), split equally over the
        # members the kill rewards, each share to that member's own court.
        def on_kill(zone, m, members)
          return if members.none? { |p| sworn(p) } || Courts.claim_zone(zone.key).nil?
          base = m.level.to_f * cfg["kill_per_level"]
          base *= cfg["boss_mult"] if BOSS_FLAGS.any? { |f| m.definition[f] }
          share = base / members.size
          members.each { |p| credit(p, zone.key, share) }
        end

        # A gathering node picked (a solo action).
        def on_gather(zone, ps)
          credit(ps, zone.key, cfg["gather"])
        end

        # A quest handed in: the completer only (each member hands in their
        # own). The zone it was completed in when that is contested, else where
        # its work was done (quest_zone), so a main-story hand-in in a city
        # credits the field the work was done in.
        def on_quest(zone, p, key)
          return unless sworn(p)
          where = Courts.claim_zone(zone.key) ? zone.key : quest_zone(key)
          return unless where
          credit(p, where, cfg["quest_base"] + Data.quests.dig(key, "min_lvl").to_i)
        end

        # A bounty paid (Bounties.credit_claim): the finisher, in the bounty's zone.
        def on_bounty(ps, bounty)
          credit(ps, bounty.zone, cfg["bounty"])
        end

        # A relic registered (S5): the registrant, in the relic's zone, not the
        # hall's. A named relic's points are exempt from the per-character cap.
        def on_relic(ps, zone, count = 1, named: false)
          points = named ? cfg["relic_named"] : cfg["relic_common"] * count.to_i
          credit(ps, zone, points, exempt: named)
        end

        # Credits `points` of `ps`'s work in `zone_key` to `ps`'s court, in the
        # zone the work counts for, doubled by that court's war chest there, and
        # cut to what is left of the character's cap this cycle (unless
        # exempt). -> the points granted.
        def credit(ps, zone_key, points, exempt: false)
          court = sworn(ps)
          return 0.0 unless KEYS.include?(court) && points.to_f.positive?
          zone = Courts.claim_zone(zone_key)
          return 0.0 unless zone
          points = points.to_f
          cycle = current_cycle
          points *= push_mult(court, zone, cycle)
          tkey = [ps.char_id, cycle]
          if exempt
            granted = points
          else
            used = total(ps.char_id, cycle)
            granted = [points, [cfg["cap_per_cycle"] - used, 0.0].max].min
            @totals[tkey] = used + granted
          end
          e = (@buffer ||= {})[[ps.char_id, cycle, zone, court]] ||= { points: 0.0, capped: 0.0, exempt: 0.0 }
          e[:points] += granted
          e[:capped] += points - granted
          e[:exempt] += granted if exempt
          granted
        end

        # Writes the buffered credits: one upsert for the contributions, one for
        # the zones' claims. A character deleted since their work was buffered
        # loses only their contribution row; the court keeps the claim.
        def flush!
          return if @buffer.nil? || @buffer.empty?
          buf = @buffer
          @buffer = {}
          now = Courts.now
          rows = buf.map do |(cid, cycle, zone, court), e|
            { character_id: cid, cycle: cycle, zone: zone, court: court, points: e[:points], capped: e[:capped],
              exempt: e[:exempt], updated_at: now }
          end
          sums = Hash.new(0.0)
          buf.each { |(_cid, _cycle, zone, court), e| sums[[zone, court]] += e[:points] }
          claims = sums.select { |_k, v| v.positive? }.map { |(zone, court), v| { zone: zone, court: court, points: v, updated_at: now } }
          ZoneClaim.transaction do
            unless claims.empty?
              ZoneClaim.upsert_all(claims, unique_by: %i[zone court],
                                           on_duplicate: Arel.sql("points = zone_claims.points + EXCLUDED.points, updated_at = EXCLUDED.updated_at"))
            end
            upsert_contributions(rows)
          end
        end

        # ---- the boundary ----

        # Flush, decay every claim, decide control per zone (the highest claim;
        # a tie keeps the incumbent if it is among the tied, else nobody; no
        # points, nobody), write the new cycle's snapshot and the ledger's
        # control events, and the Capital's leader (the court holding the most
        # zones; a tie leaves the Capital without one). Idempotent: the snapshot rows are unique per
        # cycle and zone, and a retried boundary rolls back as a whole.
        def boundary!(closed, opened)
          flush!
          @cycle = nil
          @totals = {}
          now = Courts.now
          keep = 1.0 - cfg["decay"]
          ZoneClaim.update_all(["points = CASE WHEN points * ? < ? THEN 0 ELSE points * ? END, updated_at = ?", keep, FLOOR, keep, now])
          return if ZoneControl.where(cycle: opened.number).exists?
          held = Hash.new { |h, k| h[k] = {} }
          ZoneClaim.pluck(:zone, :court, :points).each { |z, c, p| held[z][c] = p.to_f.round(3) }
          before = load_control(before: opened.number)
          changes = []
          rows = zones.map do |zone|
            pts = KEYS.to_h { |k| [k, held[zone][k] || 0.0] }
            court = Courts.leader_from(pts, before[zone])
            changes << { zone: zone, from: before[zone], to: court } if court != before[zone]
            { cycle: opened.number, zone: zone, court: court, points: pts, created_at: now }
          end
          ZoneControl.insert_all(rows, unique_by: %i[cycle zone])
          changes.each do |ch|
            meta = { "from" => ch[:from], "to" => ch[:to] }
            [ch[:to], ch[:from]].compact.each { |k| Treasury.event!(k, kind: "control", cycle: closed.number, zone: ch[:zone], meta: meta) }
          end
          held_counts = KEYS.to_h { |k| [k, rows.count { |r| r[:court] == k }] }
          CourtFlag.set("capital_leader", Courts.capital_leader_from(held_counts))
          snapshot = rows.select { |r| r[:court] }.to_h { |r| [r[:zone], r[:court]] }.freeze
          # The snapshot is swapped, and the change announced, only once the
          # boundary has committed (News.later runs after the hold ends).
          News.later do
            @control = snapshot
            unless changes.empty?
              msg = { t: "court_control", control: snapshot, changes: changes }
              Courts.each_online { |ps| World.to_char(ps.char_id, msg) }
            end
          end
        end

        # The digest's control section: every zone whose control changed at the
        # boundary that opened `opened`, in its new court's voice, or the neutral
        # line when nobody holds it any more. Read from the snapshots, so a
        # digest built twice says the same thing.
        def digest_entries(opened)
          now = ZoneControl.where(cycle: opened.number).pluck(:zone, :court).to_h
          return [] if now.empty?
          before = load_control(before: opened.number)
          zones.filter_map do |zone|
            to = now[zone]
            from = before[zone]
            next if to == from
            vars = { "zone" => Data.zones.dig(zone, "name") || zone }
            vars["from"] = Courts.config.name(from) if from
            to ? { "kind" => "digest_control", "court" => to, "vars" => vars } : { "kind" => "digest_control_lapsed", "court" => nil, "vars" => vars }
          end
        end

        # ---- quests: where the work was done ----

        # The contested zone a quest's work was done in: the first objective
        # target that resolves to one through the camps (kill), the nodes and
        # monster drops (collect), the NPCs (talk), the landmarks (reach) or the
        # interactables and crystals (interact). nil when none does.
        def quest_zone(key)
          @quest_zones ||= {}
          return @quest_zones[key] if @quest_zones.key?(key)
          @quest_zones[key] = find_quest_zone(Data.quests[key])
        end

        def forget_pushes! = (@pushes = nil)

        def reset!
          @control = @zones = @quest_zones = @places = @cycle = @pushes = nil
          @buffer = {}
          @totals = {}
        end

        private

        def current_cycle
          @cycle ||= Courts.cycle_number
        end

        # What the character has already earned against the cap this cycle:
        # stored (less the exempt part) plus everything buffered since.
        def total(char_id, cycle)
          @totals ||= {}
          @totals[[char_id, cycle]] ||= ClaimContribution.where(character_id: char_id, cycle: cycle).sum("points - exempt").to_f
        end

        # A war chest doubles the court's gains in the zone for its cycles
        # (fund_push, S6; the multiplier is tuning.fund_push.mult). Asked on
        # every credit on the world thread, so the cycle's chests are read once
        # and kept: they change only when a turn applies one (CourtPush's
        # save forgets them) or the cycle turns (a new key).
        def push_mult(court, zone, cycle)
          pushes = @pushes
          unless pushes && pushes[0] == cycle
            pushes = @pushes = [cycle, CourtPush.active_in(cycle).pluck(:court, :zone).to_set]
          end
          return 1.0 unless pushes[1].include?([court, zone])
          Courts.config.fund_push.fetch("mult").to_f
        end

        # In a savepoint: a failed statement would otherwise poison the whole
        # flush (and a boundary's) transaction.
        def upsert_contributions(rows)
          ClaimContribution.transaction(requires_new: true) do
            ClaimContribution.upsert_all(rows, unique_by: :index_claim_contributions_unique, on_duplicate: Arel.sql(
              "points = claim_contributions.points + EXCLUDED.points, capped = claim_contributions.capped + EXCLUDED.capped, " \
              "exempt = claim_contributions.exempt + EXCLUDED.exempt, updated_at = EXCLUDED.updated_at"
            ))
          end
        rescue ActiveRecord::InvalidForeignKey
          live = Character.where(id: rows.map { |r| r[:character_id] }).pluck(:id)
          rows = rows.select { |r| live.include?(r[:character_id]) }
          retry unless rows.empty?
        end

        def find_quest_zone(q)
          obj = q && q["objective"]
          return nil unless obj
          index = places
          kind = { "kill" => :monster, "collect" => :item, "talk" => :npc, "reach" => :landmark, "interact" => :object }[obj["type"]]
          return nil unless kind
          Array(obj["targets"]).each do |t|
            found = Array(index[kind][t]).lazy.map { |zk| Courts.claim_zone(zk) }.find(&:itself)
            return found if found
          end
          nil
        end

        # target => [zone keys], by kind, built once from the loaded data.
        def places
          @places ||= begin
            idx = Hash.new { |h, k| h[k] = Hash.new { |hh, kk| hh[kk] = [] } }
            Data.zones.each do |zk, z|
              Array(z["camps"]).each do |c|
                idx[:monster][c["monster"]] << zk
                Array(Data.monsters.dig(c["monster"], "drops")).each { |d| idx[:item][d["item"]] << zk }
              end
              Array(z["nodes"]).each { |n| (i = World::NODE_ITEM[n["kind"]]) && idx[:item][i] << zk }
              Array(z["npcs"]).each { |n| idx[:npc][n["id"]] << zk }
              Array(z["landmarks"]).each { |l| idx[:landmark][l["id"]] << zk }
              (Array(z["interactables"]) + Array(z["milestones"])).each { |o| idx[:object][o["id"]] << zk }
            end
            idx
          end
        end
      end

      reset!
    end
  end
end
