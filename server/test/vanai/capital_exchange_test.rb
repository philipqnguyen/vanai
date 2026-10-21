require 'minitest/autorun'
require 'ostruct'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/quests'
require_relative '../../lib/vanai/world'

# The returned Capital's auction house, the Exchange (CAPITAL.md "The Exchange"):
# a stoa on the square's east side, four brokers behind four counters in the
# aisle at the back of its open court, every one opening the one shared house.
# The Exchange's floor is a SITE (zones.json sites.exchange, the podium's top
# inside its walls): the east mews runs 4.6 m behind the counters, on the other
# side of the back wall, so a trade is struck from the Exchange's floor across
# any counter and never through that wall. Before 2026-10-11 the auction
# endpoints traded only in the three free cities, and the Capital's broker could
# not trade at all (Api::AuctionController#require_at_market!).
class CapitalExchangeTest < Minitest::Test
  Player = Struct.new(:x, :z, :site_levels, :quests, :level, :hp, :mp, :max_hp, :max_mp) do
    def alive? = true
    def char_id = 1
    def job = 'PLD'
    def dist_to(x, z) = Math.hypot(self.x - x, self.z - z)
  end

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
  end

  def zone_def = Vanai::Data.zones.fetch('capitalreturned')

  def at(x, z, levels = {})
    zone = OpenStruct.new(key: 'capitalreturned', definition: zone_def)
    pair = [zone, Player.new(x, z, levels, {}, 50, 1, 1, 100, 50)]
    online = Vanai::World.instance_variable_get(:@online)
    Vanai::World.instance_variable_set(:@online, { 1 => 'capitalreturned' })
    original = Vanai::World.method(:find_player)
    Vanai::World.define_singleton_method(:find_player) { |*| pair }
    yield
  ensure
    Vanai::World.define_singleton_method(:find_player, original)
    Vanai::World.instance_variable_set(:@online, online)
  end

  def brokers = zone_def['npcs'].select { |n| n['kind'] == 'auction' }

  def test_the_returned_capital_has_an_auction_house_and_the_empty_one_none
    %w[caerdun heartwood moonmere capitalreturned].each { |k| assert Vanai::Data.auction_zone?(k), "#{k} trades" }
    %w[capital burnedland northroad keep].each { |k| refute Vanai::Data.auction_zone?(k), "#{k} has no house" }
  end

  def test_every_counter_trades_from_the_exchange_floor
    assert_equal %w[broker_imperial broker_odile broker_reeve broker_vane], brokers.map { |b| b['id'] }.sort
    brokers.each do |b|
      assert_equal 'exchange', b['site'], "#{b['id']} is the Exchange's"
      # the brokers face the court (-x): the crowd's side of the counter is 2.8 m west
      at(b['x'] - 2.8, b['z']) do
        assert_nil Vanai::World.npc_refusal_for(1, kind: 'auction'), "#{b['id']}'s counter"
        assert_nil Vanai::World.npc_refusal_for(1, npc_id: b['id'])
      end
    end
    # the map's badge is the Exchange's, over all four, in the middle of its floor
    svc = zone_def['services'].find { |s| s['kind'] == 'auction' }
    assert_equal brokers.map { |b| b['id'] }.sort, svc['npcs'].sort
    assert Vanai::SiteLevels.inside?(zone_def['sites'].fetch('exchange'), svc['x'], svc['z']), 'the badge stands in the Exchange'
  end

  def test_never_through_the_back_wall_from_the_east_mews
    # the east mews (x 76..83) behind the back wall: within 8 m of every counter in
    # 2D, outside the Exchange's floor -- refused as through a floor
    brokers.each do |b|
      at(78.0, b['z']) do
        assert_operator Math.hypot(78.0 - b['x'], 0), :<, Vanai::World.singleton_class::NPC_REACH
        assert_equal Vanai::World.singleton_class::SAME_FLOOR_MSG, Vanai::World.npc_refusal_for(1, kind: 'auction')
      end
    end
  end

  def test_the_square_before_the_steps_is_out_of_reach
    at(43.0, -108.0) { assert_equal 'Too far away.', Vanai::World.npc_refusal_for(1, kind: 'auction') }
  end
end
