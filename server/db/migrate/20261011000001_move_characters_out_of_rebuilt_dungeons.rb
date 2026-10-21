# The eleven dungeons were rebuilt (2026-10-11, branch wilds, DUNGEONS.md,
# tmp/dungeons/STATE.md): new layouts, new rooms and corridors, set pieces on
# what used to be floor, rooms moved (the Lodge's office, the Granary's
# office, the Ballroom's palace a level down), and the Keep has a server
# layout for the first time. World.join puts a character back at its stored
# x,z without clamping, so anyone who logged out inside one of them could
# wake inside a wall, under a set piece, off the new floor or on a level that
# no longer exists. Carry every one of them to their dungeon's spawn: the
# landing beside the entrance Rune Circle that the dungeon audit and the
# node plan test route every room from, on the entry floor at y 0.
#
# Characters carry no stored floor level: the server's SiteLevels reconnect
# derives it from the cell, and every spawn stands on a ground-level cell.
#
# Home points are crystals, and no dungeon has a crystal, so no home moves.
#
# Idempotent (a character already at the spawn is left alone; a second run
# finds no one). `down` moves nobody: the old positions are not kept.
#
# The numbers are frozen here (a migration must not read live data);
# test/vanai/rebuilt_dungeons_migration_test.rb pins them to zones.json.
#
# Written by the dungeon revamp, never run: run it with no old world up.
# World.persist_position writes an online character's in-memory x,z back on
# leave, so a player still in a dungeon under the old process would overwrite
# the spawn on disconnect. Locally: stop Rails, migrate, start Rails and Vite
# detached -- Philip's call, after the merge (the worktree shares the dev
# database).
class MoveCharactersOutOfRebuiltDungeons < ActiveRecord::Migration[8.1]
  # dungeon => its spawn (zones.json `spawn`)
  SPAWNS = {
    "mausoleum" => [0, -102.5],
    "overseerslodge" => [0, -37.5],
    "sunkenballroom" => [0, -44.5],
    "belltower" => [0, -53.5],
    "glasshouse" => [0, -37.5],
    "furnacehall" => [0, -37.5],
    "greatsluice" => [0, -41.5],
    "greatgranary" => [0, -37.5],
    "greatwatchtower" => [0, -37.5],
    "beaconfort" => [0, -37.5],
    "keep" => [4.5, -42.5],
  }.freeze

  def up
    SPAWNS.each do |zone, (x, z)|
      execute <<~SQL
        UPDATE characters SET x = #{x}, z = #{z}
        WHERE zone = #{connection.quote(zone)}
          AND (x <> #{x} OR z <> #{z})
      SQL
    end
  end

  def down; end
end
