# A court's proclamations (COURTS.md "Verbs", `proclaim`): the court's own
# voice, written by its council turn, cleaned and length-clamped before it is
# stored. The hall's board lists them beside the board notices and the open
# bounties, paginated by (created_at, id) per court; the herald reads the
# newest one aloud.
class CreateProclamations < ActiveRecord::Migration[8.1]
  def change
    create_table :proclamations do |t|
      t.string :court, null: false
      t.integer :cycle, null: false
      t.string :text, limit: 500, null: false
      t.references :court_turn, foreign_key: { on_delete: :nullify }
      t.datetime :created_at, null: false
    end
    add_index :proclamations, %i[court created_at id], order: { created_at: :desc, id: :desc }
  end
end
