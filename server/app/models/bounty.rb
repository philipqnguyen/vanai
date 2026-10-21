# A court's bounty (Vanai::Courts::Bounties posts, pays and expires them).
# Shared world state: one row per bounty, each explorer's progress in
# bounty_progresses.
class Bounty < ApplicationRecord
  KINDS = %w[kill collect].freeze
  STATUSES = %w[open filled expired].freeze

  belongs_to :court_turn, optional: true
  has_many :bounty_progresses, dependent: :delete_all

  validates :court, inclusion: { in: Vanai::Courts::KEYS }
  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }

  scope :open_now, -> { where(status: "open") }

  def places_left = places - places_paid
end
