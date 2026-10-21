# A fall is the character's, not the process's (Philip, 2026-10-19): the world
# writes when they fell and clears it on a release or a Raise, so a character
# who was dead when they left comes back dead where they fell, however long
# they were away and across any restart, and can still release or be raised.
# Until now death lived only in the world's memory (World::VITALS_HOLD).
class AddDeadAtToCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :characters, :dead_at, :datetime
  end
end
