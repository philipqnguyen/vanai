module Vanai
  # How far one player may have moved since the world last heard from them.
  #
  # The client walks itself and reports where it stands (ZoneChannel#move); the
  # world used to take that on trust, so every range, reach and portal check was
  # measured from a position the client chose. This is the speed limit on it: a
  # distance budget that refills at the fastest a character can run and is spent
  # by every accepted step. A budget, not a per-message speed, because WebSocket
  # frames arrive bunched -- a stalled line delivers two seconds of 10 Hz moves
  # in one tick -- and a per-message check would clamp an honest player for the
  # network's hiccup.
  #
  # One per character, held by World and thrown away on every join and leave,
  # so a zone change, a portal, a crystal, a release, a ferry crossing or /tp
  # (all of which leave and rejoin) starts from the server's own placement with
  # a full budget.
  class MoveCheck
    # The fastest anything moves a character: client/src/world.ts tickMovement
    # (`const speed = 8.0`). Autorun runs at the same speed, there is no sprint,
    # and nothing in abilities.json or items.json changes movement speed.
    RUN_SPEED = 8.0
    # Over the run speed, for the client's frame times measured against the
    # server's arrival times. Above 1, so a clamped player also catches up.
    SPEED_SLACK = 1.25
    # Seconds of running the budget holds: the most network jitter (and the
    # 10 Hz send interval inside it) absorbed before anything is clamped. It is
    # also the farthest a cheat can blink at once after standing still.
    BURST_SECONDS = 2.0
    CAP = RUN_SPEED * SPEED_SLACK * BURST_SECONDS

    attr_reader :budget
    # where the client last asked to be, while the world is still walking them
    # there (clamp policy): [x, z, heading, anim]; and when the world last
    # told the client where it stands (World.correct_position)
    attr_accessor :pending, :flagged, :logged_at, :corrected_at

    def initialize
      @budget = CAP
      @at = nil
      @flagged = 0
      @logged_at = nil
    end

    # The point of a step from (x0, z0) toward (x1, z1) the budget allows at
    # `now`, and whether it was cut short. Spends what it allows; `clamp: false`
    # refuses a step too long for the budget outright and spends nothing.
    def step(x0, z0, x1, z1, now, clamp: true)
      @budget = [@budget + (now - @at) * RUN_SPEED * SPEED_SLACK, CAP].min if @at
      @at = now
      d = Math.hypot(x1 - x0, z1 - z0)
      if d <= @budget
        @budget -= d
        return [x1, z1, false]
      end
      return [x0, z0, true] unless clamp
      f = @budget / d
      @budget = 0.0
      [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, true]
    end

    # Gives back what a step spent when the world then refused it (a wall, the
    # ship's rail): a refusal is not a metre run.
    def refund(d)
      @budget = [@budget + d, CAP].min
    end
  end
end
