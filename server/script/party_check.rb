# Drives Vanai::World directly to prove a party survives a zone crossing, a
# disconnect, and the grace period that follows one.
#
#   bin/rails runner script/party_check.rb
#
# Uses the two lowest-id characters in the development database and puts their
# zone and position back afterwards. No ActionCable traffic leaves the process:
# to_char and broadcast_zone are captured instead of broadcast.

CAPTURED = Hash.new { |h, k| h[k] = [] }
W = Vanai::World
W.boot!
W.instance_variable_get(:@thread)&.kill # deterministic: no background ticking
sleep 0.05

W.define_singleton_method(:to_char) { |cid, payload| CAPTURED[cid] << payload }
W.define_singleton_method(:broadcast_zone) { |_zk, _payload| nil }

FAILURES = []
def check(cond, msg)
  puts(cond ? "  ok   #{msg}" : "  FAIL #{msg}")
  FAILURES << msg unless cond
end

def party_msgs(cid) = CAPTURED[cid].select { |m| m[:t] == "party" }
def chat_msgs(cid) = CAPTURED[cid].select { |m| m[:t] == "chat" && m[:channel] == "party" }
def system_msgs(cid) = CAPTURED[cid].select { |m| m[:t] == "system" }.map { |m| m[:msg] }

a, b = Character.order(:id).limit(2).to_a
orig = [a, b].map { |c| [c.id, c.zone, c.x, c.z] }
[a, b].each { |c| c.update!(zone: "caerdun", x: 0, z: 0) }
puts "characters: #{a.name} (#{a.id}) and #{b.name} (#{b.id})\n\n"

begin
  puts "-- form a party in one zone"
  W.join(a.id)
  W.join(b.id)
  W.party_invite(a.id, b.name)
  W.party_respond(b.id, true)
  roster = party_msgs(b.id).last
  check(roster && roster[:members].size == 2, "both members on the roster")

  CAPTURED.clear
  W.chat(a.id, "party", "before the crossing")
  check(chat_msgs(b.id).size == 1, "/p reaches the other member in the same zone")

  puts "\n-- #{a.name} takes a portal to another zone"
  CAPTURED.clear
  W.travel(a.id, { "to" => "moonmereshores", "tx" => 10.0, "tz" => 10.0 })
  W.leave(a.id) # the client's unsubscribe, which follows every zone change
  party = W.parties.values.first
  check(party && party.member_ids.size == 2, "party survives the crossing (was disbanded before)")
  away = party_msgs(b.id).last&.dig(:members)&.find { |m| m[:char_id] == a.id }
  check(away && away[:away] == true, "the crossing member holds their seat, flagged away")

  W.join(a.id) # resubscribe on the far side
  _, ps_a = W.find_player(a.id)
  check(ps_a&.party_id == party.pid, "#{a.name} is still in the party after rejoining")
  check(W.instance_variable_get(:@online)[a.id] == "moonmereshores", "#{a.name} really is in another zone")

  puts "\n-- party chat across zones"
  CAPTURED.clear
  W.chat(b.id, "party", "still there?")
  check(chat_msgs(a.id).size == 1, "/p from #{b.name} reaches #{a.name} in another zone")
  W.chat(a.id, "party", "still here")
  # the sender is on the roster too, so b now holds its own line and a's
  check(chat_msgs(b.id).size == 2, "/p from #{a.name} reaches #{b.name} back in the city")

  puts "\n-- a real disconnect holds the seat, then releases it"
  CAPTURED.clear
  W.leave(a.id) # dropped connection: no travel involved
  check(W.parties.values.first&.member_ids&.size == 2, "party held open during the grace period")
  W.tick_parties(Vanai.now + 1) # not yet expired
  check(W.parties.values.first&.member_ids&.size == 2, "still held a second later")
  W.tick_parties(Vanai.now + Vanai::World::PARTY_GRACE + 1)
  check(W.parties.empty?, "party released once the grace period lapsed")
  check(system_msgs(b.id).any? { |m| m.include?("left the party") }, "#{b.name} is told why")

  puts "\n-- /p with no party says so"
  CAPTURED.clear
  W.chat(b.id, "party", "anyone?")
  check(system_msgs(b.id).include?("You are not in a party."), "silent drop replaced by feedback")
ensure
  W.leave(a.id) rescue nil
  W.leave(b.id) rescue nil
  orig.each { |id, zone, x, z| Character.where(id: id).update_all(zone: zone, x: x, z: z) }
end

puts "\n#{FAILURES.empty? ? 'ALL CHECKS PASSED' : "FAILURES: #{FAILURES.join(' | ')}"}"
exit(FAILURES.empty? ? 0 : 1)
