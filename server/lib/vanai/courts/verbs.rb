module Vanai
  module Courts
    # The courts' verbs: each one's tool definition (the model's only way to
    # act), its clamp, its cost and its effect (COURTS.md "Verbs"). A verb is a
    # module with:
    #   tool                       -> the tool definition sent to the model
    #   clamp(court, input, ctx)   -> [ok, clamped_input, reason]; reason is set
    #                                 when the input was changed or refused
    #   cost(clamped)              -> gold it commits from the treasury
    #   apply!(court, clamped, ctx)-> does it, on the world thread, inside the
    #                                 turn's transaction; returns a result hash
    #   once_per_turn?             -> only the first call in a turn counts
    # Later steps register theirs (proclaim, offer_bounty, set_relic_prices,
    # award_purse, offer_defection, fund_push) with `register`.
    #
    # The schemas are strict tools (additionalProperties false, every property
    # required) with the ranges in the descriptions rather than as
    # minimum/maximum, which strict tools do not enforce: the clamp is what holds
    # the line, and the model is told the ranges so it rarely needs to be clamped.
    module Verbs
      REGISTRY = {}

      class << self
        def register(name, verb)
          REGISTRY[name.to_s] = verb
        end

        def [](name) = REGISTRY[name.to_s]
        def names = REGISTRY.keys

        # Fixed order (registration order) so the tool block renders the same
        # bytes every cycle and the cached system prompt after it stays cached.
        def tool_definitions(names = self.names)
          names.map { |n| REGISTRY.fetch(n).tool.merge(strict: true) }
        end

        # Belt and braces behind strict tools: a call must match its schema
        # exactly (known verb, an object, exactly the declared keys, the declared
        # types, enums respected). A turn with a call that does not is invalid
        # and that court skips the cycle.
        def validate(name, input)
          verb = REGISTRY[name.to_s]
          return [false, "unknown verb #{name}"] unless verb
          schema = verb.tool[:input_schema]
          return [false, "input is not an object"] unless input.is_a?(Hash)
          props = schema[:properties] || {}
          extra = input.keys.map(&:to_s) - props.keys.map(&:to_s)
          return [false, "unexpected #{extra.join(", ")}"] unless extra.empty?
          Array(schema[:required]).each do |k|
            return [false, "missing #{k}"] unless input.key?(k.to_s)
          end
          props.each do |k, spec|
            next unless input.key?(k.to_s)
            ok = type_ok?(input[k.to_s], spec)
            return [false, "#{k} is not #{spec[:type]}"] unless ok
          end
          [true, nil]
        end

        private

        def type_ok?(value, spec)
          ok = case spec[:type]
               when "integer" then value.is_a?(Integer)
               when "number" then value.is_a?(Numeric)
               when "string" then value.is_a?(String)
               when "boolean" then value == true || value == false
               else false
               end
          ok && (!spec[:enum] || spec[:enum].include?(value))
        end
      end

      # set_tax: the court's auction rate in its city. 1-15%, at most +-2 points
      # from the rate at the start of the turn, starting at 3% (COURTS.md).
      module SetTax
        module_function

        def tool
          {
            name: "set_tax",
            description: "Set your court's auction tax rate in your own city, in whole percent. " \
                         "Allowed: 1 to 15, and at most 2 points above or below your rate at the start of this sitting " \
                         "(a larger change is clamped). Buyers pay it on top of the listed price; it comes into your treasury.",
            input_schema: {
              type: "object",
              properties: { rate_percent: { type: "integer", description: "The new rate, a whole percent from 1 to 15." } },
              required: ["rate_percent"],
              additionalProperties: false
            }
          }
        end

        def once_per_turn? = true

        def clamp(_court, input, ctx)
          t = Courts.config.tax
          start = ctx.fetch(:start_tax_bp)
          wanted = input.fetch("rate_percent").to_i * 100
          bp = wanted.clamp(t["min_bp"], t["max_bp"]).clamp(start - t["step_bp"], start + t["step_bp"])
          reason = bp == wanted ? nil : "clamped from #{wanted / 100}% to #{bp / 100}%"
          [true, { "rate_bp" => bp }, reason]
        end

        def cost(_clamped) = 0

        def apply!(court, clamped, ctx)
          row = ctx.fetch(:court_row)
          from = row.tax_bp
          to = clamped.fetch("rate_bp")
          return { "from_bp" => from, "to_bp" => to, "changed" => false } if from == to
          Court.where(key: court).update_all(tax_bp: to, updated_at: Time.current)
          row.tax_bp = to
          Treasury.event!(court, kind: "set_tax", cycle: ctx[:cycle], meta: { "from_bp" => from, "to_bp" => to })
          { "from_bp" => from, "to_bp" => to, "changed" => true }
        end
      end

      # hold: the court does nothing this sitting. Sonnet 5.5 cannot be forced to
      # call a tool (forced tool_choice is a 400), so a turn that wants to do
      # nothing says so through this, and a reply with no tool calls counts as it.
      module Hold
        module_function

        def tool
          {
            name: "hold",
            description: "Do nothing this sitting. Call this if you choose not to act.",
            input_schema: {
              type: "object",
              properties: { reason: { type: "string", description: "A short private note on why; never shown to players." } },
              required: ["reason"],
              additionalProperties: false
            }
          }
        end

        def once_per_turn? = false
        def clamp(_court, input, _ctx) = [true, { "reason" => input["reason"].to_s[0, Courts.config.text_caps.fetch("hold")] }, nil]
        def cost(_clamped) = 0
        def apply!(_court, _clamped, _ctx) = {}
      end

      # proclaim: the court's voice (COURTS.md "Verbs"): credit, doubt on a
      # rival's claim, a find, a tax change. The text is the model's and so is
      # never trusted: Text.clean strips markup, strikes any {{Name}} that is no
      # real explorer's and clamps the length. Stored for the hall's board and
      # the herald, and sent to every court window as news. At most
      # `proclamations_per_sitting` a turn; free.
      module Proclaim
        module_function

        def tool
          per = Courts.config.proclamations_per_sitting
          cap = Courts.config.text_caps.fetch("proclamation")
          {
            name: "proclaim",
            description: "Make a proclamation in your court's own voice. Your herald reads it in your audience hall " \
                         "and every explorer finds it in the court window. At most #{per} a sitting, each at most #{cap} " \
                         "characters (longer is cut). Plain prose only. Write a player's name as {{Name}}; a name that " \
                         "is not a real explorer's is struck out.",
            input_schema: {
              type: "object",
              properties: { text: { type: "string", description: "The proclamation, at most #{cap} characters." } },
              required: ["text"],
              additionalProperties: false
            }
          }
        end

        def once_per_turn? = false

        def clamp(_court, input, ctx)
          per = Courts.config.proclamations_per_sitting
          return [false, nil, "only #{per} proclamations a sitting"] if ctx[:proclaimed].to_i >= per
          raw = input.fetch("text").to_s
          cap = Courts.config.text_caps.fetch("proclamation")
          text = Text.clean(raw, max: cap)
          return [false, nil, "nothing readable left"] if text.empty?
          struck = Text.names_in(raw).size - Text.known_names(Text.names_in(raw), nil).size
          notes = []
          notes << "cut to #{cap} characters" if text.end_with?(Text::ELLIPSIS) && !raw.strip.end_with?(Text::ELLIPSIS)
          notes << "#{struck} unknown name(s) struck" if struck.positive?
          [true, { "text" => text }, notes.empty? ? nil : notes.join("; ")]
        end

        def cost(_clamped) = 0

        def apply!(court, clamped, ctx)
          ctx[:proclaimed] = ctx[:proclaimed].to_i + 1
          p = Proclamation.create!(court: court, cycle: ctx[:cycle] || Courts.cycle_number, text: clamped.fetch("text"),
                                   court_turn_id: ctx[:turn]&.id, created_at: Courts.now)
          Treasury.event!(court, kind: "proclaim", cycle: ctx[:cycle], meta: { "proclamation_id" => p.id })
          News.publish!(kind: "proclamation", audience: "all", court: court, text: p.text,
                        payload: { "proclamation_id" => p.id, "court_name" => Courts.config.name(court) })
          { "proclamation_id" => p.id }
        end
      end

      register("set_tax", SetTax)
      register("hold", Hold)
      register("proclaim", Proclaim)
    end
  end
end
