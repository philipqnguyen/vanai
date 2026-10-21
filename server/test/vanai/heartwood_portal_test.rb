require 'minitest/autorun'
require 'ostruct'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/world'

# Exercise the authoritative interaction and travel path without booting a
# second world process or changing a real character in the local database.
class HeartwoodPortalTest < Minitest::Test
  Player = Struct.new(:x, :z, :site_levels) do
    def alive? = true
    def dist_to(x, z) = Math.hypot(self.x - x, self.z - z)
  end

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
    @definition = Vanai::Data.zones.fetch('heartwood')
    @portal = @definition.fetch('portals').find { |p| p['id'] == 'hw_fields' }
  end

  def replace_method(name, implementation)
    original = Vanai::World.method(name)
    Vanai::World.define_singleton_method(name, &implementation)
    yield
  ensure
    Vanai::World.define_singleton_method(name, original)
  end

  def interact_at(x, z)
    messages = []
    departures = []
    player = Player.new(x, z, {})
    pair = [OpenStruct.new(definition: @definition), player]
    replace_method(:find_player, ->(*) { pair }) do
      replace_method(:to_char, ->(id, payload) { messages << [id, payload] }) do
        replace_method(:leave, ->(id, **opts) { departures << [id, opts] }) do
          # Persistence is deliberately excluded; travel still emits the real
          # zone_change payload used by the client.
          replace_method(:db, ->(&_) {}) { Vanai::World.interact(1, 'hw_fields') }
        end
      end
    end
    [messages, departures]
  end

  def test_tall_gate_activates_the_existing_fields_destination
    messages, departures = interact_at(@portal['x'] + 2, @portal['z'])
    assert_equal [[1, { transferring: true }]], departures
    assert_equal [[1, { t: 'zone_change', zone: 'heartwoodfields', x: 306, z: -35 }]], messages
    assert_equal true, @portal['built']
  end

  def test_old_small_gate_position_no_longer_activates_the_portal
    messages, departures = interact_at(-306, 2)
    assert_empty departures
    assert_equal 'Too far away.', messages.last.last[:msg]
  end

  def test_return_arrival_and_crystal_stay_inside_the_city
    back = Vanai::Data.zones.fetch('heartwoodfields').fetch('portals').find { |p| p['id'] == 'hf_heartwood' }
    assert_equal ['heartwood', -290, 2], back.values_at('to', 'tx', 'tz')
    crystal = @definition.fetch('milestones').find { |p| p['id'] == 'crystal_heartwood' }
    assert_equal [-282, -10], crystal.values_at('x', 'z')
  end
end
