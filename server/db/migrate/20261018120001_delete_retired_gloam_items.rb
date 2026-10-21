# Two Gloam items left shared/data/items.json on 2026-10-18 with the rest of
# the superseded game: Watch Oil (vigil_oil, the one item whose effect was
# "quest") and the Haunt Ember (haunt_ember). Nothing drops, sells, crafts or
# asks for either any more, so a stored copy would name an item the world no
# longer knows: a bag row the client draws as its raw key, a listing nobody
# can price, a letter whose Collect would put the dead key back in a bag.
# Delete every stored copy.
#
# Where item keys are stored:
#   inventory_items.item_key       bags and worn gear: the rows go
#   auction_listings.item_key      listings in every status: the rows go
#   mail_letters.items             jsonb [{item_key, qty}]: the stacks go, the
#                                  letter stays (it may carry gold and other
#                                  stacks)
#   relic_registrations.item_key   a registry entry names a relic item, and
#                                  neither was one; cleared for completeness
# Left alone, on purpose:
#   bounties.target (kind collect) a court can only post a collect bounty on
#                                  what a contested zone's monsters drop, its
#                                  nodes yield or its relics list
#                                  (Courts::Bounties.build_targets), and
#                                  neither item was any of those; a bounty
#                                  holds treasury gold until it expires, which
#                                  a delete would strand
#   court_ledger_entries.meta,     a record of what happened and what was
#   court_turns                    said, not rewritten (as the bestiary's
#                                  bounty migration left them)
#   hotbars                        kept in each browser's localStorage, not
#                                  here; a stale entry draws as an empty slot
#
# The keys are frozen here (a migration must not read live data);
# test/vanai/delete_retired_gloam_items_migration_test.rb pins them to the data.
#
# Irreversible: what was held, listed or posted is not kept, and the items it
# would restore no longer exist, so `down` does nothing.
class DeleteRetiredGloamItems < ActiveRecord::Migration[8.1]
  KEYS = %w[vigil_oil haunt_ember].freeze

  def up
    keys = KEYS.map { |k| connection.quote(k) }.join(", ")
    execute "DELETE FROM inventory_items WHERE item_key IN (#{keys})"
    execute "DELETE FROM auction_listings WHERE item_key IN (#{keys})"
    execute "DELETE FROM relic_registrations WHERE item_key IN (#{keys})"
    execute <<~SQL
      UPDATE mail_letters
      SET items = COALESCE((
        SELECT jsonb_agg(stack ORDER BY pos)
        FROM jsonb_array_elements(mail_letters.items) WITH ORDINALITY AS s(stack, pos)
        WHERE NOT (stack->>'item_key' IN (#{keys}))
      ), '[]'::jsonb)
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(mail_letters.items) AS s(stack)
        WHERE stack->>'item_key' IN (#{keys})
      )
    SQL
  end

  def down; end
end
