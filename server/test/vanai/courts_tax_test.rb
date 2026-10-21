require_relative "courts_test_helper"

# What the courts expose to the auction house: the rate and the court for each
# house, the quote the buyer is shown and the tax credit. The auction wiring
# itself waits for the second of the two branches to merge (COURTS.md "Taxes
# and the auction house").
class CourtsTaxTest < Minitest::Test
  include CourtsTestHelper

  def test_each_city_charges_its_courts_rate
    set_court("caerdun", tax_bp: 500)
    set_court("heartwood", tax_bp: 100)
    assert_in_delta 0.05, C.tax_rate("caerdun"), 1e-9
    assert_in_delta 0.01, C.tax_rate("heartwood"), 1e-9
    assert_in_delta 0.03, C.tax_rate("moonmere"), 1e-9
    assert_equal %w[caerdun heartwood moonmere], %w[caerdun heartwood moonmere].map { |z| C.tax_court(z) }
  end

  def test_no_house_no_rate
    %w[caerdunfields capital keep mausoleum gulf_to_caerdun nowhere].each do |z|
      assert_nil C.tax_rate(z), z
      assert_nil C.tax_court(z), z
      assert_nil C.quote(z, 100), z
    end
  end

  def test_the_capital_charges_the_leaders_home_rate
    set_court("moonmere", tax_bp: 700)
    CourtFlag.set("capital_leader", "moonmere")
    assert_in_delta 0.07, C.tax_rate("capitalreturned"), 1e-9
    assert_equal "moonmere", C.tax_court("capitalreturned")
    CourtFlag.set("capital_leader", nil)
    assert_in_delta 0.03, C.tax_rate("capitalreturned"), 1e-9, "no leader: the standing 3%"
    assert_nil C.tax_court("capitalreturned"), "and the tax goes to no court"
  end

  def test_the_leader_rule_and_its_ties
    assert_equal "heartwood", C.leader_from({ "caerdun" => 10, "heartwood" => 30.5, "moonmere" => 2 }, "caerdun")
    assert_equal "caerdun", C.leader_from({ "caerdun" => 30, "heartwood" => 30, "moonmere" => 2 }, "caerdun"), "a tie keeps the incumbent"
    assert_nil C.leader_from({ "caerdun" => 30, "heartwood" => 30, "moonmere" => 2 }, "moonmere"), "a tie without the incumbent: nobody"
    assert_nil C.leader_from({ "caerdun" => 0, "heartwood" => 0, "moonmere" => 0 }, "caerdun"), "nobody has points: nobody"
    assert_equal "moonmere", C.capital_leader_from({ "caerdun" => 2, "heartwood" => 1, "moonmere" => 3 })
    assert_nil C.capital_leader_from({ "caerdun" => 3, "heartwood" => 3, "moonmere" => 1 }), "a tie for the Capital: nobody"
    assert_nil C.capital_leader_from({ "caerdun" => 0, "heartwood" => 0, "moonmere" => 0 }), "no zone held: nobody"
  end

  def test_quote_rounds_the_tax_up_to_whole_gold
    set_court("caerdun", tax_bp: 500)
    assert_equal({ rate_bp: 500, tax: 5, total: 105 }, C.quote("caerdun", 100))
    assert_equal({ rate_bp: 500, tax: 1, total: 2 }, C.quote("caerdun", 1))
    assert_equal({ rate_bp: 300, tax: 4, total: 137 }, C.quote("moonmere", 133))
    assert_equal({ rate_bp: 500, tax: 0, total: 0 }, C.quote("caerdun", 0))
  end

  def test_record_tax_credits_the_houses_court_inside_the_callers_transaction
    buyer = provision("Taxpayer")
    before = treasury("heartwood")
    C.record_tax!(zone: "heartwood", amount: 12, buyer: buyer, listing_id: 77)
    assert_equal before + 12, treasury("heartwood")
    row = CourtLedgerEntry.find_by!(kind: "tax")
    assert_equal ["heartwood", 12, buyer.id, "Taxpayer", "heartwood"], [row.court, row.amount, row.character_id, row.character_name, row.zone]
    assert_equal({ "house" => "heartwood", "listing_id" => 77 }, row.meta)
    Court.transaction(requires_new: true) do
      C.record_tax!(zone: "heartwood", amount: 5, buyer: buyer, listing_id: 78)
      raise ActiveRecord::Rollback # the purchase failed
    end
    assert_equal before + 12, treasury("heartwood")
    assert_nil C.record_tax!(zone: "keep", amount: 5)
    assert_nil C.record_tax!(zone: "caerdun", amount: 0)
    CourtFlag.set("capital_leader", "caerdun")
    c_before = treasury("caerdun")
    C.record_tax!(zone: "capitalreturned", amount: 9, buyer: buyer)
    assert_equal c_before + 9, treasury("caerdun")
  end

  def test_court_state_carries_the_rates
    set_court("moonmere", tax_bp: 450)
    c = provision("Ratewatch", city: "moonmere")
    C.check!
    state = C.state_payload(c.id)
    assert_equal({ "caerdun" => 300, "heartwood" => 300, "moonmere" => 450 }, state[:tax])
    assert_equal "moonmere", state[:court]
    assert_equal "The Academy Court of Moonmere", state[:court_name]
    assert_equal 1, state[:cycle]
    assert_equal C.config.interval.round, state[:cycle_ends_in]
    refute state[:switch_used]
  end

  def test_contested_zones_and_claim_parents
    contested = Vanai::Data.zones.keys.select { |z| C.contested?(z) }
    assert_equal 15, contested.size
    refute C.contested?("capital")
    refute C.contested?("caerdun")
    assert_equal "huntingwood", C.claim_zone("mausoleum")
    assert_equal "huntingwood", C.claim_zone("huntingwood")
    assert_nil C.claim_zone("keep"), "the Keep's parent is the Capital, which earns nothing"
    assert_nil C.claim_zone("caerdun")
    assert_nil C.claim_zone("gulf_to_moonmere")
    Vanai::Data.zones.each { |k, z| assert C.claim_zone(k), k if z["kind"] == "dungeon" && k != "keep" }
  end
end
