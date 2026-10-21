module Vanai
  module Courts
    # The daily gold-in-circulation row (COURTS.md "Treasuries and solvency").
    # The courts change the economy's shape on purpose (the tax is no longer
    # destroyed, the stipend creates gold, the member discounts remove sinks),
    # so it is watched from data rather than guessed at. One row per UTC day,
    # written by the first world tick of the day.
    module GoldLog
      # name => -> { gold }: gold held out of treasuries for promises not yet
      # kept. Bounties (S3) and defection offers (S6) register theirs.
      HELD = {}

      class << self
        def held(name, &block)
          HELD[name.to_s] = block
        end

        # Writes today's row if it is not there yet. -> the row or nil.
        def tick!(now = Courts.now)
          day = now.utc.to_date
          return nil if CourtFlag.get("gold_log_day") == day.iso8601
          row = snapshot!(day, now)
          CourtFlag.set("gold_log_day", day.iso8601)
          row
        end

        def snapshot!(day, now = Courts.now)
          since = GoldCirculation.where("day < ?", day).order(day: :desc).pick(:created_at)
          minted = CourtLedgerEntry.where(kind: "stipend")
          minted = minted.where("created_at > ?", since) if since
          attrs = {
            day: day, cycle: Courts.cycle_number,
            characters_gold: Character.sum(:gold), treasuries_gold: Court.sum(:treasury),
            held_gold: HELD.values.sum { |b| b.call.to_i },
            listed_gold: AuctionListing.where(status: AuctionListing::ACTIVE).sum(:price),
            # gold created from nothing since the previous row: the stipend
            minted: minted.sum(:amount), burned: nil, created_at: now
          }
          GoldCirculation.upsert(attrs, unique_by: :day)
          GoldCirculation.find_by(day: day)
        end
      end
    end
  end
end
