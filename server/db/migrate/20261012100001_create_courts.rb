# The three city courts' rows (COURTS.md "Treasuries and solvency") and the
# small key/value table the courts keep their world-wide flags in (dormant, the
# day of the last gold log, the Capital's leading court).
#
# The seed values are frozen here as they stood when this was written: a
# migration must mean the same thing whenever it runs. Vanai::Courts.ensure_courts!
# inserts the same rows (from courts.json) when a database was built from
# schema.rb, which never runs this seed.
class CreateCourts < ActiveRecord::Migration[8.1]
  SEEDS = [
    %w[caerdun The\ Court\ of\ Caerdun],
    %w[heartwood The\ Grove\ Court\ of\ Heartwood],
    %w[moonmere The\ Academy\ Court\ of\ Moonmere]
  ].freeze
  START_TREASURY = 2000
  RELIC_PRICES = { "documents" => 40, "goods" => 40, "surveys" => 40 }.freeze
  RELIC_BUDGET = 1200

  def up
    create_table :courts do |t|
      t.string :key, null: false
      t.string :name, null: false
      # Gold, changed only by atomic increments with a ledger row in the same
      # transaction (Vanai::Courts::Treasury), so it can never go negative.
      t.bigint :treasury, null: false, default: 0
      # The auction rate in basis points: 300 = 3%.
      t.integer :tax_bp, null: false, default: 300
      t.jsonb :relic_prices, null: false, default: {}
      t.integer :relic_budget, null: false, default: 0
      t.timestamps
    end
    add_index :courts, :key, unique: true
    add_check_constraint :courts, "treasury >= 0", name: "courts_treasury_never_negative"
    add_check_constraint :courts, "tax_bp BETWEEN 100 AND 1500", name: "courts_tax_bp_range"

    create_table :court_flags do |t|
      t.string :key, null: false
      t.jsonb :value
      t.datetime :updated_at, null: false
    end
    add_index :court_flags, :key, unique: true

    SEEDS.each do |key, name|
      execute <<~SQL.squish
        INSERT INTO courts (key, name, treasury, tax_bp, relic_prices, relic_budget, created_at, updated_at)
        VALUES (#{connection.quote(key)}, #{connection.quote(name)}, #{START_TREASURY}, 300,
                #{connection.quote(RELIC_PRICES.to_json)}::jsonb, #{RELIC_BUDGET}, now(), now())
        ON CONFLICT (key) DO NOTHING
      SQL
    end
  end

  def down
    drop_table :court_flags
    drop_table :courts
  end
end
