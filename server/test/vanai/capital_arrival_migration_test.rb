require 'minitest/autorun'
require 'active_record'
require_relative '../../lib/vanai/data'
require_relative '../../db/migrate/20261005000001_move_characters_to_the_capital_arrival'

# The Capital rebuild's migration carries characters stored in either Capital
# zone to the arrival. Its numbers are frozen in the migration (a migration
# must not read live data), so this pins them to the data they were taken
# from: both zones' spawn and the Burned Land's landing. No database here --
# the SQL is captured, as the other vanai tests stub persistence.
class CapitalArrivalMigrationTest < Minitest::Test
  M = MoveCharactersToTheCapitalArrival

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

  def test_the_arrival_is_where_both_zones_and_the_burned_land_land
    M::ZONES.each do |key|
      spawn = Vanai::Data.zones.fetch(key).fetch('spawn')
      assert_equal M::ARRIVAL, [spawn['x'], spawn['z']], "#{key} spawn"
    end
    bl = Vanai::Data.zones.fetch('burnedland')['portals'].find { |p| p['id'] == 'bl_capital' }
    assert_equal M::ARRIVAL, [bl['tx'], bl['tz']]
    assert_equal %w[capital capitalreturned], M::ZONES
  end

  def test_up_moves_only_the_two_capital_zones_and_is_idempotent
    sql = sql_of(:up)
    assert_equal 1, sql.size
    q = sql.first.squish
    assert_match(/\AUPDATE characters SET x = 0, z = -242 WHERE zone IN \('capital', 'capitalreturned'\)/, q)
    assert_match(/AND \(x <> 0 OR z <> -242\)\z/, q)
    refute_match(/home_/, q, 'home points stay: the crystal did not move')
  end

  def test_down_moves_nobody
    assert_empty sql_of(:down)
  end
end
