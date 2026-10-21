require_relative "courts_test_helper"
require "action_dispatch/testing/integration"

# A hall's board: a court's proclamations and board notices, newest first, about
# twenty a page, keyset by (created_at, id) across both tables, and only that
# court's (COURTS.md "The audience hall").
class CourtsBoardTest < Minitest::Test
  include CourtsTestHelper
  B = Vanai::Courts::Board

  def seed(court, n, start: T0, same_time: false)
    n.times.map do |i|
      at = same_time ? start : start + i
      if i.even?
        Proclamation.create!(court: court, cycle: 1, text: "P#{i}", created_at: at)
      else
        CourtNews.create!(court: court, cycle: 1, audience: "board", kind: "budget_spent", text: "N#{i}", created_at: at)
      end
    end
  end

  def walk(court, limit: nil)
    seen = []
    before = nil
    pages = 0
    loop do
      page = limit ? B.page(court, before: before, limit: limit) : B.page(court, before: before)
      seen.concat(page[:items])
      pages += 1
      before = page[:next] or break
      raise "runaway" if pages > 20
    end
    [seen, pages]
  end

  def test_pages_of_twenty_newest_first
    seed("caerdun", 45)
    first = B.page("caerdun")
    assert_equal 20, first[:items].size
    assert_equal %w[P44 N43 P42], first[:items].first(3).map { |i| i[:text] }
    seen, pages = walk("caerdun")
    assert_equal 3, pages
    assert_equal 45.times.map { |i| i.even? ? "P#{i}" : "N#{i}" }.reverse, seen.map { |i| i[:text] }
    assert_equal %w[proclamation news], seen.first(2).map { |i| i[:type] }
  end

  def test_keyset_holds_with_identical_timestamps
    seed("moonmere", 13, same_time: true)
    seen, = walk("moonmere", limit: 4)
    assert_equal 13, seen.size
    assert_equal 13, seen.map { |i| [i[:type], i[:id]] }.uniq.size, "nothing repeated or skipped at a page edge"
  end

  def test_only_that_courts_items
    seed("caerdun", 3)
    seed("heartwood", 2)
    CourtNews.create!(court: "heartwood", cycle: 1, audience: "court", kind: "defection", text: "not for the board", created_at: T0)
    assert_equal 2, B.page("heartwood")[:items].size
    assert_equal %w[caerdun], B.page("caerdun")[:items].map { |i| i[:court] }.uniq
    assert_equal({ items: [], next: nil }, B.page("moonmere"))
    assert_equal 3, B.page("caerdun", before: "garbage")[:items].size, "a bad cursor starts from the top"
  end

  def test_the_rest_endpoints
    seed("caerdun", 25)
    api = ActionDispatch::Integration::Session.new(Rails.application)
    api.host! "localhost"
    api.post "/api/register", params: { email: "board-#{SecureRandom.hex(3)}@example.invalid", password: "isolated-test-password" }, as: :json
    api.post "/api/characters", params: { name: "Boardreader", race: "aedri", job: "WHM", city: "heartwood" }, as: :json
    id = JSON.parse(api.response.body).dig("character", "id")
    api.post "/api/characters/#{id}/select", as: :json

    api.get "/api/courts/board", params: { court: "caerdun" }
    body = JSON.parse(api.response.body)
    assert_equal [20, "The Court of Caerdun"], [body["items"].size, body["court_name"]]
    api.get "/api/courts/board", params: { court: "caerdun", before: body["next"] }
    assert_equal 5, JSON.parse(api.response.body)["items"].size
    api.get "/api/courts/board", params: { court: "regent" }
    assert_equal 404, api.response.status

    C.publish!(kind: "resumed", text: "World news.")
    api.get "/api/courts/news"
    assert_equal ["World news."], JSON.parse(api.response.body)["items"].map { |i| i["text"] }

    api.get "/api/courts"
    me = JSON.parse(api.response.body)
    assert_equal ["heartwood", "The Grove Court of Heartwood", false], [me["court"], me["court_name"], me["switch_used"]]
    assert_equal Vanai::Courts::KEYS, me["courts"].map { |c| c["key"] }
    assert me["courts"].all? { |c| (c["treasury"] % 100).zero? }
    assert_equal [["heartwood", "creation"]], me["loyalty"]["sworn"].map { |r| [r["court"], r["via"]] }

    api.get "/api/game/state"
    assert_equal "heartwood", JSON.parse(api.response.body).dig("character", "court")
  end
end
