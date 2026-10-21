require_relative "courts_test_helper"

# What a tick's arrivals are told last (World.finish_joins) is read for all of
# them at once: each character hears exactly what Courts.on_join and
# Mail.push_unread told them one at a time, in the same order.
class CourtsJoinBatchTest < Minitest::Test
  include CourtsTestHelper

  P = Struct.new(:char_id)

  def letter(c, status: "unread", n: 0)
    CourtLetter.create!(character_id: c.id, character_name: c.name, court: "heartwood", kind: "purse", amount: 10 + n,
                        text: "A purse, #{n}.", cycle: 1, status: status)
  end

  def bounty(kind, target)
    Bounty.create!(court: "caerdun", kind: kind, zone: "caerdunfields", target: target, count: 3, places: 2,
                   reward_each: 50, held: 100, cycle: 1, expires_cycle: 3, text: "Wanted.")
  end

  def relic(c, ago:)
    slot = NamedRelic.where(cycle: 1, zone: "glassworks").count + 1
    r = NamedRelic.create!(cycle: 1, zone: "glassworks", slot: slot, kind: "documents", name: "A Tally #{slot}",
                           finder_id: c.id, finder_name: c.name, found_at: @time - ago)
    InventoryItem.create!(character_id: c.id, item_key: "named_relic", qty: 1, named_relic_id: r.id)
  end

  # the messages each character got, by character, from a run rolled back after
  def heard
    @messages.clear
    ActiveRecord::Base.transaction(requires_new: true) do
      yield
      raise ActiveRecord::Rollback
    end
    @messages.group_by(&:first).transform_values { |ms| ms.map(&:last) }
  end

  def test_a_ticks_arrivals_hear_what_each_heard_alone
    a, b, c, d = %w[Batchone Batchtwo Batchthree Batchfour].map { |n| provision(n) }
    12.times { |n| letter(a, n: n) } # more than the 10 a join shows
    letter(a, status: "read", n: 99)
    kill = bounty("kill", "young_boar")
    fetch = bounty("collect", "lamproot")
    BountyProgress.create!(bounty: kill, character_id: b.id, progress: 2)
    BountyProgress.create!(bounty: fetch, character_id: b.id)
    BountyProgress.create!(bounty: kill, character_id: c.id, status: "paid")
    InventoryItem.create!(character_id: b.id, item_key: "lamproot", qty: 1)
    relic(c, ago: 60)
    relic(c, ago: 10 * 24 * 3600) # crumbles on the sweep
    MailLetter.create!(recipient_id: d.id, sender_name: "A friend", subject: "Hello", body: "x")
    list = [a, b, c, d].map { |ch| P.new(ch.id) }

    alone = heard do
      list.each do |ps|
        Vanai::Mail.push_unread(ps.char_id)
        C.on_join(ps)
      end
    end
    together = heard do
      Vanai::Mail.push_unread_many(list.map(&:char_id))
      C.on_joins(list)
    end

    assert_equal alone, together
    assert_equal 10, alone[a.id].count { |m| m[:t] == "court_letter" }
    assert_equal 2, alone[b.id].count { |m| m[:t] == "court_bounty" }
    assert_equal %w[crumbled held].sort, alone[c.id].select { |m| m[:t] == "court_relic" }.map { |m| m[:event] }.sort
  end

  # A part that fails on one character's row is built again for each arrival
  # alone: the others hear it, and every arrival hears the parts after it.
  def test_one_bad_row_costs_only_its_own_character
    a, b = %w[Batchgood Batchbad].map { |n| provision(n) }
    kill = bounty("kill", "young_boar")
    [a, b].each { |ch| BountyProgress.create!(bounty: kill, character_id: ch.id); letter(ch) }
    bounties = C::Bounties
    original = bounties.method(:bounty_json)
    bounties.define_singleton_method(:bounty_json) do |bty, pr|
      raise ActiveRecord::StatementInvalid, "bad row" if pr.character_id == b.id
      original.call(bty, pr)
    end
    got = heard { C.on_joins([a, b].map { |ch| P.new(ch.id) }) }
    assert_equal 1, got[a.id].count { |m| m[:t] == "court_bounty" }
    assert_equal 0, got[b.id].count { |m| m[:t] == "court_bounty" }
    [a, b].each { |ch| assert_equal 1, got[ch.id].count { |m| m[:t] == "court_letter" }, "#{ch.name}'s letter" }
  ensure
    bounties.define_singleton_method(:bounty_json, original) if original
  end

  # The grouped reads are a fixed handful whatever the number of arrivals.
  def test_the_reads_do_not_grow_with_the_arrivals
    count = lambda do |n|
      list = Array.new(n) { |i| P.new(provision("Batchq#{(97 + i).chr}#{(96 + n).chr}").id) }
      sql = 0
      sub = ActiveSupport::Notifications.subscribe("sql.active_record") { |*, p| sql += 1 unless p[:name] == "SCHEMA" || p[:sql] =~ /\A\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/ }
      Vanai::Mail.push_unread_many(list.map(&:char_id))
      C.on_joins(list)
      ActiveSupport::Notifications.unsubscribe(sub)
      sql
    end
    count.(1) # what the courts keep once read (the tax table, control)
    assert_equal count.(2), count.(8)
  end
end
