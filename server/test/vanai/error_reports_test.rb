ENV["RAILS_ENV"] = "test"
require_relative "../../config/environment"
require "minitest/autorun"

# The world's rescued errors reach Good Sorcery (Vanai::ErrorReports) without
# the world thread building an event: it counts and queues, a thread of the
# reporter's own builds. Off (no key, or development and test), nothing is
# queued and no thread starts. No database.
class ErrorReportsTest < Minitest::Test
  R = Vanai::ErrorReports

  def setup
    R.reset!
    @now = 1_000.0
    test = self
    @original_now = Vanai.method(:now)
    Vanai.define_singleton_method(:now) { test.instance_variable_get(:@now) }
  end

  def teardown
    Vanai.define_singleton_method(:now, @original_now)
    GoodSorcery.configure { |c| c.delivery = :async }
    GoodSorcery.clear_test_events
    R.reset!
  end

  def boom(message = "boom")
    raise message
  rescue => e
    e
  end

  def sending!
    GoodSorcery.configure { |c| c.delivery = :test }
    GoodSorcery.clear_test_events
    R.reset!
  end

  def events
    R.drain
    GoodSorcery.test_events
  end

  def test_off_it_queues_nothing_and_starts_no_thread
    refute R.on?, "the test environment never reports"
    before = R.instance_variable_get(:@thread) # another test's, if one ran first
    R.report(boom, "zone caerdun")
    assert R.instance_variable_get(:@queue).empty?
    assert_empty R.instance_variable_get(:@last)
    assert R.instance_variable_get(:@thread).equal?(before), "no thread of its own started"
  end

  def test_the_event_is_built_off_the_reporting_thread
    sending!
    threads = []
    original = GoodSorcery.method(:notify)
    GoodSorcery.define_singleton_method(:notify) { |*args, **kw| threads << Thread.current; original.call(*args, **kw) }
    R.report(boom, "zone caerdun")
    assert_equal 1, events.size
    refute_includes threads, Thread.current
  ensure
    GoodSorcery.define_singleton_method(:notify, original) if original
  end

  def test_one_report_a_site_a_minute_and_the_next_one_counts_the_rest
    sending!
    e = boom
    5.times { R.report(e.dup.tap { |x| x.set_backtrace(e.backtrace) }, "zone caerdun") }
    assert_equal 1, events.size
    world = events.first.dig("context", "world")
    assert_equal "zone caerdun", world["where"]
    assert_equal 0, world["suppressed"]
    assert_equal "zone", events.first.dig("tags", "world")

    @now += R::EVERY
    R.report(e.dup.tap { |x| x.set_backtrace(e.backtrace) }, "zone caerdun")
    assert_equal 2, events.size
    assert_equal 4, events.last.dig("context", "world", "suppressed")
  end

  def test_other_sites_and_lines_are_reported_apart
    sending!
    R.report(boom, "zone caerdun")
    R.report(boom, "zone moonmere")
    R.report(boom, "persist_jobs", characters: 3)
    assert_equal 3, events.size
    assert_equal 3, events.last.dig("context", "world", "characters")
  end

  def test_world_guarded_reports_what_it_rescues
    sending!
    Vanai::World.send(:guarded, "zone caerdun") { raise ArgumentError, "bad tick" }
    assert_equal 1, events.size
    assert_equal "World zone caerdun", events.first["transaction"]
  end
end
