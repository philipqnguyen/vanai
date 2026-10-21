ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'

# schema.rb must dump the same whether the database was built by migrating or
# by loading schema.rb. A check constraint written `col IN ('a', 'b')` on a
# varchar column does not: the two kinds of database print it differently, and
# schema.rb flipped with whichever ran db:migrate last. CI's database is loaded
# from schema.rb, where such a constraint shows as varchar literals; write it
# as `col::text = ANY (ARRAY['a'::text, 'b'::text])` instead
# (db/migrate/20261019120001_restate_enum_check_constraints.rb).
class SchemaDumpTest < Minitest::Test
  def test_no_check_constraint_compares_against_varchar_literals
    raise 'Test database only' unless Rails.env.test?
    rows = ActiveRecord::Base.connection.select_rows(<<~SQL)
      SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid)
      FROM pg_constraint
      WHERE contype = 'c' AND connamespace = 'public'::regnamespace
    SQL
    unstable = rows.select { |_, _, definition| definition.include?('character varying') }
    assert_empty unstable.map { |table, name, _| "#{table}.#{name}" },
                 'these dump differently from a migrated database and from a loaded one'
  end
end
