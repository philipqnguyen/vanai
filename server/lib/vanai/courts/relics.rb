module Vanai
  module Courts
    # Relics (COURTS.md "Relics"): what explorers recover from the wild zones and
    # their dungeons, in three kinds, each wanted by one court: documents
    # (Moonmere), goods the empire took (Heartwood), surveys and maps (Caerdun).
    #
    # Common relics are ordinary stackable items (items.json, `relic: {zone,
    # kind}`), dropped on kills and found at gathering nodes; they sell at
    # auction like any material, and registering them at the explorer's own
    # court's registry pays the registrant from the treasury and credits that
    # court's claim in the relic's zone. Their real value is the market: a
    # explorer who does not care about the race sells to one sworn to the court
    # that wants that kind.
    #
    # Named relics are world-unique: a few slots per wild zone per cycle
    # (VANAI_NAMED_RELICS_PER_ZONE, default 1), found on a roll while a slot
    # remains, held in the finder's bags as a row linked to its named_relics row
    # and bound to them, crumbling 24 hours after it was found unless it is
    # registered. Registering pays ten times the court's price, credits 150
    # claim (exempt from the per-character cap) and writes the finder's name in
    # the book of names.
    #
    # Everything that writes runs on the world thread (kills, nodes, the
    # registry desk, the crumble sweep), so a zone's slot cannot be taken twice;
    # the unique (cycle, zone, slot) index is the backstop. Like claims.rb this
    # file is loaded by data.rb on its own, so it touches nothing at require time.
    module Relics
      KINDS = %w[documents goods surveys].freeze
      NAMED_ITEM = "named_relic".freeze

      # The bound row's backstop (InventoryItem): no path may move or destroy a
      # named relic's row but registration and crumbling.
      class Bound < StandardError
        def initialize(msg = "That relic is bound to you.") = super
      end

      # The SetRelicPrices verb is defined below and registered by courts.rb.

      class << self
        # Tests seed this. Both rolls use it rather than combat's rng, so a
        # seeded combat test sees exactly the rolls it saw before relics.
        attr_writer :rng

        def rng = @rng || Random
        def cfg = Courts.config.relics
        def data = Courts.config.data.fetch("relics")

        # ---- the data ----

        # A common relic's {zone, kind}, or nil for any other item.
        def relic_of(item_key) = Data.items.dig(item_key, "relic")

        # The zone's relic table: its common item per kind, its places and the
        # parts its named relics are made from.
        def table(zone) = data.dig("zones", zone)

        def default_prices = KINDS.to_h { |k| [k, cfg["price"].to_i] }

        def kind_name(kind) = data.dig("kinds", kind, "name") || kind

        # ---- the bound rows ----

        def releasing? = Thread.current[:vanai_relic_release] == true

        # Registration and crumbling: the only hands that may destroy a bound row.
        def release
          prev = Thread.current[:vanai_relic_release]
          Thread.current[:vanai_relic_release] = true
          yield
        ensure
          Thread.current[:vanai_relic_release] = prev
        end

        # World.trade_offer: a trade offer drops any named relic (bound to its
        # finder), and says why.
        def tradeable(char_id, items)
          ids = items.map { |it| it[:inv_id] }
          bound = World.db { InventoryItem.where(id: ids).where.not(named_relic_id: nil).pluck(:id) }
          return items if bound.empty?
          refuse(char_id, Bound.new.message)
          items.reject { |it| bound.include?(it[:inv_id]) }
        end

        # ---- finds (the world thread) ----

        # Combat.award_loot, last: a kill in a contested zone or one of its
        # dungeons may drop a common relic of that zone (one roll, widened by
        # the controlling court's +50% like any drop, Benefits.drop_recipient),
        # then rolls for the zone's named relic (no bonus; a random member finds
        # it). Stand-in players with no court (the pure combat tests) find none.
        def on_kill(zone, _m, members)
          sworn = members.select { |p| Claims.sworn(p) }
          return if sworn.empty?
          claim = Courts.claim_zone(zone.key)
          t = claim && table(claim)
          return unless t
          drop = { "item" => t.fetch("common").fetch(KINDS.sample(random: rng)), "chance" => cfg["drop_kill"].to_f }
          who = Benefits.drop_recipient(zone, sworn, drop, rng) { |pool| pool.sample(random: rng) }
          grant_common(who, drop["item"]) if who
          roll_named(zone, claim, sworn, cfg["named_kill"].to_f)
        end

        # World.interact, a gathering node: a common relic on its own roll (the
        # gathering bonus is for the node's own item), then the named roll.
        def on_gather(zone, ps)
          return unless Claims.sworn(ps)
          claim = Courts.claim_zone(zone.key)
          t = claim && table(claim)
          return unless t
          grant_common(ps, t.fetch("common").fetch(KINDS.sample(random: rng))) if rng.rand < cfg["drop_node"].to_f
          roll_named(zone, claim, [ps], cfg["named_node"].to_f)
        end

        # One roll for `claim`'s named relic this cycle. While the zone has a
        # slot left, a hit takes the next slot and puts the relic in a random
        # member's bags, bound to them. -> the NamedRelic, or nil.
        def roll_named(zone, claim, members, chance)
          return nil unless rng.rand < chance
          cycle = Courts.cycle_number
          return nil if cycle.zero?
          finder = members.sample(random: rng)
          relic = nil
          NamedRelic.transaction do
            taken = NamedRelic.where(cycle: cycle, zone: claim).count
            if taken < Courts.config.named_per_zone
              kind = KINDS.sample(random: rng)
              relic = NamedRelic.create!(cycle: cycle, zone: claim, slot: taken + 1, kind: kind, name: unused_name(claim, kind),
                                         finder_id: finder.char_id, finder_name: finder.name, found_at: Courts.now)
              InventoryItem.create!(character_id: finder.char_id, item_key: NAMED_ITEM, qty: 1, named_relic_id: relic.id)
            end
          end
          return nil unless relic
          found!(zone, finder, relic)
          relic
        rescue ActiveRecord::RecordNotUnique
          nil # the slot went first: no find
        end

        # ---- names, from parts by zone and kind (no AI call, no catalogue) ----

        # "Steward Aldo's Tally of the East Furnaces": a pattern for the kind,
        # filled with an owner, an object and a place from the zone's parts. A
        # part that begins "The" reads "the" anywhere but at the start.
        def name_for(zone, kind, rng = self.rng)
          t = table(zone).fetch("named").fetch(kind)
          fill(data.fetch("name_patterns").fetch(kind).sample(random: rng),
               "owner" => t.fetch("owners").sample(random: rng), "object" => t.fetch("objects").sample(random: rng),
               "place" => table(zone).fetch("places").sample(random: rng))
        end

        # Every name a zone and kind can make (the tests and the audit read it).
        def all_names(zone, kind)
          t = table(zone).fetch("named").fetch(kind)
          data.fetch("name_patterns").fetch(kind).product(t.fetch("owners"), t.fetch("objects"), table(zone).fetch("places"))
              .map { |p, o, ob, pl| fill(p, "owner" => o, "object" => ob, "place" => pl) }.uniq
        end

        def fill(pattern, parts)
          out = pattern.gsub(/\{(\w+)\}/) do
            v = parts.fetch(Regexp.last_match(1))
            Regexp.last_match.begin(0).zero? ? v : v.sub(/\AThe /, "the ")
          end
          out[0].upcase + out[1..]
        end

        # A name not yet given to a relic of this zone, when a few tries find one.
        def unused_name(zone, kind)
          used = NamedRelic.where(zone: zone).pluck(:name)
          name = nil
          6.times do
            name = name_for(zone, kind)
            break unless used.include?(name)
          end
          name
        end

        # ---- the crumble ----

        # Every held named relic found more than `crumble_hours` ago crumbles,
        # whether or not its finder is online: worked out from found_at, real
        # clock time (the one thing about the courts that is not per cycle).
        # Courts.tick runs it every minute; a join runs it for the one character.
        # `char_id`: one character's, or a list's (join_messages); nil sweeps all.
        def sweep!(char_id = nil)
          cutoff = Courts.now - cfg["crumble_hours"].to_f * 3600
          scope = NamedRelic.held.where("found_at <= ?", cutoff)
          scope = scope.where(id: InventoryItem.where(character_id: char_id).where.not(named_relic_id: nil).select(:named_relic_id)) if char_id
          scope.to_a.each do |r|
            holder = nil
            NamedRelic.transaction do
              next unless NamedRelic.where(id: r.id, status: "held").update_all(status: "crumbled", updated_at: Courts.now) == 1
              holder = InventoryItem.where(named_relic_id: r.id).pick(:character_id)
              InventoryItem.where(named_relic_id: r.id).delete_all
            end
            next unless holder
            r.status = "crumbled"
            World.to_char(holder, { t: "court_relic", relic: relic_json(r), event: "crumbled" })
            World.to_char(holder, { t: "inventory_dirty" })
          end
        end

        # Courts.on_join: crumble what has expired first (so the bags never show
        # it), then tell the client what the character carries.
        def join_messages(list)
          ids = list.map(&:char_id)
          sweep!(ids)
          holder = InventoryItem.where(character_id: ids).where.not(named_relic_id: nil).pluck(:named_relic_id, :character_id).to_h
          return [] if holder.empty?
          held = NamedRelic.held.where(id: holder.keys).order(:id).group_by { |r| holder[r.id] }
          list.flat_map do |ps|
            Array(held[ps.char_id]).map { |r| [ps.char_id, { t: "court_relic", relic: relic_json(r), event: "held" }] }
          end
        end

        def held_by(char_id)
          NamedRelic.held.where(id: InventoryItem.where(character_id: char_id).select(:named_relic_id)).order(:id).to_a
        end

        # ---- the registry desk (the world thread) ----

        # The court_register action: at the character's own court's registry
        # desk, a stack of common relics ({inv_id, qty}) or one named relic
        # ({named_relic_id}). A refusal is a toast, never chat.
        def register!(char_id, input)
          z, ps = World.find_player(char_id)
          return unless ps && ps.alive?
          why = desk_refusal(z, ps)
          return refuse(char_id, why) if why
          input = (input || {}).to_h.transform_keys(&:to_s)
          # .to_s first: the cable may send any type, and an Array has no to_i
          named = input["named_relic_id"].to_s.to_i
          if named.positive?
            register_named!(z, ps, named)
          else
            register_common!(z, ps, input["inv_id"].to_s.to_i, input["qty"].to_s.to_i)
          end
        end

        # What the court pays per relic of `kind` right now, and whether that is
        # the reduced rate: the full price while the cycle's budget has room for
        # it, a quarter after (at least 1 gold).
        def unit_price(court_row, kind, spent, named: false)
          full = price_of(court_row, kind) * (named ? cfg["named_mult"].to_i : 1)
          return [full, false] if spent + full <= court_row.relic_budget.to_i
          [reduced(full), true]
        end

        def price_of(court_row, kind)
          (court_row.relic_prices || {})[kind]&.to_i || cfg["price"].to_i
        end

        def reduced(full) = [(full * cfg["reduced"].to_f).ceil, 1].max

        # Gold the court's registry has paid out this cycle, against its budget.
        def budget_spent(court, cycle = Courts.cycle_number)
          RelicRegistration.where(court: court, cycle: cycle).sum(:paid).to_i
        end

        # Common relics this character has registered this cycle (the cap).
        def registered_count(char_id, cycle = Courts.cycle_number)
          RelicRegistration.where(character_id: char_id, cycle: cycle, named_relic_id: nil).sum(:qty).to_i
        end

        # ---- the panels and the book ----

        # Halls.interact, the registry desk: whose desk it is, what it pays,
        # what is left of the budget and of the explorer's cap, and (at the
        # explorer's own court's desk) every relic in the bags with what it
        # would fetch now.
        def registry_panel(ps, court)
          row = Court.find_by!(key: court)
          cycle = Courts.cycle_number
          spent = budget_spent(court, cycle)
          used = registered_count(ps.char_id, cycle)
          own = ps.court == court
          prices = KINDS.to_h { |k| [k, price_of(row, k)] }
          # spent, for the desk's purposes, once not even the cheapest kind's
          # full price fits what is left
          panel = { own: own, sworn: ps.court, sworn_name: ps.court && Courts.config.name(ps.court),
                    prices: prices, budget: row.relic_budget.to_i, spent: spent,
                    reduced_now: spent + prices.values.min > row.relic_budget.to_i, cap: cfg["per_character"].to_i, registered: used,
                    named_mult: cfg["named_mult"].to_i, kinds: KINDS.to_h { |k| [k, kind_name(k)] },
                    wants: Courts.config.court(court)["wants"], relics: [], named: [] }
          return panel unless own
          InventoryItem.where(character_id: ps.char_id, equipped_slot: nil, named_relic_id: nil).order(:id).each do |ii|
            rel = relic_of(ii.item_key) or next
            price, red = unit_price(row, rel["kind"], spent)
            panel[:relics] << { inv_id: ii.id, item_key: ii.item_key, name: Data.items.dig(ii.item_key, "name"), qty: ii.qty,
                                kind: rel["kind"], zone: rel["zone"], zone_name: zone_name(rel["zone"]), price: price, reduced: red }
          end
          panel[:named] = held_by(ps.char_id).map do |r|
            reward, red = unit_price(row, r.kind, spent, named: true)
            relic_json(r).merge(reward: reward, reduced: red)
          end
          panel
        end

        # One page of the book of names: the named relics registered with
        # `court` (all courts when nil), newest first, filterable by zone. The
        # name is the finder's as it was written, so it outlives the character.
        def book(court: nil, zone: nil, page: 1)
          per = Courts.config.page
          scope = NamedRelic.registered
          scope = scope.where(court: court) if court.present?
          scope = scope.where(zone: zone) if zone.present?
          total = scope.count
          page = page.to_i.clamp(1, [(total + per - 1) / per, 1].max)
          rows = scope.order(registered_at: :desc, id: :desc).offset((page - 1) * per).limit(per)
          { entries: rows.map { |r| book_entry(r) }, total: total, page: page, pages: [(total + per - 1) / per, 1].max,
            zone: zone.presence, zones: Claims.zones.map { |k| { key: k, name: zone_name(k) } } }
        end

        def book_entry(r)
          { id: r.id, relic: r.name, kind: r.kind, zone: r.zone, zone_name: zone_name(r.zone), finder_name: r.finder_name,
            court: r.court, registered_at: r.registered_at&.iso8601, cycle: r.registered_cycle }
        end

        # The digest's named-relic section: every named relic registered in the
        # closing sitting, with its finder, in the registering court's voice.
        def digest_entries(closed)
          NamedRelic.registered.where(registered_cycle: closed.number).order(:registered_at, :id).map do |r|
            { "kind" => "digest_named", "court" => r.court,
              "vars" => { "relic" => r.name, "zone" => zone_name(r.zone), "name" => r.finder_name } }
          end
        end

        # A named relic as the client shows it (the bags, the registry, the
        # court_relic message).
        def relic_json(r)
          { id: r.id, name: r.name, kind: r.kind, kind_name: kind_name(r.kind), zone: r.zone, zone_name: zone_name(r.zone),
            found_at: r.found_at&.iso8601, crumbles_in: crumbles_in(r), status: r.status }
        end

        # game_controller inv_payload: the bound row's own name and countdown
        # (nil for every other row).
        def inv_info(ii)
          return nil unless ii.named_relic_id
          r = ii.named_relic
          r && relic_json(r)
        end

        def crumbles_in(r)
          return nil unless r.status == "held"
          [(r.found_at + cfg["crumble_hours"].to_f * 3600 - Courts.now).round, 0].max
        end

        def reset!
          @rng = nil
        end

        private

        def zone_name(key) = Data.zones.dig(key, "name") || key

        def grant_common(ps, item)
          World.grant_item(ps, item, 1)
          World.to_char(ps.char_id, { t: "loot", item: item, name: Data.items.dig(item, "name") })
        end

        # A find: the finder is told (and their bags redrawn); everyone else in
        # the zone (or its dungeons) hears that the zone's relic has turned up,
        # each in their own court's voice. Never stored: it is news only for
        # those standing there (COURTS.md "The scripted news").
        def found!(zone, finder, relic)
          World.to_char(finder.char_id, { t: "court_relic", relic: relic_json(relic), event: "found" })
          World.to_char(finder.char_id, { t: "inventory_dirty" })
          zname = zone_name(relic.zone)
          texts = {}
          News.later do
            Courts.each_online do |ps|
              next if ps.char_id == finder.char_id || Courts.claim_zone(ps.zone) != relic.zone || !KEYS.include?(ps.court)
              text = texts[ps.court] ||= News.render("named_found", ps.court, { "zone" => zname })
              World.to_char(ps.char_id, { t: "court_notice", kind: "named_found", text: text, zone: relic.zone, court: ps.court })
            end
          end
        end

        def refuse(char_id, why)
          World.to_char(char_id, { t: "court_notice", kind: "refused", text: why })
          nil
        end

        # Only the character's own court's registry may enter their relics.
        def desk_refusal(z, ps)
          desk = Halls.desk(z.definition, ps.court, "registry")
          unless desk
            hall = Courts.config.data.dig("halls", ps.court, "name")
            return "Only your own court's registry enters your relics: #{Text.mid(Courts.config.name(ps.court))}'s, in #{hall}."
          end
          Halls.refusal(z, ps, desk)
        end

        def register_common!(z, ps, inv_id, qty)
          row = InventoryItem.find_by(id: inv_id, character_id: ps.char_id, equipped_slot: nil, named_relic_id: nil)
          rel = row && relic_of(row.item_key)
          return refuse(ps.char_id, "You carry no such relic.") unless rel
          cap = cfg["per_character"].to_i
          left = cap - registered_count(ps.char_id)
          if left <= 0
            return refuse(ps.char_id, "You have entered #{cap} relics this sitting, as many as the registry takes from one explorer. " \
                                      "It takes more when the court sits again.")
          end
          qty = (qty.to_i.positive? ? qty.to_i : 1).clamp(1, row.qty)
          qty = [qty, left].min
          court = ps.court
          paid = reduced_qty = 0
          item_key = row.item_key
          entered = News.hold do
            Court.transaction do
              # The registrant before the court: one lock order everywhere
              # (characters by id, courts, then inventory rows), the order an
              # auction buy takes, so the two cannot deadlock.
              Character.lock.where(id: ps.char_id).load
              # the court's row locked: two explorers cannot both spend the
              # budget's last room
              court_row = Court.lock.find_by!(key: court)
              # The stack again, locked, and taken by a relative decrement: a
              # sale or a listing of it on a request thread since the read above
              # must not leave a registration paid for relics no longer there.
              row = InventoryItem.lock.find_by(id: row.id, character_id: ps.char_id, equipped_slot: nil, named_relic_id: nil)
              next false unless row && row.qty >= qty
              cycle = Courts.cycle_number
              spent = budget_spent(court, cycle)
              owed = 0
              qty.times do
                price, red = unit_price(court_row, rel["kind"], spent + owed)
                owed += price
                reduced_qty += 1 if red
              end
              paid = pay!(court, owed, ps, "relic_common", rel["zone"],
                          { "item" => row.item_key, "qty" => qty, "reduced_qty" => reduced_qty })
              row.qty == qty ? row.destroy! : InventoryItem.where(id: row.id).update_all(["qty = qty - ?", qty])
              RelicRegistration.create!(character_id: ps.char_id, character_name: ps.name, court: court, cycle: cycle,
                                        zone: rel["zone"], kind: rel["kind"], item_key: item_key, qty: qty, paid: paid,
                                        reduced_qty: reduced_qty, points: Courts.config.claims["relic_common"] * qty,
                                        created_at: Courts.now)
              announce_budget!(court_row, cycle, spent + paid, reduced_qty.positive?)
              true
            end
          end
          return refuse(ps.char_id, "You no longer carry that many.") unless entered
          Claims.on_relic(ps, rel["zone"], qty)
          done!(z, ps, court, "#{Courts.config.name(court)} enters #{qty} × #{Text.mid(Data.items.dig(item_key, "name"))}" \
                              "#{reduced_qty.positive? ? " (the reduced rate)" : ""}. You are paid #{paid} gold.")
        end

        def register_named!(z, ps, relic_id)
          relic = NamedRelic.find_by(id: relic_id, status: "held")
          row = relic && InventoryItem.find_by(named_relic_id: relic.id, character_id: ps.char_id)
          return refuse(ps.char_id, "You carry no such relic.") unless row
          # Past its 24 hours it has crumbled, whether or not the minute's sweep
          # has reached it yet (COURTS.md "crumbles 24 hours after it is found").
          if crumbles_in(relic).to_i <= 0
            sweep!(ps.char_id)
            return refuse(ps.char_id, "#{relic.name} has crumbled to nothing in your hands.")
          end
          court = ps.court
          paid = 0
          reduced = false
          News.hold do
            Court.transaction do
              # the registrant before the court, as register_common! has it
              Character.lock.where(id: ps.char_id).load
              court_row = Court.lock.find_by!(key: court)
              cycle = Courts.cycle_number
              spent = budget_spent(court, cycle)
              reward, reduced = unit_price(court_row, relic.kind, spent, named: true)
              paid = pay!(court, reward, ps, "relic_named", relic.zone, { "named_relic_id" => relic.id, "name" => relic.name })
              relic.update!(status: "registered", registered_at: Courts.now, registered_cycle: cycle, court: court,
                            registrant_name: ps.name, reward: paid)
              release { row.destroy! }
              RelicRegistration.create!(character_id: ps.char_id, character_name: ps.name, court: court, cycle: cycle,
                                        zone: relic.zone, kind: relic.kind, named_relic_id: relic.id, qty: 1, paid: paid,
                                        reduced_qty: reduced ? 1 : 0, points: Courts.config.claims["relic_named"],
                                        created_at: Courts.now)
              announce_budget!(court_row, cycle, spent + paid, reduced)
            end
          end
          Claims.on_relic(ps, relic.zone, 1, named: true)
          World.to_char(ps.char_id, { t: "court_relic", relic: relic_json(relic), event: "registered" })
          done!(z, ps, court, "#{Courts.config.name(court)} enters #{Text.mid(relic.name)} in its book of names" \
                              "#{reduced ? " (the reduced rate)" : ""}. You are paid #{paid} gold.")
        end

        # Gold from the treasury to the registrant: what it owes, or what the
        # treasury holds when that is less (a treasury never goes below zero,
        # and the registry never closes). -> the gold paid.
        def pay!(court, owed, ps, kind, zone, meta)
          return 0 unless owed.positive?
          paid = Treasury.debit!(court, owed, kind: kind, character: ps, zone: zone, meta: meta.merge("owed" => owed),
                                              allow_partial: true).to_i
          if paid.positive?
            ps.gold += paid
            Character.where(id: ps.char_id).update_all(["gold = gold + ?", paid])
          end
          paid
        end

        # The board hears once a sitting that the budget is spent (COURTS.md
        # "The scripted news": the hall board): the full price no longer fits,
        # so the desk has started paying the reduced rate.
        def announce_budget!(court_row, cycle, spent, reduced)
          return if spent < court_row.relic_budget.to_i && !reduced
          return if CourtNews.where(kind: "budget_spent", court: court_row.key, cycle: cycle).exists?
          News.publish!(kind: "budget_spent", audience: "board", court: court_row.key, cycle: cycle)
        end

        # After a registration: the toast, the bags and gold redrawn, and the
        # registry panel again with what is left.
        def done!(z, ps, court, text)
          z.mark_self_dirty(ps)
          World.to_char(ps.char_id, { t: "inventory_dirty" })
          World.to_char(ps.char_id, { t: "court_notice", kind: "registered", court: court, text: text })
          desk = Halls.desk(z.definition, court, "registry")
          Halls.interact(z, ps, desk) if desk
        end
      end

      # set_relic_prices (COURTS.md "Verbs"): what the court's registry pays
      # per common relic of each kind, and its relic budget for the sitting.
      # Prices 5-300 gold, the budget 0-5000 (clamped). The budget is not held
      # from the treasury (it is spent from it as explorers register, and never
      # below zero), so the verb costs nothing against the commit cap.
      module SetRelicPrices
        module_function

        def range(key) = Courts.config.relics.fetch(key)

        def tool
          lo, hi = range("price_range")
          blo, bhi = range("budget_range")
          {
            name: "set_relic_prices",
            description: "Set what your registry pays an explorer for each common relic of each kind (#{lo}-#{hi} gold) and your " \
                         "relic budget for this sitting (#{blo}-#{bhi} gold); out-of-range values are clamped. Only your own " \
                         "sworn explorers register with you; a named relic pays #{Courts.config.relics["named_mult"]} times the " \
                         "price of its kind. Once the sitting's registrations have spent the budget, your registry pays a quarter " \
                         "of the price until you sit again. Only the first call in a sitting counts.",
            input_schema: {
              type: "object",
              properties: {
                documents: { type: "integer", description: "Gold per common relic of documents." },
                goods: { type: "integer", description: "Gold per common relic of goods the empire took." },
                surveys: { type: "integer", description: "Gold per common relic of surveys and maps." },
                budget: { type: "integer", description: "The most your registry pays at full price this sitting." }
              },
              required: %w[documents goods surveys budget],
              additionalProperties: false
            }
          }
        end

        def once_per_turn? = true

        def clamp(_court, input, _ctx)
          notes = []
          pick = lambda do |key, field|
            lo, hi = range(key)
            v = input.fetch(field).to_i
            c = v.clamp(lo, hi)
            notes << "#{field} clamped to #{c}" if c != v
            c
          end
          prices = Relics::KINDS.to_h { |k| [k, pick.call("price_range", k)] }
          budget = pick.call("budget_range", "budget")
          [true, { "prices" => prices, "budget" => budget }, notes.empty? ? nil : notes.join("; ")]
        end

        def cost(_clamped) = 0

        def apply!(court, clamped, ctx)
          row = ctx.fetch(:court_row)
          from = { "prices" => Relics::KINDS.to_h { |k| [k, Relics.price_of(row, k)] }, "budget" => row.relic_budget.to_i }
          Court.where(key: court).update_all(relic_prices: clamped["prices"], relic_budget: clamped["budget"], updated_at: Time.current)
          row.relic_prices = clamped["prices"]
          row.relic_budget = clamped["budget"]
          Treasury.event!(court, kind: "set_relic_prices", cycle: ctx[:cycle], meta: { "from" => from, "to" => clamped })
          { "from" => from, "to" => clamped }
        end
      end
    end
  end
end
