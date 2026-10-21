# A court's proclamation, as its council turn wrote it and Courts::Text
# cleaned it (names checked against the roster, markup gone, length clamped).
class Proclamation < ApplicationRecord
  belongs_to :court_turn, optional: true
  validates :court, inclusion: { in: Vanai::Courts::KEYS }
  validates :text, presence: true, length: { maximum: 500 }
end
