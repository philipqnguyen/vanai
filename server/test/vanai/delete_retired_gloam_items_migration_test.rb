require 'minitest/autorun'
require 'active_record'
require 'json'
require_relative '../../lib/vanai/data'
require_relative '../../db/migrate/20261018120001_delete_retired_gloam_items'

# The migration deletes every stored copy of the two retired Gloam items. Its
# keys are frozen in the migration, so this pins them to the data: both are
# gone from items.json and nothing in shared/data names them. No database
# here -- the SQL is captured, as the other vanai tests do.
class DeleteRetiredGloamItemsMigrationTest < Minitest::Test
  M = DeleteRetiredGloamItems

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
  end

  def sql_of(direction)
    migration = M.new
    sql = []
    quote = Object.new
    def quote.quote(s) = "'#{s}'"
    migration.define_singleton_method(:execute) { |q| sql << q }
    migration.define_singleton_method(:connection) { quote }
    migration.public_send(direction)
    sql
  end

  def test_keys_are_retired_and_named_nowhere
    data = File.expand_path('../../../shared/data', __dir__)
    M::KEYS.each do |key|
      refute Vanai::Data.items.key?(key), "#{key} should be retired"
      Dir[File.join(data, '**', '*.json')].each do |f|
        refute_includes File.read(f), "\"#{key}\"", "#{File.basename(f)} still names #{key}"
      end
    end
  end

  def test_up_clears_every_item_key_column_and_down_does_nothing
    up = sql_of(:up).join("\n")
    %w[inventory_items auction_listings relic_registrations mail_letters].each { |t| assert_includes up, t }
    assert_includes up, "IN ('vigil_oil', 'haunt_ember')"
    refute_includes up, 'bounties'
    assert_empty sql_of(:down)
  end
end
