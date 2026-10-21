ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'

# The world thread's standing budget (docs/SERVER-PERF.md): every zone ticks
# on one thread, so the steady state of play -- players walking, monsters
# wandering, nobody joining, no save due -- asks the database nothing. A
# query that creeps into the tick, a move or the pos frame stalls every zone
# for every player, so this fails the moment one does. Saves, joins, kills
# and quest steps have their own counted tests (zone_tick_perf_test.rb,
# world_load_test.rb, kill_path_db_test.rb, social_index_test.rb).
class WorldThreadBudgetTest < Minitest::Test
  W = Vanai::World

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades trade_invites].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@next_party_id, 0)
    W.initialize_ferry
    test = self
    @originals = { to_char: W.method(:to_char), broadcast_zone: W.method(:broadcast_zone), move_now: W.method(:move_now) }
    @frames = 0
    W.define_singleton_method(:to_char) { |*| nil }
    W.define_singleton_method(:broadcast_zone) { |*| test.instance_variable_set(:@frames, test.instance_variable_get(:@frames) + 1) }
    @t = 50_000.0
    W.define_singleton_method(:move_now) { test.instance_variable_get(:@t) }
    @user = User.create!(email: 'world-thread-budget@example.invalid', password: 'isolated-test-password')
    @sql = []
    @counting = ActiveSupport::Notifications.subscribe('sql.active_record') do |*, p|
      next if p[:name] == 'SCHEMA' || p[:sql] =~ /\A\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/
      test.instance_variable_get(:@sql) << p[:sql]
    end
  end

  def teardown
    ActiveSupport::Notifications.unsubscribe(@counting)
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    @originals.each { |name, m| W.define_singleton_method(name, m) }
    ActiveRecord::Base.connection.rollback_transaction
  end

  def walkers(n, zone)
    n.times.map do |i|
      c = Character.provision!(user: @user, name: "Budget#{zone[0, 4].capitalize}#{('a'.ord + i).chr}", job: 'PLD', city: 'caerdun')
      c.update!(zone: zone) unless c.zone == zone
      W.join(c.id)
      W.find_player(c.id).last
    end
  end

  # Ten seconds of every zone ticking, the walkers stepping each tick, with
  # the saves held off (they are counted in zone_tick_perf_test.rb).
  def play(players, ticks: 40)
    players.each { |ps| ps.last_save_at = @t }
    zones = Vanai::Data.zones.keys.filter_map { |key| W.zone(key) }
    @sql.clear
    ticks.times do |i|
      @t += W::TICK
      players.each_with_index do |ps, k|
        step = (i % 8 < 4 ? 0.6 : -0.6)
        W.apply_move(ps.char_id, ps.x + step, ps.z + (k.even? ? 0.2 : -0.2), ps.heading, 'run')
      end
      zones.each { |z| z.tick(@t) }
    end
    @sql.dup
  end

  def test_a_city_full_of_walkers_asks_the_database_nothing
    players = walkers(12, 'caerdun')
    assert_empty play(players), 'a query on the world thread in steady play'
    assert @frames.positive?, 'the zone still sent its frames'
  end

  # The deck-heavy dungeon floors, where every step reads the site's levels.
  def test_walking_a_dungeon_floor_asks_the_database_nothing
    players = walkers(4, 'keep')
    players.each { |ps| ps.dead = false }
    sql = play(players)
    # a monster that reaches a level-1 walker and kills them saves the death
    # (Philip, 2026-10-19); anything else is a query in steady play
    assert_empty sql.reject { |q| q =~ /UPDATE "characters" SET .*"dead"/ }, sql.inspect
  end

  def test_an_empty_world_ticking_asks_the_database_nothing
    assert_empty play([]), 'monster AI in empty zones touched the database'
    assert_equal 0, @frames, 'a zone nobody is in sent a frame'
  end
end
