require 'minitest/autorun'
require 'json'
require_relative '../../lib/vanai/site_levels'

# Caerdun's sites after the Sea Gate data move (tools/data/caerdun_data_move.mjs,
# CAERDUN-CONTRACT.md 4.8). The server knows a floor only from accepted movement through
# a site's decks, ramps and, on the three walk sites, its ground-cell atlas
# (SiteLevels.ground_at). These walk the routes a player takes -- along the wall
# walk into the watch posts (CF-7: cd1's patrol is on the wall), up the Crown
# Gate's stairs to the crown terrace, up the court hall and the clock -- and
# check the server tracks each one onto the target's floor, while a walker on
# the street below never is.
class CaerdunSitesTest < Minitest::Test
  WALK = 21.275

  def setup
    @zone = JSON.parse(File.read(File.expand_path('../../../shared/data/zones.json', __dir__))).fetch('caerdun')
    @levels = {}
    @x = @z = nil
  end

  def site(id) = @zone.fetch('sites').fetch(id)
  def target(id) = (@zone['interactables'] + @zone['npcs']).find { |t| t['id'] == id } || flunk("no #{id}")

  # a site's local (u, v) in the world (the plan's frame: scene.ts buildApi.obb)
  def local(s, u, v)
    yaw = s['yaw'] || 0
    [s['cx'] + u * Math.cos(yaw) + v * Math.sin(yaw), s['cz'] - u * Math.sin(yaw) + v * Math.cos(yaw)]
  end

  def start(x, z)
    @levels = {}; @x = x; @z = z
  end

  # in 0.25 m moves, as a walking client sends them
  def walk_to(x, z)
    n = [(Math.hypot(x - @x, z - @z) / 0.25).ceil, 1].max
    x0, z0 = @x, @z
    1.upto(n) do |i|
      nx = x0 + (x - x0) * i / n; nz = z0 + (z - z0) * i / n
      @levels = Vanai::SiteLevels.move(@zone, @levels, @x, @z, nx, nz)
      @x = nx; @z = nz
    end
  end

  def climb(ramps)
    ramps.each { |r| walk_to(r['x0'], r['z0']); walk_to(r['x1'], r['z1']) }
  end

  def reachable(id) = Vanai::SiteLevels.reachable?(@zone, @levels, target(id), @x, @z)

  def test_the_old_house_sites_are_gone_and_every_sited_target_is_on_a_floor_of_its_site
    assert_equal %w[court_archive imperial_clock watch_crown watch_harbour watch_light watch_ramparts], @zone['sites'].keys.sort
    (@zone['npcs'] + @zone['interactables']).select { |t| t['site'] }.each do |t|
      s = site(t['site'])
      assert Vanai::SiteLevels.inside?(s, t['x'], t['z']), "#{t['id']} inside #{t['site']}"
      assert_in_delta s['floors'].fetch(t['floor']), t['y'], 1e-6, t['id']
    end
  end

  def test_along_the_walk_into_the_sea_ramparts_watch
    s = site('watch_ramparts')
    start(*local(s, -21, 0.1))
    walk_to(*local(s, 0, 0.1))
    assert_in_delta WALK, @levels['watch_ramparts'], 0.01
    assert reachable('cd_muster_ramparts'), 'the post from the walk'
    knut = target('cd_resident_knut_crofton')
    walk_to(knut['x'] - 0.8, knut['z'])
    assert reachable('cd_resident_knut_crofton'), 'the sentry on his walk'
  end

  def test_the_street_under_the_ramparts_never_reaches_the_walk
    s = site('watch_ramparts')
    start(*local(s, -21, -5.5))
    (-20..20).step(2) do |u|
      walk_to(*local(s, u, -5.5))
      refute reachable('cd_muster_ramparts'), "from the street at u #{u}"
    end
  end

  def test_along_the_gallery_and_up_the_crown_gate_to_the_crown_terrace
    s = site('watch_crown')
    # the land curtain's walk north of the gate, then the gallery into the north tower's walk room
    start(65.4, 4)
    walk_to(65.4, -6.0)
    assert_in_delta WALK, @levels['watch_crown'], 0.01
    # F3a, F3b, F4a, F4b: the climb from the walk room to the crown (the plan's flights, in rise order)
    climb(s['ramps'].select { |r| r['y0'] >= WALK - 0.01 }.sort_by { |r| r['y0'] })
    assert_in_delta 33.975, @levels['watch_crown'], 0.01
    # out of the caphouse's east door and across the terrace to the post
    walk_to(59.0, -11.5)
    post = target('cd_muster_crown')
    walk_to(post['x'], post['z'] + 0.8)
    assert reachable('cd_muster_crown'), 'the crown post from the crown terrace'
  end

  def test_through_the_crown_gate_passage_never_reaches_the_crown
    start(80, -18)
    [[70, -18], [65.333, -18], [60, -18], [50, -18]].each do |x, z|
      walk_to(x, z)
      refute reachable('cd_muster_crown'), "from the passage at #{x}"
    end
    assert reachable('cd_resident_britt_lisle'), 'a street NPC inside the gate from the street'
  end

  def test_along_the_walk_onto_the_lantern_bastion
    s = site('watch_light')
    # the north curtain's walk deck (2.2 m wide) where it joins the platform:
    # from its end outside the site to its end on the bastion
    deck = s['decks'].find { |d| (d['y'] - WALK).abs < 0.01 && (d['hz'] - 1.1).abs < 0.01 && d['cz'] > s['cz'] }
    ends = [1, -1].map { |k| [deck['cx'] + k * deck['hx'] * deck['cos'], deck['cz'] - k * deck['hx'] * deck['sin']] }
    outside, inside = ends.partition { |x, z| !Vanai::SiteLevels.inside?(s, x, z) }.map(&:first)
    refute_nil outside, 'the walk comes in from outside the site'
    start(*outside)
    walk_to(*inside)
    assert_in_delta WALK, @levels['watch_light'], 0.01
    post = target('cd_muster_light')
    walk_to(post['x'] + 0.6, post['z'])
    assert reachable('cd_muster_light'), 'the lighthouse post from the platform'
  end

  # FIX ROUND 2 (the walk review, MEASURED by replaying the flood tree through
  # SiteLevels: 599 apron nodes accepted for the lighthouse post 11 m over them).
  # The gorge apron is the plateau's floor (9.875) beside the bastion's mass; at
  # 4 m the cell atlas's cells straddling that face took the walk, and a walker
  # on the apron was tracked at the platform without a climb. The atlas is in
  # metre cells now, each the lowest floor a body fits on there, and a flight
  # stacked over a floor is not that floor's ground.
  def test_the_gorge_apron_never_reaches_the_lighthouse_post
    # (a path the walk review's flood walked along the apron, from the plateau)
    start(-126.25, 28.88)
    [[-131.75, 34.38], [-135.25, 37.88], [-137.75, 40.38], [-139.25, 41.88], [-140.25, 42.0], [-140.75, 42.5],
     [-141.75, 41.5], [-142.25, 40.67], [-142.75, 40.17]].each do |x, z|
      walk_to(x, z)
      refute reachable('cd_muster_light'), "from the apron at (#{x}, #{z})"
      assert_operator @levels.fetch('watch_light', 0), :<, 10.5, "tracked at #{@levels['watch_light']} on the apron"
    end
  end

  def test_the_gallery_never_reaches_the_crown_post
    start(65.4, 4)
    walk_to(65.4, -6.0)
    [[65.1, -14.0], [65.4, -20.0], [65.4, -30.0]].each do |x, z|
      walk_to(x, z)
      refute reachable('cd_muster_crown'), "from the gallery at (#{x}, #{z})"
    end
  end

  # in at the door, up the entry steps from the street (they stand outside the
  # box, so the room's floor is the site's ground: SiteLevels.ground_at)
  def in_at_the_door(s)
    # (both face the square: the shells' doors on their local +z, the sites turned with them)
    start(*local(s, 0, s['len'] / 2.0 + 2))
    walk_to(*local(s, 0, s['len'] / 2.0 - 1))
  end

  def test_up_the_court_hall_and_the_clock
    hall = site('court_archive')
    in_at_the_door(hall)
    vail = target('paymaster_vail')
    walk_to(vail['x'], vail['z'] - 0.8)
    assert reachable('paymaster_vail'), 'the paymaster in the vaults'
    assert reachable('cd_volume_one')
    refute_empty hall['ramps'], 'the stair to the court above'
    clock = site('imperial_clock')
    in_at_the_door(clock)
    refute reachable('cd_gate_clock'), 'the clock face is four floors up'
    flights = clock['ramps'].sort_by { |r| r['y0'] }.first(4)
    k3 = flights.last
    climb(flights)
    # off the flight's head onto floor 4, then round the stairwell (the hole over K3)
    walk_to(k3['x1'], k3['z1'] + 0.6 * (k3['z1'] <=> k3['z0']))
    walk_to(clock['cx'] - (k3['x1'] - clock['cx']), k3['z1'] + 0.6 * (k3['z1'] <=> k3['z0']))
    clock_face = target('cd_gate_clock')
    walk_to(clock_face['x'], clock_face['z'] + 1.0)
    assert reachable('cd_gate_clock'), 'the clock face from floor 4'
  end
end
