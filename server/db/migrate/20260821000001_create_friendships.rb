class CreateFriendships < ActiveRecord::Migration[8.1]
  def change
    create_table :friendships do |t|
      t.references :character, null: false, foreign_key: true
      t.string :friend_name, null: false
      t.timestamps
    end
    add_index :friendships, [:character_id, :friend_name], unique: true
  end
end
