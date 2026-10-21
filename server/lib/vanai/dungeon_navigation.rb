require 'set'

module Vanai
  # Opt-in grid navigation for rebuilt dungeons. Legacy dungeons keep their
  # existing behavior. The same cells generate the client's visible walls.
  class DungeonNavigation
    # Every chasing monster asks clear? at each 0.35 m of a line, every tick,
    # so a cell is looked up as one packed Integer rather than built as an
    # array and hashed. The offset keeps negative cells one-to-one; a cell
    # past LIMIT is never floor (the layouts are a few dozen cells across).
    PACK = 1 << 20
    OFFSET = 1 << 19
    LIMIT = OFFSET - 1
    # the neighbours [+x, -x, +z, -z] in packed form, the order routes grow in
    NEIGHBOURS = [PACK, -PACK, 1, -1].freeze

    def initialize(layout)
      @cell = layout.fetch('cell')
      @size = @cell.to_f
      @floor = Set.new
      layout.fetch('rooms').each do |r|
        (r['x']...r['x']+r['w']).each { |x| (r['z']...r['z']+r['d']).each { |z| @floor.add([x,z]) } }
      end
      layout.fetch('corridors').each do |path|
        path.each_cons(2) do |a,b|
          x,z = a
          raise 'Non-orthogonal dungeon passage' if x != b[0] && z != b[1]
          dx,dz = b[0]<=>x, b[1]<=>z
          loop do
            @floor.add([x,z])
            break if [x,z] == b
            x += dx; z += dz
          end
        end
      end
      # Solid machinery plinths are cell-aligned and shared with client collision.
      layout.fetch('obstacles', []).each do |r|
        (r['x']...r['x']+r['w']).each { |x| (r['z']...r['z']+r['d']).each { |z| @floor.delete([x,z]) } }
      end
      raise 'Dungeon floor past the packable cells' unless @floor.all? { |x,z| x.abs < LIMIT && z.abs < LIMIT }
      @keys = Set.new(@floor.map { |x,z| pack(x,z) })
      @routes = {}
    end

    def cell(x,z) = [(x / @size + 0.5).floor, (z / @size + 0.5).floor]

    def pack(x,z) = (x + OFFSET) * PACK + (z + OFFSET)

    # The packed cell, or nil when it lies past every floor cell.
    def key(x,z) = x.abs < LIMIT && z.abs < LIMIT ? pack(x,z) : nil

    def unpack(k) = [k / PACK - OFFSET, k % PACK - OFFSET]

    # The four corners' cells, worked as cell() works them (x - margin is
    # exactly x + -margin), with no array for any of them.
    def clear?(x,z,margin=0.85)
      x0 = ((x-margin) / @size + 0.5).floor; x1 = ((x+margin) / @size + 0.5).floor
      z0 = ((z-margin) / @size + 0.5).floor; z1 = ((z+margin) / @size + 0.5).floor
      return false unless x0.abs < LIMIT && x1.abs < LIMIT && z0.abs < LIMIT && z1.abs < LIMIT
      @keys.include?(pack(x0,z0)) && @keys.include?(pack(x0,z1)) && @keys.include?(pack(x1,z0)) && @keys.include?(pack(x1,z1))
    end

    def line?(x,z,gx,gz,margin=0.85)
      steps = [(Math.hypot(gx-x,gz-z)/0.35).ceil,1].max
      margin += 0.1
      n = 0
      while n <= steps
        t = n.to_f/steps
        return false unless clear?(x+(gx-x)*t,z+(gz-z)*t,margin)
        n += 1
      end
      true
    end

    def waypoint(x,z,gx,gz)
      return [gx,gz] if line?(x,z,gx,gz)
      start, goal = cell(x,z), cell(gx,gz)
      s, g = key(*start), key(*goal)
      return nil unless s && g && @keys.include?(s) && @keys.include?(g)
      # Reverse breadth-first trees are shared by every pursuer of one cell.
      # Bound the cache: moving players must not accumulate a dungeon per tick.
      @routes.clear if @routes.size > 64
      # A tree grows only until it reaches the pursuer asking, and the next
      # pursuer of that cell resumes it. The queue is the same FIFO in the same
      # neighbour order, so every cell gets the parent the whole-floor search
      # gave it; a pursued player keeps entering new cells, and most pursuers
      # are a few cells from it on a floor of 300-900.
      tree = @routes[g] ||= {found: {g => nil}, queue: [g], head: 0}
      toward = tree[:found]
      unless toward.key?(s)
        queue = tree[:queue]; head = tree[:head]
        while head < queue.size
          here=queue[head]; head+=1
          NEIGHBOURS.each do |d|
            next_cell=here+d
            next unless @keys.include?(next_cell) && !toward.key?(next_cell)
            toward[next_cell]=here; queue << next_cell
          end
          break if toward.key?(s)
        end
        tree[:head] = head
      end
      return nil unless toward.key?(s)
      # Return through the current cell centre before rounding a blind bend.
      # Skipping this step lets diagonals clip the inside masonry corner.
      next_cell = toward[s]
      return [start[0]*@cell,start[1]*@cell] unless next_cell
      target = unpack(next_cell).map { |n| n*@cell }
      line?(x,z,*target) ? target : start.map { |n| n*@cell }
    end
  end
end
