require 'minitest/autorun'
require 'ostruct'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/quests'
require_relative '../../lib/vanai/world'

class QuestProgress
  ACTIVE = 1 unless const_defined?(:ACTIVE)
  COMPLETE = 2 unless const_defined?(:COMPLETE)
end

# The court heralds (injected into the city zones) read the court's newest
# proclamation through ActiveRecord and their lines from Courts.config (keyed
# off Rails.root), neither of which this database-free test loads. No
# proclamation makes them answer with their idle line from the real courts.json.
unless defined?(::Proclamation)
  class Proclamation
    def self.where(*) = self
    def self.order(*) = self
    def self.first = nil
  end
end
unless Vanai::Courts.respond_to?(:config)
  # Courts::Config needs ActiveSupport; the heralds only read data and name.
  courts_json = JSON.parse(File.read(File.expand_path('../../../shared/data/courts.json', __dir__)))
  courts_config = Struct.new(:data) do
    def name(key) = data.fetch('courts').fetch(key).fetch('name')
  end.new(courts_json)
  Vanai::Courts.define_singleton_method(:config) { courts_config }
end

# Every exchange with an NPC is had on the NPC's floor, judged only by the
# server's own floor history (SiteLevels). These walk the real shared data.
class NpcFloorTest < Minitest::Test
  Player = Struct.new(:x, :z, :site_levels, :quests, :level, :hp, :mp, :max_hp, :max_mp) do
    def alive? = true
    def char_id = 1
    # Quests can be job-gated (Quests.job_ok?), so the stand-in needs an active job.
    def job = 'PLD'
    def dist_to(x, z) = Math.hypot(self.x - x, self.z - z)
  end
  SAME_FLOOR = 'Meet them on the same floor.'

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
    @messages = []
  end

  def replace_method(object, name, implementation)
    original = object.method(name)
    object.define_singleton_method(name, &implementation)
    yield
  ensure
    object.define_singleton_method(name, original)
  end

  # Run a World command as this player, capturing what it says back.
  def as_player(zone_key, player)
    pair = [OpenStruct.new(key: zone_key, definition: Vanai::Data.zones.fetch(zone_key)), player]
    def (pair[0]).mark_self_dirty(*) = nil
    messages = @messages
    online = Vanai::World.instance_variable_get(:@online)
    Vanai::World.instance_variable_set(:@online, { 1 => zone_key })
    replace_method(Vanai::World, :find_player, ->(*) { pair }) do
      replace_method(Vanai::World, :to_char, ->(*args, **msg) { messages << (msg.empty? ? args.last : msg) }) do
        replace_method(Vanai::World, :db, ->(*) {}) do
          replace_method(Vanai::Quests, :notify, ->(*) {}) { yield }
        end
      end
    end
  ensure
    Vanai::World.instance_variable_set(:@online, online)
  end

  def player_at(x, z, levels = {}, quests = {})
    Player.new(x, z, levels, quests, 50, 1, 1, 100, 50)
  end

  def site_npcs
    Vanai::Data.zones.flat_map do |zk, z|
      (z['npcs'] || []).select { |n| n['site'] }.map { |n| [zk, z, n] }
    end
  end

  def test_every_site_npc_answers_on_its_floor_and_refuses_every_other
    refute_empty site_npcs
    site_npcs.each do |zk, z, npc|
      site = z['sites'].fetch(npc['site'])
      site['floors'].each_with_index do |y, floor|
        @messages.clear
        as_player(zk, player_at(npc['x'], npc['z'], { npc['site'] => y })) { Vanai::World.talk(1, npc['id']) }
        if floor == npc['floor']
          assert_equal 'npc_dialog', @messages.last[:t], "#{zk}/#{npc['id']} silent on its own floor #{floor}"
        else
          assert_equal SAME_FLOOR, @messages.last[:msg], "#{zk}/#{npc['id']} answered from floor #{floor}"
        end
      end
      # Fresh from the street (no stair climbed): only a ground-floor NPC --
      # or, on a site with a ground-cell atlas, one on the only layer there is
      # to stand on at that spot (Caerdun's sentry on the wall walk, over
      # solid masonry: SiteLevels.ground_at is the walk there)
      @messages.clear
      as_player(zk, player_at(npc['x'], npc['z'])) { Vanai::World.talk(1, npc['id']) }
      answer = @messages.last[:t] == 'npc_dialog' ? :answered : @messages.last[:msg]
      fresh = (Vanai::SiteLevels.ground_at(site, npc['z'], npc['x']) - site['floors'][npc['floor']]).abs < Vanai::SiteLevels::SAME_FLOOR
      assert_equal (fresh ? :answered : SAME_FLOOR), answer, "#{zk}/#{npc['id']} from the street"
    end
  end

  # The homes measured for upstairs residents: climbing their real stair is
  # what earns the upper floor, and the room below never reaches it.
  def test_house_stairs_carry_the_player_up_to_residents
    homes = site_npcs.select { |_, z, n| z['sites'][n['site']]['house_seed'] && n['floor'] > 0 && n['resident'] }
    # (Caerdun's six upstairs residents came down with the old city's houses:
    # the Sea Gate puts them at street level or indoors, ruling CF-6)
    assert_operator homes.length, :>=, 6
    homes.each do |zk, z, npc|
      site = z['sites'][npc['site']]
      x, zz = site['ramps'].first.values_at('x0', 'z0')
      levels = Vanai::SiteLevels.move(z, {}, x, zz, x, zz)
      refute Vanai::SiteLevels.reachable?(z, levels, npc, npc['x'], npc['z']), "#{npc['id']} reached from below"
      site['ramps'].take(npc['floor']).each do |r|
        steps = 40
        1.upto(steps) do |i|
          nx = r['x0'] + (r['x1'] - r['x0']) * i / steps
          nz = r['z0'] + (r['z1'] - r['z0']) * i / steps
          levels = Vanai::SiteLevels.move(z, levels, x, zz, nx, nz); x = nx; zz = nz
        end
        # The next flight rises above this one, from the same foot: walk off
        # the head onto the landing, back along the stairwell's room side and
        # onto the next foot -- straight back down the well would descend.
        nxt = site['ramps'][site['ramps'].index(r) + 1]
        next unless nxt && site['ramps'].index(r) + 1 < npc['floor']
        dx = r['x1'] - r['x0']; dz = r['z1'] - r['z0']; len = Math.hypot(dx, dz)
        px = -dz / len; pz = dx / len
        px, pz = -px, -pz if (site['cx'] - x) * px + (site['cz'] - zz) * pz < 0
        # A next flight that starts elsewhere (the rebuilt Returns Archive's runs
        # from the hall's far end): first on past the head onto the floor
        path = [[x + px * 2.2, zz + pz * 2.2], [nxt['x0'] + px * 2.2, nxt['z0'] + pz * 2.2], [nxt['x0'], nxt['z0']]]
        if Math.hypot(nxt['x0'] - r['x0'], nxt['z0'] - r['z0']) > 3
          fx = x + dx / len * 0.9; fz = zz + dz / len * 0.9
          path = [[fx, fz], [fx + px * 2.2, fz + pz * 2.2], [nxt['x0'] + px * 2.2, nxt['z0'] + pz * 2.2], [nxt['x0'], nxt['z0']]]
        end
        path.each do |tx, tz|
          1.upto(20) do |i|
            nx = x + (tx - x) * i / 20.0; nz = zz + (tz - zz) * i / 20.0
            levels = Vanai::SiteLevels.move(z, levels, x, zz, nx, nz); x = nx; zz = nz
          end
        end
      end
      assert_in_delta site['floors'][npc['floor']], levels[npc['site']], 0.01, "#{npc['id']}: stair did not arrive"
      assert Vanai::SiteLevels.reachable?(z, levels, npc, x, zz), "#{npc['id']} refused at the head of the stair"
    end
  end

  def test_upstairs_player_cannot_deal_with_a_ground_npc_beside_the_house
    z = Vanai::Data.zones.fetch('moonmere')
    site = z['sites'].fetch('mm_house_2723')
    # a ground NPC just outside the wall, inside talking range of the room
    outside = { 'id' => 'probe', 'name' => 'Probe', 'x' => site['cx'] + Math.cos(site['yaw']) * (site['span'] / 2.0 + 1), 'z' => site['cz'] - Math.sin(site['yaw']) * (site['span'] / 2.0 + 1) }
    upstairs = { 'mm_house_2723' => site['floors'][1] }
    refute Vanai::SiteLevels.reachable?(z, upstairs, outside, site['cx'], site['cz'])
    assert Vanai::SiteLevels.reachable?(z, { 'mm_house_2723' => site['floors'][0] }, outside, site['cx'], site['cz'])
    assert Vanai::SiteLevels.reachable?(z, {}, outside, site['cx'], site['cz'])
  end

  # A target with no site inside a site's footprint is on that site's ground
  # layer; were it raised above it, its own floor could never reach it. The
  # canopy overlays keep a stair-foot datum, not terrain, and are measured by
  # tools/data/npc_floor_layers.json instead (tools/data/audit.py).
  def test_unsited_targets_inside_a_site_stand_on_its_ground_layer
    Vanai::Data.zones.each do |zk, z|
      (z['sites'] || {}).each do |sid, site|
        next if site['ground_targets']
        %w[npcs interactables portals nodes milestones].each do |kind|
          (z[kind] || []).each do |t|
            next if t['site'] || t['y'].nil? || !Vanai::SiteLevels.inside?(site, t['x'], t['z'])
            assert_operator t['y'], :<=, Vanai::SiteLevels.ground_at(site, t['z'], t['x']) + 0.65,
                            "#{zk}/#{t['id']} stands above #{sid}'s ground with no site floor"
          end
        end
      end
    end
  end

  def test_quest_accept_needs_the_giver_on_the_same_floor
    z = Vanai::Data.zones.fetch('moonmere')
    key, quest = Vanai::Data.quests.find { |_, q| q['giver'] == 'archivist_junn_mm' && (q['min_lvl'] || 1) <= 50 }
    skip 'no Moonmere archive quest' unless key
    giver = z['npcs'].find { |n| n['id'] == 'archivist_junn_mm' }
    accepted = []
    replace_method(Vanai::Quests, :accept!, ->(_z, _p, k) { accepted << k }) do
      as_player('moonmere', player_at(giver['x'], giver['z'], { giver['site'] => z['sites'][giver['site']]['floors'][1] })) { Vanai::World.quest_accept(1, key) }
      assert_empty accepted
      assert_equal SAME_FLOOR, @messages.last[:msg]
      as_player('moonmere', player_at(giver['x'] + 20, giver['z'])) { Vanai::World.quest_accept(1, key) }
      assert_empty accepted
      assert_equal 'Too far away.', @messages.last[:msg]
      as_player('moonmere', player_at(giver['x'], giver['z'])) { Vanai::World.quest_accept(1, key) }
      assert_equal [key], accepted
    end
    assert quest
  end

  def test_talk_objective_on_an_upper_floor_credits_only_from_that_floor
    z = Vanai::Data.zones.fetch('moonmere')
    npc = z['npcs'].find { |n| n['id'] == 'mm_resident_sorrel_quire' } || site_npcs.find { |zk, _, n| zk == 'moonmere' && n['floor'] > 0 }[2]
    quest = { 'name' => 'Probe', 'giver' => 'archivist_junn_mm', 'objective' => { 'type' => 'talk', 'targets' => [npc['id']], 'count' => 1 },
              'complete' => ['Done.'], 'progress' => ['Not yet.'], 'offer' => ['Go.'] }
    completed = []
    replace_method(Vanai::Data, :quests, -> { { 'probe_q' => quest } }) do
      replace_method(Vanai::Quests, :complete!, ->(_z, _p, k) { completed << k }) do
        below = player_at(npc['x'], npc['z'], {}, { 'probe_q' => { 'status' => 1, 'progress' => 0, 'credited' => [] } })
        as_player('moonmere', below) { Vanai::World.talk(1, npc['id']) }
        assert_empty completed
        assert_equal SAME_FLOOR, @messages.last[:msg]
        above = player_at(npc['x'], npc['z'], { npc['site'] => z['sites'][npc['site']]['floors'][npc['floor']] },
                          { 'probe_q' => { 'status' => 1, 'progress' => 0, 'credited' => [] } })
        as_player('moonmere', above) { Vanai::World.talk(1, npc['id']) }
        assert_equal ['probe_q'], completed
      end
    end
  end

  def test_trainer_jobs_need_the_trainers_floor
    z = Vanai::Data.zones.fetch('moonmere')
    trainer = z['npcs'].find { |n| n['kind'] == 'sanctuary' }
    assert trainer['site'], 'the Moonmere trainer stands in the Mending College'
    upstairs = { trainer['site'] => z['sites'][trainer['site']]['floors'][1] }
    # The model is outside this plain-Ruby test; only its job list is read
    # before the refusal.
    stubbed = !Object.const_defined?(:Character)
    Object.const_set(:Character, Module.new.tap { |m| m.const_set(:JOBS, %w[PLD SAM]) }) if stubbed
    as_player('moonmere', player_at(trainer['x'], trainer['z'], upstairs)) { Vanai::World.change_job(1, 'SAM') }
    assert_equal SAME_FLOOR, @messages.last[:msg]
  ensure
    Object.send(:remove_const, :Character) if stubbed
  end

  def test_rest_counters_ask_the_same_question_as_talk
    z = Vanai::Data.zones.fetch('caerdun')
    vendor = z['npcs'].find { |n| n['kind'] == 'vendor' }
    broker = z['npcs'].find { |n| n['kind'] == 'auction' }
    as_player('caerdun', player_at(vendor['x'] + 1, vendor['z'])) do
      assert_nil Vanai::World.npc_refusal_for(1, npc_id: vendor['id'])
      assert_equal 'Too far away.', Vanai::World.npc_refusal_for(1, npc_id: broker['id']) unless Math.hypot(vendor['x'] - broker['x'], vendor['z'] - broker['z']) < 9
    end
    as_player('caerdun', player_at(broker['x'], broker['z'])) do
      assert_nil Vanai::World.npc_refusal_for(1, kind: 'auction')
    end
    # an upstairs player in a building beside a counter is through a floor
    # (the Sea Gate's court hall: its old house sites went with the old city)
    home = z['sites'].find { |_, s| s['floors'].length > 1 && s['span'] }
    sid, site = home
    probe = { 'id' => 'probe', 'kind' => 'vendor', 'x' => site['cx'], 'z' => site['cz'] }
    replace_method(Vanai::Data, :zones, -> { { 'caerdun' => z.merge('npcs' => [probe]) } }) do
      as_player('caerdun', player_at(site['cx'], site['cz'], { sid => site['floors'][1] })) do
        assert_equal SAME_FLOOR, Vanai::World.npc_refusal_for(1, npc_id: 'probe')
      end
    end
    # not in the world (no cable session): nobody is beside the counter
    assert_equal 'Speak with them in person.', Vanai::World.npc_refusal_for(1, npc_id: vendor['id'])
  end

  # The auction house is a building with several brokers' counters (Philip,
  # 2026-10-11), every one opening the same shared house: a trade is struck at
  # whichever counter the player stands at, and refused only beside none of them.
  def test_every_broker_counter_opens_the_auction_house
    z = Vanai::Data.zones.fetch('caerdun')
    brokers = z['npcs'].select { |n| n['kind'] == 'auction' }
    assert_operator brokers.length, :>=, 3, "Caerdun's Exchange has a broker at each counter"
    brokers.each do |b|
      # across the counter from them, out on the hall's floor (the broker's 2 m in front)
      as_player('caerdun', player_at(b['x'], b['z'] + 2.0)) do
        assert_nil Vanai::World.npc_refusal_for(1, kind: 'auction'), "#{b['id']}'s counter"
        assert_nil Vanai::World.npc_refusal_for(1, npc_id: b['id'])
      end
    end
    # in the yard 30 m out from the house: no counter in reach
    as_player('caerdun', player_at(brokers.first['x'], brokers.first['z'] + 30)) do
      assert_equal 'Too far away.', Vanai::World.npc_refusal_for(1, kind: 'auction')
    end
    # and every city's house has as many: the kind's question takes any of them
    Vanai::Data.zones.each do |zk, zd|
      next unless (zd['npcs'] || []).count { |n| n['kind'] == 'auction' } > 1
      zd['npcs'].select { |n| n['kind'] == 'auction' }.each do |b|
        as_player(zk, player_at(b['x'], b['z'])) { assert_nil Vanai::World.npc_refusal_for(1, kind: 'auction'), "#{zk} #{b['id']}" }
      end
    end
  end
end
