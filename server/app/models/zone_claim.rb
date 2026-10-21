# A court's claim on one wild zone (Vanai::Courts::Claims writes it). Shared
# world state: one row per zone and court, grown by members' work, decayed at
# each cycle boundary.
class ZoneClaim < ApplicationRecord
  validates :court, inclusion: { in: Vanai::Courts::KEYS }
end
