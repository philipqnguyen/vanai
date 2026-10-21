# The claims race (COURTS.md "Claims"): each court's claim in each of the 15
# wild zones grows from its sworn members' work there and decays each cycle;
# control goes to the highest claim at the cycle boundary.
#
# Shared world state, on purpose (COURTS.md "Global state, on purpose"):
# zone_claims is one row per zone and court, zone_controls the control
# snapshot per cycle. claim_contributions is the per-character ledger the
# per-cycle cap is counted from; each row keeps the court it was earned for, so
# a claim earned stays with that court after its earner switches.
class CreateClaims < ActiveRecord::Migration[8.1]
  # The contested zones when this was written (every field zone but the empty
  # Capital), frozen here so the seed does not depend on data that may move.
  # Courts::Claims upserts anyway, so a zone added later needs no migration.
  ZONES = %w[caerdunfields heartwoodfields moonmereshores northroad shoreroad huntingwood timberestates
             summerlakes reservoir kingsgardens glassworks canalworks granaryplains borderwall burnedland].freeze
  COURTS = %w[caerdun heartwood moonmere].freeze

  def change
    create_table :zone_claims do |t|
      t.string :zone, null: false
      t.string :court, null: false
      t.float :points, null: false, default: 0 # decay makes fractions
      t.datetime :updated_at, null: false
    end
    add_index :zone_claims, %i[zone court], unique: true
    add_check_constraint :zone_claims, "points >= 0", name: "zone_claims_points_nonnegative"

    # One row per contested zone per cycle, written at the boundary that opens
    # the cycle: the court in control (null: nobody has points) and the three
    # totals it was decided on, for the digest and the ledger.
    create_table :zone_controls do |t|
      t.integer :cycle, null: false
      t.string :zone, null: false
      t.string :court
      t.jsonb :points, null: false, default: {}
      t.datetime :created_at, null: false
    end
    add_index :zone_controls, %i[cycle zone], unique: true

    # What one character earned for one court in one zone in one cycle (the
    # per-character cap is the sum over a cycle), and what the cap refused.
    create_table :claim_contributions do |t|
      t.references :character, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.integer :cycle, null: false
      t.string :zone, null: false
      t.string :court, null: false
      t.float :points, null: false, default: 0
      t.float :capped, null: false, default: 0   # refused by the cap, kept for tuning
      t.float :exempt, null: false, default: 0   # part of `points` the cap does not count (named relics)
      t.datetime :updated_at, null: false
    end
    add_index :claim_contributions, %i[character_id cycle zone court], unique: true, name: "index_claim_contributions_unique"
    add_index :claim_contributions, %i[cycle zone]

    # A war chest (S6's fund_push): the court's claim gains in one zone doubled
    # from one cycle to another, both included.
    create_table :court_pushes do |t|
      t.string :court, null: false
      t.string :zone, null: false
      t.integer :from_cycle, null: false
      t.integer :to_cycle, null: false
      t.integer :amount, null: false, default: 0
      t.references :court_turn, foreign_key: { on_delete: :nullify }
      t.datetime :created_at, null: false
    end
    add_index :court_pushes, %i[zone to_cycle]

    reversible do |dir|
      dir.up do
        values = ZONES.product(COURTS).map { |z, c| "(#{quote(z)}, #{quote(c)}, 0, now())" }.join(", ")
        execute "INSERT INTO zone_claims (zone, court, points, updated_at) VALUES #{values} ON CONFLICT (zone, court) DO NOTHING"
      end
    end
  end

  private

  def quote(s) = connection.quote(s)
end
