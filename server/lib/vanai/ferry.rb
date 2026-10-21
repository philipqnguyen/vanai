module Vanai
  # UTC slots survive restarts; the combat clock is intentionally monotonic.
  module Ferry
    module_function
    def config = Data.ferry
    def port(key) = config['ports'][key]
    def sea?(key) = config['ports'].values.any? { |p| p['sea_zone'] == key }
    def origin(key) = config['ports'].find { |_, p| p['sea_zone'] == key }&.first

    def timetable(now)
      period = config.fetch('period')
      departure = (now / period).floor * period
      arrival = departure + config.fetch('crossing')
      { phase: now < arrival ? 'sailing' : 'docked', server_time: now,
        departure: departure, arrival: arrival, next_departure: departure + period }
    end

    def on_dock?(key, x, z)
      return false unless x.finite? && z.finite?
      # Feet may overhang by 20cm; the NPC's talk radius is not the dock.
      port(key)&.fetch('dock')&.any? do |r|
        x.between?(r['x0'] - 0.2, r['x1'] + 0.2) && z.between?(r['z0'] - 0.2, r['z1'] + 0.2)
      end || false
    end

    # Same single-valued measured surfaces and sweep as client ferry-deck.ts.
    def deck_height(x, z)
      config.fetch('surfaces').each do |s|
        next unless x.between?(s['x0'], s['x1'])
        t = (x - s['x0']) / (s['x1'] - s['x0'])
        half = s['half0'] + (s['half1'] - s['half0']) * t
        next unless z.between?(s['z'] - half, s['z'] + half)
        return s['y0'] + (s['y1'] - s['y0']) * t
      end
      nil
    end

    def blocked_move?(x, z, nx, nz)
      return true unless [x, z, nx, nz].all?(&:finite?)
      previous = deck_height(x, z)
      return true unless previous
      steps = [1, (Math.hypot(nx-x, nz-z) / 0.15).ceil].max
      (1..steps).each do |i|
        t = i.to_f / steps
        y = deck_height(x+(nx-x)*t, z+(nz-z)*t)
        return true unless y && (y-previous).abs <= 0.45
        previous = y
      end
      config.fetch('obstacles').any? do |r|
        lo = 0.0; hi = 1.0
        [[x, nx-x, r['x0']-0.45, r['x1']+0.45], [z, nz-z, r['z0']-0.45, r['z1']+0.45]].each do |start, delta, min, max|
          if delta.abs < 1e-8
            hi = -1 if start < min || start > max
          else
            a, b = [(min-start)/delta, (max-start)/delta].sort
            lo = [lo, a].max; hi = [hi, b].min
          end
        end
        lo <= hi
      end
    end

    def voyage(origin, departure)
      p = port(origin)
      { 'origin' => origin, 'destination' => p.fetch('destination'), 'sea_zone' => p.fetch('sea_zone'),
        'departure' => departure, 'arrival' => departure + config.fetch('crossing'),
        'boat' => ((departure / config.fetch('period')).to_i + config['ports'].keys.index(origin)) % 2 }
    end
  end
end
