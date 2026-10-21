# One council cycle: the period between two sittings. Row N is open while
# closed_at is NULL; its turn_* columns track the council turn that opens it
# (tmp/courts/PLAN.md 1.3).
class CouncilCycle < ApplicationRecord
  TURN_STATUSES = %w[pending running ready applied skipped failed].freeze

  has_many :court_turns, dependent: :destroy
  validates :turn_status, inclusion: { in: TURN_STATUSES }

  scope :open_cycle, -> { where(closed_at: nil).order(number: :desc) }
end
