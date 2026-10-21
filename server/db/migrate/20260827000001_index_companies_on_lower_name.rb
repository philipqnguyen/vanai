class IndexCompaniesOnLowerName < ActiveRecord::Migration[8.1]
  def change
    remove_index :companies, :name, unique: true, name: "index_companies_on_name"
    add_index :companies, "LOWER(name)", unique: true, name: "index_companies_on_lower_name"
  end
end
