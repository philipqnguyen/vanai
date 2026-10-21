class AddFerryVoyageToCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :characters, :ferry_voyage, :jsonb
  end
end
