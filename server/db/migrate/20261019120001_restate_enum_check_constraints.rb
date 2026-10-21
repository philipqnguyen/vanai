# The eight "one of these words" check constraints were written as
# `col IN ('a', 'b')` on varchar columns. Postgres stores that as varchar
# literals cast to text[], and prints it back as
#   col::text = ANY (ARRAY['a'::character varying, ...]::text[])
# which is what a migrated database dumps into schema.rb. A database built by
# loading schema.rb (the test database, CI, a fresh setup) parses that text
# into a different tree and dumps
#   col::text = ANY (ARRAY['a'::character varying::text, ...])
# so schema.rb changed back and forth with whichever kind of database ran the
# last db:migrate. Written with text literals, the constraint prints back
# exactly as written, so every database dumps the same line.
# test/integration/schema_dump_test.rb keeps it that way.
class RestateEnumCheckConstraints < ActiveRecord::Migration[8.1]
  CONSTRAINTS = {
    bounties: { "bounties_kind" => ["kind", %w[kill collect]],
                "bounties_status" => ["status", %w[open filled expired]] },
    bounty_progresses: { "bounty_progresses_status" => ["status", %w[active paid unpaid]] },
    characters: { "characters_court_known" => ["court", %w[caerdun heartwood moonmere]] },
    court_letters: { "court_letters_kind" => ["kind", %w[defection purse]],
                     "court_letters_status" => ["status", %w[unread read accepted declined lapsed]] },
    named_relics: { "named_relics_kind" => ["kind", %w[documents goods surveys]],
                    "named_relics_status" => ["status", %w[held registered crumbled]] },
  }.freeze

  def up
    restate { |column, words| "#{column}::text = ANY (ARRAY[#{words.map { |w| "'#{w}'::text" }.join(', ')}])" }
  end

  def down
    restate { |column, words| "#{column} IN (#{words.map { |w| "'#{w}'" }.join(', ')})" }
  end

  private

  def restate
    CONSTRAINTS.each do |table, constraints|
      constraints.each do |name, (column, words)|
        remove_check_constraint table, name: name
        add_check_constraint table, yield(column, words), name: name
      end
    end
  end
end
