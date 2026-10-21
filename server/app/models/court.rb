# A city court's row: its treasury, its auction rate and its relic prices.
# Thin on purpose: every gold movement goes through Vanai::Courts::Treasury
# (an atomic increment with its ledger row), never through `update`.
class Court < ApplicationRecord
  validates :key, inclusion: { in: Vanai::Courts::KEYS }
end
