module Api
  # The court window's and the hall panels' reads (tmp/courts/PLAN.md 3.2).
  # Read-only: what they show is public (the board) or the character's own (the
  # allegiance tab, their News). Everything that changes state -- swearing,
  # marking news seen -- goes through the cable and is checked on the world
  # thread, where reach is known.
  class CourtsController < BaseController
    before_action :require_character!

    C = Vanai::Courts

    # The Allegiance tab: the character's court, this cycle's switch, the cycle,
    # the three courts as the window shows them, and the loyalty record (its
    # totals and newest entries; GET courts/record pages back).
    def index
      c = current_character
      number = C.cycle_number
      courts = Court.order(:key).map do |row|
        # a treasury is shown rounded to the hundred: the window is not a ledger
        { key: row.key, name: C.config.name(row.key), short: C.config.court(row.key)["short"],
          tax_bp: C.tax_table[row.key], treasury: (row.treasury.to_i / 100) * 100,
          control_count: C::Claims.counts[row.key] }
      end
      render json: {
        court: c.court, court_name: C.config.name(c.court), switch_used: c.court_switched_cycle == number,
        cycle: number, cycle_ends_in: C.cycle_ends_in, dormant: C.dormant?, courts: courts,
        loyalty: C::Allegiance.loyalty_record(c.id), control: C::Claims.control
      }
    end

    # The Allegiance tab's "Older": the record's next page back, the changes
    # of court (sworn_before) or the offers and purses (letters_before).
    def record
      r = C::Allegiance.loyalty_record(current_character.id, sworn_before: params[:sworn_before],
                                                             letters_before: params[:letters_before])
      render json: params[:sworn_before].present? ? r.slice("sworn", "sworn_next") : r.slice("offers", "purses", "letters_next")
    end

    # The News tab: world items and the character's own court's, newest first.
    def news
      c = current_character
      render json: C::News.page(c.court, before_id: params[:before_id], limit: params[:limit] || C.config.page)
    end

    # The character's bounties in hand (the journal's court group). Collect
    # bounties read their count from the bags, as the hand-in will.
    def bounties
      render json: { bounties: C::Bounties.active_for(current_character.id), cycle: C.cycle_number }
    end

    # The book of names: the named relics registered with a court (or all
    # three), 20 a page, filterable by zone. Public, like the plaque it is.
    def book
      court = params[:court].presence
      return render json: { error: "There is no such court." }, status: :not_found if court && !C::KEYS.include?(court)
      zone = params[:zone].presence
      zone = nil unless zone && C::Claims.zones.include?(zone)
      render json: C::Relics.book(court: court, zone: zone, page: params[:page] || 1).merge(court: court)
    end

    # The Letters tab: the character's purses and defection offers, newest
    # first, each with its terms line (built from the verb's amount, never from
    # the court's prose) and whether this sitting's switch is still free. A
    # page at a time (before_id: the oldest shown; next: nil when no older).
    def letters
      c = current_character
      page = C::Letters.for_character(c.id, before_id: params[:before_id])
      render json: { letters: page[:letters], next: page[:next], switch_used: c.court_switched_cycle == C.cycle_number,
                     court: c.court, cycle: C.cycle_number }
    end

    # One court's board, ~20 a page, keyset by (created_at, id).
    def board
      court = params[:court].to_s
      return render json: { error: "There is no such court." }, status: :not_found unless C::KEYS.include?(court)
      page = C::Board.page(court, before: params[:before], limit: params[:limit] || C.config.page)
      render json: page.merge(court: court, court_name: C.config.name(court), taken: C::Bounties.taken(current_character.id, page))
    end
  end
end
