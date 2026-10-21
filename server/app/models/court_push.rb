# A court's war chest (fund_push, S6): its claim gains in one zone are doubled
# from `from_cycle` to `to_cycle`, both included.
class CourtPush < ApplicationRecord
  belongs_to :court_turn, optional: true

  scope :active_in, ->(cycle) { where("from_cycle <= ? AND to_cycle >= ?", cycle, cycle) }

  # Claims keeps the cycle's chests in memory (it asks on every credit), so a
  # new or changed chest makes it read them again.
  after_save { Vanai::Courts::Claims.forget_pushes! }
  after_destroy { Vanai::Courts::Claims.forget_pushes! }
end
