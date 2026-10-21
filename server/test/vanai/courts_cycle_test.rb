require_relative "courts_test_helper"

# The council schedule lives in the database: bootstrap, an idempotent
# boundary, one boundary after downtime, the stipend, run-now, the missing-job
# watch and the crash rules (tmp/courts/PLAN.md 1.3).
class CourtsCycleTest < Minitest::Test
  include CourtsTestHelper
  KEYS = Vanai::Courts::KEYS

  def test_bootstrap_opens_cycle_one_without_a_turn
    assert_equal 0, C.cycle_number
    C.check!
    c = CouncilCycle.find_by!(number: 1)
    assert_equal "skipped", c.turn_status
    assert_equal T0, c.started_at
    assert_equal T0 + C.config.interval, c.due_at
    assert_equal 1, C.cycle_number
    assert_empty @enqueued
    C.check!
    assert_equal 1, CouncilCycle.count
  end

  def test_boundary_opens_the_next_cycle_pays_the_stipend_and_enqueues
    C.check!
    before = KEYS.to_h { |k| [k, treasury(k)] }
    advance(C.config.interval)
    C.check!
    closed = CouncilCycle.find_by!(number: 1)
    opened = CouncilCycle.find_by!(number: 2)
    assert_equal T0 + C.config.interval, closed.closed_at
    assert_nil opened.closed_at
    assert_equal "pending", opened.turn_status
    assert_equal [2], @enqueued
    assert_equal @time, opened.turn_enqueued_at
    KEYS.each { |k| assert_equal before[k] + C.config.stipend, treasury(k) }
    assert_equal 3, CourtLedgerEntry.where(kind: "stipend", cycle: 2).count
    assert_equal 2, C.cycle_number
    assert messages("court_cycle").empty? # nobody online
  end

  def test_boundary_is_idempotent
    C.check!
    first = CouncilCycle.find_by!(number: 1)
    advance(C.config.interval)
    assert C::Cycle.boundary!(first, @time)
    assert_nil C::Cycle.boundary!(first, @time)
    assert_nil C::Cycle.boundary!(first.reload, @time + 5)
    assert_equal [1, 2], CouncilCycle.order(:number).pluck(:number)
    assert_equal 3, CourtLedgerEntry.where(kind: "stipend").count
    assert_equal [2], @enqueued
  end

  def test_no_catch_up_storm_after_downtime
    C.check!
    advance(C.config.interval * 10 + 7)
    C.check!
    C.check!
    assert_equal [1, 2], CouncilCycle.order(:number).pluck(:number)
    assert_equal @time + C.config.interval, CouncilCycle.find_by!(number: 2).due_at
    assert_equal 3, CourtLedgerEntry.where(kind: "stipend").count
  end

  def test_per_cycle_numbering_follows_a_short_interval
    ENV["VANAI_COUNCIL_INTERVAL"] = "90s"
    C.reload_config!
    assert_equal 90.0, C.config.interval
    C.check!
    5.times { advance(90); C.check! }
    assert_equal (1..6).to_a, CouncilCycle.order(:number).pluck(:number)
    assert_equal 6, C.cycle_number
    assert_equal (2..6).to_a, CourtLedgerEntry.where(kind: "stipend", court: "caerdun").order(:cycle).pluck(:cycle)
  ensure
    ENV.delete("VANAI_COUNCIL_INTERVAL")
  end

  def test_run_now_moves_the_due_time_only
    C.check!
    assert_equal 1, C.run_now!
    assert_equal @time, CouncilCycle.find_by!(number: 1).due_at
    assert_equal 1, CouncilCycle.count
    C.check!
    assert_equal 2, C.cycle_number
  end

  def test_run_now_from_chat_tells_the_caller
    c = provision("Councilor")
    W.join(c.id)
    C.check!
    @messages.clear
    C.run_now!(c.id)
    assert_match(/council is called/, messages("system", c).last[:msg])
  end

  def test_stale_job_is_re_enqueued_then_given_up
    cycle = open_second_cycle
    assert_equal [2], @enqueued
    advance(60)
    C.check!
    assert_equal [2], @enqueued, "a fresh enqueue is left alone"
    advance(C.config.turn_stale + 1)
    C.check!
    assert_equal [2, 2], @enqueued, "a job that never started is enqueued again"
    # the job took it and died: running, started long ago
    cycle.reload.update_columns(turn_status: "running", turn_started_at: @time, turn_attempts: 1)
    advance(C.config.turn_stale + 1)
    C.check!
    assert_equal [2, 2, 2], @enqueued
    cycle.update_columns(turn_attempts: C.config.turn_retries, turn_started_at: @time)
    advance(C.config.turn_stale + 1)
    C.check!
    assert_equal "failed", cycle.reload.turn_status
    assert_equal 3, @enqueued.size
  end

  def test_a_restart_mid_turn_re_runs_and_stored_turns_are_kept
    stub_council { |_c, _p| [{ "name" => "set_tax", "input" => { "rate_percent" => 4 } }] }
    cycle = open_second_cycle
    # first attempt stored one court's turn and then the worker died
    CourtTurn.create!(council_cycle: cycle, court: "caerdun", status: "ok",
                      verbs: [{ "name" => "set_tax", "input" => { "rate_percent" => 5 } }])
    cycle.update_columns(turn_status: "running", turn_started_at: @time, turn_attempts: 1)
    assert_equal :not_taken, C::Council.run_cycle!(2), "a fresh running turn belongs to its worker"
    advance(C.config.turn_stale + 1)
    assert_equal :ready, C::Council.run_cycle!(2)
    assert_equal %w[heartwood moonmere], @stub.courts_called.sort
    assert_equal 2, cycle.reload.turn_attempts
    C.check!
    assert_equal({ "caerdun" => 500, "heartwood" => 400, "moonmere" => 400 }, Court.order(:key).pluck(:key, :tax_bp).to_h)
    assert_equal "applied", cycle.reload.turn_status
  end

  def test_a_crash_between_turns_applies_only_the_rest
    stub_council { |_c, _p| [{ "name" => "set_tax", "input" => { "rate_percent" => 5 } }] }
    cycle = open_second_cycle
    C::Council.run_cycle!(2)
    # caerdun's turn was applied before the crash; its effect committed
    caerdun = cycle.court_turns.find_by!(court: "caerdun")
    C::Council.apply_turn!(caerdun, cycle)
    assert_equal 500, tax_bp("caerdun")
    C.check!
    assert_equal 1, CourtLedgerEntry.where(court: "caerdun", kind: "set_tax").count
    assert_equal({ "caerdun" => 500, "heartwood" => 500, "moonmere" => 500 }, Court.order(:key).pluck(:key, :tax_bp).to_h)
    C::Council.apply_cycle!(cycle.reload)
    assert_equal 3, CourtLedgerEntry.where(kind: "set_tax").count, "nothing applied twice"
  end

  def test_a_turn_that_missed_its_cycle_is_skipped_at_the_boundary
    cycle = open_second_cycle
    advance(C.config.interval)
    C.check!
    assert_equal "skipped", cycle.reload.turn_status
    assert_equal "pending", CouncilCycle.find_by!(number: 3).turn_status
  end

  def test_boundary_broadcasts_to_everyone_online
    a = provision("Cyclone")
    b = provision("Cycltwo", city: "moonmere")
    [a, b].each { |c| W.join(c.id) }
    C.check!
    @messages.clear
    advance(C.config.interval)
    C.check!
    assert_equal [a.id, b.id].sort, @messages.select { |_, p| p[:t] == "court_cycle" }.map(&:first).sort
    assert_equal 2, messages("court_cycle", a).first[:cycle]
    assert_equal "moonmere", messages("court_state", b).last[:court]
  end

  def test_interval_parsing
    cfg = C::Config
    assert_equal 90, cfg.parse_interval("90s")
    assert_equal 1800, cfg.parse_interval("30m")
    assert_equal 86_400, cfg.parse_interval("24h")
    assert_equal 172_800, cfg.parse_interval("2d")
    assert_equal 45, cfg.parse_interval("45")
    assert_raises(ArgumentError) { cfg.parse_interval("soon") }
    assert_raises(ArgumentError) { cfg.parse_interval("0s") }
  end

  def test_the_gold_log_writes_one_row_a_day
    c = provision("Goldcount")
    c.update!(gold: 1234)
    C.check!
    row = C::GoldLog.tick!
    assert_equal Date.new(2026, 10, 12), row.day
    assert_equal Character.sum(:gold), row.characters_gold
    assert_equal Court.sum(:treasury), row.treasuries_gold
    assert_equal 0, row.held_gold
    assert_nil C::GoldLog.tick!
    advance(C.config.interval)
    C.check!
    next_day = C::GoldLog.tick!
    assert_equal Date.new(2026, 10, 13), next_day.day
    assert_equal 3 * C.config.stipend, next_day.minted
    assert_equal 2, GoldCirculation.count
  end
end
