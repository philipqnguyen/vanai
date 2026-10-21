require 'minitest/autorun'
require 'active_record'
require 'json'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/dungeon_navigation'
require_relative '../../db/migrate/20261011000001_move_characters_out_of_rebuilt_dungeons'

# The dungeon revamp's migration carries characters stored in the eleven
# rebuilt dungeons to their spawn. Its numbers are frozen in the migration, so
# this pins them to the data: every dungeon is listed, each target is the
# zone's spawn, and each spawn stands clear on the server's floor.
# No database here -- the SQL is captured, as the other vanai tests do.
class RebuiltDungeonsMigrationTest < Minitest::Test
  M = MoveCharactersOutOfRebuiltDungeons

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

  def test_every_dungeon_is_listed
    dungeons = Vanai::Data.zones.select { |_k, z| z['kind'] == 'dungeon' }.keys
    assert_equal dungeons.sort, M::SPAWNS.keys.sort
  end

  def test_each_target_is_the_spawn_on_the_floor
    M::SPAWNS.each do |zone, (x, z)|
      data = Vanai::Data.zones.fetch(zone)
      spawn = data.fetch('spawn')
      assert_equal [spawn['x'], spawn['z']], [x, z], zone
      nav = Vanai::DungeonNavigation.new(data.fetch('layout'))
      assert nav.clear?(x, z), "#{zone}: spawn off the floor"
    end
  end

  def test_up_moves_each_dungeon_and_is_idempotent
    sql = sql_of(:up).map(&:squish)
    assert_equal M::SPAWNS.size, sql.size
    assert_match(/\AUPDATE characters SET x = 0, z = -102.5 WHERE zone = 'mausoleum' AND \(x <> 0 OR z <> -102.5\)\z/, sql[0])
    assert_match(/\AUPDATE characters SET x = 4.5, z = -42.5 WHERE zone = 'keep' AND \(x <> 4.5 OR z <> -42.5\)\z/, sql.last)
  end

  def test_down_moves_nobody
    assert_empty sql_of(:down)
  end
end
