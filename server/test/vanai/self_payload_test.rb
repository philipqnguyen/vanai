require 'minitest/autorun'
require 'ostruct'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/entities'
require_relative '../../lib/vanai/combat'
require_relative '../../lib/vanai/world'

# The client's ability timers and its effect row come only from self_payload,
# so it must carry every cooldown still running, the GCD, and for each effect
# what it is and how long it lasts. Drives the real combat code with the
# world's side effects stubbed and a bare PlayerState (no database).
class SelfPayloadTest < Minitest::Test
  Zone = Struct.new(:dirty, :events) do
    def mark_self_dirty(_p) = self.dirty += 1
    def push_event(ev) = events << ev
  end

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
    @p = Vanai::PlayerState.allocate
    { char_id: 1, name: 'Tester', job: 'PLD', level: 50, xp: 0, gold: 0, dead: false,
      hp: 500, mp: 200, tp: 0, buffs: [], cooldowns: {}, gcd_at: 0.0, casting: nil,
      x: 0.0, z: 0.0, sheet: { 'max_hp' => 500, 'max_mp' => 200 } }.each do |k, v|
      @p.instance_variable_set("@#{k}", v)
    end
    @zone = Zone.new(0, [])
  end

  def replace_method(object, name, implementation)
    original = object.method(name)
    object.define_singleton_method(name, &implementation)
    yield
  ensure
    object.define_singleton_method(name, original)
  end

  def quietly(&block)
    replace_method(Vanai::World, :to_char, ->(*) {}, &block)
  end

  def test_using_an_ability_reports_its_cooldown_the_gcd_and_its_buff
    sentinel = Vanai::Data.abilities.fetch('sentinel')
    quietly { Vanai::Combat.use_ability(@zone, @p, 'sentinel', nil) }
    assert_operator @zone.dirty, :>=, 1, 'the use marks self dirty, so the timers go out this tick'
    pl = @p.self_payload
    cd = pl[:cooldowns].fetch('sentinel')
    assert_in_delta sentinel.fetch('cd'), cd, 0.11
    assert_in_delta Vanai::Combat::GCD, pl[:gcd], 0.11
    buff = pl[:buffs].find { |b| b[:name] == 'Sentinel' }
    assert_equal 'buff_def', buff[:kind]
    assert_equal sentinel.fetch('duration').to_f, buff[:duration]
    assert_in_delta sentinel.fetch('duration'), buff[:remain], 0.11
    assert_equal false, buff[:harm]
  end

  def test_an_ailment_is_harm_with_its_full_duration
    monster = OpenStruct.new(level: 10, definition: { 'inflicts' => { 'kind' => 'poison', 'chance' => 1.0 } })
    quietly { Vanai::Combat.inflict_ailment(@zone, monster, @p) }
    buff = @p.self_payload[:buffs].first
    assert_equal({ name: 'Poison', kind: 'poison', harm: true, duration: Vanai::Combat::AILMENT_DURATION },
                 buff.slice(:name, :kind, :harm, :duration))
    assert_in_delta Vanai::Combat::AILMENT_DURATION, buff[:remain], 0.11
  end

  def test_spent_cooldowns_are_left_out_and_pruned
    now = Vanai.now
    @p.cooldowns['provoke'] = now - 1
    @p.cooldowns['rampart'] = now + 30
    pl = @p.self_payload
    assert_equal ['rampart'], pl[:cooldowns].keys
    assert_equal 0, pl[:gcd]
    refute @p.cooldowns.key?('provoke'), 'the spent entry does not linger in the hash'
  end

  def test_a_refused_press_resends_the_timers
    @p.gcd_at = Vanai.now + 1
    quietly { Vanai::Combat.use_ability(@zone, @p, 'sentinel', nil) }
    assert_equal 1, @zone.dirty
    assert_empty @p.buffs
  end
end
