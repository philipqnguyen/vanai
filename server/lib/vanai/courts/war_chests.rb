module Vanai
  module Courts
    # fund_push (COURTS.md "Verbs"): a war chest doubling the court's claim
    # gains in one contested zone for a few cycles. The losing courts' answer to
    # a runaway (ruling A): no mechanical brake on control, but a court can pay
    # to make its explorers' work count for more where it is losing.
    #
    # The chest is a court_pushes row (S4 made the table, and Claims.credit
    # already multiplies a credit while one is active: from_cycle..to_cycle,
    # both included). It needs nothing at the boundary: it simply stops counting
    # after its last cycle.
    #
    # The price is fixed per cycle (tuning.fund_push.price_per_cycle) rather
    # than an amount the court picks: the doubling is all a chest buys, so a
    # free amount would only let a court overpay for nothing.
    module WarChests
      class << self
        def cfg = Courts.config.fund_push

        # The court's chests still running in `cycle` or later, for the read.
        def active(court = nil, cycle = Courts.cycle_number)
          scope = CourtPush.where("to_cycle >= ?", cycle).order(:zone, :court)
          scope = scope.where(court: court) if court
          scope.to_a
        end
      end

      module FundPush
        module_function

        def tool
          c = WarChests.cfg
          lo, hi = c.fetch("cycles")
          {
            name: "fund_push",
            description: "Open a war chest in one contested zone: for the sittings it runs (#{lo} to #{hi}, this one " \
                         "included; clamped) every claim point your sworn explorers earn there counts #{c.fetch("mult")} " \
                         "times. It costs #{c.fetch("price_per_cycle")} gold per sitting, paid from your treasury now " \
                         "(it counts toward this sitting's commit limit). One war chest of yours per zone at a time; at " \
                         "most #{c.fetch("per_sitting")} a sitting. Rivals see it in the next sitting's ledger.",
            input_schema: {
              type: "object",
              properties: {
                zone: { type: "string", description: "A contested zone key." },
                cycles: { type: "integer", description: "Sittings it runs, this one included." }
              },
              required: %w[zone cycles],
              additionalProperties: false
            }
          }
        end

        def once_per_turn? = false

        def clamp(court, input, ctx)
          c = WarChests.cfg
          per = c.fetch("per_sitting").to_i
          return [false, nil, "only #{per} war chests a sitting"] if ctx[:pushes].to_i >= per
          zone = input.fetch("zone").to_s
          return [false, nil, "#{zone} is not a contested zone"] unless Courts.contested?(zone)
          cycle = ctx[:cycle] || Courts.cycle_number
          running = CourtPush.where(court: court, zone: zone).where("to_cycle >= ?", cycle).pick(:to_cycle)
          return [false, nil, "your war chest in #{zone} already runs until sitting #{running}"] if running
          lo, hi = c.fetch("cycles")
          cycles = input.fetch("cycles").to_i.clamp(lo, hi)
          reason = cycles == input.fetch("cycles").to_i ? nil : "cycles clamped to #{cycles}"
          [true, { "zone" => zone, "cycles" => cycles }, reason]
        end

        def cost(clamped) = WarChests.cfg.fetch("price_per_cycle").to_i * clamped.fetch("cycles")

        def apply!(court, clamped, ctx)
          ctx[:pushes] = ctx[:pushes].to_i + 1
          cycle = ctx[:cycle] || Courts.cycle_number
          amount = cost(clamped)
          to = cycle + clamped["cycles"] - 1
          taken = Treasury.debit!(court, amount, kind: "fund_push", cycle: ctx[:cycle], zone: clamped["zone"],
                                                 meta: { "from_cycle" => cycle, "to_cycle" => to })
          return { "push_id" => nil, "error" => "the treasury could not cover it" } unless taken
          push = CourtPush.create!(court: court, zone: clamped["zone"], from_cycle: cycle, to_cycle: to, amount: amount,
                                   court_turn_id: ctx[:turn]&.id, created_at: Courts.now)
          { "push_id" => push.id, "until" => to, "cost" => amount }
        end
      end
    end
  end
end
