# Sample the real server spawn/respawn methods without booting Rails or a world.
# ruby tools/qa/glassworks_spawns.rb > /tmp/glassworks-spawns.json
require 'json'
require 'ostruct'
require_relative '../../server/lib/vanai/zone_state'

module Vanai
  module Combat
    def self.rng = (@rng ||= Random.new(8433))
  end
  module Stats
    def self.monster_sheet(*) = { 'hp' => 1 }
  end
  module World
    def self.broadcast_zone(*) = nil
  end
  class MonsterState < OpenStruct
    def initialize(mid, key, level, x, z, camp)
      super(mid: mid, key: key, level: level, x: x, z: z, camp: camp,
            enmity: {}, sheet: {}, spawn_x: x, spawn_z: z)
    end
    def public_payload = {}
  end
end

zone = JSON.parse(File.read(File.expand_path('../../shared/data/zones.json', __dir__))).fetch('glassworks')
state = Vanai::ZoneState.allocate
state.instance_variable_set(:@key, 'glassworks')
state.instance_variable_set(:@definition, zone)
state.instance_variable_set(:@next_mid, 0)
state.instance_variable_set(:@monsters, {})
results = zone.fetch('camps').each_with_index.map do |camp, index|
  points = 1000.times.flat_map do
    monster = state.spawn_monster(camp)
    spawn = [monster.x, monster.z]
    state.respawn(monster)
    [spawn, [monster.x, monster.z]]
  end
  { index: index, monster: camp['monster'], x: camp['x'], z: camp['z'], radius: camp['radius'], points: points }
end
puts JSON.generate(results)
