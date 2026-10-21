require 'minitest/autorun'
require 'ostruct'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/quests'
require_relative '../../lib/vanai/world'

class QuestProgress
  ACTIVE = 1 unless const_defined?(:ACTIVE)
  COMPLETE = 2 unless const_defined?(:COMPLETE)
end

# A quest naming a "job" belongs to that job's guild: offered, progressed and
# handed in only while that job is active. Walks the real shared data with one
# synthetic guild quest laid over it, and the world's side effects stubbed.
class QuestJobTest < Minitest::Test
  Player = Struct.new(:job, :quests, :level, :gold, :title) do
    def char_id = 1
  end
  Zone = Struct.new(:dirty) do
    def mark_self_dirty(_p) = self.dirty = true
    # the zone's key, for the scenes a quest may set off there (Cutscenes.triggered)
    def key = 'caerdun'
  end
  KEY = 'g_test_pld'

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
    @giver_id = Vanai::Data.quests.fetch('cd1').fetch('giver')
    @giver = Vanai::Data.zones.values.flat_map { |z| z['npcs'] || [] }.find { |n| n['id'] == @giver_id }
    @monster = Vanai::Data.zones.values.flat_map { |z| z['camps'] || [] }.first.fetch('monster')
    Vanai::Data.quests[KEY] = {
      'name' => 'The Oath Test', 'giver' => @giver_id, 'job' => 'PLD', 'min_lvl' => 1,
      'offer' => ['Hold the line.'], 'progress' => ['Not yet.'], 'complete' => ['Held.'],
      'objective' => { 'type' => 'kill', 'targets' => [@monster], 'count' => 1, 'label' => 'Slay one' },
      'rewards' => { 'xp' => 10 },
    }
    @player = Player.new('PLD', {}, 5, 0, nil)
    @zone = Zone.new(false)
    @messages = []
  end

  def teardown
    Vanai::Data.quests.delete(KEY)
  end

  def replace_method(object, name, implementation)
    original = object.method(name)
    object.define_singleton_method(name, &implementation)
    yield
  ensure
    object.define_singleton_method(name, original)
  end

  # every World side effect the quest code reaches for, made inert
  def quietly(&block)
    messages = @messages
    replace_method(Vanai::World, :db, ->(*) {}) do
      replace_method(Vanai::World, :to_char, ->(_id, msg) { messages << msg }) do
        replace_method(Vanai::World, :grant_xp, ->(*) {}) do
          replace_method(Vanai::World, :ferry_status, ->(*) {}, &block)
        end
      end
    end
  end

  def dialog
    quietly { Vanai::Quests.talk(@zone, @player, @giver) }
    @messages.reverse.find { |m| m[:t] == 'npc_dialog' }
  end

  def test_a_guild_quest_is_hidden_from_another_job
    @player.job = 'BLM'
    refute Vanai::Quests.available?(@player, KEY)
    refute_includes dialog[:offers].map { |o| o[:id] }, KEY
    quietly { Vanai::Quests.accept!(@zone, @player, KEY) }
    refute @player.quests.key?(KEY), 'the wrong job cannot take it up by asking directly'
  end

  def test_a_guild_quest_is_offered_to_its_job
    assert Vanai::Quests.available?(@player, KEY)
    assert_includes dialog[:offers].map { |o| o[:id] }, KEY
    quietly { Vanai::Quests.accept!(@zone, @player, KEY) }
    assert_equal QuestProgress::ACTIVE, @player.quests.dig(KEY, 'status')
  end

  def test_switching_job_pauses_progress_and_hand_in
    quietly { Vanai::Quests.accept!(@zone, @player, KEY) }
    @player.job = 'BLM'
    quietly { Vanai::Quests.on_kill(@zone, @player, @monster) }
    assert_equal 0, @player.quests.dig(KEY, 'progress'), 'another job does not advance it'

    @player.job = 'PLD'
    quietly { Vanai::Quests.on_kill(@zone, @player, @monster) }
    assert_equal 1, @player.quests.dig(KEY, 'progress')

    @player.job = 'BLM'
    refute_includes dialog[:turnins].map { |t| t[:id] }, KEY
    quietly { Vanai::Quests.complete!(@zone, @player, KEY) }
    assert_equal QuestProgress::ACTIVE, @player.quests.dig(KEY, 'status'), 'cannot be handed in after switching job'

    @player.job = 'PLD'
    assert_includes dialog[:turnins].map { |t| t[:id] }, KEY
    quietly { Vanai::Quests.complete!(@zone, @player, KEY) }
    assert_equal QuestProgress::COMPLETE, @player.quests.dig(KEY, 'status')
  end

  # a landmark is discovered once, so a reach found while the quest is paused
  # must still count, or the quest could never be finished
  def test_a_reach_found_on_another_job_still_counts
    Vanai::Data.quests[KEY]['objective'] = { 'type' => 'reach', 'targets' => ['lm_test'], 'count' => 1, 'label' => 'Stand there' }
    @player.quests[KEY] = { 'status' => QuestProgress::ACTIVE, 'progress' => 0, 'credited' => [] }
    @player.job = 'BLM'
    quietly { Vanai::Quests.on_discover(@zone, @player, 'lm_test') }
    assert_equal 1, @player.quests.dig(KEY, 'progress')
    quietly { Vanai::Quests.complete!(@zone, @player, KEY) }
    assert_equal QuestProgress::ACTIVE, @player.quests.dig(KEY, 'status'), 'the hand-in still waits for the job'
    @player.job = 'PLD'
    quietly { Vanai::Quests.complete!(@zone, @player, KEY) }
    assert_equal QuestProgress::COMPLETE, @player.quests.dig(KEY, 'status')
  end

  def test_the_world_refuses_a_hand_in_from_the_wrong_job
    quietly { Vanai::Quests.accept!(@zone, @player, KEY) }
    @player.quests[KEY]['progress'] = 1
    @player.job = 'BLM'
    definition = { 'npcs' => [@giver] }
    pair = [OpenStruct.new(definition: definition), @player]
    @player.define_singleton_method(:dist_to) { |*| 0 }
    replace_method(Vanai::World, :find_player, ->(*) { pair }) do
      replace_method(Vanai::World, :npc_refusal, ->(*) {}) do
        quietly { Vanai::World.quest_complete(1, KEY) }
      end
    end
    assert_equal QuestProgress::ACTIVE, @player.quests.dig(KEY, 'status')
    assert_match(/Only a Paladin may hand this in/, @messages.last[:msg])
  end

  def test_the_shipped_quests_validate
    Vanai::Data.quests.delete(KEY)
    assert_empty Vanai::Data.quest_problems
  end

  def test_validation_rejects_an_unknown_job
    Vanai::Data.quests[KEY]['job'] = 'races'
    assert_includes Vanai::Data.quest_problems, 'g_test_pld: job "races" is not a job in jobs.json'
    Vanai::Data.quests[KEY]['job'] = 'WHM'
    assert_empty Vanai::Data.quest_problems
  end

  def test_validation_rejects_a_sanctuary_giver
    trainer = Vanai::Data.zones.values.flat_map { |z| z['npcs'] || [] }.find { |n| n['kind'] == 'sanctuary' }
    Vanai::Data.quests[KEY]['giver'] = trainer['id']
    assert_includes Vanai::Data.quest_problems, "g_test_pld: giver #{trainer['id']} is a sanctuary NPC, which never offers quests"
  end
end
