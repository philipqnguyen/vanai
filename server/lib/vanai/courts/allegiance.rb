module Vanai
  module Courts
    # Allegiance (COURTS.md "Allegiance"): every character is sworn to exactly
    # one court, always, and may switch at most once per council cycle. The rule
    # lives in the database (characters.court_switched_cycle), not the world's
    # memory, so a restart cannot hand anyone a second switch. No home-turf
    # advantage anywhere, and claims already earned stay with the court they were
    # earned for (contributions carry their own court).
    module Allegiance
      class << self
        def switch_available?(character, cycle = Courts.cycle_number)
          character.court_switched_cycle != cycle
        end

        # A new character is sworn to their starting city's court (the column is
        # set by Character.provision!); this writes the record's first line.
        def record_creation!(character)
          AllegianceChange.create!(character_id: character.id, character_name: character.name, from_court: nil,
                                   to_court: character.court, cycle: Courts.cycle_number, via: "creation",
                                   created_at: Courts.now)
        end

        # World thread. -> [true, nil] or [false, reason]. `via` is "hall" (a
        # swearing desk) or "letter" (an accepted defection offer, which uses the
        # cycle's switch the same way).
        def switch!(char_id, to_court, via:, letter: nil, amount: 0)
          return [false, "There is no such court."] unless KEYS.include?(to_court)
          cycle = Courts.cycle_number
          result = Character.transaction do
            c = Character.lock.find_by(id: char_id)
            next [false, "No such character."] unless c
            next [false, "You are already sworn to #{Text.mid(Courts.config.name(to_court))}."] if c.court == to_court
            next [false, "You have already changed courts this sitting."] unless switch_available?(c, cycle)
            from = c.court
            c.update_columns(court: to_court, court_switched_cycle: cycle, updated_at: Time.current)
            AllegianceChange.create!(character_id: c.id, character_name: c.name, from_court: from, to_court: to_court,
                                     cycle: cycle, via: via, court_letter_id: letter&.id, amount: amount.to_i,
                                     created_at: Courts.now)
            meta = { "from" => from, "to" => to_court, "via" => via }
            [from, to_court].each { |k| Treasury.event!(k, kind: "swear", cycle: cycle, character: c, meta: meta) }
            Bounties.forfeit!(c.id, from)
            [true, nil]
          end
          return result unless result.first
          # After the commit: an accepted letter runs this inside its own
          # transaction (the switch, the payment and the letter together), so the
          # world's memory and the messages wait for that one (News.later sends
          # at once when nothing is holding).
          News.later do
            World.touch(char_id) # offline, a join being read now reads it again
            _z, ps = World.find_player(char_id)
            ps.court = to_court if ps
            World.to_char(char_id, { t: "court_swore", court: to_court, court_name: Courts.config.name(to_court), via: via })
            World.to_char(char_id, Courts.state_payload(char_id))
          end
          result
        end

        # The swearing desk (COURTS.md "Allegiance"): a character switches at
        # another court's hall, standing at its swearing desk, at most once per
        # council cycle. World thread (the court_swear cable action). The desk of
        # your own court swears nobody to anything. A refusal comes back as a
        # court_notice, never a chat line.
        def swear_at_hall(char_id, court)
          z, ps = World.find_player(char_id)
          return unless ps && ps.alive?
          desk = Halls.desk(z.definition, court.to_s)
          why = if !desk then "Swear at that court's own desk, in its audience hall."
                elsif (r = Halls.refusal(z, ps, desk)) then r
                elsif ps.court == court then "You are already sworn to #{Text.mid(Courts.config.name(court))}."
                end
          why ||= begin
            ok, reason = switch!(char_id, court, via: "hall")
            ok ? nil : reason
          end
          World.to_char(char_id, t: "court_notice", kind: "refused", text: why) if why
          why.nil?
        end

        # The loyalty record (COURTS.md "The loyalty record"), built from the
        # rows the ledger keeps: the courts sworn to and the cycles spent in
        # each, every defection offer taken, declined or left to lapse, and how
        # soon a paid switch was followed by another. There is no standing and
        # no mechanical lock: judging who will stay bought is the courts' job.
        #
        # viewer: nil for the explorer's own view (the court window: everything);
        # a court key for what that court may see (the council's roster). Offers
        # are private, so a court sees its own offers and, of its rivals', only
        # the ones that were accepted (the switch is in everyone's ledger); and
        # the gold of a paid switch only when it paid it. A court also sees how
        # its own past offers paid off ("paid Aldo 300, he left two cycles
        # later": `stayed`, `left`).
        #
        # Bounded (Philip, 2026-10-12): the totals cover the whole history,
        # the lists only the newest `recent` entries, so a long record stays
        # one size in the window and in the council's prompt. The window pages
        # back with `sworn_before` (the position of the oldest change shown,
        # oldest first from 0) and `letters_before` (the oldest letter's id);
        # `sworn_next` and `letters_next` are where the next page starts (nil:
        # nothing older).
        def loyalty_record(char_id, viewer: nil, recent: Courts.config.page, sworn_before: nil, letters_before: nil)
          now_cycle = Courts.cycle_number
          # one row per change of court, at most one a sitting: read whole for
          # the totals and the cycles each lasted
          rows = AllegianceChange.where(character_id: char_id).order(:created_at, :id).to_a
          sworn = rows.each_with_index.map do |r, i|
            nxt = rows[i + 1]
            until_cycle = nxt&.cycle || now_cycle
            e = { "court" => r.to_court, "from_court" => r.from_court, "via" => r.via, "cycle" => r.cycle,
                  "cycles" => [until_cycle - r.cycle, 0].max, "at" => r.created_at&.iso8601 }
            e["amount"] = r.amount.to_i if viewer.nil? || viewer == r.to_court
            # a paid switch: how long it held (nil left_after: still sworn there)
            e["left_after"] = nxt && [nxt.cycle - r.cycle, 0].max if r.via == "letter"
            e
          end
          cycles_in = sworn.each_with_object(Hash.new(0)) { |e, h| h[e["court"]] += e["cycles"] }
          letters = CourtLetter.where(character_id: char_id)
          letters = letters.where("court = ? OR (kind = 'defection' AND status = 'accepted')", viewer) if viewer
          # the totals, in the database: however many letters there have been
          by = letters.group(:kind, :status).count
          offers_total = by.select { |(k, _), _| k == "defection" }
                           .each_with_object(Hash.new(0)) { |((_, st), n), h| h[CourtLetter::OPEN.include?(st) ? "open" : st] += n }
          purses = letters.where(kind: "purse")
          page = letters.order(id: :desc).limit(recent)
          page = page.where("id < ?", letters_before.to_i) if letters_before.present?
          page = page.to_a
          offers = []
          purse_rows = []
          page.each do |l|
            if l.kind == "purse"
              purse_rows << { "court" => l.court, "amount" => l.amount, "cycle" => l.cycle }
              next
            end
            o = { "court" => l.court, "cycle" => l.cycle, "status" => l.open? ? "open" : l.status,
                  "answered_cycle" => l.answered_cycle }
            o["amount"] = l.amount if viewer.nil? || viewer == l.court
            if l.status == "accepted"
              # how the offer paid off: the cycles the explorer stayed, and whether they have left since
              taken = rows.index { |r| r.court_letter_id == l.id }
              if taken
                o["stayed"] = sworn[taken]["cycles"]
                o["left"] = !rows[taken + 1].nil?
              end
            end
            offers << o.compact
          end
          upto = sworn_before.nil? ? sworn.size : sworn_before.to_i.clamp(0, sworn.size)
          from = [upto - recent, 0].max
          { "sworn" => sworn[from...upto], "cycles_in" => cycles_in, "offers" => offers, "purses" => purse_rows,
            "paid_switches" => sworn.count { |e| e["via"] == "letter" },
            "totals" => { "changes" => sworn.size, "offers" => offers_total, "purses" => purses.count,
                          "purse_gold" => purses.sum(:amount).to_i },
            "sworn_next" => from.positive? ? from : nil,
            "letters_next" => page.size == recent ? page.last&.id : nil }
        end
      end
    end
  end
end
