ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'

# Moves skip ActionCable's worker pool (ApplicationCable::Connection#receive,
# docs/SERVER-PERF.md rule 10): a move frame for a confirmed ZoneChannel goes
# from the thread that read it through the bucket to the world's queue, with
# what perform_action would have queued; anything else goes the usual way.
class CableFastMoveTest < Minitest::Test
  W = Vanai::World
  IDENT = { channel: 'ZoneChannel' }.to_json

  class Socket
    def transmit(_) = true
    def alive? = true
    def possible? = true
    def protocol = 'actioncable-v1-json'
    def close(*) = nil
  end

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    @saved = %i[sessions online queue].to_h { |k| [k, W.instance_variable_get("@#{k}")] }
    W.instance_variable_set(:@sessions, {})
    W.instance_variable_set(:@online, {})
    W.instance_variable_set(:@queue, Queue.new)
    @originals = %i[request_join apply_move].to_h { |m| [m, W.method(m)] }
    test = self
    @moves = []
    W.define_singleton_method(:request_join) { |*| nil }
    W.define_singleton_method(:apply_move) { |*a, **k| test.instance_variable_get(:@moves) << a }
    @user = User.create!(email: 'fast-move@example.invalid', password: 'isolated-test-password')
    @char = Character.provision!(user: @user, name: 'Fastmover', job: 'PLD', city: 'caerdun')
    env = Rack::MockRequest.env_for('/cable', 'HTTP_HOST' => 'localhost', 'HTTP_ORIGIN' => 'http://localhost')
    @conn = ApplicationCable::Connection.new(ActionCable.server, env)
    @conn.instance_variable_set(:@websocket, Socket.new)
    @conn.current_user_id = @user.id
    @conn.current_character_id = @char.id
    @conn.subscriptions.execute_command('command' => 'subscribe', 'identifier' => IDENT)
    @pooled = []
    @conn.define_singleton_method(:send_async) { |*a| test.instance_variable_get(:@pooled) << a }
  end

  def teardown
    @conn&.subscriptions&.unsubscribe_from_all
    @originals&.each { |m, impl| W.define_singleton_method(m, impl) }
    @saved&.each { |k, v| W.instance_variable_set("@#{k}", v) }
    ActiveRecord::Base.connection.rollback_transaction
    ZoneChannel::BUCKET_LOCK.synchronize { ZoneChannel::BUCKETS_BY_CHAR.delete(@char&.id); ZoneChannel::RESTING.delete(@char&.id) }
  end

  # as the client's ActionCable consumer writes a perform: data's own keys,
  # the action last, the whole encoded twice
  def frame(data, ident = IDENT) = { command: 'message', identifier: ident, data: data.to_json }.to_json

  def drain
    q = W.instance_variable_get(:@queue)
    q.pop.call until q.empty?
  end

  def test_a_move_is_queued_without_the_worker_pool
    @conn.receive(frame(x: 12.5, z: -3.25, h: 1.5, anim: 'run', action: 'move'))
    assert_empty @pooled, 'no worker-pool task'
    drain
    assert_equal [[@char.id, 12.5, -3.25, 1.5, 'run']], @moves
  end

  # what perform_action would queue, whatever the client sent
  def test_the_fast_way_queues_what_the_usual_way_does
    channel = @conn.subscriptions.send(:subscriptions)[IDENT]
    odd = [{ x: '4.5', z: 2, h: 'NaN', anim: 'a' * 40 }, { x: 1, z: 2 }, { x: 'nope', z: 1 },
           { x: 1, z: 2, h: nil, anim: { sneaky: 1 } }, { x: 1e308, z: -1e308, h: 7, anim: 3 }]
    odd.each do |d|
      @moves.clear
      channel.perform_action(JSON.parse(d.merge(action: 'move').to_json))
      drain
      usual = @moves.dup
      @moves.clear
      @conn.receive(frame(d.merge(action: 'move')))
      drain
      assert_equal usual, @moves, d.inspect
    end
    assert_empty @pooled
  end

  def test_a_move_past_its_bucket_is_dropped_as_before
    burst = ZoneChannel::BUCKETS[:move].last.to_i
    (burst + 10).times { @conn.receive(frame(x: 1, z: 1, action: 'move')) }
    drain
    assert_equal burst, @moves.size
    assert_empty @pooled
  end

  # A move sent after a message still in the pool waits behind it there, so
  # the world sees them in the order they were sent; once the pool has run
  # them, moves go the fast way again.
  def test_a_move_waits_behind_its_connections_messages_in_the_pool
    @conn.receive(frame(x: 1, z: 1, action: 'jump'))
    @conn.receive(frame(x: 2, z: 2, action: 'move'))
    assert_equal 2, @pooled.size, 'the move went behind the message before it'
    @pooled.shift(2).each { |m, msg| @conn.send(m, msg) } # the pool runs them, in order
    drain
    assert_equal [[@char.id, 2, 2]], @moves.map { |m| m.first(3) }
    @moves.clear
    @conn.receive(frame(x: 3, z: 3, action: 'move'))
    assert_empty @pooled, 'the pool is clear: the fast way'
    drain
    assert_equal 1, @moves.size
  end

  def test_anything_else_goes_the_usual_way
    [frame(channel: 'say', msg: 'type "action":"move" in chat', action: 'chat'),
     frame({ x: 1, z: 1, action: 'move' }, { channel: 'ZoneChannel', extra: 1 }.to_json),
     frame(x: 1, z: 1, action: 'jump'),
     '{"command":"message","identifier":' + IDENT.to_json + ',"data":"{\"action\":\"move\",'].each do |f|
      # each alone: nothing of theirs still waits in the pool
      @conn.instance_variable_get(:@in_pool).value = 0
      @conn.receive(f)
    end
    assert_equal 4, @pooled.size
    assert(@pooled.all? { |m, *| m == :dispatch_websocket_message })
    drain
    assert_empty @moves
  end
end
