# The Capital was rebuilt (2026-10-05): half the area inside a bastioned
# octagon, the gate pulled in from z -300 to -260, new streets, blocks and a
# palace terrace where the old grid stood. World.join puts a character back at
# its stored x,z without clamping, so anyone who logged out in either Capital
# zone (the empty city or the returned one -- they share one street plan)
# would wake inside a new house, a wall or the ash outside it. Carry every one
# of them to the one shared arrival before the gate, where the Burned Land's
# portal now lands too.
#
# Home points need nothing: the crystal stayed at (-14, -200) in both zones,
# so World.home_crystal_id still matches them.
#
# Idempotent (a character already at the arrival is left alone, and a second
# run finds no one). `down` moves nobody: the old positions are not kept, and
# (0, -242) was the old city's avenue too, so rolled-back code would find these
# characters standing on a street either way.
#
# Run it with no old world up. World.persist_position writes a character's
# in-memory x,z back on leave, so a player still online in the Capital under
# the old process would overwrite the arrival with the old coordinates when
# they disconnect. Locally: stop Rails, migrate, start it again. (A kamal
# deploy migrates in the new container while the old one still serves; anyone
# left in the Capital then lands where the old world last saw them.)
class MoveCharactersToTheCapitalArrival < ActiveRecord::Migration[8.1]
  ZONES = %w[capital capitalreturned].freeze
  ARRIVAL = [0, -242].freeze

  def up
    x, z = ARRIVAL
    execute <<~SQL
      UPDATE characters SET x = #{x}, z = #{z}
      WHERE zone IN (#{ZONES.map { |k| connection.quote(k) }.join(', ')})
        AND (x <> #{x} OR z <> #{z})
    SQL
  end

  def down; end
end
