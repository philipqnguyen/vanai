# The crystal shrine was rebuilt on a 6.6 m terrace (2026-09-24), and two
# crystals had to move off buildings to fit it: Caerdun 6 m south, Moonmere
# 17 m east onto the level square below the fork. A home point is stored as
# the crystal's coordinates, and World.home_crystal_id finds the crystal by
# matching them within 0.5 m -- so
# a character homed at the old spot would lose "return home" and respawn
# inside the new terrace. Carry every such home point to the new spot.
class MoveCrystalHomePoints < ActiveRecord::Migration[8.1]
  MOVES = [
    { zone: "caerdun", from: [176, -70], to: [176, -64] },
    { zone: "moonmere", from: [-30, 176], to: [-16, 167] },
  ].freeze

  def up
    MOVES.each { |m| move(m[:zone], m[:from], m[:to]) }
  end

  def down
    MOVES.each { |m| move(m[:zone], m[:to], m[:from]) }
  end

  private

  def move(zone, (fx, fz), (tx, tz))
    execute <<~SQL
      UPDATE characters SET home_x = #{tx}, home_z = #{tz}
      WHERE home_zone = #{connection.quote(zone)}
        AND abs(home_x - (#{fx})) < 0.5 AND abs(home_z - (#{fz})) < 0.5
    SQL
  end
end
