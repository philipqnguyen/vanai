module Vanai
  module Courts
    # What control gives the controlling court's sworn members, in that zone
    # (COURTS.md "Benefits for the controlling court's members"): half fare to
    # the zone's crystal, half price at the zone's vendor, +50% monster drop
    # chance, and a 25% roll for one more item at a gathering node. Every wild
    # zone has exactly one crystal and one vendor, so each applies cleanly.
    #
    # In the controlled wild zone itself, not in its dungeons
    # (tmp/courts/PLAN.md question 3): a dungeon's work credits its parent's
    # claim, but the benefits say "in that zone".
    #
    # Everything here reads Claims.control, the frozen snapshot swapped at the
    # boundary, so the vendor's request thread may ask too.
    module Benefits
      class << self
        # Tests seed this; the drop bands take combat's own rng instead.
        attr_writer :rng

        def rng = @rng || Random
        def cfg = Courts.config.benefits

        # Is `court` the court in control of `zone` (a contested zone)?
        def member?(court, zone)
          !court.nil? && Courts.contested?(zone) && Claims.control[zone] == court
        end

        # The crystal fare to `dest_zone` (World.milestone_travel and the
        # crystal menu): half, the half gold rounded up, for a member of the
        # court that controls it. Going home stays free.
        def fare(ps, dest_zone, fare)
          return fare unless fare.to_i.positive? && member?(Claims.sworn(ps), dest_zone)
          off(fare, cfg["fare_discount"])
        end

        # The price at the zone's vendor (game_controller#vendor, buy). A
        # request thread: `char` is the Character row. Selling is unchanged.
        def vendor_price(char, zone, price)
          return price unless price.to_i.positive? && member?(char.court, zone)
          off(price, cfg["vendor_discount"])
        end

        # One drop of a monster's table (Combat.award_loot), still one roll,
        # widened into two bands. Under the drop chance the item drops as it
        # always has and the block picks the recipient from every member.
        # Between the chance and 1.5x the chance (capped at certain) it drops
        # only if some member's court controls the zone, and only such a member
        # can receive it: one qualifying member or six is still 1.5x, and a
        # party without one gets exactly what it would without the bonus.
        # -> the recipient, or nil when nothing drops.
        def drop_recipient(zone, members, drop, roll = rng)
          chance = drop["chance"].to_f
          r = roll.rand
          return yield(members) if r < chance
          return nil unless r < [chance * cfg["drop_bonus"], 1.0].min
          pool = members.select { |p| member?(Claims.sworn(p), zone.key) }
          pool.empty? ? nil : yield(pool)
        end

        # Extra items from a gathering node picked by a member (+1 on a 25% roll).
        def gather_bonus(ps, zone_key)
          return 0 unless member?(Claims.sworn(ps), zone_key) && rng.rand < cfg["gather_chance"]
          cfg["gather_extra"].to_i
        end

        private

        # The discounted price, the odd half gold rounded up (rounded to a
        # millionth first, so 10 x 0.7 is 7 and not 8).
        def off(price, discount)
          (price.to_i * (1.0 - discount)).round(6).ceil
        end
      end
    end
  end
end
