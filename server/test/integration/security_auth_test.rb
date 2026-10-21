ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'action_dispatch/testing/integration'
require 'action_cable/test_helper'

# The account's own defences: writes to the API only as JSON, so a page on the
# same site cannot post a form with the player's cookie; a session good only
# while it carries the account's token, so signing out or a new password ends
# every copy of it; a sign-in limit per account as well as per address; and an
# email no longer than mail allows.
class SecurityAuthTest < Minitest::Test
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
  def me(api = @api) = (api.get('/api/me'); JSON.parse(api.response.body)['user'])

  # ---- writes are JSON only ----

  def test_a_form_post_is_refused_before_it_does_anything
    @api.post '/api/register', params: { email: 'form@example.invalid', password: PASSWORD }
    assert_equal 415, @api.response.status
    refute User.find_by_email('form@example.invalid'), 'a form post made no account'
    assert_equal 200, register('form@example.invalid').first
    # signed in, a form post is still refused, and a text/plain one too
    @api.post '/api/characters', params: { name: 'Formed', race: 'aedri', job: 'PLD', city: 'caerdun' }
    assert_equal 415, @api.response.status
    @api.post '/api/characters', params: '{"name":"Formed"}', headers: { 'CONTENT_TYPE' => 'text/plain' }
    assert_equal 415, @api.response.status
    @api.delete '/api/logout'
    assert_equal 415, @api.response.status
    refute_nil me, 'the forged sign-out did not sign anyone out'
  end

  def test_reads_need_no_content_type
    @api.get '/api/me'
    assert_equal 200, @api.response.status
  end

  # ---- sessions end ----

  def test_signing_out_ends_every_copy_of_the_session
    assert_equal 200, register('copied@example.invalid').first
    thief = session
    thief.cookies[cookie_key] = @api.cookies[cookie_key]
    assert_equal 'copied@example.invalid', me(thief)&.fetch('email'), 'the copy works while the session does'
    user = User.find_by_email('copied@example.invalid')
    disconnected = []
    original = User.instance_method(:disconnect!)
    User.define_method(:disconnect!) { disconnected << id }
    begin
      @api.delete '/api/logout', as: :json
    ensure
      User.define_method(:disconnect!, original)
    end
    assert_equal 200, @api.response.status
    assert_equal [user.id], disconnected, 'its sockets are closed'
    assert_nil me(thief), 'the copied cookie signs nobody in'
    thief.get '/api/characters'
    assert_equal 401, thief.response.status
    assert_equal 200, login('copied@example.invalid').first
    refute_nil me
  end

  def test_a_new_password_ends_every_session
    assert_equal 200, register('reset@example.invalid').first
    refute_nil me
    user = User.find_by_email('reset@example.invalid')
    before = user.session_token
    user.update!(password: 'a-new-password')
    refute_equal before, user.reload.session_token
    assert_nil me, 'the session from before the reset is over'
    assert_equal 401, login('reset@example.invalid').first
    assert_equal 200, login('reset@example.invalid', 'a-new-password').first
  end

  # The sockets close once the new password is committed, so this one runs
  # outside the test's transaction and cleans up after itself.
  def test_a_new_password_closes_the_sockets_once_committed
    ActiveRecord::Base.connection.rollback_transaction
    user = User.create!(email: 'reset-socket@example.invalid', password: PASSWORD)
    disconnected = []
    original = User.instance_method(:disconnect!)
    User.define_method(:disconnect!) { disconnected << id }
    user.update!(muted_at: nil, email: 'reset-socket2@example.invalid')
    assert_empty disconnected, 'only a new password closes them'
    user.update!(password: 'a-new-password')
    assert_equal [user.id], disconnected
  ensure
    User.define_method(:disconnect!, original) if original
    User.where(email: %w[reset-socket@example.invalid reset-socket2@example.invalid]).delete_all
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
  end

  def test_other_changes_keep_the_session
    assert_equal 200, register('kept@example.invalid').first
    user = User.find_by_email('kept@example.invalid')
    user.mute!
    user.unmute!
    refute_nil me
  end

  def test_signing_in_starts_a_fresh_session
    assert_equal 200, register('fresh@example.invalid').first
    before = @api.cookies[cookie_key]
    assert_equal 200, login('fresh@example.invalid').first
    refute_equal before, @api.cookies[cookie_key]
    refute_nil me
  end

  def test_a_cookie_from_before_the_token_signs_nobody_in
    user = User.create!(email: 'old-cookie@example.invalid', password: PASSWORD)
    # a session from before the migration: the account id and no token
    assert_nil me(with_session('user_id' => user.id))
    assert_equal user.email, me(with_session('user_id' => user.id, 'token' => user.session_token))&.fetch('email'),
                 'the same cookie with the token does'
  end

  def with_session(value)
    jar = ActionDispatch::Request.new(Rails.application.env_config.merge('HTTP_HOST' => 'localhost')).cookie_jar
    # without a session_id the cookie store reads the session as absent
    jar.encrypted[cookie_key] = { value: value.merge('session_id' => SecureRandom.hex(16)) }
    api = session
    api.cookies[cookie_key] = jar[cookie_key]
    api
  end

  # ---- limits ----

  def with_counted_attempts
    store = Api::SessionsController.cache_store
    counter = ActiveSupport::Cache::MemoryStore.new
    store.define_singleton_method(:increment) { |*args, **opts| counter.increment(*args, **opts) }
    yield
  ensure
    store.singleton_class.remove_method(:increment)
  end

  def test_sign_in_is_limited_per_account_from_any_number_of_addresses
    User.create!(email: 'target@example.invalid', password: PASSWORD)
    with_counted_attempts do
      Api::BaseController::AUTH_ATTEMPTS_PER_EMAIL.times do |i|
        api = session
        api.remote_addr = "203.0.113.#{i + 1}"
        assert_equal 401, login(' Target@example.invalid', 'wrong-password', api).first
      end
      api = session
      api.remote_addr = '198.51.100.7'
      status, body = login('target@example.invalid', PASSWORD, api)
      assert_equal 429, status
      assert_match(/Too many attempts/, body['error'])
      # another account from that address is untouched
      User.create!(email: 'bystander@example.invalid', password: PASSWORD)
      assert_equal 200, login('bystander@example.invalid', PASSWORD, api).first
    end
  end

  # ---- email length ----

  def test_an_email_past_254_characters_is_refused_cleanly
    long = "#{'a' * 245}@example.invalid"
    status, body = register(long)
    assert_equal 422, status
    assert_match(/too long/, body['error'])
    assert_equal 401, login(long).first
    at_limit = "#{'a' * 238}@example.invalid"
    assert_equal 254, at_limit.length
    assert_equal 200, register(at_limit, PASSWORD, session).first
  end

  private

  def cookie_key = Rails.application.config.session_options[:key]
end

# The socket checks the token the same way.
class SessionTokenConnectionTest < ActionCable::Connection::TestCase
  tests ApplicationCable::Connection

  def setup
    super
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
  end

  def teardown
    ActiveRecord::Base.connection.rollback_transaction
    super
  end

  def sign_in(session)
    cookies.encrypted[Rails.application.config.session_options[:key]] = { value: session }
  end

  def test_the_socket_needs_the_current_token
    user = User.create!(email: 'socket-token@example.invalid', password: 'isolated-test-password')
    char = Character.provision!(user: user, name: 'Tokened', job: 'PLD', city: 'caerdun')
    sign_in('user_id' => user.id, 'character_id' => char.id)
    assert_reject_connection { connect }
    sign_in('user_id' => user.id, 'character_id' => char.id, 'token' => user.session_token)
    connect
    assert_equal user.id, connection.current_user_id
    user.sign_out_everywhere!
    assert_reject_connection { connect }
  end
end
