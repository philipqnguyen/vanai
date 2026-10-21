require_relative "courts_test_helper"

# The audience halls (COURTS.md "The audience hall"): injected into each city
# from courts.json; the herald speaks for the court and, like a trainer, never
# offers a quest; the stations answer only within reach and on their floor; the
# swearing desk switches a character to that desk's court, once per cycle, and
# never at their own court's desk.
class CourtsHallsTest < Minitest::Test
  include CourtsTestHelper
  H = Vanai::Courts::Halls

  def zone(key) = Vanai::Data.zones.fetch(key)
  def station(court, kind) = zone(court)["interactables"].find { |i| i["id"] == "court_#{kind}_#{court}" }
  def herald(court) = zone(court)["npcs"].find { |n| n["id"] == "court_herald_#{court}" }

  # Joins a fresh character, sworn to `city`'s court, in the zone `into`
  # (the city by default) and stands them at (x, z), on `floor` of the court
  # hall's site when it has one.
  def stand(name, city:, at:, into: city, floor: nil)
    c = provision(name, city: city)
    c.update_columns(zone: into, x: at["x"], z: at["z"])
    W.join(c.id)
    _z, ps = W.find_player(c.id)
    ps.x, ps.z = at["x"], at["z"]
    ps.site_levels = {}
    if (site = at["site"])
      ps.site_levels[site] = zone(into)["sites"][site]["floors"][floor || at["floor"]]
    end
    [c, ps]
  end

  def test_each_city_has_its_herald_and_four_stations
    Vanai::Courts::KEYS.each do |court|
      h = herald(court)
      assert_equal ["herald", court], [h["kind"], h["court"]], court
      stations = zone(court)["interactables"].select { |i| i["court_station"] }
      assert_equal H::STATIONS.sort, stations.map { |s| s["court_station"] }.sort, court
      assert stations.all? { |s| s["court"] == court }
    end
    # the Court Hall's council floor: the herald and every station carry the site and floor
    ([herald("caerdun")] + %w[board registry swearing book].map { |k| station("caerdun", k) }).each do |rec|
      assert_equal ["court_archive", 1, 14.275], [rec["site"], rec["floor"], rec["y"]], rec["id"]
    end
    # no hall anywhere else, and injecting twice adds nothing
    others = Vanai::Data.zones.except(*Vanai::Courts::KEYS).values
    refute others.any? { |z| (z["npcs"] || []).any? { |n| n["kind"] == "herald" } }
    before = zone("caerdun")["npcs"].size
    H.inject!(Vanai::Data.zones, JSON.parse(File.read(Rails.root.join("../shared/data/courts.json"))))
    assert_equal before, zone("caerdun")["npcs"].size
  end

  def test_the_herald_never_offers_quests
    _c, ps = stand("Listener", city: "heartwood", at: herald("heartwood"))
    W.talk(ps.char_id, "court_herald_heartwood")
    d = messages("npc_dialog").last
    assert_equal [[], []], [d[:offers], d[:turnins]]
    assert_equal "heartwood", d[:herald][:court]
    assert_includes d[:lines], herald("heartwood")["dialog"].first
    # with a proclamation, the herald reads the newest one aloud
    Proclamation.create!(court: "heartwood", cycle: 1, text: "Older words.", created_at: T0)
    Proclamation.create!(court: "heartwood", cycle: 1, text: "The newest words.", created_at: T0 + 5)
    W.talk(ps.char_id, "court_herald_heartwood")
    assert_equal "The newest words.", messages("npc_dialog").last[:lines].last
  end

  def test_a_quest_naming_a_herald_as_giver_is_refused
    data = Vanai::Data
    saved = data.quests
    data.instance_variable_set(:@quests, saved.merge("bad_herald_q" => { "giver" => "court_herald_moonmere", "objective" => {} }))
    assert_includes data.quest_problems, "bad_herald_q: giver court_herald_moonmere is a court herald, who never offers quests"
  ensure
    data.instance_variable_set(:@quests, saved)
  end

  def test_stations_answer_only_in_reach_and_on_their_floor
    board = station("caerdun", "board")
    c, ps = stand("Climber", city: "caerdun", at: board)
    W.interact(c.id, board["id"])
    panel = messages("court_panel", c).last
    assert_equal ["board", "caerdun", "The Court of Caerdun"], [panel[:station], panel[:court], panel[:court_name]]
    assert_equal({ items: [], next: nil, taken: {} }, panel[:page])
    # the same x and z on the vaults' floor below: through a floor
    ps.site_levels["court_archive"] = zone("caerdun")["sites"]["court_archive"]["floors"][0]
    @messages.clear
    W.interact(c.id, board["id"])
    assert_empty messages("court_panel", c)
    assert_equal "Use the stairs to reach this floor.", messages("system", c).last[:msg]
    # too far
    ps.site_levels["court_archive"] = 14.275
    ps.x += 12
    W.interact(c.id, board["id"])
    assert_equal "Too far away.", messages("system", c).last[:msg]
  end

  def test_each_station_opens_its_panel
    %w[registry swearing book].each_with_index do |kind, i|
      st = station("moonmere", kind)
      c, = stand("Visitor#{"abc"[i]}", city: "caerdun", into: "moonmere", at: st)
      W.interact(c.id, st["id"])
      panel = messages("court_panel", c).last
      assert_equal [kind, "moonmere"], [panel[:station], panel[:court]], kind
      case kind
      when "registry" then assert_equal [false, "caerdun"], [panel[:own], panel[:sworn]]
      when "swearing" then assert_equal ["caerdun", false, Vanai::Courts::KEYS], [panel[:sworn], panel[:switch_used], panel[:courts].map { |k| k[:key] }]
      when "book" then assert_equal [[], 0], [panel[:entries], panel[:total]]
      end
    end
  end

  def test_swearing_at_another_courts_desk
    C.check!
    desk = station("heartwood", "swearing")
    c, ps = stand("Oathtaker", city: "caerdun", into: "heartwood", at: desk)
    assert Vanai::Courts::Allegiance.swear_at_hall(c.id, "heartwood")
    assert_equal ["heartwood", 1], c.reload.then { |r| [r.court, r.court_switched_cycle] }
    assert_equal "heartwood", ps.court
    assert_equal "hall", AllegianceChange.where(character_id: c.id).order(:id).last.via
    assert_equal "heartwood", messages("court_swore", c).last[:court]
    assert messages("court_state", c).last[:switch_used]
  end

  def test_swearing_refusals
    C.check!
    desk = station("moonmere", "swearing")
    c, ps = stand("Refused", city: "moonmere", at: desk)
    # your own court's desk swears you to nothing
    refute Vanai::Courts::Allegiance.swear_at_hall(c.id, "moonmere")
    assert_match(/already sworn/, messages("court_notice", c).last[:text])
    # another court, but not at that court's desk (Moonmere's hall has no Caerdun desk)
    refute Vanai::Courts::Allegiance.swear_at_hall(c.id, "caerdun")
    assert_match(/that court's own desk/, messages("court_notice", c).last[:text])
    # at a rival's desk, out of reach
    c2, ps2 = stand("Faraway", city: "caerdun", into: "moonmere", at: desk)
    ps2.x += 20
    refute Vanai::Courts::Allegiance.swear_at_hall(c2.id, "moonmere")
    assert_equal "Too far away.", messages("court_notice", c2).last[:text]
    ps2.x -= 20
    assert Vanai::Courts::Allegiance.swear_at_hall(c2.id, "moonmere")
    # once per cycle: back to Caerdun must wait, even at Caerdun's own desk
    caer = station("caerdun", "swearing")
    W.leave(c2.id)
    c2.reload.update_columns(zone: "caerdun", x: caer["x"], z: caer["z"])
    W.join(c2.id)
    _z, ps2 = W.find_player(c2.id)
    ps2.site_levels = { "court_archive" => 14.275 }
    refute Vanai::Courts::Allegiance.swear_at_hall(c2.id, "caerdun")
    assert_match(/already changed courts this sitting/, messages("court_notice", c2).last[:text])
    advance(C.config.interval)
    C.check!
    assert Vanai::Courts::Allegiance.swear_at_hall(c2.id, "caerdun")
    assert_equal "caerdun", c2.reload.court
    assert_equal "moonmere", c.reload.court, "a refusal spends nothing"
    assert_nil c.court_switched_cycle
    assert_equal "moonmere", ps.court
  end
end
