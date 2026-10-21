module Vanai
  module Courts
    # Bounties (COURTS.md "Bounties"): a paid task a court posts from its
    # treasury. Two kinds at launch: kill N of a monster in a zone (its
    # dungeons count too: work there credits the zone) and collect N of an item,
    # delivered to the posting court's board. A bounty has paid places (e.g.
    # 5 x 100 gold); the whole amount is held from the treasury when it is
    # posted, the first explorers to finish take the places, and what is left at
    # expiry goes back to the treasury.
    #
    # Shared world state, on purpose: one bounties row per bounty, each
    # explorer's progress in bounty_progresses. Everything that changes either
    # runs on the world thread (kills, the board's accept and deliver, the
    # boundary), so there is one writer; the places are still taken by a
    # conditional increment, so the last place cannot be paid twice even if
    # that ever stops being true.
    #
    # Only a court's sworn members may take its bounties (tmp/courts/PLAN.md
    # question 2): the finisher's claim credit goes to their own court, so an
    # open bounty would pay a rival to gain ground.
    module Bounties
      # A camp slower than this to return, with too few spawns for the smallest
      # kill count, is a boss's or a named monster's (build_targets).
      RARE_RESPAWN = 120

      class << self
        # ---- what a court may post ----

        # The targets a bounty in `zone` may name: { "kill" => {key => name},
        # "collect" => {key => name} }. A monster camping in the zone or one of
        # its dungeons; an item one of those monsters drops, one of their
        # gathering nodes yields, or one of the zone's relics (S5). Collect
        # targets are stackable items only: a bounty that took N pieces of gear
        # would eat the bag rows an explorer kept, one piece each. Built once from
        # the loaded data, which does not change while the world runs.
        def targets(zone)
          (@targets ||= {})[zone] ||= build_targets(zone)
        end

        # The catalogue the council is shown in its (cached) system prompt:
        # every contested zone with what a bounty there may target, the
        # monsters with the levels they camp at there, so a court can size a
        # bounty to the explorers who would take it.
        def catalogue
          @catalogue ||= Data.zones.keys.select { |k| Courts.contested?(k) }.sort.to_h do |k|
            t = targets(k)
            levels = camp_levels(k)
            kill = t["kill"].to_h { |m, name| [m, levels[m] ? "#{name} (level #{levels[m].join("-")})" : name] }
            [k, { "name" => Data.zones[k]["name"], "kill" => kill, "collect" => t["collect"] }]
          end
        end

        # monster => [lowest, highest] camp level in the zone and its dungeons
        def camp_levels(zone)
          camps = Data.zones.keys.select { |k| Courts.claim_zone(k) == zone }.flat_map { |k| Array(Data.zones[k]["camps"]) }
          camps.group_by { |c| c["monster"] }.transform_values do |cs|
            [cs.map { |c| c["min_lvl"].to_i }.min, cs.map { |c| c["max_lvl"].to_i }.max].uniq
          end
        end

        def target_name(kind, key)
          kind == "kill" ? Data.monsters.dig(key, "name") || key : Data.items.dig(key, "name") || key
        end

        # ---- the world thread ----

        # Combat.monster_death, for every member the kill rewards (one line
        # beside Quests.on_kill): each member holding a kill bounty for this
        # monster in this zone (or its parent, from a dungeon) counts one, as
        # quests do; reaching the count pays at once, wherever they stand.
        def on_kill(zone, ps, monster_key)
          held = kill_bounties(ps.char_id)
          return if held.empty?
          claim = Courts.claim_zone(zone.key)
          return unless claim
          held.each do |h|
            next unless h[:target] == monster_key && h[:zone] == claim
            n = BountyProgress.where(id: h[:progress_id], status: "active").update_all(["progress = progress + 1, updated_at = ?", Courts.now])
            next unless n == 1
            prog = BountyProgress.find(h[:progress_id])
            bounty = Bounty.find(h[:bounty_id])
            if prog.progress >= bounty.count
              pay!(ps, bounty, prog, zone)
            else
              World.to_char(ps.char_id, { t: "court_bounty", bounty: bounty_json(bounty, prog) })
            end
          end
        end

        # The court_bounty_accept action: standing at the posting court's board,
        # sworn to that court, the bounty open, not already taken, and under
        # the active cap. A refusal is a court_notice (a toast), never chat.
        def accept!(char_id, bounty_id)
          z, ps = World.find_player(char_id)
          return unless ps && ps.alive?
          bounty = Bounty.find_by(id: bounty_id.to_s.to_i) # .to_s: the cable may send any type
          why = accept_refusal(z, ps, bounty)
          return refuse(char_id, why) if why
          prog = BountyProgress.create!(bounty_id: bounty.id, character_id: char_id, progress: 0, status: "active")
          forget(char_id)
          World.to_char(char_id, { t: "court_bounty", bounty: bounty_json(bounty, prog, ps: ps), event: "accepted" })
          World.to_char(char_id, { t: "court_notice", kind: "bounty_accepted", court: bounty.court,
                                   text: "Bounty taken: #{label(bounty)}, for #{bounty.reward_each} gold." })
          prog
        rescue ActiveRecord::RecordNotUnique
          refuse(char_id, "You have already taken this bounty.")
        end

        # The court_bounty_deliver action (collect bounties): at the posting
        # court's board with the items in the bags. The place is taken before a
        # single item leaves the bags, so a delivery that comes too late costs
        # nothing.
        def deliver!(char_id, bounty_id)
          z, ps = World.find_player(char_id)
          return unless ps && ps.alive?
          bounty = Bounty.find_by(id: bounty_id.to_s.to_i)
          prog = bounty && BountyProgress.find_by(bounty_id: bounty.id, character_id: char_id)
          why = if !bounty || !prog || bounty.kind != "collect" then "You hold no such bounty."
                elsif prog.status != "active" || ps.court != bounty.court then "That bounty is closed to you."
                elsif bounty.status != "open" then "That bounty is no longer open."
                elsif (r = at_board(z, ps, bounty.court)) then r
                elsif held_count(char_id, bounty.target) < bounty.count
                  "You need #{bounty.count} #{target_name("collect", bounty.target)} to deliver."
                end
          return refuse(char_id, why) if why
          pay!(ps, bounty, prog, z, consume: true)
        end

        # Pays one place of `bounty` to `ps`, or marks the progress unpaid when
        # the places ran out first. A collect delivery consumes the items only
        # once the place is taken. The bounty's last place fills it: the other
        # holders are told it is closed and the court's members and board hear
        # who was paid.
        def pay!(ps, bounty, prog, zone, consume: false)
          paid = News.hold do
            Bounty.transaction do
              # The explorer's row before their items: one lock order
              # everywhere (characters by id, courts, then inventory rows), the
              # order a letter or a sale on a request thread takes.
              Character.lock.where(id: ps.char_id).load
              # The items next, under a row lock and by relative decrements: a
              # sale of the same stack on a request thread between the board's
              # count and here must not leave a paid delivery that took less.
              next :short if consume && !take_items!(ps.char_id, bounty.target, bounty.count)
              taken = Bounty.where(id: bounty.id, status: "open").where("places_paid < places")
                            .update_all(["places_paid = places_paid + 1, updated_at = ?", Courts.now])
              if taken.zero?
                # nothing paid, so nothing taken from the bags either
                raise ActiveRecord::Rollback if consume
                prog.update!(status: "unpaid")
                next false
              end
              reward = bounty.reward_each
              prog.update!(status: "paid", paid: reward, progress: [prog.progress, bounty.count].max)
              ps.gold += reward
              Character.where(id: ps.char_id).update_all(["gold = gold + ?", reward])
              # The gold was held out of the treasury when the bounty was
              # posted, so a payout moves nothing there: an event row, for the
              # councils' read.
              Treasury.event!(bounty.court, kind: "bounty_payout", character: ps, zone: bounty.zone,
                                            meta: { "bounty_id" => bounty.id, "gold" => reward })
              bounty.reload
              fill!(bounty) if bounty.places_paid >= bounty.places
              true
            end
          end
          if paid == :short
            return refuse(ps.char_id, "You need #{bounty.count} #{target_name("collect", bounty.target)} to deliver.")
          end
          if paid.nil? # rolled back: the places ran out before the items were taken
            prog.update!(status: "unpaid")
            paid = false
          end
          World.to_char(ps.char_id, { t: "inventory_dirty" }) if consume && paid
          forget(ps.char_id)
          zone&.mark_self_dirty(ps)
          if paid
            credit_claim(ps, bounty)
            World.to_char(ps.char_id, { t: "court_bounty", bounty: bounty_json(bounty, prog), event: "paid" })
            World.to_char(ps.char_id, { t: "court_notice", kind: "bounty_paid", court: bounty.court,
                                        text: "#{Courts.config.name(bounty.court)} pays you #{bounty.reward_each} gold: #{label(bounty)}." })
          else
            World.to_char(ps.char_id, { t: "court_bounty", bounty: bounty_json(bounty.reload, prog), event: "unpaid" })
            World.to_char(ps.char_id, { t: "court_notice", kind: "bounty_unpaid", court: bounty.court,
                                        text: "Every place on that bounty was taken before you finished. Nothing is owed." })
          end
          paid
        end

        # The boundary that closes a bounty's last sitting: what was not paid
        # goes back to the treasury, and anyone still working on it is told.
        # Runs whether or not the courts are dormant: open bounties run to their
        # expiry either way (COURTS.md "Dormant courts").
        def expire!(closed)
          Bounty.open_now.where("expires_cycle <= ?", closed.number).order(:id).lock.each do |b|
            b.update!(status: "expired")
            left = b.places - b.places_paid
            if left.positive?
              Treasury.release!(b.court, left * b.reward_each, kind: "bounty_refund", cycle: closed.number, zone: b.zone,
                                                             meta: { "bounty_id" => b.id, "places_unpaid" => left })
            end
            close_holders!(b)
          end
          @kills = {}
        end

        # An explorer who changes court gives up the bounties they took for the
        # old one, unpaid: a bounty is for the court's sworn members (PLAN
        # question 2), and finishing it after a switch would pay the old
        # court's gold for claim the new court earns. Inside the switch's
        # transaction; the messages wait for it to commit.
        def forfeit!(char_id, court)
          rows = BountyProgress.active.joins(:bounty).where(character_id: char_id, bounties: { court: court }).to_a
          return if rows.empty?
          BountyProgress.where(id: rows.map(&:id)).update_all(status: "unpaid", updated_at: Courts.now)
          rows.each do |p|
            p.status = "unpaid"
            msg = { t: "court_bounty", bounty: bounty_json(p.bounty, p), event: "forfeit" }
            News.later { World.to_char(char_id, msg) }
          end
          text = "You are no longer sworn to #{Text.mid(Courts.config.name(court))}: its #{rows.size == 1 ? "bounty is" : "bounties are"} closed to you."
          News.later do
            forget(char_id)
            World.to_char(char_id, { t: "court_notice", kind: "bounty_forfeit", court: court, text: text })
          end
        end

        # The character's bounties still in hand, for the journal: sent on
        # join and served by GET /api/courts/bounties.
        def active_for(char_id)
          BountyProgress.active.where(character_id: char_id).includes(:bounty).order(:id)
                        .map { |p| bounty_json(p.bounty, p) }
        end

        # bounty id => this explorer's standing on it (active, paid, unpaid), for
        # the board's rows: a bounty once taken is never offered again.
        def taken(char_id, page)
          ids = Array(page[:items]).select { |i| i[:type] == "bounty" }.map { |i| i[:id] }
          return {} if ids.empty? || char_id.nil?
          BountyProgress.where(character_id: char_id, bounty_id: ids).pluck(:bounty_id, :status).to_h
        end

        # What a tick's arrivals hold (Courts.on_joins).
        def join_messages(list)
          list.each { |ps| forget(ps.char_id) }
          held = BountyProgress.active.where(character_id: list.map(&:char_id)).includes(:bounty).order(:id).group_by(&:character_id)
          list.flat_map do |ps|
            Array(held[ps.char_id]).map { |p| [ps.char_id, { t: "court_bounty", bounty: bounty_json(p.bounty, p), event: "held" }] }
          end
        end

        # One bounty as the client shows it (the board, the journal, the pins).
        # With a progress row, that explorer's own count and standing.
        def bounty_json(b, prog = nil, ps: nil)
          progress = if prog.nil? then nil
                     elsif b.kind == "collect" then [held_count(prog.character_id, b.target), b.count].min
                     else prog.progress
                     end
          { id: b.id, court: b.court, kind: b.kind, zone: b.zone, zone_name: Data.zones.dig(b.zone, "name") || b.zone,
            target: b.target, target_name: target_name(b.kind, b.target), count: b.count, places: b.places,
            places_paid: b.places_paid, reward_each: b.reward_each, cycle: b.cycle, expires_cycle: b.expires_cycle,
            bounty_status: b.status, text: b.text, status: prog&.status, progress: progress,
            at: b.created_at&.iso8601 }.compact
        end

        def label(b)
          verb = b.kind == "kill" ? "hunt" : "deliver"
          "#{verb} #{target_name(b.kind, b.target)} ×#{b.count} (#{Data.zones.dig(b.zone, "name") || b.zone})"
        end

        # Gold held out of the treasuries for places not yet paid.
        def held_gold
          Bounty.open_now.sum("held - places_paid * reward_each").to_i
        end

        def reset!
          @kills = {}
          @targets = @catalogue = nil
        end

        private

        def accept_refusal(z, ps, bounty)
          return "That bounty is not on the board." unless bounty
          return "That bounty is no longer open." unless bounty.status == "open"
          return "Only explorers sworn to #{Text.mid(Courts.config.name(bounty.court))} may take its bounties." unless ps.court == bounty.court
          r = at_board(z, ps, bounty.court)
          return r if r
          return "You have already taken this bounty." if BountyProgress.exists?(bounty_id: bounty.id, character_id: ps.char_id)
          cap = Courts.config.bounty.fetch("active_per_character").to_i
          if BountyProgress.active.where(character_id: ps.char_id).count >= cap
            return "You already hold #{cap} bounties. Finish one, or let it run out, before taking another."
          end
          nil
        end

        # Why the player cannot use `court`'s board from where they stand.
        def at_board(z, ps, court)
          board = Halls.desk(z.definition, court, "board")
          return "Take it up at #{Text.mid(Courts.config.name(court))}'s board, in its audience hall." unless board
          Halls.refusal(z, ps, board)
        end

        def refuse(char_id, why)
          World.to_char(char_id, { t: "court_notice", kind: "refused", text: why })
          nil
        end

        # The last place is paid: the bounty is filled, the others still on it
        # are told it is closed (their progress is unpaid), and the posting
        # court's members and its board hear who was paid (COURTS.md "The
        # scripted news").
        def fill!(bounty)
          Bounty.where(id: bounty.id).update_all(status: "filled", updated_at: Courts.now)
          bounty.status = "filled"
          close_holders!(bounty)
          # in the order they were paid (an IN over an ordered subquery would
          # lose the order: Postgres returns the outer rows as it likes)
          paid = BountyProgress.where(bounty_id: bounty.id, status: "paid").order(:updated_at, :id).pluck(:character_id)
          by_id = Character.where(id: paid).pluck(:id, :name).to_h
          names = paid.filter_map { |id| by_id[id] }
          vars = { "target" => target_name(bounty.kind, bounty.target), "zone" => Data.zones.dig(bounty.zone, "name"),
                   "names" => names }
          payload = { "bounty_id" => bounty.id, "names" => names }
          text = News.render("bounty_filled", bounty.court, vars)
          News.publish!(kind: "bounty_filled", audience: "court", court: bounty.court, text: text, payload: payload)
          News.publish!(kind: "bounty_filled", audience: "board", court: bounty.court, text: text, payload: payload)
          @kills = {}
        end

        # Everyone still working on a closed bounty: unpaid, and told once the
        # surrounding transaction commits.
        def close_holders!(bounty)
          rows = BountyProgress.active.where(bounty_id: bounty.id).to_a
          return if rows.empty?
          BountyProgress.where(id: rows.map(&:id)).update_all(status: "unpaid", updated_at: Courts.now)
          rows.each do |p|
            p.status = "unpaid"
            msg = { t: "court_bounty", bounty: bounty_json(bounty, p), event: bounty.status }
            News.later { World.to_char(p.character_id, msg) }
          end
        end

        # The bounties a claim credit would follow: S4's Claims (a bounty paid
        # credits the finisher's own court in the bounty's zone). Until claims
        # exist this does nothing.
        def credit_claim(ps, bounty)
          Claims.on_bounty(ps, bounty) if defined?(Claims) && Claims.respond_to?(:on_bounty)
        end

        # Takes `count` of `item_key` from the bags (unequipped rows, oldest
        # first) with the rows locked, or nothing at all. -> true when taken.
        def take_items!(char_id, item_key, count)
          rows = InventoryItem.lock.where(character_id: char_id, item_key: item_key, equipped_slot: nil).order(:id).to_a
          return false if rows.sum(&:qty) < count
          left = count
          rows.each do |row|
            break if left <= 0
            take = [row.qty, left].min
            left -= take
            take == row.qty ? row.destroy! : InventoryItem.where(id: row.id).update_all(["qty = qty - ?", take])
          end
          true
        end

        def held_count(char_id, item_key)
          InventoryItem.where(character_id: char_id, item_key: item_key, equipped_slot: nil).sum(:qty).to_i
        end

        # The world thread asks this on every kill by every member, so the
        # answer (usually "none") is kept in memory per character and dropped
        # whenever it can change: an accept, a payment, a fill, an expiry, a
        # join.
        def kill_bounties(char_id)
          @kills ||= {}
          @kills[char_id] ||= BountyProgress.active.joins(:bounty)
                                            .where(character_id: char_id, bounties: { kind: "kill", status: "open" })
                                            .pluck(:id, :bounty_id, "bounties.target", "bounties.zone")
                                            .map { |pid, bid, t, zk| { progress_id: pid, bounty_id: bid, target: t, zone: zk } }
        end

        def forget(char_id)
          @kills&.delete(char_id)
        end

        def build_targets(zone)
          return { "kill" => {}, "collect" => {} } unless Courts.contested?(zone)
          zones = Data.zones.keys.select { |k| Courts.claim_zone(k) == zone }
          camps = zones.flat_map { |k| Array(Data.zones[k]["camps"]) }.select { |c| Data.monsters[c["monster"]] }
          # A boss or a named monster (fewer spawns than the smallest kill
          # count, each slow to return) is no bounty target, and neither is
          # what only it drops: "kill 5 of the Granary-Master" is one camp with
          # a fifteen-minute respawn, 75 minutes of waiting for one place.
          floor = Courts.config.bounty.fetch("kill_count").first.to_i
          rare = camps.group_by { |c| c["monster"] }.select do |_m, cs|
            cs.sum { |c| (c["count"] || 1).to_i } < floor && cs.all? { |c| c["respawn"].to_i >= RARE_RESPAWN }
          end.keys
          monsters = (camps.map { |c| c["monster"] }.uniq - rare).sort
          items = monsters.flat_map { |m| Array(Data.monsters[m]["drops"]).map { |d| d["item"] } }
          items += zones.flat_map { |k| Array(Data.zones[k]["nodes"]).filter_map { |n| World::NODE_ITEM[n["kind"]] } }
          items += Array(Courts.config.data.dig("relics", "zones", zone, "common")&.values)
          items = items.uniq.select { |i| %w[material consumable].include?(Data.items.dig(i, "slot")) }.sort
          { "kill" => monsters.to_h { |m| [m, Data.monsters[m]["name"]] },
            "collect" => items.to_h { |i| [i, Data.items[i]["name"]] } }
        end
      end

      # offer_bounty: a paid task from the treasury (COURTS.md "Verbs"). The
      # whole reward (places x reward each) is held when it is posted, so it
      # counts against the sitting's commit cap and must fit the treasury; the
      # target must exist in the zone (the catalogue in the system prompt). The
      # line is the court's, cleaned like a proclamation.
      module OfferBounty
        module_function

        def range(key) = Courts.config.bounty.fetch(key)

        def tool
          b = Courts.config.bounty
          cap = Courts.config.text_caps.fetch("bounty")
          {
            name: "offer_bounty",
            description: "Post a paid bounty on your hall's board, from your treasury. Only explorers sworn to you may take it. " \
                         "kind \"kill\": kill `count` of the monster `target` in `zone` (its dungeons count too); kind \"collect\": " \
                         "deliver `count` of the item `target` to your board. Targets must come from the bounty catalogue for that " \
                         "zone. `places` explorers are paid `reward_each` gold each, first come first paid; the whole " \
                         "places x reward_each is held from your treasury now and counts against this sitting's commit limit, and " \
                         "what is unpaid comes back when it expires after `cycles` sittings (this one included). Ranges, clamped: " \
                         "places #{b["places"].join("-")}, reward_each #{b["reward_each"].join("-")} gold, kill count " \
                         "#{b["kill_count"].join("-")}, collect count #{b["collect_count"].join("-")}, cycles #{b["cycles"].join("-")}. " \
                         "At most #{b["per_sitting"]} bounties a sitting. `text` is your court's line on the board, at most #{cap} " \
                         "characters, plain prose; write a player's name as {{Name}}.",
            input_schema: {
              type: "object",
              properties: {
                kind: { type: "string", enum: Bounty::KINDS, description: "kill or collect." },
                zone: { type: "string", description: "A contested zone key from the bounty catalogue." },
                target: { type: "string", description: "A monster key (kill) or item key (collect) listed for that zone." },
                count: { type: "integer", description: "How many to kill or deliver." },
                places: { type: "integer", description: "How many explorers are paid." },
                reward_each: { type: "integer", description: "Gold paid to each of them." },
                cycles: { type: "integer", description: "Sittings it stays open, this one included." },
                text: { type: "string", description: "Your court's line on the board." }
              },
              required: %w[kind zone target count places reward_each cycles text],
              additionalProperties: false
            }
          }
        end

        def once_per_turn? = false

        def clamp(_court, input, ctx)
          per = range("per_sitting").to_i
          return [false, nil, "only #{per} bounties a sitting"] if ctx[:bounties].to_i >= per
          kind = input.fetch("kind")
          zone = input.fetch("zone").to_s
          target = input.fetch("target").to_s
          return [false, nil, "#{zone} is not a contested zone"] unless Courts.contested?(zone)
          unless Bounties.targets(zone).fetch(kind).key?(target)
            return [false, nil, "#{target} is not a #{kind} target in #{zone}"]
          end
          notes = []
          pick = lambda do |key, value, field|
            lo, hi = range(key)
            v = value.to_i.clamp(lo, hi)
            notes << "#{field} clamped to #{v}" if v != value.to_i
            v
          end
          count = pick.call(kind == "kill" ? "kill_count" : "collect_count", input.fetch("count"), "count")
          places = pick.call("places", input.fetch("places"), "places")
          reward = pick.call("reward_each", input.fetch("reward_each"), "reward_each")
          cycles = pick.call("cycles", input.fetch("cycles"), "cycles")
          raw = input.fetch("text").to_s
          text = Text.clean(raw, max: Courts.config.text_caps.fetch("bounty"))
          clamped = { "kind" => kind, "zone" => zone, "target" => target, "count" => count, "places" => places,
                      "reward_each" => reward, "cycles" => cycles, "text" => text.presence }
          [true, clamped, notes.empty? ? nil : notes.join("; ")]
        end

        def cost(clamped) = clamped.fetch("places") * clamped.fetch("reward_each")

        def apply!(court, clamped, ctx)
          ctx[:bounties] = ctx[:bounties].to_i + 1
          cycle = ctx[:cycle] || Courts.cycle_number
          held = cost(clamped)
          b = Bounty.create!(court: court, cycle: cycle, expires_cycle: cycle + clamped["cycles"] - 1,
                             kind: clamped["kind"], zone: clamped["zone"], target: clamped["target"],
                             count: clamped["count"], places: clamped["places"], reward_each: clamped["reward_each"],
                             held: held, text: clamped["text"], court_turn_id: ctx[:turn]&.id,
                             created_at: Courts.now, updated_at: Courts.now)
          # The apply step has just checked the treasury inside this same
          # transaction, with the court's row locked, so the hold cannot fall
          # short; if it ever did, the bounty goes too rather than standing unfunded.
          taken = Treasury.hold!(court, held, kind: "bounty_hold", cycle: ctx[:cycle], zone: b.zone,
                                              meta: { "bounty_id" => b.id, "places" => b.places, "reward_each" => b.reward_each })
          unless taken
            b.destroy!
            return { "bounty_id" => nil, "held" => 0, "error" => "the treasury could not cover the hold" }
          end
          { "bounty_id" => b.id, "held" => held }
        end
      end

      Verbs.register("offer_bounty", OfferBounty)
    end

    # The board lists the court's open bounties beside its proclamations and
    # notices (COURTS.md "The audience hall").
    Board.source("bounty", 3) do |court, cursor, limit|
      Board.after(Bounty.open_now.where(court: court), cursor, "bounties").order(created_at: :desc, id: :desc).limit(limit)
           .map { |b| Bounties.bounty_json(b).merge(id: b.id, at: b.created_at, text: b.text) }
    end

    # Expiry at the boundary that closes a bounty's last sitting, after the
    # stipend (registration order).
    Cycle.on_boundary("bounties") { |closed, _opened| Bounties.expire!(closed) }

    GoldLog.held("bounties") { Bounties.held_gold }
  end
end
