ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'

# The three Border Gates out of the cities' field zones onto the doorstep
# provinces stay shut for a character until that character has finished inn2,
# "Letters of Passage" (Philip, 2026-10-12); the Capital's gate, the other
# gated portal, keeps its own behaviour. Real characters in the test database
# (rolled back), joined to the in-memory world and walked through
# World.interact and travel, with no world thread running.
class BorderGateIntegrationTest < Minitest::Test
  W = Vanai::World
  GATES = { 'cf_gate' => %w[caerdunfields huntingwood], 'hf_gate' => %w[heartwoodfields timberestates],
            'ms_gate' => %w[moonmereshores summerlakes] }.freeze

  def setup
    raise 'Test database only' unless Rails.env.test?
    # The whole suite can boot the world's thread before this file loads (the
    # ordering that errors FerryIntegrationTest); a live tick would race these
    # direct calls, so the run is skipped then -- test/vanai/border_gate_test.rb
    # walks the same rule without the database or the thread, in every run.
    @skipped = W.instance_variable_get(:@thread)&.alive?
    skip 'a world thread is running in this process' if @skipped
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @saved = %i[@zones @parties @online @party_grace @sessions @queue @trades @gate_prompts].to_h { |iv| [iv, W.instance_variable_get(iv)] }
    %i[zones parties online party_grace sessions trades gate_prompts].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.initialize_ferry
    @messages = []
    @original_send = W.method(:to_char)
    test = self
    W.define_singleton_method(:to_char) { |id, payload| test.instance_variable_get(:@messages) << [id, payload] }
    @user = User.create!(email: 'border-gate-test@example.invalid', password: 'isolated-test-password')
    @serial = 0
  end

  def teardown
    return if @skipped
    W.define_singleton_method(:to_char, @original_send)
    @saved.each { |iv, v| W.instance_variable_set(iv, v) }
    ActiveRecord::Base.connection.rollback_transaction
  end

  # a character standing at a portal's own spot, with a journal of its own
  def at_portal(zone_key, portal_id, done: [], active: [])
    @serial += 1
    c = Character.provision!(user: @user, name: "Gatewalker#{%w[a b c d e f g h][@serial]}", job: 'PLD')
    portal = portal(zone_key, portal_id)
    c.update!(zone: zone_key, x: portal['x'], z: portal['z'] + 1)
    done.each { |k| c.quest_progresses.create!(quest_key: k, status: QuestProgress::COMPLETE, progress: 1) }
    active.each { |k| c.quest_progresses.create!(quest_key: k, status: QuestProgress::ACTIVE, progress: 0) }
    W.join(c.id)
    c
  end

  def portal(zone_key, id) = Vanai::Data.zones.fetch(zone_key).fetch('portals').find { |p| p['id'] == id }
  def said(c) = @messages.select { |id, p| id == c.id && p[:t] == 'system' }.map { |_, p| p[:msg] }
  def moves(c) = @messages.select { |id, p| id == c.id && p[:t] == 'zone_change' }.map { |_, p| p.slice(:zone, :x, :z) }

  def test_the_three_gates_name_inn2_in_data
    GATES.each do |id, (from, to)|
      p = portal(from, id)
      assert_equal 'inn2', p['gate_quest'], id
      assert_equal to, p['to'], id
      assert_nil p['to_done'], "#{id} is a lock, not a second city"
    end
    # the doorstep sides' return gates stay ungated
    { 'huntingwood' => 'hw_gate', 'timberestates' => 'te_gate', 'summerlakes' => 'sl_gate' }.each do |zk, id|
      assert_nil portal(zk, id)['gate_quest'], id
    end
  end

  def test_each_gate_refuses_a_character_without_inn2
    GATES.each do |id, (from, _)|
      c = at_portal(from, id, done: %w[inn1], active: %w[inn2])
      W.interact(c.id, id)
      assert_empty moves(c), id
      assert_equal from, c.reload.zone, id
      assert_equal 'The Border Gate stays barred. The wardens stand back only for an envoy who has carried the Letters of Passage.',
                   said(c).last, id
    end
  end

  def test_each_gate_lets_a_character_with_inn2_through
    GATES.each do |id, (from, to)|
      c = at_portal(from, id, done: %w[inn1 inn2])
      W.interact(c.id, id)
      p = portal(from, id)
      assert_equal [{ zone: to, x: p['tx'], z: p['tz'] }], moves(c), id
      assert_equal to, c.reload.zone, id
    end
  end

  def test_a_party_member_with_inn2_does_not_carry_one_without
    done = at_portal('caerdunfields', 'cf_gate', done: %w[inn2])
    shut = at_portal('caerdunfields', 'cf_gate')
    party = Vanai::Party.new('pt_gate', done.id)
    party.member_ids = [done.id, shut.id]
    W.instance_variable_get(:@parties)['pt_gate'] = party
    [done, shut].each { |c| W.find_player(c.id).last.party_id = 'pt_gate' }
    W.interact(shut.id, 'cf_gate')
    assert_empty moves(shut)
    assert_match(/stays barred/, said(shut).last)
    W.interact(done.id, 'cf_gate')
    assert_equal 'huntingwood', moves(done).last[:zone]
    assert_equal 'caerdunfields', shut.reload.zone
  end

  def test_the_capitals_gate_is_unchanged
    bl = portal('burnedland', 'bl_capital')
    before = at_portal('burnedland', 'bl_capital', active: %w[cap3])
    W.interact(before.id, 'bl_capital')
    assert_empty moves(before)
    assert_equal 'The gates are sealed. Warden Morrow keeps the way in.', said(before).last
    after = at_portal('burnedland', 'bl_capital', done: %w[cap3])
    W.interact(after.id, 'bl_capital')
    assert_match(/The gates stand open/, said(after).last)
    assert_equal [{ zone: 'capitalreturned', x: bl['tx'], z: bl['tz'] }], moves(after)
    # and Warden Morrow still keeps it, while no Border Gate has a keeper
    morrow = Vanai::Data.zones['burnedland']['npcs'].find { |n| n['gate'] == 'bl_capital' }
    assert_equal bl, W.gate_portal(Vanai::Data.zones['burnedland'], morrow)
    GATES.each do |id, (from, _)|
      assert_nil W.gate_portal(Vanai::Data.zones[from], { 'gate' => id }), "#{id} opens no empty city"
    end
  end
end
