require_relative "courts_test_helper"

# The courts' bounties (COURTS.md "Bounties"): the whole reward held from the
# treasury when a council posts one; only the posting court's sworn members
# take it, at its board, under the active cap; kills count for every party
# member holding it, in the zone or its dungeons; the first N finishers are
# paid and each place is taken once; a collect bounty consumes its items at
# delivery; expiry refunds what is unpaid; dormant courts post nothing while
# open bounties still run to their expiry.
class CourtsBountiesTest < Minitest::Test
  include CourtsTestHelper
  B = Vanai::Courts::Bounties

  def zone(key) = Vanai::Data.zones.fetch(key)
  def board(court) = zone(court)["interactables"].find { |i| i["id"] == "court_board_#{court}" }

  # Joins a fresh character sworn to `city`'s court, standing at `at` in `into`
  # (on the hall's floor when it has one).
  def stand(name, city:, at: nil, into: city)
    at ||= board(city)
    c = provision(name, city: city)
    c.update_columns(zone: into, x: at["x"], z: at["z"])
    W.join(c.id)
    _z, ps = W.find_player(c.id)
    ps.x, ps.z = at["x"], at["z"]
    ps.site_levels = {}
    ps.site_levels[at["site"]] = zone(into)["sites"][at["site"]]["floors"][at["floor"]] if at["site"]
    [c, ps]
  end

  # Out of the hall and into the field (a real rejoin, as a zone change is).
  def move(c, zone_key)
    W.leave(c.id)
    spawn = zone(zone_key)["spawn"] || { "x" => 0, "z" => 0 }
    c.reload.update_columns(zone: zone_key, x: spawn["x"] || 0, z: spawn["z"] || 0)
    W.join(c.id)
    W.find_player(c.id)
  end

  # A council turn's offer_bounty, clamped and applied as the apply step does.
  def post(court, input)
    C.check!
    row = Court.find_by!(key: court)
    ctx = { cycle: C.cycle_number, court_row: row, start_tax_bp: row.tax_bp }
    verb = C::Verbs["offer_bounty"]
    ok, clamped, reason = verb.clamp(court, input, ctx)
    raise "refused: #{reason}" unless ok
    result = verb.apply!(court, clamped, ctx)
    Bounty.find(result.fetch("bounty_id"))
  end

  def offer(kind:, zone:, target:, count: 3, places: 2, reward_each: 100, cycles: 1, text: "Wanted.")
    { "kind" => kind, "zone" => zone, "target" => target, "count" => count, "places" => places,
      "reward_each" => reward_each, "cycles" => cycles, "text" => text }
  end

  def kill(zone_key, monster_key, killer)
    zs = W.zone(zone_key)
    camp = zone(zone_key)["camps"].find { |cp| cp["monster"] == monster_key } || { "monster" => monster_key, "respawn" => 30 }
    m = Vanai::MonsterState.new("mtest#{SecureRandom.hex(3)}", monster_key, 5, killer.x, killer.z, camp)
    zs.monsters[m.mid] = m
    Vanai::Combat.monster_death(zs, m, killer)
  end

  def accept(c, bounty) = B.accept!(c.id, bounty.id)
  def notice(c) = messages("court_notice", c).last&.dig(:text)

  def test_posting_through_a_council_turn_holds_the_whole_reward
    stub_council do |court, _p|
      next [] unless court == "caerdun"
      [{ "name" => "offer_bounty", "input" => offer(kind: "kill", zone: "caerdunfields", target: "young_boar",
                                                     places: 3, reward_each: 120, cycles: 2, text: "<b>Boar</b> on the {{Nobody}} road.") }]
    end
    cycle = open_second_cycle
    before = treasury("caerdun")
    C::Council.run_cycle!(cycle.number)
    C.check!
    b = Bounty.sole
    assert_equal ["caerdun", 2, 3, "kill", "caerdunfields", "young_boar", 3, 3, 120, 360, "open"],
                 [b.court, b.cycle, b.expires_cycle, b.kind, b.zone, b.target, b.count, b.places, b.reward_each, b.held, b.status]
    assert_equal "Boar on the an explorer road.", b.text, "the court's line is cleaned like a proclamation"
    assert_equal before - 360, treasury("caerdun")
    hold = CourtLedgerEntry.find_by!(kind: "bounty_hold")
    assert_equal [-360, "caerdunfields", b.id], [hold.amount, hold.zone, hold.meta["bounty_id"]]
    assert_equal "applied", cycle.court_turns.find_by!(court: "caerdun").outcome.first["status"]
    # on the posting court's board, and only there
    item = C::Board.page("caerdun")[:items].find { |i| i[:type] == "bounty" }
    assert_equal [b.id, "young_boar", "Boar on the an explorer road."], [item[:id], item[:target], item[:text]]
    assert_empty C::Board.page("heartwood")[:items].select { |i| i[:type] == "bounty" }
    # the gold log counts the held places as held
    assert_equal 360, B.held_gold
  end

  def test_the_clamp_checks_targets_ranges_and_the_cap
    C.check!
    verb = C::Verbs["offer_bounty"]
    row = Court.find_by!(key: "heartwood")
    ctx = { cycle: 1, court_row: row, start_tax_bp: 300 }
    clamp = ->(input) { verb.clamp("heartwood", input, ctx) }
    # out of range numbers are clamped, with the reason recorded
    ok, c, why = clamp.(offer(kind: "kill", zone: "heartwoodfields", target: B.targets("heartwoodfields")["kill"].keys.first,
                              count: 400, places: 0, reward_each: 5_000, cycles: 9))
    assert ok
    assert_equal [40, 1, 1000, 3], c.values_at("count", "places", "reward_each", "cycles")
    assert_match(/count clamped to 40/, why)
    assert_equal 1000, verb.cost(c)
    # collect counts have their own range
    reed = B.targets("moonmereshores")["collect"]
    assert reed.key?("mere_reed"), "a gathering node's item is a collect target"
    _ok, c, = clamp.(offer(kind: "collect", zone: "moonmereshores", target: "mere_reed", count: 99))
    assert_equal 20, c["count"]
    # a target that does not live in the zone, a zone nobody contests, a city
    refute clamp.(offer(kind: "kill", zone: "moonmereshores", target: "young_boar")).first
    refute clamp.(offer(kind: "kill", zone: "capital", target: "young_boar")).first
    refute clamp.(offer(kind: "kill", zone: "caerdun", target: "young_boar")).first
    refute clamp.(offer(kind: "collect", zone: "caerdunfields", target: "young_boar")).first, "a monster is not an item"
    # a dungeon's monsters are its parent zone's targets; the Keep's are nobody's
    dungeon_monster = zone("mausoleum")["camps"].map { |cp| cp["monster"] }.first
    assert B.targets("huntingwood")["kill"].key?(dungeon_monster)
    assert clamp.(offer(kind: "kill", zone: "huntingwood", target: dungeon_monster)).first
    keep_only = zone("keep")["camps"].map { |cp| cp["monster"] } - Vanai::Data.zones.values.reject { |z| z.equal?(zone("keep")) }
                                                                            .flat_map { |z| Array(z["camps"]).map { |cp| cp["monster"] } }
    keep_only.each { |m| refute B.catalogue.values.any? { |e| e["kill"].key?(m) }, m }
    # stackable items only: gear that drops there is not a collect target
    gear = B.catalogue.values.flat_map { |e| e["collect"].keys }.map { |k| Vanai::Data.items[k]["slot"] }.uniq
    assert_empty gear - %w[material consumable]
    # at most per_sitting a sitting
    ctx[:bounties] = C.config.bounty["per_sitting"]
    refute clamp.(offer(kind: "collect", zone: "moonmereshores", target: "mere_reed")).first
  end

  # A boss or a named monster cannot be a kill target: one spawn on a long
  # respawn cannot fill a bounty's smallest count in any sensible time.
  def test_bosses_and_named_monsters_are_no_targets
    kill = B.targets("granaryplains")["kill"]
    refute_includes kill, "the_granary_master", "a boss in the zone's dungeon"
    refute_includes kill, "the_reaper", "a boss in the zone"
    refute_empty kill
    refute_includes B.targets("caerdunfields")["kill"], "old_bristle", "a named monster"
    assert_includes B.targets("caerdunfields")["kill"], "young_boar"
    C.check!
    row = Court.find_by!(key: "moonmere")
    ok, _c, reason = C::Verbs["offer_bounty"].clamp("moonmere", offer(kind: "kill", zone: "granaryplains", target: "the_granary_master"),
                                                   { cycle: C.cycle_number, court_row: row, start_tax_bp: row.tax_bp })
    refute ok
    assert_match(/the_granary_master/, reason)
  end

  def test_the_commit_cap_and_the_treasury_refuse_a_bounty_too_dear
    set_court("moonmere", treasury: 1_000)
    stub_council do |court, _p|
      next [] unless court == "moonmere"
      # 10 x 1000 = 10,000: far past 70% of what the court holds
      [{ "name" => "offer_bounty", "input" => offer(kind: "collect", zone: "moonmereshores", target: "mere_reed", places: 10, reward_each: 1000) },
       { "name" => "offer_bounty", "input" => offer(kind: "collect", zone: "moonmereshores", target: "mere_reed", places: 2, reward_each: 100) }]
    end
    cycle = open_second_cycle
    C::Council.run_cycle!(cycle.number)
    C.check!
    outcome = cycle.court_turns.find_by!(court: "moonmere").outcome
    assert_equal %w[refused applied], outcome.map { |o| o["status"] }
    assert_match(/commit cap/, outcome.first["reason"])
    assert_equal [200], Bounty.pluck(:held)
  end

  def test_only_sworn_members_take_a_bounty_at_its_board
    b = post("caerdun", offer(kind: "kill", zone: "caerdunfields", target: "young_boar"))
    # a Heartwood explorer at Caerdun's own board
    stranger, = stand("Stranger", city: "heartwood", into: "caerdun", at: board("caerdun"))
    refute accept(stranger, b)
    assert_match(/Only explorers sworn to the Court of Caerdun/, notice(stranger))
    # sworn, but nowhere near the board
    far, far_ps = stand("Faraway", city: "caerdun")
    far_ps.x += 15
    refute accept(far, b)
    assert_equal "Too far away.", notice(far)
    # at the board: taken, once
    c, = stand("Sworn", city: "caerdun")
    assert accept(c, b)
    assert_equal ["active", 0], BountyProgress.find_by!(character_id: c.id).then { |p| [p.status, p.progress] }
    msg = messages("court_bounty", c).last
    assert_equal [b.id, "accepted", "active", 0], [msg[:bounty][:id], msg[:event], msg[:bounty][:status], msg[:bounty][:progress]]
    # the board marks it taken for this explorer (and only for them)
    assert_equal({ b.id => "active" }, B.taken(c.id, C::Board.page("caerdun")))
    assert_equal({}, B.taken(far.id, C::Board.page("caerdun")))
    refute accept(c, b)
    assert_equal "You have already taken this bounty.", notice(c)
    # every refusal is a toast, never a chat line
    assert_empty messages("system", c)
  end

  def test_the_active_cap
    cap = C.config.bounty["active_per_character"]
    bounties = (cap + 1).times.map { post("moonmere", offer(kind: "collect", zone: "moonmereshores", target: "mere_reed", places: 1, reward_each: 10)) }
    # posting the sixth in one sitting would pass per_sitting through a council; post() is the verb alone
    c, = stand("Busy", city: "moonmere")
    bounties.first(cap).each { |b| assert accept(c, b) }
    refute accept(c, bounties.last)
    assert_match(/already hold #{cap} bounties/, notice(c))
  end

  def test_a_kill_bounty_pays_the_first_finishers_and_fills
    b = post("caerdun", offer(kind: "kill", zone: "caerdunfields", target: "young_boar", count: 3, places: 2, reward_each: 100))
    hunters = %w[Ada Bram Cole].map do |n|
      c, = stand(n, city: "caerdun")
      assert accept(c, b)
      c
    end
    a, bram, cole = hunters.map { |c| [c, move(c, "caerdunfields").last] }
    # Cole gets one kill in, then the other two finish
    kill("caerdunfields", "young_boar", cole.last)
    gold_before = a.first.reload.gold
    3.times { kill("caerdunfields", "young_boar", a.last) }
    loot = messages("loot", a.first).sum { |m| m[:gold].to_i }
    assert_equal gold_before + 100 + loot, a.first.reload.gold, "paid into the character row"
    assert_equal a.first.gold, a.last.gold, "and the world's copy"
    assert_equal ["paid", 100], BountyProgress.find_by!(character_id: a.first.id).then { |p| [p.status, p.paid] }
    assert_match(/pays you 100 gold/, notice(a.first))
    # a payout moves nothing in the treasury: the gold was held at posting
    payout = CourtLedgerEntry.find_by!(kind: "bounty_payout")
    assert_equal [0, a.first.id, 100], [payout.amount, payout.character_id, payout.meta["gold"]]
    3.times { kill("caerdunfields", "young_boar", bram.last) }
    b.reload
    assert_equal ["filled", 2], [b.status, b.places_paid]
    # Cole was still on it: closed to him, unpaid, and told
    assert_equal "unpaid", BountyProgress.find_by!(character_id: cole.first.id).status
    assert_equal "filled", messages("court_bounty", cole.first).last[:event]
    # the court's members and its board hear who was paid
    news = CourtNews.where(kind: "bounty_filled").order(:audience).to_a
    assert_equal [%w[board caerdun], %w[court caerdun]], news.map { |n| [n.audience, n.court] }
    assert_match(/Ada and Bram/, news.first.text)
    assert_equal %w[Ada Bram], news.first.payload["names"]
    # more kills change nothing
    kill("caerdunfields", "young_boar", cole.last)
    assert_equal 1, BountyProgress.find_by!(character_id: cole.first.id).progress
    assert_equal 0, B.held_gold
  end

  # A bounty is for the posting court's sworn members: one taken before a
  # switch is given up at the switch, unpaid, so the old court's gold never
  # pays for claim the new court earns.
  def test_a_switch_gives_up_the_old_courts_bounties
    b = post("caerdun", offer(kind: "kill", zone: "caerdunfields", target: "young_boar", count: 3, places: 2, reward_each: 100))
    c, = stand("Tarn", city: "caerdun")
    assert accept(c, b)
    _z, ps = move(c, "caerdunfields")
    kill("caerdunfields", "young_boar", ps)
    ok, = Vanai::Courts::Allegiance.switch!(c.id, "heartwood", via: "hall")
    assert ok
    assert_equal "unpaid", BountyProgress.find_by!(character_id: c.id).status
    assert_equal "forfeit", messages("court_bounty", c).last[:event]
    assert_match(/no longer sworn to the Court of Caerdun/, notice(c))
    gold = c.reload.gold
    loot = messages("loot", c).sum { |m| m[:gold].to_i }
    3.times { kill("caerdunfields", "young_boar", ps) }
    assert_equal 0, b.reload.places_paid
    assert_equal 0, CourtLedgerEntry.where(kind: "bounty_payout").count
    assert_equal messages("loot", c).sum { |m| m[:gold].to_i } - loot, c.reload.gold - gold, "only loot, no bounty gold"
  end

  def test_each_place_is_taken_once
    b = post("heartwood", offer(kind: "kill", zone: "heartwoodfields", target: B.targets("heartwoodfields")["kill"].keys.first,
                                 count: 3, places: 1, reward_each: 50))
    rows = %w[First Second].map do |n|
      c, ps = stand(n, city: "heartwood")
      assert accept(c, b)
      [ps, BountyProgress.find_by!(character_id: c.id)]
    end
    rows.each { |_ps, p| p.update!(progress: 3) }
    results = rows.map { |ps, p| B.pay!(ps, b, p, nil) }
    assert_equal [true, false], results
    assert_equal [1, "filled"], b.reload.then { |r| [r.places_paid, r.status] }
    assert_equal %w[paid unpaid], rows.map { |_, p| p.reload.status }
    assert_equal 1, CourtLedgerEntry.where(kind: "bounty_payout").count
    # and the table itself refuses a place past the last
    assert_raises(ActiveRecord::StatementInvalid) { Bounty.where(id: b.id).update_all("places_paid = places + 1") }
  end

  def test_a_party_kill_counts_for_every_member_holding_the_bounty
    target = B.targets("huntingwood")["kill"].keys.find { |m| zone("mausoleum")["camps"].any? { |cp| cp["monster"] == m } }
    b = post("moonmere", offer(kind: "kill", zone: "huntingwood", target: target, count: 5, places: 3))
    holders = %w[Ivo Jun].map do |n|
      c, = stand(n, city: "moonmere")
      assert accept(c, b)
      c
    end
    outsider, = stand("Kell", city: "caerdun")
    members = (holders + [outsider]).map { |c| [c, move(c, "mausoleum").last] }
    party = Vanai::Party.new("ptest", members.first.first.id)
    party.member_ids = members.map { |c, _| c.id }
    W.parties[party.pid] = party
    members.each { |_, ps| ps.party_id = party.pid }
    # one kill in the dungeon credits the parent zone's bounty for each holder
    kill("mausoleum", target, members.last.last)
    assert_equal [1, 1], holders.map { |c| BountyProgress.find_by!(character_id: c.id).progress }
    assert_empty messages("court_bounty", outsider)
    # the same monster in another zone does not count
    other = Vanai::Data.zones.keys.find { |k| k != "mausoleum" && k != "huntingwood" && Array(zone(k)["camps"]).any? { |cp| cp["monster"] == target } }
    if other
      W.zone(other)
      solo = members.first.last
      solo.party_id = nil
      zs = W.zone(other)
      m = Vanai::MonsterState.new("mx", target, 5, 0, 0, nil)
      zs.monsters[m.mid] = m
      Vanai::Combat.monster_death(zs, m, solo)
      assert_equal 1, BountyProgress.find_by!(character_id: holders.first.id).progress
    end
  end

  def test_a_collect_bounty_consumes_its_items_at_the_board
    b = post("moonmere", offer(kind: "collect", zone: "moonmereshores", target: "mere_reed", count: 3, places: 1, reward_each: 80))
    c, ps = stand("Reedcutter", city: "moonmere")
    assert accept(c, b)
    W.grant_item(ps, "mere_reed", 2)
    refute B.deliver!(c.id, b.id)
    assert_match(/You need 3/, notice(c))
    assert_equal 2, InventoryItem.where(character_id: c.id, item_key: "mere_reed").sum(:qty)
    W.grant_item(ps, "mere_reed", 3)
    # the journal reads the bags for a collect bounty
    assert_equal 3, B.active_for(c.id).first[:progress]
    gold = c.reload.gold
    assert B.deliver!(c.id, b.id)
    assert_equal 2, InventoryItem.where(character_id: c.id, item_key: "mere_reed").sum(:qty), "exactly the count is taken"
    assert_equal gold + 80, c.reload.gold
    assert_equal "filled", b.reload.status
    # a second delivery has nothing to deliver to
    refute B.deliver!(c.id, b.id)
    # and away from the board nothing is taken
    b2 = post("moonmere", offer(kind: "collect", zone: "moonmereshores", target: "mere_reed", count: 1, places: 1, reward_each: 10))
    assert accept(c, b2)
    ps.x += 20
    refute B.deliver!(c.id, b2.id)
    assert_equal "Too far away.", notice(c)
    assert_equal 2, InventoryItem.where(character_id: c.id, item_key: "mere_reed").sum(:qty)
  end

  # The bags are counted at the board, then taken under a lock: a sale of the
  # stack in between (a request thread) leaves the delivery unpaid and the
  # bags as they are, never a paid place for items no longer there.
  def test_a_delivery_short_at_the_lock_pays_nothing
    b = post("moonmere", offer(kind: "collect", zone: "moonmereshores", target: "mere_reed", count: 3, places: 1, reward_each: 80))
    c, ps = stand("Reedseller", city: "moonmere")
    assert accept(c, b)
    W.grant_item(ps, "mere_reed", 2)
    gold = c.reload.gold
    # the board's count says 3 (the stack as it stood a moment ago)
    sc = B.singleton_class
    sc.send(:alias_method, :__held_count, :held_count)
    sc.send(:define_method, :held_count) { |*| 3 }
    begin
      refute B.deliver!(c.id, b.id)
    ensure
      sc.send(:alias_method, :held_count, :__held_count)
      sc.send(:remove_method, :__held_count)
      sc.send(:private, :held_count)
    end
    assert_match(/You need 3/, notice(c))
    assert_equal 2, InventoryItem.where(character_id: c.id, item_key: "mere_reed").sum(:qty)
    assert_equal [0, "open", gold], [b.reload.places_paid, b.status, c.reload.gold]
    assert_equal "active", BountyProgress.find_by!(character_id: c.id).status
  end

  def test_expiry_refunds_what_is_unpaid
    b = post("caerdun", offer(kind: "kill", zone: "caerdunfields", target: "young_boar", count: 3, places: 3, reward_each: 100, cycles: 2))
    assert_equal 2, b.expires_cycle
    c, = stand("Late", city: "caerdun")
    paid, = stand("Early", city: "caerdun")
    [c, paid].each { |x| assert accept(x, b) }
    _z, pps = W.find_player(paid.id)
    B.pay!(pps, b, BountyProgress.find_by!(character_id: paid.id).tap { |p| p.update!(progress: 3) }, nil)
    # the first boundary closes sitting 1: not yet
    advance(C.config.interval + 1)
    C.check!
    assert_equal "open", b.reload.status
    held_before = treasury("caerdun")
    advance(C.config.interval + 1)
    C.check!
    assert_equal "expired", b.reload.status
    refund = CourtLedgerEntry.find_by!(kind: "bounty_refund")
    assert_equal [200, 2, 2], [refund.amount, refund.cycle, refund.meta["places_unpaid"]]
    assert_equal held_before + 200 + C.config.stipend, treasury("caerdun")
    assert_equal "unpaid", BountyProgress.find_by!(character_id: c.id).status
    assert_equal "expired", messages("court_bounty", c).last[:event]
    assert_empty C::Board.page("caerdun")[:items].select { |i| i[:type] == "bounty" }
    assert_equal 0, B.held_gold
  end

  def test_dormant_courts_post_nothing_but_open_bounties_run_to_expiry
    b = post("heartwood", offer(kind: "collect", zone: "heartwoodfields", target: B.targets("heartwoodfields")["collect"].keys.first,
                                 count: 1, places: 2, reward_each: 40, cycles: 2))
    c, ps = stand("Patient", city: "heartwood")
    assert accept(c, b)
    C.dormant_override = true
    stub_council { |_court, _p| raise "a dormant court was asked" }
    advance(C.config.interval + 1)
    C.check!
    assert_equal "skipped", CouncilCycle.find_by!(number: 2).turn_status
    assert_empty @enqueued
    assert_equal 1, Bounty.count, "nothing new is posted"
    # still deliverable while dormant
    W.grant_item(ps, b.target, 1)
    assert B.deliver!(c.id, b.id)
    assert_equal 1, b.reload.places_paid
    advance(C.config.interval + 1)
    C.check!
    assert_equal "expired", b.reload.status
    assert_equal 40, CourtLedgerEntry.find_by!(kind: "bounty_refund").amount
  end

  def test_join_hands_over_the_bounties_in_hand
    b = post("caerdun", offer(kind: "kill", zone: "caerdunfields", target: "young_boar"))
    c, = stand("Returning", city: "caerdun")
    assert accept(c, b)
    W.leave(c.id)
    @messages.clear
    W.join(c.id)
    held = messages("court_bounty", c)
    assert_equal [[b.id, "held", "active"]], held.map { |m| [m[:bounty][:id], m[:event], m[:bounty][:status]] }
    assert_equal [b.id], B.active_for(c.id).map { |x| x[:id] }
  end
end
