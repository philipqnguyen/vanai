# Moderation from the command line, by account email (DEPLOY.md "Moderation
# and accounts"). Database only, so they run beside the live server:
#
#   bin/rails "accounts:ban[someone@example.com]"
#   bin/rails "accounts:mute[someone@example.com]"
#
# A ban or a mute covers every character on the account.
namespace :accounts do
  find = lambda do |args|
    email = args[:email].to_s
    abort "Give the account's email: bin/rails \"accounts:<task>[someone@example.com]\"" if email.empty?
    User.find_by_email(email) || abort("No account for #{email}.")
  end
  names = ->(user) { user.characters.pluck(:name).join(", ").presence || "no characters" }

  desc "Ban an account: no sign-in, no session, no socket; its open sockets are closed"
  task :ban, [:email] => :environment do |_, args|
    user = find.(args)
    user.ban!
    puts "Banned #{user.email} (#{names.(user)})."
  end

  desc "Lift a ban"
  task :unban, [:email] => :environment do |_, args|
    user = find.(args)
    user.unban!
    puts "Unbanned #{user.email}."
  end

  desc "Mute an account: it plays on, but no one hears its chat, party, company or /tell"
  task :mute, [:email] => :environment do |_, args|
    user = find.(args)
    user.mute!
    puts "Muted #{user.email} (#{names.(user)})."
  end

  desc "Lift a mute"
  task :unmute, [:email] => :environment do |_, args|
    user = find.(args)
    user.unmute!
    puts "Unmuted #{user.email}."
  end

  desc "Delete an account and every character on it, for good"
  task :delete, [:email] => :environment do |_, args|
    user = find.(args)
    who = "#{user.email} (#{names.(user)})"
    user.delete_account!
    puts "Deleted #{who}."
  end
end
