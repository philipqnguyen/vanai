# Moderation on the account, so it covers every character on it: a banned
# account cannot sign in, keep a session or open the realtime socket; a muted
# one plays on, but nobody hears what it says (DEPLOY.md "Moderation and
# accounts"; lib/tasks/accounts.rake). Unset is the normal state.
class AddModerationToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :banned_at, :datetime
    add_column :users, :muted_at, :datetime
  end
end
