class ZoneChannel < ApplicationCable::Channel
  # Every action is paced per character before it reaches the world's
  # queue: [refill per second, most held at once]. The client moves at 10 Hz
  # (world.ts, plus one each side of a scene) and a stalled line delivers its
  # moves at once, so moves get twice that and six seconds of burst; talking
  # and looking people up are human-paced; everything else (hotbar presses,
  # the 1.5 s discovery scan's few landmarks, trade window clicks) fits well
  # inside its share. A client over budget loses only the excess.
  BUCKETS = {
    move: [20.0, 60.0],
    talk: [2.0, 10.0],
    act: [15.0, 40.0],
  }.freeze
  BUCKET_OF = {
    "move" => :move,
    "chat" => :talk, "who_list" => :talk, "examine" => :talk,
    "party_invite" => :talk, "trade_invite" => :talk,
  }.freeze
  # one log line per throttled subscription at most this often
  THROTTLE_LOG_EVERY = 10.0
  # the longest string any action takes (chat is cut to 240 by the world)
  ID_MAX = 64
  TEXT_MAX = 480
  # one zone subscription a connection (claim_connection)
  CLAIM = Mutex.new
  # the buckets, per character (allow?)
  BUCKET_LOCK = Mutex.new
  BUCKETS_BY_CHAR = {}
  # live zone subscriptions per character; when the last one goes, its
  # buckets rest here as they were, so subscribing again hands back no fresh
  # budget, and leave for good once they could only have refilled
  SUBSCRIBED = {}
  RESTING = {}
  BUCKET_REST = 60.0

  def subscribed
    @char_id = current_character_id
    char = Character.find_by(id: @char_id)
    return reject unless char && claim_connection
    hold_buckets
    Rails.logger.info("[vanai] SUBSCRIBE char=#{char.id} zone=#{char.zone} x=#{char.x.round(1)} z=#{char.z.round(1)}")
    cid = @char_id
    @session_id = SecureRandom.uuid
    sid = @session_id
    zone = char.zone
    unless Vanai::Ferry.sea?(zone)
      # Only while this subscription is the character's own in that zone: the
      # world moves them on (a portal, a crystal, a release) with a
      # zone_change, and one left open must not keep watching the zone left.
      # Raw (ApplicationCable::Channel#stream_raw): every subscriber in a zone
      # gets the same pos four times a second, and decoding and re-encoding it
      # for each one took a whole core at 500 players in one zone.
      stream_raw("zone:#{zone}") { Vanai::World.current_session?(cid, sid, zone) }
    end
    stream_raw "char:#{char.id}"
    # paced and folded per character by the world (World.request_join): a
    # subscribe is not an action, and an unsubscribe/subscribe loop was a
    # full join a cycle
    Vanai::World.request_join(cid, sid)
  end

  def unsubscribed
    release_connection
    rest_buckets
    cid = @char_id
    sid = @session_id
    return unless cid && sid
    Vanai::World.cancel_join(cid, sid)
    Vanai::World.enqueue { Vanai::World.leave(cid, session_id: sid) }
  end

  # Every action passes its bucket first (BUCKETS); the action's own method
  # then hands the world only values of the type it expects.
  def perform_action(data)
    return unless data.is_a?(Hash) && allow?(BUCKET_OF.fetch(data["action"].to_s, :act))
    super
  end

  # Connection#receive's way in for a move, on the thread that read the
  # frame: the bucket and the action as perform_action would run them, once
  # the subscription is confirmed. False sends it the usual way.
  def fast_move(data)
    return false unless data.is_a?(Hash) && data["action"] == "move" && @char_id && !subscription_rejected?
    move(data) if allow?(:move)
    true
  end

  def move(data)
    cid = @char_id
    x = num(data["x"])
    z = num(data["z"])
    return unless x && z
    h = num(data["h"]) || 0.0
    anim = text(data["anim"], 12)
    Vanai::World.enqueue { Vanai::World.apply_move(cid, x, z, h, anim) }
  end

  def ferry_board(data)
    cid = @char_id
    departure = num(data["departure"])
    Vanai::World.enqueue { Vanai::World.ferry_register(cid, departure) }
  end

  def ferry_cancel(_data)
    cid = @char_id
    Vanai::World.enqueue { Vanai::World.ferry_cancel(cid) }
  end

  def jump(_data)
    cid = @char_id
    Vanai::World.enqueue { Vanai::World.apply_jump(cid) }
  end

  def chat(data)
    cid = @char_id
    channel = text(data["channel"], 16)
    msg = text(data["msg"], TEXT_MAX)
    Vanai::World.enqueue { Vanai::World.chat(cid, channel, msg) }
  end

  def who_list(data)
    cid = @char_id
    q = text(data["q"], ID_MAX)
    page = int(data["page"]) || 1
    Vanai::World.enqueue { Vanai::World.who_list(cid, q, page) }
  end

  def examine(data)
    cid = @char_id
    name = text(data["name"], ID_MAX)
    Vanai::World.enqueue { Vanai::World.examine(cid, name) }
  end

  def attack(data)
    cid = @char_id
    id = key(data["id"])
    Vanai::World.enqueue { Vanai::World.attack(cid, id) }
  end

  def stop_attack(_data)
    cid = @char_id
    Vanai::World.enqueue { Vanai::World.stop_attack(cid) }
  end

  def ability(data)
    cid = @char_id
    id = key(data["id"])
    target = key(data["target"])
    Vanai::World.enqueue { Vanai::World.ability(cid, id, target) }
  end

  def milestone_travel(data)
    cid = @char_id
    id = key(data["id"])
    Vanai::World.enqueue { Vanai::World.milestone_travel(cid, id) }
  end

  def gate_enter(data)
    cid = @char_id
    npc = key(data["npc"])
    Vanai::World.enqueue { Vanai::World.gate_enter(cid, npc) }
  end

  def gate_respond(data)
    cid = @char_id
    accept = !!data["accept"]
    Vanai::World.enqueue { Vanai::World.gate_respond(cid, accept) }
  end

  def set_home(data)
    cid = @char_id
    id = key(data["id"])
    Vanai::World.enqueue { Vanai::World.set_home(cid, id) }
  end

  def teleport_home(_data)
    cid = @char_id
    Vanai::World.enqueue { Vanai::World.teleport_home(cid) }
  end

  def raise_respond(data)
    cid = @char_id
    accept = !!data["accept"]
    Vanai::World.enqueue { Vanai::World.raise_respond(cid, accept) }
  end

  def use_item(data)
    cid = @char_id
    inv_id = int(data["inv_id"])
    return unless inv_id
    Vanai::World.enqueue { Vanai::World.use_item(cid, inv_id) }
  end

  def rest(data)
    cid = @char_id
    on = !!data["on"]
    Vanai::World.enqueue { Vanai::World.rest(cid, on) }
  end

  def court_swear(data)
    cid = @char_id
    court = text(data["court"], ID_MAX)
    Vanai::World.enqueue { Vanai::Courts::Allegiance.swear_at_hall(cid, court) }
  end

  def court_bounty_accept(data)
    cid = @char_id
    id = int(data["id"])
    Vanai::World.enqueue { Vanai::Courts::Bounties.accept!(cid, id) }
  end

  def court_bounty_deliver(data)
    cid = @char_id
    id = int(data["id"])
    Vanai::World.enqueue { Vanai::Courts::Bounties.deliver!(cid, id) }
  end

  def court_register(data)
    cid = @char_id
    input = { "inv_id" => int(data["inv_id"]), "qty" => int(data["qty"]), "named_relic_id" => int(data["named_relic_id"]) }
    Vanai::World.enqueue { Vanai::Courts::Relics.register!(cid, input) }
  end

  def court_seen(data)
    cid = @char_id
    news_id = int(data["news_id"])
    digest_cycle = int(data["digest_cycle"])
    Vanai::World.enqueue { Vanai::Courts::News.seen!(cid, news_id: news_id, digest_cycle: digest_cycle) }
    Vanai::World.enqueue { Vanai::Courts::Letters.seen!(cid) } if data["letters"]
  end

  def court_letter_accept(data)
    cid = @char_id
    id = int(data["id"])
    Vanai::World.enqueue { Vanai::Courts::Letters.accept!(cid, id) }
  end

  def court_letter_decline(data)
    cid = @char_id
    id = int(data["id"])
    Vanai::World.enqueue { Vanai::Courts::Letters.decline!(cid, id) }
  end

  def talk(data)
    cid = @char_id
    npc = key(data["npc"])
    Vanai::World.enqueue { Vanai::World.talk(cid, npc) }
  end

  def quest_accept(data)
    cid = @char_id
    id = key(data["id"])
    Vanai::World.enqueue { Vanai::World.quest_accept(cid, id) }
  end

  def quest_complete(data)
    cid = @char_id
    id = key(data["id"])
    Vanai::World.enqueue { Vanai::World.quest_complete(cid, id) }
  end

  def interact(data)
    cid = @char_id
    id = key(data["id"])
    Vanai::World.enqueue { Vanai::World.interact(cid, id) }
  end

  def discover(data)
    cid = @char_id
    id = key(data["id"])
    Vanai::World.enqueue { Vanai::World.discover(cid, id) }
  end

  def cutscene_begin(data)
    cid = @char_id
    id = text(data["id"], ID_MAX)
    Vanai::World.enqueue { Vanai::World.cutscene_begin(cid, id) }
  end

  def cutscene_end(data)
    cid = @char_id
    id = text(data["id"], ID_MAX)
    Vanai::World.enqueue { Vanai::World.cutscene_end(cid, id) }
  end

  def release(_data)
    cid = @char_id
    Vanai::World.enqueue { Vanai::World.release(cid) }
  end

  def change_job(data)
    cid = @char_id
    job = key(data["job"])
    Vanai::World.enqueue { Vanai::World.change_job(cid, job) }
  end

  def party_invite(data)
    cid = @char_id
    name = text(data["name"], ID_MAX)
    Vanai::World.enqueue { Vanai::World.party_invite(cid, name) }
  end

  def party_respond(data)
    cid = @char_id
    accept = !!data["accept"]
    Vanai::World.enqueue { Vanai::World.party_respond(cid, accept) }
  end

  def party_leave(_data)
    cid = @char_id
    Vanai::World.enqueue { Vanai::World.party_leave(cid) }
  end

  def trade_invite(data)
    cid = @char_id
    name = text(data["name"], ID_MAX)
    Vanai::World.enqueue { Vanai::World.trade_invite(cid, name) }
  end

  def trade_respond(data)
    cid = @char_id
    accept = !!data["accept"]
    Vanai::World.enqueue { Vanai::World.trade_respond(cid, accept) }
  end

  def trade_offer(data)
    cid = @char_id
    gold = int(data["gold"]) || 0
    items = Array(data["items"]).grep(Hash).first(6).map { |it| { "inv_id" => int(it["inv_id"]), "qty" => int(it["qty"]) } }
    Vanai::World.enqueue { Vanai::World.trade_offer(cid, gold, items) }
  end

  def trade_confirm(data)
    cid = @char_id
    rev = int(data["rev"])
    Vanai::World.enqueue { Vanai::World.trade_confirm(cid, rev) }
  end

  def trade_cancel(_data)
    cid = @char_id
    Vanai::World.enqueue { Vanai::World.trade_cancel(cid) }
  end

  private

  # The world runs every action on its one thread, so nothing that could
  # raise there leaves here: JSON hands over any type at all (a Hash for a
  # number, 1e400 for Infinity), and each value is cut to the one expected.

  # A finite number, or nil.
  def num(v)
    f = (v.is_a?(Numeric) || v.is_a?(String)) ? Float(v, exception: false) : nil
    f if f&.finite?
  end

  # A whole number a database id can hold, or nil.
  def int(v)
    n = case v
        when Integer then v
        when Float then v.to_i if v.finite? && v == v.floor
        when String then Integer(v, exception: false)
        end
    n if n && n.abs < 2**53
  end

  # Text, never nil, cut to `max`.
  def text(v, max) = v.to_s[0, max]

  # An id (an NPC, a quest, a monster, an ability): nil stays nil, which
  # some actions read as "none" (ability's target: yourself).
  def key(v) = v.nil? ? nil : text(v, ID_MAX)

  # Token bucket per character, not per subscription: one character can hold
  # several sockets (tabs, or a script opening more), and each must not bring
  # its own budget. Actions arrive on the cable's worker threads, several at
  # once, hence the lock.
  def allow?(kind)
    rate, burst = BUCKETS.fetch(kind)
    now = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    BUCKET_LOCK.synchronize do
      buckets = (BUCKETS_BY_CHAR[@char_id] ||= {})
      tokens, at = buckets[kind] || [burst, now]
      tokens = [tokens + (now - at) * rate, burst].min
      if tokens >= 1
        buckets[kind] = [tokens - 1, now]
        return true
      end
      buckets[kind] = [tokens, now]
      @throttled = (@throttled || 0) + 1
      if !@throttle_logged_at || now - @throttle_logged_at >= THROTTLE_LOG_EVERY
        Rails.logger.warn("[vanai] throttled char=#{@char_id} #{kind} (#{@throttled} dropped since the last report)")
        @throttle_logged_at = now
        @throttled = 0
      end
      false
    end
  end

  def hold_buckets
    BUCKET_LOCK.synchronize do
      SUBSCRIBED[@char_id] = SUBSCRIBED.fetch(@char_id, 0) + 1
      rested = RESTING.delete(@char_id)
      BUCKETS_BY_CHAR[@char_id] ||= rested.first if rested
    end
    @holding = true
  end

  def rest_buckets
    return unless @holding
    @holding = false
    now = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    BUCKET_LOCK.synchronize do
      left = SUBSCRIBED.fetch(@char_id, 1) - 1
      if left.positive?
        SUBSCRIBED[@char_id] = left
      else
        SUBSCRIBED.delete(@char_id)
        buckets = BUCKETS_BY_CHAR.delete(@char_id)
        RESTING[@char_id] = [buckets, now] if buckets
      end
      RESTING.delete_if { |_, (_, at)| now - at > BUCKET_REST }
    end
  end

  # One zone subscription a connection. Each one joins the world as the
  # character, and a join rebuilt their state, so extra identifiers on one
  # socket ({"channel":"ZoneChannel","n":2}) were a way to reset it at will.
  # The real client has one identifier and resubscribes under it on every
  # zone change; ActionCable never holds two of one identifier, so a claim
  # by the same identifier (its unsubscribe and resubscribe can be handled
  # out of order on the worker pool) replaces the old one.
  def claim_connection
    CLAIM.synchronize do
      held = connection.instance_variable_get(:@vanai_zone_subscription)
      return false if held && held.identifier != identifier
      connection.instance_variable_set(:@vanai_zone_subscription, self)
      true
    end
  end

  def release_connection
    CLAIM.synchronize do
      if connection.instance_variable_get(:@vanai_zone_subscription).equal?(self)
        connection.instance_variable_set(:@vanai_zone_subscription, nil)
      end
    end
  end
end
