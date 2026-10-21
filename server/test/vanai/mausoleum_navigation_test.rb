require 'minitest/autorun'
require 'json'
require_relative '../../lib/vanai/dungeon_navigation'
require_relative '../../lib/vanai/site_levels'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/entities'
require_relative '../../lib/vanai/combat'
require_relative '../../lib/vanai/zone_state'

class MausoleumNavigationTest < Minitest::Test
  def setup
    @zone=JSON.parse(File.read(File.expand_path('../../../shared/data/zones.json',__dir__))).fetch('mausoleum')
    @nav=Vanai::DungeonNavigation.new(@zone.fetch('layout'))
  end
  def test_every_room_and_quest_location_is_reachable_from_entry
    points=@zone['layout']['rooms'].map { |r| [(r['x']+(r['w']-1)/2.0)*4,(r['z']+(r['d']-1)/2.0)*4] }
    points+=@zone['landmarks'].map { |r| [r['x'],r['z']] }
    points+=@zone['interactables'].map { |r| [r['x'],r['z']] }
    points.each do |gx,gz|
      x,z=0.0,-108.0
      3000.times do
        break if Math.hypot(gx-x,gz-z)<0.4
        point=@nav.waypoint(x,z,gx,gz);refute_nil point
        dx,dz=point[0]-x,point[1]-z;d=Math.hypot(dx,dz);break if d<0.0001
        step=[d,0.3].min;x+=dx/d*step;z+=dz/d*step
        assert @nav.clear?(x,z), "Pursuit crossed masonry at #{x},#{z}"
      end
      assert_operator Math.hypot(gx-x,gz-z), :<, 0.4, "No route to #{gx},#{gz}"
    end
  end
  def test_camp_wander_discs_are_inside_the_floor
    @zone['camps'].each do |c|
      72.times do |n|
        a=n*Math::PI/36
        assert @nav.clear?(c['x']+Math.cos(a)*c['radius'],c['z']+Math.sin(a)*c['radius']), c['monster']
      end
    end
  end
  def test_wall_blocks_sight_but_open_gallery_does_not
    refute @nav.line?(0,-64,0,12,0.05)
    assert @nav.line?(-64,-64,-64,-12,0.05)
    refute @nav.line?(0,-108,64,127,0.05)
  end
  def test_writ_requires_the_actual_dais_ramp
    target=@zone['interactables'][0]
    refute Vanai::SiteLevels.reachable?(@zone,{},target,64,127)
    levels={};x,z=64,116
    1.upto(12) do |n|
      nz=116+n*0.5
      levels=Vanai::SiteLevels.move(@zone,levels,x,z,64,nz);z=nz
    end
    assert Vanai::SiteLevels.reachable?(@zone,levels,target,64,127)
  end
  def test_real_monster_step_follows_the_bent_route_without_overshooting
    Vanai::Data.load!(File.expand_path('../..',__dir__))
    zone=Vanai::ZoneState.new('mausoleum')
    monster=zone.monsters.values.first
    monster.x=64;monster.z=56;monster.move_goal=[88,108]
    1600.times do
      break unless monster.move_goal
      zone.step_towards(monster,0.25,1.0)
      assert @nav.clear?(monster.x,monster.z)
    end
    assert_operator Math.hypot(monster.x-88,monster.z-108), :<, 0.4
    refute zone.line_of_sight?(0,-108,64,127)
    assert zone.line_of_sight?(0,-76,0,-64)
  end
  # The Keep was the last dungeon without a layout (2026-10-11 revamp): every
  # dungeon now routes and sees by its cells, and the Keep's walls block sight.
  def test_every_dungeon_now_routes_and_sees_by_its_layout
    Vanai::Data.load!(File.expand_path('../..',__dir__))
    assert_empty Vanai::Data.zones.select { |_k,z| z['kind']=='dungeon' && !z['layout'] }.keys
    zone=Vanai::ZoneState.new('keep')
    refute_nil zone.instance_variable_get(:@navigation)
    # the Gate Hall's north wall: the Great Hall's shut doors are masonry
    refute zone.line_of_sight?(0,-40,0,0)
    # down the Great Hall's nave, from the Great Doors to the dais
    assert zone.line_of_sight?(0,-12,0,20)
  end

end
