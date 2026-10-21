ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'stringio'

# Audit round two, bug-quests: each test fails on the code as found and should
# pass once its finding is fixed. The world harness is audit2_bug_social_test.rb's.
class Audit2BugQuestsWorldTest < Minitest::Test
  W = Vanai::World
  # a key the 2026-08-31 story pivot removed from quests.json
  RETIRED = 'act1_3'

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades trade_invites].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@next_party_id, 0)
    W.initialize_ferry
    @messages = []
    test = self
    @original_send = W.method(:to_char)
    W.define_singleton_method(:to_char) { |id, payload = nil, **kw| test.instance_variable_get(:@messages) << [id, payload || kw] }
    @log = StringIO.new
    @original_logger = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(@log)
    @user = User.create!(email: 'audit2-bug-quests@example.invalid', password: 'isolated-test-password')
  end

  def teardown
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    Rails.logger = @original_logger
    W.define_singleton_method(:to_char, @original_send)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def make_char(name, x: 79, z: -18, zone: 'caerdun')
    c = Character.provision!(user: @user, name: name, job: 'PLD', city: 'caerdun')
    c.update!(x: x, z: z, zone: zone)
    c
  end

  def to(id) = @messages.select { |cid, _| cid == id }.map(&:last)

  def stale_row(c, status)
    refute Vanai::Data.quests.key?(RETIRED), 'the key really is retired'
    QuestProgress.create!(character_id: c.id, quest_key: RETIRED, status: status, progress: 0)
  end

  # An active row for a retired key: join raises in Quests.notify and stops
  # before the party, scenes, mail badge and courts.
  def test_bug_quests_retired_quest_key_crash_join
    c = make_char('Oldjoin')
    stale_row(c, QuestProgress::ACTIVE)
    W.join(c.id, session_id: 's1')
    assert(to(c.id).any? { |p| p[:t] == 'quest_log' }, 'join reached the quest log')
  rescue NoMethodError => e
    flunk "join raised on a retired quest key: #{e.message}"
  end

  # Talking to any NPC (a vendor here) raises in Quests.talk's first loop.
  def test_bug_quests_retired_quest_key_crash_talk
    c = make_char('Oldtalk', x: -54, z: -34)
    stale_row(c, QuestProgress::ACTIVE)
    char = Character.includes(:character_jobs, :inventory_items, :quest_progresses, :discoveries).find(c.id)
    ps = Vanai::PlayerState.new(char)
    zone = W.zone('caerdun')
    npc = zone.definition['npcs'].find { |n| n['id'] == 'armourer_brann' }
    Vanai::Quests.talk(zone, ps, npc)
    assert(to(c.id).any? { |p| p[:t] == 'npc_dialog' }, 'the vendor answered')
  rescue NoMethodError => e
    flunk "talk raised on a retired quest key: #{e.message}"
  end

  # Even a COMPLETED retired row breaks every drop roll for a party holding it.
  def test_bug_quests_retired_quest_key_crash_drop_roll
    c = make_char('Olddrop')
    stale_row(c, QuestProgress::COMPLETE)
    W.join(c.id, session_id: 's1')
    zone, ps = W.find_player(c.id)
    assert ps, 'joined'
    got = Vanai::Combat.pick_recipient(zone, [ps], 'glimmer_band')
    assert_equal ps, got
  rescue NoMethodError => e
    flunk "pick_recipient raised on a retired quest key: #{e.message}"
  end

  # Clicking the job already held at a trainer is no job change, yet it plays
  # (and spends) the one-time guild scene and resets TP.
  def test_bug_quests_same_job_change_plays_guild_scene
    c = make_char('Samejob', x: 20, z: -50.5)
    W.join(c.id, session_id: 's1')
    _, ps = W.find_player(c.id)
    assert_equal 'PLD', ps.job
    ps.tp = 500
    @messages.clear
    W.change_job(c.id, 'PLD')
    scenes = to(c.id).select { |p| p[:t] == 'cutscene' }.map { |p| p[:id] }
    assert_empty scenes, "re-taking the held job played #{scenes.inspect}"
    assert_equal 500, ps.tp, 'TP was reset by a no-op job change'
  end

  # pick_recipient counts a worn ring as held, so the member whose collect
  # quest still needs one in the bags is not preferred for the drop.
  def test_bug_quests_client_collect_counts_equipped_pick_recipient
    a = make_char('Wearer'); b = make_char('Bystand')
    QuestProgress.create!(character_id: a.id, quest_key: 's_caer_4', status: QuestProgress::ACTIVE, progress: 0)
    InventoryItem.create!(character_id: a.id, item_key: 'glimmer_band', qty: 1, equipped_slot: 'ring1')
    W.join(a.id, session_id: 'sa'); W.join(b.id, session_id: 'sb')
    zone, pa = W.find_player(a.id)
    _, pb = W.find_player(b.id)
    refute Vanai::Quests.objective_met?(pa, 's_caer_4'), 'the server hand-in sees no ring in the bags'
    picks = Array.new(40) { Vanai::Combat.pick_recipient(zone, [pa, pb], 'glimmer_band') }
    assert(picks.all? { |p| p.equal?(pa) }, "the drop went to the bystander #{picks.count { |p| p.equal?(pb) }} of 40 times")
  end
end
