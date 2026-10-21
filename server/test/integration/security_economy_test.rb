ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'ostruct'
require 'action_dispatch/testing/integration'

# The economy's writes under their locks: a merchant's sale, a craft, an
# equip, an auction listing and the mail, each with a rival request landing in
# the moment between its first look and its lock. The rival is played by a
# hook on Character#lock! that runs once, just before the lock is taken, and
# commits what a parallel request would have. Each test fails on the code that
# read its rows before the lock. Also the account's limits: characters per
# account, how fast they are made, and one mail allowance for every character
# on the account. The world is stubbed as in mail_auction_test.rb.
class SecurityEconomyTest < Minitest::Test
  W = Vanai::World
  Body = Struct.new(:x, :z, :site_levels, :quests, :level, :hp, :mp, :max_hp, :max_mp) do
    def alive? = true
    def job = 'PLD'
    def dist_to(x, z) = Math.hypot(self.x - x, self.z - z)
  end

  # Runs the pending rival once, on the next Character#lock! in this thread.
  module RivalBeforeLock
    def lock!(*args, **opts)
      rival = Thread.current[:security_economy_rival]
      Thread.current[:security_economy_rival] = nil
      rival&.call
      super
    end
  end
  Character.prepend(RivalBeforeLock) unless Character.ancestors.include?(RivalBeforeLock)

  def setup
    raise 'Test database only' unless Rails.env.test?
    @previous = %i[queue online].to_h { |k| [k, W.instance_variable_get("@#{k}")] }
    @find_player = W.method(:find_player)
    @to_char = W.method(:to_char)
    W.instance_variable_set(:@queue, Queue.new)
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    W.define_singleton_method(:to_char) { |*| }
    @where = {}
    where = @where
    W.instance_variable_set(:@online, Class.new(Hash) { define_method(:key?) { |id| where.key?(id) } }.new)
    W.define_singleton_method(:find_player) do |id|
      key, x, z = where[id]
      next nil unless key
      [OpenStruct.new(key: key, definition: Vanai::Data.zones.fetch(key)), Body.new(x, z, {}, {}, 50, 1, 1, 100, 50)]
    end
    @api, @char = player('econ-a@example.invalid', 'Econa')
  end

  def teardown
    Thread.current[:security_economy_rival] = nil
    W.define_singleton_method(:find_player, @find_player)
    W.define_singleton_method(:to_char, @to_char)
    @previous.each { |k, v| W.instance_variable_set("@#{k}", v) }
    ActiveRecord::Base.connection.rollback_transaction
  end

  def player(email, name)
    api = ActionDispatch::Integration::Session.new(Rails.application)
    api.host! 'localhost'
    api.post '/api/register', params: {email: email, password: 'isolated-test-password'}, as: :json
    char = new_character(api, name)
    [api, char]
  end

  def new_character(api, name)
    status, body = call(api, :post, '/api/characters', {name: name, race: 'aedri', job: 'PLD', city: 'caerdun'})
    assert_equal 200, status, body.inspect
    char = Character.find(body.dig('character', 'id'))
    api.post "/api/characters/#{char.id}/select", as: :json
    char
  end

  def call(api, verb, path, params = {})
    api.send(verb, path, params: params, as: verb == :get ? nil : :json)
    [api.response.status, JSON.parse(api.response.body)]
  end

  def npc(id) = Vanai::Data.zones['capitalreturned']['npcs'].find { |n| n['id'] == id }

  def stand_at(char, npc_id)
    n = npc(npc_id)
    char.update_columns(zone: 'capitalreturned')
    @where[char.id] = ['capitalreturned', n['x'] - 1.0, n['z']]
  end

  # what a parallel request commits between this one's first look and its lock
  def rival(&blk) = Thread.current[:security_economy_rival] = blk

  def sell(row) = call(@api, :post, '/api/game/vendor', {npc_id: 'market_potions', op: 'sell', inventory_item_id: row.id})

  def sell_value(key)
    item = Vanai::Data.items.fetch(key)
    item['price_sell'] || (item['price'].to_i * 0.25).round
  end

  # ---- the merchant ----

  def test_a_sell_whose_piece_was_sold_meanwhile_pays_nothing
    stand_at(@char, 'market_potions')
    row = @char.inventory_items.create!(item_key: 'antidote', qty: 1)
    value = sell_value('antidote')
    gold = @char.reload.gold
    # the parallel sell of the same piece commits first, and is paid
    rival do
      InventoryItem.where(id: row.id).delete_all
      Character.where(id: @char.id).update_all(['gold = gold + ?', value])
    end
    status, body = sell(row)
    assert_equal 200, status
    assert_equal 'No such item.', body['error']
    assert_equal gold + value, @char.reload.gold, 'one piece is paid for once'
  end

  def test_a_sell_from_a_stack_takes_from_what_a_rival_left
    stand_at(@char, 'market_potions')
    row = @char.inventory_items.create!(item_key: 'antidote', qty: 3)
    value = sell_value('antidote')
    gold = @char.reload.gold
    rival do
      InventoryItem.where(id: row.id).update_all('qty = qty - 1')
      Character.where(id: @char.id).update_all(['gold = gold + ?', value])
    end
    status, body = sell(row)
    assert_equal [200, true], [status, body['ok']], body.inspect
    assert_equal 1, row.reload.qty, 'two sold, two taken'
    assert_equal gold + 2 * value, @char.reload.gold
  end

  def test_a_bought_potion_joins_the_stack_under_its_lock
    stand_at(@char, 'market_potions')
    row = @char.inventory_items.find_by!(item_key: 'potion', equipped_slot: nil)
    @char.update_columns(gold: 1_000)
    locked = []
    watch = ->(*, payload) { locked << payload[:sql] if payload[:sql] =~ /FROM "inventory_items".*FOR UPDATE/m }
    status, body = ActiveSupport::Notifications.subscribed(watch, 'sql.active_record') do
      call(@api, :post, '/api/game/vendor', {npc_id: 'market_potions', op: 'buy', item_key: 'potion'})
    end
    assert_equal [200, true], [status, body['ok']], body.inspect
    assert_equal 4, row.reload.qty
    refute_empty locked, 'the stack is read FOR UPDATE before it is merged into'
  end

  # ---- crafting ----

  def test_a_craft_whose_materials_were_used_meanwhile_makes_nothing
    @char.inventory_items.create!(item_key: 'sprite_dust', qty: 2)
    # the parallel craft of the same recipe takes the dust first
    rival { InventoryItem.where(character_id: @char.id, item_key: 'sprite_dust').delete_all }
    status, body = call(@api, :post, '/api/craft', {recipe_id: 'al_ether'})
    assert_equal 422, status
    assert_match(/You need 2/, body['error'])
    refute @char.inventory_items.exists?(item_key: 'ether'), 'no ether from dust already spent'
  end

  def test_a_second_craft_from_one_set_is_refused
    @char.inventory_items.create!(item_key: 'sprite_dust', qty: 2)
    assert_equal 200, call(@api, :post, '/api/craft', {recipe_id: 'al_ether'}).first
    status, body = call(@api, :post, '/api/craft', {recipe_id: 'al_ether'})
    assert_equal 422, status
    assert_match(/have 0/, body['error'])
    assert_equal 1, @char.inventory_items.where(item_key: 'ether').sum(:qty)
  end

  def test_a_crafted_consumable_joins_its_stack
    @char.inventory_items.create!(item_key: 'sprite_dust', qty: 4)
    @char.inventory_items.create!(item_key: 'ether', qty: 2)
    2.times { assert_equal 200, call(@api, :post, '/api/craft', {recipe_id: 'al_ether'}).first }
    assert_equal [4], @char.inventory_items.where(item_key: 'ether').pluck(:qty)
    refute @char.inventory_items.exists?(item_key: 'sprite_dust')
  end

  def test_crafting_needs_a_character
    api = ActionDispatch::Integration::Session.new(Rails.application)
    api.host! 'localhost'
    status, body = call(api, :post, '/api/craft', {recipe_id: 'al_ether'})
    assert_equal 401, status
    assert_equal 'Not signed in.', body['error']
  end

  # ---- equipment ----

  def test_an_equip_whose_piece_went_meanwhile_is_refused
    ring = @char.inventory_items.create!(item_key: ring_key, qty: 1)
    rival { InventoryItem.where(id: ring.id).delete_all }
    status, body = call(@api, :post, '/api/game/equip', {inventory_item_id: ring.id})
    assert_equal 404, status
    assert_equal 'No such item.', body['error']
  end

  def test_one_piece_per_slot
    a = @char.inventory_items.create!(item_key: ring_key, qty: 1)
    b = @char.inventory_items.create!(item_key: ring_key, qty: 1)
    # the parallel equip of the other ring commits first
    rival { InventoryItem.where(id: b.id).update_all(equipped_slot: 'ring') }
    assert_equal 200, call(@api, :post, '/api/game/equip', {inventory_item_id: a.id}).first
    assert_equal [a.id], @char.inventory_items.where(equipped_slot: 'ring').pluck(:id)
  end

  # a ring any job wears, once the character is level enough for it
  def ring_key
    key = 'hunters_ring'
    @char.job_record.update!(level: [Vanai::Data.items.fetch(key)['lvl'].to_i, 1].max)
    key
  end

  # ---- the auction house ----

  def list(row, qty = 1) = call(@api, :post, '/api/auction/list', {inventory_item_id: row.id, price: 5, qty: qty})

  def test_the_listing_limit_counts_a_listing_made_meanwhile
    stand_at(@char, 'broker_imperial')
    rows = Array.new(AuctionListing::LIMIT) { @char.inventory_items.create!(item_key: 'antidote', qty: 1) }
    rows.first(AuctionListing::LIMIT - 1).each { |r| assert_equal 200, list(r).first }
    # the parallel listing takes the last place first
    rival { AuctionListing.create!(seller: @char, item_key: 'antidote', qty: 1, price: 5, status: AuctionListing::ACTIVE) }
    status, body = list(rows.last)
    assert_equal 200, status
    assert_match(/at most #{AuctionListing::LIMIT}/, body['error'])
    assert_equal AuctionListing::LIMIT, AuctionListing.where(seller_id: @char.id, status: AuctionListing::ACTIVE).count
    assert InventoryItem.exists?(rows.last.id), 'a refused listing takes nothing'
  end

  def test_a_listing_whose_row_went_meanwhile_is_refused
    stand_at(@char, 'broker_imperial')
    row = @char.inventory_items.create!(item_key: 'antidote', qty: 2)
    # mailed away by a parallel request
    rival { InventoryItem.where(id: row.id).delete_all }
    status, body = list(row, 2)
    assert_equal 200, status
    assert_equal 'Not enough of those.', body['error']
    refute AuctionListing.exists?(seller_id: @char.id)
  end

  def test_a_cancel_merges_into_the_stack
    stand_at(@char, 'broker_imperial')
    row = @char.inventory_items.find_by!(item_key: 'potion', equipped_slot: nil)
    _, body = list(row, 2)
    assert_equal 1, row.reload.qty
    status, = call(@api, :post, '/api/auction/cancel', {listing_id: body.dig('listing', 'id')})
    assert_equal 200, status
    assert_equal 3, row.reload.qty
  end

  # ---- the mail ----

  def test_the_mail_allowance_is_the_accounts
    _, other = player('econ-b@example.invalid', 'Econb')
    send_mail = ->(subject) { call(@api, :post, '/api/mail', {to: other.name, subject: subject}) }
    5.times { |i| assert_equal 200, send_mail.("First #{i}").first }
    new_character(@api, 'Econalt')
    5.times { |i| assert_equal 200, send_mail.("Alt #{i}").first }
    status, body = send_mail.('One more')
    assert_equal 422, status
    assert_match(/busy/, body['error'])
    assert_equal Vanai::Mail::RATE_LIMIT, MailLetter.where(recipient_id: other.id).count
  end

  # ---- characters ----

  def test_an_account_holds_at_most_eight_characters
    (Character::MAX_PER_USER - 1).times { |i| new_character(@api, "Econ#{('a'.ord + i).chr}x") }
    assert_equal Character::MAX_PER_USER, @char.user.characters.count
    status, body = call(@api, :post, '/api/characters', {name: 'Onetoomany', race: 'aedri', job: 'PLD', city: 'caerdun'})
    assert_equal 422, status
    assert_equal "This account already has #{Character::MAX_PER_USER} characters.", body['error']
    refute Character.exists?(name: 'Onetoomany')
  end

  def test_a_name_race_lost_at_the_index_is_the_same_refusal
    # both requests passed the check; this one meets the lower(name) index
    original = Character.instance_method(:name_unique_ci)
    Character.define_method(:name_unique_ci) {}
    status, body = call(@api, :post, '/api/characters', {name: 'Econa', race: 'aedri', job: 'PLD', city: 'caerdun'})
    assert_equal 422, status
    assert_equal 'Name is already taken', body['error']
    assert_equal 1, Character.where('lower(name) = ?', 'econa').count
  ensure
    Character.define_method(:name_unique_ci, original) if original
  end

  def test_character_creation_is_rate_limited
    store = Api::CharactersController.cache_store
    counter = ActiveSupport::Cache::MemoryStore.new
    store.define_singleton_method(:increment) { |*args, **opts| counter.increment(*args, **opts) }
    Api::CharactersController::CREATE_ATTEMPTS.times do
      assert_equal 422, call(@api, :post, '/api/characters', {name: 'Econa', race: 'aedri', job: 'PLD'}).first
    end
    status, body = call(@api, :post, '/api/characters', {name: 'Econfresh', race: 'aedri', job: 'PLD'})
    assert_equal 429, status
    assert_match(/Too many attempts/, body['error'])
  ensure
    store.singleton_class.remove_method(:increment) if store.singleton_class.method_defined?(:increment, false)
  end
end
