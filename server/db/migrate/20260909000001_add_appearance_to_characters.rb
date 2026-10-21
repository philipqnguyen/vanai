class AddAppearanceToCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :characters, :appearance, :jsonb, default: {}, null: false
  end
end
