require 'minitest/autorun'
require 'json'
require_relative '../../lib/vanai/site_levels'

# SiteLevels files each site's decks and ramps in a 4 m grid so a sample tests
# only the few that can hold it. That must change nothing: these walk every
# site of every zone, the old linear scan beside the indexed one, and ask for
# the very same levels (Integer and Float alike, so eql?, not ==).
class SiteLevelsIndexTest < Minitest::Test
  ZONES = JSON.parse(File.read(File.expand_path('../../../shared/data/zones.json', __dir__)))

  # The scan as it was before the index: every deck and ramp of the site, and
  # the ground atlas read through its string key.
  module Linear
    module_function

    def ground_at(site, z, x = nil)
      if x && site['ground_cells']
        site['ramps'].each do |r|
          next if r['ground'] == false
          dx=r['x1']-r['x0']; dz=r['z1']-r['z0']; len=Math.hypot(dx,dz)
          t=((x-r['x0'])*dx+(z-r['z0'])*dz)/(len*len)
          across=((x-r['x0'])*dz-(z-r['z0'])*dx).abs/len
          if t.between?(-0.3/len,1+0.3/len) && across<=r['half']+0.05
            return r['y0']+(r['y1']-r['y0'])*t.clamp(0,1)
          end
        end
        size=(site['ground_cell'] || 4).to_f
        cell="#{(x/size+0.5).floor},#{(z/size+0.5).floor}"
        return site['ground_cells'].fetch(cell,site['floors'].first)
      end
      (site["ground_rises"] || []).each do |r|
        return r["y0"] if z <= r["z0"]
        return r["y0"] + (r["y1"]-r["y0"]) * (z-r["z0"]) / (r["z1"]-r["z0"]) if z < r["z1"]
      end
      site.dig("ground_rises", -1, "y1") || site["floors"].first
    end

    def height_at(site, x, z, previous)
      inside = Vanai::SiteLevels.method(:inside?)
      candidates = [ground_at(site, z, x)]
      site["decks"].each do |deck|
        next unless inside.(deck, x, z)
        next if (deck["holes"] || []).any? { |hole| inside.(hole, x, z) }
        candidates << deck["y"] if deck["y"] <= previous + 0.9
      end
      site["ramps"].each do |r|
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
      inside = Vanai::SiteLevels.method(:inside?)
      result = {}
      distance = Math.hypot(x1 - x0, z1 - z0)
      (definition["sites"] || {}).each do |id, site|
        next unless inside.(site, x1, z1)
        y = distance <= 8 && inside.(site, x0, z0) ? levels.fetch(id, ground_at(site, z0, x0)) : ground_at(site, z1, x1)
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
  end

  def same(a, b) = a.eql?(b) || (a.is_a?(Hash) && b.is_a?(Hash) && a.keys == b.keys && a.all? { |k, v| v.eql?(b[k]) })

  def extent(site) = site['r'] || Math.hypot(site['span'] || 10, site['len'] || 10) / 2.0

  def point_in(site, rng)
    e = extent(site)
    200.times do
      x = site['cx'] + rng.rand(-e..e); z = site['cz'] + rng.rand(-e..e)
      return [x, z] if Vanai::SiteLevels.inside?(site, x, z)
    end
    [site['cx'], site['cz']]
  end

  def sited = ZONES.select { |_, zone| zone['sites'] && !zone['sites'].empty? }

  def test_indexed_walks_match_the_linear_scan_in_every_zone_with_sites
    Vanai::SiteLevels.index!(ZONES)
    rng = Random.new(20261019)
    moves = 0
    sited.each do |key, zone|
      zone['sites'].each do |id, site|
        # Walks that start at random, on a random floor (so the decks of every
        # storey are in play), and walks up each stair from its foot.
        starts = Array.new(6) { [*point_in(site, rng), rng.rand * Math::PI * 2] }
        starts += site['ramps'].map { |r| [r['x0'], r['z0'], Math.atan2(r['z1'] - r['z0'], r['x1'] - r['x0'])] }
        starts.each do |x, z, heading|
          floor = site['floors'].sample(random: rng)
          old_levels = new_levels = rng.rand < 0.5 ? { id => floor } : {}
          20.times do
            step = [0.6, 0.6, 3.0, 7.5].sample(random: rng)
            heading += rng.rand(-0.6..0.6)
            nx = x + Math.cos(heading) * step; nz = z + Math.sin(heading) * step
            # turn back in rather than wander off the site for good
            heading += Math::PI unless Vanai::SiteLevels.inside?(site, nx, nz, 4)
            old_levels = Linear.move(zone, old_levels, x, z, nx, nz)
            new_levels = Vanai::SiteLevels.move(zone, new_levels, x, z, nx, nz)
            assert same(old_levels, new_levels), "#{key}/#{id}: #{x},#{z} -> #{nx},#{nz}: #{old_levels} vs #{new_levels}"
            x, z = nx, nz
            moves += 1
          end
        end
        # and single samples anywhere in its bounds, from any height
        400.times do
          e = extent(site)
          x = site['cx'] + rng.rand(-e..e); z = site['cz'] + rng.rand(-e..e)
          previous = site['floors'].sample(random: rng) + rng.rand(-1.0..4.0)
          assert Linear.height_at(site, x, z, previous).eql?(Vanai::SiteLevels.height_at(site, x, z, previous)), "#{key}/#{id}: height at #{x},#{z} from #{previous}"
          assert Linear.ground_at(site, z, x).eql?(Vanai::SiteLevels.ground_at(site, z, x)), "#{key}/#{id}: ground at #{x},#{z}"
        end
      end
    end
    assert_operator moves, :>, 4000
  end

  def test_the_index_lives_beside_the_data_not_in_it
    zones = JSON.parse(JSON.generate(ZONES))
    before = JSON.generate(zones)
    Vanai::SiteLevels.index!(zones)
    sited.each_key { |key| zones[key]['sites'].each_value { |site| Vanai::SiteLevels.height_at(site, site['cx'], site['cz'], 0) } }
    assert_equal before, JSON.generate(zones), 'indexing wrote into a site'
  end

  def test_a_hand_built_site_is_indexed_on_first_use
    # a yawed deck with no sine of its own, a ring with a hole, a stair, and a
    # ground atlas with a key ground_at could never write ("+1,0")
    site = { 'cx' => 0, 'cz' => 0, 'span' => 60, 'len' => 60, 'floors' => [0, 6],
             'ground_cells' => { '0,0' => 0, '1,0' => 2, '+1,0' => 9 },
             'decks' => [{ 'cx' => 10, 'cz' => 0, 'hx' => 6, 'hz' => 1, 'yaw' => 0.7, 'y' => 6 },
                         { 'cx' => -12, 'cz' => 8, 'r' => 6, 'y' => 6, 'holes' => [{ 'cx' => -12, 'cz' => 8, 'r' => 2 }] }],
             'ramps' => [{ 'x0' => 0, 'z0' => -10, 'x1' => 12, 'z1' => -10, 'y0' => 0, 'y1' => 6, 'half' => 1 }] }
    definition = { 'sites' => { 'hall' => site } }
    rng = Random.new(7)
    3000.times do
      x = rng.rand(-30.0..30.0); z = rng.rand(-30.0..30.0); previous = rng.rand(-1.0..7.0)
      assert Linear.height_at(site, x, z, previous).eql?(Vanai::SiteLevels.height_at(site, x, z, previous)), "#{x},#{z}"
    end
    assert_equal 2, Vanai::SiteLevels.ground_at(site, 0, 4)
    refute site['decks'][0].key?('sin'), 'the trig copy stays in the index'
    # the stair still climbs
    levels = {}
    0.upto(23) { |i| levels = Vanai::SiteLevels.move(definition, levels, i * 0.5, -10, (i + 1) * 0.5, -10) }
    assert_in_delta 6, levels['hall'], 0.01
  end
end
