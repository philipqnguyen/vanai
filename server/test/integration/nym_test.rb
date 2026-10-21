ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'action_dispatch/testing/integration'

# No World.boot!: request/model tests use the separate test database and roll back.
class NymIntegrationTest < Minitest::Test
  def setup
    raise 'Use only the test database' unless Rails.env.test?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @api = ActionDispatch::Integration::Session.new(Rails.application)
    @api.host! 'localhost'
    @api.post '/api/register', params: { email: 'nym-test@example.invalid', password: 'isolated-test-password' }, as: :json
    assert_equal 200, @api.response.status
  end

  def teardown
    ActiveRecord::Base.connection.rollback_transaction
  end

  def create_character(**values)
    @api.post '/api/characters', params: { name: 'Testnym', race: 'nym', job: 'PLD', city: 'caerdun' }.merge(values), as: :json
    JSON.parse(@api.response.body)
  end

  # Philip, 2026-10-21: a Nym's hair follows the gender, the tousled topknot
  # ("bun") for a woman and the layers ("tousled") for a man.
  def test_both_genders_and_their_hair_survive_create_select_state_and_public_payload
    [%w[male tousled], %w[female bun]].each_with_index do |(face, hair), i|
      appearance = { 'face' => face, 'hair' => hair }
      response = create_character(name: "Nym#{('a'.ord+i).chr}", appearance: appearance)
      assert_equal 200, @api.response.status, response.inspect
      c = Character.find(response.fetch('character').fetch('id'))
      assert_equal 'nym', c.race
      assert_equal appearance, c.reload.appearance
      @api.post "/api/characters/#{c.id}/select", as: :json
      assert_equal appearance, JSON.parse(@api.response.body).dig('character', 'appearance')
      @api.get '/api/game/state'
      assert_equal appearance, JSON.parse(@api.response.body).dig('character', 'appearance')
      ps = Vanai::PlayerState.new(c)
      assert_equal appearance, ps.public_payload[:appearance]
      assert_equal 'nym', ps.public_payload[:race]
      ps.recompute!(c.reload)
      assert_equal appearance, ps.public_payload[:appearance]
      assert_equal Vanai::Stats.sheet(race: 'nym', job: 'PLD', level: 1, equipped: c.equipped.map(&:definition)), ps.sheet
    end
    @api.delete '/api/logout', as: :json
    @api.post '/api/login', params: { email: 'nym-test@example.invalid', password: 'isolated-test-password' }, as: :json
    @api.get '/api/characters'
    assert_equal 2, JSON.parse(@api.response.body)['characters'].size
    assert_equal({ 'face' => 'female', 'hair' => 'bun' }, create_character(name: 'Nymdefault', appearance: { face: 'female' }).dig('character', 'appearance'))
    [{ face: 'male', hair: 'bun' }, { face: 'female', hair: 'tousled' }, { hair: 'bun' }].each do |appearance|
      assert create_character(name: 'Invalidnym', appearance: appearance)['error'], appearance.inspect
      assert_equal 422, @api.response.status
    end
  end

  def test_nym_saved_with_the_other_genders_hair_reads_and_saves_as_its_own
    [%w[female tousled bun], %w[male bun tousled]].each_with_index do |(face, saved, own), i|
      c = Character.find(create_character(name: "Oldnym#{('a'.ord+i).chr}", appearance: { face: face }).fetch('character').fetch('id'))
      c.update_column(:appearance, { 'face' => face, 'hair' => saved })
      assert_equal own, c.reload.appearance_payload['hair']
      assert_equal own, Vanai::PlayerState.new(c).public_payload[:appearance]['hair']
      c.update!(gold: 99)
      assert_equal own, c.reload.appearance['hair']
    end
  end

  def test_aedri_bodies_and_independent_optional_hair
    [["male", "waves"], ["female", "braid"]].each_with_index do |(face, hair), i|
      appearance = { "face" => face, "hair" => hair }
      response = create_character(name: "Human#{('a'.ord+i).chr}", race: "aedri", appearance: appearance)
      assert_equal 200, @api.response.status, response.inspect
      c = Character.find(response.fetch("character").fetch("id"))
      assert_equal appearance, c.reload.appearance
      @api.post "/api/characters/#{c.id}/select", as: :json
      assert_equal appearance, JSON.parse(@api.response.body).dig("character", "appearance")
      @api.get "/api/game/state"
      assert_equal appearance, JSON.parse(@api.response.body).dig("character", "appearance")
      ps = Vanai::PlayerState.new(c)
      assert_equal appearance, ps.public_payload[:appearance]
      ps.recompute!(c.reload)
      assert_equal appearance, ps.public_payload[:appearance]
      assert_equal Vanai::Stats.sheet(race: "aedri", job: "PLD", level: 1, equipped: c.equipped.map(&:definition)), ps.sheet
    end
    assert_equal({ "face" => "female", "hair" => "braid" }, create_character(name: "Defaults", race: "aedri", appearance: { face: "female" }).dig("character", "appearance"))
    [{face: "male", hair: "braid"}, {hair: "tousled"}, {gender: "female"}].each do |appearance|
      assert create_character(name: "Invalid", race: "aedri", appearance: appearance)["error"]
      assert_equal 422, @api.response.status
    end
  end

  def test_valdren_bodies_and_corresponding_optional_hair
    [["male", "cascade"], ["female", "braid"]].each_with_index do |(face, hair), i|
      appearance = { "face" => face, "hair" => hair }
      response = create_character(name: "Elf#{('a'.ord+i).chr}", race: "valdren", appearance: appearance)
      assert_equal 200, @api.response.status, response.inspect
      c = Character.find(response.fetch("character").fetch("id"))
      assert_equal appearance, c.reload.appearance
      @api.post "/api/characters/#{c.id}/select", as: :json
      assert_equal appearance, JSON.parse(@api.response.body).dig("character", "appearance")
      @api.get "/api/game/state"
      assert_equal appearance, JSON.parse(@api.response.body).dig("character", "appearance")
      ps = Vanai::PlayerState.new(c)
      assert_equal appearance, ps.public_payload[:appearance]
      ps.recompute!(c.reload)
      assert_equal appearance, ps.public_payload[:appearance]
      assert_equal Vanai::Stats.sheet(race: "valdren", job: "PLD", level: 1, equipped: c.equipped.map(&:definition)), ps.sheet
    end
    assert_equal({ "face" => "female", "hair" => "braid" }, create_character(name: "Elfdefaults", race: "valdren", appearance: { face: "female" }).dig("character", "appearance"))
    [{face: "male", hair: "braid"}, {hair: "tousled"}, {gender: "female"}].each do |appearance|
      assert create_character(name: "Invalidelf", race: "valdren", appearance: appearance)["error"]
      assert_equal 422, @api.response.status
    end
  end

  def test_legacy_valdren_resolves_on_read_without_rewriting_progression
    c = Character.find(create_character(name: 'Oldelf', race: 'valdren').fetch('character').fetch('id'))
    c.update_columns(appearance: {}, gold: 1234)
    jr = c.job_record; jr.update!(level: 7, xp: 23)
    assert_equal({'face'=>'male','hair'=>'cascade'},c.reload.appearance_payload)
    assert_equal({},c.appearance);assert_equal 'valdren',c.race;assert_equal 1234,c.gold
    assert_equal [7,23],[jr.reload.level,jr.xp]
  end

  def test_rasha_female_optional_hair_and_legacy_empty_row
    %w[waves].each_with_index do |hair, i|
      appearance = { 'face' => 'female', 'hair' => hair }
      response = create_character(name: "Fox#{('a'.ord+i).chr}", race: 'rasha', appearance: appearance)
      assert_equal 200, @api.response.status, response.inspect
      c = Character.find(response.fetch('character').fetch('id'))
      assert_equal appearance, c.reload.appearance
      @api.post "/api/characters/#{c.id}/select", as: :json
      assert_equal appearance, JSON.parse(@api.response.body).dig('character', 'appearance')
      @api.get '/api/game/state'
      assert_equal appearance, JSON.parse(@api.response.body).dig('character', 'appearance')
      ps = Vanai::PlayerState.new(c)
      assert_equal appearance, ps.public_payload[:appearance]
      ps.recompute!(c.reload)
      assert_equal appearance, ps.public_payload[:appearance]
      assert_equal Vanai::Stats.sheet(race: 'rasha', job: 'PLD', level: 1, equipped: c.equipped.map(&:definition)), ps.sheet
    end
    legacy = Character.find(create_character(name: 'Oldfox', race: 'rasha').fetch('character').fetch('id'))
    legacy.update_column(:appearance, {})
    assert_equal Character::RASHA_DEFAULTS, legacy.reload.appearance_payload
    assert_equal({}, legacy.appearance)
    assert_equal 'rasha', legacy.race
    [{face:'male'}, {hair:'bun'}, {hair:'braid'}, {gender:'female'}].each do |appearance|
      assert create_character(name: 'Invalidfox', race: 'rasha', appearance: appearance)['error']
      assert_equal 422, @api.response.status
    end
  end


  def test_karrog_male_independent_coif_and_beard
    %w[braid].product([true,false]).each_with_index do |(hair, beard),i|
      appearance={ 'face'=>'male', 'hair'=>hair, 'beard'=>beard }
      response=create_character(name: "Karrog#{('a'.ord+i).chr}",race:'karrog',appearance:appearance)
      assert_equal 200,@api.response.status,response.inspect
      c=Character.find(response.fetch('character').fetch('id'))
      assert_equal appearance,c.reload.appearance
      @api.post "/api/characters/#{c.id}/select",as: :json
      assert_equal appearance,JSON.parse(@api.response.body).dig('character','appearance')
      @api.get '/api/game/state'
      assert_equal appearance,JSON.parse(@api.response.body).dig('character','appearance')
      ps=Vanai::PlayerState.new(c);assert_equal appearance,ps.public_payload[:appearance]
      ps.recompute!(c.reload);assert_equal appearance,ps.public_payload[:appearance]
      assert_equal Vanai::Stats.sheet(race:'karrog',job:'PLD',level:1,equipped:c.equipped.map(&:definition)),ps.sheet
    end
    [{face:'female'},{hair:'waves'},{beard:'false'},{beard:nil},{beard:0},{moustache:true}].each do |appearance|
      assert create_character(name:'Invalidkarrog',race:'karrog',appearance:appearance)['error']
      assert_equal 422,@api.response.status
    end
    c=Character.find(create_character(name:'Oldkarrog',race:'karrog').fetch('character').fetch('id'))
    c.update_columns(appearance:{},gold:1234);jr=c.job_record;jr.update!(level:7,xp:23)
    assert_equal Character::KARROG_DEFAULTS,c.reload.appearance_payload
    assert_equal({},c.appearance);assert_equal 'karrog',c.race;assert_equal 1234,c.gold
    assert_equal [7,23],[jr.reload.level,jr.xp]
  end

  def test_defaults_and_aedri_records_keep_identity
    nym = create_character.fetch('character')
    assert_equal Character::NYM_DEFAULTS, nym['appearance']
    legacy = Character.find(nym['id'])
    legacy.update_column(:appearance, {})
    assert_equal Character::NYM_DEFAULTS, Vanai::PlayerState.new(legacy.reload).public_payload[:appearance]
    aedri = create_character(name: 'Human', race: 'aedri').fetch('character')
    assert_equal 'aedri', aedri['race']
    assert_equal({ 'face' => 'male', 'hair' => 'waves' }, aedri['appearance'])
    legacy_aedri = Character.find(aedri['id'])
    legacy_aedri.update_column(:appearance, {})
    assert_equal({ 'face' => 'male', 'hair' => 'waves' }, legacy_aedri.reload.appearance_payload)
    assert_equal({}, legacy_aedri.appearance)
    assert_equal %w[aedri valdren karrog nym rasha], Character::RACES
  end

  def test_rejects_unfinished_races_and_invalid_appearance_without_creating_records
    count = Character.count
    %w[unknown].each do |race|
      assert create_character(race: race)['error']
      assert_equal 422, @api.response.status
    end
    [nil, [], 'female', {face: 'unknown'}, {hair: 'unknown'}, {face: ['male']}, {color: 'red'}].each do |appearance|
      assert create_character(appearance: appearance)['error'], appearance.inspect
      assert_equal 422, @api.response.status
    end
    assert create_character(race: 'aedri', appearance: {face: 'female', hair: 'waves'})['error']
    assert_equal count, Character.count
  end

  # Every hair comes in its own colour (natural: no colour saved) or one of
  # Character::HAIR_COLOURS, for every race and body; the colour travels with
  # the appearance to selection, game state and other players.
  def test_hair_colours_for_every_race_survive_create_select_state_and_public_payload
    looks = [['nym', { 'face' => 'female', 'hair' => 'bun' }], ['aedri', { 'face' => 'male', 'hair' => 'waves' }],
             ['valdren', { 'face' => 'female', 'hair' => 'braid' }], ['karrog', { 'face' => 'male', 'hair' => 'braid', 'beard' => true }],
             ['rasha', { 'face' => 'female', 'hair' => 'waves' }]]
    assert_equal %w[natural dark_blue dark_green auburn], Character::HAIR_COLOURS
    looks.product(Character::HAIR_COLOURS).each_with_index do |((race, look), colour), i|
      appearance = look.merge('hair_colour' => colour)
      response = create_character(name: "Dye#{('a'.ord + i / 26).chr}#{('a'.ord + i % 26).chr}", race: race, appearance: appearance)
      assert_equal 200, @api.response.status, response.inspect
      c = Character.find(response.fetch('character').fetch('id'))
      assert_equal appearance, c.reload.appearance
      @api.post "/api/characters/#{c.id}/select", as: :json
      assert_equal appearance, JSON.parse(@api.response.body).dig('character', 'appearance')
      @api.get '/api/game/state'
      assert_equal appearance, JSON.parse(@api.response.body).dig('character', 'appearance')
      assert_equal appearance, Vanai::PlayerState.new(c).public_payload[:appearance]
      c.destroy! # an account holds at most Character::MAX_PER_USER
    end
    count = Character.count
    ['blue', 'none', '', nil, true, ['auburn'], 'Auburn'].each do |colour|
      assert create_character(name: 'Baddye', race: 'aedri', appearance: { face: 'male', hair_colour: colour })['error'], colour.inspect
      assert_equal 422, @api.response.status
    end
    assert_equal count, Character.count
  end

  # Every player character has hair (Philip, 2026-10-15): no race may be made
  # bald, and a row saved bald before the ruling reads and saves with hair.
  def test_no_character_can_be_bald
    count = Character.count
    [['nym', {face: 'male'}], ['nym', {face: 'female'}], ['aedri', {face: 'male'}], ['aedri', {face: 'female'}],
     ['valdren', {face: 'male'}], ['valdren', {face: 'female'}], ['karrog', {face: 'male'}], ['rasha', {face: 'female'}]].each do |race, appearance|
      assert create_character(name: 'Baldy', race: race, appearance: appearance.merge(hair: 'none'))['error'], race
      assert_equal 422, @api.response.status
      assert create_character(name: 'Baldy', race: race, appearance: appearance.merge(hair: nil))['error'], race
      assert_equal 422, @api.response.status
    end
    assert_equal count, Character.count
    { 'nym' => 'tousled', 'aedri' => 'waves', 'valdren' => 'cascade', 'karrog' => 'braid', 'rasha' => 'waves' }.each_with_index do |(race, hair), i|
      c = Character.find(create_character(name: "Legacy#{('a'.ord+i).chr}", race: race).fetch('character').fetch('id'))
      c.update_column(:appearance, c.appearance.merge('hair' => 'none'))
      assert_equal hair, c.reload.appearance_payload['hair'], race
      assert_equal hair, Vanai::PlayerState.new(c).public_payload[:appearance]['hair'], race
      c.update!(gold: 99)
      assert_equal hair, c.reload.appearance['hair'], race
    end
    female = Character.find(create_character(name: 'Legacyf', race: 'aedri', appearance: {face: 'female'}).fetch('character').fetch('id'))
    female.update_column(:appearance, { 'face' => 'female', 'hair' => 'none' })
    assert_equal 'braid', female.reload.appearance_payload['hair']
  end
end
