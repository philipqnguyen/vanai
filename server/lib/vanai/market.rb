module Vanai
  # The auction house's catalogue: which listings a browse asks for. Listings
  # store only an item key, so every filter but price is answered from
  # shared/data -- the keys an item category, a name, a level range or a rarity
  # admit -- and handed to SQL as `item_key IN (...)`. client/src/auction-model.ts
  # mirrors CATEGORIES and category_of for the sidebar; its node test reads
  # items.json the same way.
  module Market
    # cat => its sub-categories in display order (nil: none). Weapons split by
    # weapon type, armour by where it is worn.
    CATEGORIES = {
      "weapons" => %w[sword katana greatsword staff cudgel handwraps],
      "armour" => %w[head body legs feet],
      "accessories" => %w[ring],
      "consumables" => nil,
      "materials" => nil
    }.freeze
    RARITIES = %w[common uncommon rare].freeze
    SORTS = %w[newest ending price_asc price_desc lvl_asc lvl_desc name].freeze
    PER_PAGE = 20
    MAX_PER_PAGE = 50
    QUERY_MAX = 40

    class << self
      # [cat, sub] for an item definition, nil for what never sells (a relic).
      def category_of(item)
        return nil unless item
        case item["slot"]
        when "weapon" then ["weapons", item["wtype"]]
        when "head", "body", "legs", "feet" then ["armour", item["slot"]]
        when "ring" then ["accessories", "ring"]
        when "consumable" then ["consumables", nil]
        when "material" then ["materials", nil]
        end
      end

      # The item keys a browse admits, or nil when nothing narrows it (every
      # key, so no IN clause at all).
      def keys_for(cat: nil, sub: nil, q: nil, lvl_min: nil, lvl_max: nil, rarity: nil)
        cat = nil if cat.blank? || cat == "all"
        sub = nil if sub.blank?
        q = q.to_s.strip.downcase[0, QUERY_MAX]
        rarity = nil unless RARITIES.include?(rarity)
        lvl_min = lvl_min.presence&.to_i
        lvl_max = lvl_max.presence&.to_i
        return nil if !cat && q.empty? && !rarity && !lvl_min && !lvl_max
        Data.items.filter_map do |key, item|
          c, s = category_of(item)
          next unless c
          next if cat && c != cat
          next if sub && s != sub
          next if !q.empty? && !item["name"].to_s.downcase.include?(q)
          next if rarity && (item["rarity"] || "common") != rarity
          lvl = item["lvl"].to_i
          next if lvl_min && lvl < lvl_min
          next if lvl_max && lvl > lvl_max
          key
        end
      end

      # The ORDER BY for a sort name. Level and name are not columns, so they
      # order by each key's place in a list sorted from the data (order_join's
      # auction_pos.n), with newest first among equals.
      def order_sql(sort)
        case sort
        when "ending" then "auction_listings.expires_at ASC, auction_listings.id ASC"
        when "price_asc" then "auction_listings.price ASC, auction_listings.id DESC"
        when "price_desc" then "auction_listings.price DESC, auction_listings.id DESC"
        when "lvl_asc" then "auction_pos.n ASC, auction_listings.id DESC"
        when "lvl_desc" then "auction_pos.n DESC, auction_listings.id DESC"
        when "name" then "auction_pos.n ASC, auction_listings.price ASC"
        else "auction_listings.created_at DESC, auction_listings.id DESC"
        end
      end

      # The join a sort's ORDER BY needs (nil: none): each listing's place in
      # the sorted key list as auction_pos.n. It was array_position over the
      # whole catalogue's literal, a linear search of every key for every live
      # row (18 ms a page at 3,500 listings); a join on the unnested list is a
      # hash join. LEFT, and the default null placement, so a listing whose
      # item has left items.json sorts where array_position's NULL put it:
      # last ascending, first descending. The keys are unique, so it never
      # repeats a row. For the page query only; a count needs no order.
      def order_join(sort)
        case sort
        when "lvl_asc", "lvl_desc" then position_join(:lvl)
        when "name" then position_join(:name)
        end
      end

      # Live listings per category and sub-category for the sidebar, keyed
      # "all", "weapons", "weapons/sword", ...
      def counts(scope)
        out = Hash.new(0)
        scope.group(:item_key).count.each do |key, n|
          c, s = category_of(Data.items[key])
          next unless c
          out["all"] += n
          out[c] += n
          out["#{c}/#{s}"] += n if s
        end
        out
      end

      private

      def position_join(by)
        @positions ||= {}
        @positions[[by, Data.items.object_id]] ||= begin
          keys = Data.items.keys.sort_by do |k|
            it = Data.items[k]
            by == :lvl ? [it["lvl"].to_i, it["name"].to_s] : [it["name"].to_s.downcase, k]
          end
          ActiveRecord::Base.sanitize_sql_array(["LEFT JOIN unnest(ARRAY[?]::text[]) WITH ORDINALITY AS auction_pos(key, n) " \
                                                 "ON auction_pos.key = auction_listings.item_key", keys])
        end
      end
    end
  end
end
