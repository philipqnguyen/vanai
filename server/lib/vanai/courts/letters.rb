module Vanai
  module Courts
    # Letters (COURTS.md "Letters"): a court writes to one explorer, privately.
    # Two kinds, each from its verb:
    #
    #   award_purse      a personal gold reward, paid on delivery; the reason
    #                    is proclaimed (the hall's board, every court window),
    #                    the letter itself is private.
    #   offer_defection  gold to an explorer sworn to a rival court to swear to
    #                    this one instead. The gold is held from the treasury
    #                    when it is written; accepting (anywhere, on the spot)
    #                    switches the explorer and pays it, and uses that
    #                    cycle's one switch; declining or letting it lapse at
    #                    the end of the cycle gives the gold back. Both enter
    #                    the loyalty record.
    #
    # A letter is a row, so an offline explorer gets it at their next login. The
    # court writes the prose (cleaned, length-clamped, names checked against the
    # roster, like a proclamation); the amount and the terms are the verb's and
    # are shown on their own line, so a letter cannot misstate its offer.
    #
    # Offers are private: a rival court learns of one only when it is accepted,
    # from the switch in the next sitting's ledger (Council.ledger_read and the
    # loyalty record filter by viewer for exactly this).
    #
    # Everything that changes a letter runs on the world thread (a council turn,
    # an accept or a decline from the cable, the boundary), so there is one
    # writer; the status changes are conditional updates anyway, so an offer can
    # be answered once.
    module Letters
      class << self
        def cfg = Courts.config.letters

        # The character a court means by `name`: exactly as the roster spells
        # it, without regard to case, with or without the {{ }} a court writes
        # names in. nil for anyone who is not a real explorer.
        def explorer(name)
          n = name.to_s.strip.delete_prefix("{{").delete_suffix("}}").strip
          return nil if n.empty? || n.length > 40
          Character.where("lower(name) = ?", n.downcase).first
        end

        # ---- delivery (inside a council turn's transaction) ----

        # Writes the row and, once the turn has committed, hands it to the
        # explorer if they are online (a card), else it waits for their login.
        def write!(court:, character:, kind:, text:, amount:, cycle:, turn: nil, expires_cycle: nil, held: false)
          letter = CourtLetter.create!(court: court, character_id: character.id, character_name: character.name,
                                       kind: kind, text: text, amount: amount, cycle: cycle,
                                       expires_cycle: expires_cycle, held: held, court_turn_id: turn&.id,
                                       created_at: Courts.now, updated_at: Courts.now)
          News.later do
            # offline: it waits in the table for on_join
            World.to_char(character.id, { t: "court_letter", letter: letter_json(letter), card: true }) if World.find_player(character.id)
          end
          letter
        end

        # ---- the explorer's answers (the world thread, from the cable) ----

        # court_letter_accept: anywhere; the offer open and not lapsed; this
        # cycle's switch unused (Allegiance.switch! is the rule). The switch, the
        # payment and the letter's status commit together or not at all.
        def accept!(char_id, id)
          letter = CourtLetter.find_by(id: id.to_s.to_i, character_id: char_id) # .to_s: the cable may send any type
          why = answer_refusal(letter)
          return refuse(char_id, why) if why
          cycle = Courts.cycle_number
          why = nil
          from = nil
          News.hold do
            CourtLetter.transaction do
              n = CourtLetter.where(id: letter.id, status: CourtLetter::OPEN, held: true)
                             .update_all(status: "accepted", held: false, answered_at: Courts.now, answered_cycle: cycle,
                                         updated_at: Courts.now)
              if n != 1
                why = "That offer is closed."
                raise ActiveRecord::Rollback
              end
              from = Character.where(id: char_id).pick(:court)
              ok, reason = Allegiance.switch!(char_id, letter.court, via: "letter", letter: letter, amount: letter.amount)
              unless ok
                why = reason
                raise ActiveRecord::Rollback
              end
              pay!(char_id, letter, kind: "defection_paid")
              # the old court's members hear of it (COURTS.md "The scripted news")
              name = Character.where(id: char_id).pick(:name)
              News.publish!(kind: "defection", audience: "court", court: from,
                            vars: { "name" => name, "court" => Courts.config.name(letter.court) },
                            payload: { "name" => name, "from" => from, "to" => letter.court })
              letter.reload
              News.later do
                World.to_char(char_id, { t: "court_letter", letter: letter_json(letter), event: "accepted" })
                World.to_char(char_id, { t: "court_notice", kind: "letter_accepted", court: letter.court,
                                         text: "#{Courts.config.name(letter.court)} pays you #{letter.amount} gold." })
              end
            end
          end
          return refuse(char_id, why) if why
          letter
        end

        # court_letter_decline: the gold goes back to the court; the refusal is
        # entered in the loyalty record (the letter's own status).
        def decline!(char_id, id)
          letter = CourtLetter.find_by(id: id.to_s.to_i, character_id: char_id)
          why = answer_refusal(letter, accepting: false)
          return refuse(char_id, why) if why
          done = News.hold do
            CourtLetter.transaction do
              n = CourtLetter.where(id: letter.id, status: CourtLetter::OPEN, held: true)
                             .update_all(status: "declined", held: false, answered_at: Courts.now,
                                         answered_cycle: Courts.cycle_number, updated_at: Courts.now)
              next false unless n == 1
              refund!(letter, Courts.cycle_number)
              letter.reload
              News.later { World.to_char(char_id, { t: "court_letter", letter: letter_json(letter), event: "declined" }) }
              true
            end
          end
          return refuse(char_id, "That offer is closed.") unless done
          letter
        end

        # The window's Letters tab was opened: unread becomes read (an open
        # offer stays open).
        def seen!(char_id)
          CourtLetter.where(character_id: char_id, status: "unread")
                     .update_all(status: "read", updated_at: Courts.now)
        end

        # ---- the boundary ----

        # A defection offer lapses when the cycle it was written in closes: the
        # gold goes back (entered in the closing cycle, so the next council's
        # read sees it), the explorer is told, the record keeps the lapse. Runs
        # while dormant too: open offers run out either way.
        def lapse!(closed)
          CourtLetter.open_offers.where("expires_cycle <= ?", closed.number).order(:id).lock.each do |l|
            l.update!(status: "lapsed", held: false, answered_at: Courts.now, answered_cycle: closed.number)
            refund!(l, closed.number)
            next unless l.character_id
            msg = { t: "court_letter", letter: letter_json(l), event: "lapsed" }
            News.later { World.to_char(l.character_id, msg) }
          end
        end

        # ---- reads ----

        def unread_count(char_id)
          CourtLetter.where(character_id: char_id, status: "unread").count
        end

        # The Letters tab, newest first, a page at a time: -> { letters:, next: }
        # (next: the id to page back from, nil when there is nothing older).
        def for_character(char_id, before_id: nil, limit: Courts.config.page)
          scope = CourtLetter.where(character_id: char_id).order(id: :desc).limit(limit)
          scope = scope.where("id < ?", before_id.to_i) if before_id.present?
          rows = scope.to_a
          { letters: rows.map { |l| letter_json(l) }, next: rows.size == limit ? rows.last&.id : nil }
        end

        # At login: every letter still unread comes with its card (the client
        # shows each card once); the window lists the rest.
        # The first 10 unread each, cut in the query: a long absence can leave
        # hundreds, and every one would be built to be dropped.
        def join_messages(list)
          ranked = CourtLetter.where(character_id: list.map(&:char_id), status: "unread")
                              .select("court_letters.*, ROW_NUMBER() OVER (PARTITION BY character_id ORDER BY id) AS join_rank")
          CourtLetter.from(ranked, :court_letters).where("join_rank <= 10").order(:id).map do |l|
            [l.character_id, { t: "court_letter", letter: letter_json(l), card: true }]
          end
        end

        def letter_json(l)
          { id: l.id, court: l.court, court_name: Courts.config.name(l.court), kind: l.kind, text: l.text,
            amount: l.amount, terms: terms(l), cycle: l.cycle, expires_cycle: l.expires_cycle, status: l.status,
            answered_cycle: l.answered_cycle, at: l.created_at&.iso8601 }.compact
        end

        # The terms line, from the verb's numbers and never from the prose.
        def terms(l)
          # mid-sentence the court's own article is lower case: "for your oath to the Grove Court"
          name = Courts.config.name(l.court).sub(/\AThe /, "the ")
          if l.kind == "purse"
            "Enclosed: #{l.amount} gold from #{name}, paid into your purse on delivery."
          else
            "Terms: #{l.amount} gold, paid when you accept, for your oath to #{name}. Accepting uses this " \
              "sitting's change of court. The offer lapses when sitting #{l.expires_cycle} closes."
          end
        end

        # Gold held out of the treasuries for offers not yet answered.
        def held_gold
          CourtLetter.open_offers.where(held: true).sum(:amount).to_i
        end

        private

        def answer_refusal(letter, accepting: true)
          return "You hold no such offer." unless letter&.defection?
          return "That offer is closed." unless letter.open? && letter.held
          return "That offer has lapsed." if letter.expires_cycle.to_i < Courts.cycle_number
          nil
        end

        def refuse(char_id, why)
          World.to_char(char_id, { t: "court_notice", kind: "refused", text: why })
          nil
        end

        # The explorer's gold, in the database now and in the world's memory
        # once the surrounding hold commits (World.leave writes the memory back,
        # so the two must agree).
        def pay!(char_id, letter, kind:)
          Character.where(id: char_id).update_all(["gold = gold + ?", letter.amount])
          # A purse's gold is debited by award_purse in the same turn. An
          # offer's left the treasury at the hold, so paying it moves nothing
          # there: an event row, for the councils' read.
          unless kind == "purse"
            Treasury.event!(letter.court, kind: kind, character: [char_id, letter.character_name],
                                          meta: { "letter_id" => letter.id, "gold" => letter.amount })
          end
          News.later do
            World.touch(char_id) # offline, a join being read now reads it again
            z, ps = World.find_player(char_id)
            if ps
              ps.gold += letter.amount
              z.mark_self_dirty(ps)
            end
          end
        end

        def refund!(letter, cycle)
          Treasury.release!(letter.court, letter.amount, kind: "defection_refund", cycle: cycle,
                                                         character: [letter.character_id, letter.character_name],
                                                         meta: { "letter_id" => letter.id, "status" => letter.status })
        end

        public

        # award_purse's payment, inside the turn: the gold leaves the treasury
        # and reaches the explorer in one transaction.
        def pay_purse!(letter) = pay!(letter.character_id, letter, kind: "purse")
      end

      # Shared by both letter verbs: the named explorer, the amount in its range,
      # the prose cleaned, and the per-sitting cap on letters.
      module Common
        module_function

        def per_sitting = Letters.cfg.fetch("per_sitting").to_i

        # -> [character, amount, text, notes] or [nil, reason]
        def prepare(input, ctx, range_key)
          return [nil, "only #{per_sitting} letters a sitting"] if ctx[:letters].to_i >= per_sitting
          c = Letters.explorer(input.fetch("name"))
          return [nil, "no explorer is named #{input["name"].to_s[0, 40].inspect}"] unless c
          lo, hi = Letters.cfg.fetch(range_key)
          amount = input.fetch("amount").to_i.clamp(lo, hi)
          notes = []
          notes << "amount clamped to #{amount}" if amount != input.fetch("amount").to_i
          raw = input.fetch("text").to_s
          cap = Courts.config.text_caps.fetch("letter")
          text = Text.clean(raw, max: cap)
          return [nil, "nothing readable left in the letter"] if text.empty?
          notes << "letter cut to #{cap} characters" if text.end_with?(Text::ELLIPSIS) && !raw.strip.end_with?(Text::ELLIPSIS)
          [c, amount, text, notes]
        end
      end

      # award_purse: a personal gold reward to a named explorer, delivered as a
      # letter, its reason proclaimed (COURTS.md "Verbs"). Paid from the
      # treasury at once.
      module AwardPurse
        module_function

        def tool
          lo, hi = Letters.cfg.fetch("purse")
          {
            name: "award_purse",
            description: "Reward a named explorer with gold from your treasury, paid at once, with a sealed letter in your " \
                         "voice. The letter is private; the reason is proclaimed in your hall and every court window. " \
                         "#{lo} to #{hi} gold (clamped). Any explorer may be rewarded, sworn to you or not. The amount and " \
                         "the terms are written under the letter by your clerk: do not restate them. At most " \
                         "#{Common.per_sitting} letters (purses and offers together) a sitting; a letter at most " \
                         "#{Courts.config.text_caps.fetch("letter")} characters, the reason at most " \
                         "#{Courts.config.text_caps.fetch("proclamation")}, plain prose, any other player's name as {{Name}}.",
            input_schema: {
              type: "object",
              properties: {
                name: { type: "string", description: "The explorer's name, exactly as the roster spells it." },
                amount: { type: "integer", description: "Gold to pay them." },
                reason: { type: "string", description: "Why, proclaimed publicly. Write their name as {{Name}}." },
                text: { type: "string", description: "The private letter to them." }
              },
              required: %w[name amount reason text],
              additionalProperties: false
            }
          }
        end

        def once_per_turn? = false

        def clamp(_court, input, ctx)
          c, amount, text, notes = Common.prepare(input, ctx, "purse")
          return [false, nil, amount] unless c
          raw = input.fetch("reason").to_s
          reason = Text.clean(raw, max: Courts.config.text_caps.fetch("proclamation"))
          return [false, nil, "nothing readable left in the reason"] if reason.empty?
          [true, { "character_id" => c.id, "name" => c.name, "amount" => amount, "reason" => reason, "text" => text },
           notes.empty? ? nil : notes.join("; ")]
        end

        def cost(clamped) = clamped.fetch("amount")

        def apply!(court, clamped, ctx)
          ctx[:letters] = ctx[:letters].to_i + 1
          c = Character.find_by(id: clamped.fetch("character_id"))
          return { "letter_id" => nil, "error" => "the explorer is gone" } unless c
          cycle = ctx[:cycle] || Courts.cycle_number
          taken = Treasury.debit!(court, clamped["amount"], kind: "purse", cycle: ctx[:cycle], character: c,
                                                            meta: { "reason" => clamped["reason"] })
          return { "letter_id" => nil, "error" => "the treasury could not cover it" } unless taken
          letter = Letters.write!(court: court, character: c, kind: "purse", text: clamped["text"],
                                  amount: clamped["amount"], cycle: cycle, turn: ctx[:turn])
          Letters.pay_purse!(letter)
          # the reason, proclaimed: on the board, read by the herald, in News
          p = Proclamation.create!(court: court, cycle: cycle, text: clamped["reason"], court_turn_id: ctx[:turn]&.id,
                                   created_at: Courts.now)
          News.publish!(kind: "proclamation", audience: "all", court: court, text: p.text,
                        payload: { "proclamation_id" => p.id, "court_name" => Courts.config.name(court), "purse" => true })
          { "letter_id" => letter.id, "proclamation_id" => p.id }
        end
      end

      # offer_defection: gold to a named explorer of a rival court to switch,
      # delivered as a letter (COURTS.md "Verbs"). Held from the treasury now;
      # paid on acceptance, returned on a decline or the lapse.
      module OfferDefection
        module_function

        def tool
          lo, hi = Letters.cfg.fetch("defection")
          {
            name: "offer_defection",
            description: "Offer a named explorer sworn to a rival court gold to swear to you instead, in a sealed letter. " \
                         "#{lo} to #{hi} gold (clamped), held from your treasury now (it counts toward this sitting's " \
                         "commit limit). If they accept before this sitting ends they are sworn to you on the spot and " \
                         "paid; if they decline, or let it lapse when the sitting ends, the gold comes back. Accepting " \
                         "uses their one change of court this sitting. Nobody else learns of an offer unless it is " \
                         "accepted. One open offer per explorer. The amount and the terms are written under the letter by " \
                         "your clerk: do not restate them. Shares the limit of #{Common.per_sitting} letters a sitting.",
            input_schema: {
              type: "object",
              properties: {
                name: { type: "string", description: "The explorer's name, exactly as the roster spells it." },
                amount: { type: "integer", description: "Gold offered." },
                text: { type: "string", description: "The private letter to them." }
              },
              required: %w[name amount text],
              additionalProperties: false
            }
          }
        end

        def once_per_turn? = false

        def clamp(court, input, ctx)
          c, amount, text, notes = Common.prepare(input, ctx, "defection")
          return [false, nil, amount] unless c
          return [false, nil, "#{c.name} is already sworn to you"] if c.court == court
          if CourtLetter.open_offers.where(court: court, character_id: c.id).exists?
            return [false, nil, "an offer to #{c.name} is already open"]
          end
          [true, { "character_id" => c.id, "name" => c.name, "amount" => amount, "text" => text },
           notes.empty? ? nil : notes.join("; ")]
        end

        def cost(clamped) = clamped.fetch("amount")

        def apply!(court, clamped, ctx)
          ctx[:letters] = ctx[:letters].to_i + 1
          c = Character.find_by(id: clamped.fetch("character_id"))
          return { "letter_id" => nil, "error" => "the explorer is gone" } unless c
          cycle = ctx[:cycle] || Courts.cycle_number
          letter = Letters.write!(court: court, character: c, kind: "defection", text: clamped["text"],
                                  amount: clamped["amount"], cycle: cycle, turn: ctx[:turn], expires_cycle: cycle, held: true)
          # the apply step checked the treasury inside this transaction with the
          # court's row locked; if the hold ever fell short the letter goes too
          taken = Treasury.hold!(court, clamped["amount"], kind: "defection_hold", cycle: ctx[:cycle], character: c,
                                                           meta: { "letter_id" => letter.id })
          unless taken
            letter.destroy!
            return { "letter_id" => nil, "error" => "the treasury could not cover the hold" }
          end
          { "letter_id" => letter.id, "held" => clamped["amount"] }
        end
      end
    end

    # Offers lapse at the boundary that closes their cycle, after the bounties'
    # expiry (registration order).
    Cycle.on_boundary("letters") { |closed, _opened| Letters.lapse!(closed) }

    GoldLog.held("letters") { Letters.held_gold }
  end
end
