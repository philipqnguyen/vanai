# Gear coverage report: for every job and every equipment slot, how long a
# character can go without an upgrade being available to them.
#
#   bin/rails runner script/gear_check.rb
#
# The hard rule — no equippable item may exist that nobody can equip, and no
# armour may omit its class — is enforced at boot by Vanai::Data.validate_gear!,
# so reaching this script at all means that rule already passed. This is the
# softer question it cannot answer: is there anything to BUY at every level?

D = Vanai::Data
SLOTS = %w[weapon head body legs feet].freeze
MAX = Vanai::Stats::MAX_LEVEL
WARN_GAP = 12 # levels without a single new option before we call it a gap

# where a piece can actually be got hold of — an item nobody sells, drops or
# rewards is not coverage
sources = Hash.new { |h, k| h[k] = [] }
D.zones.each_value do |z|
  (z["npcs"] || []).each { |n| (n["stock"] || []).each { |s| sources[s] << "vendor" } }
end
D.monsters.each do |mk, md|
  (md["drops"] || []).each do |d|
    key = d.is_a?(Hash) ? (d["item"] || d["key"]) : d
    sources[key] << "drop:#{mk}"
  end
end
D.quests.each { |qk, q| ((q["rewards"] || {})["items"] || []).each { |it| sources[it] << "quest:#{qk}" } }
D.recipes.each_value { |r| sources[r["out"] || r["output"]] << "craft" if r["out"] || r["output"] }

gaps = []
unreachable = []
puts "Largest stretch with no new option, by job and slot (level 1-#{MAX}):"
puts

D.jobs.each_key do |job|
  row = []
  SLOTS.each do |slot|
    levels = D.items.select do |key, item|
      item["slot"] == slot &&
        D.eligible_jobs(item).include?(job) &&
        sources.key?(key)
    end.values.map { |i| i["lvl"].to_i }.uniq.sort

    unless levels.include?(1) || levels.first.to_i <= 1
      levels = [0] + levels # nothing at level 1 is itself a gap from 0
    end
    worst, at = 0, nil
    ([0] + levels + [MAX]).each_cons(2) do |a, b|
      next if b > MAX
      (worst, at = b - a, a) if b - a > worst
    end
    # trailing stretch from the last option to the level cap
    if levels.last && MAX - levels.last > worst
      worst, at = MAX - levels.last, levels.last
    end
    row << format("%-6s %2d lv (from %2d)%s", slot, worst, at.to_i, worst >= WARN_GAP ? " <-" : "")
    gaps << "#{job} #{slot}: #{worst} levels with nothing new from level #{at}" if worst >= WARN_GAP
  end
  puts format("  %-4s %s", job, row.join(" | "))
end

# every equippable item should be obtainable somewhere
D.items.each do |key, item|
  next unless SLOTS.include?(item["slot"])
  unreachable << "#{key} (#{item["name"]}, L#{item["lvl"]})" unless sources.key?(key)
end

puts
if unreachable.any?
  puts "UNOBTAINABLE (#{unreachable.size}) — exists but no vendor, drop, quest or recipe gives it:"
  unreachable.each { |u| puts "  #{u}" }
else
  puts "Every equippable item is obtainable."
end

puts
if gaps.any?
  puts "COVERAGE GAPS (#{WARN_GAP}+ levels):"
  gaps.each { |g| puts "  #{g}" }
else
  puts "No job goes #{WARN_GAP}+ levels without a new option in any slot."
end
exit(gaps.empty? && unreachable.empty? ? 0 : 1)
