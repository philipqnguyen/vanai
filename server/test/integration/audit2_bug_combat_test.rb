ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'stringio'
require 'action_dispatch/testing/integration'

# Audit round two, combat: each test is named after the finding it proves and
# fails on the code as it stood when the finding was made.
class Audit2BugCombatTest < Minitest::Test
  W = Vanai::World
  C = Vanai::Combat

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades].each { |key| W.instance_variable_set("@#{key}", {}) }
    @previous_queue = W.instance_variable_get(:@queue)
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@next_party_id, 0)
    W.initialize_ferry
    @messages = []
    @broadcasts = []
    test = self
    @original_send = W.method(:to_char)
    @original_broadcast = W.method(:broadcast_zone)
    W.define_singleton_method(:to_char) { |id, payload = nil, **kw| test.instance_variable_get(:@messages) << [id, payload || kw] }
    W.define_singleton_method(:broadcast_zone) { |key, payload| test.instance_variable_get(:@broadcasts) << [key, payload] }
    @log = StringIO.new
    @original_logger = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(@log)
    @user = User.create!(email: 'audit2-bug-combat@example.invalid', password: 'isolated-test-password')
  end

  def teardown
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    Rails.logger = @original_logger
    W.define_singleton_method(:to_char, @original_send)
    W.define_singleton_method(:broadcast_zone, @original_broadcast)
    W.instance_variable_set(:@queue, @previous_queue)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def make_char(name, job: 'PLD', level: 1, x: 79, z: -18, zone: 'caerdun')
    c = Character.provision!(user: @user, name: name, job: job, city: 'caerdun')
    c.update!(x: x, z: z, zone: zone)
    c.character_jobs.where(job: job).update_all(level: level)
    c
  end

  def online(c)
    W.join(c.id)
    W.find_player(c.id)
  end

  # ---------- bug-combat-boss-adds-hash-iteration ----------

  def test_bug_combat_boss_adds_hash_iteration
    c = make_char('Bossfight', level: 24, x: 64, z: 112, zone: 'mausoleum')
    z, ps = online(c)
    boss = z.monsters.values.find { |m| m.key == 'the_warden_of_the_mausoleum' }
    ps.x, ps.z = boss.x, boss.z
    boss.state = :aggro
    boss.enmity[ps.id] = 100
    boss.hp = (boss.max_hp * 0.5).round
    before = z.monsters.size
    error = begin
      z.tick_monsters(Vanai.now)
      nil
    rescue => e
      e
    end
    assert_nil error, "the boss's tick raised #{error&.class}: #{error&.message}"
    assert_equal before + 2, z.monsters.size, 'two adds answer the 66% call'
    spawns = @broadcasts.count { |_, p| p[:t] == 'monster_spawn' }
    assert_equal 2, spawns
  end

  # ---------- bug-combat-sleep-idle-enmity-stuck ----------

  def test_bug_combat_sleep_idle_enmity_stuck
    c = make_char('Sleeper', job: 'BLM', level: 12, zone: 'caerdunfields', x: -258, z: 48)
    z, ps = online(c)
    hare = z.monsters.values.find { |m| m.key == 'meadow_hare' && m.state == :idle }
    ps.x, ps.z = hare.x + 10, hare.z
    C.execute_spell(z, ps, hare, Vanai::Data.abilities['sleep'])
    t = Vanai.now
    10.times { |i| z.tick_monsters(t + i * 3.0) }
    stuck = W.in_combat?(z, ps) && z.monsters.values.none? { |m| m.alive? && m.state == :aggro && m.enmity[ps.id].to_i > 0 }
    refute stuck, "in combat with nothing fighting them: #{hare.key} is #{hare.state} with enmity #{hare.enmity.inspect}"
    @messages.clear
    W.teleport_home(c.id)
    refute @messages.any? { |_, p| p[:msg].to_s.include?('Not while something wants you dead') },
           'Return Home refused by an idle monster they only sang to'
  end

  # ---------- bug-combat-heal-enmity-bystanders ----------

  def test_bug_combat_heal_enmity_bystanders
    fighter = make_char('Fighter', level: 5, zone: 'caerdunfields', x: -258, z: 48)
    bystander = make_char('Bystander', level: 5, zone: 'caerdunfields', x: -228, z: 48)
    z, a = online(fighter)
    _, b = online(bystander)
    x = z.monsters.values.find { |m| m.key == 'meadow_hare' }
    a.x, a.z = x.x + 1, x.z
    b.x, b.z = x.x + 30, x.z
    C.aggro!(z, x, a)
    x.enmity[a.id] = 50
    b.hp = b.max_hp - 30
    potion = bystander.inventory_items.create!(item_key: 'potion', qty: 1)
    C.use_item(z, b, potion.id)
    assert_equal b.max_hp, b.hp, 'the potion worked'
    refute x.enmity.key?(b.id) && x.enmity[b.id] > 0,
           "a stranger's potion put them on #{x.key}'s list (#{x.enmity.inspect})"
    refute W.in_combat?(z, b), 'a bystander who drank a potion is now in combat'
  end

  # ---------- bug-combat-dead-state-expires ----------

  def with_clock_offset(seconds)
    original = Vanai.method(:now)
    Vanai.define_singleton_method(:now) { original.call + seconds }
    yield
  ensure
    Vanai.define_singleton_method(:now, original)
  end

  def test_bug_combat_dead_state_expires_after_the_hold
    c = make_char('Fallen', level: 24, x: 64, z: 112, zone: 'mausoleum')
    _, ps = online(c)
    ps.hp = 0
    ps.dead = true
    ps.xp_lost = 40
    W.leave(c.id) # the tab closes
    with_clock_offset(W.singleton_class::VITALS_HOLD + 60) do
      W.join(c.id)
      _, back = W.find_player(c.id)
      assert back.dead, 'eleven minutes offline and they stand up where they fell'
      assert_equal 0, back.hp
    end
  end

  def test_bug_combat_dead_state_lost_on_restart
    c = make_char('Fallen', level: 24, x: 64, z: 112, zone: 'mausoleum')
    _, ps = online(c)
    ps.hp = 0
    ps.dead = true
    W.leave(c.id)
    W.kept_vitals.clear # a deploy: the process's memory is gone
    W.join(c.id)
    _, back = W.find_player(c.id)
    assert back.dead, 'a restart raises the dead where they fell'
  end

  # ---------- bug-combat-equip-jobchange-toctou ----------

  module JobChangeBeforeLock
    class << self; attr_accessor :pending; end
    def lock!(*args, **kw)
      if (job = JobChangeBeforeLock.pending)
        JobChangeBeforeLock.pending = nil
        # exactly World.change_job's db block, committing in the window
        # between equip's checks and its lock
        other = Character.find(id)
        other.update!(active_job: job)
        other.unequip_incompatible_job_gear!
      end
      super
    end
  end
  Character.prepend(JobChangeBeforeLock)

  def test_bug_combat_equip_jobchange_toctou
    api = ActionDispatch::Integration::Session.new(Rails.application)
    api.host! 'localhost'
    api.post '/api/register', params: { email: 'audit2-equip@example.invalid', password: 'isolated-test-password' }, as: :json
    api.post '/api/characters', params: { name: 'Racer', race: 'aedri', job: 'WHM', city: 'caerdun' }, as: :json
    char = Character.find(JSON.parse(api.response.body).dig('character', 'id'))
    char.character_jobs.where(job: 'WHM').update_all(level: 10)
    api.post "/api/characters/#{char.id}/select", as: :json
    robe = char.inventory_items.create!(item_key: 'calling_whm_10_body', qty: 1)
    JobChangeBeforeLock.pending = 'BLM'
    api.post '/api/game/equip', params: { inventory_item_id: robe.id }, as: :json
    char.reload
    assert_equal 'BLM', char.active_job
    worn = char.equipped.map(&:item_key)
    refute_includes worn, 'calling_whm_10_body', "a level-1 BLM is wearing the WHM's level-10 robe"
  ensure
    JobChangeBeforeLock.pending = nil
  end

  # ---------- bug-combat-boss-state-not-reset ----------

  def test_bug_combat_boss_state_not_reset_silence_on_pull
    c = make_char('Wiper', level: 24, x: 64, z: 112, zone: 'mausoleum')
    z, ps = online(c)
    boss = z.monsters.values.find { |m| m.key == 'the_warden_of_the_mausoleum' }
    ps.x, ps.z = boss.x, boss.z
    t0 = Vanai.now
    boss.state = :aggro
    boss.enmity[ps.id] = 100
    z.tick_monsters(t0)
    assert_nil boss.telegraph, 'the first fight opens with 12 s of grace'
    z.reset_monster(boss) # the party wipes
    boss.state = :aggro   # the next party pulls a minute later
    boss.enmity[ps.id] = 100
    z.tick_monsters(t0 + 60)
    assert_nil boss.telegraph, 'the Silence starts on the first tick of the next pull'
  end

  def test_bug_combat_boss_state_not_reset_adds
    z = W.zone('mausoleum')
    boss = z.monsters.values.find { |m| m.key == 'the_warden_of_the_mausoleum' }
    boss.adds_done[66] = true # the last group had it under 66%
    z.reset_monster(boss)
    assert_empty boss.adds_done, 'a boss back at full HP will call no household for the next group'
  end

  # ---------- bug-combat-inflicts-data-ignored ----------

  def test_bug_combat_inflicts_data_ignored
    c = make_char('Poisoned', level: 28, zone: 'furnacehall', x: 0, z: 0)
    z, ps = online(c)
    slime = Vanai::MonsterState.new('m_test', 'cinder_slime', 28, ps.x, ps.z)
    sure = Object.new
    def sure.rand(*) = 0.0
    original = C.instance_variable_get(:@rng)
    C.instance_variable_set(:@rng, sure)
    begin
      C.inflict_ailment(z, slime, ps)
    ensure
      C.instance_variable_set(:@rng, original)
    end
    poison = ps.buffs.find { |b| b[:kind] == 'poison' }
    inf = Vanai::Data.monsters['cinder_slime']['inflicts']
    assert poison
    assert_equal inf['dmg'], poison[:power], 'monsters.json says 3 a tick'
    assert_equal inf['dur'].to_f, poison[:duration], 'monsters.json says 10 s'
  end

  # ---------- bug-combat-finish-cast-no-recheck ----------

  def test_bug_combat_finish_cast_no_recheck
    c = make_char('Midcast', job: 'WHM', level: 26, x: 22, z: -48)
    z, ps = online(c)
    assert_equal 'WHM', ps.job
    C.use_ability(z, ps, 'cure_iii', nil)
    assert ps.casting, 'Cure III is being cast'
    W.change_job(c.id, 'MNK')
    assert_equal 'MNK', ps.job
    assert ps.max_mp < Vanai::Data.abilities['cure_iii']['mp'], 'the new job cannot pay for it'
    ps.casting[:ends_at] = Vanai.now - 0.01 if ps.casting
    C.finish_cast(z, ps) if ps.casting
    assert ps.mp >= 0, "MP went to #{ps.mp}"
  end
end
