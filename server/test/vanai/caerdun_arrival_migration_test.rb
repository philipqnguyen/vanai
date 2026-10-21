require 'minitest/autorun'
require 'active_record'
require_relative '../../lib/vanai/data'
require_relative '../../db/migrate/20261006000001_move_characters_to_the_caerdun_arrival'

# The Sea Gate rebuild's migration carries characters stored in Caerdun to the
# new arrival, and the two homes orphaned at the crystal's old (176, -64) to
# the crystal. Its numbers are frozen in the migration (a migration must not
# read live data), so this pins them to the data they were taken from: the
# zone's spawn, the Fields' landing, the crystal and the new characters' start.
# No database here -- the SQL is captured, as the other vanai tests stub
# persistence.
class CaerdunArrivalMigrationTest < Minitest::Test
  M = MoveCharactersToTheCaerdunArrival

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

  def test_the_arrival_is_the_spawn_and_the_fields_landing_not_a_new_characters_start
    city = Vanai::Data.zones.fetch('caerdun')
    assert_equal M::ARRIVAL, [city['spawn']['x'], city['spawn']['z']]
    landing = Vanai::Data.zones.fetch('caerdunfields')['portals'].find { |p| p['to'] == 'caerdun' }
    assert_equal M::ARRIVAL, [landing['tx'], landing['tz']]
    crystal = city['milestones'].find { |m| m['id'] == 'crystal_caerdun' }
    assert_equal M::CRYSTAL, [crystal['x'], crystal['z']]
    # (a new character's start is NOT the arrival since CF-23: it stands before the
    # Sea Gate, start_cities_test.rb; the migration never moves anyone there)
    start = city.fetch('start')
    refute_equal M::ARRIVAL, [start['x'], start['z']]
  end

  def test_up_moves_only_caerdun_and_the_orphaned_homes_and_is_idempotent
    move, home = sql_of(:up).map(&:squish)
    assert_match(/\AUPDATE characters SET x = 79, z = -18 WHERE zone = 'caerdun' AND \(x <> 79 OR z <> -18\)\z/, move)
    assert_match(/\AUPDATE characters SET home_x = 25, home_z = -18 WHERE home_zone = 'caerdun'/, home)
    assert_match(/abs\(home_x - \(176\)\) < 0\.5 AND abs\(home_z - \(-64\)\) < 0\.5\z/, home)
  end

  # CF-22 (2026-10-08): the arrival stands inside the barbican court, clear of the
  # exit portal's reach (the server's 9 m, World#interact "Too far away."), so a
  # character the migration carries there is never standing in the way out
  def test_the_arrival_is_clear_of_the_exit_portals_reach
    portal = Vanai::Data.zones.fetch('caerdun')['portals'].find { |p| p['to'] == 'caerdunfields' }
    assert_operator Math.hypot(M::ARRIVAL[0] - portal['x'], M::ARRIVAL[1] - portal['z']), :>=, 9 + 3
  end

  def test_down_moves_nobody
    assert_empty sql_of(:down)
  end
end
