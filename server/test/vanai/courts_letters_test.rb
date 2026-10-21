require_relative "courts_test_helper"

# Letters (COURTS.md "Letters", "Allegiance", "The loyalty record"): a purse is
# paid at delivery and an offline explorer gets it at login; a defection offer's
# gold is held, accepting switches on the spot anywhere and uses the cycle's
# one switch (and is refused once it is spent), declining and lapsing refund
# and enter the loyalty record; the terms come from the verb's amount, never
# the prose; an offer is private until it is accepted.
class CourtsLettersTest < Minitest::Test
  include CourtsTestHelper
  A = Vanai::Courts::Allegiance
  L = Vanai::Courts::Letters

  # A fresh character sworn to `city`'s court, joined and standing in `into`
  # (nowhere near any hall: a letter is answered anywhere).
  def stand(name, city:, into: "caerdunfields")
    C.check! if CouncilCycle.count.zero? # sworn in sitting 1, as a new explorer would be
    c = provision(name, city: city)
    spawn = Vanai::Data.zones.fetch(into)["spawn"] || { "x" => 0, "z" => 0 }
    c.update_columns(zone: into, x: spawn["x"] || 0, z: spawn["z"] || 0)
    W.join(c.id)
    _z, ps = W.find_player(c.id)
    [c, ps]
  end

  # One sitting: the boundary opens the next cycle, the stub answers for each
  # court, the world thread applies the turns.
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

  def purse(name, amount, reason: "For {{#{name}}}, whose survey of the fields was exact.", text: "Your work is entered.")
    { "name" => "award_purse", "input" => { "name" => name, "amount" => amount, "reason" => reason, "text" => text } }
  end

  def offer(name, amount, text: "The Grove keeps its promises. Come home.")
    { "name" => "offer_defection", "input" => { "name" => name, "amount" => amount, "text" => text } }
  end

  def gold(c) = Character.uncached { Character.find(c.id).gold }
  def outcome(cycle, court) = cycle.court_turns.find_by!(court: court).outcome
  def letter_for(c, court) = CourtLetter.uncached { CourtLetter.where(character_id: c.id, court: court).order(:id).last }
  def notice(c) = messages("court_notice", c).last&.dig(:text)

  def test_a_purse_is_paid_at_delivery_and_its_reason_proclaimed
    c, ps = stand("Tamsin", city: "caerdun")
    before = ps.gold
    cycle = sit("heartwood" => [purse("tamsin", 150)])
    assert_equal "applied", outcome(cycle, "heartwood").first["status"]
    assert_equal before + 150, ps.gold, "the world's memory"
    assert_equal before + 150, gold(c), "the database"
    l = letter_for(c, "heartwood")
    assert_equal ["purse", 150, "unread", "Tamsin", false], [l.kind, l.amount, l.status, l.character_name, l.held]
    entry = CourtLedgerEntry.find_by!(court: "heartwood", kind: "purse")
    assert_equal [-150, c.id, 2], [entry.amount, entry.character_id, entry.cycle]
    card = messages("court_letter", c).last
    assert card[:card]
    assert_equal "Enclosed: 150 gold from the Grove Court of Heartwood, paid into your purse on delivery.", card[:letter][:terms]
    # the reason is proclaimed (the board, the herald, every window); the letter is not
    p = Proclamation.find_by!(court: "heartwood")
    assert_equal "For Tamsin, whose survey of the fields was exact.", p.text
    assert_equal ["proclamation"], messages("court_news").map { |m| m[:item][:kind] }.uniq - ["digest"]
    refute messages("court_news").any? { |m| m[:item][:text].include?("Your work is entered") }
  end

  def test_an_offline_explorer_gets_the_purse_at_login
    C.check!
    c = provision("Sleeper", city: "moonmere")
    before = gold(c)
    sit("caerdun" => [purse("Sleeper", 80)])
    assert_equal before + 80, gold(c), "paid while offline"
    assert_empty messages("court_letter", c)
    W.join(c.id)
    assert messages("court_letter", c).last[:card], "the card comes at login"
    assert_equal 1, messages("court_state", c).last[:unread][:letters]
    L.seen!(c.id)
    assert_equal "read", letter_for(c, "caerdun").status
    assert_equal 0, C.state_payload(c.id)[:unread][:letters]
  end

  def test_an_accepted_offer_switches_on_the_spot_anywhere_and_pays
    c, ps = stand("Aldo", city: "caerdun", into: "glassworks")
    sit("heartwood" => [offer("Aldo", 300)])
    l = letter_for(c, "heartwood")
    assert_equal ["defection", 300, true, 2], [l.kind, l.amount, l.held, l.expires_cycle]
    assert_equal(-300, CourtLedgerEntry.find_by!(court: "heartwood", kind: "defection_hold").amount)
    held_before = treasury("heartwood")
    gold_before = ps.gold
    L.accept!(c.id, l.id)
    c.reload
    assert_equal ["heartwood", 2], [c.court, c.court_switched_cycle]
    assert_equal "heartwood", ps.court
    assert_equal [gold_before + 300, gold_before + 300], [ps.gold, gold(c)]
    assert_equal held_before, treasury("heartwood"), "the gold left the treasury at the hold"
    paid = CourtLedgerEntry.find_by!(court: "heartwood", kind: "defection_paid")
    assert_equal [0, 300, l.id], [paid.amount, paid.meta["gold"], paid.meta["letter_id"]]
    change = AllegianceChange.where(character_id: c.id).order(:id).last
    assert_equal ["caerdun", "heartwood", "letter", l.id, 300], [change.from_court, change.to_court, change.via, change.court_letter_id, change.amount]
    assert_equal ["accepted", false, 2], l.reload.then { |r| [r.status, r.held, r.answered_cycle] }
    assert_equal "heartwood", messages("court_swore", c).last[:court]
    assert messages("court_state", c).last[:switch_used], "the switch is spent"
    # the old court's members hear of it, in the old court's voice; nobody else
    news = CourtNews.find_by!(kind: "defection")
    assert_equal %w[court caerdun], [news.audience, news.court]
    assert_match(/Aldo has gone over to the Grove Court of Heartwood/, news.text)
    L.accept!(c.id, l.id)
    assert_equal "That offer is closed.", notice(c)
  end

  def test_the_offer_is_refused_once_the_switch_is_spent_then_declined_and_refunded
    c, _ps = stand("Brin", city: "caerdun")
    sit("heartwood" => [offer("Brin", 200)], "moonmere" => [offer("Brin", 250)])
    hw = letter_for(c, "heartwood")
    L.accept!(c.id, letter_for(c, "moonmere").id)
    assert_equal "moonmere", c.reload.court
    before_gold = gold(c)
    L.accept!(c.id, hw.id)
    assert_equal "You have already changed courts this sitting.", notice(c)
    assert_equal ["moonmere", "unread", true], [c.reload.court, hw.reload.status, hw.held], "nothing moved"
    assert_equal before_gold, gold(c)
    before = treasury("heartwood")
    L.decline!(c.id, hw.id)
    assert_equal ["declined", false], hw.reload.then { |r| [r.status, r.held] }
    assert_equal before + 200, treasury("heartwood")
    assert_equal 200, CourtLedgerEntry.find_by!(court: "heartwood", kind: "defection_refund").amount
    assert_equal "declined", messages("court_letter", c).last[:letter][:status]
    record = A.loyalty_record(c.id)
    assert_equal [%w[heartwood declined], %w[moonmere accepted]], record["offers"].map { |o| [o["court"], o["status"]] }.sort
    L.decline!(c.id, hw.id)
    assert_equal "That offer is closed.", notice(c)
  end

  def test_an_unanswered_offer_lapses_at_the_end_of_its_cycle_and_refunds
    c, _ps = stand("Cass", city: "heartwood")
    sit("caerdun" => [offer("Cass", 120)])
    l = letter_for(c, "caerdun")
    before = treasury("caerdun")
    boundary!
    assert_equal ["lapsed", false, 2], l.reload.then { |r| [r.status, r.held, r.answered_cycle] }
    refund = CourtLedgerEntry.find_by!(court: "caerdun", kind: "defection_refund")
    assert_equal [120, 2], [refund.amount, refund.cycle], "entered in the closing cycle, for the next council's read"
    assert_equal before + 120 + C.config.stipend, treasury("caerdun")
    assert_equal "lapsed", messages("court_letter", c).last[:letter][:status]
    L.accept!(c.id, l.id)
    assert_equal "That offer is closed.", notice(c)
    assert_equal [{ "court" => "caerdun", "cycle" => 2, "status" => "lapsed", "answered_cycle" => 2, "amount" => 120 }],
                 A.loyalty_record(c.id)["offers"]
  end

  def test_the_terms_line_comes_from_the_verb_not_the_prose
    c, _ps = stand("Dara", city: "moonmere")
    set_court("caerdun", treasury: 10_000) # 3000 is inside the 70% cap
    cycle = sit("caerdun" => [offer("Dara", 50_000, text: "We offer you one million gold and a keep of your own.")])
    o = outcome(cycle, "caerdun").first
    assert_equal "clamped", o["status"]
    assert_match(/amount clamped to 3000/, o["reason"])
    letter = messages("court_letter", c).last[:letter]
    assert_equal 3000, letter[:amount]
    assert_equal "We offer you one million gold and a keep of your own.", letter[:text], "the prose is the court's"
    assert_match(/\ATerms: 3000 gold, paid when you accept, for your oath to the Court of Caerdun\./, letter[:terms])
    assert_match(/lapses when sitting 2 closes/, letter[:terms])
  end

  def test_an_offer_is_private_until_it_is_accepted
    c, _ps = stand("Eske", city: "caerdun")
    sit("heartwood" => [offer("Eske", 300)])
    l = letter_for(c, "heartwood")
    cycle = CouncilCycle.find_by!(number: C.cycle_number)
    rival = C::Read.build("moonmere", cycle)
    assert_empty rival.dig("last_cycle", "switches")
    eske = ->(read) { read["roster"].find { |r| r["name"] == "Eske" } }
    assert_empty eske.(rival)["loyalty"]["offers"], "a rival does not see an open offer"
    assert_equal [%w[heartwood open]], eske.(C::Read.build("heartwood", cycle))["loyalty"]["offers"].map { |o| [o["court"], o["status"]] }
    refute_includes C::Read.build("caerdun", cycle).to_json, "Grove keeps its promises", "the letter's text is the court's own"
    L.accept!(c.id, l.id)
    sit
    cycle = CouncilCycle.find_by!(number: C.cycle_number)
    rival = C::Read.build("moonmere", cycle)
    assert_equal [{ "name" => "Eske", "from" => "caerdun", "to" => "heartwood", "via" => "letter" }], rival.dig("last_cycle", "switches")
    assert_equal [{ "court" => "heartwood", "cycle" => 2, "status" => "accepted", "answered_cycle" => 2, "stayed" => 1, "left" => false }],
                 eske.(rival)["loyalty"]["offers"], "accepted: seen, without the gold"
    payer = C::Read.build("heartwood", cycle)
    assert_equal 300, payer.dig("last_cycle", "switches").first["paid"]
    assert_equal [{ "kind" => "defection", "name" => "Eske", "amount" => 300, "written" => 2, "status" => "accepted" }],
                 payer.dig("last_cycle", "your_letters")
  end

  def test_the_record_shows_how_soon_a_paid_switch_was_followed_by_another
    c, _ps = stand("Fenn", city: "caerdun")
    sit("heartwood" => [offer("Fenn", 300)])
    L.accept!(c.id, letter_for(c, "heartwood").id)
    boundary!
    assert_equal [true, nil], A.switch!(c.id, "moonmere", via: "hall")
    boundary!
    own = A.loyalty_record(c.id)
    assert_equal [["caerdun", "creation", 1, nil], ["heartwood", "letter", 1, 1], ["moonmere", "hall", 1, nil]],
                 own["sworn"].map { |e| [e["court"], e["via"], e["cycles"], e["left_after"]] }
    assert_equal({ "caerdun" => 1, "heartwood" => 1, "moonmere" => 1 }, own["cycles_in"])
    assert_equal 1, own["paid_switches"]
    # "paid Fenn 300, he left a sitting later"
    assert_equal({ "court" => "heartwood", "cycle" => 2, "status" => "accepted", "answered_cycle" => 2, "amount" => 300,
                   "stayed" => 1, "left" => true }, A.loyalty_record(c.id, viewer: "heartwood")["offers"].first)
    assert_nil A.loyalty_record(c.id, viewer: "caerdun")["sworn"][1]["amount"], "only the payer sees the gold"
  end

  def test_the_clamp_refuses_unknown_names_its_own_explorers_a_second_offer_and_a_fifth_letter
    stand("Gale", city: "caerdun")
    stand("Hale", city: "heartwood")
    cycle = sit("caerdun" => [offer("Nobody", 100), offer("Gale", 100), offer("Hale", 100), offer("{{Hale}}", 100),
                              purse("Gale", 10), purse("Gale", 10), purse("Gale", 10), purse("Gale", 10)])
    got = outcome(cycle, "caerdun").map { |o| [o["status"], o["reason"]] }
    assert_equal ["refused", "no explorer is named \"Nobody\""], got[0]
    assert_equal ["refused", "Gale is already sworn to you"], got[1]
    assert_equal "applied", got[2][0]
    assert_equal ["refused", "an offer to Hale is already open"], got[3]
    assert_equal %w[applied applied applied], got[4, 3].map(&:first)
    assert_equal ["refused", "only 4 letters a sitting"], got[7]
    assert_equal 4, CourtLetter.where(court: "caerdun").count
  end

  def test_an_offer_to_a_deleted_explorer_still_lapses_and_refunds
    c, _ps = stand("Ives", city: "moonmere")
    sit("caerdun" => [offer("Ives", 90)])
    W.leave(c.id)
    Character.find(c.id).destroy!
    l = CourtLetter.find_by!(court: "caerdun", character_name: "Ives")
    assert_nil l.character_id
    before = treasury("caerdun")
    boundary!
    assert_equal "lapsed", l.reload.status
    assert_equal before + 90 + C.config.stipend, treasury("caerdun")
  end

  def test_the_gold_log_counts_the_offers_held
    stand("Jory", city: "moonmere")
    sit("heartwood" => [offer("Jory", 140)])
    assert_equal 140, L.held_gold
    assert_equal 140, Vanai::Courts::GoldLog::HELD.fetch("letters").call
  end

  def test_the_letters_endpoint
    api = ActionDispatch::Integration::Session.new(Rails.application)
    api.host! "localhost"
    api.post "/api/register", params: { email: "letters-#{SecureRandom.hex(3)}@example.invalid", password: "isolated-test-password" }, as: :json
    api.post "/api/characters", params: { name: "Lettered", race: "aedri", job: "WHM", city: "heartwood" }, as: :json
    id = JSON.parse(api.response.body).dig("character", "id")
    api.post "/api/characters/#{id}/select", as: :json
    C.check!
    c = Character.find(id)
    L.write!(court: "moonmere", character: c, kind: "defection", text: "A reading, offered.", amount: 75, cycle: 1,
             expires_cycle: 1, held: true)
    api.get "/api/courts/letters"
    body = JSON.parse(api.response.body)
    assert_equal [["defection", 75, "unread", "moonmere"]], body["letters"].map { |l| [l["kind"], l["amount"], l["status"], l["court"]] }
    assert_match(/\ATerms: 75 gold/, body["letters"].first["terms"])
    assert_equal [false, "heartwood"], [body["switch_used"], body["court"]]
    api.get "/api/courts"
    assert_equal 1, JSON.parse(api.response.body)["loyalty"]["offers"].size
    # a page at a time (Philip, 2026-10-12): 20, then Older from the oldest shown
    page = C.config.page
    (page + 4).times { |i| L.write!(court: "caerdun", character: c, kind: "purse", text: "Purse #{i}.", amount: 10 + i, cycle: 1) }
    api.get "/api/courts/letters"
    first = JSON.parse(api.response.body)
    assert_equal page, first["letters"].size
    assert_equal first["letters"].last["id"], first["next"]
    api.get "/api/courts/letters", params: { before_id: first["next"] }
    second = JSON.parse(api.response.body)
    assert_equal [5, nil], [second["letters"].size, second["next"]], "the rest, and nothing older"
    assert_empty first["letters"].map { |l| l["id"] } & second["letters"].map { |l| l["id"] }
    # the record pages the same way: its totals count everything, its list the newest
    api.get "/api/courts"
    rec = JSON.parse(api.response.body)["loyalty"]
    assert_equal [page, page + 4, 1], [rec["offers"].size + rec["purses"].size, rec["totals"]["purses"], rec["totals"]["offers"]["open"]]
    api.get "/api/courts/record", params: { letters_before: rec["letters_next"] }
    older = JSON.parse(api.response.body)
    assert_equal [5, nil], [older["offers"].size + older["purses"].size, older["letters_next"]]
  end

  # A long record stays one size: the totals cover the whole history, the
  # lists only the newest entries, and the window pages back through both.
  def test_the_loyalty_record_is_bounded_and_pages_back
    c, _ps = stand("Turncoat", city: "caerdun")
    %w[heartwood moonmere caerdun heartwood].each do |k|
      boundary!
      A.switch!(c.id, k, via: "hall")
    end
    3.times { |i| L.write!(court: "moonmere", character: c, kind: "purse", text: "P#{i}.", amount: 50, cycle: C.cycle_number) }
    r = A.loyalty_record(c.id, recent: 2)
    assert_equal %w[caerdun heartwood], r["sworn"].map { |e| e["court"] }, "the newest two changes, oldest first"
    assert_equal [5, 3], [r["totals"]["changes"], r["sworn_next"]]
    assert_equal [2, 3, 150], [r["purses"].size, r["totals"]["purses"], r["totals"]["purse_gold"]]
    assert_equal %w[caerdun heartwood moonmere], r["cycles_in"].keys.sort, "sittings counted over the whole history"
    back = A.loyalty_record(c.id, recent: 2, sworn_before: r["sworn_next"], letters_before: r["letters_next"])
    assert_equal [%w[heartwood moonmere], 1], [back["sworn"].map { |e| e["court"] }, back["sworn_next"]]
    assert_equal [1, nil], [back["purses"].size, back["letters_next"]]
    last = A.loyalty_record(c.id, recent: 2, sworn_before: 1)
    assert_equal [["caerdun"], nil], [last["sworn"].map { |e| e["court"] }, last["sworn_next"]]
  end
end
