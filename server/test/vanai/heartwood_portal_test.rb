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

  # The West Gate is a cleft in the rim (2026-10-21): the veil spans the
  # gorge, and it lands you up the Fields' own cleft, in front of its veil.
  def test_the_cleft_veil_activates_the_fields_destination
    messages, departures = interact_at(@portal['x'] + 2, @portal['z'])
    assert_equal [[1, { transferring: true }]], departures
    assert_equal [[1, { t: 'zone_change', zone: 'heartwoodfields', x: 310, z: -35.8 }]], messages
    assert_nil @portal['built']
  end

  def test_the_cleft_mouth_is_too_far_from_the_veil
    messages, departures = interact_at(-306, 2)
    assert_empty departures
    assert_equal 'Too far away.', messages.last.last[:msg]
  end

  def test_return_arrival_and_crystal_stay_inside_the_city
    back = Vanai::Data.zones.fetch('heartwoodfields').fetch('portals').find { |p| p['id'] == 'hf_heartwood' }
    assert_equal ['heartwood', -307.8, 3.4], back.values_at('to', 'tx', 'tz')
    crystal = @definition.fetch('milestones').find { |p| p['id'] == 'crystal_heartwood' }
    assert_equal [-282, -10], crystal.values_at('x', 'z')
  end
end
