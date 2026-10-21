# The courts' ledger: every gold movement and every event the councils read.
# Rows are only ever inserted (by Vanai::Courts::Treasury), never edited.
class CourtLedgerEntry < ApplicationRecord
  belongs_to :character, optional: true

  scope :for_court, ->(court) { where(court: court) }
  scope :in_cycle, ->(cycle) { where(cycle: cycle) }
end
