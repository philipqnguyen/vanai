# The courts' bounties (COURTS.md "Bounties"): a paid task posted by a council
# turn, kill N of a monster in a zone or collect N of an item delivered to the
# hall. Its places are paid from gold held out of the treasury when it was
# posted (`held`); the first explorers to finish take them, one place each, by
# a conditional increment of `places_paid`, so two finishers can never share
# the last place. What is left unpaid at expiry goes back to the treasury.
#
# One shared world row per bounty, on purpose: bounties are global court
# state, not per-character (COURTS.md "Global state, on purpose"). A
# character's own progress is a bounty_progresses row.
class CreateBounties < ActiveRecord::Migration[8.1]
  def change
    create_table :bounties do |t|
      t.string :court, null: false
      t.integer :cycle, null: false                # the sitting it was posted in
      t.integer :expires_cycle, null: false        # expires at the boundary that closes this sitting
      t.string :kind, null: false                  # kill | collect
      t.string :zone, null: false                  # a contested zone (kills in its dungeons count too)
      t.string :target, null: false                # monster key or item key
      t.integer :count, null: false
      t.integer :places, null: false
      t.integer :reward_each, null: false
      t.integer :places_paid, null: false, default: 0
      t.bigint :held, null: false                  # places * reward_each, taken from the treasury at posting
      t.string :status, null: false, default: "open" # open | filled | expired
      t.string :text, limit: 300                   # the court's line, cleaned
      t.references :court_turn, foreign_key: { on_delete: :nullify }
      t.timestamps
    end
    add_index :bounties, %i[court status]
    add_index :bounties, %i[status expires_cycle]
    add_check_constraint :bounties, "places_paid >= 0 AND places_paid <= places", name: "bounties_places_paid_range"
    add_check_constraint :bounties, "kind IN ('kill', 'collect')", name: "bounties_kind"
    add_check_constraint :bounties, "status IN ('open', 'filled', 'expired')", name: "bounties_status"

    # active | paid | unpaid (finished after the places ran out, or the bounty
    # filled or expired first)
    create_table :bounty_progresses do |t|
      t.references :bounty, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :character, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.integer :progress, null: false, default: 0
      t.string :status, null: false, default: "active"
      t.integer :paid, null: false, default: 0
      t.timestamps
    end
    add_index :bounty_progresses, %i[bounty_id character_id], unique: true
    add_index :bounty_progresses, %i[character_id status]
    add_check_constraint :bounty_progresses, "status IN ('active', 'paid', 'unpaid')", name: "bounty_progresses_status"
  end
end
