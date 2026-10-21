require 'minitest/autorun'
require 'json'
require_relative '../../lib/vanai/dungeon_navigation'
require_relative '../../lib/vanai/site_levels'

class RebuiltDungeonNavigationTest < Minitest::Test
  def layouts
    JSON.parse(File.read(File.expand_path('../../../shared/data/zones.json',__dir__))).select { |k,v| k!='mausoleum' && v['layout'] }
  end
  def test_architecture_routes_to_every_room_and_objective
    layouts.each do |key,zone|
      nav=Vanai::DungeonNavigation.new(zone['layout'])
      points=zone['layout']['rooms'].map { |r| [(r['x']+(r['w']-1)/2.0)*4,(r['z']+(r['d']-1)/2.0)*4] }
      points+=zone['interactables'].map { |r| [r['x'],r['z']] }
      points.each do |gx,gz|
        x,z=zone['spawn'].values_at('x','z').map(&:to_f)
        5000.times do
          break if Math.hypot(gx-x,gz-z)<0.4
          waypoint=nav.waypoint(x,z,gx,gz);refute_nil waypoint,"#{key}: unreachable target"
          dx,dz=waypoint[0]-x,waypoint[1]-z;len=Math.hypot(dx,dz);break if len<0.0001
          step=[len,0.3].min;x+=dx/len*step;z+=dz/len*step
          assert nav.clear?(x,z),"#{key}: route crossed masonry"
        end
        assert_operator Math.hypot(gx-x,gz-z),:<,0.4,"#{key}: route did not arrive"
      end
    end
  end
  def test_kiln_plinth_blocks_server_sight_and_direct_pursuit
    zone=layouts.fetch('furnacehall');nav=Vanai::DungeonNavigation.new(zone['layout'])
    refute nav.clear?(-23,-15)
    refute nav.line?(-34,-14,-10,-14)
    refute_nil nav.waypoint(-34,-14,-10,-14)
  end

  def test_wander_discs_stay_inside_architecture
    layouts.each do |key,zone|
      nav=Vanai::DungeonNavigation.new(zone['layout'])
      zone['camps'].each do |camp|
        72.times do |n|
          a=n*Math::PI/36
          assert nav.clear?(camp['x']+Math.cos(a)*camp['radius'],camp['z']+Math.sin(a)*camp['radius']),"#{key}: #{camp['monster']}"
        end
      end
    end
  end
  def test_each_flight_reaches_its_server_landing_in_both_directions
    layouts.each do |key,zone|
      (zone['sites'] || {}).each do |id,site|
        site['ramps'].each do |r|
          [1,-1].each do |direction|
            ax,az,bx,bz,y,target=direction==1 ? r.values_at('x0','z0','x1','z1','y0','y1') : r.values_at('x1','z1','x0','z0','y1','y0')
            len=Math.hypot(bx-ax,bz-az);dx=(bx-ax)/len;dz=(bz-az)/len;x=ax-dx*0.5;z=az-dz*0.5;levels={id=>y}
            ((len+1)*20).ceil.times do
              nx=x+dx*0.05;nz=z+dz*0.05;levels=Vanai::SiteLevels.move(zone,levels,x,z,nx,nz);x=nx;z=nz
            end
            assert_in_delta target,levels.fetch(id),0.1,"#{key}: stair #{direction} missed its landing"
          end
        end
      end
    end
  end

  def test_tower_reconnect_uses_the_exposed_room_floor
    layouts.each do |key,zone|
      next unless zone.dig('sites','raised_chamber','ground_cells')
      zone['layout']['rooms'].each do |room|
        x=(room['x']+(room['w']-1)/2.0)*4;z=(room['z']+(room['d']-1)/2.0)*4
        levels=Vanai::SiteLevels.move(zone,{},x,z,x+0.1,z)
        assert_in_delta room.fetch('y'),levels.fetch('raised_chamber'),0.01,"#{key}: #{room['id']} reconnect"
      end
    end
  end

  def test_recessed_rooms_restore_the_wet_floor_and_keep_dry_approaches
    bell=layouts.fetch('belltower').fetch('sites').fetch('raised_chamber')
    sluice=layouts.fetch('greatsluice').fetch('sites').fetch('drowned_cellar')
    [[bell,0,-30,-0.8,0,-45],[sluice,-54,30,-0.8,-56,16]].each do |site,x,z,wet,dx,dz|
      assert_in_delta wet,Vanai::SiteLevels.ground_at(site,z,x),0.001
      assert_in_delta 0,Vanai::SiteLevels.ground_at(site,dz,dx),0.001
      assert_in_delta wet,Vanai::SiteLevels.height_at(site,x,z,0),0.001
    end
  end

  def test_upper_platforms_close_the_reported_rear_pockets
    # beaconfort's probe moved off (0,125), which the revamp put under the live
    # beacon's tower (an obstacle cell), to the open dais east of it
    {'greatwatchtower'=>[0,92,18],'beaconfort'=>[8,125,18]}.each do |key,(x,z,y)|
      zone=layouts.fetch(key)
      levels=Vanai::SiteLevels.move(zone,{},x,z,x+0.1,z)
      assert_in_delta y,levels.fetch('raised_chamber'),0.001,"#{key}: reconnect in former drop pocket"
    end
    %w[greatwatchtower beaconfort greatgranary furnacehall greatsluice glasshouse overseerslodge].each do |key|
      zone=layouts.fetch(key);site=zone.fetch('sites').fetch('raised_chamber')
      deck=%w[greatwatchtower beaconfort].include?(key) ? site['decks'].last : site['decks'].first
      room=zone['layout']['rooms'].find { |r| deck['cx'].between?(r['x']*4-2,(r['x']+r['w']-1)*4+2) && deck['cz'].between?(r['z']*4-2,(r['z']+r['d']-1)*4+2) }
      assert_in_delta (room['z']+room['d']-1)*4+2,deck['cz']+deck['hz'],0.001,"#{key}: rear pocket reopened"
      assert_in_delta room['x']*4-2,deck['cx']-deck['hx'],0.001,"#{key}: side pocket reopened"
      assert_in_delta (room['x']+room['w']-1)*4+2,deck['cx']+deck['hx'],0.001,"#{key}: side pocket reopened"
    end
  end

end
