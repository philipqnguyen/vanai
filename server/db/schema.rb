# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_19_200001) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "allegiance_changes", force: :cascade do |t|
    t.integer "amount", default: 0
    t.bigint "character_id"
    t.string "character_name", null: false
    t.bigint "court_letter_id"
    t.datetime "created_at", null: false
    t.integer "cycle", null: false
    t.string "from_court"
    t.string "to_court", null: false
    t.string "via", null: false
    t.index ["character_id", "created_at"], name: "index_allegiance_changes_on_character_id_and_created_at"
  end

  create_table "auction_listings", force: :cascade do |t|
    t.bigint "buyer_id"
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "item_key", null: false
    t.integer "price", null: false
    t.integer "qty", default: 1, null: false
    t.bigint "seller_id", null: false
    t.datetime "sold_at"
    t.string "status", default: "active", null: false
    t.datetime "updated_at", null: false
    t.index ["buyer_id"], name: "index_auction_listings_on_buyer_id"
    t.index ["seller_id", "status"], name: "index_auction_listings_on_seller_id_and_status"
    t.index ["seller_id"], name: "index_auction_listings_on_seller_id"
    t.index ["status", "expires_at"], name: "index_auction_listings_on_status_and_expires_at"
    t.index ["status", "item_key"], name: "index_auction_listings_on_status_and_item_key"
  end

  create_table "bounties", force: :cascade do |t|
    t.integer "count", null: false
    t.string "court", null: false
    t.bigint "court_turn_id"
    t.datetime "created_at", null: false
    t.integer "cycle", null: false
    t.integer "expires_cycle", null: false
    t.bigint "held", null: false
    t.string "kind", null: false
    t.integer "places", null: false
    t.integer "places_paid", default: 0, null: false
    t.integer "reward_each", null: false
    t.string "status", default: "open", null: false
    t.string "target", null: false
    t.string "text", limit: 300
    t.datetime "updated_at", null: false
    t.string "zone", null: false
    t.index ["court", "status"], name: "index_bounties_on_court_and_status"
    t.index ["court_turn_id"], name: "index_bounties_on_court_turn_id"
    t.index ["status", "expires_cycle"], name: "index_bounties_on_status_and_expires_cycle"
    t.check_constraint "kind::text = ANY (ARRAY['kill'::text, 'collect'::text])", name: "bounties_kind"
    t.check_constraint "places_paid >= 0 AND places_paid <= places", name: "bounties_places_paid_range"
    t.check_constraint "status::text = ANY (ARRAY['open'::text, 'filled'::text, 'expired'::text])", name: "bounties_status"
  end

  create_table "bounty_progresses", force: :cascade do |t|
    t.bigint "bounty_id", null: false
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.integer "paid", default: 0, null: false
    t.integer "progress", default: 0, null: false
    t.string "status", default: "active", null: false
    t.datetime "updated_at", null: false
    t.index ["bounty_id", "character_id"], name: "index_bounty_progresses_on_bounty_id_and_character_id", unique: true
    t.index ["character_id", "status"], name: "index_bounty_progresses_on_character_id_and_status"
    t.check_constraint "status::text = ANY (ARRAY['active'::text, 'paid'::text, 'unpaid'::text])", name: "bounty_progresses_status"
  end

  create_table "character_jobs", force: :cascade do |t|
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.string "job", null: false
    t.integer "level", default: 1, null: false
    t.datetime "updated_at", null: false
    t.integer "xp", default: 0, null: false
    t.index ["character_id", "job"], name: "index_character_jobs_on_character_id_and_job", unique: true
    t.index ["character_id"], name: "index_character_jobs_on_character_id"
  end

  create_table "characters", force: :cascade do |t|
    t.string "active_job", default: "PLD", null: false
    t.jsonb "appearance", default: {}, null: false
    t.bigint "company_id"
    t.string "court", default: "caerdun", null: false
    t.integer "court_digest_seen_cycle", default: 0, null: false
    t.bigint "court_news_seen_id", default: 0, null: false
    t.integer "court_switched_cycle"
    t.datetime "created_at", null: false
    t.datetime "dead_at"
    t.jsonb "ferry_voyage"
    t.integer "gold", default: 50, null: false
    t.float "heading", default: 0.0, null: false
    t.float "home_x", default: -60.0, null: false
    t.float "home_z", default: 60.0, null: false
    t.string "home_zone", default: "caerdun", null: false
    t.string "name", null: false
    t.string "race", null: false
    t.string "title"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.float "x", default: 0.0, null: false
    t.float "z", default: -130.0, null: false
    t.string "zone", default: "caerdun", null: false
    t.index "lower((name)::text)", name: "index_characters_on_lower_name", unique: true
    t.index ["company_id"], name: "index_characters_on_company_id"
    t.index ["court"], name: "index_characters_on_court"
    t.index ["user_id"], name: "index_characters_on_user_id"
    t.check_constraint "court::text = ANY (ARRAY['caerdun'::text, 'heartwood'::text, 'moonmere'::text])", name: "characters_court_known"
  end

  create_table "claim_contributions", force: :cascade do |t|
    t.float "capped", default: 0.0, null: false
    t.bigint "character_id", null: false
    t.string "court", null: false
    t.integer "cycle", null: false
    t.float "exempt", default: 0.0, null: false
    t.float "points", default: 0.0, null: false
    t.datetime "updated_at", null: false
    t.string "zone", null: false
    t.index ["character_id", "cycle", "zone", "court"], name: "index_claim_contributions_unique", unique: true
    t.index ["cycle", "zone"], name: "index_claim_contributions_on_cycle_and_zone"
  end

  create_table "companies", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "leader_id"
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index "lower((name)::text)", name: "index_companies_on_lower_name", unique: true
  end

  create_table "council_cycles", force: :cascade do |t|
    t.datetime "closed_at"
    t.datetime "created_at", null: false
    t.boolean "dormant", default: false, null: false
    t.datetime "due_at", null: false
    t.integer "number", null: false
    t.datetime "started_at", null: false
    t.datetime "turn_applied_at"
    t.integer "turn_attempts", default: 0, null: false
    t.datetime "turn_enqueued_at"
    t.datetime "turn_ready_at"
    t.datetime "turn_started_at"
    t.string "turn_status", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.index ["number"], name: "index_council_cycles_on_number", unique: true
    t.index ["turn_status"], name: "index_council_cycles_on_turn_status"
  end

  create_table "court_flags", force: :cascade do |t|
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.jsonb "value"
    t.index ["key"], name: "index_court_flags_on_key", unique: true
  end

  create_table "court_ledger_entries", force: :cascade do |t|
    t.bigint "amount", default: 0, null: false
    t.bigint "balance_after"
    t.bigint "character_id"
    t.string "character_name"
    t.string "court", null: false
    t.datetime "created_at", null: false
    t.integer "cycle", null: false
    t.string "kind", null: false
    t.jsonb "meta", default: {}, null: false
    t.string "zone"
    t.index ["character_id"], name: "index_court_ledger_entries_on_character_id"
    t.index ["court", "cycle"], name: "index_court_ledger_entries_on_court_and_cycle"
    t.index ["cycle", "kind"], name: "index_court_ledger_entries_on_cycle_and_kind"
  end

  create_table "court_letters", force: :cascade do |t|
    t.integer "amount", null: false
    t.datetime "answered_at"
    t.integer "answered_cycle"
    t.bigint "character_id"
    t.string "character_name", null: false
    t.string "court", null: false
    t.bigint "court_turn_id"
    t.datetime "created_at", null: false
    t.integer "cycle", null: false
    t.integer "expires_cycle"
    t.boolean "held", default: false, null: false
    t.string "kind", null: false
    t.string "status", default: "unread", null: false
    t.string "text", limit: 700, null: false
    t.datetime "updated_at", null: false
    t.index ["character_id", "status"], name: "index_court_letters_on_character_id_and_status"
    t.index ["court", "cycle"], name: "index_court_letters_on_court_and_cycle"
    t.index ["status", "expires_cycle"], name: "index_court_letters_on_status_and_expires_cycle"
    t.check_constraint "amount > 0", name: "court_letters_amount_positive"
    t.check_constraint "kind::text = ANY (ARRAY['defection'::text, 'purse'::text])", name: "court_letters_kind"
    t.check_constraint "status::text = ANY (ARRAY['unread'::text, 'read'::text, 'accepted'::text, 'declined'::text, 'lapsed'::text])", name: "court_letters_status"
  end

  create_table "court_news", force: :cascade do |t|
    t.string "audience", null: false
    t.string "court"
    t.datetime "created_at", null: false
    t.integer "cycle", null: false
    t.string "kind", null: false
    t.jsonb "payload", default: {}, null: false
    t.text "text", null: false
    t.index ["audience", "court", "id"], name: "index_court_news_on_audience_and_court_and_id"
    t.index ["kind", "cycle"], name: "index_court_news_on_kind_and_cycle"
  end

  create_table "court_pushes", force: :cascade do |t|
    t.integer "amount", default: 0, null: false
    t.string "court", null: false
    t.bigint "court_turn_id"
    t.datetime "created_at", null: false
    t.integer "from_cycle", null: false
    t.integer "to_cycle", null: false
    t.string "zone", null: false
    t.index ["court_turn_id"], name: "index_court_pushes_on_court_turn_id"
    t.index ["zone", "to_cycle"], name: "index_court_pushes_on_zone_and_to_cycle"
  end

  create_table "court_turns", force: :cascade do |t|
    t.datetime "applied_at"
    t.bigint "council_cycle_id", null: false
    t.string "court", null: false
    t.datetime "created_at", null: false
    t.text "error"
    t.string "model"
    t.jsonb "outcome"
    t.jsonb "prompt"
    t.jsonb "response"
    t.string "status", null: false
    t.datetime "updated_at", null: false
    t.jsonb "usage"
    t.jsonb "verbs"
    t.index ["council_cycle_id", "court"], name: "index_court_turns_on_council_cycle_id_and_court", unique: true
  end

  create_table "courts", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.string "name", null: false
    t.integer "relic_budget", default: 0, null: false
    t.jsonb "relic_prices", default: {}, null: false
    t.integer "tax_bp", default: 300, null: false
    t.bigint "treasury", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_courts_on_key", unique: true
    t.check_constraint "tax_bp >= 100 AND tax_bp <= 1500", name: "courts_tax_bp_range"
    t.check_constraint "treasury >= 0", name: "courts_treasury_never_negative"
  end

  create_table "discoveries", force: :cascade do |t|
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.string "landmark_key", null: false
    t.datetime "updated_at", null: false
    t.index ["character_id", "landmark_key"], name: "index_discoveries_on_character_id_and_landmark_key", unique: true
    t.index ["character_id"], name: "index_discoveries_on_character_id"
  end

  create_table "friendships", force: :cascade do |t|
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.string "friend_name", null: false
    t.datetime "updated_at", null: false
    t.index ["character_id", "friend_name"], name: "index_friendships_on_character_id_and_friend_name", unique: true
    t.index ["character_id"], name: "index_friendships_on_character_id"
  end

  create_table "gold_circulations", force: :cascade do |t|
    t.bigint "burned"
    t.bigint "characters_gold"
    t.datetime "created_at", null: false
    t.integer "cycle"
    t.date "day", null: false
    t.bigint "held_gold"
    t.bigint "listed_gold"
    t.bigint "minted"
    t.bigint "treasuries_gold"
    t.index ["day"], name: "index_gold_circulations_on_day", unique: true
  end

  create_table "inventory_items", force: :cascade do |t|
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.string "equipped_slot"
    t.string "item_key", null: false
    t.bigint "named_relic_id"
    t.integer "qty", default: 1, null: false
    t.datetime "updated_at", null: false
    t.index ["character_id", "item_key"], name: "index_inventory_items_on_character_id_and_item_key"
    t.index ["character_id"], name: "index_inventory_items_on_character_id"
    t.index ["named_relic_id"], name: "index_inventory_items_on_named_relic_id", unique: true, where: "(named_relic_id IS NOT NULL)"
  end

  create_table "mail_letters", force: :cascade do |t|
    t.text "body", default: "", null: false
    t.datetime "collected_at"
    t.datetime "created_at", null: false
    t.integer "gold", default: 0, null: false
    t.jsonb "items", default: [], null: false
    t.string "kind", default: "player", null: false
    t.datetime "read_at"
    t.bigint "recipient_id", null: false
    t.bigint "sender_id"
    t.string "sender_name", null: false
    t.string "subject", null: false
    t.datetime "updated_at", null: false
    t.index ["recipient_id", "created_at"], name: "index_mail_letters_on_recipient_id_and_created_at"
    t.index ["recipient_id"], name: "index_mail_letters_unread", where: "(read_at IS NULL)"
    t.index ["sender_id", "created_at"], name: "index_mail_letters_on_sender_id_and_created_at"
  end

  create_table "named_relics", force: :cascade do |t|
    t.string "court"
    t.datetime "created_at", null: false
    t.integer "cycle", null: false
    t.bigint "finder_id"
    t.string "finder_name", null: false
    t.datetime "found_at", null: false
    t.string "kind", null: false
    t.string "name", null: false
    t.datetime "registered_at"
    t.integer "registered_cycle"
    t.string "registrant_name"
    t.integer "reward"
    t.integer "slot", null: false
    t.string "status", default: "held", null: false
    t.datetime "updated_at", null: false
    t.string "zone", null: false
    t.index ["court", "registered_at"], name: "index_named_relics_on_court_and_registered_at"
    t.index ["cycle", "zone", "slot"], name: "index_named_relics_on_cycle_and_zone_and_slot", unique: true
    t.index ["finder_id"], name: "index_named_relics_on_finder_id"
    t.index ["status", "found_at"], name: "index_named_relics_on_status_and_found_at"
    t.index ["zone", "registered_at"], name: "index_named_relics_on_zone_and_registered_at"
    t.check_constraint "kind::text = ANY (ARRAY['documents'::text, 'goods'::text, 'surveys'::text])", name: "named_relics_kind"
    t.check_constraint "status::text = ANY (ARRAY['held'::text, 'registered'::text, 'crumbled'::text])", name: "named_relics_status"
  end

  create_table "proclamations", force: :cascade do |t|
    t.string "court", null: false
    t.bigint "court_turn_id"
    t.datetime "created_at", null: false
    t.integer "cycle", null: false
    t.string "text", limit: 500, null: false
    t.index ["court", "created_at", "id"], name: "index_proclamations_on_court_and_created_at_and_id", order: { created_at: :desc, id: :desc }
    t.index ["court_turn_id"], name: "index_proclamations_on_court_turn_id"
  end

  create_table "quest_progresses", force: :cascade do |t|
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.jsonb "credited_targets", default: [], null: false
    t.integer "progress", default: 0, null: false
    t.string "quest_key", null: false
    t.integer "status", default: 1, null: false
    t.datetime "updated_at", null: false
    t.index ["character_id", "quest_key"], name: "index_quest_progresses_on_character_id_and_quest_key", unique: true
    t.index ["character_id"], name: "index_quest_progresses_on_character_id"
  end

  create_table "relic_registrations", force: :cascade do |t|
    t.bigint "character_id"
    t.string "character_name", null: false
    t.string "court", null: false
    t.datetime "created_at", null: false
    t.integer "cycle", null: false
    t.string "item_key"
    t.string "kind", null: false
    t.bigint "named_relic_id"
    t.integer "paid", default: 0, null: false
    t.float "points", default: 0.0, null: false
    t.integer "qty", default: 1, null: false
    t.integer "reduced_qty", default: 0, null: false
    t.string "zone", null: false
    t.index ["character_id", "cycle"], name: "index_relic_registrations_on_character_id_and_cycle"
    t.index ["court", "cycle"], name: "index_relic_registrations_on_court_and_cycle"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "banned_at"
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.datetime "muted_at"
    t.string "password_digest", null: false
    t.string "session_token", null: false
    t.datetime "updated_at", null: false
    t.index "lower((email)::text)", name: "index_users_on_lower_email", unique: true
    t.index ["session_token"], name: "index_users_on_session_token", unique: true
  end

  create_table "zone_claims", force: :cascade do |t|
    t.string "court", null: false
    t.float "points", default: 0.0, null: false
    t.datetime "updated_at", null: false
    t.string "zone", null: false
    t.index ["zone", "court"], name: "index_zone_claims_on_zone_and_court", unique: true
    t.check_constraint "points >= 0::double precision", name: "zone_claims_points_nonnegative"
  end

  create_table "zone_controls", force: :cascade do |t|
    t.string "court"
    t.datetime "created_at", null: false
    t.integer "cycle", null: false
    t.jsonb "points", default: {}, null: false
    t.string "zone", null: false
    t.index ["cycle", "zone"], name: "index_zone_controls_on_cycle_and_zone", unique: true
  end

  add_foreign_key "allegiance_changes", "characters", on_delete: :nullify
  add_foreign_key "allegiance_changes", "court_letters", on_delete: :nullify
  add_foreign_key "auction_listings", "characters", column: "buyer_id"
  add_foreign_key "auction_listings", "characters", column: "seller_id"
  add_foreign_key "bounties", "court_turns", on_delete: :nullify
  add_foreign_key "bounty_progresses", "bounties", on_delete: :cascade
  add_foreign_key "bounty_progresses", "characters", on_delete: :cascade
  add_foreign_key "character_jobs", "characters"
  add_foreign_key "characters", "users"
  add_foreign_key "claim_contributions", "characters", on_delete: :cascade
  add_foreign_key "court_ledger_entries", "characters", on_delete: :nullify
  add_foreign_key "court_letters", "characters", on_delete: :nullify
  add_foreign_key "court_letters", "court_turns"
  add_foreign_key "court_pushes", "court_turns", on_delete: :nullify
  add_foreign_key "court_turns", "council_cycles"
  add_foreign_key "discoveries", "characters"
  add_foreign_key "friendships", "characters"
  add_foreign_key "inventory_items", "characters"
  add_foreign_key "inventory_items", "named_relics", on_delete: :cascade
  add_foreign_key "mail_letters", "characters", column: "recipient_id", on_delete: :cascade
  add_foreign_key "mail_letters", "characters", column: "sender_id", on_delete: :nullify
  add_foreign_key "named_relics", "characters", column: "finder_id", on_delete: :nullify
  add_foreign_key "proclamations", "court_turns", on_delete: :nullify
  add_foreign_key "quest_progresses", "characters"
  add_foreign_key "relic_registrations", "characters", on_delete: :nullify
  add_foreign_key "relic_registrations", "named_relics", on_delete: :nullify
end
