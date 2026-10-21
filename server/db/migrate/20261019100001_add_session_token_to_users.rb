# A session is good only while it carries the account's current token, so
# signing out, or a password reset, can end every other copy of the cookie
# (Api::BaseController#current_user, ApplicationCable::Connection). Every
# account gets one now; cookies from before it hold none, so everyone signs in
# once more after this runs.
class AddSessionTokenToUsers < ActiveRecord::Migration[8.1]
  def up
    add_column :users, :session_token, :string
    # two v4 UUIDs, 244 random bits: as unguessable as has_secure_token's own
    execute "UPDATE users SET session_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')"
    change_column_null :users, :session_token, false
    add_index :users, :session_token, unique: true
  end

  def down
    remove_column :users, :session_token
  end
end
