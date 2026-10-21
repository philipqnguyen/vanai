# Every character is sworn to exactly one court, always (COURTS.md
# "Allegiance"). The column default only satisfies NOT NULL for the moment
# before the swearing migration that follows; Character.provision! always sets
# the starting city's court.
class AddCourtToCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :characters, :court, :string, null: false, default: "caerdun"
    # the cycle this character last switched in: at most one switch a cycle
    add_column :characters, :court_switched_cycle, :integer
    # what the court window has shown them, so the badge and the login digest
    # know what is new
    add_column :characters, :court_news_seen_id, :bigint, null: false, default: 0
    add_column :characters, :court_digest_seen_cycle, :integer, null: false, default: 0
    add_index :characters, :court
    add_check_constraint :characters, "court IN ('caerdun','heartwood','moonmere')", name: "characters_court_known"
  end
end
