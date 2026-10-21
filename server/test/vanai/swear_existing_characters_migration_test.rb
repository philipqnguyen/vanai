require 'minitest/autorun'
require 'active_record'
require 'json'
require_relative '../../lib/vanai/data'
require_relative '../../db/migrate/20261012100005_swear_existing_characters'

# The swearing migration's three rules, read from its captured SQL (no
# database), and its frozen crystal ids held equal to zones.json.
class SwearExistingCharactersMigrationTest < Minitest::Test
  M = SwearExistingCharacters

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
    sql.map(&:squish)
  end

  def test_the_frozen_crystals_are_each_citys_first_crystal
    courts = JSON.parse(File.read(File.expand_path('../../../shared/data/courts.json', __dir__)))['courts']
    assert_equal courts.keys.sort, M::CRYSTALS.keys.sort
    M::CRYSTALS.each do |city, id|
      assert_equal city, courts[city]['city']
      assert_equal id, Vanai::Data.zones.fetch(city).fetch('milestones').first.fetch('id'), city
    end
  end

  def test_up_runs_the_three_rules_then_records_each_swearing
    home, first_city, fallback, record = sql_of(:up)
    assert_match(/\AUPDATE characters SET court = home_zone WHERE home_zone IN \('caerdun', 'heartwood', 'moonmere'\)/, home)
    assert_match(/SELECT DISTINCT ON \(character_id\) character_id, CASE landmark_key WHEN 'milestone_crystal_caerdun' THEN 'caerdun'/, first_city)
    assert_match(/ORDER BY character_id, id\)/, first_city, 'the first-attuned city crystal wins')
    assert_match(/characters.home_zone NOT IN \('caerdun', 'heartwood', 'moonmere'\)\z/, first_city)
    assert_match(/\AUPDATE characters SET court = 'caerdun' WHERE home_zone NOT IN .* AND NOT EXISTS/, fallback)
    assert_match(/\AINSERT INTO allegiance_changes .* 0, 'migration', 0, now\(\) FROM characters WHERE NOT EXISTS/, record)
  end

  def test_down_removes_only_its_own_rows
    assert_equal ["DELETE FROM allegiance_changes WHERE via = 'migration'"], sql_of(:down)
  end
end
