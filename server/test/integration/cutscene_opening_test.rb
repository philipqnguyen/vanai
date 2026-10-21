ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'action_dispatch/testing/integration'

# The intro and the opening scene, end to end through the database (Philip's
# rulings 2026-10-11: a new character sees the intro, shared by everyone, and
# then the opening of their home city). A new character is owed it from the moment they are made; their
# first join sends it; watching or skipping it records it seen, and then it
# is never sent again, though it can be replayed.
class CutsceneOpeningTest < Minitest::Test
  W = Vanai::World
  C = Vanai::Cutscenes

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@trades, {})
    W.initialize_ferry
    @messages = []
    @original_send = W.method(:to_char)
    test = self
    W.define_singleton_method(:to_char) { |id, payload| test.instance_variable_get(:@messages) << [id, payload] }
    @user = User.create!(email: 'cutscene-test@example.invalid', password: 'isolated-test-password')
  end

  def teardown
    W.define_singleton_method(:to_char, @original_send)
    ActiveRecord::Base.connection.rollback_transaction
  end

  def scenes_for(c) = @messages.select { |id, p| id == c.id && p[:t] == 'cutscene' }.map { |_, p| p[:id] }
  def keys(c) = c.discoveries.reload.pluck(:landmark_key)

  def test_each_city_owes_its_new_character_the_citys_opening
    { 'caerdun' => 'Opencd', 'heartwood' => 'Openhw', 'moonmere' => 'Openmm' }.each do |city, name|
      c = Character.provision!(user: @user, name: name, job: 'PLD', city: city)
      opening = C.opening_for(city)
      assert_includes keys(c), "#{C::DUE}#{opening}", city
      W.join(c.id)
      assert_equal [opening], scenes_for(c), "#{city}: the first join sends it"
      W.leave(c.id)
    end
  end

  def test_watched_once_it_is_seen_not_owed_and_not_sent_again
    c = Character.provision!(user: @user, name: 'Watcher', job: 'WHM', city: 'caerdun')
    opening = C.opening_for('caerdun')
    W.join(c.id)
    W.cutscene_begin(c.id, opening)
    assert W.find_player(c.id).last.cutscene
    W.cutscene_end(c.id, opening)
    assert_includes keys(c), "#{C::SEEN}#{opening}"
    refute_includes keys(c), "#{C::DUE}#{opening}"
    W.leave(c.id)
    @messages.clear
    W.join(c.id)
    assert_empty scenes_for(c), 'not sent on a later login'
    # ...but it can be watched again from where it was filmed
    W.cutscene_begin(c.id, opening)
    assert_equal opening, W.find_player(c.id).last.cutscene
    W.cutscene_end(c.id, opening)
    assert_equal 1, keys(c).count { |k| k == "#{C::SEEN}#{opening}" }
    W.leave(c.id)
  end

  def test_a_scene_left_mid_play_is_still_owed_at_the_next_login
    c = Character.provision!(user: @user, name: 'Leaver', job: 'MNK', city: 'moonmere')
    opening = C.opening_for('moonmere')
    W.join(c.id)
    W.cutscene_begin(c.id, opening)
    W.leave(c.id) # a refresh in the middle
    @messages.clear
    W.join(c.id)
    assert_equal [opening], scenes_for(c)
    assert_nil W.find_player(c.id).last.cutscene, 'a fresh session is not frozen'
    W.leave(c.id)
  end

  def test_the_game_state_hands_the_client_what_it_has_seen
    c = Character.provision!(user: @user, name: 'Rewatch', job: 'SAM', city: 'heartwood')
    opening = C.opening_for('heartwood')
    W.join(c.id)
    W.cutscene_begin(c.id, opening)
    W.cutscene_end(c.id, opening)
    W.leave(c.id)
    # GameController#state sends every discovery but the crystals, so the
    # client's /cutscene knows what it may replay
    assert_includes c.discoveries.where.not("landmark_key LIKE 'milestone_%'").pluck(:landmark_key), "#{C::SEEN}#{opening}"
  end

  # ---------- the intro ----------

  def test_every_new_character_is_owed_the_intro_too
    intro = C.intro_id
    refute_nil intro
    assert Vanai::Data.cutscenes[intro]['chapters'], 'the intro is told in chapters'
    c = Character.provision!(user: @user, name: 'Introed', job: 'BLM', city: 'heartwood')
    assert_includes keys(c), "#{C::DUE}#{intro}"
    # it plays before the world is joined, so the world never sends it
    W.join(c.id)
    refute_includes scenes_for(c), intro
    W.leave(c.id)
  end

  def test_the_intro_is_reported_seen_over_rest_and_only_by_its_owner
    api = ActionDispatch::Integration::Session.new(Rails.application)
    api.host! 'localhost'
    api.post '/api/register', params: { email: 'intro-test@example.invalid', password: 'isolated-test-password' }, as: :json
    api.post '/api/characters', params: { name: 'Prologue', race: 'aedri', job: 'PLD', city: 'caerdun' }, as: :json
    c = Character.find(JSON.parse(api.response.body).dig('character', 'id'))
    api.post "/api/characters/#{c.id}/select", as: :json
    api.get '/api/game/state'
    assert_includes JSON.parse(api.response.body)['discoveries'], "#{C::DUE}#{C.intro_id}", 'the client learns it is owed'
    touched = Vanai::World.touch_gen(c.id)
    api.post '/api/game/scene_seen', params: { id: C.intro_id }, as: :json
    assert_equal 200, api.response.status
    assert_includes keys(c), "#{C::SEEN}#{C.intro_id}"
    assert_operator Vanai::World.touch_gen(c.id), :>, touched, 'a join being read is read again'
    refute_includes keys(c), "#{C::DUE}#{C.intro_id}"
    # a second report is harmless; a scene filmed in a zone is the world's to record
    api.post '/api/game/scene_seen', params: { id: C.intro_id }, as: :json
    assert_equal 200, api.response.status
    api.post '/api/game/scene_seen', params: { id: C.opening_for('caerdun') }, as: :json
    assert_equal 404, api.response.status
    # and nobody marks a scene they were never owed
    c.discoveries.where("landmark_key LIKE 'scene_%intro'").delete_all
    api.post '/api/game/scene_seen', params: { id: C.intro_id }, as: :json
    assert_equal 403, api.response.status
  end
end
