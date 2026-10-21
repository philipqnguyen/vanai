module Vanai
  module Courts
    # Court gold. A treasury is a database row, never an in-memory number,
    # because two kinds of writer touch it: auction purchases in request handlers
    # and council payouts on the world thread (COURTS.md "Treasuries and
    # solvency"). Every change is one atomic UPDATE ... RETURNING with its ledger
    # row in the same transaction, and a debit is conditional on the balance, so
    # two concurrent debits can never overdraw it (the check constraint is the
    # backstop).
    module Treasury
      class << self
        # Adds gold. Returns the new balance.
        def credit!(court, amount, kind:, cycle: nil, character: nil, zone: nil, meta: {})
          amount = amount.to_i
          raise ArgumentError, "a credit is positive" unless amount.positive?
          transaction do
            balance = update_returning("treasury = treasury + #{amount}", court)
            raise ArgumentError, "unknown court #{court.inspect}" unless balance
            entry!(court, amount, balance, kind: kind, cycle: cycle, character: character, zone: zone, meta: meta)
            balance
          end
        end

        # Takes gold out. Returns the amount taken: `amount`, or nil when the
        # treasury holds less (nothing is taken). With allow_partial it takes what
        # there is instead, which may be 0 (then no ledger row is written).
        def debit!(court, amount, kind:, cycle: nil, character: nil, zone: nil, meta: {}, allow_partial: false)
          amount = amount.to_i
          raise ArgumentError, "a debit is positive" unless amount.positive?
          transaction do
            balance = update_returning("treasury = treasury - #{amount}", court, "AND treasury >= #{amount}")
            taken = amount
            if balance.nil?
              next nil unless allow_partial
              # Lock the row so the amount read is the amount taken.
              have = Court.where(key: court).lock.pick(:treasury)
              raise ArgumentError, "unknown court #{court.inspect}" if have.nil?
              taken = [have, amount].min
              next 0 if taken.zero?
              balance = update_returning("treasury = treasury - #{taken}", court, "AND treasury >= #{taken}")
            end
            entry!(court, -taken, balance, kind: kind, cycle: cycle, character: character, zone: zone, meta: meta)
            taken
          end
        end

        # Gold set aside from the treasury for a promise not yet kept (a bounty's
        # places, a defection offer). The same atomic debit, under its own kind.
        def hold!(court, amount, kind:, **opts) = debit!(court, amount, kind: kind, **opts)

        # A hold returned unspent (an expired bounty, a declined offer).
        def release!(court, amount, kind:, **opts) = credit!(court, amount, kind: kind, **opts)

        # An event row: no gold moves (a tax change, a swearing). The councils
        # read these beside the money.
        def event!(court, kind:, cycle: nil, character: nil, zone: nil, meta: {})
          entry!(court, 0, nil, kind: kind, cycle: cycle, character: character, zone: zone, meta: meta)
        end

        def balance(court)
          Court.where(key: court).pick(:treasury)
        end

        private

        # Joins the caller's transaction (an auction buy, a council apply) when
        # there is one, so the treasury and the caller's own rows commit together.
        def transaction(&block)
          Court.transaction(&block)
        end

        def update_returning(set, court, condition = "")
          sql = "UPDATE courts SET #{set}, updated_at = now() WHERE key = #{Court.connection.quote(court)} #{condition} RETURNING treasury"
          Court.connection.select_value(sql)&.to_i
        end

        def entry!(court, amount, balance, kind:, cycle:, character:, zone:, meta:)
          id, name = character_ref(character)
          CourtLedgerEntry.create!(
            court: court, cycle: cycle || Courts.cycle_number, kind: kind.to_s, amount: amount,
            balance_after: balance, character_id: id, character_name: name, zone: zone,
            meta: meta || {}, created_at: Courts.now
          )
        end

        def character_ref(character)
          case character
          when nil then [nil, nil]
          when Character then [character.id, character.name]
          when Array then character
          else
            [character.char_id, character.name] # a PlayerState
          end
        end
      end
    end
  end
end
