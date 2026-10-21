# The bestiary remodel (2026-10-13, BESTIARY.md, tools/data/bestiary_plan.json)
# made every enemy a creature: the fourteen human looters became the looting
# creatures that took their camps, drops and quest targets, under new keys
# (shared/data/monsters.json, zones.json, quests.json). A court's kill bounty
# stores its monster's key in bounties.target, so a bounty posted on, say,
# the freebooter scouts would name a monster that no longer exists: nothing
# could ever fill it, and its board line would read the raw key. Carry each
# kill bounty to the creature that took the camp. Collect bounties name items,
# which kept their keys, and are left alone.
#
# bounties.target is the only column that stores a monster key: quest
# progress stores quest keys and NPC ids (credited_targets), claims and
# controls store zones and courts, and the court turns' prompts and outcomes
# are a record of what was said and are not rewritten.
#
# The map is frozen here (a migration must not read live data);
# test/vanai/rename_looter_bounties_migration_test.rb pins it to the data.
# Reversible: `down` maps the keys back.
#
# Written by the bestiary integration, never run: run it with the old world
# down (Philip's call, after the merge; the worktree shares the dev database).
class RenameLooterMonsterKeysInBounties < ActiveRecord::Migration[8.1]
  # old monster key => the creature that took its camp
  RENAMES = {
    "freebooter_scout" => "beacon_jackdaw",
    "freebooter_forager" => "barrow_digger",
    "freebooter_trapper" => "snare_spider",
    "freebooter_beachcomber" => "combe_hermit",
    "freebooter_raider" => "holloway_rummager",
    "freebooter_logger" => "stack_gnawer",
    "freebooter_bather" => "folly_otter",
    "freebooter_diver" => "reservoir_loon",
    "cutting_thief" => "silver_bowerbird",
    "pane_thief" => "pane_lizard",
    "barge_wrecker" => "barge_crayfish",
    "grain_thief" => "sack_ant",
    "wall_runner" => "rampart_gecko",
    "ash_picker" => "pyre_vulture",
  }.freeze

  def up
    rename(RENAMES)
  end

  def down
    rename(RENAMES.invert)
  end

  private

  def rename(map)
    map.each do |from, to|
      execute <<~SQL
        UPDATE bounties SET target = #{connection.quote(to)}
        WHERE kind = 'kill' AND target = #{connection.quote(from)}
      SQL
    end
  end
end
