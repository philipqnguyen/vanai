# The courts from the command line. Both tasks only touch the database, so they
# work beside the running server: council_now moves the open cycle's due time
# and the world tick does the rest within a few seconds.
namespace :courts do
  desc "Have the council sit now (moves the open cycle's due time)"
  task council_now: :environment do
    n = Vanai::Courts.run_now!
    # The server's view, not this process's: the server may run with a key or
    # VANAI_COURTS_STUB that this shell does not have (the world stores it).
    dormant = CourtFlag.uncached { CourtFlag.get("dormant") } == true
    puts n.zero? ? "No council cycle is open yet (the world opens one on its first tick)." : "The council sits within a few seconds#{" (dormant: no turns)" if dormant}."
  end

  desc "Show the courts: the cycle, treasuries, rates and the last turns"
  task status: :environment do
    C = Vanai::Courts
    cycle = CouncilCycle.uncached { CouncilCycle.open_cycle.first }
    stored = CourtFlag.uncached { CourtFlag.get("dormant") }
    puts "dormant (as the server last stored it): #{stored.inspect}; this shell alone would be #{C.dormant?}"
    if cycle
      puts "cycle #{cycle.number}: started #{cycle.started_at}, due #{cycle.due_at}, turn #{cycle.turn_status} (attempts #{cycle.turn_attempts})"
    else
      puts "no cycle yet"
    end
    Court.uncached { Court.order(:key).to_a }.each do |c|
      # dormant courts charge the standing 3% whatever their stored rate
      charged = stored == true ? C.config.tax["start_bp"] : c.tax_bp
      puts format("  %-10s treasury %8d  tax %5.2f%%  (charged now %5.2f%%)", c.key, c.treasury, c.tax_bp / 100.0, charged / 100.0)
    end
    CourtTurn.uncached { CourtTurn.order(id: :desc).limit(6).to_a }.each do |t|
      puts "  turn #{t.court} cycle##{t.council_cycle_id}: #{t.status} #{t.verbs.to_json} #{t.error}"
    end
  end
end
