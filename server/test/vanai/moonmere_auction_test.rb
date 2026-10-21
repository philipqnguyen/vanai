require 'minitest/autorun'
require 'ostruct'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/quests'
require_relative '../../lib/vanai/world'

# Moonmere's auction house, the Exchange (MOONMERE.md "The auction house"): a
# hall on Academy Court's north side, four brokers behind four counters on its
# back wall, every one opening the one shared house. The hall is a SITE
# (zones.json sites.exchange): its counters stand 6.4 m in 2D from the Landing
# Row's shop floors 7.2 m below the riser behind it, so the server is told the
# hall's box and floor -- a trade is struck from inside the hall across any
# counter, and never through the riser from the shops below.
class MoonmereAuctionTest < Minitest::Test
  Player = Struct.new(:x, :z, :site_levels, :quests, :level, :hp, :mp, :max_hp, :max_mp) do
    def alive? = true
    def char_id = 1
    def job = 'PLD'
    def dist_to(x, z) = Math.hypot(self.x - x, self.z - z)
  end

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
  end

  def zone_def = Vanai::Data.zones.fetch('moonmere')

  def at(x, z, levels = {})
    zone = OpenStruct.new(key: 'moonmere', definition: zone_def)
    pair = [zone, Player.new(x, z, levels, {}, 50, 1, 1, 100, 50)]
    online = Vanai::World.instance_variable_get(:@online)
    Vanai::World.instance_variable_set(:@online, { 1 => 'moonmere' })
    original = Vanai::World.method(:find_player)
    Vanai::World.define_singleton_method(:find_player) { |*| pair }
    yield
  ensure
    Vanai::World.define_singleton_method(:find_player, original)
    Vanai::World.instance_variable_set(:@online, online)
  end

  def brokers = zone_def['npcs'].select { |n| n['kind'] == 'auction' }

  def test_every_counter_trades_from_the_hall_floor
    assert_equal %w[broker_corbel broker_fenwright broker_quaile broker_sennet], brokers.map { |b| b['id'] }.sort
    brokers.each do |b|
      assert_equal 'exchange', b['site'], "#{b['id']} is the hall's"
      # on the crowd's side of the counter, 2.8 m in front of the broker (the counter is between)
      at(b['x'], b['z'] - 2.8) do
        assert_nil Vanai::World.npc_refusal_for(1, kind: 'auction'), "#{b['id']}'s counter"
        assert_nil Vanai::World.npc_refusal_for(1, npc_id: b['id'])
      end
    end
    # the map's mark is the hall's, over all four
    svc = zone_def['services'].find { |s| s['kind'] == 'auction' }
    assert_equal brokers.map { |b| b['id'] }.sort, svc['npcs'].sort
    site = zone_def['sites'].fetch('exchange')
    assert Vanai::SiteLevels.inside?(site, svc['x'], svc['z']), "the mark stands in the hall"
  end

  def test_never_through_the_riser_from_the_landing_row
    # Ada's shop floor (LR-0, the Landing Lane's 7.2), under the riser behind the hall: within the
    # server's 8 m of the west counter in 2D, outside the hall's box -- refused as through a floor
    quaile = brokers.find { |b| b['id'] == 'broker_quaile' }
    at(8.6, 201.0) do
      assert_operator Math.hypot(8.6 - quaile['x'], 201.0 - quaile['z']), :<, Vanai::World.singleton_class::NPC_REACH
      refusal = Vanai::World.npc_refusal_for(1, kind: 'auction')
      refute_nil refusal
      assert_equal Vanai::World.singleton_class::SAME_FLOOR_MSG, refusal
    end
  end

  def test_the_court_outside_the_arcade_is_out_of_reach
    # in front of the pavilion's arch on the court: more than 8 m from every counter
    at(17.0, 183.0) { assert_equal 'Too far away.', Vanai::World.npc_refusal_for(1, kind: 'auction') }
  end
end
