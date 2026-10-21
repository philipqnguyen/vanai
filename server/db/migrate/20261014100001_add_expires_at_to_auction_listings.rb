# Listings expire five days after they go up (AuctionListing::DURATION); the
# unsold item goes back to its seller as a parcel letter (Vanai::Mail). Every
# row gets a date, the live ones counted from when they were listed, so the
# first sweep after deploy returns anything already older than five days.
class AddExpiresAtToAuctionListings < ActiveRecord::Migration[8.1]
  def up
    add_column :auction_listings, :expires_at, :datetime
    execute "UPDATE auction_listings SET expires_at = created_at + interval '5 days'"
    change_column_null :auction_listings, :expires_at, false
    # the sweep's question: which live listings are past their date
    add_index :auction_listings, [:status, :expires_at]
    add_index :auction_listings, [:seller_id, :status]
  end

  def down
    remove_index :auction_listings, [:seller_id, :status]
    remove_index :auction_listings, [:status, :expires_at]
    remove_column :auction_listings, :expires_at
  end
end
