class InventoryItem < ApplicationRecord
  belongs_to :character
  # A held named relic (COURTS.md "Named relics"): the row is linked to its
  # world row and bound to the finder.
  belongs_to :named_relic, optional: true

  # Bound: no trade, auction, vendor or discard may move or destroy a named
  # relic's row. The friendly refusals live at each door (the vendor, the trade
  # offer, the bags); this is the backstop for every path, including the
  # auction's, which the courts may not edit (Api::BaseController turns the
  # error into a refusal). Registration and crumbling release it, and so does
  # deleting the character the row belongs to.
  before_destroy :keep_bound_relic, if: -> { named_relic_id && !destroyed_by_association }
  before_update :keep_bound_relic, if: -> { named_relic_id && (will_save_change_to_qty? || will_save_change_to_character_id?) }

  def definition
    Vanai::Data.items[item_key]
  end

  private

  def keep_bound_relic
    raise Vanai::Courts::Relics::Bound unless Vanai::Courts::Relics.releasing?
  end
end
