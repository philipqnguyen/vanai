ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'action_dispatch/testing/integration'

class JobGearIntegrationTest < Minitest::Test
  def setup
    raise 'Test database only' unless Rails.env.test?
    # Exercise real equip requests without starting a second authoritative world.
    @previous_queue = Vanai::World.instance_variable_get(:@queue)
    Vanai::World.instance_variable_set(:@queue, Queue.new)
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @api = ActionDispatch::Integration::Session.new(Rails.application)
    @api.host! 'localhost'
    @api.post '/api/register', params: {email: 'job-gear-test@example.invalid', password: 'isolated-test-password'}, as: :json
    @api.post '/api/characters', params: {name: 'Gearcheck', race: 'aedri', job: 'WHM', city: 'caerdun'}, as: :json
    assert_equal 200, @api.response.status
    @character = Character.find(JSON.parse(@api.response.body).dig('character','id'))
    @character.character_jobs.update_all(level: 10)
    @api.post "/api/characters/#{@character.id}/select", as: :json
  end

  def teardown
    Vanai::World.instance_variable_set(:@queue, @previous_queue)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def equip(row)
    @api.post '/api/game/equip', params: {inventory_item_id: row.id}, as: :json
    JSON.parse(@api.response.body)
  end

  def test_same_material_wrong_job_rejected_and_correct_job_accepted
    black = @character.inventory_items.create!(item_key: 'calling_blm_10_body', qty: 1)
    white = @character.inventory_items.create!(item_key: 'calling_whm_10_body', qty: 1)
    assert equip(black)['error']
    assert_nil black.reload.equipped_slot
    assert equip(white)['ok']
    assert_equal 'body', white.reload.equipped_slot
    higher = @character.inventory_items.create!(item_key: 'calling_whm_20_head', qty: 1)
    assert equip(higher)['error']
    assert_nil higher.reload.equipped_slot
  end

  def test_switching_preserves_item_but_removes_wrong_job_bonus_and_look
    row = @character.inventory_items.create!(item_key: 'calling_whm_10_head', qty: 1, equipped_slot: 'head')
    @character.update!(active_job: 'BLM')
    @character.unequip_incompatible_job_gear!
    assert_nil row.reload.equipped_slot
    assert_equal 1, row.qty
    state = Vanai::PlayerState.new(@character.reload)
    refute_equal row.item_key, state.look['h']
    expected = Vanai::Stats.sheet(race: 'aedri', job: 'BLM', level: 10, equipped: @character.equipped.map(&:definition))
    assert_equal expected, state.sheet
    assert @character.inventory_items.exists?(row.id)
  end

  def test_switching_also_removes_generic_gear_the_new_job_cannot_use
    sword = @character.inventory_items.create!(item_key: 'worn_sword', qty: 1, equipped_slot: 'weapon')
    mail = @character.inventory_items.create!(item_key: 'gatewarden_coif', qty: 1, equipped_slot: 'head')
    ring = @character.inventory_items.create!(item_key: 'hunters_ring', qty: 1, equipped_slot: 'ring')
    @character.update!(active_job: 'BLM')
    @character.unequip_incompatible_job_gear!
    assert_nil sword.reload.equipped_slot, 'a staff job keeps no sword in hand'
    assert_nil mail.reload.equipped_slot, 'cloth jobs cannot wear chain'
    assert_equal 'ring', ring.reload.equipped_slot, 'rings are open to every job'
    assert_equal 3, @character.inventory_items.where(id: [sword.id, mail.id, ring.id]).count
  end
end
