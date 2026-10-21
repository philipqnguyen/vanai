module Vanai
  # The three city courts (COURTS.md): model-driven patrons with treasuries, a
  # clamped set of verbs and a ledger. This module is the facade every hook in
  # the rest of the game calls; nothing outside lib/vanai/courts* knows the
  # tables.
  #
  # The courts are the one deliberate exception to per-character world state:
  # treasuries, tax rates, claims, bounties and named relics are shared world
  # state. Do not "fix" them into per-character rows.
  module Courts
    # Module level, not inside `class << self`, so every file sees it.
    KEYS = %w[caerdun heartwood moonmere].freeze
    # The houses that charge a court's tax: the three cities, and the returned
    # Capital, which charges the leading court's rate.
    CAPITAL_HOUSE = "capitalreturned".freeze
    # The empty Capital is the Regent's ground and is out of the claims race.
    UNCONTESTED = %w[capital].freeze
    # The world tick calls in every 0.25 s; the schedule needs far less.
    CHECK_EVERY = 5.0
    SWEEP_EVERY = 60.0

    class << self
      attr_writer :client, :job_runner, :clock
      # Tests set this to force dormant (true) or awake (false).
      attr_accessor :dormant_override

      def config
        @config ||= Config.load(Rails.root)
      end

      def reload_config!
        @config = nil
        config
      end

      # Wall time for the schedule (the world tick's own clock is monotonic).
      def now
        @clock ? @clock.call : Time.current
      end

      # No ANTHROPIC_API_KEY: no council runs, every house charges 3%, and no
      # new bounties, proclamations or letters appear. Everything mechanical
      # keeps working (COURTS.md "Dormant courts"). VANAI_COURTS_STUB=1 wakes
      # them in development with the DevStub instead of the API.
      def dormant?
        return dormant_override unless dormant_override.nil?
        ENV["ANTHROPIC_API_KEY"].to_s.strip.empty? && !dev_stub?
      end

      def dev_stub?
        ENV["VANAI_COURTS_STUB"] == "1" && !Rails.env.production?
      end

      def client
        return @client if @client
        return nil if dormant?
        @client = dev_stub? ? DevStub.new : AnthropicClient.new
      end

      def job_runner
        @job_runner ||= ->(number) { CouncilJob.perform_later(number) }
      end

      # The open cycle's number (0 before the first). Read from the database,
      # not cached, because request handlers and Sidekiq ask too.
      def cycle_number
        CouncilCycle.open_cycle.pick(:number) || 0
      end

      # The court rows exist in every database, including one built from
      # schema.rb, which never runs the creating migration's seed.
      def ensure_courts!
        return if @courts_ensured
        KEYS.each do |k|
          Court.insert({ key: k, name: config.name(k), treasury: config.start_treasury,
                         tax_bp: config.tax["start_bp"], relic_prices: Relics.default_prices,
                         relic_budget: config.relics["budget"], created_at: Time.current, updated_at: Time.current },
                       unique_by: :key)
        end
        # The zero claim rows CreateClaims seeds, here too: a database loaded
        # from schema.rb (a new deploy, db:test:prepare) has the table but not
        # the migration's INSERT, and the boundary decays and reads only rows
        # that exist.
        now = Time.current
        ZoneClaim.insert_all(Claims.zones.product(KEYS).map { |z, c| { zone: z, court: c, points: 0, updated_at: now } },
                             unique_by: %i[zone court])
        @courts_ensured = true
      end

      # ---- the world thread ----

      # Called by World.run_loop every tick (one line, after tick_gate_prompts).
      # Throttled; never makes an HTTP call (the CouncilJob does that).
      def tick(t)
        return if @next_check && t < @next_check
        @next_check = t + CHECK_EVERY
        ActiveRecord::Base.connection_pool.with_connection do
          Claims.flush!
          check!
          if @next_sweep.nil? || t >= @next_sweep
            @next_sweep = t + SWEEP_EVERY
            GoldLog.tick!
            Relics.sweep!
          end
        end
      rescue => e
        Rails.logger.error("[courts] tick error: #{e.class}: #{e.message}\n#{e.backtrace.first(8).join("\n")}")
        ErrorReports.report(e, "courts tick")
      end

      # One unthrottled pass (the tests call this directly).
      def check!(now = self.now)
        ensure_courts!
        sync_dormant!
        Cycle.check!(now)
      end

      # The stored flag against the key's presence. A change (including the
      # first boot after the key is added or removed) posts one notice; waking
      # also puts every court back at 3%. An absent flag counts as awake, so the
      # first boot with no key adjourns once and a first boot with one is silent.
      def sync_dormant!
        d = dormant?
        stored = CourtFlag.get("dormant")
        return d if stored == d
        CourtFlag.set("dormant", d)
        if d
          adjourn! unless stored == true
        elsif stored == true
          resume!
        end
        d
      end

      def on_join(ps) = on_joins([ps])

      # Every join of a tick at once (World.finish_joins): each part reads its
      # rows for all of them in a query or two, where one join at a time asked
      # ~12, 3.4 ms of a 4.4 ms join on the world thread. Each character hears
      # the same messages in the same order as on_join alone sends them.
      def on_joins(list)
        [method(:state_messages), Bounties.method(:join_messages), Relics.method(:join_messages),
         Letters.method(:join_messages)].each do |part|
          join_part(part, list).each { |char_id, msg| World.to_char(char_id, msg) }
        end
      end

      # A part's messages, [char_id, message] each, built before any is sent.
      # One that fails for the whole tick is built again for each arrival
      # alone, so a bad row costs its own character the part and no one else.
      def join_part(part, list)
        part.call(list)
      rescue => e
        Rails.logger.error("[vanai] courts join #{part.name} (#{list.size}): #{e.class}: #{e.message}")
        ErrorReports.report(e, "courts join #{part.name}", characters: list.size)
        list.size > 1 ? list.flat_map { |ps| join_part(part, [ps]) } : []
      end

      def state_messages(list)
        states = state_payloads(list.map(&:char_id))
        list.map { |ps| [ps.char_id, states[ps.char_id]] }
      end

      def on_leave(_ps) = nil

      # Dev: the council sits now. Only moves the open cycle's due time, so it
      # works from another process too (`bin/rails courts:council_now`); the
      # world tick does the rest within CHECK_EVERY.
      def run_now!(char_id = nil)
        n = CouncilCycle.where(closed_at: nil).update_all(due_at: now, updated_at: now)
        @next_check = nil
        msg = n.zero? ? "No council cycle is open yet; it opens on the next tick." : "The council is called to sit now#{" (dormant: no turns)" if dormant?}."
        World.to_char(char_id, { t: "system", msg: msg }) if char_id
        n
      end

      # ---- allegiance ----

      def court_of(who)
        case who
        when Integer then Character.where(id: who).pick(:court)
        when Character then who.court
        else who.court
        end
      end

      # The court_state message: the character's court and the world's courts
      # as the client needs them: the switch, the cycle, the rates, what is
      # unread in the window, the control of the wild zones (S4: the maps'
      # banners, the member discounts the client shows), and the latest digest
      # the character has not been shown (a player who was offline gets it at
      # login). The letters' unread count (S6) joins the news' in the badge.
      def state_payload(char_id) = state_payloads([char_id])[char_id]

      # char_id => court_state, for many characters at once. A boundary and
      # every council apply send it to everyone online from the world thread,
      # so the world-wide part (the cycle, the rates, control) is read once and
      # the per-character part in a few grouped queries, not ~8 per player.
      def state_payloads(char_ids)
        ids = char_ids.compact.uniq
        return {} if ids.empty?
        cycle = CouncilCycle.open_cycle.first
        number = cycle&.number || 0
        world = { t: "court_state", cycle: number, cycle_ends_in: cycle ? [(cycle.due_at - now).round, 0].max : nil,
                  dormant: dormant?, tax: tax_table, control: Claims.control }
        chars = Character.where(id: ids).select(:id, :court, :court_switched_cycle, :court_digest_seen_cycle).index_by(&:id)
        news = News.unread_counts(chars.keys)
        letters = CourtLetter.where(character_id: chars.keys, status: "unread").group(:character_id).count
        digest = News.latest_digest
        ids.to_h do |id|
          c = chars[id]
          [id, world.merge(court: c&.court, court_name: c&.court && config.name(c.court),
                           switch_used: !cycle.nil? && c&.court_switched_cycle == number,
                           unread: { news: news.fetch(id, 0), letters: letters.fetch(id, 0) },
                           digest: c && digest && digest[:cycle].to_i > c.court_digest_seen_cycle.to_i ? digest : nil)]
        end
      end

      # Seconds until the open cycle closes, or nil before the first.
      def cycle_ends_in
        due = CouncilCycle.open_cycle.pick(:due_at)
        due && [(due - now).round, 0].max
      end

      # ---- taxes (the auction wiring waits for the second merge) ----

      # The rate the house in `zone` charges the buyer, as a fraction, or nil
      # where there is no house. Dormant: the standing 3% everywhere.
      def tax_rate(zone)
        return nil unless house?(zone)
        start = config.tax["start_bp"] / 10_000.0
        return start if dormant?
        court = tax_court(zone)
        return start unless court
        Court.where(key: court).pick(:tax_bp).to_i / 10_000.0
      end

      # The court whose treasury the tax in `zone` goes to: the city's own
      # court, or for the returned Capital the court controlling the most wild
      # zones; nil where there is no house or no leader (a tie: that tax is a
      # sink, burned as the old cut was). Dormant courts still receive their 3%.
      def tax_court(zone)
        return city_court(zone) if city_court(zone)
        return capital_leader if zone == CAPITAL_HOUSE
        nil
      end

      # What the buyer is shown and must send back: the tax rounded up to whole
      # gold. -> { rate_bp:, tax:, total: } or nil where there is no house.
      def quote(zone, price)
        rate = tax_rate(zone)
        return nil unless rate
        bp = (rate * 10_000).round
        price = price.to_i
        tax = (price * bp + 9_999) / 10_000
        { rate_bp: bp, tax: tax, total: price + tax }
      end

      # Credits the tax to the house's court with its ledger row. Meant to run
      # inside the auction's buy transaction: it joins it, so the purchase and
      # the tax commit or roll back together. -> the new balance, or nil when no
      # court takes this tax.
      def record_tax!(zone:, amount:, buyer: nil, listing_id: nil)
        court = tax_court(zone)
        return nil unless court && amount.to_i.positive?
        Treasury.credit!(court, amount.to_i, kind: "tax", character: buyer, zone: zone,
                                             meta: { "house" => zone, "listing_id" => listing_id })
      end

      # The leading court for the Capital's house, kept in court_flags by the
      # claims boundary (S4) with `capital_leader_from`.
      def capital_leader
        v = CourtFlag.get("capital_leader")
        KEYS.include?(v) ? v : nil
      end

      # Highest total claim leads; a tie at the top keeps the incumbent if it is
      # one of the tied, otherwise nobody; nobody with any points, nobody.
      def leader_from(totals, incumbent)
        best = totals.values.max.to_f
        return nil unless best.positive?
        top = totals.select { |_, v| v.to_f == best }.keys
        return top.first if top.size == 1
        top.include?(incumbent) ? incumbent : nil
      end

      # The Capital's leader (Philip, 2026-10-12): the court controlling the
      # most wild zones. A tie at the top, or nobody holding any, leaves the
      # Capital without a leader: its house charges the standing 3% and that tax
      # goes to no court, a plain gold sink. No incumbent rule, unlike a zone.
      def capital_leader_from(held_counts)
        best = held_counts.values.max.to_i
        return nil unless best.positive?
        top = held_counts.select { |_, v| v.to_i == best }.keys
        top.size == 1 ? top.first : nil
      end

      def tax_table
        KEYS.to_h { |k| [k, ((tax_rate(config.court(k).fetch("city")) || 0) * 10_000).round] }
      end

      # ---- zones ----

      def house?(zone) = !city_court(zone).nil? || zone == CAPITAL_HOUSE

      def city_court(zone)
        KEYS.find { |k| config.court(k).fetch("city") == zone }
      end

      # The wild zones are contested: every field zone but the empty Capital.
      def contested?(zone)
        z = Data.zones[zone]
        !!z && z["kind"] == "field" && !UNCONTESTED.include?(zone)
      end

      # The zone a piece of work credits: a contested zone itself, a dungeon's
      # parent (the one zone its portals lead to; the Keep's is the Capital, so it
      # earns nothing), nil for cities, voyages and the Capital.
      def claim_zone(zone)
        return zone if contested?(zone)
        z = Data.zones[zone]
        return nil unless z && z["kind"] == "dungeon"
        parents = Array(z["portals"]).map { |p| p["to"] }.uniq
        parents.size == 1 && contested?(parents.first) ? parents.first : nil
      end

      # ---- news ----

      # Stores a notice and delivers it to its audience online (News.publish!,
      # which renders the templates and holds delivery inside a boundary).
      def publish!(kind:, text: nil, audience: "all", court: nil, payload: {}, **opts)
        News.publish!(kind: kind, text: text, audience: audience, court: court, payload: payload, **opts)
      end

      def broadcast_cycle!(cycle)
        msg = { t: "court_cycle", cycle: cycle.number, cycle_ends_in: [(cycle.due_at - now).round, 0].max, dormant: dormant? }
        each_online { |ps| World.to_char(ps.char_id, msg) }
        broadcast_state!
      end

      def broadcast_state!
        online = []
        each_online { |ps| online << ps.char_id }
        state_payloads(online).each { |id, msg| World.to_char(id, msg) }
      end

      def each_online
        # World keeps its online set private; reading it here keeps world.rb's
        # hooks to one line each. The world thread is the only writer.
        (World.instance_variable_get(:@online) || {}).keys.each do |cid|
          _z, ps = World.find_player(cid)
          yield ps if ps
        end
      end

      # Tests: forget every cached thing.
      def reset!
        @client = @job_runner = @clock = @next_check = @next_sweep = nil
        @courts_ensured = false
        @dormant_override = nil
        @config = nil
        Bounties.reset!
        Claims.reset!
        Benefits.rng = nil
        Relics.reset!
      end

      private

      def adjourn!
        publish!(kind: "adjourned", text: config.news.fetch("adjourned"))
      end

      def resume!
        start = config.tax["start_bp"]
        Court.where.not(tax_bp: start).pluck(:key, :tax_bp).each do |k, from|
          Treasury.event!(k, kind: "set_tax", meta: { "from_bp" => from, "to_bp" => start, "reason" => "resumed" })
        end
        Court.update_all(tax_bp: start, updated_at: Time.current)
        publish!(kind: "resumed", text: config.news.fetch("resumed"))
      end
    end
  end
end

require_relative "courts/config"
require_relative "courts/treasury"
require_relative "courts/verbs"
require_relative "courts/anthropic_client"
require_relative "courts/stub_client"
require_relative "courts/council"
require_relative "courts/cycle"
require_relative "courts/allegiance"
require_relative "courts/gold_log"
require_relative "courts/text"
require_relative "courts/news"
require_relative "courts/board"
require_relative "courts/halls"
require_relative "courts/bounties"
require_relative "courts/claims"
require_relative "courts/benefits"
require_relative "courts/relics"
require_relative "courts/letters"
require_relative "courts/war_chests"
require_relative "courts/read"

module Vanai
  module Courts
    # Decay and control at every boundary, after the stipend and the bounties'
    # expiry (registration order); the digest, which runs last, reports it.
    # Registered here rather than in claims.rb, which data.rb loads on its own
    # (before the cycle and the news exist) so the hooks in quests.rb,
    # combat.rb and world.rb resolve in the pure tests that load no Rails.
    Cycle.on_boundary("claims") { |closed, opened| Claims.boundary!(closed, opened) }
    News.on_digest("control") { |_closed, opened| Claims.digest_entries(opened) }
    # S5, the same way: relics.rb is loaded by data.rb on its own too. The
    # verb comes after offer_bounty (the tool order is the prompt cache's), the
    # named relics registered in the closing sitting go in the digest.
    Verbs.register("set_relic_prices", Relics::SetRelicPrices)
    News.on_digest("named") { |closed, _opened| Relics.digest_entries(closed) }
    # S6: the letters and the war chest, after set_relic_prices, in a fixed
    # order (the tool block is part of the cached prompt).
    Verbs.register("award_purse", Letters::AwardPurse)
    Verbs.register("offer_defection", Letters::OfferDefection)
    Verbs.register("fund_push", WarChests::FundPush)
  end
end
