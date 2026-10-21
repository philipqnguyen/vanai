# One swearing: creation, the swearing migration, a hall's swearing desk or an
# accepted letter. The name is copied so the record outlives the character.
class AllegianceChange < ApplicationRecord
  VIAS = %w[creation migration hall letter].freeze

  belongs_to :character, optional: true
  validates :via, inclusion: { in: VIAS }
  validates :to_court, inclusion: { in: Vanai::Courts::KEYS }
end
