require_relative "courts_test_helper"
require "action_dispatch/testing/integration"

# Relics (COURTS.md "Relics"): common relics drop in the wild zones and their
# dungeons and register only at the registering character's own court's hall,
# paying the registrant from the treasury and crediting the relic's zone; a
# court's budget per cycle, then a reduced rate, never below zero and never
# closed; a per-character cap. Named relics: one slot per zone per cycle, unique
# even under a race, no drop bonus, a random party member finds it, bound to
# the finder (trade, vendor, auction and destroy all refused), crumbling 24
# hours after it was found even while the finder is offline, registered at the
# finder's current court, and the book keeps the finder's name after the
# character is deleted. Names come from parts by zone and kind.
class CourtsRelicsTest < Minitest::Test
  include CourtsTestHelper
  R = Vanai::Courts::Relics
  CL = Vanai::Courts::Claims

  # Floats in order for rand(), and a fixed index for rand(n) (Array#sample).
  class FakeRng
    def initialize(floats = [], pick: 0)
      @floats = floats.dup
      @pick = pick
    end

    def rand(n = nil)
      return @pick % n if n.is_a?(Integer)
      @floats.empty? ? 0.99 : @floats.shift
    end
  end

  def zone(key) = Vanai::Data.zones.fetch(key)
  def desk(court, kind = "registry") = zone(court)["interactables"].find { |i| i["id"] == "court_#{kind}_#{court}" }

  # A fresh character sworn to `city`'s court, standing at `at` in `into` (on
  # the hall's floor when it has one).
  def stand(name, city:, at: nil, into: city)
    at ||= desk(city)
    c = provision(name, city: city)
    c.update_columns(zone: into, x: at["x"] || 0, z: at["z"] || 0)
    W.join(c.id)
    _z, ps = W.find_player(c.id)
    ps.x, ps.z = at["x"] || 0, at["z"] || 0
    ps.site_levels = {}
    ps.site_levels[at["site"]] = zone(into)["sites"][at["site"]]["floors"][at["floor"]] if at["site"]
    [c, ps]
  end

  def in_field(name, city:, into: "glassworks")
    stand(name, city: city, at: zone(into)["spawn"] || { "x" => 0, "z" => 0 }, into: into)
  end

  def give(c, item, qty)
    InventoryItem.create!(character_id: c.id, item_key: item, qty: qty)
  end

  # A named relic in `c`'s bags, found `ago` seconds before now.
  def named(c, zone: "glassworks", kind: "documents", ago: 60, cycle: C.cycle_number)
    slot = NamedRelic.where(cycle: cycle, zone: zone).count + 1
    r = NamedRelic.create!(cycle: cycle, zone: zone, slot: slot, kind: kind, name: "Steward Aldo's Tally of the East Furnaces",
                           finder_id: c.id, finder_name: c.name, found_at: @time - ago)
    InventoryItem.create!(character_id: c.id, item_key: "named_relic", qty: 1, named_relic_id: r.id)
    r
  end

  def gold(c) = Character.uncached { Character.find(c.id).gold }
  def notice(c) = messages("court_notice", c).last&.dig(:text)
  def claim(zone_key, court)
    CL.flush!
    ZoneClaim.uncached { ZoneClaim.where(zone: zone_key, court: court).pick(:points).to_f }
  end

  def relic(zone_key, kind) = C.config.data.dig("relics", "zones", zone_key, "common", kind)
  def qty(c, item) = InventoryItem.uncached { InventoryItem.where(character_id: c.id, item_key: item).sum(:qty) }

  def monster(key, level, at)
    Vanai::MonsterState.new("mtest#{SecureRandom.hex(3)}", key, level, at.x, at.z, { "monster" => key, "respawn" => 30 })
  end

  # ---- common relics ----

  def test_registration_only_at_the_own_courts_desk_and_in_reach
    C.check!
    c, ps = stand("Wren", city: "moonmere", at: desk("caerdun"), into: "caerdun")
    row = give(c, relic("glassworks", "documents"), 2)
    R.register!(c.id, "inv_id" => row.id, "qty" => 1)
    assert_match(/Only your own court's registry/, notice(c))
    assert_equal 2, qty(c, row.item_key)
    # at its own desk, but too far from it
    c2, ps2 = stand("Ansel", city: "caerdun")
    row2 = give(c2, relic("glassworks", "surveys"), 1)
    ps2.x += 20
    R.register!(c2.id, "inv_id" => row2.id)
    assert_equal "Too far away.", notice(c2)
    assert_equal 0, RelicRegistration.count
    assert ps # stood
  end

  def test_registering_pays_the_registrant_and_credits_the_relics_zone
    C.check!
    c, ps = stand("Tamsin", city: "caerdun")
    row = give(c, relic("glassworks", "surveys"), 3)
    before_gold = gold(c)
    before = treasury("caerdun")
    R.register!(c.id, "inv_id" => row.id, "qty" => 2)
    price = C.config.relics["price"]
    assert_equal before_gold + 2 * price, gold(c)
    assert_equal before_gold + 2 * price, ps.gold
    assert_equal before - 2 * price, treasury("caerdun")
    assert_equal 1, qty(c, row.item_key)
    entry = CourtLedgerEntry.where(court: "caerdun", kind: "relic_common").last
    assert_equal(-2 * price, entry.amount)
    assert_equal "glassworks", entry.zone
    # the relic's zone, not the hall's
    assert_in_delta 2 * C.config.claims["relic_common"], claim("glassworks", "caerdun"), 1e-9
    assert_in_delta 0.0, claim("caerdunfields", "caerdun"), 1e-9
    reg = RelicRegistration.last
    assert_equal [c.id, "caerdun", "glassworks", "surveys", 2, 2 * price], [reg.character_id, reg.court, reg.zone, reg.kind, reg.qty, reg.paid]
    assert_match(/You are paid #{2 * price} gold/, notice(c))
    assert_equal "registry", messages("court_panel", c).last[:station]
  end

  # The stack is read again under a lock inside the registration: a sale of
  # it since the desk's first read pays nothing and takes nothing.
  def test_a_stack_sold_since_the_first_read_is_not_registered
    C.check!
    c, _ps = stand("Pellam", city: "caerdun")
    row = give(c, relic("glassworks", "surveys"), 3)
    stale = InventoryItem.find(row.id)
    row.update_columns(qty: 1) # sold on a request thread meanwhile
    before = treasury("caerdun")
    gold0 = gold(c)
    # the desk's first read sees the stack as it stood (3); the lock sees 1
    InventoryItem.define_singleton_method(:find_by) { |*_a, **_k| stale }
    begin
      R.register!(c.id, "inv_id" => row.id, "qty" => 3)
    ensure
      InventoryItem.singleton_class.remove_method(:find_by)
    end
    assert_match(/no longer carry/, notice(c))
    assert_equal [1, before, gold0, 0], [qty(c, row.item_key), treasury("caerdun"), gold(c), RelicRegistration.count]
  end

  def test_the_budget_then_the_reduced_rate_never_below_zero_and_never_closed
    C.check!
    Court.where(key: "heartwood").update_all(relic_prices: { "documents" => 40, "goods" => 100, "surveys" => 40 }, relic_budget: 250)
    c, _ps = stand("Petta", city: "heartwood")
    row = give(c, relic("kingsgardens", "goods"), 5)
    g0 = gold(c)
    R.register!(c.id, "inv_id" => row.id, "qty" => 3)
    # 100 + 100 within the budget, the third at a quarter
    assert_equal g0 + 225, gold(c)
    assert_equal 1, RelicRegistration.last.reduced_qty
    news = CourtNews.where(kind: "budget_spent", court: "heartwood")
    assert_equal ["board"], news.pluck(:audience)
    R.register!(c.id, "inv_id" => row.id, "qty" => 1)
    assert_equal g0 + 250, gold(c)
    assert_equal 1, news.count, "the board hears it once a sitting"
    # an empty treasury still registers: nothing paid, the claim still counts
    set_court("heartwood", treasury: 0)
    R.register!(c.id, "inv_id" => row.id, "qty" => 1)
    assert_equal g0 + 250, gold(c)
    assert_equal 0, treasury("heartwood")
    assert_equal 0, qty(c, row.item_key)
    assert_equal 5, RelicRegistration.where(character_id: c.id).sum(:qty)
    assert_in_delta 5 * C.config.claims["relic_common"], claim("kingsgardens", "heartwood"), 1e-9
  end

  def test_the_per_character_cap_per_cycle
    C.check!
    c, _ps = stand("Ives", city: "heartwood")
    cap = C.config.relics["per_character"]
    row = give(c, relic("huntingwood", "goods"), cap + 3)
    R.register!(c.id, "inv_id" => row.id, "qty" => cap + 3)
    assert_equal cap, RelicRegistration.where(character_id: c.id).sum(:qty)
    assert_equal 3, qty(c, row.item_key)
    R.register!(c.id, "inv_id" => row.id, "qty" => 1)
    assert_match(/as many as the registry takes/, notice(c))
    # the next cycle opens it again
    advance(C.config.interval + 1)
    C.check!
    R.register!(c.id, "inv_id" => row.id, "qty" => 1)
    assert_equal 2, qty(c, row.item_key)
  end

  def test_a_kill_drops_the_zones_common_relic_and_the_drop_bonus_widens_it
    C.check!
    _c, ps = in_field("Corvo", city: "moonmere")
    zs = W.zone("glassworks")
    chance = C.config.relics["drop_kill"]
    # a roll under the chance: the zone's relic (the first kind)
    R.rng = FakeRng.new([chance / 2, 0.99])
    R.on_kill(zs, monster("glass_wasp", 22, ps), [ps])
    assert_equal 1, qty(_c, relic("glassworks", "documents"))
    # between the chance and 1.5x: only for the controlling court's members
    R.rng = FakeRng.new([chance * 1.2, 0.99])
    R.on_kill(zs, monster("glass_wasp", 22, ps), [ps])
    assert_equal 1, qty(_c, relic("glassworks", "documents"))
    CL.instance_variable_set(:@control, { "glassworks" => "moonmere" }.freeze)
    R.rng = FakeRng.new([chance * 1.2, 0.99])
    R.on_kill(zs, monster("glass_wasp", 22, ps), [ps])
    assert_equal 2, qty(_c, relic("glassworks", "documents"))
    # cities give none
    city = W.zone("moonmere")
    R.rng = FakeRng.new([0.0, 0.0])
    R.on_kill(city, monster("glass_wasp", 22, ps), [ps])
    assert_equal 2, qty(_c, relic("glassworks", "documents"))
  end

  def test_a_dungeons_relics_are_its_parents
    C.check!
    dungeon = Vanai::Data.zones.keys.find { |k| C.claim_zone(k) == "glassworks" && k != "glassworks" }
    skip "no Glassworks dungeon" unless dungeon
    c, ps = in_field("Liss", city: "moonmere", into: dungeon)
    R.rng = FakeRng.new([0.0, 0.99])
    R.on_kill(W.zone(dungeon), monster("glass_wasp", 22, ps), [ps])
    assert_equal 1, qty(c, relic("glassworks", "documents"))
  end

  # ---- named relics ----

  def test_one_named_slot_per_zone_per_cycle
    C.check!
    c, ps = in_field("Aldo", city: "caerdun")
    zs = W.zone("glassworks")
    R.rng = FakeRng.new([0.0])
    r = R.roll_named(zs, "glassworks", [ps], 0.5)
    assert r
    assert_equal [C.cycle_number, "glassworks", 1, "held"], [r.cycle, r.zone, r.slot, r.status]
    assert_equal r.id, InventoryItem.find_by(character_id: c.id, item_key: "named_relic").named_relic_id
    assert_equal "found", messages("court_relic", c).last[:event]
    R.rng = FakeRng.new([0.0])
    assert_nil R.roll_named(zs, "glassworks", [ps], 0.5), "the zone's slot is taken this cycle"
    # another zone has its own
    R.rng = FakeRng.new([0.0])
    assert R.roll_named(W.zone("reservoir"), "reservoir", [ps], 0.5)
    # the next cycle opens the slot again
    advance(C.config.interval + 1)
    C.check!
    R.rng = FakeRng.new([0.0])
    assert R.roll_named(zs, "glassworks", [ps], 0.5)
  end

  def test_the_slot_is_unique_even_under_a_race
    C.check!
    c, ps = in_field("Vail", city: "caerdun")
    named(c, zone: "glassworks")
    # a second writer that saw the slot free: the unique index refuses it
    assert_raises(ActiveRecord::RecordNotUnique) do
      NamedRelic.transaction(requires_new: true) do
        NamedRelic.create!(cycle: C.cycle_number, zone: "glassworks", slot: 1, kind: "goods", name: "x", finder_name: "y", found_at: @time)
      end
    end
    # and roll_named, raced the same way, finds nothing rather than raising
    R.rng = FakeRng.new([0.0])
    stub_count = NamedRelic.method(:where)
    NamedRelic.define_singleton_method(:where) do |*a, **k|
      rel = stub_count.call(*a, **k)
      k[:zone] ? rel.where("1 = 0") : rel # it counts none taken
    end
    begin
      assert_nil R.roll_named(W.zone("glassworks"), "glassworks", [ps], 0.5)
    ensure
      NamedRelic.singleton_class.remove_method(:where)
    end
    assert_equal 1, NamedRelic.where(zone: "glassworks").count
  end

  def test_no_drop_bonus_on_the_named_roll_and_a_random_member_finds_it
    C.check!
    _a, pa = in_field("Ottey", city: "caerdun")
    b, pb = in_field("Grett", city: "heartwood")
    CL.instance_variable_set(:@control, { "glassworks" => "caerdun" }.freeze)
    chance = C.config.relics["named_kill"]
    zs = W.zone("glassworks")
    # common roll misses, named roll lands between the chance and 1.5x: no find
    R.rng = FakeRng.new([0.99, chance * 1.2])
    R.on_kill(zs, monster("glass_wasp", 22, pa), [pa, pb])
    assert_equal 0, NamedRelic.count
    # under the chance: the member the rng picks (the second) finds it
    R.rng = FakeRng.new([0.99, chance / 2], pick: 1)
    R.on_kill(zs, monster("glass_wasp", 22, pa), [pa, pb])
    r = NamedRelic.last
    assert_equal [b.id, "Grett"], [r.finder_id, r.finder_name]
    assert InventoryItem.exists?(character_id: b.id, named_relic_id: r.id)
  end

  def test_a_named_find_is_told_to_the_zone_in_each_courts_voice
    C.check!
    _a, pa = in_field("Sabel", city: "caerdun")
    b, _pb = in_field("Junn", city: "moonmere")
    R.rng = FakeRng.new([0.0])
    R.roll_named(W.zone("glassworks"), "glassworks", [pa], 0.5)
    n = messages("court_notice", b).last
    assert_equal "named_found", n[:kind]
    assert_includes C.config.news["named_found"]["moonmere"].map { |t| t.gsub("{zone}", "the Glassworks") }, n[:text]
    assert_empty(@messages.select { |id, p| id == pa.char_id && p[:t] == "court_notice" }, "the finder is told by court_relic")
  end

  def test_a_named_relic_is_bound
    C.check!
    c, ps = in_field("Morrow", city: "heartwood")
    r = named(c)
    row = InventoryItem.find_by(named_relic_id: r.id)
    assert_raises(R::Bound) { row.destroy! }
    assert_raises(R::Bound) { row.update!(qty: 0) }
    other = provision("Taker", city: "caerdun")
    assert_raises(R::Bound) { row.update!(character_id: other.id) }
    assert InventoryItem.exists?(row.id)
    # a trade offer drops it, and says why
    items = R.tradeable(c.id, [{ inv_id: row.id, qty: 1 }, { inv_id: 0, qty: 1 }])
    assert_equal [{ inv_id: 0, qty: 1 }], items
    assert_equal "That relic is bound to you.", notice(c)
    # the release (registration, crumbling) may
    R.release { row.reload.destroy! }
    refute InventoryItem.exists?(row.id)
    assert ps
  end

  # Joins `c` standing at `npc` in `zone_key`, on its floor.
  def at_npc(c, zone_key, npc)
    W.leave(c.id) if W.find_player(c.id)
    c.update_columns(zone: zone_key, x: npc["x"], z: npc["z"])
    W.join(c.id)
    _z, ps = W.find_player(c.id)
    ps.x, ps.z = npc["x"], npc["z"]
    ps.site_levels = {}
    ps.site_levels[npc["site"]] = zone(zone_key)["sites"][npc["site"]]["floors"][npc["floor"]] if npc["site"]
    ps
  end

  def test_the_auction_and_the_vendor_refuse_a_named_relic
    api = ActionDispatch::Integration::Session.new(Rails.application)
    api.host! "localhost"
    api.post "/api/register", params: { email: "relic-#{SecureRandom.hex(3)}@example.invalid", password: "isolated-test-password" }, as: :json
    assert_equal 200, api.response.status
    api.post "/api/characters", params: { name: "Bindme", race: "aedri", job: "PLD", city: "caerdun" }, as: :json
    id = JSON.parse(api.response.body).dig("character", "id")
    api.post "/api/characters/#{id}/select", as: :json
    c = Character.find(id)
    C.check!
    r = named(c)
    row = InventoryItem.find_by(named_relic_id: r.id)
    broker = zone("caerdun")["npcs"].find { |n| n["kind"] == "auction" }
    at_npc(c, "caerdun", broker)
    api.post "/api/auction/list", params: { inventory_item_id: row.id, qty: 1, price: 500 }, as: :json
    assert_equal "That relic is bound to you.", JSON.parse(api.response.body)["error"]
    assert InventoryItem.exists?(row.id)
    refute AuctionListing.exists?(seller_id: id)
    vendor = zone("caerdun")["npcs"].find { |n| n["kind"] == "vendor" }
    at_npc(c, "caerdun", vendor)
    api.post "/api/game/vendor", params: { npc_id: vendor["id"], op: "sell", inventory_item_id: row.id }, as: :json
    assert_equal "That relic is bound to you.", JSON.parse(api.response.body)["error"]
    assert InventoryItem.exists?(row.id)
    api.get "/api/game/state"
    inv = JSON.parse(api.response.body)["inventory"].find { |i| i["id"] == row.id }
    assert_equal r.name, inv.dig("named_relic", "name")
    assert_equal 24 * 3600 - 60, inv.dig("named_relic", "crumbles_in")
  end

  def test_it_crumbles_from_found_at_even_while_offline
    C.check!
    c, _ps = in_field("Emmer", city: "caerdun")
    r = named(c, ago: 3600)
    W.leave(c.id)
    advance(22 * 3600)
    R.sweep!
    assert_equal "held", r.reload.status
    advance(2 * 3600 + 1)
    R.sweep!
    assert_equal "crumbled", r.reload.status
    refute InventoryItem.exists?(named_relic_id: r.id)
    # the join sweeps first too, and hands over only what is still held
    r2 = named(c, zone: "reservoir", ago: 25 * 3600)
    r3 = named(c, zone: "canalworks", ago: 60)
    W.join(c.id)
    assert_equal "crumbled", r2.reload.status
    held = messages("court_relic", c).select { |m| m[:event] == "held" }.map { |m| m[:relic][:id] }
    assert_equal [r3.id], held
  end

  # Past its 24 hours it cannot be registered, even before the minute's sweep
  # has reached it.
  def test_a_relic_past_its_hours_cannot_be_registered_before_the_sweep
    C.check!
    c, _ps = stand("Hollis", city: "caerdun")
    r = named(c, ago: 24 * 3600 + 30)
    before = treasury("caerdun")
    R.register!(c.id, "named_relic_id" => r.id)
    assert_match(/crumbled/, notice(c))
    assert_equal "crumbled", r.reload.status
    assert_equal before, treasury("caerdun")
    assert_equal 0, RelicRegistration.count
  end

  def test_switching_court_before_registering_registers_at_the_new_court
    C.check!
    c, ps = stand("Corin", city: "caerdun", at: desk("heartwood", "swearing"), into: "heartwood")
    r = named(c, kind: "goods", zone: "kingsgardens")
    Vanai::Courts::Allegiance.swear_at_hall(c.id, "heartwood")
    assert_equal "heartwood", ps.court
    d = desk("heartwood")
    ps.x, ps.z = d["x"], d["z"]
    before = treasury("heartwood")
    g0 = gold(c)
    R.register!(c.id, "named_relic_id" => r.id)
    reward = 10 * C.config.relics["price"]
    assert_equal ["registered", "heartwood", reward], [r.reload.status, r.court, r.reward]
    assert_equal before - reward, treasury("heartwood")
    assert_equal g0 + reward, gold(c)
    refute InventoryItem.exists?(named_relic_id: r.id)
    # 150 claim in the relic's zone, outside the cap
    assert_in_delta C.config.claims["relic_named"], claim("kingsgardens", "heartwood"), 1e-9
    assert_in_delta C.config.claims["relic_named"], ClaimContribution.where(character_id: c.id).sum(:exempt), 1e-9
    assert_equal "registered", messages("court_relic", c).last[:event]
  end

  def test_the_book_keeps_the_name_after_the_character_is_deleted
    C.check!
    c, _ps = stand("Tamsin", city: "moonmere")
    r = named(c, zone: "glassworks", kind: "documents")
    R.register!(c.id, "named_relic_id" => r.id)
    page = R.book(court: "moonmere")
    assert_equal 1, page[:total]
    assert_equal ["Steward Aldo's Tally of the East Furnaces", "Tamsin", "glassworks"], page[:entries][0].values_at(:relic, :finder_name, :zone)
    assert_equal 0, R.book(court: "moonmere", zone: "reservoir")[:total], "filterable by zone"
    assert_equal 0, R.book(court: "caerdun")[:total]
    W.leave(c.id)
    Character.find(c.id).destroy!
    assert_nil r.reload.finder_id
    assert_equal "Tamsin", R.book(court: "moonmere")[:entries][0][:finder_name]
  end

  def test_the_digest_names_each_relic_registered_that_sitting
    C.check!
    c, _ps = stand("Tamsin", city: "caerdun")
    r = named(c, zone: "glassworks", kind: "surveys")
    R.register!(c.id, "named_relic_id" => r.id)
    advance(C.config.interval + 1)
    C.check!
    digest = CourtNews.where(kind: "digest").last
    named = digest.payload.dig("sections", "named")
    assert_equal 1, named.size
    assert_equal ["digest_named", "caerdun"], named[0].values_at("kind", "court")
    assert(digest.payload["lines"].any? { |l| l.include?(r.name) && l.include?("Tamsin") })
  end

  def test_names_come_from_parts_by_zone_and_kind
    assert_includes R.all_names("glassworks", "documents"), "Steward Aldo's Tally of the East Furnaces"
    assert_includes R.all_names("kingsgardens", "goods"), "The Orchard-Wife's Pruning Knife"
    C.config.data.dig("relics", "zones").each_key do |zk|
      R::KINDS.each do |kind|
        names = R.all_names(zk, kind)
        assert names.size >= 20, "#{zk} #{kind}: too few names"
        names.each do |n|
          assert n.length < 80, n
          refute_match(/\{|\}| The /, n)
        end
      end
    end
    R.rng = FakeRng.new([], pick: 0)
    assert_equal "Sergeant Brannoch's Muster Book of Milestone Zero", R.name_for("caerdunfields", "documents")
  end

  def test_set_relic_prices_clamps_and_applies
    C.check!
    row = Court.find_by!(key: "moonmere")
    verb = C::Verbs["set_relic_prices"]
    ok, clamped, reason = verb.clamp("moonmere", { "documents" => 900, "goods" => 1, "surveys" => 30, "budget" => 9999 }, {})
    assert ok
    assert_equal({ "prices" => { "documents" => 300, "goods" => 5, "surveys" => 30 }, "budget" => 5000 }, clamped)
    assert_match(/documents clamped/, reason)
    assert_equal 0, verb.cost(clamped)
    verb.apply!("moonmere", clamped, { cycle: C.cycle_number, court_row: row })
    row.reload
    assert_equal({ "documents" => 300, "goods" => 5, "surveys" => 30 }, row.relic_prices)
    assert_equal 5000, row.relic_budget
    assert_equal "set_relic_prices", CourtLedgerEntry.last.kind
  end

  def test_the_registry_panel_lists_the_bags_relics_with_their_price
    C.check!
    c, ps = stand("Junn", city: "moonmere")
    give(c, relic("glassworks", "documents"), 2)
    give(c, "wolf_fang", 3)
    r = named(c)
    panel = R.registry_panel(ps, "moonmere")
    assert panel[:own]
    assert_equal [[relic("glassworks", "documents"), 2, 40, false]], panel[:relics].map { |x| x.values_at(:item_key, :qty, :price, :reduced) }
    assert_equal [[r.id, 400]], panel[:named].map { |x| x.values_at(:id, :reward) }
    other = R.registry_panel(ps, "caerdun")
    refute other[:own]
    assert_empty other[:relics]
  end
end
