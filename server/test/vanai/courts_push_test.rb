require_relative "courts_test_helper"

# fund_push (COURTS.md "Verbs"): a war chest doubles the court's claim gains in
# one zone for the cycles it runs, paid from the treasury at the price per
# cycle; nowhere else, for no other court, and not after its last cycle.
class CourtsPushTest < Minitest::Test
  include CourtsTestHelper
  CL = Vanai::Courts::Claims

  def push(zone, cycles) = { "name" => "fund_push", "input" => { "zone" => zone, "cycles" => cycles } }

  def sit(verbs = {})
    stub_council { |court, _p| verbs.fetch(court, []) }
    C.check! if CouncilCycle.count.zero?
    advance(C.config.interval + 1)
    C.check!
    n = C.cycle_number
    assert_equal :ready, C::Council.run_cycle!(n)
    C.check!
    CouncilCycle.find_by!(number: n)
  end

  def boundary!
    advance(C.config.interval + 1)
    C.check!
  end

  def stand(name, city:, into:)
    c = provision(name, city: city)
    W.join(c.id)
    _z, ps = W.find_player(c.id)
    [c, ps]
  end

  # what one gather earns in `zone` now, for ps's court
  def gather_points(ps, zone)
    CL.credit(ps, zone, C.config.claims["gather"])
  end

  def price = C.config.fund_push["price_per_cycle"]

  def test_a_war_chest_doubles_gains_in_its_zone_for_its_cycles
    C.check!
    _a, pa = stand("Ashe", city: "caerdun", into: "caerdunfields")
    _b, pb = stand("Birch", city: "heartwood", into: "caerdunfields")
    cycle = sit("caerdun" => [push("glassworks", 2)])
    assert_equal "applied", cycle.court_turns.find_by!(court: "caerdun").outcome.first["status"]
    row = CourtPush.find_by!(court: "caerdun")
    assert_equal ["glassworks", 2, 3, 2 * price], [row.zone, row.from_cycle, row.to_cycle, row.amount]
    entry = CourtLedgerEntry.find_by!(court: "caerdun", kind: "fund_push")
    assert_equal [-2 * price, "glassworks", 2], [entry.amount, entry.zone, entry.cycle]
    gather = C.config.claims["gather"]
    assert_in_delta 2 * gather, gather_points(pa, "glassworks"), 1e-9, "doubled in its zone"
    assert_in_delta gather, gather_points(pa, "caerdunfields"), 1e-9, "not elsewhere"
    assert_in_delta gather, gather_points(pb, "glassworks"), 1e-9, "not for another court"
    # a dungeon's work credits its parent, so the chest covers it too
    dungeon = Vanai::Data.zones.keys.find { |k| C.claim_zone(k) == "glassworks" && k != "glassworks" }
    assert_in_delta 2 * gather, gather_points(pa, dungeon), 1e-9 if dungeon
    boundary! # cycle 3: still running
    CL.reset!
    assert_in_delta 2 * gather, gather_points(pa, "glassworks"), 1e-9
    boundary! # cycle 4: spent
    CL.reset!
    assert_in_delta gather, gather_points(pa, "glassworks"), 1e-9
  end

  def test_the_clamp
    set_court("moonmere", treasury: 20_000)
    cycle = sit("moonmere" => [push("caerdun", 1), push("capital", 1), push("northroad", 9), push("northroad", 1),
                               push("shoreroad", 1), push("reservoir", 1)])
    got = cycle.court_turns.find_by!(court: "moonmere").outcome.map { |o| [o["status"], o["reason"]] }
    assert_equal ["refused", "caerdun is not a contested zone"], got[0]
    assert_equal ["refused", "capital is not a contested zone"], got[1]
    assert_equal ["clamped", "cycles clamped to 3"], got[2]
    assert_equal ["refused", "your war chest in northroad already runs until sitting 4"], got[3]
    assert_equal "applied", got[4][0]
    assert_equal ["refused", "only 2 war chests a sitting"], got[5]
    assert_equal 4 * price, -CourtLedgerEntry.where(court: "moonmere", kind: "fund_push").sum(:amount)
  end

  def test_it_counts_against_the_commit_cap
    set_court("heartwood", treasury: 0)
    # the stipend lands at the boundary: 400 in the treasury, 280 may be committed
    cycle = sit("heartwood" => [push("huntingwood", 1)])
    o = cycle.court_turns.find_by!(court: "heartwood").outcome.first
    assert_equal "refused", o["status"]
    assert_match(/over the commit cap/, o["reason"])
    assert_empty CourtPush.where(court: "heartwood")
  end
end
