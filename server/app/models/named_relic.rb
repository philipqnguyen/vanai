# A named relic (Vanai::Courts::Relics): world-unique, one of a zone's few
# slots for a cycle, found on a roll and bound to its finder until it is
# registered at their court's hall or crumbles 24 hours after it was found.
# The finder's name is kept as text, so the book of names survives a deleted
# character.
class NamedRelic < ApplicationRecord
  KINDS = %w[documents goods surveys].freeze
  STATUSES = %w[held registered crumbled].freeze

  belongs_to :finder, class_name: "Character", optional: true

  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }

  scope :held, -> { where(status: "held") }
  scope :registered, -> { where(status: "registered") }
end
