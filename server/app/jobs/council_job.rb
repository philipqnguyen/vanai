# The council's model calls, off the world thread (COURTS.md "Where it runs").
# In production this runs in Sidekiq, which never boots the world: the job only
# reads the ledger and stores the three turns, and the world thread applies them
# when its tick sees them ready. Running it twice is harmless; the cycle row
# decides who takes the turn.
class CouncilJob < ApplicationJob
  queue_as :default

  def perform(cycle_number)
    Vanai::Courts::Council.run_cycle!(cycle_number)
  end
end
