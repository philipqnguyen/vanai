ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'ostruct'
require 'action_dispatch/testing/integration'

# Audit 2, "sec-locks": the reproductions. Each test fails on the code as it
# stands and should pass once its finding is fixed. The world is stubbed as in
# security_economy_test.rb; a "rival" commits what a parallel action would
# have, once, just before this request's Character#lock!.
class Audit2SecLocksTest < Minitest::Test
  W = Vanai::World
  Body = Struct.new(:char_id, :name, :x, :z) do
    def alive? = true
    def job = 'PLD'
    def dist_to(x, z) = Math.hypot(self.x - x, self.z - z)
  end

  module RivalBeforeLock
    def lock!(*args, **opts)
      rival = Thread.current[:audit2_sec_locks_rival]
      Thread.current[:audit2_sec_locks_rival] = nil
      rival&.call
      super
    end
  end
  Character.prepend(RivalBeforeLock) unless Character.ancestors.include?(RivalBeforeLock)

  def setup
    raise 'Test database only' unless Rails.env.test?
    @previous = %i[queue online trades trade_invites].to_h { |k| [k, W.instance_variable_get("@#{k}")] }
    @stubbed = %i[find_player to_char recompute broadcast_zone].to_h { |m| [m, W.method(m)] }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@trades, {})
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @sent = Hash.new { |h, k| h[k] = [] }
    sent = @sent
    W.define_singleton_method(:to_char) { |id, payload| sent[id] << payload }
    W.define_singleton_method(:recompute) { |*| }
    W.define_singleton_method(:broadcast_zone) { |*| }
    @bodies = {}
    bodies = @bodies
    W.instance_variable_set(:@online, Class.new(Hash) { define_method(:key?) { |id| bodies.key?(id) } }.new)
    W.define_singleton_method(:find_player) do |id|
      b = bodies[id]
      b && [OpenStruct.new(key: 'caerdun', definition: Vanai::Data.zones.fetch('caerdun')), b]
    end
    @api, @char = player('locks-a@example.invalid', 'Locksa')
  end

  def teardown
    Thread.current[:audit2_sec_locks_rival] = nil
    @stubbed.each { |m, impl| W.define_singleton_method(m, impl) }
    @previous.each { |k, v| W.instance_variable_set("@#{k}", v) }
    ActiveRecord::Base.connection.rollback_transaction
  end

  def player(email, name)
    api = ActionDispatch::Integration::Session.new(Rails.application)
    api.host! 'localhost'
    api.post '/api/register', params: {email: email, password: 'isolated-test-password'}, as: :json
    api.post '/api/characters', params: {name: name, race: 'aedri', job: 'PLD', city: 'caerdun'}, as: :json
    assert_equal 200, api.response.status, api.response.body
    char = Character.find(JSON.parse(api.response.body).dig('character', 'id'))
    api.post "/api/characters/#{char.id}/select", as: :json
    [api, char]
  end

  def rival(&blk) = Thread.current[:audit2_sec_locks_rival] = blk

  # ---- sec-locks-equip-job-check-outside-lock ----

  # A level-12 PLD equips an iron sword. Between the request's job and level
  # checks and its c.lock!, a job change to the level-1 WHM commits (what
  # World.change_job's db block does, world.rb:1124-1129). The WHM cannot wield
  # a sword, so it must not end up in the weapon slot.
  def test_sec_locks_equip_job_check_outside_lock
    @char.job_record('PLD').update!(level: 12)
    sword = @char.inventory_items.create!(item_key: 'iron_sword', qty: 1)
    refute_includes Vanai::Data.eligible_jobs(Vanai::Data.items.fetch('iron_sword')), 'WHM'
    char_id = @char.id
    rival do
      c = Character.find(char_id)
      c.update!(active_job: 'WHM')
      c.unequip_incompatible_job_gear!
    end
    @api.post '/api/game/equip', params: {inventory_item_id: sword.id}, as: :json
    @char.reload
    assert_equal 'WHM', @char.active_job
    assert_nil sword.reload.equipped_slot,
               "the iron sword (PLD-only, level 12) is in the weapon slot of a level-1 #{@char.active_job}"
  end

  # ---- sec-locks-trade-confirm-unbound ----

  # A offers a sword; B, shown it, offers 500 gold and presses Confirm. Before
  # B's confirm reaches the world, A's script empties the offer and confirms.
  # B's confirm, sent for the sword, must not seal the empty trade.
  def test_sec_locks_trade_confirm_unbound
    _api_b, b = player('locks-b@example.invalid', 'Locksb')
    a = @char
    a.update_columns(gold: 0)
    b.update_columns(gold: 500)
    sword = a.inventory_items.create!(item_key: 'iron_sword', qty: 1)
    @bodies[a.id] = Body.new(a.id, a.name, 0.0, 0.0)
    @bodies[b.id] = Body.new(b.id, b.name, 1.0, 0.0)
    W.instance_variable_set(:@trade_invites, {b.id => a.id})
    W.trade_respond(b.id, true)

    W.trade_offer(a.id, 0, [{'inv_id' => sword.id, 'qty' => 1}])
    W.trade_offer(b.id, 500, [])
    seen_by_b = @sent[b.id].reverse.find { |m| m[:t] == 'trade_state' }
    assert_equal 1, seen_by_b[:theirs][:items].size, 'B is shown the sword'

    # A's script, in the moment before B's confirm arrives
    W.trade_offer(a.id, 0, [])
    W.trade_confirm(a.id)
    # B's confirm, for the state B was shown (its revision, should it carry one)
    rev = seen_by_b[:rev]
    rev.nil? ? W.trade_confirm(b.id) : W.trade_confirm(b.id, rev)

    assert_equal 500, b.reload.gold, 'B paid 500 gold for a trade showing nothing from A'
    assert_equal a.id, sword.reload.character_id
  end
end
