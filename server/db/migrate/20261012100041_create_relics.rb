# Relics (COURTS.md "Relics"): the named relics, world-unique rows found on a
# roll while a zone's slots for the cycle remain, and every registration at a
# court's registry desk, common or named.
#
# Shared world state, on purpose: a named relic is one row the whole world
# competes for, its slot unique per (cycle, zone, slot) so two finds can never
# take the same one. The finder's name is copied as text, so the book of names
# keeps it after the character is deleted. A held named relic sits in the
# finder's bags as an inventory row linked to its world row, not as a plain
# item stack.
class CreateRelics < ActiveRecord::Migration[8.1]
  def change
    create_table :named_relics do |t|
      t.integer :cycle, null: false
      t.string :zone, null: false
      t.integer :slot, null: false
      t.string :kind, null: false
      t.string :name, null: false
      t.references :finder, foreign_key: { to_table: :characters, on_delete: :nullify }, index: true
      t.string :finder_name, null: false
      t.datetime :found_at, null: false
      t.string :status, null: false, default: "held"
      t.datetime :registered_at
      t.integer :registered_cycle
      t.string :court             # the court it was registered with
      t.string :registrant_name
      t.integer :reward
      t.timestamps
    end
    add_index :named_relics, %i[cycle zone slot], unique: true
    add_index :named_relics, %i[status found_at]
    add_index :named_relics, %i[court registered_at]
    add_index :named_relics, %i[zone registered_at]
    add_check_constraint :named_relics, "status IN ('held', 'registered', 'crumbled')", name: "named_relics_status"
    add_check_constraint :named_relics, "kind IN ('documents', 'goods', 'surveys')", name: "named_relics_kind"

    # One row per registration: the per-character cap on common relics and the
    # court's relic budget are both counted from here, per cycle.
    create_table :relic_registrations do |t|
      t.references :character, foreign_key: { on_delete: :nullify }, index: false
      t.string :character_name, null: false
      t.string :court, null: false
      t.integer :cycle, null: false
      t.string :zone, null: false
      t.string :kind, null: false
      t.string :item_key            # null for a named relic
      t.references :named_relic, foreign_key: { on_delete: :nullify }, index: false
      t.integer :qty, null: false, default: 1
      t.integer :paid, null: false, default: 0
      t.integer :reduced_qty, null: false, default: 0 # how many went at the reduced rate
      t.float :points, null: false, default: 0
      t.datetime :created_at, null: false
    end
    add_index :relic_registrations, %i[character_id cycle]
    add_index :relic_registrations, %i[court cycle]

    add_reference :inventory_items, :named_relic, foreign_key: { on_delete: :cascade }, index: { unique: true, where: "named_relic_id IS NOT NULL" }
  end
end
