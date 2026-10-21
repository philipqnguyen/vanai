ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'stringio'
require 'action_cable/channel/test_case'

# What a frame looks like on the wire, built as ActionCable built it before
# the zone streams went raw: the published string decoded, then the envelope
# encoded by Connection#transmit.
module CableFrames
  IDENT = { channel: 'ZoneChannel' }.to_json

  def stock_frame(payload, ident = IDENT)
    published = ActiveSupport::JSON.encode(payload)
    ActiveSupport::JSON.encode({ identifier: ident, message: ActiveSupport::JSON.decode(published) })
  end

  # Floats as the pos payload has them, HTML that the encoder escapes, the
  # line separators it escapes, and text it leaves alone.
  def awkward_payload
    { t: 'chat', channel: 'say', from: 'Ana',
      msg: %(<b>&"quotes"</b> “curly” é \u{1F642}    \\ / 1e5 </script>),
      p: [[1, 1.0, -0.0, 3.14159, 'run'], [2, 1e20, -12.5, 0.1 + 0.2, nil]], m: [], ok: true }
  end

  # Every delivery is a task on the event loop's streamer pool, several at a
  # time: done when the pool has run all it was given.
  def drain_streamer
    pool = ActionCable.server.event_loop.instance_variable_get(:@executor)
    assert wait_until { pool.completed_task_count == pool.scheduled_task_count }, 'the streamer drains'
  end

  def wait_until(seconds = 2.0)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + seconds
    until yield
      return false if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
      sleep 0.005
    end
    true
  end
end

# A real ZoneChannel on a real ApplicationCable::Connection, through the test
# environment's adapter (the async one: deliveries posted to the event loop),
# with a socket that keeps what it is sent.
class ZoneStreamTest < Minitest::Test
  include CableFrames
  W = Vanai::World

  class Socket
    attr_reader :frames, :threads
    attr_accessor :fail_next

    def initialize
      @frames = Queue.new
      @threads = Queue.new
    end

    def transmit(data)
      if fail_next
        self.fail_next = false
        raise IOError, 'socket gone'
      end
      @threads << Thread.current
      @frames << data
      true
    end

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
    @log = StringIO.new
    @cable_logger = ActionCable.server.config.logger
    ActionCable.server.config.logger = ActiveSupport::TaggedLogging.new(ActiveSupport::Logger.new(@log))
    @user = User.create!(email: 'cable-stream@example.invalid', password: 'isolated-test-password')
    @char = Character.provision!(user: @user, name: 'Streamer', job: 'PLD', city: 'caerdun')
    @socket = Socket.new
    env = Rack::MockRequest.env_for('/cable', 'HTTP_HOST' => 'localhost', 'HTTP_ORIGIN' => 'http://localhost')
    @conn = ApplicationCable::Connection.new(ActionCable.server, env)
    @conn.instance_variable_set(:@websocket, @socket)
    @conn.current_user_id = @user.id
    @conn.current_character_id = @char.id
    @channel = ZoneChannel.new(@conn, IDENT, JSON.parse(IDENT))
    @channel.subscribe_to_channel
    sid = @channel.instance_variable_get(:@session_id)
    W.instance_variable_get(:@sessions)[@char.id] = sid
    W.instance_variable_get(:@online)[@char.id] = 'caerdun'
    confirmed = ActiveSupport::JSON.encode({ identifier: IDENT, type: 'confirm_subscription' })
    assert_equal confirmed, next_frame, 'both streams subscribed'
    @socket.threads.clear
  end

  def teardown
    @channel&.unsubscribe_from_channel
    @saved&.each { |k, v| W.instance_variable_set("@#{k}", v) }
    ActionCable.server.config.logger = @cable_logger if @cable_logger
    ActiveRecord::Base.connection.rollback_transaction
  end

  def next_frame(seconds = 2.0)
    wait_until(seconds) { !@socket.frames.empty? } ? @socket.frames.pop : nil
  end

  def test_a_zone_frame_is_the_bytes_actioncable_sent
    ActionCable.server.broadcast('zone:caerdun', awkward_payload)
    assert_equal stock_frame(awkward_payload), next_frame
  end

  def test_a_char_frame_is_the_bytes_actioncable_sent
    payload = { t: 'self', hp: 812, max_hp: 900, buffs: [{ id: 'regen', ends: 12.5 }], note: '<i>&</i>' }
    ActionCable.server.broadcast("char:#{@char.id}", payload)
    assert_equal stock_frame(payload), next_frame
  end

  def test_frames_are_written_where_the_adapter_delivers_not_on_the_worker_pool
    ActionCable.server.broadcast('zone:caerdun', { t: 'x' })
    ActionCable.server.broadcast("char:#{@char.id}", { t: 'y' })
    2.times { refute_nil next_frame }
    2.times { assert_match(/\AActionCable-streamer-worker/, @socket.threads.pop.name) }
  end

  def test_a_stale_session_hears_nothing_from_its_zone
    W.instance_variable_get(:@sessions)[@char.id] = 'a later subscription'
    ActionCable.server.broadcast('zone:caerdun', { t: 'pos' })
    drain_streamer
    assert_empty @socket.frames, 'replaced'
    W.instance_variable_get(:@sessions)[@char.id] = @channel.instance_variable_get(:@session_id)
    W.instance_variable_get(:@online)[@char.id] = 'caerdunfields'
    ActionCable.server.broadcast('zone:caerdun', { t: 'pos' })
    drain_streamer
    assert_empty @socket.frames, 'moved on: the zone left is not heard'
    ActionCable.server.broadcast("char:#{@char.id}", { t: 'zone_change' })
    assert_equal stock_frame({ t: 'zone_change' }), next_frame, 'their own stream has no gate'
  end

  def test_a_frame_that_cannot_be_written_stops_nothing_else
    @socket.fail_next = true
    ActionCable.server.broadcast('zone:caerdun', { t: 'lost' })
    drain_streamer
    assert_empty @socket.frames
    ActionCable.server.broadcast('zone:caerdun', { t: 'next' })
    assert_equal stock_frame({ t: 'next' }), next_frame, 'the next one goes out'
    assert_match(/ZoneChannel could not stream from zone:caerdun: IOError: socket gone/, @log.string)
  end

  def test_unsubscribing_stops_both_streams
    @channel.unsubscribe_from_channel
    @channel = nil
    ActionCable.server.broadcast('zone:caerdun', { t: 'pos' })
    ActionCable.server.broadcast("char:#{@char.id}", { t: 'self' })
    drain_streamer
    assert_empty @socket.frames
  end
end

# ActionCable::Channel::TestCase's connection stub has no socket: the raw
# handler hands it the decoded message instead, the shape it records.
class RawTransmitterStubTest < Minitest::Test
  include CableFrames

  def test_the_stub_records_the_decoded_message_behind_the_gate
    conn = ActionCable::Channel::ConnectionStub.new(current_user_id: 1, current_character_id: 2)
    channel = ZoneChannel.new(conn, IDENT, JSON.parse(IDENT))
    open = true
    handler = channel.send(:raw_transmitter, 'zone:caerdun', -> { open })
    handler.call(ActiveSupport::JSON.encode(awkward_payload))
    open = false
    handler.call(ActiveSupport::JSON.encode({ t: 'gated' }))
    assert_equal 1, conn.transmissions.size
    sent = conn.transmissions.first
    assert_equal IDENT, sent[:identifier]
    assert_equal JSON.parse(ActiveSupport::JSON.encode(awkward_payload)), sent[:message]
  end
end
