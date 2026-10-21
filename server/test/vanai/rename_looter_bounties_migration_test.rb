require 'minitest/autorun'
require 'active_record'
require 'json'
require_relative '../../lib/vanai/data'
require_relative '../../db/migrate/20261013120001_rename_looter_monster_keys_in_bounties'

# The bestiary's migration carries kill bounties on the fourteen retired
# looter keys to the creatures that took their camps. Its map is frozen in
# the migration, so this pins it to the data: every old key is gone from
# monsters.json, every new one is a camped monster, no two old keys share a
# new one, and only kill bounties are touched. No database here -- the SQL is captured, as the other
# vanai tests do.
class RenameLooterBountiesMigrationTest < Minitest::Test
  M = RenameLooterMonsterKeysInBounties

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

  def test_old_keys_are_gone_and_new_keys_are_camped_monsters
    camped = Vanai::Data.zones.values.flat_map { |z| (z['camps'] || []).map { |c| c['monster'] } }
    assert_equal 14, M::RENAMES.size
    M::RENAMES.each do |from, to|
      refute Vanai::Data.monsters.key?(from), "#{from} should be retired"
      assert Vanai::Data.monsters.key?(to), "#{to} is not a monster"
      assert_includes camped, to, "#{to} stands in no camp"
    end
    assert_equal M::RENAMES.size, M::RENAMES.values.uniq.size
  end

  def test_up_renames_only_kill_bounties_and_down_reverses
    up = sql_of(:up)
    assert_equal 14, up.size
    assert up.all? { |q| q.include?("kind = 'kill'") }
    assert_includes up.join, "SET target = 'beacon_jackdaw'\nWHERE kind = 'kill' AND target = 'freebooter_scout'"
    down = sql_of(:down)
    assert_includes down.join, "SET target = 'freebooter_scout'\nWHERE kind = 'kill' AND target = 'beacon_jackdaw'"
  end
end
