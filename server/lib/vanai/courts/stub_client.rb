module Vanai
  module Courts
    # The council client for tests: never touches the network. The block (or a
    # Hash of court => verbs) decides each court's answer:
    #   StubClient.new { |court, prompt| [{ "name" => "set_tax", "input" => { "rate_percent" => 5 } }] }
    # A block may return an Array of verbs (wrapped as tool_use blocks), a full
    # response Hash ("stop_reason", "content", ...), or raise ClientError to play
    # an API failure. Every call is recorded in `calls`.
    class StubClient
      attr_reader :calls

      def initialize(answers = nil, &block)
        @answers = block || ->(court, _prompt) { (answers || {}).fetch(court, []) }
        @calls = []
        @lock = Mutex.new
      end

      def call(court:, system:, tools:, ledger:)
        @lock.synchronize { @calls << { court: court, system: system, tools: tools, ledger: ledger } }
        answer = @answers.call(court, JSON.parse(ledger))
        return answer if answer.is_a?(Hash)
        content = Array(answer).each_with_index.map do |v, i|
          { "type" => "tool_use", "id" => "stub_#{court}_#{i}", "name" => v.fetch("name"), "input" => v.fetch("input", {}) }
        end
        { "model" => "stub", "stop_reason" => content.empty? ? "end_turn" : "tool_use", "content" => content,
          "usage" => { "input_tokens" => 0, "output_tokens" => 0 } }
      end

      def courts_called = @lock.synchronize { @calls.map { |c| c[:court] } }
    end

    # The development stand-in for VANAI_COURTS_STUB=1: random but valid moves,
    # so a council can be watched without an API key or any spend. Never used in
    # production (Courts.client refuses it there).
    class DevStub < StubClient
      # Plainly a stand-in, so nobody mistakes a dev sitting for the courts.
      LINES = {
        "caerdun" => "(dev sitting) The Court of Caerdun enters its rate for sitting %d. Precedent is kept.",
        "heartwood" => "(dev sitting) The Grove Court posts its rate for sitting %d, and keeps the receipt.",
        "moonmere" => "(dev sitting) The Academy Court notes its rate for sitting %d.¹ ¹ Provisional."
      }.freeze

      def initialize
        super() do |court, prompt|
          rate = prompt.dig("courts", court, "tax_percent").to_i
          tax = { "name" => "set_tax", "input" => { "rate_percent" => (rate + [-2, -1, 1, 2].sample).clamp(1, 15) } }
          verbs = case rand(3)
                  when 0 then [{ "name" => "hold", "input" => { "reason" => "dev stub" } }]
                  when 1 then [tax]
                  else [tax, { "name" => "proclaim", "input" => { "text" => format(LINES.fetch(court), prompt["sitting"].to_i) } }]
                  end
          verbs << dev_bounty if rand(2).zero?
          verbs << dev_relic_prices(prompt["your_registry"]) if rand(3).zero?
          verbs.concat(dev_letters(court, prompt))
          verbs << dev_push(prompt) if rand(4).zero?
          verbs
        end
      end

      # A purse or an offer to an explorer on the roster now and then, so a dev
      # sitting shows the Letters tab and the cards. The text says it is a
      # stand-in, as every dev line does.
      def dev_letters(court, prompt)
        roster = Array(prompt["roster"])
        out = []
        if (who = roster.sample) && rand(2).zero?
          out << { "name" => "award_purse",
                   "input" => { "name" => who["name"], "amount" => 20 + 10 * rand(8),
                                "reason" => "(dev sitting) A purse to {{#{who["name"]}}}, for service noted.",
                                "text" => "(dev sitting) A purse, sealed, so there is one to read." } }
        end
        rival = roster.select { |r| r["court"] != court }.sample
        if rival && rand(2).zero?
          out << { "name" => "offer_defection",
                   "input" => { "name" => rival["name"], "amount" => 50 + 25 * rand(8),
                                "text" => "(dev sitting) An offer, sealed, so there is one to answer." } }
        end
        out
      end

      # A war chest in a random contested zone.
      def dev_push(prompt)
        zone = (prompt["claims"] || {}).keys.sample || "caerdunfields"
        { "name" => "fund_push", "input" => { "zone" => zone, "cycles" => 1 + rand(2) } }
      end

      # Nudges the registry's prices and budget, so a dev sitting shows them move.
      def dev_relic_prices(registry)
        prices = (registry || {}).fetch("prices", {})
        input = Relics::KINDS.to_h { |k| [k, (prices.fetch(k, 40).to_i + [-10, -5, 5, 10].sample).clamp(5, 300)] }
        { "name" => "set_relic_prices",
          "input" => input.merge("budget" => ((registry || {}).fetch("budget", 1200).to_i + [-200, 200].sample).clamp(0, 5000)) }
      end

      # A small bounty on a random catalogue target, so the board, the journal
      # and the pins have something to show in a dev sitting.
      def dev_bounty
        zone, entry = Bounties.catalogue.to_a.sample
        kind = entry["collect"].any? && rand(2).zero? ? "collect" : "kill"
        target = entry[kind].keys.sample
        { "name" => "offer_bounty",
          "input" => { "kind" => kind, "zone" => zone, "target" => target, "count" => kind == "kill" ? 3 + rand(6) : 1 + rand(4),
                       "places" => 1 + rand(4), "reward_each" => 20 + 10 * rand(6), "cycles" => 1 + rand(2),
                       "text" => "(dev sitting) A bounty, posted so there is one to see." } }
      end
    end
  end
end
