ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'ostruct'
require 'action_dispatch/testing/integration'

# The auction house's browse, its expiry, and the mail it writes, over the real
# endpoints (Vanai::Market, Vanai::Mail): a sale writes the seller a letter, an
# expired listing comes home as a parcel, a player's parcel is escrow until it
# is collected, once. The world's position lookup is stubbed to a body at the
# returned Capital's Exchange (capital_exchange_trade_test.rb's pattern) and
# to_char is captured; no world is started.
class MailAuctionIntegrationTest < Minitest::Test
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
    @to_char = W.method(:to_char)
    W.instance_variable_set(:@queue, Queue.new)
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @pushed = []
    pushed = @pushed
    W.define_singleton_method(:to_char) { |id, payload| pushed << [id, payload] }
    @seller_api, @seller = player('mail-seller@example.invalid', 'Mailseller')
    @buyer_api, @buyer = player('mail-buyer@example.invalid', 'Mailbuyer')
    @where = {}
    where = @where
    W.instance_variable_set(:@online, Class.new(Hash) { define_method(:key?) { |id| where.key?(id) } }.new)
    W.define_singleton_method(:find_player) do |id|
      key, x, z = where[id]
      next nil unless key
      [OpenStruct.new(key: key, definition: Vanai::Data.zones.fetch(key)), Body.new(x, z, {}, {}, 50, 1, 1, 100, 50)]
    end
    imperial = Vanai::Data.zones['capitalreturned']['npcs'].find { |n| n['id'] == 'broker_imperial' }
    [@seller, @buyer].each { |c| stand(c, 'capitalreturned', imperial['x'] - 2.8, imperial['z']) }
  end

  def teardown
    W.define_singleton_method(:find_player, @find_player)
    W.define_singleton_method(:to_char, @to_char)
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

  def call(api, verb, path, params = {})
    api.send(verb, path, params: params, as: verb == :get ? nil : :json)
    [api.response.status, JSON.parse(api.response.body)]
  end

  def list(row, price, qty = 1)
    status, body = call(@seller_api, :post, '/api/auction/list', {inventory_item_id: row.id, price: price, qty: qty})
    assert_equal [200, true], [status, body['ok']], body.inspect
    AuctionListing.find(body.dig('listing', 'id'))
  end

  def total_for(price)
    call(@buyer_api, :get, '/api/auction').last.dig('tax', 'rate_bp').then { |bp| price + (price * bp + 9_999) / 10_000 }
  end

  def test_a_sale_writes_the_seller_a_letter
    listing = list(@seller.inventory_items.create!(item_key: 'worn_sword', qty: 1), 40)
    assert_in_delta (Time.current + 5.days).to_f, listing.expires_at.to_f, 5
    @buyer.update_columns(gold: 500)
    seller_gold = @seller.reload.gold
    touched = Vanai::World.touch_gen(@seller.id)
    status, body = call(@buyer_api, :post, '/api/auction/buy', {listing_id: listing.id, expected_total: total_for(40)})
    assert_equal [200, true], [status, body['ok']], body.inspect
    assert_equal seller_gold + 40, @seller.reload.gold, 'gold straight to the purse, not enclosed'
    # a seller joining as it sold is read again (World.join_load_current?)
    assert_operator Vanai::World.touch_gen(@seller.id), :>, touched

    letter = MailLetter.find_by!(recipient_id: @seller.id)
    assert_equal ['system', 'The Auction House', 'Sold: Worn Sword', 0, []],
                 [letter.kind, letter.sender_name, letter.subject, letter.gold, letter.items]
    assert_includes letter.body, 'Mailbuyer'
    assert_includes letter.body, 'already in your purse'
    refute letter.parcel?
    push = @pushed.find { |id, p| id == @seller.id && p[:t] == 'mail_unread' }
    assert push, 'the badge is pushed live'
    assert_equal [1, 'Sold: Worn Sword'], [push[1][:unread], push[1].dig(:letter, :subject)]

    status, body = call(@seller_api, :get, '/api/mail')
    assert_equal [200, 1, 1], [status, body['unread'], body['total']]
    status, body = call(@seller_api, :get, "/api/mail/#{letter.id}")
    assert_equal [200, 0], [status, body['unread']], 'reading marks it read'
    status, body = call(@seller_api, :post, "/api/mail/#{letter.id}/collect")
    assert_equal [422, 'Nothing is enclosed.'], [status, body['error']]
    status, = call(@seller_api, :delete, "/api/mail/#{letter.id}")
    assert_equal 200, status
    refute MailLetter.exists?(letter.id)
  end

  def test_an_expired_listing_comes_home_as_a_parcel_once
    listing = list(@seller.inventory_items.create!(item_key: 'lamproot', qty: 5), 30, 3)
    assert_equal 2, @seller.inventory_items.find_by(item_key: 'lamproot').qty
    listing.update_columns(expires_at: 1.minute.ago)
    # past its date: gone from the browse and not for sale, sweep or no sweep
    assert_empty call(@buyer_api, :get, '/api/auction').last['listings']
    @buyer.update_columns(gold: 500)
    status, body = call(@buyer_api, :post, '/api/auction/buy', {listing_id: listing.id, expected_total: total_for(30)})
    assert_equal [409, 'Already sold.'], [status, body['error']]

    assert_equal 1, Vanai::Mail.expire_listings!
    assert_equal 0, Vanai::Mail.expire_listings!, 'once'
    assert_equal AuctionListing::EXPIRED, listing.reload.status
    letter = MailLetter.find_by!(recipient_id: @seller.id)
    assert_equal [{'item_key' => 'lamproot', 'qty' => 3}], letter.items
    assert_equal "Unsold: #{Vanai::Data.items['lamproot']['name']} ×3", letter.subject

    status, body = call(@seller_api, :delete, "/api/mail/#{letter.id}")
    assert_equal [422, 'Collect what is enclosed first.'], [status, body['error']]
    status, body = call(@seller_api, :post, "/api/mail/#{letter.id}/collect")
    assert_equal [200, true, true], [status, body['ok'], body.dig('letter', 'collected')], body.inspect
    assert_equal 5, @seller.inventory_items.find_by(item_key: 'lamproot').qty, 'a material stacks into its row'
    status, body = call(@seller_api, :post, "/api/mail/#{letter.id}/collect")
    assert_equal [422, 'You have already collected this.'], [status, body['error']]
    assert_equal 5, @seller.inventory_items.where(item_key: 'lamproot').sum(:qty)
  end

  def test_the_mailbox_returns_an_expired_listing_without_the_sweep
    listing = list(@seller.inventory_items.create!(item_key: 'worn_sword', qty: 1), 40)
    listing.update_columns(expires_at: 1.second.ago)
    _, body = call(@seller_api, :get, '/api/mail')
    assert_equal [1, 1], [body['total'], body['unread']]
    assert body['letters'][0]['parcel']
    assert_equal AuctionListing::EXPIRED, listing.reload.status
  end

  def test_a_parcel_is_escrow_until_collected
    sword = @seller.inventory_items.create!(item_key: 'bronze_sword', qty: 1)
    herbs = @seller.inventory_items.create!(item_key: 'lamproot', qty: 4)
    @seller.update_columns(gold: 200)
    @buyer.update_columns(gold: 0)
    status, body = call(@seller_api, :post, '/api/mail', {to: 'mailBUYER', subject: 'For the road', body: "Take these.\nSafe travels.",
                                                       gold: 50, items: [{inventory_item_id: sword.id, qty: 1}, {inventory_item_id: herbs.id, qty: 3}]})
    assert_equal [200, 10], [status, body['postage']], body.inspect
    assert_equal 140, @seller.reload.gold, '50 enclosed and 10 postage'
    refute InventoryItem.exists?(sword.id)
    assert_equal 1, herbs.reload.qty
    assert_equal 0, @buyer.reload.gold, 'nothing reaches the recipient before Collect'
    refute @buyer.inventory_items.exists?(item_key: 'bronze_sword')
    letter = MailLetter.find_by!(recipient_id: @buyer.id)
    assert_equal ['player', 'Mailseller', @seller.id], [letter.kind, letter.sender_name, letter.sender_id]
    assert_equal "Take these.\nSafe travels.", letter.body

    status, body = call(@buyer_api, :get, '/api/mail')
    assert_equal [true, true, 50], [body['letters'][0]['parcel'], body['letters'][0]['can_reply'], body['letters'][0]['gold']]
    status, body = call(@buyer_api, :post, "/api/mail/#{letter.id}/collect")
    assert_equal [200, 50], [status, body['gold']], body.inspect
    assert @buyer.inventory_items.exists?(item_key: 'bronze_sword', qty: 1)
    assert @buyer.inventory_items.exists?(item_key: 'lamproot', qty: 3)
    status, = call(@buyer_api, :post, "/api/mail/#{letter.id}/collect")
    assert_equal 422, status
    assert_equal 50, @buyer.reload.gold
    # someone else's letter is not theirs to collect
    status, = call(@seller_api, :post, "/api/mail/#{letter.id}/collect")
    assert_equal 422, status
  end

  def test_what_cannot_be_sent
    relic = @seller.inventory_items.create!(item_key: 'named_relic', qty: 1)
    worn = @seller.inventory_items.create!(item_key: 'bronze_sword', qty: 1, equipped_slot: 'weapon')
    swords = @seller.inventory_items.where(item_key: 'worn_sword').count # the starter one
    rows = 5.times.map { |i| @seller.inventory_items.create!(item_key: 'worn_sword', qty: 1) }
    @seller.update_columns(gold: 5)
    send_mail = ->(params) { call(@seller_api, :post, '/api/mail', {to: 'Mailbuyer', subject: 'Hi', body: ''}.merge(params)) }
    assert_equal 'That relic is bound to you.', send_mail.({items: [{inventory_item_id: relic.id, qty: 1}]}).last['error']
    assert_equal 'Take it off before you send it.', send_mail.({items: [{inventory_item_id: worn.id, qty: 1}]}).last['error']
    assert_equal 'A parcel holds at most 4 items.',
                 send_mail.({items: rows.map { |r| {inventory_item_id: r.id, qty: 1} }}).last['error']
    assert_match(/Not enough gold/, send_mail.({gold: 1}).last['error'], 'postage on top')
    assert_equal 'No one by that name walks Ardenfell.', send_mail.({to: 'Nobodyhere'}).last['error']
    assert_equal 'You cannot write to yourself.', send_mail.({to: 'mailseller'}).last['error']
    assert_equal 'Give the letter a subject.', send_mail.({subject: "  \n "}).last['error']
    assert_match(/under 1000/, send_mail.({body: 'x' * 1001}).last['error'])
    assert_equal 0, MailLetter.count
    assert_equal 5, @seller.reload.gold
    assert InventoryItem.exists?(relic.id)
    assert_equal swords + 5, @seller.inventory_items.where(item_key: 'worn_sword').count, 'a refused parcel takes nothing'
  end

  def test_the_rate_limit
    10.times { |i| assert_equal 200, call(@seller_api, :post, '/api/mail', {to: 'Mailbuyer', subject: "Note #{i}"}).first }
    status, body = call(@seller_api, :post, '/api/mail', {to: 'Mailbuyer', subject: 'One more'})
    assert_equal 422, status
    assert_match(/busy/, body['error'])
    _, body = call(@buyer_api, :get, '/api/mail', {per: 4, page: 3})
    assert_equal [3, 3, 10, 2], [body['page'], body['pages'], body['total'], body['letters'].size]
    assert_equal ['Note 1', 'Note 0'], body['letters'].map { |l| l['subject'] }, 'newest first'
  end

  def test_browse_filters_sorts_and_pages
    keys = %w[worn_sword bronze_sword iron_sword worn_katana lamproot]
    keys.each_with_index { |k, i| list(@seller.inventory_items.create!(item_key: k, qty: 1), 10 * (i + 1)) }
    browse = ->(params) { call(@buyer_api, :get, '/api/auction', params).last }

    all = browse.({})
    assert_equal [5, 1, 5], [all['total'], all['pages'], all['listings'].size]
    assert_equal({'all' => 5, 'weapons' => 4, 'weapons/sword' => 3, 'weapons/katana' => 1, 'materials' => 1}, all['counts'])
    assert_equal %w[worn_sword worn_katana iron_sword bronze_sword lamproot].sort, all['listings'].map { |l| l['item_key'] }.sort

    assert_equal %w[worn_sword bronze_sword iron_sword],
                 browse.({cat: 'weapons', sub: 'sword', sort: 'price_asc'})['listings'].map { |l| l['item_key'] }
    assert_equal %w[iron_sword bronze_sword worn_sword],
                 browse.({cat: 'weapons', sub: 'sword', sort: 'lvl_desc'})['listings'].map { |l| l['item_key'] }
    assert_equal %w[worn_katana], browse.({q: 'KATANA'})['listings'].map { |l| l['item_key'] }
    assert_equal %w[bronze_sword], browse.({cat: 'weapons', lvl_min: 2, lvl_max: 10})['listings'].map { |l| l['item_key'] }
    assert_equal 0, browse.({cat: 'armour'})['total']

    paged = browse.({per: 2, page: 3, sort: 'price_desc'})
    assert_equal [3, 3, 5], [paged['page'], paged['pages'], paged['total']]
    assert_equal %w[worn_sword], paged['listings'].map { |l| l['item_key'] }
    assert_equal 3, browse.({per: 2, page: 99})['page'], 'a page past the end is the last'

    mine = call(@seller_api, :get, '/api/auction/mine').last
    assert_equal [5, 7], [mine['listings'].size, mine['limit']]
    price = call(@seller_api, :get, '/api/auction/price', {item_key: 'iron_sword'}).last
    assert_equal [1, 30], [price['listed'], price['lowest_each']]
  end

  # The level and name sorts join each listing to its place in the sorted key
  # list (Market.order_join) where they once ordered by array_position over
  # it. Every page of every such sort serves what array_position served,
  # including where a listing whose item has left items.json falls (last
  # ascending, first descending), and the sellers still come in a query of
  # their own rather than joined into the page.
  def test_level_and_name_sorts_serve_what_array_position_did
    now = Time.current
    keys = %w[worn_sword bronze_sword iron_sword worn_katana lamproot iron_sword lamproot worn_sword]
    rows = keys.each_with_index.map do |k, i|
      {seller_id: (i.even? ? @seller : @buyer).id, item_key: k, qty: 1, price: 50 - (i * 7) % 30, status: 'active',
       created_at: now - i, updated_at: now - i, expires_at: now + 1.day}
    end
    rows << {seller_id: @seller.id, item_key: 'retired_item_g4', qty: 1, price: 5, status: 'active',
             created_at: now, updated_at: now, expires_at: now + 1.day}
    AuctionListing.insert_all(rows)
    oracle = lambda do |by, dir, tie|
      sorted = Vanai::Data.items.keys.sort_by do |k|
        it = Vanai::Data.items[k]
        by == :lvl ? [it['lvl'].to_i, it['name'].to_s] : [it['name'].to_s.downcase, k]
      end
      pos = ActiveRecord::Base.sanitize_sql_array(['array_position(ARRAY[?]::text[], auction_listings.item_key)', sorted])
      AuctionListing.live.order(Arel.sql("#{pos} #{dir}, #{tie}")).pluck(:id)
    end
    expected = {
      'lvl_asc' => oracle.(:lvl, 'ASC', 'auction_listings.id DESC'),
      'lvl_desc' => oracle.(:lvl, 'DESC', 'auction_listings.id DESC'),
      'name' => oracle.(:name, 'ASC', 'auction_listings.price ASC')
    }
    retired = AuctionListing.find_by(item_key: 'retired_item_g4').id
    assert_equal retired, expected['lvl_asc'].last
    assert_equal retired, expected['lvl_desc'].first
    assert_equal retired, expected['name'].last
    sql = []
    counting = ActiveSupport::Notifications.subscribe('sql.active_record') { |*, p| sql << p[:sql] }
    expected.each do |sort, ids|
      served = (1..5).flat_map do |page|
        body = call(@buyer_api, :get, '/api/auction', {sort: sort, per: 2, page: page}).last
        assert_equal [9, 5], [body['total'], body['pages']], sort
        body['listings'].each { |l| assert_includes %w[Mailseller Mailbuyer], l['seller'] }
        body['listings'].map { |l| l['id'] }
      end
      assert_equal ids, served, sort
    end
    ActiveSupport::Notifications.unsubscribe(counting)
    pages = sql.grep(/FROM "auction_listings" LEFT JOIN unnest/)
    assert_equal 15, pages.size, 'each page query joins the positions'
    assert pages.none? { |q| q.include?('"characters"') }, 'the sellers are not joined into the page'
    assert sql.none? { |q| q.include?('array_position') }
    assert sql.grep(/SELECT COUNT/).none? { |q| q.include?('unnest') }, 'the count needs no order'
    assert sql.any? { |q| q =~ /FROM "characters" WHERE "characters"."id" IN/ }, 'the sellers are preloaded'
  end

  def test_every_sellable_item_has_a_category
    Vanai::Data.items.each do |key, item|
      cat = Vanai::Market.category_of(item)
      if item['slot'] == 'relic'
        assert_nil cat, key
      else
        assert cat, "#{key} (#{item['slot']}) has no auction category"
        subs = Vanai::Market::CATEGORIES.fetch(cat[0])
        assert(subs.nil? || subs.include?(cat[1]), "#{key}: #{cat.inspect} is not a listed sub-category")
      end
    end
  end
end
