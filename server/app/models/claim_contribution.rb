# One character's claim work for one court in one zone in one cycle: the sum
# over a cycle is what the per-character cap counts, and `court` is the court
# it was earned for, which it keeps whatever the character swears to later.
class ClaimContribution < ApplicationRecord
  belongs_to :character
end
