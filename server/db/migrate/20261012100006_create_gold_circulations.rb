# A daily snapshot of gold in circulation (COURTS.md "Treasuries and
# solvency"). The courts' tax goes to treasuries and comes back out as payouts,
# the stipend is created from nothing, and the member discounts remove sinks, so
# the economy is tuned from this log rather than guessed at.
class CreateGoldCirculations < ActiveRecord::Migration[8.1]
  def change
    create_table :gold_circulations do |t|
      t.date :day, null: false
      t.integer :cycle
      t.bigint :characters_gold
      t.bigint :treasuries_gold
      # gold held out of a treasury for open bounties and defection offers
      t.bigint :held_gold
      # the prices of active auction listings (read, never written, here)
      t.bigint :listed_gold
      # gold created from nothing since the previous row (the stipend)
      t.bigint :minted
      # fares and vendor buys are not logged per sale today: NULL until they are
      t.bigint :burned
      t.datetime :created_at, null: false
    end
    add_index :gold_circulations, :day, unique: true
  end
end
