module Vanai
  module Courts
    # Raised by a council client when the call itself failed (after the SDK's
    # own retries): that court skips the cycle and stays silent (COURTS.md
    # "Dormant courts").
    class ClientError < StandardError; end

    # The real council client: one Messages API call per court per cycle,
    # through the official gem (tmp/courts/PLAN.md 1.4). It runs on the
    # CouncilJob's threads, never on the world thread, and is never built in
    # tests (they assign a StubClient).
    #
    # The shape of the call follows from the model Philip chose,
    # claude-sonnet-5-5:
    # - no forced tool_choice (any/tool is a 400 on it): `auto`, strict tools,
    #   a `hold` tool and the system prompt's last line ask for tool calls;
    # - no `thinking` (adaptive is the default; disabled is a 400); depth is
    #   output_config.effort;
    # - the server-side refusal fallback, so a refusal is re-run rather than
    #   silencing the court;
    # - the system prompt (persona, rules, clamps) carries the cache breakpoint:
    #   it and the tools before it are identical every cycle for a court, and the
    #   volatile ledger read is the user message.
    class AnthropicClient
      FALLBACK_BETA = "server-side-fallback-2026-07-01".freeze

      # client_options reach Anthropic::Client.new (a base_url for a local
      # check of the request's shape; nothing in the game passes any).
      def initialize(api_key: ENV["ANTHROPIC_API_KEY"], config: Courts.config, **client_options)
        require "anthropic"
        @config = config
        @client = Anthropic::Client.new(api_key: api_key, max_retries: 2, timeout: 120, **client_options)
      end

      # -> { "model", "stop_reason", "content" => [blocks as Hashes], "usage" }
      def call(court:, system:, tools:, ledger:)
        message = @client.beta.messages.create(
          model: @config.model.to_sym,
          max_tokens: @config.max_tokens,
          system_: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          tools: tools,
          tool_choice: { type: "auto" },
          output_config: { effort: @config.effort.to_sym },
          messages: [{ role: "user", content: ledger }],
          fallbacks: :default,
          betas: [FALLBACK_BETA]
        )
        JSON.parse(message.to_json)
      rescue Anthropic::Errors::RateLimitError => e
        raise ClientError, "#{court}: rate limited (#{e.status}): #{e.message}"
      rescue Anthropic::Errors::APIStatusError => e
        raise ClientError, "#{court}: #{e.class.name.demodulize} (#{e.status}): #{e.message}"
      rescue Anthropic::Errors::APIConnectionError => e
        raise ClientError, "#{court}: #{e.class.name.demodulize}: #{e.message}"
      end
    end
  end
end
