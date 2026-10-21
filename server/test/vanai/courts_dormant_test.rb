require_relative "courts_test_helper"

# No ANTHROPIC_API_KEY: the courts are dormant. No council runs, every house
# charges 3%, and going dormant and waking each post exactly one notice; waking
# puts every court back at 3% (COURTS.md "Dormant courts").
class CourtsDormantTest < Minitest::Test
  include CourtsTestHelper

  ADJOURNED = "The courts have adjourned. Market rates return to the standing three parts in a hundred."

  def test_no_key_means_dormant
    C.dormant_override = nil
    with_env("ANTHROPIC_API_KEY" => nil, "VANAI_COURTS_STUB" => nil) { assert C.dormant? }
    with_env("ANTHROPIC_API_KEY" => "  ", "VANAI_COURTS_STUB" => nil) { assert C.dormant? }
    with_env("ANTHROPIC_API_KEY" => "sk-test", "VANAI_COURTS_STUB" => nil) { refute C.dormant? }
    with_env("ANTHROPIC_API_KEY" => nil, "VANAI_COURTS_STUB" => "1") { refute C.dormant?, "the dev stub wakes them outside production" }
  end

  def test_dormant_runs_no_council_but_keeps_the_mechanics
    C.dormant_override = true
    C.client = nil
    assert_nil C.client, "no client is built while dormant"
    C.check!
    advance(C.config.interval)
    stipend_before = treasury("caerdun")
    C.check!
    opened = CouncilCycle.find_by!(number: 2)
    assert_equal "skipped", opened.turn_status
    assert opened.dormant
    assert_empty @enqueued
    assert_equal stipend_before + C.config.stipend, treasury("caerdun"), "the stipend keeps coming"
  end

  def test_three_percent_everywhere_while_dormant
    set_court("caerdun", tax_bp: 900)
    set_court("moonmere", tax_bp: 150)
    CourtFlag.set("capital_leader", "caerdun")
    C.dormant_override = true
    %w[caerdun heartwood moonmere capitalreturned].each { |z| assert_in_delta 0.03, C.tax_rate(z), 1e-9, z }
    assert_equal({ "caerdun" => 300, "heartwood" => 300, "moonmere" => 300 }, C.tax_table)
    assert_equal "caerdun", C.tax_court("caerdun"), "a dormant court still receives its 3%"
  end

  def test_adjourning_posts_one_notice_and_waking_resets_to_three_percent
    a = provision("Sleeper")
    W.join(a.id)
    CourtFlag.set("dormant", false)
    C.dormant_override = true
    3.times { C.check! }
    assert_equal [ADJOURNED], CourtNews.where(kind: "adjourned").pluck(:text)
    assert_equal ADJOURNED, messages("court_news", a).last[:item][:text]
    set_court("heartwood", tax_bp: 700)
    C.dormant_override = false
    3.times { C.check! }
    assert_equal 1, CourtNews.where(kind: "resumed").count
    assert_equal 1, CourtNews.where(kind: "adjourned").count
    assert_equal [300, 300, 300], Court.order(:key).pluck(:tax_bp)
    assert_equal({ "from_bp" => 700, "to_bp" => 300, "reason" => "resumed" },
                 CourtLedgerEntry.find_by!(court: "heartwood", kind: "set_tax").meta)
  end

  def test_first_boot_with_no_key_adjourns_once_and_with_a_key_is_silent
    CourtFlag.where(key: "dormant").delete_all
    C.dormant_override = false
    C.check!
    assert_equal false, CourtFlag.get("dormant")
    assert_equal 0, CourtNews.count
    CourtFlag.where(key: "dormant").delete_all
    C.dormant_override = true
    C.check!
    C.check!
    assert_equal ["adjourned"], CourtNews.pluck(:kind)
  end

  def test_going_dormant_skips_a_pending_turn
    cycle = open_second_cycle
    assert_equal "pending", cycle.turn_status
    C.dormant_override = true
    C.check!
    assert_equal "skipped", cycle.reload.turn_status
  end

  private

  def with_env(vars)
    saved = vars.keys.to_h { |k| [k, ENV[k]] }
    vars.each { |k, v| v.nil? ? ENV.delete(k) : ENV[k] = v }
    yield
  ensure
    saved.each { |k, v| v.nil? ? ENV.delete(k) : ENV[k] = v }
  end
end
