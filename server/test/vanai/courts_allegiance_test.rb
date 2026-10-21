require_relative "courts_test_helper"

# Every character is sworn to one court, always: a new one to their starting
# city's, and a switch at most once per council cycle (COURTS.md "Allegiance").
class CourtsAllegianceTest < Minitest::Test
  include CourtsTestHelper
  A = Vanai::Courts::Allegiance

  def test_provision_swears_to_the_starting_city
    C.check!
    { "caerdun" => "Startcaer", "heartwood" => "Startheart", "moonmere" => "Startmoon" }.each do |city, name|
      c = provision(name, city: city)
      assert_equal city, c.reload.court
      row = AllegianceChange.find_by!(character_id: c.id)
      assert_equal [nil, city, "creation", 1, name], [row.from_court, row.to_court, row.via, row.cycle, row.character_name]
    end
  end

  def test_the_player_state_carries_the_court
    c = provision("Stateful", city: "heartwood")
    W.join(c.id)
    _z, ps = W.find_player(c.id)
    assert_equal "heartwood", ps.court
    state = messages("court_state", c).last
    assert_equal "heartwood", state[:court]
  end

  def test_switch_once_per_cycle
    C.check!
    c = provision("Turncoat")
    W.join(c.id)
    assert_equal [true, nil], A.switch!(c.id, "moonmere", via: "hall")
    c.reload
    assert_equal ["moonmere", 1], [c.court, c.court_switched_cycle]
    _z, ps = W.find_player(c.id)
    assert_equal "moonmere", ps.court
    assert_equal "moonmere", messages("court_swore", c).last[:court]
    assert messages("court_state", c).last[:switch_used]
    ok, why = A.switch!(c.id, "heartwood", via: "hall")
    refute ok
    assert_match(/already changed courts this sitting/, why)
    assert_equal "moonmere", c.reload.court
    # swear events on both courts' ledgers
    assert_equal %w[caerdun moonmere], CourtLedgerEntry.where(kind: "swear").order(:court).pluck(:court)
    advance(C.config.interval)
    C.check!
    assert_equal [true, nil], A.switch!(c.id, "heartwood", via: "hall")
    assert_equal ["heartwood", 2], c.reload.then { |r| [r.court, r.court_switched_cycle] }
  end

  def test_refusals
    C.check!
    c = provision("Stayput", city: "heartwood")
    ok, why = A.switch!(c.id, "heartwood", via: "hall")
    refute ok
    assert_match(/already sworn/, why)
    refute A.switch!(c.id, "regent", via: "hall").first
    refute A.switch!(0, "caerdun", via: "hall").first
    assert_nil c.reload.court_switched_cycle, "a refusal spends nothing"
  end

  def test_the_loyalty_record
    C.check!
    c = provision("Wanderer")
    advance(C.config.interval)
    C.check!
    A.switch!(c.id, "heartwood", via: "hall")
    advance(C.config.interval * 2)
    C.check!
    advance(C.config.interval)
    C.check!
    record = A.loyalty_record(c.id)
    assert_equal [["caerdun", "creation", 1, 1], ["heartwood", "hall", 2, 2]],
                 record["sworn"].map { |r| [r["court"], r["via"], r["cycle"], r["cycles"]] }
    assert_equal({ "caerdun" => 1, "heartwood" => 2 }, record["cycles_in"])
    assert_equal [[], [], 0], [record["offers"], record["purses"], record["paid_switches"]]
  end

  # The swearing migration against real rows: a city home, a field home with a
  # first-attuned city crystal, a field home with none.
  def test_the_swearing_migration_on_real_rows
    require Rails.root.join("db/migrate/20261012100005_swear_existing_characters").to_s
    city = provision("Homecity", city: "heartwood")
    field = provision("Homefield", city: "moonmere")
    field.discoveries.create!(landmark_key: "milestone_crystal_caerdun") # attuned later
    stray = provision("Homeless", city: "moonmere")
    stray.discoveries.where("landmark_key LIKE 'milestone_%'").delete_all
    Character.where(id: [city.id, field.id, stray.id]).update_all(court: "caerdun")
    Character.where(id: [field.id, stray.id]).update_all(home_zone: "huntingwood")
    AllegianceChange.where(character_id: [city.id, field.id, stray.id]).delete_all
    ActiveRecord::Migration.suppress_messages { SwearExistingCharacters.new.up }
    assert_equal %w[heartwood moonmere caerdun], [city, field, stray].map { |c| c.reload.court }
    rows = AllegianceChange.where(character_id: [city.id, field.id, stray.id]).order(:character_id).pluck(:to_court, :via, :cycle)
    assert_equal [["heartwood", "migration", 0], ["moonmere", "migration", 0], ["caerdun", "migration", 0]], rows
    ActiveRecord::Migration.suppress_messages { SwearExistingCharacters.new.up }
    assert_equal 3, AllegianceChange.where(character_id: [city.id, field.id, stray.id]).count, "running it again adds nothing"
  end
end
