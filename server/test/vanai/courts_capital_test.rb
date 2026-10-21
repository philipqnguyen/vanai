require_relative "courts_test_helper"

# The returned Capital's house charges the rate of the court controlling the
# most wild zones, and its tax goes to that court; a tie charges 3% and the tax
# goes to no court, a sink (COURTS.md "Taxes and the auction house"). The
# leader is decided at each boundary beside control.
class CourtsCapitalTest < Minitest::Test
  include CourtsTestHelper
  CAP = Vanai::Courts::CAPITAL_HOUSE

  def boundary!
    advance(C.config.interval + 1)
    C.check!
  end

  def points!(zone, court, value)
    ZoneClaim.where(zone: zone, court: court).update_all(points: value)
  end

  def test_the_capitals_rate_follows_the_leader
    set_court("caerdun", tax_bp: 500)
    set_court("heartwood", tax_bp: 900)
    set_court("moonmere", tax_bp: 200)
    C.check!
    boundary!
    assert_nil C.capital_leader, "no claims anywhere: no leader"
    assert_in_delta 0.03, C.tax_rate(CAP), 1e-9
    assert_nil C.tax_court(CAP)

    # Heartwood holds one big zone, Caerdun two small ones: zones held decide,
    # not total claim
    points!("glassworks", "heartwood", 100)
    points!("northroad", "caerdun", 40)
    points!("reservoir", "caerdun", 40)
    boundary!
    assert_equal "caerdun", C.capital_leader
    assert_in_delta 0.05, C.tax_rate(CAP), 1e-9, "the leader's own home rate"
    assert_equal "caerdun", C.tax_court(CAP)
    buyer = provision("Buyer")
    before = treasury("caerdun")
    C.record_tax!(zone: CAP, amount: 5, buyer: buyer, listing_id: 1)
    assert_equal before + 5, treasury("caerdun"), "its tax income goes to the leader's treasury"

    # a tie (two zones each) leaves no leader, even with an incumbent: 3%, a sink
    points!("summerlakes", "heartwood", 100)
    boundary!
    assert_nil C.capital_leader
    assert_in_delta 0.03, C.tax_rate(CAP), 1e-9
    assert_nil C.tax_court(CAP)
    totals = C::KEYS.to_h { |k| [k, treasury(k)] }
    assert_nil C.record_tax!(zone: CAP, amount: 3, buyer: buyer, listing_id: 2)
    assert_equal totals, C::KEYS.to_h { |k| [k, treasury(k)] }, "a tie's tax reaches no treasury"

    # broken: Moonmere takes three zones
    %w[canalworks granaryplains borderwall].each { |z| points!(z, "moonmere", 500) }
    boundary!
    assert_equal "moonmere", C.capital_leader
    assert_in_delta 0.02, C.tax_rate(CAP), 1e-9
    # dormant courts: the standing 3% everywhere, the Capital included
    C.dormant_override = true
    assert_in_delta 0.03, C.tax_rate(CAP), 1e-9
  end
end
