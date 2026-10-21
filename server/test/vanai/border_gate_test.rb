ENV['RAILS_ENV'] ||= 'test'
# the app, for the real QuestProgress constants (a stand-in class breaks the
# model for an integration test loaded after it); nothing here touches the
# database, and the world's thread boots only under `rails server`
require_relative '../../config/environment'
require 'minitest/autorun'
require 'ostruct'

# The three Border Gates shut until inn2 (Philip, 2026-10-12), walked through
# the real World.interact and travel over the real zones.json, with the
# player lookup, departure and persistence stubbed: no database and no world
# thread, so it runs in every order. test/integration/border_gate_test.rb is
# the same rule over real characters in the test database.
class BorderGateTest < Minitest::Test
  Player = Struct.new(:char_id, :name, :x, :z, :site_levels, :quests, :party_id) do
    def alive? = true
    def dist_to(x, z) = Math.hypot(self.x - x, self.z - z)
  end

  GATES = { 'cf_gate' => %w[caerdunfields huntingwood], 'hf_gate' => %w[heartwoodfields timberestates],
            'ms_gate' => %w[moonmereshores summerlakes] }.freeze

  def setup = Vanai::Data.load!(File.expand_path('../..', __dir__))

  def replace_method(name, implementation)
    original = Vanai::World.method(name)
    Vanai::World.define_singleton_method(name, &implementation)
    yield
  ensure
    Vanai::World.define_singleton_method(name, original)
  end

  # interact with a portal standing on its spot; the messages sent
  def interact(zone_key, portal_id, quests)
    definition = Vanai::Data.zones.fetch(zone_key)
    portal = definition['portals'].find { |p| p['id'] == portal_id }
    pair = [OpenStruct.new(definition: definition, key: zone_key), Player.new(1, 'P1', portal['x'], portal['z'] + 1, {}, quests, nil)]
    messages = []
    replace_method(:find_player, ->(*) { pair }) do
      replace_method(:to_char, ->(id, payload) { messages << payload }) do
        replace_method(:leave, ->(*, **) {}) do
          replace_method(:db, ->(&_) {}) { Vanai::World.interact(1, portal_id) }
        end
      end
    end
    [portal, messages]
  end

  def test_each_gate_refuses_without_inn2_and_admits_with_it
    GATES.each do |id, (from, to)|
      _, shut = interact(from, id, { 'inn1' => { 'status' => 2 }, 'inn2' => { 'status' => 1 } })
      assert_equal [{ t: 'system', msg: 'The Border Gate stays barred. The wardens stand back only for an envoy who has carried the Letters of Passage.' }], shut, id
      portal, open = interact(from, id, { 'inn2' => { 'status' => 2 } })
      assert_equal [{ t: 'zone_change', zone: to, x: portal['tx'], z: portal['tz'] }], open, id
    end
  end

  def test_the_capitals_gate_is_unchanged
    _, shut = interact('burnedland', 'bl_capital', { 'cap3' => { 'status' => 1 } })
    assert_equal [{ t: 'system', msg: 'The gates are sealed. Warden Morrow keeps the way in.' }], shut
    portal, open = interact('burnedland', 'bl_capital', { 'cap3' => { 'status' => 2 } })
    assert_equal({ t: 'system', msg: 'The gates stand open. Beyond them, the city is awake.' }, open.first)
    assert_equal({ t: 'zone_change', zone: 'capitalreturned', x: portal['tx'], z: portal['tz'] }, open.last)
  end

  def test_only_a_two_city_gate_has_a_keeper
    morrow = Vanai::Data.zones['burnedland']['npcs'].find { |n| n['gate'] == 'bl_capital' }
    assert_equal 'bl_capital', Vanai::World.gate_portal(Vanai::Data.zones['burnedland'], morrow)['id']
    GATES.each do |id, (from, _)|
      assert_nil Vanai::World.gate_portal(Vanai::Data.zones[from], { 'gate' => id }), id
    end
  end
end
