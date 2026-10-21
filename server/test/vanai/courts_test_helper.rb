ENV["RAILS_ENV"] = "test"
# The courts are dormant unless a test wakes them (Courts.dormant_override), and
# nothing in the suite may ever reach the Anthropic API.
ENV.delete("ANTHROPIC_API_KEY")
ENV.delete("VANAI_COURTS_STUB")
require_relative "../../config/environment"
require "minitest/autorun"

# Shared setup for the courts' database tests (the pattern of
# test/integration/ferry_test.rb): one rolled-back transaction per test, the
# world's in-memory state reset, `to_char` captured, a fake wall clock, a stub
# council client and a captured job runner. Tests never construct an
# Anthropic::Client: `Courts.client` is always a StubClient here.
module CourtsTestHelper
  W = Vanai::World
  C = Vanai::Courts
  T0 = Time.utc(2026, 10, 12, 12, 0, 0)

  def setup
    raise "Test database only" unless Rails.env.test?
    raise "No running world allowed" if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false) if transactional?
    %i[zones parties online party_grace sessions].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@trades, {})
    @messages = []
    @original_send = W.method(:to_char)
    test = self
    W.define_singleton_method(:to_char) { |id, payload| test.instance_variable_get(:@messages) << [id, payload] }
    C.reset!
    @time = T0
    C.clock = -> { test.instance_variable_get(:@time) }
    @enqueued = []
    C.job_runner = ->(n) { test.instance_variable_get(:@enqueued) << n }
    C.client = @stub = C::StubClient.new { |_court, _prompt| [] }
    C.dormant_override = false
    C.ensure_courts!
    @user = User.create!(email: "courts-#{SecureRandom.hex(4)}@example.invalid", password: "isolated-test-password") if transactional?
  end

  def teardown
    W.define_singleton_method(:to_char, @original_send)
    C.reset!
    ActiveRecord::Base.connection.rollback_transaction if transactional?
  end

  def transactional? = true

  def advance(seconds)
    @time += seconds
  end

  def stub_council(&block)
    C.client = @stub = C::StubClient.new(&block)
  end

  # A fresh character, as the API creates one, born at the courts' clock: news
  # older than a character is never unread for them (News.unread_count), so a
  # wall-clock created_at would hide every item stamped before today's date.
  def provision(name, city: "caerdun")
    Character.provision!(user: @user, name: name, job: "PLD", city: city).tap do |c|
      c.update_columns(created_at: @time, updated_at: @time)
    end
  end

  def messages(type, char = nil)
    @messages.select { |id, p| p[:t] == type && (char.nil? || id == char.id) }.map(&:last)
  end

  def treasury(court) = Court.uncached { Court.find_by!(key: court).treasury }
  def tax_bp(court) = Court.uncached { Court.find_by!(key: court).tax_bp }

  def set_court(court, treasury: nil, tax_bp: nil)
    attrs = { treasury: treasury, tax_bp: tax_bp }.compact
    Court.where(key: court).update_all(attrs)
  end

  # Opens cycle 1 and runs one boundary, so cycle 2 is open with a pending turn.
  def open_second_cycle
    C.check!
    advance(C.config.interval + 1)
    C.check!
    CouncilCycle.find_by!(number: 2)
  end
end
