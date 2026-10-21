class CreateCompanies < ActiveRecord::Migration[8.1]
  def change
    create_table :companies do |t|
      t.string :name, null: false, index: { unique: true }
      t.integer :leader_id
      t.timestamps
    end
    add_column :characters, :company_id, :bigint
    add_index :characters, :company_id
  end
end
