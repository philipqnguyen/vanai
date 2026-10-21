# The courts' scripted news: the digests and announcements the court window's
# News tab lists (COURTS.md "The scripted news"). Created with the foundation,
# not with the halls, because going dormant and waking each post a notice here
# from the first step on (tmp/courts/PLAN.md 1.5; moved from 100011, see
# tmp/courts/NOTES.md).
#
# audience: all | court (members of `court`) | board (the hall's board of
# `court`). Notices only for players in one zone are delivered live and never
# stored.
class CreateCourtNews < ActiveRecord::Migration[8.1]
  def change
    create_table :court_news do |t|
      t.integer :cycle, null: false
      t.string :court
      t.string :audience, null: false
      t.string :kind, null: false
      t.text :text, null: false
      t.jsonb :payload, null: false, default: {}
      t.datetime :created_at, null: false
    end
    add_index :court_news, %i[audience court id]
    add_index :court_news, %i[kind cycle]
  end
end
