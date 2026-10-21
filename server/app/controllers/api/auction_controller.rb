module Api
  # The auction house: one in each of the three free cities, and since the
  # Restoration the Crown's Exchange in the returned Capital. One shared house
  # wherever it stands. FFXI-lite — sellers list at a fixed price, buyers buy
  # instantly. The seller keeps the full price; the buyer pays the price plus
  # the tax of the house they buy at, set by that city's court and paid into
  # its treasury (COURTS.md "Taxes and the auction house"; Vanai::Courts.quote).
  # The Capital's Exchange charges the rate of the court holding the most wild
  # zones; on a tie its 3% goes to no court, a sink.
  class AuctionController < BaseController
    before_action :require_character!
    # Browsing, your own listings and a price check work from anywhere; trades
    # are struck at a broker's counter.
    before_action :require_at_market!, except: [:index, :mine, :price]
    # Per character, well past any hand at the counter: each trade asks the
    # world thread to read the character again (GameController::ACTIONS).
    TRADES = 30
    TRADES_WINDOW = 10.seconds
    rate_limit to: TRADES, within: TRADES_WINDOW, only: %i[list_item buy cancel],
               by: -> { session[:character_id] }, with: :too_many_attempts

    # GET /api/auction?q=&cat=&sub=&lvl_min=&lvl_max=&rarity=&sort=&page=&per=
    # One page of live listings, filtered and sorted here (Vanai::Market), with
    # the counts for the category sidebar and the tax at this house.
    def index
      live = AuctionListing.live
      scope = live
      keys = Vanai::Market.keys_for(cat: params[:cat], sub: params[:sub], q: params[:q], rarity: params[:rarity],
                                    lvl_min: params[:lvl_min], lvl_max: params[:lvl_max])
      scope = scope.where(item_key: keys) if keys
      per = params[:per].to_i.clamp(1, Vanai::Market::MAX_PER_PAGE)
      per = Vanai::Market::PER_PAGE if params[:per].blank?
      total = scope.count
      pages = [(total + per - 1) / per, 1].max
      page = params[:page].to_i.clamp(1, pages)
      rows = scope.includes(:seller)
      order_join = Vanai::Market.order_join(params[:sort])
      rows = rows.joins(order_join) if order_join
      rows = rows.order(Arel.sql(Vanai::Market.order_sql(params[:sort]))).offset((page - 1) * per).limit(per)
      render json: {
        listings: rows.map { |l| listing_payload(l) },
        page: page, pages: pages, per: per, total: total,
        counts: Vanai::Market.counts(live),
        mine_count: AuctionListing.live.where(seller_id: current_character.id).count,
        limit: AuctionListing::LIMIT,
        tax: tax_payload
      }
    end

    # GET /api/auction/mine: your listings still up, soonest to close first.
    # Any past their date go home by mail first, so what shows here is true.
    def mine
      Vanai::Mail.expire_listings!(seller_id: current_character.id)
      rows = AuctionListing.live.where(seller_id: current_character.id).includes(:seller).order(:expires_at)
      render json: { listings: rows.map { |l| listing_payload(l) }, limit: AuctionListing::LIMIT,
                     duration_days: AuctionListing::DURATION.in_days.to_i }
    end

    # GET /api/auction/price?item_key=: what the Sell tab suggests -- the
    # cheapest live listing of the item, per piece, beside the merchants' price.
    def price
      key = params[:item_key].to_s
      item = Vanai::Data.items[key]
      return render json: { error: "No such item." }, status: :not_found unless item
      live = AuctionListing.live.where(item_key: key)
      lowest = live.minimum(Arel.sql("(price::float / qty)"))
      render json: { item_key: key, listed: live.count, lowest_each: lowest&.ceil,
                     merchant: item["price"], merchant_sell: item["price_sell"] }
    end

    def list_item
      c = current_character
      price = params[:price].to_i
      qty = [params[:qty].to_i, 1].max
      row = c.inventory_items.find_by(id: params[:inventory_item_id], equipped_slot: nil)
      return render json: { error: "You don't have that." }, status: :not_found unless row
      return render json: { error: "Not enough of those." } if row.qty < qty
      return render json: { error: "Price must be at least 1 gold." } if price < 1
      return render json: { error: "Price must be under 1,000,000 gold." } if price >= 1_000_000
      item = Vanai::Data.items[row.item_key]
      return render json: { error: "That cannot be sold." } unless item
      # a named relic is bound to its finder (COURTS.md "Named relics"); the
      # inventory model refuses the move too, this is the readable refusal
      return render json: { error: "That relic is bound to you." } if item["bound"] || row.named_relic_id
      # nothing the catalogue has no shelf for (Vanai::Market.category_of)
      return render json: { error: "That cannot be sold." } unless Vanai::Market.category_of(item)
      # anything past its date goes home first, so it does not hold a place
      Vanai::Mail.expire_listings!(seller_id: c.id)

      listing = AuctionListing.transaction do
        # Under the character's lock, so parallel listings count one another
        # against the limit rather than all counting the same number.
        c.lock!
        active = AuctionListing.where(seller_id: c.id, status: AuctionListing::ACTIVE).count
        next :full if active >= AuctionListing::LIMIT
        # re-read under the lock: a mail, a sale or a trade may have taken some
        # since, or all of it
        row = c.inventory_items.lock.find_by(id: row.id, equipped_slot: nil)
        next nil unless row && row.qty >= qty
        row.qty -= qty
        row.qty.zero? ? row.destroy! : row.save!
        AuctionListing.create!(seller: c, item_key: row.item_key, qty: qty, price: price, status: AuctionListing::ACTIVE)
      end
      return render json: { error: "You may list at most #{AuctionListing::LIMIT} items." } if listing == :full
      return render json: { error: "Not enough of those." } unless listing
      Vanai::World.request_recompute(c.id)
      render json: { ok: true, listing: listing_payload(listing) }
    end

    def buy
      c = current_character
      listing = nil
      quote = nil
      letter = nil
      expected = params[:expected_total].to_i
      AuctionListing.transaction do
        listing = AuctionListing.lock.find_by(id: params[:listing_id], status: AuctionListing::ACTIVE)
        # past its date it is no longer for sale, though the sweep has not sent it home yet
        listing = nil if listing && listing.expires_at <= Time.current
        raise ActiveRecord::Rollback unless listing
        if listing.seller_id == c.id
          listing = :own
          raise ActiveRecord::Rollback
        end
        # The buyer pays what they were shown: a rate that moved since (a
        # council sitting, the Capital changing hands) refuses the sale rather
        # than charging a different total.
        quote = Vanai::Courts.quote(c.zone, listing.price)
        if quote.nil? || quote[:total] != expected
          listing = :changed
          raise ActiveRecord::Rollback
        end
        # Current spendable balance, serialized with ferry fares. The seller is
        # credited below, so both rows are taken now and in id order: two
        # players buying each other's listings at once would otherwise each
        # hold one and wait on the other.
        Character.lock.where(id: [c.id, listing.seller_id]).order(:id).load
        c.reload
        if c.gold < quote[:total]
          listing = :poor
          raise ActiveRecord::Rollback
        end
        c.update!(gold: c.gold - quote[:total])
        Character.where(id: listing.seller_id).update_all(["gold = gold + ?", listing.price])
        # joins this transaction: the sale and the court's tax commit together
        Vanai::Courts.record_tax!(zone: c.zone, amount: quote[:tax], buyer: c, listing_id: listing.id)
        Vanai::Mail.give!(c, [{ "item_key" => listing.item_key, "qty" => listing.qty }])
        listing.update!(status: AuctionListing::SOLD, buyer_id: c.id, sold_at: Time.current)
        # the seller hears by letter, online or not; it commits with the sale
        letter = Vanai::Mail.sale_letter!(listing, c.name)
      end
      return render json: { error: "Already sold." }, status: :conflict if listing.nil?
      return render json: { error: "You cannot buy your own listing." } if listing == :own
      return render json: { error: "Not enough gold." } if listing == :poor
      return render json: { error: "The house's rate has changed. Look again.", tax: tax_payload }, status: :conflict if listing == :changed

      seller_id = listing.seller_id
      item_name = Vanai::Mail.item_label(listing.item_key, listing.qty)
      proceeds = listing.price
      # the buyer's copy is read again once however many buys wait (only the
      # read folds); the seller is told of each sale, after it
      Vanai::World.request_recompute(c.id)
      # an offline seller's join being read now is read again with the gold
      Vanai::World.touch(seller_id)
      Vanai::World.enqueue { Vanai::World.notify_sale(seller_id, item_name, proceeds) }
      Vanai::Mail.push_unread(seller_id, letter)
      render json: { ok: true, price: listing.price, tax: quote[:tax], total: quote[:total] }
    end

    def cancel
      c = current_character
      # locked, so a buy or the expiry sweep racing the cancel cannot also take it
      done = AuctionListing.transaction do
        listing = AuctionListing.lock.find_by(id: params[:listing_id], seller_id: c.id, status: AuctionListing::ACTIVE)
        next false unless listing
        c.lock! # the listing, then the character, then the bags: as a sale takes them
        listing.update!(status: AuctionListing::CANCELLED)
        Vanai::Mail.give!(c, [{ "item_key" => listing.item_key, "qty" => listing.qty }])
        true
      end
      return render json: { error: "No such listing." }, status: :not_found unless done
      Vanai::World.request_recompute(c.id)
      render json: { ok: true }
    end

    private

    def require_at_market!
      # An auction house is wherever brokers stand (Vanai::Data.auction_zone?): the
      # three free cities, whose houses keep the courts' tax race three-way
      # (LORE.md), and the returned Capital, whose Exchange reopened the morning of
      # the Restoration (CAPITAL.md "The Exchange"). The empty Capital has the
      # building but nobody at its counters, so it never trades.
      unless Vanai::Data.auction_zone?(current_character.zone)
        return render json: { error: "There is no auction house here." }, status: :forbidden
      end
      # Trades are struck at the broker's counter, on the broker's floor: the
      # same reach and floor rule as talking to them. Browsing stays open.
      refusal = Vanai::World.npc_refusal_for(current_character.id, kind: "auction")
      render json: { error: refusal }, status: :forbidden if refusal
    end

    # The rate here (nil away from a house, where browsing is still allowed)
    # and every house's rate beside it, so the broker can compare them.
    def tax_payload
      here = Vanai::Courts.quote(current_character.zone, 0)
      houses = (Vanai::Courts::KEYS.map { |k| Vanai::Courts.config.court(k).fetch("city") } + [Vanai::Courts::CAPITAL_HOUSE]).map do |zone|
        { zone: zone, name: Vanai::Data.zones.dig(zone, "name") || zone,
          rate_bp: Vanai::Courts.quote(zone, 0)[:rate_bp], court: Vanai::Courts.tax_court(zone) }
      end
      { zone: here && current_character.zone, rate_bp: here && here[:rate_bp],
        court: here && Vanai::Courts.tax_court(current_character.zone), houses: houses }
    end

    def listing_payload(l)
      item = Vanai::Data.items[l.item_key] || {}
      { id: l.id, item_key: l.item_key, name: item["name"] || l.item_key, qty: l.qty,
        price: l.price, seller: l.seller.name, mine: l.seller_id == current_character.id,
        lvl: item["lvl"].to_i, rarity: item["rarity"] || "common",
        listed_at: l.created_at.iso8601, expires_at: l.expires_at.iso8601 }
    end
  end
end
