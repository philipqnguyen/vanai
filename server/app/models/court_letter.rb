# A court's letter to one explorer: a purse (paid on delivery) or a defection
# offer (gold held until it is accepted, declined or lapses). Written by
# Vanai::Courts::Letters; private to the explorer until an offer is accepted.
class CourtLetter < ApplicationRecord
  KINDS = %w[defection purse].freeze
  STATUSES = %w[unread read accepted declined lapsed].freeze
  OPEN = %w[unread read].freeze

  belongs_to :character, optional: true
  belongs_to :court_turn, optional: true

  validates :court, inclusion: { in: Vanai::Courts::KEYS }
  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }

  scope :open_offers, -> { where(kind: "defection", status: OPEN) }

  def open? = OPEN.include?(status)
  def defection? = kind == "defection"
end
