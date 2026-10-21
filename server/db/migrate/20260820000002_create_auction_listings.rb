class CreateAuctionListings < ActiveRecord::Migration[8.1]
  def change
    create_table :auction_listings do |t|
      t.references :seller, null: false, foreign_key: { to_table: :characters }
      t.references :buyer, foreign_key: { to_table: :characters }
      t.string :item_key, null: false
      t.integer :qty, null: false, default: 1
      t.integer :price, null: false
      t.string :status, null: false, default: "active"
      t.datetime :sold_at
      t.timestamps
    end
    add_index :auction_listings, [:status, :item_key]
  end
end
