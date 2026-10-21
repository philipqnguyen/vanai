ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'stringio'
require 'action_dispatch/testing/integration'

# Audit round two, "sec-thin": each test fails on the code it was written
# against because of the finding it is named after, and passes once the fix
# lands. The world is driven directly, as in security_realtime_test.rb.
class Audit2SecThinWorldTest < Minitest::Test
  W = Vanai::World

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
    @user = User.create!(email: 'audit2-sec-thin@example.invalid', password: 'isolated-test-password')
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

  def me(id) = W.find_player(id)&.last

  # ---------- sec-thin-dead-revives-after-hold ----------

  def test_sec_thin_dead_revives_after_hold
    char = make_char('Fallen')
    W.join(char.id, session_id: 'first')
    me(char.id).dead = true
    me(char.id).hp = 0
    W.leave(char.id, session_id: 'first') # the tab closes
    # ten minutes and a second later (or a restart, which empties the hold)
    W.kept_vitals[char.id][:at] -= W.singleton_class::VITALS_HOLD + 1
    W.join(char.id, session_id: 'second')
    ps = me(char.id)
    assert_equal 'caerdun', W.instance_variable_get(:@online)[char.id]
    assert ps.dead || [ps.x, ps.z] != [79.0, -18.0],
           "a dead character came back alive at #{ps.hp}/#{ps.max_hp} HP where they fell, without a release"
  end

  def test_sec_thin_dead_revives_after_restart
    char = make_char('Fallentwo')
    W.join(char.id, session_id: 'first')
    me(char.id).dead = true
    me(char.id).hp = 0
    W.leave(char.id, session_id: 'first')
    W.kept_vitals.clear # a deploy: the hold is process memory
    W.join(char.id, session_id: 'second')
    ps = me(char.id)
    assert ps.dead || [ps.x, ps.z] != [79.0, -18.0],
           "after a restart a dead character stands up at #{ps.hp}/#{ps.max_hp} HP where they fell"
  end

  # Review: a Raise the row has not heard of yet (no save since the fall) and
  # a leave that writes no row (a ferry departure) must not lay them down
  # again: the kept record is newer than the row.
  def test_review_raise_before_unsaved_leave_stays_up
    char = make_char('Raisedup')
    W.join(char.id, session_id: 'first')
    me(char.id).dead = true
    me(char.id).hp = 0
    W.persist_position(me(char.id), 'caerdun') # the periodic save sees the fall
    me(char.id).dead = false # a Raise
    me(char.id).hp = 100
    W.leave(char.id, session_id: 'first', persist: false)
    W.join(char.id, session_id: 'second')
    refute me(char.id).dead, 'a raised character rejoined dead off a row older than the world'
  end

  # ---------- sec-thin-cutscene-replay-teleport ----------

  def test_sec_thin_cutscene_replay_teleport
    id = 'story_regent_walls'
    mark = Vanai::Data.cutscenes.fetch(id).fetch('mark')
    spawn = Vanai::Data.zones['burnedland']['spawn']
    char = make_char('Replayer', x: spawn['x'], z: spawn['z'], zone: 'burnedland')
    W.join(char.id)
    ps = me(char.id)
    ps.cutscenes_seen << id
    start = [ps.x, ps.z]
    assert_operator Math.hypot(start[0] - mark[0], start[1] - mark[1]), :>, 300
    W.cutscene_begin(char.id, id)
    assert_equal id, ps.cutscene, @messages.inspect
    W.cutscene_end(char.id, id) # at once
    moved = Math.hypot(ps.x - start[0], ps.z - start[1])
    assert_operator moved, :<, 1.0,
                    "a replay begun and ended at once moved the player #{moved.round} m to the mark (#{ps.x}, #{ps.z})"
  end

  # ---------- sec-thin-trade-double-membership ----------

  def test_sec_thin_trade_double_membership
    a = make_char('Trada', x: 79)
    b = make_char('Tradb', x: 80)
    c = make_char('Tradc', x: 81)
    [a, b, c].each { |ch| W.join(ch.id) }
    W.trade_invite(a.id, 'Tradb')
    W.trade_invite(a.id, 'Tradc')
    W.trade_respond(b.id, true)
    W.trade_respond(c.id, true)
    held = W.instance_variable_get(:@trades).values.count { |t| t[:a] == a.id || t[:b] == a.id }
    assert_operator held, :<=, 1, "A is in #{held} trades at once"
  end

  # ---------- sec-thin-party-seat-held-forever ----------

  def test_sec_thin_party_seat_held_forever
    lead = make_char('Leada', x: 79)
    b = make_char('Membb', x: 80)
    c = make_char('Membc', x: 81)
    W.join(lead.id, session_id: 'lead-old')
    W.join(b.id, session_id: 'b')
    W.join(c.id, session_id: 'c')
    W.party_invite(lead.id, 'Membb')
    W.party_respond(b.id, true)
    W.party_invite(lead.id, 'Membc')
    W.party_respond(c.id, true)
    party = W.parties[me(lead.id).party_id]
    assert_equal [lead.id, b.id, c.id].sort, party.member_ids.sort
    # the leader steps through a portal and closes the tab on the loading screen
    portal = Vanai::Data.zones['caerdun']['portals'].find { |p| p['id'] == 'cd_fields' }
    W.travel(lead.id, portal)
    W.leave(lead.id, session_id: 'lead-old') # the old channel's unsubscribe
    W.reap_party_grace(Vanai.now + W::PARTY_GRACE * 10)
    refute_equal lead.id, party.leader_id, 'the lead stays with a character who is gone, long after PARTY_GRACE'
  end
end

# ---------- sec-thin-equip-job-change-race ----------

# The rival (the world thread's change_job) commits between equip's job and
# level checks and its lock, as in security_economy_test.rb.
class Audit2SecThinEquipTest < Minitest::Test
  module RivalBeforeLock
    def lock!(*args, **opts)
      rival = Thread.current[:audit2_sec_thin_rival]
      Thread.current[:audit2_sec_thin_rival] = nil
      rival&.call
      super
    end
  end
  Character.prepend(RivalBeforeLock) unless Character.ancestors.include?(RivalBeforeLock)

  def setup
    raise 'Test database only' unless Rails.env.test?
    @previous_queue = Vanai::World.instance_variable_get(:@queue)
    Vanai::World.instance_variable_set(:@queue, Queue.new)
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @api = ActionDispatch::Integration::Session.new(Rails.application)
    @api.host! 'localhost'
    @api.post '/api/register', params: {email: 'audit2-equip@example.invalid', password: 'isolated-test-password'}, as: :json
    @api.post '/api/characters', params: {name: 'Racequip', race: 'aedri', job: 'PLD', city: 'caerdun'}, as: :json
    assert_equal 200, @api.response.status, @api.response.body
    @character = Character.find(JSON.parse(@api.response.body).dig('character', 'id'))
    @character.character_jobs.where(job: 'PLD').update_all(level: 40)
    @api.post "/api/characters/#{@character.id}/select", as: :json
  end

  def teardown
    Thread.current[:audit2_sec_thin_rival] = nil
    Vanai::World.instance_variable_set(:@queue, @previous_queue)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def test_sec_thin_equip_job_change_race
    blade = @character.inventory_items.create!(item_key: 'tideworn_blade', qty: 1) # a level-34 sword
    id = @character.id
    # World.change_job's writes, as it makes them: no lock, its own commit
    Thread.current[:audit2_sec_thin_rival] = lambda do
      changed = Character.find(id)
      changed.update!(active_job: 'BLM')
      changed.unequip_incompatible_job_gear!
    end
    @api.post '/api/game/equip', params: {inventory_item_id: blade.id}, as: :json
    assert_nil Thread.current[:audit2_sec_thin_rival], 'the rival ran'
    assert_equal 'BLM', @character.reload.active_job
    assert_nil blade.reload.equipped_slot,
               "a level-1 BLM is wielding a level-34 sword (response #{@api.response.body[0, 80]})"
  end
end
