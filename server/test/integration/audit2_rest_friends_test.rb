ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'action_dispatch/testing/integration'

# Audit 2, the friends list (a design question that was a plain bug): the cap
# is counted under the character's lock, and the same name added twice at
# once is a refusal, not a 500. A "rival" commits what a parallel add would
# have, once, just before this request's Character#lock!.
class Audit2RestFriendsTest < Minitest::Test
  module RivalBeforeLock
    def lock!(*args, **opts)
      rival = Thread.current[:audit2_rest_friends_rival]
      Thread.current[:audit2_rest_friends_rival] = nil
      rival&.call
      super
    end
  end
  Character.prepend(RivalBeforeLock) unless Character.ancestors.include?(RivalBeforeLock)

  def setup
    raise 'Test database only' unless Rails.env.test?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @api = ActionDispatch::Integration::Session.new(Rails.application)
    @api.host! 'localhost'
    @api.post '/api/register', params: { email: 'audit2-friends@example.invalid', password: 'isolated-test-password' }, as: :json
    @api.post '/api/characters', params: { name: 'Befriends', race: 'aedri', job: 'PLD', city: 'caerdun' }, as: :json
    assert_equal 200, @api.response.status, @api.response.body
    @char = Character.find(JSON.parse(@api.response.body).dig('character', 'id'))
    @api.post "/api/characters/#{@char.id}/select", as: :json
    @friend = Character.provision!(user: @char.user, name: 'Wanted', job: 'PLD', city: 'caerdun')
  end

  def teardown
    Thread.current[:audit2_rest_friends_rival] = nil
    ActiveRecord::Base.connection.rollback_transaction
  end

  # A parallel add of the same name commits first: the index refuses this one.
  def test_duplicate_add_is_a_refusal
    id = @char.id
    Thread.current[:audit2_rest_friends_rival] = -> { Friendship.create!(character_id: id, friend_name: 'Wanted') }
    @api.post '/api/friends', params: { name: 'Wanted', op: 'add' }, as: :json
    assert_nil Thread.current[:audit2_rest_friends_rival], 'the rival ran'
    assert_equal 422, @api.response.status, @api.response.body
    assert_match(/already/, JSON.parse(@api.response.body)['error'])
  end

  # Parallel adds of other names fill the list after the first count: the
  # count under the lock sees them and refuses the hundred-and-first.
  def test_cap_counted_under_the_lock
    (Api::FriendsController::MAX_FRIENDS - 1).times { |i| Friendship.create!(character_id: @char.id, friend_name: "Pal#{i}") }
    id = @char.id
    Thread.current[:audit2_rest_friends_rival] = -> { Friendship.create!(character_id: id, friend_name: 'Lastpal') }
    @api.post '/api/friends', params: { name: 'Wanted', op: 'add' }, as: :json
    assert_nil Thread.current[:audit2_rest_friends_rival], 'the rival ran'
    assert_equal 422, @api.response.status, @api.response.body
    assert_match(/full/, JSON.parse(@api.response.body)['error'])
    assert_equal Api::FriendsController::MAX_FRIENDS, Friendship.where(character_id: @char.id).count
  end
end
