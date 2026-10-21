require 'minitest/autorun'
require 'ostruct'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/quests'
require_relative '../../lib/vanai/world'

# Heartwood's auction house (client/src/heartwood-auction-plan.ts): four brokers
# behind four counters on the back arc of a grown hall at (-27, -19), each
# opening the one shared house. A trade is struck from the hall's floor across
# any counter; from the Grove Ring outside the arcade no counter is in reach.
class HeartwoodAuctionTest < Minitest::Test
  Player = Struct.new(:x, :z, :site_levels, :quests, :level, :hp, :mp, :max_hp, :max_mp) do
    def alive? = true
    def char_id = 1
    def job = 'PLD'
    def dist_to(x, z) = Math.hypot(self.x - x, self.z - z)
  end
  HALL = [-27.0, -19.0].freeze

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
  end

  def at(x, z)
    zone = OpenStruct.new(key: 'heartwood', definition: Vanai::Data.zones.fetch('heartwood'))
    pair = [zone, Player.new(x, z, {}, {}, 50, 1, 1, 100, 50)]
    online = Vanai::World.instance_variable_get(:@online)
    Vanai::World.instance_variable_set(:@online, { 1 => 'heartwood' })
    original = Vanai::World.method(:find_player)
    Vanai::World.define_singleton_method(:find_player) { |*| pair }
    yield
  ensure
    Vanai::World.define_singleton_method(:find_player, original)
    Vanai::World.instance_variable_set(:@online, online)
  end

  def test_every_counter_trades_from_the_hall_floor
    z = Vanai::Data.zones.fetch('heartwood')
    brokers = z['npcs'].select { |n| n['kind'] == 'auction' }
    assert_equal %w[broker_fennick broker_hazel broker_rook broker_sedge], brokers.map { |b| b['id'] }.sort
    brokers.each do |b|
      # across the counter, on the crowd's side: 1.1 m in from the counter's
      # centre line (radius 9.35), toward the hall's centre
      a = Math.atan2(b['x'] - HALL[0], b['z'] - HALL[1])
      x = HALL[0] + Math.sin(a) * 8.25
      zz = HALL[1] + Math.cos(a) * 8.25
      at(x, zz) do
        assert_nil Vanai::World.npc_refusal_for(1, kind: 'auction'), "#{b['id']}'s counter"
        assert_nil Vanai::World.npc_refusal_for(1, npc_id: b['id'])
      end
    end
    # the map's mark covers all four
    svc = z['services'].find { |s| s['kind'] == 'auction' }
    assert_equal brokers.map { |b| b['id'] }.sort, svc['npcs'].sort
  end

  def test_the_grove_ring_outside_is_out_of_reach
    # the Grove Ring's disc, in front of the arcade: 13 m and more from any broker
    at(-8.0, -6.0) { assert_equal 'Too far away.', Vanai::World.npc_refusal_for(1, kind: 'auction') }
  end
end
