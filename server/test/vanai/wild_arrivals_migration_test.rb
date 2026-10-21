require 'minitest/autorun'
require 'active_record'
require 'json'
require_relative '../../lib/vanai/data'
require_relative '../../db/migrate/20261010000001_move_characters_to_the_wild_arrivals'

# The wilds revamp's migration carries characters stored in the fifteen wild
# zones to their crystal's teleport landing. Its numbers are frozen in the
# migration, so this pins them to the data: each landing is the zone's one
# crystal + (5, 3) (World.teleport_to_crystal), every revamped field zone is
# listed, and the one home move ends on the crystal that stands there now.
# No database here -- the SQL is captured, as the other vanai tests do.
class WildArrivalsMigrationTest < Minitest::Test
  M = MoveCharactersToTheWildArrivals

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

  # the wild zones are every field zone but the two Capitals (tmp/wilds/RULINGS.md)
  def test_every_wild_zone_is_listed
    wild = Vanai::Data.zones.select { |k, z| z['kind'] == 'field' && !k.start_with?('capital') }.keys
    assert_equal wild.sort, M::ARRIVALS.keys.sort
  end

  def test_each_arrival_is_the_crystal_landing
    M::ARRIVALS.each do |zone, arrival|
      crystals = Vanai::Data.zones.fetch(zone).fetch('milestones')
      assert_equal 1, crystals.size, zone
      c = crystals.first
      assert_equal [c['x'] + 5, c['z'] + 3], arrival, zone
    end
  end

  def test_the_home_move_ends_on_the_crystal
    M::HOME_MOVES.each do |zone, (from, to)|
      c = Vanai::Data.zones.fetch(zone).fetch('milestones').first
      assert_equal [c['x'], c['z']], to, zone
      refute_equal from, to
    end
  end

  def test_up_moves_each_zone_and_is_idempotent
    sql = sql_of(:up).map(&:squish)
    assert_equal M::ARRIVALS.size + M::HOME_MOVES.size, sql.size
    assert_match(/\AUPDATE characters SET x = 77, z = 45 WHERE zone = 'caerdunfields' AND \(x <> 77 OR z <> 45\)\z/, sql[1])
    assert_match(/\AUPDATE characters SET home_x = -200, home_z = -226 WHERE home_zone = 'borderwall' AND abs\(home_x - \(-262\)\) < 0.5 AND abs\(home_z - \(-216\)\) < 0.5\z/, sql.last)
  end

  def test_down_moves_nobody
    assert_empty sql_of(:down)
  end
end
