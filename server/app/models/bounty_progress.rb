# One explorer's hold on a bounty: taken at the posting court's board, counted
# by kills (a kill bounty) or read from the bags at delivery (a collect one).
class BountyProgress < ApplicationRecord
  STATUSES = %w[active paid unpaid].freeze

  belongs_to :bounty
  belongs_to :character

  validates :status, inclusion: { in: STATUSES }

  scope :active, -> { where(status: "active") }
end
