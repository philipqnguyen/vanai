require 'minitest/autorun'
require_relative '../../lib/vanai/data'

# A zone's map `services` (client/src/map_services.ts): the real data passes,
# and each way an entry can be wrong is named. Walks the shared data with one
# zone's list swapped out and restored.
class ZoneServicesTest < Minitest::Test
  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
    @zone = Vanai::Data.zones.fetch('caerdun')
    @saved = @zone['services']
  end

  def teardown
    @zone['services'] = @saved
  end

  def test_the_shipped_services_are_clean
    assert_empty Vanai::Data.zone_problems
    kinds = Vanai::Data.zones.values.flat_map { |z| z['services'] || [] }.map { |s| s['kind'] }
    assert_equal 4, kinds.count('auction'), 'every city with a broker marks its auction house'
  end

  def test_each_mistake_is_named
    @zone['services'] = [
      { 'kind' => 'bank', 'name' => 'The Vault', 'x' => 0, 'z' => 0 },
      { 'kind' => 'inn', 'name' => ' ', 'x' => 0, 'z' => 0 },
      { 'kind' => 'inn', 'name' => 'Far Inn', 'x' => 900, 'z' => '1' },
      { 'kind' => 'auction', 'name' => 'Hall', 'x' => 1, 'z' => 1, 'npcs' => ['broker_ashby', 'nobody'] },
      { 'kind' => 'vendor', 'name' => 'Again', 'x' => 1, 'z' => 1, 'npcs' => ['broker_ashby'] },
    ]
    p = Vanai::Data.zone_problems.join("\n")
    assert_match(/services\[0\]: kind "bank"/, p)
    assert_match(/services\[1\]: needs a name/, p)
    assert_match(/services\[2\]: x 900 is outside/, p)
    assert_match(/services\[2\]: z must be a number/, p)
    assert_match(/services\[3\]: npc "nobody" is not an NPC in caerdun/, p)
    assert_match(/services\[4\]: npc "broker_ashby" is covered by two services/, p)
  end
end
