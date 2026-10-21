require 'minitest/autorun'
require 'json'
require_relative '../../lib/vanai/dungeon_navigation'

# DungeonNavigation looks cells up as packed Integers and grows each goal's
# route tree only as far as the pursuer asking needs. Neither may change an
# answer: these ask the navigation as it was and as it is the same questions,
# in the same order (so trees are shared, resumed and cleared), in every
# rebuilt dungeon.
class DungeonNavigationEquivalenceTest < Minitest::Test
  ZONES = JSON.parse(File.read(File.expand_path('../../../shared/data/zones.json', __dir__)))

  # The navigation before packing: a Set of cell pairs, the whole floor
  # searched for each new goal cell.
  class Whole
    def initialize(layout)
      @cell = layout.fetch('cell')
      @floor = Set.new
      layout.fetch('rooms').each do |r|
        (r['x']...r['x']+r['w']).each { |x| (r['z']...r['z']+r['d']).each { |z| @floor.add([x,z]) } }
      end
      layout.fetch('corridors').each do |path|
        path.each_cons(2) do |a,b|
          x,z = a
          dx,dz = b[0]<=>x, b[1]<=>z
          loop do
            @floor.add([x,z])
            break if [x,z] == b
            x += dx; z += dz
          end
        end
      end
      layout.fetch('obstacles', []).each do |r|
        (r['x']...r['x']+r['w']).each { |x| (r['z']...r['z']+r['d']).each { |z| @floor.delete([x,z]) } }
      end
      @routes = {}
    end

    attr_reader :floor

    def cell(x,z) = [(x / @cell.to_f + 0.5).floor, (z / @cell.to_f + 0.5).floor]

    def clear?(x,z,margin=0.85)
      [-margin,margin].product([-margin,margin]).all? { |dx,dz| @floor.include?(cell(x+dx,z+dz)) }
    end

    def line?(x,z,gx,gz,margin=0.85)
      steps = [(Math.hypot(gx-x,gz-z)/0.35).ceil,1].max
      (0..steps).all? { |n| t=n.to_f/steps; clear?(x+(gx-x)*t,z+(gz-z)*t,margin+0.1) }
    end

    def waypoint(x,z,gx,gz)
      return [gx,gz] if line?(x,z,gx,gz)
      start, goal = cell(x,z), cell(gx,gz)
      return nil unless @floor.include?(start) && @floor.include?(goal)
      @routes.clear if @routes.size > 64
      toward = @routes[goal] ||= begin
        found = {goal => nil}; queue = [goal]; head = 0
        while head < queue.size
          here=queue[head]; head+=1
          [[1,0],[-1,0],[0,1],[0,-1]].each do |dx,dz|
            next_cell=[here[0]+dx,here[1]+dz]
            next unless @floor.include?(next_cell) && !found.key?(next_cell)
            found[next_cell]=here; queue << next_cell
          end
        end
        found
      end
      return nil unless toward.key?(start)
      next_cell = toward[start]
      return [start[0]*@cell,start[1]*@cell] unless next_cell
      target = next_cell.map { |n| n*@cell }
      line?(x,z,*target) ? target : start.map { |n| n*@cell }
    end
  end

  def dungeons = ZONES.select { |_, zone| zone['kind'] == 'dungeon' && zone['layout'] }

  # Points on the floor, jittered across cell edges, and a few off it.
  def points(old, cell, rng, n)
    floor = old.floor.to_a
    Array.new(n) do
      if rng.rand < 0.1
        [rng.rand(-200.0..200.0), rng.rand(-200.0..200.0)]
      else
        cx, cz = floor.sample(random: rng)
        [cx * cell + rng.rand(-cell..cell), cz * cell + rng.rand(-cell..cell)]
      end
    end
  end

  def test_packed_navigation_answers_as_the_whole_floor_search_did
    rng = Random.new(20261019)
    answers = 0
    dungeons.each do |key, zone|
      old = Whole.new(zone['layout']); now = Vanai::DungeonNavigation.new(zone['layout'])
      cell = zone['layout']['cell'].to_f
      pts = points(old, cell, rng, 600)
      # a few shared goals, so later pursuers resume a tree an earlier one grew,
      # and enough fresh ones to pass the 64-tree bound and clear the cache
      goals = pts.sample(12, random: rng)
      pts.each_with_index do |(x, z), i|
        gx, gz = i % 3 == 0 ? pts.sample(random: rng) : goals.sample(random: rng)
        assert old.waypoint(x, z, gx, gz).eql?(now.waypoint(x, z, gx, gz)), "#{key}: waypoint #{x},#{z} -> #{gx},#{gz}"
        [0.05, 0.2, 0.85].each do |margin|
          assert old.line?(x, z, gx, gz, margin).eql?(now.line?(x, z, gx, gz, margin)), "#{key}: line #{x},#{z} -> #{gx},#{gz} at #{margin}"
        end
        [0, 0.3, 0.85, 1.3].each do |margin|
          assert old.clear?(x, z, margin).eql?(now.clear?(x, z, margin)), "#{key}: clear #{x},#{z} at #{margin}"
        end
        assert old.cell(x, z).eql?(now.cell(x, z))
        answers += 9
      end
      # pursuits: walk each waypoint to the goal, both answering every step
      20.times do
        x, z = pts.sample(random: rng); gx, gz = goals.sample(random: rng)
        150.times do
          a = old.waypoint(x, z, gx, gz); b = now.waypoint(x, z, gx, gz)
          assert a.eql?(b), "#{key}: pursuit at #{x},#{z} -> #{gx},#{gz}"
          answers += 1
          break unless a
          d = Math.hypot(a[0] - x, a[1] - z)
          break if d < 1e-6
          step = [d, 0.9].min
          x += (a[0] - x) / d * step; z += (a[1] - z) / d * step
        end
      end
    end
    assert_operator answers, :>, 50_000
  end

  def test_waypoints_stay_integer_cell_centres
    zone = ZONES.fetch('keep')
    nav = Vanai::DungeonNavigation.new(zone['layout'])
    old = Whole.new(zone['layout'])
    rng = Random.new(5)
    found = 0
    points(old, 4.0, rng, 400).each_cons(2) do |(x, z), (gx, gz)|
      point = nav.waypoint(x, z, gx, gz)
      next if point.nil? || point == [gx, gz]
      assert point.all?(Integer), "a cell centre stays Integer: #{point}"
      found += 1
    end
    assert_operator found, :>, 10
  end
end
