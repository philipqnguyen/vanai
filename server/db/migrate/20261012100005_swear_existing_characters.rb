# Swears every existing character to a court (COURTS.md "Allegiance": "a
# migration swears existing ones from home_zone").
#
# Three rules, in order:
#   1. a home point in one of the three cities: that city's court;
#   2. otherwise the city whose crystal the character attuned first. A new
#      character is attuned to their starting city's crystal at creation
#      (Character.provision!), so the lowest such discovery id is where they
#      began. This covers characters whose home now sits at a field crystal or
#      the Capital (`set_home` allows any crystal) instead of sending them all to
#      Caerdun (a recorded deviation: tmp/courts/PLAN.md section 2, question 6);
#   3. otherwise Caerdun.
# Then one allegiance_changes row per character, via 'migration', cycle 0.
#
# The crystal ids are frozen here from zones.json (each city's milestones[0]);
# test/vanai/swear_existing_characters_migration_test.rb holds them equal to the
# data. SQL only, so the test can capture it without a database.
class SwearExistingCharacters < ActiveRecord::Migration[8.1]
  CRYSTALS = {
    "caerdun" => "crystal_caerdun",
    "heartwood" => "crystal_heartwood",
    "moonmere" => "crystal_moonmere"
  }.freeze

  def up
    cities = CRYSTALS.keys.map { |c| connection.quote(c) }.join(", ")
    keys = CRYSTALS.values.map { |id| connection.quote("milestone_#{id}") }.join(", ")
    from_key = CRYSTALS.map { |city, id| "WHEN #{connection.quote("milestone_#{id}")} THEN #{connection.quote(city)}" }.join(" ")

    execute <<~SQL.squish
      UPDATE characters SET court = home_zone
      WHERE home_zone IN (#{cities}) AND court <> home_zone
    SQL
    execute <<~SQL.squish
      UPDATE characters SET court = first_city.court
      FROM (SELECT DISTINCT ON (character_id) character_id, CASE landmark_key #{from_key} END AS court
            FROM discoveries WHERE landmark_key IN (#{keys})
            ORDER BY character_id, id) AS first_city
      WHERE first_city.character_id = characters.id AND characters.home_zone NOT IN (#{cities})
    SQL
    execute <<~SQL.squish
      UPDATE characters SET court = 'caerdun'
      WHERE home_zone NOT IN (#{cities})
        AND NOT EXISTS (SELECT 1 FROM discoveries d WHERE d.character_id = characters.id AND d.landmark_key IN (#{keys}))
    SQL
    execute <<~SQL.squish
      INSERT INTO allegiance_changes (character_id, character_name, from_court, to_court, cycle, via, amount, created_at)
      SELECT id, name, NULL, court, 0, 'migration', 0, now() FROM characters
      WHERE NOT EXISTS (SELECT 1 FROM allegiance_changes a WHERE a.character_id = characters.id)
    SQL
  end

  # The column itself goes with the previous migration's down; this only takes
  # back the rows it wrote.
  def down
    execute "DELETE FROM allegiance_changes WHERE via = 'migration'"
  end
end
