# Caerdun was rebuilt as the Sea Gate fortress (2026-10-06): the walled city
# shrank to a third of its area (ruling CF-5), the land pulled in round a new
# landward front -- a rock-cut ditch, a barbican and the Crown Gate at x 65 --
# and new walls, houses and halls stand where the old streets ran. World.join
# puts a character back at its stored x,z without clamping, so anyone who
# logged out in Caerdun would wake inside a new house, a wall, the ditch or
# off the edge of the land. Carry every one of them to the new arrival, in the
# barbican court before the Crown Gate, where the Fields' Landward Gate now
# lands (zones.json caerdun.spawn, caerdunfields cf_caerdun tx/tz). Philip's
# ruling CF-22 (2026-10-08) put the exit portal in the barbican's arch and this
# arrival just inside it, 13 m from the portal; before it, the arrival was (124,
# -18) out on the glacis road. The migration has never been run (see below), so
# it carries the ruled arrival and nothing stored ever held the earlier one.
#
# Home points: the crystal stayed at (25, -18) (CF-9), so World.home_crystal_id
# still matches every home set there. The dev database also held two homes at
# (176, -64), where an earlier crystal stood (20260924000002); no crystal
# stands there now, so "return home" finds nothing for them. Home them on the
# crystal.
#
# Idempotent (a character already at the arrival or the crystal is left alone,
# and a second run finds no one). `down` moves nobody: the old positions are
# not kept.
#
# Run it with no old world up. World.persist_position writes a character's
# in-memory x,z back on leave, so a player still online in Caerdun under the
# old process would overwrite the arrival with the old coordinates when they
# disconnect. Locally: stop Rails, migrate, start it again -- Philip's call,
# after the merge (the worktree shares the dev database with the old city).
class MoveCharactersToTheCaerdunArrival < ActiveRecord::Migration[8.1]
  ZONE = "caerdun".freeze
  ARRIVAL = [79, -18].freeze
  CRYSTAL = [25, -18].freeze
  ORPHANED_HOME = [176, -64].freeze

  def up
    x, z = ARRIVAL
    execute <<~SQL
      UPDATE characters SET x = #{x}, z = #{z}
      WHERE zone = #{connection.quote(ZONE)}
        AND (x <> #{x} OR z <> #{z})
    SQL
    (fx, fz), (tx, tz) = ORPHANED_HOME, CRYSTAL
    execute <<~SQL
      UPDATE characters SET home_x = #{tx}, home_z = #{tz}
      WHERE home_zone = #{connection.quote(ZONE)}
        AND abs(home_x - (#{fx})) < 0.5 AND abs(home_z - (#{fz})) < 0.5
    SQL
  end

  def down; end
end
