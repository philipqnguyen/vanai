# One registration at a court's registry desk (Vanai::Courts::Relics): a stack
# of common relics or one named relic. The per-character cap on common relics
# and the court's relic budget are both counted from these rows, per cycle.
class RelicRegistration < ApplicationRecord
  belongs_to :character, optional: true
  belongs_to :named_relic, optional: true
end
