# Tick harness (docs/SERVER-PERF.md): boots the world without its thread,
# fills zones with fake players (no database rows), drives moves at the
# client's 10 Hz, runs N ticks on a simulated clock (0.25 s a tick) and
# reports the real CPU of each tick, allocations, SQL and the bytes a
# broadcast publishes and delivers. Run it before and after a change to
# anything the tick reaches, and put the numbers in the change.
#
#   cd server && RAILS_ENV=test bin/rails runner script/tick_harness.rb <scenario> <players> [ticks] [redis]
#     scenario: empty | spread | packed_field | packed_city | combat_spread |
#               combat_packed | dungeon:<key> (e.g. dungeon:keep)
#     redis:    also PUBLISH every broadcast to the local Redis (an unused
#               channel prefix), the cost the old Redis cable adapter put on
#               the world thread
#   Run it on a database of its own (DATABASE_URL=postgresql:///<name>): the
#   courts' tick commits rows that the test suite then trips over.
#   env: WARM=4 uncounted warm-up ticks (the test env autoloads on first
#        use); PARTIES=1 groups players in fives; AOI=1 prints how much of
#        each pos frame a view radius would keep; INLINE_SAVES=1 writes
#        the periodic saves on the world thread, as before PositionWriter
require "json"
require "redis"

Rails.logger.level = :info
ActiveRecord::Base.logger = nil
ActionCable.server.config.logger = Logger.new(nil)

SCEN = ARGV[0] || "spread"
NPLAYERS = (ARGV[1] || 50).to_i
NTICKS = (ARGV[2] || 40).to_i
PUBLISH = ARGV[3] == "redis"

$sim = 1000.0
module Vanai
  def self.now = $sim
end

# ---- broadcast recorder (encodes as ActionCable does: once per broadcast) ----
$stats = Hash.new { |h, k| h[k] = [0, 0] }
$fanout_bytes = 0
$fanout_msgs = 0
$zone_bytes = Hash.new(0)
$redis = PUBLISH ? Redis.new : nil
$keep_sample = {}
ActionCable.server.define_singleton_method(:broadcast) do |ch, msg, coder: ActiveSupport::JSON|
  enc = ActiveSupport::JSON.encode(msg)
  t = msg[:t] || msg["t"]
  kind = ch.start_with?("zone:") ? "zone:#{t}" : "char:#{t}"
  s = $stats[kind]
  s[0] += 1
  s[1] += enc.bytesize
  if ch.start_with?("zone:")
    zk = ch.delete_prefix("zone:")
    subs = Vanai::World.zone(zk).players.size
    $fanout_bytes += enc.bytesize * subs
    $fanout_msgs += subs
    $zone_bytes[zk] += enc.bytesize
  else
    $fanout_bytes += enc.bytesize
    $fanout_msgs += 1
  end
  $keep_sample[kind] ||= enc
  if t == "pos"
    zk = ch.delete_prefix("zone:")
    prev = ($prev_rows ||= {})[zk] || {}
    cur = {}
    (msg[:p] + msg[:m]).each { |r| cur[r[0]] = r }
    $rows_total = ($rows_total || 0) + cur.size
    $rows_same = ($rows_same || 0) + cur.count { |id, r| prev[id] == r }
    $mon_rows = ($mon_rows || 0) + msg[:m].size
    $mon_same = ($mon_same || 0) + msg[:m].count { |r| prev[r[0]] == r }
    $prev_rows[zk] = cur
  end
  $redis&.publish("vanai_perf_harness:#{ch}", enc)
end

W = Vanai::World
def boot_world!
  W.instance_variable_set(:@zones, {})
  W.instance_variable_set(:@queue, Queue.new)
  W.instance_variable_set(:@parties, {})
  W.instance_variable_set(:@online, {})
  W.instance_variable_set(:@party_grace, {})
  W.instance_variable_set(:@next_party_id, 0)
  W.instance_variable_set(:@sessions, {})
  # the saves on their own thread, as in a running world (PositionWriter);
  # INLINE_SAVES=1 writes them on this one, as the tick used to
  W.instance_variable_set(:@positions, Vanai::PositionWriter.new(inline: ENV["INLINE_SAVES"] == "1"))
  W.send(:initialize_ferry)
end
boot_world!

FakeJob = Struct.new(:level, :xp)
FakeChar = Struct.new(:id, :name, :race, :active_job, :title, :zone, :x, :z, :heading, :gold, :lvl) do
  def appearance_payload = { "hair" => "short", "skin" => 2 }
  def job_record = FakeJob.new(lvl, 0)
  def equipped = []
  def quest_progresses = []
  def discoveries = []
end

RACES = Vanai::Data.races.keys
JOBS = Vanai::Data.jobs.keys
ZONES = Vanai::Data.zones
FIELD = ZONES.select { |_, d| (d["camps"] || []).any? && d["kind"] == "field" }.keys
DUNGEON = ZONES.select { |_, d| d["kind"] == "dungeon" }.keys
CITY = ZONES.select { |_, d| d["kind"] == "city" }.keys

def place(zk)
  d = ZONES[zk]
  camps = d["camps"] || []
  if camps.any? && d["kind"] != "dungeon"
    c = camps.sample
    # 25 m off the camp: in sight, mostly out of aggro
    a = rand * Math::PI * 2
    [c["x"] + Math.cos(a) * (c["radius"] + 25), c["z"] + Math.sin(a) * (c["radius"] + 25)]
  elsif (sp = d["spawn"] || d["spawn_point"])
    [sp["x"].to_f + rand * 10 - 5, sp["z"].to_f + rand * 10 - 5]
  else
    [rand * 20 - 10, rand * 20 - 10]
  end
end

$players = []
def add_player(i, zk)
  x, z = place(zk)
  half = ZONES[zk]["size"].to_f / 2 - 3
  x = x.clamp(-half, half); z = z.clamp(-half, half)
  ch = FakeChar.new(100_000 + i, "Tester#{i}", RACES.sample, JOBS.sample, nil, zk, x, z, 0.0, 100, 20)
  ps = Vanai::PlayerState.new(ch)
  ps.last_save_at = $sim - rand * 15 # periodic saves spread like real joins
  ps.last_regen_at = $sim - rand * 3
  zs = W.zone(zk)
  zs.add_player(ps)
  W.instance_variable_get(:@online)[ch.id] = zk
  W.instance_variable_get(:@sessions)[ch.id] = "s#{ch.id}"
  $players << [ch.id, zk, ps, rand * Math::PI * 2]
end

# every zone exists (a long-running world has seen them all)
ZONES.each_key { |k| W.zone(k) }

case SCEN
when "empty"
when "spread", "combat_spread"
  pool = FIELD + CITY + DUNGEON.first(4)
  NPLAYERS.times { |i| add_player(i, pool[i % pool.size]) }
when "packed_field", "combat_packed"
  NPLAYERS.times { |i| add_player(i, "caerdunfields") }
when /\Adungeon:(.+)\z/
  dk = $1
  zs = W.zone(dk)
  NPLAYERS.times do |i|
    add_player(i, dk)
    ps = $players.last[2]
    200.times do
      x = rand(-zs.size / 2..zs.size / 2); z = rand(-zs.size / 2..zs.size / 2)
      next unless zs.navigation.clear?(x, z, 1.5)
      ps.x = x; ps.z = z; break
    end
  end
  # nobody in this test is fought: the monsters stand still
  zs.monsters.clear
when "packed_city"
  NPLAYERS.times { |i| add_player(i, "caerdun") }
end

if SCEN.start_with?("combat")
  $players.each do |cid, zk, ps, _|
    zs = W.zone(zk)
    next if zs.safe? || zs.monsters.empty?
    m = zs.monsters.values.select(&:alive?).min_by { |mm| mm.dist_to(ps.x, ps.z) }
    next unless m
    ps.x = m.x + 1.0; ps.z = m.z
    ps.hp = ps.sheet["max_hp"] # keep them up: 10 s of fighting
    W.attack(cid, m.mid)
    Vanai::Combat.aggro!(zs, m, ps)
  end
end

if ENV["PARTIES"]
  $players.each_slice(5).with_index do |grp, i|
    pt = Vanai::Party.new(i + 1, grp[0][0])
    pt.member_ids = grp.map(&:first)
    grp.each { |g| g[2].party_id = i + 1 }
    W.parties[i + 1] = pt
  end
end
# reset counters after setup (the joins' broadcasts are not a tick's)
$rows_total = $rows_same = $mon_rows = $mon_same = 0; $prev_rows = {}
$stats.clear; $fanout_bytes = 0; $fanout_msgs = 0; $zone_bytes.clear; $keep_sample.clear

def enqueue_moves(tick)
  # 10 Hz: 2 or 3 moves a tick, running at 6 m/s
  n = tick.even? ? 2 : 3
  $players.each do |cid, zk, ps, _|
    next if ps.dead || ps.engaged
    ang = $players_dir[cid] ||= rand * Math::PI * 2
    $players_dir[cid] += (rand - 0.5) * 0.3
    n.times do |k|
      nx = ps.x + Math.cos(ang) * 0.6 * (k + 1)
      nz = ps.z + Math.sin(ang) * 0.6 * (k + 1)
      W.enqueue { W.apply_move(cid, nx, nz, ang, "run") }
    end
  end
end
$players_dir = {}

clock = -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) }
times = []
phase = Hash.new(0.0)
# phase timing by wrapping the zone tick
Vanai::ZoneState.prepend(Module.new do
  def tick_players(t) = (a = Process.clock_gettime(Process::CLOCK_MONOTONIC); super.tap { $phase[:players] += Process.clock_gettime(Process::CLOCK_MONOTONIC) - a })
  def tick_monsters(t) = (a = Process.clock_gettime(Process::CLOCK_MONOTONIC); super.tap { $phase[:monsters] += Process.clock_gettime(Process::CLOCK_MONOTONIC) - a })
  def flush(t) = (a = Process.clock_gettime(Process::CLOCK_MONOTONIC); super.tap { $phase[:flush] += Process.clock_gettime(Process::CLOCK_MONOTONIC) - a })
end)
$phase = phase
W.singleton_class.prepend(Module.new do
  def guarded(what, lines = 8, &blk)
    a = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    super
  ensure
    k = what.start_with?("zone ") ? :"g_zones" : :"g_#{what.tr(' ', '_')}"
    $phase[k] += Process.clock_gettime(Process::CLOCK_MONOTONIC) - a
  end
end)
# WARM ticks first, uncounted: the test env autoloads code on first use, a
# cost a running world paid long ago
WARM = ENV.fetch("WARM", "4").to_i
WARM.times do |i|
  enqueue_moves(i)
  W.run_tick
  $sim += 0.25
end
phase.clear
$rows_total = $rows_same = $mon_rows = $mon_same = 0; $prev_rows = {}
$stats.clear; $fanout_bytes = 0; $fanout_msgs = 0; $zone_bytes.clear; $keep_sample.clear
$sql_n = 0
ActiveSupport::Notifications.subscribe("sql.active_record") { |*_, pl| $sql_n += 1 unless pl[:name] == "SCHEMA" }
GC.start
gc0 = GC.stat
alloc0 = GC.stat(:total_allocated_objects)
qtime = 0.0
NTICKS.times do |i|
  enqueue_moves(i + WARM)
  a = clock.()
  W.run_tick
  dt = clock.() - a
  times << dt
  $sim += 0.25
end
gc1 = GC.stat
sql_ticks = $sql_n
alloc = GC.stat(:total_allocated_objects) - alloc0

times.sort!
pct = ->(p) { times[[(times.size * p).ceil - 1, 0].max] * 1000 }
mean = times.sum / times.size * 1000
zones_with_players = $players.map { |p| p[1] }.uniq.size
out = {
  scenario: SCEN, players: NPLAYERS, ticks: NTICKS, publish: PUBLISH,
  zones_live: W.instance_variable_get(:@zones).size, zones_with_players: zones_with_players,
  monsters: W.instance_variable_get(:@zones).values.sum { |z| z.monsters.size },
  tick_ms: { mean: mean.round(2), p50: pct.(0.5).round(2), p95: pct.(0.95).round(2), max: (times.last * 1000).round(2) },
  phase_ms_per_tick: phase.transform_values { |v| (v / NTICKS * 1000).round(2) },
  allocs_per_tick: alloc / NTICKS,
  sql_per_tick: (sql_ticks.to_f / NTICKS).round(2),
  pos_rows_sent_per_tick: ($rows_total.to_f / NTICKS).round(1),
  gc_time_ms_per_tick: ((gc1[:time] - gc0[:time]).to_f / NTICKS).round(2),
  heap_live_slots: gc1[:heap_live_slots],
  gc_minor: gc1[:minor_gc_count] - gc0[:minor_gc_count], gc_major: gc1[:major_gc_count] - gc0[:major_gc_count],
  broadcasts_per_tick: $stats.transform_values { |c, b| [(c.to_f / NTICKS).round(2), (b.to_f / NTICKS).round] }.sort_by { |_, v| -v[1] }.to_h,
  published_bytes_per_tick: ($stats.values.sum { |_, b| b } / NTICKS),
  delivered_msgs_per_tick: ($fanout_msgs / NTICKS),
  delivered_bytes_per_tick: ($fanout_bytes / NTICKS),
  pos_rows_unchanged_pct: ($rows_total.to_i.zero? ? nil : (100.0 * $rows_same / $rows_total).round(1)),
  pos_monster_rows_unchanged_pct: ($mon_rows.to_i.zero? ? nil : (100.0 * $mon_same / $mon_rows).round(1)),
  pos_monster_rows_share: ($rows_total.to_i.zero? ? nil : (100.0 * $mon_rows / $rows_total).round(1)),
  top_zone_bytes_per_tick: $zone_bytes.sort_by { |_, b| -b }.first(3).to_h { |k, b| [k, b / NTICKS] },
}
puts JSON.pretty_generate(out)
if ENV["AOI"]
  [60, 100, 150].each do |r|
    seen = tot = 0
    $players.each do |_, zk, ps, _|
      zs = W.zone(zk)
      ents = zs.monsters.values.select(&:alive?).map { |m| [m.x, m.z] } + zs.players.values.map { |p| [p.x, p.z] }
      tot += ents.size
      seen += ents.count { |x, z| Math.hypot(x - ps.x, z - ps.z) <= r }
    end
    printf("AOI %3d m: a subscriber needs %.1f%% of the rows it is sent\n", r, 100.0 * seen / [tot, 1].max)
  end
  puts "zone sizes: " + $players.map { |p| p[1] }.uniq.first(6).map { |k| "#{k}=#{ZONES[k]['size']}" }.join(" ")
end
