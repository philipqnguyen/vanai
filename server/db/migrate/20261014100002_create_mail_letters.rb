# Mail: a letter to one character, from another (kind "player") or from the
# world (kind "system": the auction house's sale notices and returned
# listings). A parcel's gold and items are held on the letter itself, out of
# every inventory, from the moment it is sent until its recipient collects it.
class CreateMailLetters < ActiveRecord::Migration[8.1]
  def change
    create_table :mail_letters do |t|
      t.references :recipient, null: false, foreign_key: { to_table: :characters, on_delete: :cascade }, index: false
      # a deleted sender leaves their letters behind, signed with the name
      t.references :sender, foreign_key: { to_table: :characters, on_delete: :nullify }, index: false
      t.string :sender_name, null: false
      t.string :kind, null: false, default: "player"
      t.string :subject, null: false
      t.text :body, null: false, default: ""
      t.integer :gold, null: false, default: 0
      # [{ "item_key" => ..., "qty" => n }], at most Vanai::Mail::MAX_STACKS
      t.jsonb :items, null: false, default: []
      t.datetime :read_at
      t.datetime :collected_at
      t.timestamps
    end
    # the inbox, newest first, and its unread count
    add_index :mail_letters, [:recipient_id, :created_at]
    add_index :mail_letters, :recipient_id, where: "read_at IS NULL", name: "index_mail_letters_unread"
    # the sender's rate limit
    add_index :mail_letters, [:sender_id, :created_at]
  end
end
