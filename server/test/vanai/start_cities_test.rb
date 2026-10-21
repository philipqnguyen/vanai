require 'minitest/autorun'
require_relative '../../lib/vanai/data'

# Where a brand-new character first stands: Character::START_CITIES (server) and
# zones.json `start` (shared data, which also carries the facing the client's
# arrival.ts turns them to -- the server keeps no facing). Philip's rulings CF-23
# and CF-24 (2026-10-08/09): in Caerdun, on the open quay at the foot of the covered
# Wall Stair, looking up it at the harbour gate (the Sea Gate) and the city; Heartwood
# starts where and as it always did. Moonmere's start is its own session's (it sets
# zones.json moonmere.start at its merge), so it is not held here. DB-free: the model is read as
# text (it needs Rails).
class StartCitiesTest < Minitest::Test
  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
    @model = File.read(File.expand_path('../../app/models/character.rb', __dir__))
  end

  def start_city(city)
    m = @model.match(/"#{city}"\s*=>\s*\{ x: (-?[\d.]+), z: (-?[\d.]+) \}/)
    assert m, "no START_CITIES entry for #{city}"
    [m[1].to_f, m[2].to_f]
  end

  def test_start_cities_are_the_zones_starts
    %w[caerdun heartwood].each do |city|
      start = Vanai::Data.zones.fetch(city).fetch('start')
      assert_equal [start['x'].to_f, start['z'].to_f], start_city(city), city
      assert start.key?('h'), "#{city}: a start says which way it faces"
    end
  end

  def test_heartwood_starts_where_and_as_it_did
    { 'heartwood' => [-280.0, 2.0] }.each do |city, at|
      z = Vanai::Data.zones.fetch(city)
      assert_equal at, start_city(city)
      assert_equal at, [z['spawn']['x'].to_f, z['spawn']['z'].to_f], "#{city}: start and spawn coincide"
      assert_equal 0, z['start']['h'], "#{city}: north, the camera's old fixed look"
    end
  end

  def test_caerdun_starts_on_the_quay_below_the_wall_stair_facing_the_gate_and_apart_from_the_spawn
    z = Vanai::Data.zones.fetch('caerdun')
    start = z.fetch('start')
    spawn = z.fetch('spawn')
    refute_equal [start['x'], start['z']], [spawn['x'], spawn['z']], 'CF-23/24 is not the CF-22 arrival'
    layout = JSON.parse(File.read(File.expand_path('../../../client/src/caerdun-fortress-layout.json', __dir__)))
    g = layout.fetch('civic').fetch('seagate')
    stair = layout.fetch('harbour').fetch('wallStair').fetch('flight')
    foot = stair.fetch('from')
    # on the quay (the strip, below the stair's foot), in front of it on its line, a few metres off
    dx = foot[0] - start['x']
    assert_operator dx, :>, 5, 'the start stands out on the quay before the stair\'s foot'
    assert_operator dx, :<, 30, 'and in sight of it'
    assert_operator (start['z'] - foot[2]).abs, :<, stair['half'], 'on the stair\'s line'
    # facing the gate: h is the heading from the start to the gate's middle
    to_gate = Math.atan2(g['x'] - start['x'], g['z'] - start['z'])
    assert_in_delta to_gate, start['h'], 1e-3
    # the camera looks up (CF-24: the gate and the city over the sea wall in frame)
    assert_operator start['camera_beta'], :>, Math::PI / 2, 'the arrival camera looks up at the gate'
  end
end
