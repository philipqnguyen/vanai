require_relative "courts_test_helper"

# A treasury is a database row changed only by atomic increments, each with its
# ledger row in the same transaction, and it never goes below zero (COURTS.md
# "Treasuries and solvency").
class CourtsTreasuryTest < Minitest::Test
  include CourtsTestHelper
  Tr = Vanai::Courts::Treasury

  def test_credit_and_debit_write_one_ledger_row_each
    set_court("caerdun", treasury: 1000)
    assert_equal 1250, Tr.credit!("caerdun", 250, kind: "stipend", cycle: 4)
    assert_equal 400, Tr.debit!("caerdun", 400, kind: "purse", cycle: 4, meta: { "why" => "test" })
    assert_equal 850, treasury("caerdun")
    rows = CourtLedgerEntry.where(court: "caerdun").order(:id).pluck(:kind, :amount, :balance_after, :cycle)
    assert_equal [["stipend", 250, 1250, 4], ["purse", -400, 850, 4]], rows
  end

  def test_never_below_zero
    set_court("heartwood", treasury: 100)
    assert_nil Tr.debit!("heartwood", 101, kind: "purse")
    assert_equal 100, treasury("heartwood")
    assert_equal 0, CourtLedgerEntry.where(court: "heartwood").count
    assert_equal 100, Tr.debit!("heartwood", 500, kind: "bounty_hold", allow_partial: true)
    assert_equal 0, treasury("heartwood")
    assert_equal 0, Tr.debit!("heartwood", 5, kind: "bounty_hold", allow_partial: true)
    assert_equal [-100], CourtLedgerEntry.where(court: "heartwood").pluck(:amount)
    assert_raises(ArgumentError) { Tr.debit!("heartwood", 0, kind: "purse") }
    assert_raises(ArgumentError) { Tr.credit!("heartwood", -5, kind: "stipend") }
    # the check constraint is the backstop behind the conditional update
    assert_raises(ActiveRecord::StatementInvalid) do
      Court.transaction(requires_new: true) { Court.where(key: "heartwood").update_all("treasury = treasury - 1") }
    end
  end

  def test_holds_releases_and_events
    set_court("moonmere", treasury: 500)
    Tr.hold!("moonmere", 300, kind: "bounty_hold")
    Tr.release!("moonmere", 120, kind: "bounty_refund")
    Tr.event!("moonmere", kind: "set_tax", meta: { "from_bp" => 300, "to_bp" => 500 })
    assert_equal 320, treasury("moonmere")
    assert_equal [["bounty_hold", -300, 200], ["bounty_refund", 120, 320], ["set_tax", 0, nil]],
                 CourtLedgerEntry.where(court: "moonmere").order(:id).pluck(:kind, :amount, :balance_after)
  end

  def test_ledger_keeps_the_name_of_a_character
    c = provision("Ledgerkeep")
    Tr.credit!("caerdun", 10, kind: "tax", character: c, zone: "caerdun")
    row = CourtLedgerEntry.where(kind: "tax").last
    assert_equal [c.id, "Ledgerkeep", "caerdun"], [row.character_id, row.character_name, row.zone]
  end

  def test_a_failed_caller_rolls_the_credit_back
    set_court("caerdun", treasury: 0)
    Court.transaction(requires_new: true) do
      Tr.credit!("caerdun", 50, kind: "tax")
      raise ActiveRecord::Rollback
    end
    assert_equal 0, treasury("caerdun")
    assert_equal 0, CourtLedgerEntry.where(court: "caerdun").count
  end
end

# Two threads, each on its own connection, racing to debit the same treasury:
# only what it holds can be taken. This needs committed rows, so it runs
# outside the per-test transaction and puts everything back afterwards.
class CourtsTreasuryRaceTest < Minitest::Test
  include CourtsTestHelper
  Tr = Vanai::Courts::Treasury

  def transactional? = false

  def test_concurrent_debits_cannot_overdraw
    before = Court.find_by!(key: "moonmere").treasury
    first_id = CourtLedgerEntry.maximum(:id).to_i
    Court.where(key: "moonmere").update_all(treasury: 100)
    gate = Queue.new
    threads = 4.times.map do # the pool holds five: four racers and this thread
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          gate.pop
          Tr.debit!("moonmere", 30, kind: "race", cycle: 0)
        end
      end
    end
    4.times { gate << true }
    taken = threads.map(&:value)
    assert_equal 3, taken.compact.size
    assert_equal 10, Court.uncached { Court.find_by!(key: "moonmere").treasury }
    rows = CourtLedgerEntry.uncached { CourtLedgerEntry.where("id > ?", first_id).where(kind: "race").order(:balance_after).pluck(:balance_after) }
    assert_equal [10, 40, 70], rows
  ensure
    CourtLedgerEntry.where("id > ?", first_id).where(kind: "race").delete_all if first_id
    Court.where(key: "moonmere").update_all(treasury: before) if before
  end
end
