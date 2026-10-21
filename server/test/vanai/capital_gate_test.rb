require 'minitest/autorun'
require 'ostruct'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/quests'
require_relative '../../lib/vanai/entities'
require_relative '../../lib/vanai/world'

class QuestProgress
  ACTIVE = 1 unless const_defined?(:ACTIVE)
  COMPLETE = 2 unless const_defined?(:COMPLETE)
end

# The Capital's two ways in (Philip's ruling 2026-10-04): the gate portal opens
# only for a character who has finished cap3 and takes them alone to the
# returned city; Warden Morrow sends a party -- every online member agreeing --
# into the empty city whatever their journals say. Walks the real Burned Land
# data with the world's persistence and travel stubbed.
class CapitalGateTest < Minitest::Test
  Player = Struct.new(:char_id, :name, :x, :z, :site_levels, :quests, :party_id) do
    def alive? = true
    def level = 45
    def job = 'PLD'
    def dist_to(x, z) = Math.hypot(self.x - x, self.z - z)
  end

  DONE = { 'cap3' => { 'status' => 2 } }.freeze

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
    @definition = Vanai::Data.zones.fetch('burnedland')
    @portal = @definition['portals'].find { |p| p['id'] == 'bl_capital' }
    @morrow = @definition['npcs'].find { |n| n['id'] == 'morrow_gates' }
    @zone = OpenStruct.new(definition: @definition, key: 'burnedland')
    @players = {}
    @messages = []
    @trips = []
    @saved = %i[@online @parties @gate_prompts].to_h { |iv| [iv, Vanai::World.instance_variable_get(iv)] }
    Vanai::World.instance_variable_set(:@online, {})
    Vanai::World.instance_variable_set(:@parties, {})
    Vanai::World.instance_variable_set(:@gate_prompts, {})
  end

  def teardown
    @saved.each { |iv, v| Vanai::World.instance_variable_set(iv, v) }
  end

  def add_player(id, x, z, quests = {})
    @players[id] = Player.new(id, "P#{id}", x, z, {}, quests.dup, nil)
    Vanai::World.instance_variable_get(:@online)[id] = 'burnedland'
    @players[id]
  end

  def party_of(*ids)
    party = Vanai::Party.new('pt1', ids.first)
    party.member_ids = ids
    ids.each { |id| @players[id].party_id = 'pt1' }
    Vanai::World.instance_variable_get(:@parties)['pt1'] = party
    party
  end

  def replace_method(object, name, implementation)
    original = object.method(name)
    object.define_singleton_method(name, &implementation)
    yield
  ensure
    object.define_singleton_method(name, original)
  end

  def world
    players = @players
    zone = @zone
    messages = @messages
    trips = @trips
    replace_method(Vanai::World, :find_player, ->(cid) { players[cid] && [zone, players[cid]] }) do
      replace_method(Vanai::World, :to_char, ->(*args, **msg) { messages << [args.first, msg.empty? ? args.last : msg] }) do
        replace_method(Vanai::World, :travel, ->(cid, portal) { trips << [cid, portal['to'], portal['tx'], portal['tz']] }) do
          yield
        end
      end
    end
  end

  def to(id) = @messages.select { |cid, _| cid == id }.map(&:last)

  def at_gate(id, quests = {}) = add_player(id, @portal['x'], @portal['z'] - 2, quests)
  def at_morrow(id, quests = {}) = add_player(id, @morrow['x'] + 1, @morrow['z'], quests)

  def test_morrow_keeps_the_gate_in_data
    assert_equal 'bl_capital', @morrow['gate']
    assert_equal 'cap3', @portal['gate_quest']
    assert_equal 'capital', @portal['to']
    assert_equal 'capitalreturned', @portal['to_done']
  end

  def test_the_portal_is_refused_before_cap3
    at_gate(1, { 'cap3' => { 'status' => 1 } })
    world { Vanai::World.interact(1, 'bl_capital') }
    assert_empty @trips
    assert_equal 'The gates are sealed. Warden Morrow keeps the way in.', to(1).last[:msg]
    assert_empty Vanai::World.instance_variable_get(:@gate_prompts), 'no party prompt from the portal'
  end

  def test_the_portal_takes_a_finished_character_to_the_returned_city
    at_gate(1, DONE)
    world { Vanai::World.interact(1, 'bl_capital') }
    assert_equal [[1, 'capitalreturned', @portal['tx'], @portal['tz']]], @trips
    assert_match(/The gates stand open/, to(1).last[:msg])
  end

  def test_the_portal_takes_one_party_member_alone_without_asking_the_others
    at_gate(1)       # the leader, who has not finished
    at_gate(2, DONE) # a member who has
    party_of(1, 2)
    world { Vanai::World.interact(2, 'bl_capital') }
    assert_equal [[2, 'capitalreturned', @portal['tx'], @portal['tz']]], @trips
    assert_empty to(1), 'the rest of the party is not asked'
    assert_empty Vanai::World.instance_variable_get(:@gate_prompts)
  end

  def test_the_leader_finished_still_goes_alone
    at_gate(1, DONE)
    at_gate(2)
    party_of(1, 2)
    world { Vanai::World.interact(1, 'bl_capital') }
    assert_equal [[1, 'capitalreturned', @portal['tx'], @portal['tz']]], @trips
    world { Vanai::World.interact(2, 'bl_capital') }
    assert_equal 1, @trips.size, 'the member who has not finished stays sealed out'
  end

  def test_morrow_offers_the_way_in_in_her_dialog
    at_morrow(1)
    world do
      replace_method(Vanai::World, :db, ->(*) {}) { Vanai::World.talk(1, 'morrow_gates') }
    end
    dialog = to(1).find { |m| m[:t] == 'npc_dialog' }
    assert dialog[:gate], 'the dialog carries the gate action'
  end

  def test_morrow_sends_a_finished_party_into_the_empty_city_after_everyone_agrees
    at_morrow(1, DONE)
    at_morrow(2, DONE)
    party = party_of(1, 2)
    world { Vanai::World.gate_enter(1, 'morrow_gates') }
    prompts = [1, 2].map { |id| to(id).find { |m| m[:t] == 'gate_confirm' } }
    assert prompts.all?, 'every member is asked'
    assert_equal 'Warden Morrow', prompts.first[:by]
    assert_empty prompts.first[:pending], 'all have finished; the way in is the same'
    refute prompts.first[:solo]

    world { Vanai::World.gate_respond(1, true) }
    assert_empty @trips, 'one accept is not enough'
    world { Vanai::World.gate_respond(2, true) }
    assert_equal [[1, 'capital', @portal['tx'], @portal['tz']], [2, 'capital', @portal['tx'], @portal['tz']]], @trips.sort
    assert_equal 'capital', party.capital_version
  end

  def test_a_member_who_arrives_later_follows_the_party_in
    at_morrow(1)
    add_player(2, 200, 200) # elsewhere in the zone when the party agrees
    party_of(1, 2)
    world do
      Vanai::World.gate_enter(1, 'morrow_gates')
      Vanai::World.gate_respond(1, true)
      Vanai::World.gate_respond(2, true)
    end
    assert_equal [[1, 'capital', @portal['tx'], @portal['tz']]], @trips
    # the server closes the prompt for both: silently for the one who travels,
    # with the reason for the one left behind (whose card would otherwise sit
    # at "Waiting for the party..." until the client's timer)
    assert_equal({ t: 'gate_closed' }, to(1).last)
    assert_equal 'gate_closed', to(2).last[:t]
    assert_match(/Warden Morrow will send you after them/, to(2).last[:msg])
    @players[2].x, @players[2].z = @morrow['x'] - 1, @morrow['z']
    world { Vanai::World.gate_enter(2, 'morrow_gates') }
    assert_equal [2, 'capital', @portal['tx'], @portal['tz']], @trips.last
  end

  def test_a_leader_who_drifted_off_follows_the_party_in
    at_morrow(1)
    at_morrow(2)
    party = party_of(1, 2)
    world do
      Vanai::World.gate_enter(1, 'morrow_gates')
      Vanai::World.gate_respond(2, true)
      @players[1].x, @players[1].z = 200, 200 # walks off before answering
      Vanai::World.gate_respond(1, true)
    end
    assert_equal [[2, 'capital', @portal['tx'], @portal['tz']]], @trips
    Vanai::World.instance_variable_get(:@online)[2] = 'capital'
    @players[1].x, @players[1].z = @morrow['x'] - 1, @morrow['z']
    @messages.clear
    world { Vanai::World.gate_enter(1, 'morrow_gates') }
    assert_equal [1, 'capital', @portal['tx'], @portal['tz']], @trips.last
    refute @messages.any? { |_, m| m[:t] == 'gate_confirm' }, 'no second vote for a party already inside'
    assert_equal 'capital', party.capital_version
  end

  def test_only_the_leader_can_ask
    at_morrow(1)
    at_morrow(2)
    party_of(1, 2)
    world { Vanai::World.gate_enter(2, 'morrow_gates') }
    assert_empty @trips
    assert_match(/waits on your party leader/, to(2).last[:msg])
    refute to(1).any? { |m| m[:t] == 'gate_confirm' }
  end

  def test_one_decline_and_nobody_goes
    at_morrow(1)
    at_morrow(2)
    party = party_of(1, 2)
    world do
      Vanai::World.gate_enter(1, 'morrow_gates')
      Vanai::World.gate_respond(1, true)
      Vanai::World.gate_respond(2, false)
    end
    assert_empty @trips
    assert_nil party.capital_version
    assert to(1).any? { |m| m[:t] == 'gate_closed' }
  end

  def test_a_solo_player_gets_one_prompt_finished_or_not
    [{}, DONE].each_with_index do |quests, i|
      id = 10 + i
      at_morrow(id, quests)
      world do
        Vanai::World.gate_enter(id, 'morrow_gates')
        prompt = to(id).find { |m| m[:t] == 'gate_confirm' }
        assert prompt[:solo]
        Vanai::World.gate_respond(id, true)
      end
      assert_equal [id, 'capital', @portal['tx'], @portal['tz']], @trips.last
    end
  end

  def test_morrow_must_be_reached
    add_player(1, @morrow['x'] + 30, @morrow['z'])
    world { Vanai::World.gate_enter(1, 'morrow_gates') }
    assert_empty @trips
    assert_equal 'Too far away.', to(1).last[:msg]
  end

  def test_an_npc_without_a_gate_opens_nothing
    sabel = @definition['npcs'].find { |n| n['id'] == 'sabel_gates' }
    add_player(1, sabel['x'], sabel['z'])
    world { Vanai::World.gate_enter(1, 'sabel_gates') }
    assert_empty @messages
    assert_empty @trips
  end
end
