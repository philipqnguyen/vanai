class Character < ApplicationRecord
  belongs_to :user
  has_many :character_jobs, dependent: :destroy
  has_many :inventory_items, dependent: :destroy
  has_many :quest_progresses, dependent: :destroy
  has_many :discoveries, dependent: :destroy

  # Only approved playable races; retained data for other races is not an unlock.
  RACES = Vanai::Data.races.select { |_, data| data["playable"] }.keys.freeze
  NYM_APPEARANCE = { "face" => %w[male female], "hair" => %w[tousled bun] }.freeze
  NYM_DEFAULTS = { "face" => "male", "hair" => "tousled" }.freeze
  RASHA_DEFAULTS = { "face" => "female", "hair" => "waves" }.freeze
  KARROG_DEFAULTS = { "face" => "male", "hair" => "braid", "beard" => true }.freeze
  # Every hair can be worn in its own colour or one of these (client
  # appearance.ts HAIR_DYES, painted over the approved hair in hair-colour.ts).
  # No colour saved is natural, so a row saved before colours existed, or
  # created without one, reads and sends exactly as it did.
  HAIR_COLOURS = %w[natural dark_blue dark_green auburn].freeze
  JOBS  = %w[PLD SAM DRK BLM WHM MNK].freeze
  # starting city => where a brand-new character first stands, x, z: zones.json
  # `start`, which also carries the way they face (`h`, read by the client's
  # arrival.ts; the server keeps no facing). It is NOT the zone's `spawn` -- the
  # landing of a zone change and the stored-position migration's arrival -- though
  # in Heartwood and Moonmere the two coincide. Caerdun's start stands on the open
  # quay at the foot of the covered Wall Stair, looking up it at the Sea Gate and the
  # city over the sea wall (Philip's rulings CF-23, CF-24); its spawn is in the
  # barbican court (CF-22).
  # server/test/vanai/start_cities_test.rb holds the two copies equal. The home
  # point is the city's teleport crystal, read from the data so it cannot drift.
  START_CITIES = {
    "caerdun"   => { x: -208.0, z: -10.0 },
    "heartwood" => { x: -280.0, z: 2.0 },
    "moonmere"  => { x: 8.0, z: 288.0 }
  }.freeze
  STARTER_WEAPONS = {
    "PLD" => "worn_sword", "SAM" => "worn_katana", "DRK" => "worn_greatsword",
    "BLM" => "ash_staff", "WHM" => "worn_cudgel", "MNK" => "cloth_wraps"
  }.freeze

  # Characters one account may hold (CharactersController#create): room for
  # alts, not for minting starter purses or squatting names.
  MAX_PER_USER = 8

  validates :name, presence: true, length: { minimum: 2, maximum: 16 },
                   format: { with: /\A[A-Za-z][A-Za-z']*\z/, message: "letters only" }
  validates :race, inclusion: { in: RACES }
  validates :active_job, inclusion: { in: JOBS }
  validate :name_unique_ci, on: :create
  validate :valid_appearance
  before_validation :default_appearance

  def appearance_defaults
    return NYM_DEFAULTS if race == "nym"
    return RASHA_DEFAULTS if race == "rasha"
    return KARROG_DEFAULTS if race == "karrog"
    return {} unless %w[aedri valdren].include?(race)
    face = appearance.is_a?(Hash) && appearance["face"] == "female" ? "female" : "male"
    { "face" => face, "hair" => face == "female" ? "braid" : race == "valdren" ? "cascade" : "waves" }
  end

  # Every player character has hair (Philip, 2026-10-15): a race offers only its
  # own styles, never "none". Aedri and Valdren have one style per body.
  def hair_choices
    case race
    when "nym" then NYM_APPEARANCE["hair"]
    when "karrog" then %w[braid]
    when "rasha" then %w[waves]
    when "aedri", "valdren" then [appearance_defaults["hair"]]
    else []
    end
  end

  def default_appearance
    return unless appearance.is_a?(Hash)
    self.appearance = appearance_defaults.merge(appearance)
    # A row saved before the ruling may still say "none" (the migration
    # 20261015100001 rewrites them): on its next save it takes the race's
    # default instead of failing validation. A new character asking for no
    # hair is refused by valid_appearance.
    self.appearance = appearance.merge("hair" => appearance_defaults["hair"]) if persisted? && legacy_hairless?
  end

  def legacy_hairless?
    appearance.is_a?(Hash) && appearance.key?("hair") && hair_choices.any? && !hair_choices.include?(appearance["hair"])
  end

  def valid_appearance
    unless appearance.is_a?(Hash)
      errors.add(:appearance, "must be an object")
      return
    end
    allowed = case race
    when "nym" then NYM_APPEARANCE
    when "karrog" then { "face" => %w[male], "hair" => hair_choices, "beard" => [true, false] }
    when "rasha" then { "face" => %w[female], "hair" => hair_choices }
    when "aedri", "valdren" then { "face" => %w[male female], "hair" => hair_choices }
    else {}
    end
    allowed = allowed.merge("hair_colour" => HAIR_COLOURS) unless allowed.empty?
    appearance.each do |key, value|
      errors.add(:appearance, "has an invalid #{key}") unless allowed[key]&.include?(value)
    end
  end

  # Resolve old empty rows on read; never convert a race or reset progression.
  # Hair the race does not offer (a legacy "none") reads as its default.
  def appearance_payload
    payload = appearance_defaults.merge(appearance.is_a?(Hash) ? appearance : {})
    payload["hair"] = appearance_defaults["hair"] if hair_choices.any? && !hair_choices.include?(payload["hair"])
    payload
  end

  def name_unique_ci
    errors.add(:name, "is already taken") if Character.where("lower(name) = ?", name.to_s.downcase).exists?
  end

  # Under the account's lock: a character is made whole or not at all, and
  # CharactersController counts the account's characters under the same lock.
  def self.provision!(user:, name:, race: "aedri", job:, city: "caerdun", appearance: {})
    user.with_lock do
      job = JOBS.include?(job) ? job : "PLD"
      city = START_CITIES.key?(city) ? city : "caerdun"
      start = START_CITIES.fetch(city)
      crystal = (Vanai::Data.zones.dig(city, "milestones") || []).first
      home = crystal ? { x: crystal["x"].to_f, z: crystal["z"].to_f } : start
      char = user.characters.create!(
        name: name.to_s.capitalize, race: race, active_job: job, appearance: appearance,
        zone: city, x: start[:x], z: start[:z],
        home_zone: city, home_x: home[:x], home_z: home[:z], court: city
      )
      # sworn to the starting city's court from the first breath (COURTS.md)
      Vanai::Courts::Allegiance.record_creation!(char)
      # a new character is already attuned to their city's crystal: it is their
      # home point from the first breath, so a death on day one has a way back
      char.discoveries.create!(landmark_key: "milestone_#{crystal["id"]}") if crystal
      # ...and is owed their city's opening scene, which plays on their first
      # arrival and stays owed until it is watched or skipped (Vanai::Cutscenes)
      opening = Vanai::Cutscenes.opening_for(city)
      char.discoveries.create!(landmark_key: "#{Vanai::Cutscenes::DUE}#{opening}") if opening
      # ...and, before that, the intro every new character shares
      intro = Vanai::Cutscenes.intro_id
      char.discoveries.create!(landmark_key: "#{Vanai::Cutscenes::DUE}#{intro}") if intro
      JOBS.each { |j| char.character_jobs.create!(job: j, level: 1, xp: 0) }
      weapon = char.inventory_items.create!(item_key: STARTER_WEAPONS.fetch(job), qty: 1, equipped_slot: "weapon")
      char.inventory_items.create!(item_key: "traveler_tunic", qty: 1, equipped_slot: "body")
      char.inventory_items.create!(item_key: "traveler_slops", qty: 1, equipped_slot: "legs")
      char.inventory_items.create!(item_key: "potion", qty: 3)
      char
    end
  end

  def job_record(job = active_job)
    character_jobs.find_by(job: job)
  end

  def equipped
    inventory_items.where.not(equipped_slot: nil)
  end

  # Anything the new job cannot wield, wear, or has not reached the level for
  # returns to the bag on a switch -- a Paladin's sword and mail as much as a
  # job set -- so no stat is counted from gear the equip endpoint would refuse.
  # The weapon hand may come back empty; that is the honest state. Never delete.
  def unequip_incompatible_job_gear!
    equipped.each do |row|
      item = row.definition
      next unless item
      unless Vanai::Data.eligible_jobs(item).include?(active_job) && item["lvl"].to_i <= job_record.level
        row.update!(equipped_slot: nil)
      end
    end
  end
end
