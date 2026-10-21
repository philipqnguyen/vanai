# Every movement of court gold, and every court event the councils should see
# (a tax change, a swearing, a control change), is a ledger row. The ledger is
# also what the councils read (COURTS.md "Treasuries and solvency").
#
# character_id survives a deleted character as NULL beside a copied name, so the
# record keeps who it was.
class CreateCourtLedgerEntries < ActiveRecord::Migration[8.1]
  def change
    create_table :court_ledger_entries do |t|
      t.string :court, null: false
      t.integer :cycle, null: false
      t.string :kind, null: false
      # signed, from the treasury's side: income positive, spending negative,
      # 0 for an event
      t.bigint :amount, null: false, default: 0
      # the treasury right after this row; NULL for events
      t.bigint :balance_after
      t.references :character, foreign_key: { on_delete: :nullify }, index: true
      t.string :character_name
      t.string :zone
      t.jsonb :meta, null: false, default: {}
      t.datetime :created_at, null: false
    end
    add_index :court_ledger_entries, %i[court cycle]
    add_index :court_ledger_entries, %i[cycle kind]

    # Who swore to which court, when and how: creation, the swearing migration,
    # a hall's swearing desk, or an accepted letter. The loyalty record is read
    # from these rows.
    create_table :allegiance_changes do |t|
      t.references :character, foreign_key: { on_delete: :nullify }, index: false
      t.string :character_name, null: false
      t.string :from_court
      t.string :to_court, null: false
      t.integer :cycle, null: false
      # creation | migration | hall | letter
      t.string :via, null: false
      # the letter that paid for it (its foreign key arrives with the letters)
      t.bigint :court_letter_id
      t.integer :amount, default: 0
      t.datetime :created_at, null: false
    end
    add_index :allegiance_changes, %i[character_id created_at]
  end
end
