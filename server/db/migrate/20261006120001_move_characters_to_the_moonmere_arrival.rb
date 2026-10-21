# Moonmere was rebuilt (2026-10-06, MOONMERE.md): the Banded Cloisters on the
# Crescent Mere, a new island shape, new levels (quay 1.0, L1 7.2, L2 14.4,
# the knoll 21.6), new streets and houses where the old city stood. World.join
# puts a character back at its stored x,z without clamping, so anyone who
# logged out in Moonmere would wake inside a new house, a riser or the mere.
# Carry every one of them to the arrival on the causeway deck, the zone's
# spawn (MM-3: the spawn, the portal and the deck did not move).
#
# Home points need nothing: the crystal stayed at (-16, 167) (MM-3), so
# World.home_crystal_id still matches them.
#
# THE SHORES' GATE (S5 review). The Moonmere Shores' walkable ground changed
# only in the causeway's corridor (MOONMERE.md A-14): the kit gatehouse there,
# a 10 m passage between round towers, is now cg_shell, a 6 m passage between
# two 4 m piers (zones/moonmere_causeway.ts GATE: 14 x 6, half 3.0). A
# character stored where the old gatehouse let them stand and a new pier now
# is would wake inside it. So a second UPDATE carries every moonmereshores
# character inside the piers' footprint -- |x - GATE_X| in [half - R, w/2 + R],
# |z - GATE_Z| <= d/2 + R, R the body's 0.45 m (scene.ts resolveCollision) --
# to the road 2 m outside the gate's land face, where the map road starts.
# GATE_Z is MEASURED, not data: causewayLaid().gateZ in /?zone=moonmereshores
# (scene.ts: cwRoot + 18, cwRoot from the waterline at x = 0), -223.5; the
# migration test pins the rest to the data and the TS constants.
#
# Idempotent (a character already at the arrival, or on the Shores' road, is
# left alone, and a second run finds no one). `down` moves nobody: the old positions are not kept, and
# (8, 288) was the old city's causeway deck too.
#
# The version is 20261006120001, not ...000001: the Caerdun session's own
# stored-position migration took 20261006000001 (../vanai-caerdun, checked at
# S5), and this one sorts after it (MOONMERE.md section 9). Written by Track P,
# never run here: Philip runs it with no old world up (stop Rails, migrate,
# start Rails and Vite detached), as World.persist_position writes an online
# character's old x,z back on leave.
class MoveCharactersToTheMoonmereArrival < ActiveRecord::Migration[8.1]
  ZONE = 'moonmere'
  ARRIVAL = [8, 288].freeze
  SHORES = 'moonmereshores'
  GATE_X = 0
  GATE_Z = -223.5
  # the piers' footprint, padded by the body's radius: the passage's clear half, the outer half, the depth's half
  PASSAGE_HALF = 3.0 - 0.45
  OUTER_HALF = 7.0 + 0.45
  DEPTH_HALF = 3.0 + 0.45
  # on the road, 2 m outside the gate's land face (moonmere_shores.ts addMapRoad's first point)
  SHORES_ROAD = [0, -218.5].freeze

  def up
    x, z = ARRIVAL
    execute <<~SQL
      UPDATE characters SET x = #{x}, z = #{z}
      WHERE zone = #{connection.quote(ZONE)}
        AND (x <> #{x} OR z <> #{z})
    SQL
    rx, rz = SHORES_ROAD
    execute <<~SQL
      UPDATE characters SET x = #{rx}, z = #{rz}
      WHERE zone = #{connection.quote(SHORES)}
        AND ABS(x - (#{GATE_X})) >= #{PASSAGE_HALF} AND ABS(x - (#{GATE_X})) <= #{OUTER_HALF}
        AND ABS(z - (#{GATE_Z})) <= #{DEPTH_HALF}
    SQL
  end

  def down; end
end
