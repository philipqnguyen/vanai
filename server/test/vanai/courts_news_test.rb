require_relative "courts_test_helper"

# The scripted news (COURTS.md "The court window and its news"): templates in
# each court's voice with names checked, the digest once per cycle to everyone
# with its card, the latest unseen digest at login, the unread count, and the
# proclaim verb that feeds the board and the window.
class CourtsNewsTest < Minitest::Test
  include CourtsTestHelper
  N = Vanai::Courts::News

  def test_templates_render_in_each_courts_voice
    tamsin = provision("Tamsin")
    vars = { "relic" => "Steward Aldo's Tally of the East Furnaces", "zone" => "the Glassworks", "name" => tamsin.name }
    first = ->(court) { C.config.news["digest_named"][court].first }
    assert_equal "Entered into the record: Steward Aldo's Tally of the East Furnaces, surveyed from the Glassworks, delivered by Tamsin. The terms are met.",
                 N.fill(first.("caerdun"), vars)
    assert_match(/\AReturned: Steward Aldo's Tally of the East Furnaces, taken from the Glassworks\. One more thing they took, back where it belongs\./,
                 N.fill(first.("heartwood"), vars))
    assert_equal "Received for reading: Steward Aldo's Tally of the East Furnaces from the Glassworks, by Tamsin's hand. Its contents will be noted in due course.",
                 N.fill(first.("moonmere"), vars)
    # every court has its own templates for every per-court event
    %w[digest_control digest_named bounty_filled named_found budget_spent defection].each do |kind|
      texts = Vanai::Courts::KEYS.map { |k| C.config.news[kind][k] }
      assert texts.all? { |t| t.is_a?(Array) && t.any? }, kind
      assert_equal 3, texts.uniq.size, "#{kind}: three voices"
    end
  end

  def test_names_are_validated
    provision("Aldo")
    text = N.render("bounty_filled", "heartwood", { "target" => "boars", "zone" => "the Hunting Wood",
                                                   "names" => %w[aldo Ghostname Aldo] }, rng: Random.new(1))
    assert_includes text, "Aldo, an explorer and Aldo"
    # mid-sentence a name's own article drops to lower case (S4); a value
    # that opens a sentence opens it with a capital (S5)
    assert_equal "An explorer has gone over to the Court of Caerdun. The contract is void; the record is kept.",
                 N.fill(C.config.news["defection"]["caerdun"].first, { "name" => "<b>x</b>", "court" => C.config.name("caerdun") })
  end

  def test_the_digest_goes_to_everyone_once_per_cycle_with_its_card
    a = provision("Reader")
    b = provision("Other", city: "moonmere")
    W.join(a.id)
    W.join(b.id)
    C.check!
    advance(C.config.interval)
    C.check!
    digests = CourtNews.where(kind: "digest").to_a
    assert_equal [1], digests.map(&:cycle)
    d = digests.first
    assert_equal ["all", nil], [d.audience, d.court]
    assert_equal({ "control" => [], "named" => [] }, d.payload["sections"], "the sections are present, empty until S4 and S5")
    assert_equal "The courts have sat. Sitting 1 is closed.", d.payload["header"]
    assert_equal C.config.news["digest_quiet"], d.payload["lines"]
    [a, b].each do |c|
      live = messages("court_news", c).select { |m| m[:item][:kind] == "digest" }
      assert_equal [["digest", d.id]], live.map { |m| [m[:card], m[:item][:id]] }, c.name
    end
    # a second call for the same cycle (a boundary retried) writes nothing
    N.digest!(CouncilCycle.find_by!(number: 1), CouncilCycle.find_by!(number: 2))
    assert_equal 1, CourtNews.where(kind: "digest").count
    advance(C.config.interval)
    C.check!
    assert_equal [1, 2], CourtNews.where(kind: "digest").order(:id).pluck(:cycle)
  end

  def test_the_digest_runs_after_every_other_boundary_block
    order = []
    Vanai::Courts::Cycle.on_boundary("zz_test_late_probe") { |_c, _o| order << :block }
    N.on_digest("zz_probe") { |_c, _o| order << :digest; [{ "kind" => "digest_control", "court" => "moonmere", "vars" => { "zone" => "the Shores" } }] }
    C.check!
    advance(C.config.interval)
    C.check!
    assert_equal %i[block digest], order
    lines = CourtNews.find_by!(kind: "digest").payload["lines"]
    assert_equal 1, lines.size
    assert_includes lines.first, "the Shores"
  ensure
    Vanai::Courts::Cycle::BOUNDARY.delete("zz_test_late_probe")
    N::DIGEST_SECTIONS.delete("zz_probe")
  end

  def test_a_failed_boundary_sends_nothing
    a = provision("Watcher")
    W.join(a.id)
    C.check!
    Vanai::Courts::Cycle.on_boundary("zz_boom") { |_c, _o| raise "boom" }
    advance(C.config.interval)
    assert_raises(RuntimeError) { Vanai::Courts::Cycle.boundary!(CouncilCycle.find_by!(number: 1)) }
    assert_empty messages("court_news", a).select { |m| m[:item][:kind] == "digest" }
  ensure
    Vanai::Courts::Cycle::BOUNDARY.delete("zz_boom")
  end

  def test_offline_login_gets_the_latest_unseen_digest
    a = provision("Sleeper")
    C.check!
    2.times do
      advance(C.config.interval)
      C.check!
    end
    W.join(a.id)
    state = messages("court_state", a).last
    assert_equal 2, state[:digest][:cycle], "the latest, not the older one"
    assert_equal 2, state[:unread][:news]
    N.seen!(a.id, digest_cycle: 2)
    assert_nil C.state_payload(a.id)[:digest]
    assert_equal 2, C.state_payload(a.id)[:unread][:news], "the card shown is not the window opened"
    N.seen!(a.id, news_id: CourtNews.maximum(:id))
    assert_equal 0, C.state_payload(a.id)[:unread][:news]
    # the markers only rise, and never past what exists
    N.seen!(a.id, news_id: 1, digest_cycle: 1)
    N.seen!(a.id, news_id: 10**9, digest_cycle: 10**6)
    a.reload
    assert_equal [CourtNews.maximum(:id), C.cycle_number], [a.court_news_seen_id, a.court_digest_seen_cycle]
  end

  def test_a_new_character_is_not_handed_the_history_as_unread
    C.publish!(kind: "resumed", text: "Old news.")
    advance(60)
    c = provision("Newcomer")
    c.update_columns(created_at: @time) # the courts' clock is faked here; the row's own is real
    assert_equal 0, N.unread_count(c)
    advance(60)
    C.publish!(kind: "resumed", text: "New news.")
    assert_equal 1, N.unread_count(c.reload)
  end

  def test_audiences
    a = provision("Caerling")
    b = provision("Moonling", city: "moonmere")
    [a, b].each { |c| W.join(c.id) }
    N.publish!(kind: "defection", audience: "court", court: "moonmere", vars: { "name" => "Caerling", "court" => "the Court of Caerdun" })
    N.publish!(kind: "budget_spent", audience: "board", court: "caerdun")
    assert_empty messages("court_news", a)
    assert_equal ["defection"], messages("court_news", b).map { |m| m[:item][:kind] }
    assert_equal ["defection"], N.page("moonmere")[:items].map { |i| i[:kind] }
    assert_empty N.page("caerdun")[:items], "board notices live on the board"
    # a zone notice is live only, to the players in that zone
    N.publish!(kind: "named_found", audience: "zone", zone: "moonmere", court: "moonmere", vars: { "zone" => "the Shores" })
    assert_equal 2, CourtNews.count
    assert_equal ["named_found"], messages("court_notice", b).map { |m| m[:kind] }
    assert_empty messages("court_notice", a)
  end

  # The boundary's broadcast reads the counts for everyone online at once;
  # they must be the per-character rule's, court by court and marker by marker.
  def test_the_batched_state_matches_each_characters_own
    C.check!
    a = provision("Batchone")
    b = provision("Batchtwo", city: "moonmere")
    [a, b].each { |c| c.update_columns(created_at: @time - 60) }
    N.publish!(kind: "defection", audience: "court", court: "moonmere", vars: { "name" => "Batchone", "court" => "the Court of Caerdun" })
    C.publish!(kind: "resumed", text: "For all.")
    advance(C.config.interval + 1)
    C.check!
    N.seen!(b.id, news_id: CourtNews.where(kind: "defection").pick(:id))
    batch = C.state_payloads([a.id, b.id, -1])
    [a, b].each do |c|
      c.reload
      assert_equal N.unread_count(c), batch[c.id][:unread][:news], c.name
      assert_equal N.unseen_digest(c), batch[c.id][:digest], c.name
      assert_equal C.cycle_number, batch[c.id][:cycle]
    end
    assert_operator batch[a.id][:unread][:news], :>=, 2, "not trivially empty"
    refute_nil batch[a.id][:digest]
    assert_nil batch[-1][:court], "an unknown id still gets the world's part"
    assert_equal batch[a.id][:tax], batch[-1][:tax]
  end

  def test_the_adjourn_line_is_verbatim
    C.dormant_override = true
    C.check!
    assert_equal "The courts have adjourned. Market rates return to the standing three parts in a hundred.",
                 CourtNews.find_by!(kind: "adjourned").text
  end

  def test_proclaim
    provision("Tamsin")
    reader = provision("Hearer", city: "heartwood")
    W.join(reader.id)
    stub_council do |court, _prompt|
      next [] unless court == "caerdun"
      [{ "name" => "proclaim", "input" => { "text" => "Entered: **{{Tamsin}}** surveyed the Glassworks. {{Impostor}} did not." } },
       { "name" => "proclaim", "input" => { "text" => "x" * 900 } },
       { "name" => "proclaim", "input" => { "text" => "A third is one too many." } },
       { "name" => "proclaim", "input" => { "text" => "<i></i>" } }]
    end
    cycle = open_second_cycle
    Vanai::Courts::Council.run_cycle!(cycle.number)
    @messages.clear
    C.check!
    rows = Proclamation.order(:id).to_a
    assert_equal 2, rows.size
    assert_equal "Entered: Tamsin surveyed the Glassworks. an explorer did not.", rows.first.text
    assert_equal 400, rows.last.text.length
    assert_equal ["caerdun", 2], [rows.first.court, rows.first.cycle]
    outcome = CourtTurn.find_by!(court: "caerdun").outcome
    assert_equal %w[clamped clamped refused refused], outcome.map { |o| o["status"] }
    assert_match(/1 unknown name/, outcome[0]["reason"])
    assert_match(/only 2 proclamations/, outcome[2]["reason"])
    assert_equal 2, CourtLedgerEntry.where(court: "caerdun", kind: "proclaim").count
    # every window hears it, after the turn commits
    live = messages("court_news", reader).map { |m| m[:item] }.select { |i| i[:kind] == "proclamation" }
    assert_equal [rows.first.text, rows.last.text], live.map { |i| i[:text] }
    # the board lists them; the News tab too
    assert_equal rows.map(&:id).reverse, Vanai::Courts::Board.page("caerdun")[:items].map { |i| i[:id] }
  end

  def test_dormant_courts_proclaim_nothing
    C.dormant_override = true
    C.check!
    advance(C.config.interval)
    C.check!
    assert_empty @enqueued
    assert_equal 0, Proclamation.count
    assert_equal 1, CourtNews.where(kind: "digest").count, "the scripted digest keeps running while dormant"
  end
end
