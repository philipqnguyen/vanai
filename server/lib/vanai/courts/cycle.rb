module Vanai
  module Courts
    # The council schedule (tmp/courts/PLAN.md 1.3). Everything here runs on
    # the world thread, from Courts.tick, and reads its state from the database
    # every time, so `courts:council_now` from another process (which only moves
    # due_at) and a restart both just work.
    module Cycle
      # name => block(closed, opened), run in registration order inside the
      # boundary's transaction. S1 registers the stipend; later steps add bounty
      # expiry, claim decay and control, letter lapses and the digest.
      BOUNDARY = {}
      # Blocks that must see every other block's work first (the digest, which
      # reports what the others changed), run after BOUNDARY in their own order.
      LATE = {}

      class << self
        def on_boundary(name, last: false, &block)
          (last ? LATE : BOUNDARY)[name.to_s] = block
        end

        def open_cycle
          CouncilCycle.open_cycle.first
        end

        # One pass: create the first cycle if there is none, apply turns that
        # are ready, watch over a turn whose job went missing, and close the
        # cycle when it is due.
        def check!(now = Courts.now)
          cycle = open_cycle || bootstrap!(now)
          supervise_turn!(cycle, now)
          return cycle if now < cycle.due_at
          boundary!(cycle, now) || open_cycle
        end

        # The first cycle has no ledger to read, so it opens with no turn.
        def bootstrap!(now = Courts.now)
          CouncilCycle.create!(number: 1, started_at: now, due_at: now + Courts.config.interval,
                               turn_status: "skipped", dormant: Courts.dormant?)
        rescue ActiveRecord::RecordNotUnique
          open_cycle
        end

        # Closes `closed` and opens the next cycle, once: the conditional
        # closed_at update is the guard, so a second call (or a crash and a
        # retry) does nothing twice. A crash inside rolls the whole boundary
        # back and the next tick redoes it. After downtime there is one boundary
        # and then the normal interval: no catch-up storm of missed cycles.
        # Returns the opened cycle, or nil when it was already closed.
        def boundary!(closed, now = Courts.now)
          dormant = Courts.dormant?
          # News published inside goes out only once the boundary has committed.
          opened = News.hold { close!(closed, now, dormant) }
          return nil unless opened
          Courts.broadcast_cycle!(opened)
          enqueue!(opened) unless dormant
          opened
        end

        # The boundary's transaction. -> the opened cycle, or nil.
        def close!(closed, now, dormant)
          opened = nil
          CouncilCycle.transaction do
            n = CouncilCycle.where(id: closed.id, closed_at: nil).update_all(closed_at: now, updated_at: now)
            raise ActiveRecord::Rollback unless n == 1
            # A turn that never landed inside its own cycle is moot now.
            CouncilCycle.where(id: closed.id, turn_status: %w[pending running ready])
                        .update_all(turn_status: "skipped", updated_at: now)
            opened = CouncilCycle.create!(number: closed.number + 1, started_at: now,
                                          due_at: now + Courts.config.interval,
                                          turn_status: dormant ? "skipped" : "pending", dormant: dormant)
            BOUNDARY.each_value { |block| block.call(closed, opened) }
            LATE.each_value { |block| block.call(closed, opened) }
          end
          opened
        end

        # The open cycle's turn, from the world thread's side: apply it when it
        # is ready; re-enqueue it when its job went missing (enqueued or started
        # longer ago than turn_stale: a restart, a lost Sidekiq job); give up
        # after turn_retries attempts, leaving every court silent this cycle.
        def supervise_turn!(cycle, now = Courts.now)
          status = cycle.turn_status
          if Courts.dormant? && %w[pending running ready].include?(status)
            return CouncilCycle.where(id: cycle.id).update_all(turn_status: "skipped", updated_at: now)
          end
          stale = now - Courts.config.turn_stale
          case status
          when "ready"
            Council.apply_cycle!(cycle)
          when "pending"
            retry!(cycle) if cycle.turn_enqueued_at.nil? || cycle.turn_enqueued_at < stale
          when "running"
            retry!(cycle) if cycle.turn_started_at.nil? || cycle.turn_started_at < stale
          end
        end

        def enqueue!(cycle)
          CouncilCycle.where(id: cycle.id).update_all(turn_enqueued_at: Courts.now, updated_at: Courts.now)
          Courts.job_runner.call(cycle.number)
        end

        private

        def retry!(cycle)
          if cycle.turn_attempts >= Courts.config.turn_retries
            CouncilCycle.where(id: cycle.id, turn_status: %w[pending running])
                        .update_all(turn_status: "failed", updated_at: Courts.now)
            Rails.logger.warn("[courts] cycle #{cycle.number}: council turn failed after #{cycle.turn_attempts} attempts")
          else
            enqueue!(cycle)
          end
        end
      end

      # The stipend: gold per court per cycle, created from nothing so a court
      # can act at low population (COURTS.md "Treasuries and solvency"). It keeps
      # coming while the courts are dormant: treasury income is mechanical.
      on_boundary("stipend") do |_closed, opened|
        amount = Courts.config.stipend
        KEYS.each { |k| Treasury.credit!(k, amount, kind: "stipend", cycle: opened.number) } if amount.positive?
      end
    end
  end
end
