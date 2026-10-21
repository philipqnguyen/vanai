# Letters (COURTS.md "Letters"): a court's purse or defection offer to one
# explorer, written as a row so an offline player gets it at their next login.
#
# The court writes the prose; the amount and the terms are the verb's, kept
# here as numbers and shown on their own line, so a letter cannot misstate its
# offer. A defection offer's gold is held out of the treasury while it is open
# and goes to the explorer on acceptance or back to the treasury when it is
# declined or lapses at the end of its cycle. A purse is paid when it is
# delivered.
class CreateCourtLetters < ActiveRecord::Migration[8.1]
  def change
    create_table :court_letters do |t|
      t.string :court, null: false
      # Nullified rather than cascaded: a defection offer to an explorer who is
      # deleted while it is open still holds gold, and the boundary that lapses
      # it must find the row to give the gold back. The name is copied for the
      # loyalty record.
      t.references :character, foreign_key: { on_delete: :nullify }, index: false
      t.string :character_name, null: false
      t.string :kind, null: false                    # defection | purse
      t.string :text, limit: 700, null: false        # the court's prose, cleaned
      t.integer :amount, null: false
      t.integer :cycle, null: false                  # the sitting it was written in
      t.integer :expires_cycle                       # defection: lapses when this sitting closes
      t.string :status, null: false, default: "unread" # unread|read|accepted|declined|lapsed
      t.boolean :held, null: false, default: false   # defection gold still held from the treasury
      t.datetime :answered_at                        # accepted, declined or lapsed
      t.integer :answered_cycle
      t.references :court_turn, foreign_key: true, index: false
      t.timestamps
    end
    add_index :court_letters, %i[character_id status]
    add_index :court_letters, %i[court cycle]
    add_index :court_letters, %i[status expires_cycle]
    add_check_constraint :court_letters, "kind IN ('defection', 'purse')", name: "court_letters_kind"
    add_check_constraint :court_letters, "status IN ('unread', 'read', 'accepted', 'declined', 'lapsed')", name: "court_letters_status"
    add_check_constraint :court_letters, "amount > 0", name: "court_letters_amount_positive"

    # S1 left allegiance_changes.court_letter_id without its key until this
    # table existed.
    add_foreign_key :allegiance_changes, :court_letters, on_delete: :nullify
  end
end
