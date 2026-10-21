# One court's turn in one cycle, kept whole for the log: the ledger read sent,
# the raw answer, the parsed verbs and, once applied, what the clamp made of
# each. ok = parsed; invalid = did not validate; failed = the API call failed.
# An invalid or failed court skips the cycle and stays silent.
class CourtTurn < ApplicationRecord
  STATUSES = %w[ok invalid failed].freeze

  belongs_to :council_cycle
  validates :status, inclusion: { in: STATUSES }
  validates :court, inclusion: { in: Vanai::Courts::KEYS }
end
