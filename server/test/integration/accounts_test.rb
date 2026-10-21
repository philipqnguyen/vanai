ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'action_dispatch/testing/integration'
require 'action_cable/test_helper'

# Accounts: sign-up and sign-in limits, one account per address however it is
# typed, the password floor, and the moderation an operator has (DEPLOY.md
# "Moderation and accounts"): a ban refused at sign-in, on every request and
# at the socket; a mute that keeps every word in; deleting an account whole.
class AccountsTest < Minitest::Test
  W = Vanai::World
  PASSWORD = 'isolated-test-password'

  def setup
    raise 'Test database only' unless Rails.env.test?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @api = session
  end

  def teardown
    ActiveRecord::Base.connection.rollback_transaction
  end

  def session
    s = ActionDispatch::Integration::Session.new(Rails.application)
    s.host! 'localhost'
    s
  end

  def post(path, params, api = @api)
    api.post path, params: params, as: :json
    [api.response.status, JSON.parse(api.response.body)]
  end

  def register(email, password = PASSWORD, api = @api) = post('/api/register', { email: email, password: password }, api)
  def login(email, password = PASSWORD, api = @api) = post('/api/login', { email: email, password: password }, api)

  # The test environment's cache is a null store, under which rate_limit
  # counts nothing; the limit's own store is given a real counter for a test.
  def with_counted_attempts
    store = Api::SessionsController.cache_store
    counter = ActiveSupport::Cache::MemoryStore.new
    store.define_singleton_method(:increment) { |*args, **opts| counter.increment(*args, **opts) }
    yield
  ensure
    store.singleton_class.remove_method(:increment)
  end

  # ---- sign-up ----

  def test_a_second_account_for_the_same_address_is_refused_in_any_case
    assert_equal 200, register('Twice@Example.invalid').first
    status, body = register(' twice@example.INVALID ', PASSWORD, session)
    assert_equal 422, status
    assert_equal 'Email has already been taken', body['error']
  end

  def test_a_sign_up_race_lost_at_the_index_is_the_same_refusal
    original = User.instance_method(:save)
    User.define_method(:save) { |*| raise ActiveRecord::RecordNotUnique, 'duplicate key value violates unique constraint' }
    status, body = register('race@example.invalid')
    assert_equal 422, status
    assert_equal 'Email has already been taken', body['error']
  ensure
    User.define_method(:save, original)
  end

  def test_a_password_needs_eight_characters
    status, body = register('short@example.invalid', '1234567')
    assert_equal 422, status
    assert_match(/too short/, body['error'])
    assert_equal 200, register('short@example.invalid', '12345678').first
  end

  def test_an_older_shorter_password_still_signs_in
    user = User.create!(email: 'old@example.invalid', password: PASSWORD)
    user.update_column(:password_digest, BCrypt::Password.create('sixsix', cost: BCrypt::Engine::MIN_COST))
    assert_equal 200, login('old@example.invalid', 'sixsix').first
  end

  # ---- limits ----

  def test_sign_in_attempts_are_limited_and_answered_in_json
    User.create!(email: 'limited@example.invalid', password: PASSWORD)
    with_counted_attempts do
      Api::BaseController::AUTH_ATTEMPTS.times { assert_equal 401, login('limited@example.invalid', 'wrong-password').first }
      status, body = login('limited@example.invalid')
      assert_equal 429, status
      assert_match(/Too many attempts/, body['error'])
    end
  end

  def test_sign_ups_are_limited
    with_counted_attempts do
      Api::BaseController::AUTH_ATTEMPTS.times { |i| assert_equal 200, register("many#{i}@example.invalid", PASSWORD, session).first }
      assert_equal 429, register('one-too-many@example.invalid').first
    end
  end

  # ---- bans ----

  def test_a_banned_account_cannot_sign_in_and_its_session_is_void
    assert_equal 200, register('banned@example.invalid').first
    @api.get '/api/me'
    assert_equal 'banned@example.invalid', JSON.parse(@api.response.body).dig('user', 'email')
    User.find_by_email('banned@example.invalid').ban!
    @api.get '/api/me'
    assert_nil JSON.parse(@api.response.body)['user'], 'the cookie it already holds signs nobody in'
    @api.get '/api/characters'
    assert_equal 401, @api.response.status
    status, body = login('banned@example.invalid')
    assert_equal 403, status
    assert_equal 'This account has been banned.', body['error']
    # a wrong password learns nothing about the ban
    assert_equal 401, login('banned@example.invalid', 'wrong-password').first
    User.find_by_email('banned@example.invalid').unban!
    assert_equal 200, login('banned@example.invalid').first
  end

  # ---- mutes ----

  def with_world
    saved = %i[zones parties online party_grace sessions queue trades move_checks].to_h { |k| [k, W.instance_variable_get("@#{k}")] }
    %i[zones parties online party_grace sessions trades move_checks].each { |k| W.instance_variable_set("@#{k}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.initialize_ferry
    sent = []
    zone = []
    originals = { to_char: W.method(:to_char), broadcast_zone: W.method(:broadcast_zone) }
    W.define_singleton_method(:to_char) { |id, payload| sent << [id, payload] }
    W.define_singleton_method(:broadcast_zone) { |key, payload| zone << [key, payload] }
    yield sent, zone
  ensure
    originals&.each { |name, m| W.define_singleton_method(name, m) }
    saved&.each { |k, v| W.instance_variable_set("@#{k}", v) }
  end

  def test_a_muted_player_is_heard_by_no_one_and_told_so
    user = User.create!(email: 'muted@example.invalid', password: PASSWORD)
    talker = Character.provision!(user: user, name: 'Hushed', job: 'PLD', city: 'caerdun')
    friend = Character.provision!(user: User.create!(email: 'friend@example.invalid', password: PASSWORD),
                                  name: 'Listener', job: 'WHM', city: 'caerdun')
    with_world do |sent, zone|
      W.join(talker.id)
      W.join(friend.id)
      W.chat(talker.id, 'say', 'before the mute')
      assert zone.any? { |_, p| p[:t] == 'chat' && p[:msg] == 'before the mute' }
      user.mute!
      zone.clear
      sent.clear
      ['say', 'party'].each { |ch| W.chat(talker.id, ch, 'after the mute') }
      W.chat(talker.id, 'say', '/tell Listener after the mute')
      W.chat(talker.id, 'say', '/c after the mute')
      W.chat(talker.id, 'say', '/shout after the mute')
      assert_empty zone.select { |_, p| p[:t] == 'chat' }
      assert_empty sent.select { |id, p| id == friend.id && p[:t] == 'chat' }
      told = sent.select { |id, p| id == talker.id && p[:msg] == 'You are muted. No one hears what you say.' }
      assert_equal 5, told.size
      user.unmute!
      W.chat(talker.id, 'say', 'heard again')
      assert zone.any? { |_, p| p[:t] == 'chat' && p[:msg] == 'heard again' }
      W.leave(talker.id, persist: false)
      W.leave(friend.id, persist: false)
    end
  end

  # ---- deleting an account ----

  def test_deleting_an_account_takes_every_character_and_what_would_block_it
    user = User.create!(email: 'leaving@example.invalid', password: PASSWORD)
    a = Character.provision!(user: user, name: 'Leaving', job: 'PLD', city: 'caerdun')
    b = Character.provision!(user: user, name: 'Leavingtoo', job: 'BLM', city: 'moonmere')
    other = Character.provision!(user: User.create!(email: 'staying@example.invalid', password: PASSWORD),
                                 name: 'Staying', job: 'WHM', city: 'heartwood')
    led = Company.create!(name: 'Leavers Guild', leader_id: a.id)
    alone = Company.create!(name: 'Lone Banner', leader_id: b.id)
    [a, other].each { |c| c.update!(company_id: led.id) }
    b.update!(company_id: alone.id)
    AuctionListing.create!(seller: a, item_key: 'worn_sword', price: 10)
    bought = AuctionListing.create!(seller: other, buyer: b, item_key: 'worn_sword', price: 10, status: AuctionListing::SOLD)
    Friendship.create!(character: a, friend_name: 'Staying')
    MailLetter.create!(recipient_id: other.id, sender_id: a.id, sender_name: 'Leaving', subject: 'farewell')

    user.delete_account!

    assert_nil User.find_by(id: user.id)
    refute Character.exists?(id: [a.id, b.id])
    assert Character.exists?(id: other.id)
    assert_equal other.id, led.reload.leader_id, 'the lead goes to who is left'
    refute Company.exists?(id: alone.id), 'a company with no one left is furled'
    assert_nil bought.reload.buyer_id
    assert_equal 1, MailLetter.where(recipient_id: other.id, sender_id: nil).count
  end
end

# The realtime socket turns a banned account away, cookie or no cookie.
class BannedConnectionTest < ActionCable::Connection::TestCase
  tests ApplicationCable::Connection

  # rails/test_help is not loaded, so nothing rolls this case back but this
  def setup
    super
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
  end

  def teardown
    ActiveRecord::Base.connection.rollback_transaction
    super
  end

  def sign_in(user, char)
    # a Hash is read as cookie options, so the session goes in as their value
    cookies.encrypted[Rails.application.config.session_options[:key]] = { value: { 'user_id' => user.id, 'character_id' => char.id, 'token' => user.session_token } }
  end

  def test_a_banned_account_cannot_open_the_socket
    user = User.create!(email: 'socket@example.invalid', password: 'isolated-test-password')
    char = Character.provision!(user: user, name: 'Socketed', job: 'PLD', city: 'caerdun')
    sign_in(user, char)
    connect
    assert_equal user.id, connection.current_user_id
    user.ban!
    assert_reject_connection { connect }
  end
end
