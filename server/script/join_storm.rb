# Join storm (docs/SERVER-PERF.md rule 7): every character reconnecting at
# once, as after a deploy. Makes N real characters, asks them all to join in
# one moment, and runs the world's ticks at the world's own pace (0.25 s,
# less the tick's time) until every one is in. Reports how long the last one
# waited, the worst tick, and the world thread's own time per join.
#
#   cd server && RAILS_ENV=test DATABASE_URL=postgresql:///<bench db> \
#     bin/rails runner script/join_storm.rb [players] [inline]
#     inline: join on the world thread, as before JoinLoader
#
# It commits its characters (the loader's threads read them on their own
# connections) and deletes them at the end: run it on a database of its own,
# never the test suite's.
N = (ARGV[0] || 300).to_i
INLINE = ARGV[1] == "inline"

Rails.logger.level = :warn
ActiveRecord::Base.logger = nil
W = Vanai::World

%i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades
   join_requests join_tokens join_loads].each { |k| W.instance_variable_set("@#{k}", {}) }
W.instance_variable_set(:@queue, Queue.new)
W.instance_variable_set(:@next_party_id, 0)
W.instance_variable_set(:@join_ready, [])
W.instance_variable_set(:@positions, Vanai::PositionWriter.new(inline: false))
W.instance_variable_set(:@loader, INLINE ? nil : Vanai::JoinLoader.new)
W.send(:initialize_ferry)
W.define_singleton_method(:to_char) { |*| nil }
W.define_singleton_method(:broadcast_zone) { |*| nil }

# names are letters only: a number in base 26, written a-z
letters = ->(n) { n.digits(26).reverse.map { |d| (97 + d).chr }.join }
user = User.create!(email: "join-storm-#{Process.pid}@example.invalid", password: "isolated-test-password")
cities = %w[caerdun heartwood moonmere]
chars = []
at_exit { user.destroy! if user&.persisted? && Character.where(user_id: user.id).exists? }
N.times do |i|
  chars << Character.provision!(user: user, name: "Storm#{letters.(Process.pid)}#{letters.(i).rjust(3, 'a')}".capitalize,
                                job: "PLD", city: cities[i % 3])
end
# a played character's journal and map: some quests and discoveries each
chars.each_slice(50) do |slice|
  QuestProgress.insert_all(slice.flat_map { |c| Vanai::Data.quests.keys.first(20).map { |q| { character_id: c.id, quest_key: q, status: "completed", progress: 0 } } })
  Discovery.insert_all(slice.flat_map { |c| Vanai::Data.zones.keys.first(10).map { |z| { character_id: c.id, landmark_key: "zone_#{z}" } } })
end

begin
  join_time = 0.0
  W.singleton_class.prepend(Module.new do
    define_method(:join) do |*a, **k|
      t = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      super(*a, **k)
    ensure
      join_time += Process.clock_gettime(Process::CLOCK_MONOTONIC) - t
    end
  end)
  clock = -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) }
  start = clock.()
  chars.each { |c| W.request_join(c.id, "storm-#{c.id}") }
  ticks = []
  online = W.instance_variable_get(:@online)
  until online.size >= N
    a = clock.()
    W.run_tick
    dt = clock.() - a
    ticks << dt
    abort "stalled at #{online.size}/#{N}" if clock.() - start > 600
    sleep([W::TICK - dt, 0.0].max)
  end
  took = clock.() - start
  ticks.sort!
  puts JSON.pretty_generate(
    players: N, mode: INLINE ? "inline" : "loader",
    last_in_s: took.round(2), ticks: ticks.size,
    tick_ms: { mean: (ticks.sum / ticks.size * 1000).round(1), p95: (ticks[(ticks.size * 0.95).floor] * 1000).round(1),
               max: (ticks.last * 1000).round(1) },
    world_ms_per_join: (join_time / N * 1000).round(2)
  )
ensure
  online&.keys&.each { |cid| W.leave(cid, persist: false) }
  W.positions.flush
  ids = chars.map(&:id)
  user.destroy!
  puts "cleaned #{ids.size - Character.where(id: ids).count}/#{ids.size}"
end
