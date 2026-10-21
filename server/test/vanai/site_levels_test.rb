require 'minitest/autorun'
require 'json'
require_relative '../../lib/vanai/site_levels'

class SiteLevelsTest < Minitest::Test
  def setup
    @definition = JSON.parse(File.read(File.expand_path('../../../shared/data/zones.json', __dir__))).fetch('moonmere')
    @site = @definition.fetch('sites').fetch('returns_archive')
    @upper = @definition.fetch('interactables').find { |i| i['id'] == 'mm_shelf_moon' }
    @lower = @definition.fetch('interactables').find { |i| i['id'] == 'mm_shelf_twomoons' }
    @levels = {}; @x = @site['cx']; @z = @site['cz']
  end

  def go(x, z)
    @levels = Vanai::SiteLevels.move(@definition, @levels, @x, @z, x, z)
    @x = x; @z = z
  end

  def reachable(target)
    Vanai::SiteLevels.reachable?(@definition, @levels, target, @x, @z)
  end

  def climb
    r = @site['ramps'].first
    go(r['x0'], r['z0'])
    1.upto(5) { |i| go(r['x0'] + (r['x1']-r['x0'])*i/5, r['z0'] + (r['z1']-r['z0'])*i/5) }
  end

  def test_below_upper_shelf_is_not_upstairs
    go(@upper['x'], @upper['z'])
    refute reachable(@upper)
    assert reachable(@lower)
  end

  def test_real_stair_climb_reaches_upper_floor
    climb
    assert_in_delta @site['floors'][1], @levels['returns_archive'], 0.01
    assert reachable(@upper)
    refute reachable(@lower)
  end

  def test_walk_from_stair_landing_to_upper_shelf
    climb
    r = @site['ramps'].first
    # Step on past the stair's head, the way it climbs, onto the landing before
    # turning (the rebuilt archive's flight runs along its back wall and lands
    # beside the moon stack: MOONMERE.md section 3; the old one turned back)
    len = Math.hypot(r['x1'] - r['x0'], r['z1'] - r['z0'])
    go(r['x1'] + (r['x1'] - r['x0']) / len * 0.9, r['z1'] + (r['z1'] - r['z0']) / len * 0.9)
    go(@upper['x'], @upper['z'])
    assert reachable(@upper)
  end

  def test_descent_returns_to_lower_floor
    climb
    r = @site['ramps'].first
    4.downto(0) { |i| go(r['x0'] + (r['x1']-r['x0'])*i/5, r['z0'] + (r['z1']-r['z0'])*i/5) }
    assert_in_delta @site['floors'][0], @levels['returns_archive'], 0.01
    refute reachable(@upper)
  end

  def test_walking_beneath_high_end_does_not_grant_floor
    r = @site['ramps'].first
    @x = r['x1']-Math.cos(@site['yaw'])*2; @z = r['z1']+Math.sin(@site['yaw'])*2
    go(r['x1'], r['z1'])
    refute reachable(@upper)
  end

  def test_leaving_site_discards_height
    climb
    go(@site['cx']+40, @site['cz'])
    assert_empty @levels
    go(@upper['x'], @upper['z'])
    refute reachable(@upper)
  end

  def test_reconnect_starts_on_ground_floor
    climb
    @levels = {}
    refute reachable(@upper)
    assert reachable(@lower)
  end

  def test_other_zones_do_not_inherit_floor
    climb
    @levels = Vanai::SiteLevels.move({}, @levels, @x, @z, @x, @z)
    assert_empty @levels
  end
  def test_reconnect_on_raised_dungeon_ground_does_not_fall_to_entrance
    definition = JSON.parse(File.read(File.expand_path('../../../shared/data/zones.json', __dir__))).fetch('belltower')
    site = definition.fetch('sites').fetch('raised_chamber')
    levels = Vanai::SiteLevels.move(definition, {}, 28, 0, 28.2, 0)
    assert_in_delta 24, levels.fetch('raised_chamber'), 0.01
    target = definition.fetch('interactables').find { |t| t['id'] == 'wax_cabinet' }
    refute Vanai::SiteLevels.reachable?(definition, levels, target, 28.2, 0)
    # The final flight still gains eight metres from the clock gallery. The
    # cabinet is accessible only after arriving on the bell chamber floor.
    x=28.2
    while x>6
      next_x=[x-0.1,6].max
      levels=Vanai::SiteLevels.move(definition,levels,x,0,next_x,0)
      x=next_x
    end
    assert_in_delta 32,levels.fetch('raised_chamber'),0.01
    assert Vanai::SiteLevels.reachable?(definition,levels,target,6,0)
    reconnected=Vanai::SiteLevels.move(definition,{},0,0,0.1,0)
    assert_in_delta 32,reconnected.fetch('raised_chamber'),0.01
  end

  def test_rebuilt_heartwood_hall_keeps_morrow_and_desk_reachable
    definition = JSON.parse(File.read(File.expand_path('../../../shared/data/zones.json', __dir__))).fetch('heartwood')
    site = definition.fetch('sites').fetch('grudge_hall')
    targets = (definition.fetch('npcs') + definition.fetch('interactables')).select { |t| t['site'] == 'grudge_hall' }
    refute_empty targets
    # Walk through the current doorway and across the removed staircase footprint.
    levels = {}
    [[-134, -29, -134, -34], [-134, -34, -131.21, -40.65], [-131.21, -40.65, -131.21, -45]].each do |x0, z0, x1, z1|
      levels = Vanai::SiteLevels.move(definition, levels, x0, z0, x1, z1)
      assert_in_delta site['floors'][0], levels.fetch('grudge_hall'), 0.01
      targets.each { |target| assert Vanai::SiteLevels.reachable?(definition, levels, target, x1, z1) }
    end
  end

  def test_canopy_ascent_blocks_ground_npcs_and_descent_restores_them
    @definition = JSON.parse(File.read(File.expand_path('../../../shared/data/zones.json', __dir__))).fetch('heartwood')
    @site = @definition['sites']['upper_boughs']
    target = @definition['npcs'].find { |n| n['id']=='innkeeper_tamsin' }
    r = @site['ramps'].first
    @x=r['x0']; @z=r['z0']; @levels={}
    assert reachable(target)
    1.upto(100) { |i| go(r['x0']+(r['x1']-r['x0'])*i/100,r['z0']) }
    assert_in_delta 24,@levels['upper_boughs'],0.01
    # Join the ring from the landing, then walk its west/south arc to the inn.
    ring=@site['decks'].first;radius=(ring['r']+ring['holes'][0]['r'])/2
    go(ring['cx']-Math.sqrt(radius**2-(r['z1']-ring['cz'])**2),r['z1'])
    a0=Math.atan2(@x-ring['cx'],@z-ring['cz'])
    1.upto(100) { |i| a=a0+(-Math::PI-a0)*i/100;go(ring['cx']+Math.sin(a)*radius,ring['cz']+Math.cos(a)*radius) }
    refute reachable(target)
    assert_in_delta 24,@levels['upper_boughs'],0.01
    # A ground arrival beneath that same deck retains the ground layer.
    @levels={};go(@x,@z)
    assert reachable(target)
    @x=r['x1'];@z=r['z1'];@levels={'upper_boughs'=>24}
    99.downto(0) { |i| go(r['x0']+(r['x1']-r['x0'])*i/100,r['z0']) }
    assert reachable(target)
  end

  def test_sagging_bridge_keeps_elevation_but_not_for_walkers_beneath_it
    definition=JSON.parse(File.read(File.expand_path('../../../shared/data/zones.json', __dir__)))['heartwood']
    site=definition['sites']['upper_boughs']
    site['ramps'].drop(1).each do |r|
    levels={'upper_boughs'=>24};x=r['x0'];z=r['z0']
    1.upto(100) do |i|
      nx=r['x0']+(r['x1']-r['x0'])*i/100;nz=r['z0']+(r['z1']-r['z0'])*i/100
      levels=Vanai::SiteLevels.move(definition,levels,x,z,nx,nz);x=nx;z=nz
      assert_in_delta 22.2,levels['upper_boughs'],0.03 if i==50
    end
    assert_in_delta 24,levels['upper_boughs'],0.01
    levels=Vanai::SiteLevels.move(definition,{},r['x0'],r['z0'],r['x0']+1,r['z0'])
    assert_in_delta site['floors'][0],levels['upper_boughs'],0.01
    end
  end

  def test_remembering_oak_upper_home_cannot_reach_the_grudge_hall_below
    definition=JSON.parse(File.read(File.expand_path('../../../shared/data/zones.json', __dir__)))['heartwood']
    target=definition['npcs'].find { |n| n['id']=='grudgekeeper_morrow_hw' }
    site=definition['sites']['upper_boughs']
    assert site['decks'].any? { |d| d['name']=='The Remembering Oak' }
    levels=Vanai::SiteLevels.move(definition,{'upper_boughs'=>24},-140,-42,-139.8,-42)
    assert_in_delta 24,levels['upper_boughs'],0.01
    refute Vanai::SiteLevels.reachable?(definition,levels,target,-139.8,-42)
    ground=Vanai::SiteLevels.move(definition,{},-140,-42,-139.8,-42)
    assert_in_delta site['floors'][0],ground['upper_boughs'],0.01
    assert Vanai::SiteLevels.reachable?(definition,ground,target,-139.8,-42)
  end

end
