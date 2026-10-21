require_relative "courts_test_helper"

# The claims race (COURTS.md "Claims"): sworn members' work in the 15 wild
# zones (kills weighted by level and split over the party, each share to its
# member's own court; gathering; quests; bounties paid) grows their court's
# claim there, capped per character per cycle; claims decay at every boundary,
# and control goes to the highest, a tie keeping the incumbent. A dungeon's
# work credits its parent; the Keep, the cities and the Capital earn nothing;
# discoveries earn nothing; a contribution keeps the court it was earned for.
class CourtsClaimsTest < Minitest::Test
  include CourtsTestHelper
  CL = Vanai::Courts::Claims

  def zone(key) = Vanai::Data.zones.fetch(key)
  def cap = C.config.claims["cap_per_cycle"]

  # A fresh character sworn to `city`'s court, joined and standing in `into`.
  def stand(name, city:, into:, level: nil)
    c = provision(name, city: city)
    spawn = zone(into)["spawn"] || { "x" => 0, "z" => 0 }
    c.update_columns(zone: into, x: spawn["x"] || 0, z: spawn["z"] || 0)
    W.join(c.id)
    _z, ps = W.find_player(c.id)
    ps.level = level if level
    [c, ps]
  end

  def monster(key, level, at)
    Vanai::MonsterState.new("mtest#{SecureRandom.hex(3)}", key, level, at.x, at.z, { "monster" => key, "respawn" => 30 })
  end

  def claim(zone_key, court)
    CL.flush!
    ZoneClaim.uncached { ZoneClaim.where(zone: zone_key, court: court).pick(:points).to_f }
  end

  def claims_total
    CL.flush!
    ZoneClaim.uncached { ZoneClaim.sum(:points).to_f }
  end

  def boundary!
    advance(C.config.interval + 1)
    C.check!
  end

  def test_a_kill_is_level_weighted_and_split_over_a_mixed_court_party
    C.check!
    _a, pa = stand("Ashe", city: "caerdun", into: "caerdunfields")
    _b, pb = stand("Birch", city: "heartwood", into: "caerdunfields")
    zs = W.zone("caerdunfields")
    CL.on_kill(zs, monster("grey_wolf", 12, pa), [pa, pb])
    assert_in_delta 6.0, claim("caerdunfields", "caerdun"), 1e-9, "level 12 split over two"
    assert_in_delta 6.0, claim("caerdunfields", "heartwood"), 1e-9, "each share to its member's own court"
    assert_in_delta 0.0, claim("caerdunfields", "moonmere"), 1e-9
    # a boss is worth three times its level
    boss = Vanai::Data.monsters.find { |_k, v| v["boss"] }.first
    CL.on_kill(zs, monster(boss, 10, pa), [pa])
    assert_in_delta 36.0, claim("caerdunfields", "caerdun"), 1e-9
    rows = ClaimContribution.where(character_id: [pa.char_id, pb.char_id]).order(:court).pluck(:court, :zone, :points)
    assert_equal [["caerdun", "caerdunfields", 36.0], ["heartwood", "caerdunfields", 6.0]], rows
  end

  def test_monster_death_credits_the_killers_court
    C.check!
    _c, ps = stand("Corin", city: "moonmere", into: "caerdunfields")
    camp = zone("caerdunfields")["camps"].first
    m = Vanai::MonsterState.new("mtest1", camp["monster"], 7, ps.x, ps.z, camp)
    zs = W.zone("caerdunfields")
    zs.monsters[m.mid] = m
    Vanai::Combat.monster_death(zs, m, ps)
    assert_in_delta 7.0, claim("caerdunfields", "moonmere"), 1e-9
  end

  def test_gathering_quests_and_bounties_credit_their_zones
    C.check!
    c, ps = stand("Dara", city: "heartwood", into: "huntingwood")
    zs = W.zone("huntingwood")
    CL.on_gather(zs, ps)
    assert_in_delta C.config.claims["gather"], claim("huntingwood", "heartwood"), 1e-9
    # a quest handed in a city credits the field its work was done in
    key = "cd3"
    work = CL.quest_zone(key)
    assert C.contested?(work), "cd3's work zone #{work.inspect} is contested"
    target = Vanai::Data.quests[key]["objective"]["targets"].first
    assert Array(zone(work)["camps"]).any? { |cp| cp["monster"] == target }, "it is where the quest's monster camps"
    CL.on_quest(W.zone("caerdun"), ps, key)
    expected = C.config.claims["quest_base"] + Vanai::Data.quests[key]["min_lvl"].to_i
    assert_in_delta expected, claim(work, "heartwood") - (work == "huntingwood" ? C.config.claims["gather"] : 0), 1e-9
    # handed in on contested ground: that ground
    CL.on_quest(zs, ps, key)
    assert_in_delta C.config.claims["gather"] + expected, claim("huntingwood", "heartwood"), 1e-9
    # a bounty paid, in the bounty's zone
    bounty = Bounty.new(zone: "glassworks", court: "heartwood")
    CL.on_bounty(ps, bounty)
    assert_in_delta C.config.claims["bounty"], claim("glassworks", "heartwood"), 1e-9
    assert c
  end

  def test_the_cap_per_character_per_cycle
    C.check!
    _c, ps = stand("Edda", city: "caerdun", into: "caerdunfields")
    assert_in_delta cap - 10, CL.credit(ps, "caerdunfields", cap - 10), 1e-9
    assert_in_delta 10, CL.credit(ps, "northroad", 50), 1e-9, "the cap counts every zone together"
    assert_in_delta 0, CL.credit(ps, "caerdunfields", 5), 1e-9
    # a named relic is exempt
    assert_in_delta 150, CL.on_relic(ps, "caerdunfields", named: true), 1e-9
    CL.flush!
    rows = ClaimContribution.where(character_id: ps.char_id).order(:zone).pluck(:zone, :points, :capped, :exempt)
    assert_equal [["caerdunfields", cap - 10 + 150, 5.0, 150.0], ["northroad", 10.0, 40.0, 0.0]], rows
    # the stored total is what a restart counts against: still full
    CL.reset!
    assert_in_delta 0, CL.credit(ps, "northroad", 1), 1e-9
    # and the next cycle starts afresh
    boundary!
    assert_in_delta 20, CL.credit(ps, "northroad", 20), 1e-9
  end

  def test_the_cap_holds_across_a_party_of_one_character
    C.check!
    _c, ps = stand("Fenn", city: "caerdun", into: "caerdunfields")
    zs = W.zone("caerdunfields")
    100.times { CL.on_kill(zs, monster("grey_wolf", 50, ps), [ps]) }
    assert_in_delta cap, claim("caerdunfields", "caerdun"), 1e-9
  end

  def test_decay_and_control_at_the_boundary
    C.check!
    ZoneClaim.where(zone: "glassworks", court: "moonmere").update_all(points: 100)
    ZoneClaim.where(zone: "glassworks", court: "caerdun").update_all(points: 40)
    ZoneClaim.where(zone: "reservoir", court: "caerdun").update_all(points: 0.009)
    online, ps = stand("Gale", city: "caerdun", into: "caerdun")
    boundary!
    assert_in_delta 90, claim("glassworks", "moonmere"), 1e-9, "10% decay"
    assert_in_delta 36, claim("glassworks", "caerdun"), 1e-9
    assert_in_delta 0, claim("reservoir", "caerdun"), 1e-9, "a crumb decays to nothing"
    assert_equal "moonmere", CL.control["glassworks"]
    assert_nil CL.control["reservoir"]
    snap = ZoneControl.find_by!(cycle: 2, zone: "glassworks")
    assert_equal ["moonmere", { "caerdun" => 36.0, "heartwood" => 0.0, "moonmere" => 90.0 }], [snap.court, snap.points]
    assert_equal 15, ZoneControl.where(cycle: 2).count, "every contested zone has its row"
    # the change is in the ledger, the state, the live message and the digest
    ev = CourtLedgerEntry.find_by!(kind: "control", court: "moonmere")
    assert_equal ["glassworks", 1, { "from" => nil, "to" => "moonmere" }], [ev.zone, ev.cycle, ev.meta]
    live = messages("court_control", online).last
    assert_equal({ "glassworks" => "moonmere" }, live[:control])
    assert_equal [{ zone: "glassworks", from: nil, to: "moonmere" }], live[:changes]
    assert_equal({ "glassworks" => "moonmere" }, messages("court_state", online).last[:control])
    digest = CourtNews.find_by!(kind: "digest", cycle: 1)
    entry = digest.payload["sections"]["control"].sole
    assert_equal ["digest_control", "moonmere", "The Glassworks"], [entry["kind"], entry["court"], entry["vars"]["zone"]]
    assert_includes C.config.news["digest_control"]["moonmere"].map { |t| C::News.fill(t, "zone" => "The Glassworks") }, digest.payload["lines"].sole
    refute_match(/\w The Glassworks/, digest.payload["lines"].sole, "the zone's article is lower case mid-sentence")
    # nobody's points: the zone lapses, and the digest says so in no court's voice
    ZoneClaim.where(zone: "glassworks").update_all(points: 0)
    boundary!
    assert_nil CL.control["glassworks"]
    lapsed = CourtNews.find_by!(kind: "digest", cycle: 2).payload["sections"]["control"].sole
    assert_equal ["digest_control_lapsed", nil], [lapsed["kind"], lapsed["court"]]
    assert ps
  end

  def test_ties_keep_the_incumbent
    C.check!
    ZoneClaim.where(zone: "northroad", court: "heartwood").update_all(points: 50)
    boundary!
    assert_equal "heartwood", CL.control["northroad"]
    ZoneClaim.where(zone: "northroad").update_all(points: 80) # all three level
    boundary!
    assert_equal "heartwood", CL.control["northroad"], "a tie at the top keeps the incumbent"
    ZoneClaim.where(zone: "northroad", court: "heartwood").update_all(points: 10)
    boundary!
    assert_nil CL.control["northroad"], "a tie the incumbent is not in: nobody"
    ZoneClaim.where(zone: "northroad", court: "caerdun").update_all(points: 100)
    boundary!
    assert_equal "caerdun", CL.control["northroad"]
  end

  def test_a_dungeon_credits_its_parent_and_the_keep_cities_and_capital_earn_nothing
    C.check!
    _c, ps = stand("Hale", city: "moonmere", into: "huntingwood")
    assert_equal "huntingwood", C.claim_zone("mausoleum")
    CL.credit(ps, "mausoleum", 30)
    assert_in_delta 30, claim("huntingwood", "moonmere"), 1e-9
    assert_nil ZoneClaim.find_by(zone: "mausoleum")
    before = claims_total
    %w[keep capital caerdun heartwood moonmere capitalreturned gulf_to_caerdun].each do |z|
      assert_in_delta 0, CL.credit(ps, z, 30), 1e-9, z
    end
    assert_in_delta before, claims_total, 1e-9
    # and a kill in the Keep, through the real hook
    zs = W.zone("keep")
    CL.on_kill(zs, monster(zone("keep")["camps"].first["monster"], 40, ps), [ps])
    assert_in_delta before, claims_total, 1e-9
  end

  def test_discoveries_earn_nothing
    C.check!
    c, ps = stand("Ivo", city: "caerdun", into: "caerdunfields")
    lm = zone("caerdunfields")["landmarks"].first
    ps.x, ps.z = lm["x"], lm["z"]
    W.discover(c.id, lm["id"])
    assert Discovery.exists?(character_id: c.id, landmark_key: lm["id"]), "the landmark was discovered"
    assert_in_delta 0, claims_total, 1e-9
  end

  def test_a_contribution_keeps_its_court_after_a_switch
    C.check!
    c, ps = stand("Jory", city: "caerdun", into: "caerdunfields")
    CL.credit(ps, "caerdunfields", 40)
    CL.flush!
    C::Allegiance.switch!(c.id, "heartwood", via: "hall")
    assert_equal "heartwood", ps.court
    CL.credit(ps, "caerdunfields", 15)
    assert_in_delta 40, claim("caerdunfields", "caerdun"), 1e-9, "Caerdun keeps what was earned for it"
    assert_in_delta 15, claim("caerdunfields", "heartwood"), 1e-9
    assert_equal [["caerdun", 40.0], ["heartwood", 15.0]],
                 ClaimContribution.where(character_id: c.id).order(:court).pluck(:court, :points)
  end

  def test_a_war_chest_doubles_gains_in_its_zone_for_its_cycles
    C.check!
    _c, ps = stand("Kell", city: "heartwood", into: "glassworks")
    CourtPush.create!(court: "heartwood", zone: "glassworks", from_cycle: 1, to_cycle: 1, amount: 500, created_at: Time.current)
    CL.credit(ps, "glassworks", 10)
    CL.credit(ps, "reservoir", 10)
    assert_in_delta 20, claim("glassworks", "heartwood"), 1e-9
    assert_in_delta 10, claim("reservoir", "heartwood"), 1e-9
    boundary!
    CL.credit(ps, "glassworks", 10)
    assert_in_delta 18 + 10, claim("glassworks", "heartwood"), 1e-9, "decayed, then undoubled"
  end

  def test_the_capital_leader_is_written_at_the_boundary
    C.check!
    ZoneClaim.where(zone: "glassworks", court: "moonmere").update_all(points: 30)
    ZoneClaim.where(zone: "northroad", court: "caerdun").update_all(points: 20)
    ZoneClaim.where(zone: "reservoir", court: "caerdun").update_all(points: 20)
    boundary!
    assert_equal "caerdun", C.capital_leader, "two zones held beat one, though its claim is larger"
  end
end
