require 'minitest/autorun'
require 'active_record'
require_relative '../../lib/vanai/data'
require_relative '../../db/migrate/20261006120001_move_characters_to_the_moonmere_arrival'

# The Moonmere rebuild's migration carries characters stored in Moonmere to the
# arrival on the causeway deck. Its numbers are frozen in the migration (a
# migration must not read live data), so this pins them to the data they were
# taken from: the zone's spawn and the Shores' causeway portal that lands there.
# No database here -- the SQL is captured, as the other vanai tests stub
# persistence.
class MoonmereArrivalMigrationTest < Minitest::Test
  M = MoveCharactersToTheMoonmereArrival

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
  end

  def sql_of(direction)
    migration = M.new
    sql = []
    quote = Object.new
    def quote.quote(s) = "'#{s}'"
    migration.define_singleton_method(:execute) { |q| sql << q }
    migration.define_singleton_method(:connection) { quote }
    migration.public_send(direction)
    sql
  end

  def test_the_arrival_is_the_spawn_and_where_the_causeway_lands
    spawn = Vanai::Data.zones.fetch('moonmere').fetch('spawn')
    assert_equal M::ARRIVAL, [spawn['x'], spawn['z']]
    cw = Vanai::Data.zones.fetch('moonmereshores')['portals'].find { |p| p['to'] == 'moonmere' }
    assert_equal M::ARRIVAL, [cw['tx'], cw['tz']]
  end

  def test_up_moves_only_moonmere_and_is_idempotent
    sql = sql_of(:up)
    assert_equal 2, sql.size
    q = sql.first.squish
    assert_match(/\AUPDATE characters SET x = 8, z = 288 WHERE zone = 'moonmere'/, q)
    assert_match(/AND \(x <> 8 OR z <> 288\)\z/, q)
    refute_match(/home_/, q, 'home points stay: the crystal did not move')
  end

  # The Shores' gate box: GATE's numbers as moonmere_causeway.ts has them, the road point on the
  # causeway's line (the Shores portal's x) and outside the box, and the box neither reaching the
  # passage's clear middle nor the portal.
  def test_the_shores_gate_box_is_the_new_piers
    ts = File.read(File.expand_path('../../../client/src/zones/moonmere_causeway.ts', __dir__))
    w, d, half = ts.match(/export const GATE = \{ w: ([\d.]+), d: ([\d.]+), half: ([\d.]+),/).captures.map(&:to_f)
    r = File.read(File.expand_path('../../../client/src/scene.ts', __dir__))[/const R = ([\d.]+); \/\/ body radius/, 1].to_f
    assert_in_delta half - r, M::PASSAGE_HALF, 1e-9
    assert_in_delta w / 2 + r, M::OUTER_HALF, 1e-9
    assert_in_delta d / 2 + r, M::DEPTH_HALF, 1e-9
    shores = Vanai::Data.zones.fetch('moonmereshores')
    cw = shores['portals'].find { |p| p['to'] == 'moonmere' }
    assert_equal cw['x'], M::GATE_X, 'the gate stands on the causeway, the portal\'s x'
    rx, rz = M::SHORES_ROAD
    assert_equal M::GATE_X, rx
    assert_in_delta M::GATE_Z + d / 2 + 2, rz, 1e-9, 'the road point: 2 m outside the land face'
    assert (rz - M::GATE_Z).abs > M::DEPTH_HALF, 'the road point is outside the box (a second run moves no one)'
    assert (cw['z'] - M::GATE_Z).abs > M::DEPTH_HALF, 'the portal is not in the box'
    # the gate is between the Shores' spawn and the portal, on the road
    assert cw['z'] < M::GATE_Z && M::GATE_Z < shores['spawn']['z']
    q = sql_of(:up).last.squish
    assert_match(/\AUPDATE characters SET x = 0, z = -218.5 WHERE zone = 'moonmereshores'/, q)
    assert_match(/ABS\(x - \(0\)\) >= 2.55 AND ABS\(x - \(0\)\) <= 7.45 AND ABS\(z - \(-223.5\)\) <= 3.45\z/, q)
  end

  def test_down_moves_nobody
    assert_empty sql_of(:down)
  end
end
