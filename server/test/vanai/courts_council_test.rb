require_relative "courts_test_helper"

# The council's turns through the stub client: three stored turns, an invalid
# turn and an API failure each silencing only that court, the set_tax clamp,
# the 70% commit cap, and no second call for a stored turn. Nothing here may
# build an Anthropic::Client.
class CourtsCouncilTest < Minitest::Test
  include CourtsTestHelper

  def setup
    super
    @built = 0
    test = self
    @original_new = Anthropic::Client.method(:new)
    Anthropic::Client.define_singleton_method(:new) do |*|
      test.instance_variable_set(:@built, test.instance_variable_get(:@built) + 1)
      raise "a test tried to build an Anthropic::Client"
    end
  end

  def teardown
    original = @original_new
    Anthropic::Client.define_singleton_method(:new) { |*a, **k, &b| original.call(*a, **k, &b) }
    super
    assert_equal 0, @built
  end

  def tax(rate) = [{ "name" => "set_tax", "input" => { "rate_percent" => rate } }]

  def run_council
    cycle = open_second_cycle
    assert_equal :ready, C::Council.run_cycle!(cycle.number)
    C.check!
    cycle.reload
  end

  def test_three_turns_stored_and_applied
    stub_council { |court, _p| tax({ "caerdun" => 4, "heartwood" => 2, "moonmere" => 5 }[court]) }
    cycle = run_council
    assert_equal "applied", cycle.turn_status
    turns = cycle.court_turns.order(:court).to_a
    assert_equal %w[ok ok ok], turns.map(&:status)
    assert turns.all?(&:applied_at)
    assert_equal({ "caerdun" => 400, "heartwood" => 200, "moonmere" => 500 }, Court.order(:key).pluck(:key, :tax_bp).to_h)
    assert_equal 3, CourtLedgerEntry.where(kind: "set_tax", cycle: 2).count
    assert_equal({ "from_bp" => 300, "to_bp" => 500 }, CourtLedgerEntry.find_by!(kind: "set_tax", court: "moonmere").meta)
    # each court saw its own ledger read and its own persona in the system prompt
    call = @stub.calls.find { |c| c[:court] == "heartwood" }
    read = JSON.parse(call[:ledger])
    assert_equal "heartwood", read["you"]
    assert_equal 2, read["sitting"]
    assert_equal treasury("heartwood"), read["treasury"]
    assert_match(/Grove Court of Heartwood/, call[:system])
    assert call[:system].end_with?("Call hold if you choose to do nothing this sitting.")
    # registration order is the tool order (the prompt cache); each step appends
    assert_equal %w[set_tax hold proclaim offer_bounty set_relic_prices award_purse offer_defection fund_push], call[:tools].map { |t| t[:name] }
    assert call[:tools].all? { |t| t[:strict] && t[:input_schema][:additionalProperties] == false }
  end

  def test_the_turns_run_in_parallel
    seen = Queue.new
    stub_council do |court, _p|
      seen << court
      # each court waits until all three have been asked: only possible if the
      # three calls are in flight at once
      Timeout.timeout(5) { sleep 0.01 until seen.size >= 3 }
      tax(3)
    end
    cycle = run_council
    assert_equal %w[ok ok ok], cycle.court_turns.order(:court).pluck(:status)
  end

  def test_an_invalid_turn_and_an_api_error_silence_only_that_court
    stub_council do |court, _p|
      case court
      when "caerdun" then [{ "name" => "set_tax", "input" => { "rate_percent" => "five" } }]
      when "heartwood" then raise C::ClientError, "overloaded (529)"
      else tax(4)
      end
    end
    cycle = run_council
    turns = cycle.court_turns.index_by(&:court)
    assert_equal "invalid", turns["caerdun"].status
    assert_match(/rate_percent/, turns["caerdun"].error)
    assert_equal "failed", turns["heartwood"].status
    assert_match(/overloaded/, turns["heartwood"].error)
    assert_equal "ok", turns["moonmere"].status
    assert_nil turns["caerdun"].applied_at
    assert_equal({ "caerdun" => 300, "heartwood" => 300, "moonmere" => 400 }, Court.order(:key).pluck(:key, :tax_bp).to_h)
    assert_equal "applied", cycle.turn_status
    assert_empty messages("court_news"), "a silenced court says nothing"
  end

  def test_refusal_unknown_verbs_and_extra_keys_are_invalid
    p = C::Council
    assert_equal "invalid", p.parse({ "stop_reason" => "refusal", "content" => [] }).first
    assert_equal "invalid", p.parse({ "stop_reason" => "max_tokens", "content" => [] }).first
    tool = ->(name, input) { { "stop_reason" => "tool_use", "content" => [{ "type" => "tool_use", "name" => name, "input" => input }] } }
    assert_equal "invalid", p.parse(tool.("abdicate", {})).first
    assert_equal "invalid", p.parse(tool.("set_tax", { "rate_percent" => 4, "and" => "more" })).first
    assert_equal "invalid", p.parse(tool.("set_tax", {})).first
    assert_equal "ok", p.parse(tool.("set_tax", { "rate_percent" => 4 })).first
    status, verbs, = p.parse({ "stop_reason" => "end_turn", "content" => [{ "type" => "text", "text" => "We abstain." }] })
    assert_equal ["ok", "hold"], [status, verbs.first["name"]]
  end

  def test_set_tax_clamps_to_the_range_and_the_step
    set_court("caerdun", tax_bp: 1400)
    set_court("heartwood", tax_bp: 200)
    stub_council { |court, _p| tax({ "caerdun" => 40, "heartwood" => 0, "moonmere" => 9 }[court]) }
    cycle = run_council
    assert_equal({ "caerdun" => 1500, "heartwood" => 100, "moonmere" => 500 }, Court.order(:key).pluck(:key, :tax_bp).to_h)
    outcome = cycle.court_turns.find_by!(court: "moonmere").outcome.first
    assert_equal "clamped", outcome["status"]
    assert_match(/9% to 5%/, outcome["reason"])
  end

  def test_only_the_first_set_tax_counts
    stub_council { |_c, _p| tax(4) + tax(1) }
    cycle = run_council
    assert_equal 400, tax_bp("caerdun")
    outcome = cycle.court_turns.find_by!(court: "caerdun").outcome
    assert_equal %w[applied refused], outcome.map { |o| o["status"] }
  end

  # The 70% cap, through a test verb that spends gold (S1 has none of its own).
  module Spend
    module_function

    def tool = { name: "spend", description: "test", input_schema: { type: "object", properties: { gold: { type: "integer" } }, required: ["gold"], additionalProperties: false } }
    def once_per_turn? = false
    def clamp(_court, input, _ctx) = [true, input, nil]
    def cost(clamped) = clamped["gold"]

    def apply!(court, clamped, ctx)
      Vanai::Courts::Treasury.debit!(court, clamped["gold"], kind: "spend", cycle: ctx[:cycle])
      {}
    end
  end

  def test_the_commit_cap_holds_a_turn_to_seventy_percent
    C::Verbs.register("spend", Spend)
    stub_council do |court, _p|
      next [] unless court == "caerdun"
      [400, 250, 100, 50].map { |g| { "name" => "spend", "input" => { "gold" => g } } }
    end
    cycle = open_second_cycle
    set_court("caerdun", treasury: 1000)
    C::Council.run_cycle!(cycle.number)
    C.check!
    outcome = cycle.court_turns.find_by!(court: "caerdun").outcome
    assert_equal %w[applied applied refused applied], outcome.map { |o| o["status"] }
    assert_match(/commit cap/, outcome[2]["reason"])
    assert_equal 1000 - 700, treasury("caerdun")
  ensure
    C::Verbs::REGISTRY.delete("spend")
  end

  def test_a_re_run_does_not_call_the_client_for_stored_turns
    stub_council { |_c, _p| tax(4) }
    cycle = open_second_cycle
    C::Council.run_cycle!(cycle.number)
    assert_equal 3, @stub.calls.size
    cycle.reload.update_columns(turn_status: "pending")
    C::Council.run_cycle!(cycle.number)
    assert_equal 3, @stub.calls.size
    assert_equal 3, cycle.court_turns.count
  end

  def test_the_job_body_is_the_council
    stub_council { |_c, _p| tax(5) }
    cycle = open_second_cycle
    CouncilJob.perform_now(cycle.number)
    assert_equal "ready", cycle.reload.turn_status
  end

  def test_the_dev_stub_moves_are_valid
    stub = C::DevStub.new
    20.times do
      answer = stub.call(court: "moonmere", system: "", tools: [], ledger: JSON.generate({ "courts" => { "moonmere" => { "tax_percent" => 3 } } }))
      status, = C::Council.parse(answer)
      assert_equal "ok", status
    end
  end
end
