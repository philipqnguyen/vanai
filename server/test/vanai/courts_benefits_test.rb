require_relative "courts_test_helper"

# What control gives the controlling court's sworn members in that zone
# (COURTS.md "Benefits for the controlling court's members"): half fare to the
# zone's crystal, half price at its vendor, +50% drop chance in two bands, and
# one more item on a 25% roll at a node. Only members, only in the controlled
# wild zone (not its dungeons).
class CourtsBenefitsTest < Minitest::Test
  include CourtsTestHelper
  BE = Vanai::Courts::Benefits
  CL = Vanai::Courts::Claims

  # A roll that comes up as told, in order (then repeats the last).
  class Rolls
    def initialize(*values) = @values = values
    def rand(*) = @values.size > 1 ? @values.shift : @values.first
  end

  def zone(key) = Vanai::Data.zones.fetch(key)

  def with_singleton(object, name, impl)
    # only a method of the object's own is put back; an inherited one (Kernel's
    # rand) is uncovered again by removing the stand-in
    original = object.method(name) if object.singleton_methods(false).include?(name)
    object.define_singleton_method(name, &impl)
    yield
  ensure
    original ? object.define_singleton_method(name, original) : object.singleton_class.send(:remove_method, name)
  end

  def control!(map)
    ZoneControl.delete_all
    map.each { |z, c| ZoneControl.create!(cycle: 1, zone: z, court: c, created_at: Time.current) }
    CL.reset!
  end

  def stand(name, city:, into:, at: nil)
    c = provision(name, city: city)
    at ||= zone(into)["spawn"] || { "x" => 0, "z" => 0 }
    c.update_columns(zone: into, x: at["x"] || 0, z: at["z"] || 0)
    W.join(c.id)
    _z, ps = W.find_player(c.id)
    ps.x, ps.z = at["x"] || 0, at["z"] || 0
    [c, ps]
  end

  def test_fares_are_halved_only_for_members_and_only_to_the_controlled_zone
    C.check!
    control!("huntingwood" => "caerdun")
    crystal = zone("caerdunfields")["milestones"].first
    c, ps = stand("Ama", city: "caerdun", into: "caerdunfields", at: crystal)
    _r, rival = stand("Bel", city: "heartwood", into: "caerdunfields", at: crystal)
    fare = W.crystal_fare(ps)
    assert_equal (fare / 2.0).ceil, BE.fare(ps, "huntingwood", fare)
    assert_equal fare, BE.fare(rival, "huntingwood", fare), "a rival court's member pays in full"
    assert_equal fare, BE.fare(ps, "caerdunfields", fare), "a zone the court does not hold"
    assert_equal fare, BE.fare(ps, "mausoleum", fare), "not in the controlled zone's dungeons"
    assert_equal 0, BE.fare(ps, "huntingwood", 0), "going home stays free"
    assert_equal 13, BE.fare(ps, "huntingwood", 25), "the odd half gold rounds up"
    # the crystal menu shows each destination's own fee, and the passage charges it
    there = zone("huntingwood")["milestones"].first
    ps.lit_milestones << crystal["id"] << there["id"]
    dests = W.milestone_destinations(ps, "caerdunfields", crystal["id"])
    assert_equal (fare / 2.0).ceil, dests.find { |d| d[:id] == there["id"] }[:fee]
    ps.gold = 1000
    Character.where(id: c.id).update_all(gold: 1000)
    W.milestone_travel(c.id, there["id"])
    assert_equal 1000 - (fare / 2.0).ceil, c.reload.gold
  end

  def test_the_vendor_halves_its_price_for_members_in_its_own_zone
    C.check!
    vendor = zone("caerdunfields")["npcs"].find { |n| n["kind"] == "vendor" }
    key = vendor["stock"].first
    price = Vanai::Data.items[key]["price"].to_i
    api = ActionDispatch::Integration::Session.new(Rails.application)
    api.host! "localhost"
    api.post "/api/register", params: { email: "vendor-#{SecureRandom.hex(3)}@example.invalid", password: "isolated-test-password" }, as: :json
    api.post "/api/characters", params: { name: "Coinpurse", race: "aedri", job: "WHM", city: "moonmere" }, as: :json
    id = JSON.parse(api.response.body).dig("character", "id")
    api.post "/api/characters/#{id}/select", as: :json
    Character.where(id: id).update_all(zone: "caerdunfields", x: vendor["x"], z: vendor["z"] + 1, gold: 500)
    W.join(id)
    _z, ps = W.find_player(id)
    ps.x, ps.z = vendor["x"], vendor["z"] + 1
    buy = lambda do
      before = Character.uncached { Character.find(id).gold }
      api.post "/api/game/vendor", params: { npc_id: vendor["id"], op: "buy", item_key: key }, as: :json
      assert JSON.parse(api.response.body)["ok"], api.response.body
      before - Character.uncached { Character.find(id).gold }
    end
    assert_equal price, buy.call, "nobody holds the zone: full price"
    control!("caerdunfields" => "moonmere")
    assert_equal (price / 2.0).ceil, buy.call, "Moonmere holds it: half"
    control!("caerdunfields" => "caerdun")
    assert_equal price, buy.call, "another court holds it: full price"
    # selling is unchanged
    char = Character.find(id)
    assert_equal price, BE.vendor_price(char, "caerdunfields", price)
    control!("caerdunfields" => "moonmere")
    assert_equal (price / 2.0).ceil, BE.vendor_price(char.reload, "caerdunfields", price)
    assert_equal price, BE.vendor_price(char, "moonmere", price), "a city's vendors are nobody's to discount"
  end

  def test_drop_bands
    C.check!
    control!("caerdunfields" => "caerdun")
    _a, member = stand("Dun", city: "caerdun", into: "caerdunfields")
    _b, other = stand("Ele", city: "heartwood", into: "caerdunfields")
    _c, third = stand("Fio", city: "moonmere", into: "caerdunfields")
    zs = W.zone("caerdunfields")
    drop = { "item" => "wolf_pelt", "chance" => 0.2 }
    pick = ->(roll, members) { BE.drop_recipient(zs, members, drop, Rolls.new(roll)) { |pool| pool } }
    # under the chance: as today, from everyone
    assert_equal [member, other], pick.(0.19, [member, other])
    assert_equal [other], pick.(0.19, [other])
    # between the chance and 1.5x: only a qualifying member can receive it
    assert_equal [member], pick.(0.25, [member, other, third])
    assert_nil pick.(0.25, [other, third]), "no member in the party: exactly what it would get without the bonus"
    # above 1.5x nothing, however many members (the bonus does not stack)
    six = Array.new(6) { member }
    assert_nil pick.(0.305, six)
    assert_nil pick.(0.31, [member])
    # capped at certain
    high = { "item" => "wolf_pelt", "chance" => 0.8 }
    assert_equal [member], BE.drop_recipient(zs, [member, other], high, Rolls.new(0.99)) { |pool| pool }
    certain = { "item" => "wolf_pelt", "chance" => 1.0 }
    assert_equal [member, other], BE.drop_recipient(zs, [member, other], certain, Rolls.new(0.999)) { |pool| pool }
    # not in a dungeon of the controlled zone
    assert_nil BE.drop_recipient(W.zone("mausoleum"), [member], drop, Rolls.new(0.25)) { |pool| pool }
  end

  def test_the_loot_hook_rolls_once_per_drop_through_the_bands
    C.check!
    control!("caerdunfields" => "caerdun")
    _a, member = stand("Gil", city: "caerdun", into: "caerdunfields")
    _b, other = stand("Hob", city: "heartwood", into: "caerdunfields")
    zs = W.zone("caerdunfields")
    # grey_wolf: wolf_pelt 0.45, wolf_fang 0.3. The rolls: gold, then one per drop.
    # 0.5 is inside the pelt's bonus band (0.45..0.675); 0.46 is past the fang's (0.3..0.45).
    m = Vanai::MonsterState.new("mloot", "grey_wolf", 5, member.x, member.z)
    rolls = Rolls.new(0.0, 0.5, 0.46)
    with_singleton(Vanai::Combat, :rng, ->(*) { rolls }) { Vanai::Combat.award_loot(zs, m, [member, other]) }
    got = InventoryItem.where(character_id: [member.char_id, other.char_id], item_key: %w[wolf_pelt wolf_fang]).pluck(:character_id, :item_key)
    assert_equal [[member.char_id, "wolf_pelt"]], got
  end

  def test_gathering_bonus_for_members_on_a_quarter_roll
    C.check!
    control!("caerdunfields" => "heartwood")
    _a, member = stand("Ivy", city: "heartwood", into: "caerdunfields")
    _b, other = stand("Jem", city: "caerdun", into: "caerdunfields")
    BE.rng = Rolls.new(0.2)
    assert_equal 1, BE.gather_bonus(member, "caerdunfields")
    assert_equal 0, BE.gather_bonus(other, "caerdunfields")
    assert_equal 0, BE.gather_bonus(member, "huntingwood")
    BE.rng = Rolls.new(0.25)
    assert_equal 0, BE.gather_bonus(member, "caerdunfields"), "25%, not more"
  end

  def test_a_node_picked_by_a_member_through_the_world
    C.check!
    control!("caerdunfields" => "heartwood")
    node = zone("caerdunfields")["nodes"].first
    c, ps = stand("Kip", city: "heartwood", into: "caerdunfields", at: node)
    BE.rng = Rolls.new(0.0)
    with_singleton(W, :rand, ->(*) { 0 }) { W.interact(c.id, node["id"]) }
    item = Vanai::World::NODE_ITEM[node["kind"]]
    assert_equal 2, InventoryItem.where(character_id: c.id, item_key: item).sum(:qty), "1 + rand(2)=0, + the member's 1"
    CL.flush!
    assert_in_delta C.config.claims["gather"], ZoneClaim.find_by!(zone: "caerdunfields", court: "heartwood").points, 1e-9
    assert ps
  end
end
