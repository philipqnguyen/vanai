# The council schedule lives in the database, not the world's memory, so a
# restart mid-turn re-runs that cycle's turn instead of skipping or repeating it
# (COURTS.md "Council cycle", tmp/courts/PLAN.md 1.3).
#
# Row N is the cycle open now: it began at started_at and ends at due_at. Its
# turn_* columns describe the council turn that opens it.
class CreateCouncilCycles < ActiveRecord::Migration[8.1]
  def change
    create_table :council_cycles do |t|
      t.integer :number, null: false
      t.datetime :started_at, null: false
      t.datetime :due_at, null: false
      # set once, by the boundary that closes it; the guard that makes the
      # boundary idempotent
      t.datetime :closed_at
      # pending | running | ready | applied | skipped | failed
      t.string :turn_status, null: false, default: "pending"
      t.integer :turn_attempts, null: false, default: 0
      t.datetime :turn_enqueued_at
      t.datetime :turn_started_at
      t.datetime :turn_ready_at
      t.datetime :turn_applied_at
      # whether the courts were dormant when it opened
      t.boolean :dormant, null: false, default: false
      t.timestamps
    end
    add_index :council_cycles, :number, unique: true
    add_index :council_cycles, :turn_status

    # One court's turn in one cycle: what it was shown, what it answered, and
    # what the clamp made of it. Every turn is logged.
    create_table :court_turns do |t|
      t.references :council_cycle, null: false, foreign_key: true, index: false
      t.string :court, null: false
      # ok | invalid | failed
      t.string :status, null: false
      t.string :model
      t.jsonb :prompt
      t.jsonb :response
      t.jsonb :verbs
      t.jsonb :outcome
      t.text :error
      t.jsonb :usage
      t.datetime :applied_at
      t.timestamps
    end
    add_index :court_turns, %i[council_cycle_id court], unique: true
  end
end
