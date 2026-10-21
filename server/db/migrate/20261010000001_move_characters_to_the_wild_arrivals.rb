# The fifteen wild zones were revamped (2026-10-10, branch wilds,
# tmp/wilds/STATE.md): flat plates became hills, ridges, scarps, ravines and
# mesas, every edge exit moved into a pass cut through the rim mountains, and
# rock, ruins and groves were stood where open ground was. World.join puts a
# character back at its stored x,z without clamping, so anyone who logged out
# in one of these zones could wake inside a new cliff, under a ridge, in a
# gorge wall or on ground the client now refuses. Carry every one of them to
# their zone's teleport crystal landing -- the crystal + (5, 3) that
# World.teleport_to_crystal and a death release use -- which the wilds spot
# audit (tools/qa/zone_spots.mjs, "crystal arrival") ring-tests clear and
# reachable in every zone. The spawn was not used: several spawns moved into
# their new passes and sit at the edge, the crystal stands in each zone's
# middle.
#
# Home points: one crystal moved. The Border Wall's went from (-262, -216),
# where the west pass now runs, to (-200, -226) on the camp's ground, so
# World.home_crystal_id (matching within 0.5 m) would no longer find a home
# set at the old spot. Carry those homes to the new crystal. Every other wild
# crystal stayed put.
#
# A character on a ferry voyage is stored in a sea zone, never in one of
# these, so a voyage is untouched.
#
# Idempotent (a character already at the landing, or homed on the new
# crystal, is left alone; a second run finds no one). `down` moves nobody:
# the old positions are not kept.
#
# The numbers are frozen here (a migration must not read live data);
# test/vanai/wild_arrivals_migration_test.rb pins them to zones.json.
#
# Written by the wilds build, never run: run it with no old world up. World.
# persist_position writes an online character's in-memory x,z back on leave,
# so a player still in a wild zone under the old process would overwrite the
# landing on disconnect. Locally: stop Rails, migrate, start Rails and Vite
# detached -- Philip's call, after the merge (the worktree shares the dev
# database).
class MoveCharactersToTheWildArrivals < ActiveRecord::Migration[8.1]
  # zone => its crystal's teleport landing (crystal x + 5, z + 3)
  ARRIVALS = {
    "moonmereshores" => [17, -162],
    "caerdunfields" => [77, 45],
    "heartwoodfields" => [-87, -19],
    "northroad" => [21, -17],
    "shoreroad" => [-65, -59],
    "huntingwood" => [39, -43],
    "timberestates" => [39, -1],
    "summerlakes" => [-11, -119],
    "reservoir" => [-9, 153],
    "kingsgardens" => [-10, -55],
    "glassworks" => [-35, 33],
    "canalworks" => [-35, 103],
    "granaryplains" => [-7, 35],
    "borderwall" => [-195, -223],
    "burnedland" => [-43, 173],
  }.freeze
  # zone => [old crystal, new crystal]
  HOME_MOVES = {
    "borderwall" => [[-262, -216], [-200, -226]],
  }.freeze

  def up
    ARRIVALS.each do |zone, (x, z)|
      execute <<~SQL
        UPDATE characters SET x = #{x}, z = #{z}
        WHERE zone = #{connection.quote(zone)}
          AND (x <> #{x} OR z <> #{z})
      SQL
    end
    HOME_MOVES.each do |zone, ((fx, fz), (tx, tz))|
      execute <<~SQL
        UPDATE characters SET home_x = #{tx}, home_z = #{tz}
        WHERE home_zone = #{connection.quote(zone)}
          AND abs(home_x - (#{fx})) < 0.5 AND abs(home_z - (#{fz})) < 0.5
      SQL
    end
  end

  def down; end
end
