class CreateGameTables < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :email, null: false
      t.string :password_digest, null: false
      t.timestamps
    end
    add_index :users, "lower(email)", unique: true

    create_table :characters do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.string :race, null: false
      t.string :active_job, null: false, default: "PLD"
      t.string :zone, null: false, default: "caerdun"
      t.float :x, null: false, default: 0.0
      t.float :z, null: false, default: -130.0
      t.float :heading, null: false, default: 0.0
      t.integer :gold, null: false, default: 50
      t.string :home_zone, null: false, default: "caerdun"
      t.float :home_x, null: false, default: -60.0
      t.float :home_z, null: false, default: 60.0
      t.string :title
      t.timestamps
    end
    add_index :characters, "lower(name)", unique: true

    create_table :character_jobs do |t|
      t.references :character, null: false, foreign_key: true
      t.string :job, null: false
      t.integer :level, null: false, default: 1
      t.integer :xp, null: false, default: 0
      t.timestamps
    end
    add_index :character_jobs, [:character_id, :job], unique: true

    create_table :inventory_items do |t|
      t.references :character, null: false, foreign_key: true
      t.string :item_key, null: false
      t.integer :qty, null: false, default: 1
      t.string :equipped_slot
      t.timestamps
    end
    add_index :inventory_items, [:character_id, :item_key]

    create_table :quest_progresses do |t|
      t.references :character, null: false, foreign_key: true
      t.string :quest_key, null: false
      t.integer :status, null: false, default: 1
      t.integer :progress, null: false, default: 0
      t.timestamps
    end
    add_index :quest_progresses, [:character_id, :quest_key], unique: true

    create_table :discoveries do |t|
      t.references :character, null: false, foreign_key: true
      t.string :landmark_key, null: false
      t.timestamps
    end
    add_index :discoveries, [:character_id, :landmark_key], unique: true
  end
end
