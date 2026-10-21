require "json"

module Vanai
  module Courts
    # shared/data/courts.json plus the few ENV overrides COURTS.md names, read
    # into one frozen object. The data is the single source of truth for both
    # halves; the ENV only tunes a deployment (tmp/courts/PLAN.md 6.2).
    class Config
      attr_reader :data, :courts, :model, :effort, :max_tokens, :roster_per_court, :record_recent, :rules,
                  :interval, :stipend, :start_treasury, :tax, :commit_cap,
                  :turn_stale, :turn_retries, :text_caps, :news,
                  :page, :proclamations_per_sitting, :bounty, :claims, :benefits, :relics, :named_per_zone,
                  :letters, :fund_push

      def self.load(root, env: ENV)
        new(JSON.parse(File.read(File.expand_path("../shared/data/courts.json", root.to_s))), env: env)
      end

      # "90s", "30m", "24h", "2d", or plain seconds. A short dev interval stays
      # consistent because everything counted per cycle is per cycle, not per day.
      def self.parse_interval(value)
        s = value.to_s.strip.downcase
        m = s.match(/\A(\d+(?:\.\d+)?)\s*([smhd]?)\z/)
        raise ArgumentError, "bad council interval #{value.inspect}" unless m
        n = m[1].to_f * { "" => 1, "s" => 1, "m" => 60, "h" => 3600, "d" => 86_400 }.fetch(m[2])
        raise ArgumentError, "council interval must be positive" unless n.positive?
        n
      end

      def initialize(data, env: ENV)
        @data = data
        @courts = data.fetch("courts")
        council = data.fetch("council")
        tuning = data.fetch("tuning")
        @model = env["VANAI_COURT_MODEL"].presence || council.fetch("model")
        @effort = council.fetch("effort")
        @max_tokens = council.fetch("max_tokens").to_i
        @roster_per_court = council.fetch("roster_per_court").to_i
        @record_recent = council.fetch("record_recent").to_i
        @rules = council.fetch("rules")
        @interval = self.class.parse_interval(env["VANAI_COUNCIL_INTERVAL"].presence || tuning.fetch("interval"))
        @stipend = (env["VANAI_COURT_STIPEND"].presence || tuning.fetch("stipend")).to_i
        raise ArgumentError, "the stipend cannot be negative" if @stipend.negative?
        @start_treasury = tuning.fetch("start_treasury").to_i
        @tax = tuning.fetch("tax").transform_values(&:to_i).freeze
        @commit_cap = tuning.fetch("commit_cap").to_f
        @turn_stale = tuning.fetch("turn_stale_seconds").to_f
        @turn_retries = tuning.fetch("turn_retries").to_i
        @text_caps = tuning.fetch("text").freeze
        @news = data.fetch("news").freeze
        # a board or News page, "~20 a page" (COURTS.md "The audience hall")
        @page = tuning.fetch("page").to_i
        @proclamations_per_sitting = tuning.fetch("proclamations_per_sitting").to_i
        # the bounty clamps: [min, max] ranges, the per-sitting and per-character caps
        @bounty = tuning.fetch("bounty").freeze
        # claim points per source, the per-character cap per cycle, the decay
        @claims = tuning.fetch("claims").transform_values(&:to_f).freeze
        # what control gives the controlling court's members in that zone
        @benefits = tuning.fetch("benefits").transform_values(&:to_f).freeze
        # relic prices, the budget, the rolls and the crumble (S5)
        @relics = tuning.fetch("relics").freeze
        # Named relic slots per wild zone per cycle: raise it only when the
        # population grows enough that nobody finds one (COURTS.md "Named relics").
        @named_per_zone = (env["VANAI_NAMED_RELICS_PER_ZONE"].presence || @relics.fetch("named_per_zone")).to_i
        raise ArgumentError, "VANAI_NAMED_RELICS_PER_ZONE must be at least 1" if @named_per_zone < 1
        # the letters' clamps (S6): purse and defection [min, max] gold, letters a sitting
        @letters = tuning.fetch("letters").freeze
        # the war chest (S6): price per cycle, [min, max] cycles, the multiplier, chests a sitting
        @fund_push = tuning.fetch("fund_push").freeze
        freeze
      end

      def court(key) = @courts.fetch(key)
      def name(key) = @courts.fetch(key).fetch("name")
    end
  end
end
