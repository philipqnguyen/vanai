class AuctionListing < ApplicationRecord
  belongs_to :seller, class_name: "Character"
  belongs_to :buyer, class_name: "Character", optional: true

  ACTIVE = "active"
  SOLD = "sold"
  CANCELLED = "cancelled"
  # past expires_at unsold: the item went back to its seller by mail
  EXPIRED = "expired"

  # How long a listing stays up (Philip, 2026-10-14).
  DURATION = 5.days
  # Live listings a seller may hold at once.
  LIMIT = 7

  validates :price, numericality: { greater_than: 0, less_than: 1_000_000 }
  validates :qty, numericality: { greater_than: 0 }

  before_validation { self.expires_at ||= (created_at || Time.current) + DURATION }

  # Up and buyable: an expired row waits for the sweep (Vanai::Mail.tick) to
  # send it home, but nobody can see or buy it in the meantime.
  scope :live, ->(now = Time.current) { where(status: ACTIVE).where("expires_at > ?", now) }
end
