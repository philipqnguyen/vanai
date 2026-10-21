module Vanai
  # Track floors from accepted horizontal movement through shared stair geometry.
  # The client never supplies a height or a claimed floor. Long discontinuities
  # discard level history, as does leaving a site (including zone transfers).
  module SiteLevels
    module_function

    # Each site's decks and ramps filed by the 4 m cells their bounds touch, so
    # a sample tests only the few that can hold it. The rebuilt dungeons lay
    # their whole floor as one site of 300-500 decks, and every 0.15 m of every
    # move used to test all of them. The index is held beside the data, keyed
    # by the site itself, never written into it (other readers walk a site's
    # keys); Data.load! builds every zone's, and a site built by hand (the
    # tests) gets its own on first use. A site is read-only once indexed.
    GRID = 4.0
    # Two cell numbers packed into one Integer key, so a lookup builds no
    # string or array. The offset keeps negative cells one-to-one.
    PACK = 1 << 20
    OFFSET = 1 << 19
    NONE = [[].freeze, [].freeze].freeze

    # grid: packed cell => [decks, ramps], each in the site's own order (nil
    # when a bound falls outside the packable range: then every cell is all).
    # ground_cells: the site's cell atlas under packed keys.
    Index = Struct.new(:grid, :all, :ground_cells, :ground_size) do
      def near(x, z)
        return all unless grid
        key = SiteLevels.pack((x / GRID).floor, (z / GRID).floor)
        # a point outside the packable range is outside every indexed bound
        key ? grid.fetch(key, NONE) : NONE
      end
    end

    @indexes = {}.compare_by_identity

    def pack(a, b) = a.abs < OFFSET && b.abs < OFFSET ? (a + OFFSET) * PACK + (b + OFFSET) : nil

    def index(site) = @indexes[site] ||= build_index(site)

    # Every zone's sites, built before the world thread runs so it never builds
    # one mid-tick. A fresh table each load, so a reload keeps no stale index.
    def index!(zones)
      indexes = {}.compare_by_identity
      zones.each_value { |zone| (zone["sites"] || {}).each_value { |site| indexes[site] = build_index(site) } }
      @indexes = indexes
    end

    # A yawed shape without its sine and cosine computes them at every test
    # (Heartwood's boughs); the index holds a copy carrying them, the same
    # numbers inside? would compute.
    def with_trig(shape)
      return shape if shape["r"] || (shape["sin"] && shape["cos"])
      shape.merge("sin" => shape["sin"] || Math.sin(shape["yaw"] || 0), "cos" => shape["cos"] || Math.cos(shape["yaw"] || 0))
    end

    def build_index(site)
      decks = (site["decks"] || []).map do |deck|
        holes = (deck["holes"] || []).map { |hole| with_trig(hole) }
        deck = deck.merge("holes" => holes) if holes.zip(deck["holes"] || []).any? { |copy, hole| !copy.equal?(hole) }
        with_trig(deck)
      end
      ramps = site["ramps"] || []
      grid = {}
      file = lambda do |slot, item, x0, z0, x1, z1|
        a0, a1, b0, b1 = (x0 / GRID).floor, (x1 / GRID).floor, (z0 / GRID).floor, (z1 / GRID).floor
        return grid = nil unless pack(a0, b0) && pack(a1, b1)
        (a0..a1).each { |a| (b0..b1).each { |b| (grid[pack(a, b)] ||= [[], []])[slot] << item } }
      end
      # Conservative bounds, with a hair for rounding: a deck's circumscribed
      # circle holds it at any yaw; a ramp is tested up to 0.3 m past each end
      # and half (+0.05 for ground_at) across it.
      decks.each do |d|
        e = (d["r"] || Math.hypot(d["hx"] || d["span"] / 2.0, d["hz"] || d["len"] / 2.0)) + 1e-6
        file.(0, d, d["cx"] - e, d["cz"] - e, d["cx"] + e, d["cz"] + e) if grid
      end
      ramps.each do |r|
        e = r["half"] + 0.35 + 1e-6
        file.(1, r, [r["x0"], r["x1"]].min - e, [r["z0"], r["z1"]].min - e, [r["x0"], r["x1"]].max + e, [r["z0"], r["z1"]].max + e) if grid
      end
      ground = nil
      if site["ground_cells"]
        # only keys written the way ground_at writes them could ever match
        ground = {}
        site["ground_cells"].each do |cell, y|
          a, b = cell.split(",", 2).map { |n| Integer(n, exception: false) }
          key = a && b && "#{a},#{b}" == cell && pack(a, b)
          ground[key] = y if key
        end
      end
      Index.new(grid, [decks, ramps], ground, (site["ground_cell"] || 4).to_f)
    end

    def inside?(shape, x, z, pad = 0)
      return Math.hypot(x-shape["cx"], z-shape["cz"]) < shape["r"] + pad if shape["r"]
      dx = x - shape["cx"]
      dz = z - shape["cz"]
      sin = shape["sin"] || Math.sin(shape["yaw"] || 0)
      cos = shape["cos"] || Math.cos(shape["yaw"] || 0)
      (dx * cos - dz * sin).abs < (shape["hx"] || shape["span"] / 2.0) + pad &&
        (dx * sin + dz * cos).abs < (shape["hz"] || shape["len"] / 2.0) + pad
    end

    def ground_at(site, z, x = nil)
      # These towers have one exposed floor at each horizontal location. The
      # shared cell atlas restores that same floor on reconnect without
      # promoting players onto unrelated overlapping building decks.
      if x && site['ground_cells']
        ix = index(site)
        ix.near(x, z)[1].each do |r|
          # a flight stacked over a floor (a stair hall's upper flights) is not
          # the ground under it: it is climbed to, through height_at
          next if r['ground'] == false
          dx=r['x1']-r['x0']; dz=r['z1']-r['z0']; len=Math.hypot(dx,dz)
          t=((x-r['x0'])*dx+(z-r['z0'])*dz)/(len*len)
          across=((x-r['x0'])*dz-(z-r['z0'])*dx).abs/len
          if t.between?(-0.3/len,1+0.3/len) && across<=r['half']+0.05
            return r['y0']+(r['y1']-r['y0'])*t.clamp(0,1)
          end
        end
        # 4 m cells unless the site says finer: a cell straddling a curtain's
        # face carried its walk out over the street beside it (Caerdun's walk
        # sites use 1 m, tools/data/caerdun_data_move.mjs)
        size=ix.ground_size
        a=(x/size+0.5).floor; b=(z/size+0.5).floor
        key=pack(a,b)
        return ix.ground_cells.fetch(key,site['floors'].first) if key
        return site['ground_cells'].fetch("#{a},#{b}",site['floors'].first)
      end
      (site["ground_rises"] || []).each do |r|
        return r["y0"] if z <= r["z0"]
        return r["y0"] + (r["y1"]-r["y0"]) * (z-r["z0"]) / (r["z1"]-r["z0"]) if z < r["z1"]
      end
      site.dig("ground_rises", -1, "y1") || site["floors"].first
    end

    def height_at(site, x, z, previous)
      # Only the decks and ramps whose bounds touch this cell can hold the
      # point, each in the site's order, so the candidates are the same list.
      decks, ramps = index(site).near(x, z)
      candidates = [ground_at(site, z, x)]
      decks.each do |deck|
        next unless inside?(deck, x, z)
        next if (deck["holes"] || []).any? { |hole| inside?(hole, x, z) }
        candidates << deck["y"] if deck["y"] <= previous + 0.9
      end
      ramps.each do |r|
        dx = r["x1"] - r["x0"]; dz = r["z1"] - r["z0"]
        length = Math.hypot(dx, dz)
        t = ((x - r["x0"]) * dx + (z - r["z0"]) * dz) / length**2
        across = ((x - r["x0"]) * dz - (z - r["z0"]) * dx).abs / length
        next unless t.between?(-0.3 / length, 1 + 0.3 / length) && across <= r["half"]
        y = r["y0"] + t.clamp(0, 1) * (r["y1"] - r["y0"])
        y -= r.fetch("sag", 0) * Math.sin(Math::PI * t.clamp(0, 1))**2
        candidates << y if y <= previous + 0.9
      end
      candidates.max
    end

    def move(definition, levels, x0, z0, x1, z1)
      result = {}
      distance = Math.hypot(x1 - x0, z1 - z0)
      (definition["sites"] || {}).each do |id, site|
        next unless inside?(site, x1, z1)
        y = distance <= 8 && inside?(site, x0, z0) ? levels.fetch(id, ground_at(site, z0, x0)) : ground_at(site, z1, x1)
        if distance <= 8
          steps = [(distance / 0.15).ceil, 1].max
          1.upto(steps) do |i|
            t = i.to_f / steps
            y = height_at(site, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y)
          end
        end
        result[id] = y
      end
      result
    end

    # How far a tracked height may sit from a floor and still be standing on it.
    # A storey is 3.1 m or more everywhere, so this never admits the next one.
    SAME_FLOOR = 0.65

    def elevated?(site, levels, id, x, z)
      levels.key?(id) && levels[id] > ground_at(site, z, x) + SAME_FLOOR
    end

    def reachable?(definition, levels, target, x, z)
      # Standing above a site's ground layer means standing on one of its upper
      # floors (or partway up its stair): everything outside that site, and
      # every target of it on another floor, is through a floor from there.
      # This holds for every site -- a house, a tower, a dungeon, or a canopy
      # overlaying ordinary terrain like the upper boughs. A canopy's first
      # floor is the stair-foot datum for its ground layer, not a claim that
      # all the terrain is flat; only an actual stair ascent leaves that layer,
      # and walking beneath a deck never promotes the player onto it.
      (definition["sites"] || {}).each do |id, site|
        next if target["site"] == id || !inside?(site, x, z)
        return false if elevated?(site, levels, id, x, z)
      end
      return true unless target["site"]
      site = definition.fetch("sites").fetch(target["site"])
      return false unless inside?(site, x, z)
      y = levels.fetch(target["site"], ground_at(site, z, x))
      (y - site["floors"].fetch(target.fetch("floor"))).abs < SAME_FLOOR
    end
  end
end
