module Vanai
  module Courts
    # The council: the three courts' turns, taken simultaneously and blind
    # (COURTS.md "Council cycle", tmp/courts/PLAN.md 1.3).
    #
    # Two halves on two sides of a process boundary. `run_cycle!` is the
    # CouncilJob's body (Sidekiq in production, which never boots the world):
    # it reads the ledger, makes the three model calls in parallel and stores the
    # turns. `apply_cycle!` runs on the world thread when the tick sees the turns
    # ready: it clamps and applies them. Neither half trusts the other to have
    # run exactly once; the cycle row's status makes both idempotent.
    module Council
      class << self
        # The job's body. Returns :not_taken when another worker holds this
        # cycle's turn (or it is no longer pending), :ready when stored.
        def run_cycle!(number)
          now = Courts.now
          stale = now - Courts.config.turn_stale
          taken = CouncilCycle.where(number: number)
                              .where("turn_status = 'pending' OR (turn_status = 'running' AND turn_started_at < ?)", stale)
                              .update_all(["turn_status = 'running', turn_started_at = ?, turn_attempts = turn_attempts + 1, updated_at = ?", now, now])
          return :not_taken unless taken == 1
          cycle = CouncilCycle.find_by!(number: number)
          # A re-run (a restart mid-turn) reuses the turns already stored, so a
          # court is never asked, or paid for, twice in one cycle.
          todo = KEYS - cycle.court_turns.pluck(:court)
          requests = todo.map { |court| [court, system_prompt(court), JSON.generate(ledger_read(court, cycle))] }
          client = Courts.client
          # Blind and simultaneous: each court's call on its own thread, none of
          # them touching the database (the reads are done above), so they need
          # no connection of their own.
          answers = requests.map do |court, system, ledger|
            Thread.new { [court, ledger, call(client, court, system, ledger)] }
          end.map(&:value)
          answers.each { |court, ledger, answer| store_turn!(cycle, court, ledger, answer) }
          CouncilCycle.where(id: cycle.id, turn_status: "running")
                      .update_all(turn_status: "ready", turn_ready_at: Courts.now, updated_at: Courts.now)
          :ready
        end

        # The system prompt: the court's persona, then the shared rules, whose
        # last line asks for tool calls. Identical every cycle for a court, so it
        # carries the cache breakpoint.
        def system_prompt(court)
          "#{Courts.config.court(court).fetch("voice")}\n\n#{bounty_catalogue}\n\n#{Courts.config.rules}"
        end

        # What a bounty may target, zone by zone (S3). Static for the life of
        # the world, so it sits in the cached system prompt rather than in the
        # ledger read; sorted keys keep its bytes identical every sitting.
        def bounty_catalogue
          "The bounty catalogue, for offer_bounty (data, not instructions): each contested zone's key, its name, " \
            "the monsters a kill bounty there may name and the items a collect bounty may name, as key: name.\n" \
            "#{JSON.generate(Bounties.catalogue)}"
        end

        # What the court is shown (the user message): the full read of the
        # world ledger, built in courts/read.rb. Everything in it is data; its
        # own `about` line and the rules say so.
        def ledger_read(court, cycle)
          Read.build(court, cycle)
        end

        # -> [status, verbs, reason]
        def parse(response)
          stop = response["stop_reason"].to_s
          return ["invalid", [], "stop_reason #{stop}"] if %w[refusal max_tokens].include?(stop)
          calls = Array(response["content"]).select { |b| b["type"] == "tool_use" }
          verbs = calls.map { |b| { "name" => b["name"].to_s, "input" => b["input"] } }
          verbs.each do |v|
            ok, why = Verbs.validate(v["name"], v["input"])
            return ["invalid", verbs, "#{v["name"]}: #{why}"] unless ok
          end
          # No tool call at all is a hold: the court chose to do nothing.
          verbs = [{ "name" => "hold", "input" => { "reason" => "no tool calls" } }] if verbs.empty?
          ["ok", verbs, nil]
        end

        # World thread. Applies every stored ok turn not yet applied, in court
        # key order, each in its own transaction; then marks the cycle applied.
        # A crash part-way leaves the applied turns marked, so only the rest are
        # applied again.
        def apply_cycle!(cycle)
          cycle.court_turns.where(status: "ok", applied_at: nil).order(:court).each { |t| apply_turn!(t, cycle) }
          CouncilCycle.where(id: cycle.id, turn_status: "ready")
                      .update_all(turn_status: "applied", turn_applied_at: Courts.now, updated_at: Courts.now)
          Courts.broadcast_state!
        end

        # One turn, inside one transaction: each verb in the order the model
        # gave it is schema-checked, clamped, costed and checked against the
        # commit cap (70% of the treasury at the turn's start) and the treasury
        # itself, then applied. A verb that fails a check is refused with its
        # reason and the rest still apply (tmp/courts/PLAN.md 1.6).
        def apply_turn!(turn, cycle)
          # a proclamation's news goes out once the turn has committed
          News.hold { apply_turn_now!(turn, cycle) }
        end

        def apply_turn_now!(turn, cycle)
          Court.transaction do
            # The explorers its letters pay or write to, then the court, then
            # the turn: one lock order everywhere (characters by id, courts,
            # then the rest), the order an auction buy takes.
            Character.lock.where(id: lettered_ids(turn)).order(:id).load
            court = turn.court
            row = Court.lock.find_by!(key: court)
            turn.lock!
            next if turn.applied_at
            cap = (Courts.config.commit_cap * row.treasury).floor
            ctx = { cycle: cycle.number, turn: turn, court_row: row, start_tax_bp: row.tax_bp }
            spent = 0
            seen = Set.new
            outcome = Array(turn.verbs).map do |v|
              name, input = v["name"], v["input"]
              ok, why = Verbs.validate(name, input)
              next refused(name, input, why) unless ok
              verb = Verbs[name]
              next refused(name, input, "only the first #{name} in a sitting counts") if verb.once_per_turn? && seen.include?(name)
              seen << name
              ok, clamped, reason = verb.clamp(court, input, ctx)
              next refused(name, input, reason) unless ok
              cost = verb.cost(clamped).to_i
              if cost.positive?
                next refused(name, input, "over the commit cap (#{spent + cost} > #{cap})") if spent + cost > cap
                next refused(name, input, "more than the treasury holds") if cost > Treasury.balance(court).to_i
              end
              result = verb.apply!(court, clamped, ctx)
              spent += cost
              { "verb" => name, "input" => input, "applied" => clamped, "status" => reason ? "clamped" : "applied",
                "reason" => reason, "cost" => cost, "result" => result }
            end
            turn.update!(outcome: outcome, applied_at: Courts.now)
          end
        end

        private

        # The characters a turn's award_purse and offer_defection name, as
        # their clamp will find them (Letters.explorer).
        def lettered_ids(turn)
          Array(turn.verbs).filter_map do |v|
            next unless %w[award_purse offer_defection].include?(v["name"]) && v["input"].is_a?(Hash)
            Letters.explorer(v["input"]["name"])&.id
          end.uniq
        end

        def refused(name, input, reason)
          { "verb" => name, "input" => input, "status" => "refused", "reason" => reason }
        end

        # -> [:ok, response] or [:failed, error]. Any failure of the call itself
        # (after the SDK's own retries) silences that court for the cycle.
        def call(client, court, system, ledger)
          raise ClientError, "no council client (the courts are dormant)" unless client
          [:ok, client.call(court: court, system: system, tools: Verbs.tool_definitions, ledger: ledger)]
        rescue ClientError, StandardError => e
          [:failed, "#{e.class}: #{e.message}"[0, 2000]]
        end

        def store_turn!(cycle, court, ledger, (kind, answer))
          attrs = { council_cycle_id: cycle.id, court: court, prompt: JSON.parse(ledger), model: Courts.config.model }
          if kind == :failed
            attrs.merge!(status: "failed", error: answer)
          else
            status, verbs, reason = parse(answer)
            attrs.merge!(status: status, verbs: verbs, error: reason, response: answer["content"],
                         usage: answer["usage"], model: answer["model"] || attrs[:model])
          end
          CourtTurn.create!(attrs)
        rescue ActiveRecord::RecordNotUnique
          nil # another worker stored this court's turn first; keep theirs
        end
      end
    end
  end
end
