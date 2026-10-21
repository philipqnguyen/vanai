ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'ostruct'
require 'action_dispatch/testing/integration'

# The returned Capital's Exchange trades through the real auction endpoints
# (CAPITAL.md "The Exchange"): before 2026-10-11 require_at_market! named the
# three free cities, so a broker stood in the Capital who could not trade.
# test/vanai/capital_exchange_test.rb pins the reach and floor rule on its own;
# this drives list and buy over HTTP, with the world's position lookup stubbed
# to a body standing on the Exchange's floor (no second world is started).
class CapitalExchangeTradeIntegrationTest < Minitest::Test
  W = Vanai::World
  Body = Struct.new(:x, :z, :site_levels, :quests, :level, :hp, :mp, :max_hp, :max_mp) do
    def alive? = true
    def job = 'PLD'
    def dist_to(x, z) = Math.hypot(self.x - x, self.z - z)
  end

  def setup
    raise 'Test database only' unless Rails.env.test?
    @previous = %i[queue online].to_h { |k| [k, W.instance_variable_get("@#{k}")] }
    @find_player = W.method(:find_player)
    W.instance_variable_set(:@queue, Queue.new)
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @seller_api, @seller = player('exchange-seller@example.invalid', 'Exchseller')
    @buyer_api, @buyer = player('exchange-buyer@example.invalid', 'Exchbuyer')
    @where = {} # char id => [zone key, x, z]
    where = @where
    # npc_refusal_for asks @online.key? first: online means stood somewhere
    W.instance_variable_set(:@online, Class.new(Hash) { define_method(:key?) { |id| where.key?(id) } }.new)
    W.define_singleton_method(:find_player) do |id|
      key, x, z = where[id]
      next nil unless key
      [OpenStruct.new(key: key, definition: Vanai::Data.zones.fetch(key)), Body.new(x, z, {}, {}, 50, 1, 1, 100, 50)]
    end
  end

  def teardown
    Vanai::Courts.dormant_override = nil
    W.define_singleton_method(:find_player, @find_player)
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

  def stand(char, key, x, z)
    char.update_columns(zone: key)
    @where[char.id] = [key, x, z]
  end

  def broker(id) = Vanai::Data.zones['capitalreturned']['npcs'].find { |n| n['id'] == id }

  def call(api, path, params)
    api.post path, params: params, as: :json
    [api.response.status, JSON.parse(api.response.body)]
  end

  def test_list_and_buy_at_capital_brokers
    row = @seller.inventory_items.create!(item_key: 'worn_sword', qty: 1)
    imperial = broker('broker_imperial')
    # the crowd's side of the Crown Broker's counter, 2.8 m west, on the Exchange floor
    stand(@seller, 'capitalreturned', imperial['x'] - 2.8, imperial['z'])
    status, body = call(@seller_api, '/api/auction/list', {inventory_item_id: row.id, price: 40, qty: 1})
    assert_equal [200, true], [status, body['ok']], body.inspect
    listing = AuctionListing.find_by!(seller_id: @seller.id, status: AuctionListing::ACTIVE)

    # the buyer at another counter (Factor Reeve's, the far north one)
    reeve = broker('broker_reeve')
    stand(@buyer, 'capitalreturned', reeve['x'] - 2.8, reeve['z'])
    @buyer.update_columns(gold: 100)
    seller_gold = @seller.reload.gold
    # no court leads the Capital (none holds a zone): the standing 3% on top,
    # rounded up to whole gold, and it reaches no treasury -- a sink
    @buyer_api.get '/api/auction'
    tax = JSON.parse(@buyer_api.response.body)['tax']
    assert_equal ['capitalreturned', 300, nil], [tax['zone'], tax['rate_bp'], tax['court']], tax.inspect
    assert_equal 4, tax['houses'].size, 'the three cities and the Exchange, to compare'
    treasuries = Court.pluck(:key, :treasury).to_h
    status, body = call(@buyer_api, '/api/auction/buy', {listing_id: listing.id, expected_total: 42})
    assert_equal [200, true], [status, body['ok']], body.inspect
    assert_equal [40, 2, 42], body.values_at('price', 'tax', 'total')
    assert_equal AuctionListing::SOLD, listing.reload.status
    assert_equal 58, @buyer.reload.gold
    assert_equal seller_gold + 40, @seller.reload.gold, 'the seller keeps the full price'
    assert_equal treasuries, Court.pluck(:key, :treasury).to_h, 'a leaderless Capital pays no court'
    assert @buyer.inventory_items.exists?(item_key: 'worn_sword')
  end

  # The Capital's leader charges its home rate there and takes the tax; a
  # total the buyer was not shown is refused, not charged.
  def test_the_leaders_rate_and_a_moved_rate
    Vanai::Courts.dormant_override = false
    Vanai::Courts.ensure_courts!
    Court.where(key: 'caerdun').update_all(tax_bp: 700)
    CourtFlag.set('capital_leader', 'caerdun')
    row = @seller.inventory_items.create!(item_key: 'worn_sword', qty: 1)
    imperial = broker('broker_imperial')
    stand(@seller, 'capitalreturned', imperial['x'] - 2.8, imperial['z'])
    call(@seller_api, '/api/auction/list', {inventory_item_id: row.id, price: 40, qty: 1})
    listing = AuctionListing.find_by!(seller_id: @seller.id, status: AuctionListing::ACTIVE)
    stand(@buyer, 'capitalreturned', imperial['x'] - 2.8, imperial['z'])
    @buyer.update_columns(gold: 100)
    before = Court.find_by!(key: 'caerdun').treasury

    status, body = call(@buyer_api, '/api/auction/buy', {listing_id: listing.id, expected_total: 42})
    assert_equal 409, status, 'shown 3%, now 7%: refused'
    assert_equal 700, body.dig('tax', 'rate_bp')
    assert_equal [AuctionListing::ACTIVE, 100], [listing.reload.status, @buyer.reload.gold]

    status, body = call(@buyer_api, '/api/auction/buy', {listing_id: listing.id, expected_total: 43})
    assert_equal [200, 3], [status, body['tax']], body.inspect
    assert_equal 57, @buyer.reload.gold
    assert_equal before + 3, Court.find_by!(key: 'caerdun').treasury
    entry = CourtLedgerEntry.where(court: 'caerdun', kind: 'tax').order(:id).last
    assert_equal [3, 'capitalreturned'], [entry.amount, entry.zone]
  end

  def test_a_named_relic_is_refused_readably
    row = @seller.inventory_items.create!(item_key: 'named_relic', qty: 1)
    imperial = broker('broker_imperial')
    stand(@seller, 'capitalreturned', imperial['x'] - 2.8, imperial['z'])
    status, body = call(@seller_api, '/api/auction/list', {inventory_item_id: row.id, price: 40, qty: 1})
    assert_equal [200, 'That relic is bound to you.'], [status, body['error']]
    refute AuctionListing.exists?(seller_id: @seller.id)
  end

  def test_refused_in_the_empty_capital_and_from_the_square
    row = @seller.inventory_items.create!(item_key: 'worn_sword', qty: 1)
    imperial = broker('broker_imperial')
    stand(@seller, 'capital', imperial['x'] - 2.8, imperial['z'])
    status, body = call(@seller_api, '/api/auction/list', {inventory_item_id: row.id, price: 40, qty: 1})
    assert_equal 403, status, body.inspect
    # in the returned Capital but down on the square before the steps
    stand(@seller, 'capitalreturned', 43.0, -108.0)
    status, body = call(@seller_api, '/api/auction/list', {inventory_item_id: row.id, price: 40, qty: 1})
    assert_equal 403, status
    assert_equal 'Too far away.', body['error']
    refute AuctionListing.exists?(seller_id: @seller.id)
  end
end
