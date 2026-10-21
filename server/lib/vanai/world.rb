require_relative "error_reports"
require_relative "site_levels"
require_relative "ferry_world"
require_relative "cutscenes"
require_relative "move_check"
require_relative "position_writer"
require_relative "join_loader"

module Vanai
  module World
    TICK = 0.25
    # Seconds a disconnected member keeps their party seat before being reaped.
    PARTY_GRACE = 120.0
    # each gathering node kind yields one fixed item (mirrored in quest_index.ts)
    NODE_ITEM = { "herb" => "lamproot", "ore" => "glimmer_ore", "reed" => "mere_reed",
                  "windfall" => "windfall_apple", "spines" => "book_spine" }.freeze
    # What a move farther than the player could have run is (move_check.rb):
    # :clamp takes it as far as the budget allows and walks the player the rest
    # of the way at the speed limit (settle_moves), which costs a laggy player
    # nothing but a moment; :reject drops it and leaves them where they were.
    MOVE_POLICY = :clamp
    # one log line per offender at most this often, with the count in between
    MOVE_LOG_EVERY = 10.0
    # the world thread's slice, as a power of two of the process's (boot!)
    WORLD_PRIORITY = 3

    class << self
      attr_reader :parties

      def boot!
        @zones = {}
        @queue = Queue.new
        @parties = {}
        @online = {} # char_id => zone_key
        # made here, not on first use: request threads read it (presence_for)
        @online_by_name = {}
        # char_id => monotonic deadline. A disconnected member keeps their party
        # seat until this passes, so a refresh or a dropped line does not disband.
        @party_grace = {}
        @next_party_id = 0
        initialize_ferry
        # the periodic saves go to their own thread from here (PositionWriter);
        # whatever is queued at exit is written before the process goes
        @positions = PositionWriter.new(inline: false)
        at_exit { @positions.flush }
        # and a join's reads to two of their own (JoinLoader)
        @loader = JoinLoader.new
        @started = true
        @thread = Thread.new { run_loop }
        @thread.abort_on_exception = false
        # Ruby runs one thread at a time and hands over every time slice. A
        # thread that wants it back waits in line, so the world, waking for
        # its tick behind request and cable threads that were all busy, woke
        # up to a whole tick late at the default 100 ms slice. Production
        # shortens the slice for every thread (RUBY_THREAD_TIMESLICE, config/
        # deploy.yml) and this gives the world's own eight of them, so its
        # tick is not cut up by the shorter slice (docs/SERVER-PERF.md rule 10).
        @thread.priority = WORLD_PRIORITY
        @thread.name = "vanai-world"
        Rails.logger.info("[vanai] world loop started")
      end

      def zone(key)
        @zones[key] ||= ZoneState.new(key)
      end

      def enqueue(&block)
        @queue << block
      end

      def db(&block)
        ActiveRecord::Base.connection_pool.with_connection(&block)
      end

      # Inline until boot! starts the world's thread: tests and the harness
      # tick zones themselves and read the rows back at once.
      def positions = (@positions ||= PositionWriter.new(inline: true))

      # Every synchronous write of a character's zone, x, z, heading or dead_at
      # goes through here: the periodic saves still queued are written first,
      # so none can land after it and put them back (PositionWriter).
      def pos_db(&block)
        positions.flush
        db(&block)
      end

      def broadcast_zone(zone_key, payload)
        if Ferry.sea?(zone_key)
          # Only current passengers receive ship traffic. Stale subscriptions
          # cannot observe a later sailing or the opposite direction.
          @zones[zone_key]&.players&.each_value { |p| to_char(p.char_id, payload) }
        else
          ActionCable.server.broadcast("zone:#{zone_key}", payload)
        end
      end

      def to_char(char_id, payload)
        ActionCable.server.broadcast("char:#{char_id}", payload)
      end

      def run_loop
        loop do
          t0 = Vanai.now
          run_tick
          elapsed = Vanai.now - t0
          sleep([TICK - elapsed, 0.02].max)
        end
      end

      # One tick. Every unit has its own rescue: one client's action that
      # raises, or one zone that does, costs only itself, never the rest of the
      # tick for everyone. Only what was queued before the tick began is run:
      # a flood arriving while it drains waits for the next tick instead of
      # holding every zone's tick back.
      def run_tick
        # the joins' share of this tick opens here (JOIN_BUDGET), and what
        # every one of them is told last waits for them all (finish_joins)
        @join_spent = 0.0
        @join_epilogue = []
        @queue.size.times do
          action = @queue.pop(true) rescue nil
          guarded("action", 4) { action&.call }
        end
        guarded("joins") { tick_join_requests }
        @join_spent = nil
        joined, @join_epilogue = @join_epilogue, nil
        guarded("joined") { finish_joins(joined) }
        guarded("moves") { settle_moves }
        guarded("ferry") { tick_ferry }
        @zones.each_value { |z| guarded("zone #{z.key}") { z.tick(Vanai.now) } }
        # every zone's saves due this tick, one batch for the writer's thread
        guarded("positions") { positions.commit }
        guarded("parties") { tick_parties(Vanai.now) }
        guarded("gate prompts") { tick_gate_prompts(Vanai.now) }
        guarded("courts") { Courts.tick(Vanai.now) }
        guarded("mail") { Mail.tick(Vanai.now) }
      end

      def guarded(what, lines = 8)
        yield
      rescue => e
        Rails.logger.error("[vanai] #{what} error: #{e.class}: #{e.message}\n#{Array(e.backtrace).first(lines).join("\n")}")
        ErrorReports.report(e, what)
      end

      # ---- session lifecycle ----

      # Joins are paced per character, where every other thing a client asks
      # is paced in ZoneChannel's buckets: a subscribe is not an action, and
      # unsubscribing and subscribing again in a loop queued one full join
      # (and its zone broadcasts) a cycle. A subscription asks here, from its
      # cable thread; the character's requests fold into one, which runs with
      # the latest session while the bucket allows and waits a tick while it
      # does not. A zone change is one join; a burst of crossings fits.
      JOIN_RATE = 0.5
      JOIN_BURST = 4.0
      JOIN_LOCK = Mutex.new

      def join_requests = (@join_requests ||= {})

      def request_join(char_id, session_id)
        JOIN_LOCK.synchronize do
          waiting = join_requests.key?(char_id)
          join_requests[char_id] = session_id
          enqueue { run_join_request(char_id) } unless waiting
        end
      end

      # A subscription gone before its join ran never joins, nor one whose
      # rows the loader is still reading.
      def cancel_join(char_id, session_id)
        JOIN_LOCK.synchronize do
          join_requests.delete(char_id) if join_requests.key?(char_id) && join_requests[char_id] == session_id
          if (ticket = join_loads[char_id]) && ticket[:sid] == session_id
            ticket[:cancelled] = true
            join_loads.delete(char_id)
          end
        end
      end

      # Seconds of joining one tick may spend. A join is 8-17 ms of database
      # work on this thread, and every client reconnecting at once (a deploy, a
      # dropped line) used to queue them all into one tick that froze every
      # zone for seconds. Past the budget a request stays standing, its token
      # unspent, and joins on a later tick in the order it came; the world goes
      # on ticking for everyone already in. At least one join runs a tick.
      JOIN_BUDGET = 0.04

      def run_join_request(char_id, backlog: false)
        return unless JOIN_LOCK.synchronize { join_requests.key?(char_id) }
        # Only inside run_tick (@join_spent is nil elsewhere). The check comes
        # before join_allowed?, which spends a token a deferred join must keep.
        # While older requests wait on the budget, a new one queued as an
        # action waits behind them for tick_join_requests, which goes in order.
        if @join_spent
          return if @join_spent >= JOIN_BUDGET
          return if @join_backlog && !backlog
        end
        # one load a character at a time, and only so many at once; past that
        # the request stays standing, its token unspent. A rejoin while online
        # takes no load (below) and never waits for one.
        return if @loader && !@online[char_id] &&
                  JOIN_LOCK.synchronize { join_loads.key?(char_id) || join_loads.size >= LOADS_IN_FLIGHT }
        return unless join_allowed?(char_id) # left standing: tick_join_requests tries again
        sid = JOIN_LOCK.synchronize do
          next :gone unless join_requests.key?(char_id)
          join_requests.delete(char_id)
        end
        return if sid == :gone
        # Online already (a refresh, a dropped line), their leave writes the
        # rows a load would read: this join reads them itself, after it.
        return load_join(char_id, sid) if @loader && !@online[char_id]
        timed_join(char_id, sid)
      end

      def timed_join(char_id, sid, loaded: nil)
        # the wall clock the tick spends, never the game's (tests move Vanai.now)
        t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        begin
          loaded ? join(char_id, session_id: sid, loaded: loaded) : join(char_id, session_id: sid)
        ensure
          @join_spent += Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0 if @join_spent
        end
      end

      # The joins whose rows the loader is reading, by character: the
      # session, and the presence and touch counts at the start, which say at
      # install whether what it read still stands (join_load_current?).
      LOADS_IN_FLIGHT = 32

      def join_loads = (@join_loads ||= {})

      def load_join(char_id, sid)
        ticket = { char_id: char_id, sid: sid, gen: presence_gen(char_id), touch: touch_gen(char_id) }
        JOIN_LOCK.synchronize { join_loads[char_id] = ticket }
        @loader.load(char_id, ticket)
      end

      # Finished loads join in the order they finished while the budget
      # lasts; the rest go first next tick. One whose reads no longer stand
      # joins the old way, reading on this thread.
      def install_loaded_joins
        (@join_ready ||= []).concat(@loader.finished)
        while (ticket = @join_ready.first)
          break if @join_spent && @join_spent >= JOIN_BUDGET
          @join_ready.shift
          cid = ticket[:char_id]
          live = JOIN_LOCK.synchronize do
            next false if ticket[:cancelled]
            join_loads.delete(cid) if join_loads[cid].equal?(ticket)
            true
          end
          next unless live
          timed_join(cid, ticket[:sid], loaded: (ticket[:loaded] if join_load_current?(ticket)))
        end
      end

      # What a load read is still the character's when no join or leave has
      # happened since it began (the world writes a character's rows only while
      # they are online, and saves them as they leave) and nothing else changed
      # them (request_recompute follows every REST write to the character
      # asking, World.touch every other write: a seller's proceeds, a purse).
      def join_load_current?(ticket)
        cid = ticket[:char_id]
        ticket[:loaded] && !@online[cid] &&
          presence_gen(cid) == ticket[:gen] && touch_gen(cid) == ticket[:touch]
      end

      def presence_gen(char_id) = (@presence_gen ||= Hash.new(0))[char_id]
      def bump_presence(char_id) = (@presence_gen ||= Hash.new(0))[char_id] += 1

      def tick_join_requests
        install_loaded_joins if @loader
        JOIN_LOCK.synchronize { join_requests.keys }.each { |cid| run_join_request(cid, backlog: true) }
        # what the budget left standing goes first next tick
        @join_backlog = !@join_spent.nil? && @join_spent >= JOIN_BUDGET && JOIN_LOCK.synchronize { join_requests.any? }
        # a bucket that has refilled is the same as none
        now = Vanai.now
        join_tokens.delete_if { |_, (tokens, at)| tokens + (now - at) * JOIN_RATE >= JOIN_BURST }
      end

      def join_tokens = (@join_tokens ||= {})

      def join_allowed?(char_id)
        now = Vanai.now
        tokens, at = join_tokens[char_id] || [JOIN_BURST, now]
        tokens = [tokens + (now - at) * JOIN_RATE, JOIN_BURST].min
        if tokens < 1
          join_tokens[char_id] = [tokens, now]
          return false
        end
        join_tokens[char_id] = [tokens - 1, now]
        true
      end

      # A rejoin in the zone just left, this soon, is a refresh or a dropped
      # line: nobody is told they arrived (nor, round a resubscribe loop,
      # told it again and again).
      QUIET_RETURN = 30.0

      # `loaded`: the row and the PlayerState JoinLoader built from it off
      # this thread (install_loaded_joins).
      def join(char_id, session_id: nil, loaded: nil)
        # the old session goes first, so the row read below holds the
        # position it just saved rather than the last periodic one
        leave(char_id) if @online[char_id]
        # The row alone. PlayerState queries the job row and the equipped
        # pieces itself and plucks the journal; a preload of every bag item,
        # quest and discovery built objects nothing read.
        char = loaded ? loaded[:char] : db { Character.find_by(id: char_id) }
        return unless char
        return if ferry_recover_join(char)
        z = zone(char.zone)
        ps = loaded ? loaded[:ps] : PlayerState.new(char)
        kept = restore_vitals(ps)
        # the row remembers a fall past the hold and across a restart (Philip,
        # 2026-10-19): they come back down where they fell, to release or be raised.
        # Only with nothing kept: the kept record is the world's own and never
        # older than the row (a Raise just before a sailing, whose leave
        # writes no row, would otherwise lay them down again on the deck).
        if char.dead_at && !kept
          ps.dead = true
          ps.hp = 0
          ps.anim = "dead"
        end
        z.add_player(ps)
        # placed by the server, from its own record: a full budget from here;
        # a rejoin where they stood keeps the budget they had (restore_vitals)
        kept && kept[:move_check] ? move_checks[char_id] = kept[:move_check] : move_checks.delete(char_id)
        (@sessions ||= {})[char_id] = session_id
        @online[char_id] = char.zone
        bump_presence(char_id)
        note_online(char_id, ps.name, char.company_id)
        to_char(char_id, z.snapshot_payload(ps))
        to_char(char_id, ps.self_payload)
        # where the world has them, which the client walks on from
        send_position(ps)
        # the client raises its death overlay (and the Release button) only on this
        to_char(char_id, t: "death", xp_lost: ps.xp_lost) if ps.dead
        status = ferry_status(char_id)
        to_char(char_id, status) if status
        # full log (completed included) so the client can evaluate prereq chains
        to_char(char_id, t: "quest_log",
                quests: ps.quests.transform_values { |st| { status: st["status"], progress: st["progress"], credited: st["credited"] || [] } })
        active = ps.quests.select { |_, st| st["status"] == QuestProgress::ACTIVE }
        active.each_key { |qk| Quests.notify(ps, qk) }
        quiet = kept && kept[:zone] == char.zone && Vanai.now - kept[:at] <= QUIET_RETURN
        z.broadcast_system("#{ps.name} arrives.") unless z.safe? || quiet || muted?(char_id)
        @party_grace.delete(char_id)
        # always told: a party that disbanded while they crossed sent its word
        # to no subscription, and the old roster would stay up
        restore_party(ps) ? sync_party(ps.party_id) : to_char(char_id, t: "party", members: [])
        # a first arrival in a zone may have its own scene (a province fly-over)
        if record_zone_visit(char_id, char.zone, seen: ps.zone_seen)
          Cutscenes.triggered("zone_first_visit", char.zone).each { |id| cutscene_trigger(ps, id) }
        end
        # a scene still owed (the opening, until it is watched or skipped)
        # plays once the client has the zone built around it
        Cutscenes.due_here(ps).each { |id| to_char(char_id, t: "cutscene", id: id) }
        # the mail badge and the courts' state come last: for all of a tick's
        # joins at once, or now for a join outside one
        @join_epilogue ? @join_epilogue << ps : finish_joins([ps])
      end

      # What an arrival is told last: the mail badge's number (and a sale or a
      # return that landed offline) and the courts' state. For every join of a
      # tick in a few grouped queries rather than ~14 a join; only for those
      # still online as they joined.
      def finish_joins(list)
        list = list.select { |ps| find_player(ps.char_id)&.last.equal?(ps) }
        return if list.empty?
        guarded("join mail") { db { Mail.push_unread_many(list.map(&:char_id)) } }
        guarded("join courts") { db { Courts.on_joins(list) } }
      end

      # zone visits are stored as discoveries ("zone_<key>") and drive map fog
      # True the first time: the visit was new.
      # `seen`: already looked up (PlayerState#zone_seen), true when it was there.
      def record_zone_visit(char_id, zone_key, seen: nil)
        key = "zone_#{zone_key}"
        return false if seen
        return false if seen.nil? && db { Discovery.exists?(character_id: char_id, landmark_key: key) }
        begin
          db { Discovery.create!(character_id: char_id, landmark_key: key) }
          to_char(char_id, t: "discovery_silent", id: key)
          true
        rescue ActiveRecord::RecordNotUnique
          false
        end
      end

      # transferring: true means the character is crossing to another zone and
      # will rejoin in a moment — the party keeps their seat. A crossing and a
      # disconnect alike keep it only until PARTY_GRACE runs out: the arrival
      # clears the deadline, and one who never arrives (a tab closed on the
      # loading screen) is reaped like any disconnect, the lead passed on.
      def leave(char_id, transferring: false, persist: true, session_id: nil)
        # An old channel may unsubscribe after its replacement has joined.
        return if session_id && @sessions&.[](char_id) != session_id
        @sessions&.delete(char_id)
        check = move_checks.delete(char_id)
        ferry_cancel(char_id, nil)
        # every trade they are in, not only the first
        trade_cancel(char_id) while trade_of(char_id)
        forget_invites(char_id) unless transferring
        zone_key = @online.delete(char_id)
        return unless zone_key
        bump_presence(char_id)
        z = zone(zone_key)
        ps = z.remove_player("p#{char_id}")
        forget_online(char_id, ps&.name)
        return unless ps
        # a crossing is placed by the server and starts a fresh budget and
        # floor; a rejoin where they stand keeps both
        keep_vitals(ps, zone_key, transferring ? nil : check, transferring ? nil : ps.site_levels)
        persist_position(ps, zone_key) if persist
        persist_job(ps)
        return unless ps.party_id && (party = @parties[ps.party_id])
        # remember them so the roster can still show the empty seat
        party.snapshots[char_id] = member_payload(party, char_id, ps)
        @party_grace[char_id] = Vanai.now + PARTY_GRACE
        sync_party(party.pid)
      end

      # Invitations to or from a character who has gone: nobody can answer
      # them, and the maps would keep them for the life of the process.
      def forget_invites(char_id)
        @pending_invites&.delete(char_id)
        @pending_invites&.delete_if { |_, (inviter, _)| inviter == char_id }
        @trade_invites&.delete(char_id)
        @trade_invites&.delete_if { |_, inv| Array(inv).first == char_id }
        @company_invites&.delete(char_id)
      end

      # Vitals are the world's, not the client's: a new subscription, a refresh,
      # a dropped line or a crossing gives back the HP, MP, TP, death, effects
      # and timers the character left with, where every rejoin used to build a
      # fresh, full and living one. Held this long after the leave. A release
      # drops them (the home point revives), and what heals on purpose -- a
      # trainer, a job change, a level -- still does.
      VITALS_HOLD = 600.0

      def kept_vitals = (@kept_vitals ||= {})

      # `site_levels`: the floor they stood on, for a rejoin on the same spot
      # (most stacked sites have no ground cells to find it again from).
      def keep_vitals(ps, zone_key, check, site_levels)
        now = Vanai.now
        kept_vitals.delete_if { |_, v| now - v[:at] > VITALS_HOLD }
        check&.pending = nil
        kept_vitals[ps.char_id] = { at: now, zone: zone_key, hp: ps.hp, mp: ps.mp, tp: ps.tp, dead: ps.dead, xp_lost: ps.xp_lost,
                                    buffs: ps.buffs, cooldowns: ps.cooldowns, gcd_at: ps.gcd_at,
                                    pending_raise: ps.pending_raise, move_check: check, site_levels: site_levels }
      end

      # Onto a PlayerState just built from the row; the kept record, or nil.
      def restore_vitals(ps)
        kept = kept_vitals.delete(ps.char_id)
        return nil unless kept && Vanai.now - kept[:at] <= VITALS_HOLD
        # gear changed while away may have lowered the maxima
        ps.hp = kept[:hp].clamp(0, ps.max_hp)
        ps.mp = kept[:mp].clamp(0, ps.max_mp)
        ps.tp = kept[:tp]
        ps.buffs = kept[:buffs]
        ps.cooldowns = kept[:cooldowns]
        ps.gcd_at = kept[:gcd_at]
        ps.xp_lost = kept[:xp_lost]
        ps.pending_raise = kept[:pending_raise]
        ps.site_levels = kept[:site_levels] if kept[:site_levels]
        if kept[:dead]
          ps.dead = true
          ps.hp = 0
          ps.anim = "dead"
        end
        kept
      end

      # Drops a member for good: called when the grace period expires, or when
      # they choose to leave.
      def drop_from_party(party, char_id)
        party.member_ids.delete(char_id)
        party.snapshots.delete(char_id)
        @party_grace.delete(char_id)
        if party.member_ids.size <= 1
          disband_party(party)
        else
          if party.leader_id == char_id
            # hand the lead to someone actually here, not a held-open seat
            party.leader_id = party.member_ids.find { |cid| @online[cid] } || party.member_ids.first
          end
          sync_party(party.pid)
        end
      end

      # Whether a subscription still speaks for its character in `zone_key`
      # (read from cable threads: two hash reads). One the world moved
      # elsewhere, or that a newer subscription replaced, stops hearing the
      # zone it was made in.
      def current_session?(char_id, session_id, zone_key)
        @sessions&.[](char_id) == session_id && @online&.[](char_id) == zone_key
      end

      def find_player(char_id)
        zone_key = @online&.[](char_id)
        return nil unless zone_key
        z = zone(zone_key)
        [z, z.players["p#{char_id}"]]
      end

      # Every /tell, examine and invite names its target, and the walk of
      # everyone online it once was cost O(online) a line, a miss most of all.
      # Names are unique case-insensitively (index_characters_on_lower_name)
      # and never change in play, so the index is written only where @online
      # is (note_online, forget_online). The hit is checked against the body
      # it finds, so an entry left behind (a test swapping @online) is a miss.
      def find_player_by_name(name)
        name = name.to_s.downcase
        return nil if name.empty?
        cid = online_by_name[name]
        found = cid && find_player(cid)
        found if found && found[1] && found[1].name.downcase == name
      end

      # lowercased name => char_id for everyone in @online. Request threads
      # read it one key at a time (presence_for), never iterate it.
      def online_by_name = (@online_by_name ||= {})

      # char_id => company id (nil: none) for everyone in @online, and company
      # id => the Set of its members in @online: a /c line reads both instead
      # of three queries and a pluck of every member, online or not. The world
      # writes characters.company_id itself (company_cmd); the only other
      # writer, deleting an account, takes only that account's characters,
      # whose leave clears them here.
      def online_companies = (@online_companies ||= {})
      def company_online = (@company_online ||= Hash.new { |h, k| h[k] = Set.new })

      # Someone came online (join), with what the row says.
      def note_online(char_id, name, company_id)
        online_by_name[name.downcase] = char_id
        set_online_company(char_id, company_id)
        # a mute is read afresh at every arrival
        mutes.delete(char_id)
        @roster = nil
      end

      # And went (leave): nothing of them is kept for the next one.
      def forget_online(char_id, name)
        down = name&.downcase
        online_by_name.delete(down) if down && online_by_name[down] == char_id
        set_online_company(char_id, nil)
        online_companies.delete(char_id)
        mutes.delete(char_id)
        @roster = nil
      end

      def set_online_company(char_id, company_id)
        old = online_companies[char_id]
        if old && old != company_id
          members = company_online[old]
          members.delete(char_id)
          company_online.delete(old) if members.empty?
        end
        online_companies[char_id] = company_id
        company_online[company_id] << char_id if company_id
      end

      # ---- actions (all called inside the loop thread) ----

      def move_checks = (@move_checks ||= {})

      # When the world reads the clock for movement (tests stand it still).
      def move_now = Vanai.now

      # `settling`: the world walking a clamped player on toward where they
      # asked to be (settle_moves), not a new request from the client.
      def apply_move(char_id, x, z_, heading, anim, settling: false)
        z, ps = find_player(char_id)
        return unless ps && !ps.dead
        # a watcher stands still for everyone else until the scene is over
        return if ps.cutscene
        half = z.size / 2 - 2
        nx = Float(x, exception: false)
        nz = Float(z_, exception: false)
        return unless nx&.finite? && nz&.finite?
        ax = nx.clamp(-half, half)
        az = nz.clamp(-half, half)
        # asked for a spot past the zone's edge, where the world cannot follow
        outside = ax != nx || az != nz
        check = (move_checks[char_id] ||= MoveCheck.new)
        clamp = MOVE_POLICY == :clamp
        # In a dungeon the world walks a clamped player on along the floor, a
        # corner at a time: the straight chord to where a stalled client went
        # round a bend runs through the masonry, and was refused for good.
        gx, gz = ax, az
        if settling && z.navigation
          wx, wz = z.navigation.waypoint(ps.x, ps.z, ax, az)
          # a corner they already stand on is no way on: the chord, then
          gx, gz = wx, wz if wx && Math.hypot(wx - ps.x, wz - ps.z) > 0.01
        end
        nx, nz, cut = check.step(ps.x, ps.z, gx, gz, move_now, clamp: clamp)
        check.pending = (cut || gx != ax || gz != az) && clamp ? [ax, az, heading, anim] : nil
        report_fast_move(ps, check, Math.hypot(ax - ps.x, az - ps.z)) if cut && !settling
        moved = (ps.x - nx).abs > 0.01 || (ps.z - nz).abs > 0.01
        if Ferry.sea?(z.key) && Ferry.blocked_move?(ps.x, ps.z, nx, nz)
          check.refund(Math.hypot(nx - ps.x, nz - ps.z))
          check.pending = nil
          return correct_position(ps, check)
        end
        # a dungeon's walls hold for the server as they do for the client
        if z.navigation && !z.walkable_step?(ps.x, ps.z, nx, nz)
          # a step the masonry refuses spends nothing
          check.refund(Math.hypot(nx - ps.x, nz - ps.z))
          # a cut short client step is walked on along the floor (above); any
          # other refusal leaves the client somewhere the world will not go
          return if cut && clamp && !settling
          check.pending = nil
          return correct_position(ps, check)
        end
        ps.site_levels = SiteLevels.move(z.definition, ps.site_levels, ps.x, ps.z, nx, nz)
        ps.x = nx
        ps.z = nz
        h = Float(heading, exception: false)
        ps.heading = h&.finite? ? h : 0.0
        ps.anim = anim.to_s[0, 12]
        ps.resting = false if moved
        # a step refused outright, or past the edge, is not walked out later
        correct_position(ps, check) if outside || (cut && !clamp)
        ferry_check_registration(char_id)
      end

      # The client walks itself and never hears its own position back, so a
      # move the world refuses, or clamps for good, would leave the two apart
      # with nothing to bring them together: the world tells it where it
      # stands, and it snaps there and walks on. Once a batch, not a frame:
      # at most this often while the client keeps asking for the same wall.
      CORRECT_EVERY = 1.0

      def correct_position(ps, check)
        now = move_now
        return if check.corrected_at && now - check.corrected_at < CORRECT_EVERY
        check.corrected_at = now
        send_position(ps)
      end

      # `floor`: the height of the floor the world has them on, inside a
      # stacked site (SiteLevels), or null on open ground.
      def send_position(ps)
        to_char(ps.char_id, t: "pos_correct", x: ps.x.to_f.round(2), z: ps.z.to_f.round(2),
                            floor: ps.site_levels&.values&.max&.round(2))
      end

      # Every tick, a clamped player goes on toward the spot they asked for as
      # their budget refills, so an honest player held back by a stalled line
      # ends up where their client stands even if they stop sending.
      def settle_moves
        return if move_checks.empty?
        move_checks.filter_map { |cid, check| [cid, check.pending] if check.pending }.each do |cid, (x, z, h, anim)|
          apply_move(cid, x, z, h, anim, settling: true)
        end
      end

      def report_fast_move(ps, check, asked)
        check.flagged += 1
        now = move_now
        return if check.logged_at && now - check.logged_at < MOVE_LOG_EVERY
        Rails.logger.warn("[vanai] fast move #{MOVE_POLICY == :clamp ? "clamped" : "refused"} char=#{ps.char_id} " \
                          "name=#{ps.name} asked=#{asked.round(1)}m (#{check.flagged} since the last report)")
        check.logged_at = now
        check.flagged = 0
      end

      # A jump is an impulse, not a pose. It is over in three quarters of a
      # second, so latching it into the position snapshot's `anim` would clip
      # the arc to whatever fraction of it two 4Hz snapshots happened to
      # straddle — which is why other players only ever saw a sliver of it.
      # Relay the takeoff instant instead and let every client replay the whole
      # arc from it.
      def apply_jump(char_id)
        z, ps = find_player(char_id)
        return unless ps && !ps.dead
        z.note_jump(ps, Vanai.now)
      end

      def chat(char_id, channel, msg)
        z, ps = find_player(char_id)
        return unless ps
        msg = msg.to_s.strip[0, 240]
        return if msg.empty?
        if msg.strip == "/who"
          return who(char_id)
        end
        if msg.start_with?("/company")
          return company_cmd(char_id, msg)
        end
        if msg.start_with?("/c ")
          return if silenced?(char_id)
          return company_chat(char_id, msg[3..].strip)
        end
        if msg == "/tell" || msg.start_with?("/tell ")
          return if silenced?(char_id)
          return tell(char_id, ps, msg.delete_prefix("/tell"))
        end
        return Courts.run_now!(char_id) if Rails.env.development? && msg == "/council"
        if Rails.env.development? && msg.start_with?("/tpgive")
          ps.tp = 300
          z.mark_self_dirty(ps)
          return
        end
        # the dev handle's `go` (world.ts): put the character down anywhere in
        # this zone, which the speed limit would otherwise walk them to
        if Rails.env.development? && msg.start_with?("/warp ")
          half = z.size / 2 - 2
          wx, wz = msg.split[1, 2].map { |v| v.to_f.clamp(-half, half) }
          return unless wx&.finite? && wz&.finite?
          ps.site_levels = SiteLevels.move(z.definition, ps.site_levels, ps.x, ps.z, wx, wz)
          ps.x = wx
          ps.z = wz
          move_checks.delete(char_id)
          return
        end
        if Rails.env.development? && msg.start_with?("/tp ")
          parts = msg.split
          tzone, tx, tz = parts[1], parts[2].to_f, parts[3].to_f
          return unless Data.zones.key?(tzone)
          return travel(char_id, { "to" => tzone, "tx" => tx, "tz" => tz })
        end
        return if silenced?(char_id)
        case channel
        when "party"
          party = ps.party_id && @parties[ps.party_id]
          return to_char(char_id, t: "system", msg: "You are not in a party.") unless party
          party.member_ids.each { |cid| to_char(cid, { t: "chat", channel: "party", from: ps.name, msg: msg }) }
        else
          broadcast_zone(z.key, { t: "chat", channel: "say", from: ps.name, msg: msg })
        end
      end

      # A muted account (users.muted_at; DEPLOY.md "Moderation and accounts")
      # keeps playing, but nothing it says reaches anyone: not the zone, the
      # party, a company or a /tell.
      def silenced?(char_id)
        muted = muted?(char_id)
        to_char(char_id, t: "system", msg: "You are muted. No one hears what you say.") if muted
        muted
      end

      # Seconds a read of the mute stands. It was a query on this thread for
      # every line said, the line's whole cost and a pool checkout shared with
      # Puma; now one a character at most this often. A mute or unmute made in
      # this process (User#mute!, the web console) forgets the reading at
      # once (User's after_commit, forget_mutes), and every arrival reads it
      # again; one from another process (the rake task through kamal app
      # exec, `kamal console`) can reach nothing here, and lands within this.
      MUTE_TTL = 5.0

      # char_id => [muted, read at]
      def mutes = (@mutes ||= {})

      # The same, unsaid: a muted account's arrival is not announced either.
      def muted?(char_id)
        muted, at = mutes[char_id]
        now = Vanai.now
        return muted if at && now - at < MUTE_TTL && now >= at
        muted = db { User.joins(:characters).where(characters: { id: char_id }).where.not(muted_at: nil).exists? }
        mutes[char_id] = [muted, now]
        muted
      end

      # Called from whatever thread committed the change: one delete a
      # character, which the world thread's next line reads past.
      def forget_mutes(char_ids)
        char_ids.each { |cid| @mutes&.delete(cid) }
      end

      # "/tell <Name> <message>" — the payload goes to both parties; the client
      # tells outgoing from incoming by comparing `from` with its own name.
      def tell(char_id, ps, raw)
        name, body = raw.to_s.strip.split(" ", 2)
        body = body.to_s.strip
        if name.to_s.empty? || body.empty?
          return to_char(char_id, t: "system", msg: "Usage: /tell Name message")
        end
        found = find_player_by_name(name)
        return to_char(char_id, t: "system", msg: "No explorer answers to that name.") unless found
        _, target = found
        if target.char_id == char_id
          return to_char(char_id, t: "system", msg: "You murmur to yourself, and no one else hears it.")
        end
        payload = { t: "chat", channel: "tell", from: ps.name, to: target.name, msg: body }
        to_char(target.char_id, payload)
        to_char(char_id, payload)
      end

      # A watcher takes no part in the world while their scene plays (Philip,
      # 2026-10-19): no swing, no cast, no item, no interaction. Monsters do
      # not choose them either (zone_state.rb).
      def attack(char_id, mid)
        z, ps = find_player(char_id)
        return unless ps && ps.alive? && !ps.cutscene
        m = z.monsters[mid]
        return unless m&.alive?
        ps.target_mid = mid
        ps.engaged = true
        ps.resting = false
      end

      def stop_attack(char_id)
        _, ps = find_player(char_id)
        return unless ps
        ps.engaged = false
      end

      def ability(char_id, ability_id, target_id)
        z, ps = find_player(char_id)
        return unless ps && !ps.cutscene
        Combat.use_ability(z, ps, ability_id, target_id)
      end

      def use_item(char_id, inv_id)
        z, ps = find_player(char_id)
        return unless ps && !ps.cutscene
        Combat.use_item(z, ps, inv_id)
      end

      def rest(char_id, on)
        z, ps = find_player(char_id)
        return unless ps && ps.alive?
        ps.resting = !!on
        ps.anim = ps.resting ? "rest" : "idle"
      end

      NPC_REACH = 8
      SAME_FLOOR_MSG = "Meet them on the same floor."

      # Every exchange with an NPC -- talk, quest accept and hand-in, the
      # trainer's jobs, a merchant's or broker's counter -- asks this one
      # question, so none of them can be had through a floor that the others
      # refuse. Nil when the player may deal with them; otherwise the refusal.
      # The floor is the server's own (SiteLevels, from accepted movement over
      # shared stair geometry); the client never supplies a height.
      def npc_refusal(z, ps, npc, reach = NPC_REACH)
        return "Too far away." if ps.dist_to(npc["x"], npc["z"]) > reach
        return SAME_FLOOR_MSG unless SiteLevels.reachable?(z.definition, ps.site_levels, npc, ps.x, ps.z)
        nil
      end

      # The same question from a request thread (the vendor and auction REST
      # endpoints). It only reads the last accepted position and floor, which
      # the tick thread replaces wholesale, so a torn read cannot happen.
      def npc_refusal_for(char_id, npc_id: nil, kind: nil)
        found = @online&.key?(char_id) && find_player(char_id)
        return "Speak with them in person." unless found && found.last
        z, ps = found
        npcs = (z.definition["npcs"] || []).select { |n| (npc_id.nil? || n["id"] == npc_id) && (kind.nil? || n["kind"] == kind) }
        return "Speak with them in person." if npcs.empty?
        refusals = npcs.map { |n| npc_refusal(z, ps, n) }
        refusals.include?(nil) ? nil : (refusals.find { |r| r == SAME_FLOOR_MSG } || refusals.first)
      end

      def talk(char_id, npc_id)
        z, ps = find_player(char_id)
        return unless ps && ps.alive?
        npc = (z.definition["npcs"] || []).find { |n| n["id"] == npc_id }
        return unless npc
        refusal = npc_refusal(z, ps, npc)
        return to_char(char_id, t: "system", msg: refusal) if refusal
        return Courts::Halls.talk(z, ps, npc) if npc["kind"] == "herald"
        if npc["kind"] == "sanctuary"
          ps.hp = ps.max_hp
          ps.mp = ps.max_mp
          z.mark_self_dirty(ps)
          to_char(char_id, t: "npc_dialog", npc: npc_id, name: npc["name"], title: npc["title"],
                          lines: Array(npc["dialog"]) + ["Rest a moment, explorer. There. Mended.",
                                  "Every job is open to you here. Stand in the hall's light to take up another, whenever you wish."],
                          sanctuary: true, offers: [], turnins: [])
        else
          Quests.talk(z, ps, npc)
        end
      end

      def quest_accept(char_id, quest_key)
        z, ps = find_player(char_id)
        return unless ps
        # An offer is taken from the giver's own hand, like the hand-in: the
        # dialog that listed it may still be open after walking off or upstairs.
        q = Data.quests[quest_key]
        return unless q
        giver = (z.definition["npcs"] || []).find { |n| n["id"] == q["giver"] }
        return to_char(char_id, t: "system", msg: "Return to #{q["giver"].tr('_', ' ')} to take this up.") unless giver
        refusal = npc_refusal(z, ps, giver)
        return to_char(char_id, t: "system", msg: refusal) if refusal
        Quests.accept!(z, ps, quest_key)
      end

      def quest_complete(char_id, quest_key)
        z, ps = find_player(char_id)
        return unless ps
        q = Data.quests[quest_key]
        return unless q
        giver = (z.definition["npcs"] || []).find { |n| n["id"] == q["giver"] }
        return to_char(char_id, t: "system", msg: "Return to #{q["giver"].tr('_', ' ')} to finish this.") unless giver && ps.dist_to(giver["x"], giver["z"]) <= NPC_REACH
        refusal = npc_refusal(z, ps, giver)
        return to_char(char_id, t: "system", msg: refusal) if refusal
        unless Quests.job_ok?(ps, q)
          return to_char(char_id, t: "system", msg: "Only a #{Data.jobs.dig(q["job"], "name") || q["job"]} may hand this in. Take up that job at a trainer first.")
        end
        Quests.complete!(z, ps, quest_key)
      end

      def interact(char_id, object_id)
        z, ps = find_player(char_id)
        return unless ps && ps.alive? && !ps.try(:cutscene)

        # portals
        portal = (z.definition["portals"] || []).find { |pt| pt["id"] == object_id }
        if portal
          return to_char(char_id, t: "system", msg: "Too far away.") unless portal_reach?(ps, portal)
          return to_char(char_id, t: "system", msg: "Reach the gate on the same floor.") unless SiteLevels.reachable?(z.definition, ps.site_levels, portal, ps.x, ps.z)
          return gated_portal(char_id, z, ps, portal) if portal["gate_quest"]
          return travel(char_id, portal)
        end

        # gathering nodes
        node = (z.definition["nodes"] || []).find { |n| n["id"] == object_id }
        if node
          return to_char(char_id, t: "system", msg: "Too far away.") if ps.dist_to(node["x"], node["z"]) > 6
          return to_char(char_id, t: "system", msg: "Reach it on the same floor.") unless SiteLevels.reachable?(z.definition, ps.site_levels, node, ps.x, ps.z)
          @node_at ||= {}
          key = "#{z.key}:#{object_id}"
          if (@node_at[key] || 0) > Vanai.now
            return to_char(char_id, t: "system", msg: "Picked clean. It will grow back — the world is generous that way.")
          end
          @node_at[key] = Vanai.now + 90
          item = NODE_ITEM[node["kind"]] || "lamproot"
          qty = 1 + rand(2)
          qty += Courts::Benefits.gather_bonus(ps, z.key) # the controlling court's members (courts/benefits.rb)
          grant_item(ps, item, qty)
          Courts::Claims.on_gather(z, ps)
          Courts::Relics.on_gather(z, ps)
          name = Data.items[item]["name"]
          to_char(char_id, t: "system", msg: "You gather #{qty}× #{name}.")
          grant_xp_raw(z, ps, 15 + ps.level * 2)
          z.mark_self_dirty(ps)
          return
        end

        # teleport crystals (data: `milestones`). First touch attunes; every
        # touch after that opens the crystal's menu. The home point is set from
        # the menu, on purpose -- it used to bind on every touch, which made
        # visiting a crystal and moving house the same gesture.
        wl = (z.definition["milestones"] || []).find { |w| w["id"] == object_id }
        if wl
          return to_char(char_id, t: "system", msg: "Too far away.") if ps.dist_to(wl["x"], wl["z"]) > 7
          return to_char(char_id, t: "system", msg: "Reach the crystal on the same floor.") unless SiteLevels.reachable?(z.definition, ps.site_levels, wl, ps.x, ps.z)
          unless milestone_lit_for?(ps, wl)
            record_milestone_lit(ps, object_id)
            to_char(char_id, t: "milestone", id: object_id, lit: true)
            to_char(char_id, t: "system", msg: "You attune to #{wl["name"]}. Its light knows you now.")
            # the first crystal you attune yourself (a new character's home crystal is given)
            Cutscenes.triggered("attune", z.key).each { |id| cutscene_trigger(ps, id) }
          end
          send_crystal_menu(ps, z, wl)
          # credit the quest on every touch: a crystal attuned before the quest
          # was accepted still counts, and on_interact dedupes by target
          Quests.on_interact(z, ps, object_id)
          return
        end

        # quest interactables (zones.json interactables; court stations go to Courts::Halls)
        it = (z.definition["interactables"] || []).find { |i| i["id"] == object_id }
        if it
          return to_char(char_id, t: "system", msg: "Too far away.") if ps.dist_to(it["x"], it["z"]) > 7
          return to_char(char_id, t: "system", msg: "Use the stairs to reach this floor.") unless SiteLevels.reachable?(z.definition, ps.site_levels, it, ps.x, ps.z)
          return Courts::Halls.interact(z, ps, it) if it["court_station"]
          wanted = ps.quests.any? do |key, st|
            next false unless st["status"] == QuestProgress::ACTIVE
            obj = Data.quests.dig(key, "objective")
            # a guild quest paused by a job change leaves its relics inert
            obj && obj["type"] == "interact" && obj["targets"].include?(object_id) && Quests.job_ok?(ps, key)
          end
          if wanted
            out_of_order = ps.quests.find do |key, st|
              obj = Data.quests.dig(key, "objective")
              st["status"] == QuestProgress::ACTIVE && obj && obj["type"] == "interact" && Quests.job_ok?(ps, key) &&
                obj["targets"].include?(object_id) && !Quests.interaction_in_order?(ps, key, object_id)
            end
            if out_of_order
              reminder = Array(Data.quests[out_of_order.first]["progress"]).first || "Follow the order in your quest journal."
              return to_char(char_id, t: "system", msg: reminder)
            end
            Quests.on_interact(z, ps, object_id)
            # a story object with its own scene (a founding writ, the wax-sealed cabinet)
            Cutscenes.triggered("interact", z.key, object: object_id).each { |id| cutscene_trigger(ps, id) }
            to_char(char_id, t: "system", msg: it["active_msg"])
          else
            to_char(char_id, t: "system", msg: it["idle_msg"])
          end
        end
      end

      # Within reach of the portal's spot, or of anywhere across the veil it
      # draws: walking into a veil takes you through it (client
      # portal_touch.ts), a road's veil is 20 m wide, and a gate's stands in
      # its opening 7-9 m from the spot out in front.
      def portal_reach?(ps, portal)
        return true if ps.dist_to(portal["x"], portal["z"]) <= 9
        veil = portal["veil"] || portal["glow"] || {}
        ax, az = veil["at"] || [portal["x"], portal["z"]]
        half = (veil["width"] || 0) / 2.0
        yaw = veil["yaw"] || Math.atan2(-ax, -az) # unset: facing the zone's centre
        # the card runs across its normal (sin yaw, cos yaw)
        across = ((ps.x - ax) * Math.cos(yaw) - (ps.z - az) * Math.sin(yaw)).clamp(-half, half)
        ps.dist_to(ax + across * Math.cos(yaw), az - across * Math.sin(yaw)) <= 9
      end

      def travel(char_id, portal)
        z, ps = find_player(char_id)
        return unless ps
        target_zone = portal["to"]
        leave(char_id, transferring: true)
        pos_db do
          Character.where(id: char_id).update_all(zone: target_zone, x: portal["tx"], z: portal["tz"], ferry_voyage: nil)
          @ferry_voyages&.delete(char_id)
        end
        to_char(char_id, t: "zone_change", zone: target_zone, x: portal["tx"], z: portal["tz"])
      end

      # ---- the Capital's gate ----
      # Two cities behind one gate, and a way into each (Philip's ruling,
      # 2026-10-04). The gate portal opens only for a character who has seen
      # the Regent yield -- its gate_quest, read from that character's own
      # journal, never a party's or the world's -- and takes them alone to the
      # returned city. The EMPTY city, the story's dungeon, is opened by the NPC
      # whose `gate` names the portal (Warden Morrow, before the walls), at any
      # time, finished or not. Entering it is warned about and every online
      # member must accept -- one decline, or silence, and nobody goes. Only the
      # leader can ask; the party's answer stays on Party#capital_version, so a
      # member who reaches her later is sent after them without a second vote.
      # Leaving the party inside moves no one. Solo is the same, one prompt.
      GATE_PROMPT_TTL = 30.0
      # members within this of the NPC go in with the party the moment it agrees
      GATE_SEND_REACH = 16

      def quest_done?(ps, key) = Quests.status(ps, key) == QuestProgress::COMPLETE

      # A portal with a `gate_quest` opens only for a character whose own
      # journal has that quest complete -- never a party's or the world's, so
      # one member through does not carry the rest. Two kinds share the key:
      # the Capital's gate, whose `to_done` makes it the returned city's way in
      # (below), and a plain gated portal -- the three Border Gates onto the
      # doorstep provinces, shut until inn2 (Philip, 2026-10-12) -- which
      # refuses until then and is an ordinary portal after.
      def gated_portal(char_id, z, ps, portal)
        return capital_gate(char_id, z, ps, portal) if portal["to_done"]
        unless quest_done?(ps, portal["gate_quest"])
          quest = Data.quests.dig(portal["gate_quest"], "name")
          return to_char(char_id, t: "system", msg: ["#{portal["name"] || "The gate"} stays barred.",
                                                    quest && "The wardens stand back only for an envoy who has carried the #{quest}."].compact.join(" "))
        end
        travel(char_id, portal)
      end

      def capital_gate(char_id, z, ps, portal)
        unless quest_done?(ps, portal["gate_quest"])
          keeper = (z.definition["npcs"] || []).find { |n| n["gate"] == portal["id"] }
          return to_char(char_id, t: "system", msg: ["The gates are sealed.", keeper && "#{keeper["name"]} keeps the way in."].compact.join(" "))
        end
        to_char(char_id, t: "system", msg: "The gates stand open. Beyond them, the city is awake.")
        travel(char_id, portal.merge("to" => portal["to_done"]))
      end

      # The gated portal an NPC opens the empty city through (`"gate"` on the
      # NPC names a portal of the same zone). Its "to" and landing are the
      # empty city's; the returned city is only ever the portal's own. Only a
      # two-city gate (one with a `to_done`) has a keeper: a Border Gate's
      # gate_quest is a lock, not a second way in.
      def gate_portal(zdef, npc)
        return nil unless npc && npc["gate"]
        (zdef["portals"] || []).find { |pt| pt["id"] == npc["gate"] && pt["gate_quest"] && pt["to_done"] }
      end

      def gate_enter(char_id, npc_id)
        z, ps = find_player(char_id)
        return unless ps && ps.alive?
        npc = (z.definition["npcs"] || []).find { |n| n["id"] == npc_id }
        portal = gate_portal(z.definition, npc)
        return unless portal
        refusal = npc_refusal(z, ps, npc)
        return to_char(char_id, t: "system", msg: refusal) if refusal
        party = ps.party_id && @parties[ps.party_id]
        if party
          if party.leader_id != char_id
            # a member follows the party into the empty city it already chose
            return travel(char_id, portal) if party.capital_version == portal["to"]
            return to_char(char_id, t: "system", msg: "#{npc["name"]} waits on your party leader. Only their word sends the party in.")
          end
          # a leader who drifted out of reach while the party went in follows
          # it, rather than starting a second vote that would ask the members
          # already inside
          if party.capital_version == portal["to"] && party.member_ids.any? { |cid| cid != char_id && @online[cid] == portal["to"] }
            return travel(char_id, portal)
          end
          members = party.member_ids.select { |cid| @online[cid] }
        else
          members = [char_id]
        end
        states = members.filter_map { |cid| find_player(cid)&.last }
        @gate_prompts ||= {}
        key = party ? party.pid : "solo_#{char_id}"
        return to_char(char_id, t: "system", msg: "The party is still deciding.") if @gate_prompts[key]
        @gate_prompts[key] = { members: members, accepted: [], at: Vanai.now, portal: portal, zone: z.key,
                               leader: char_id, x: npc["x"], z: npc["z"], keeper: npc["name"] }
        # who has not yet seen the Regent yield: the prompt names them, but the
        # way in is the same for everyone (re-entering after the end is allowed)
        waiting = states.reject { |m| quest_done?(m, portal["gate_quest"]) }.map(&:name)
        members.each do |cid|
          to_char(cid, t: "gate_confirm", from: ps.name, by: npc["name"], timeout: GATE_PROMPT_TTL.to_i, solo: party.nil?,
                  pending: waiting,
                  text: "\"I can open the gates on the capital as the empire left it: empty, the Regent its master, and no way " \
                        "out but the way you came. Whoever goes in must be ready to see it through. The party goes together, " \
                        "or not at all.\"")
        end
      end

      def gate_respond(char_id, accept)
        @gate_prompts ||= {}
        key, prompt = @gate_prompts.find { |_, pr| pr[:members].include?(char_id) }
        return unless prompt
        _, ps = find_player(char_id)
        unless accept
          @gate_prompts.delete(key)
          prompt[:members].each { |cid| to_char(cid, t: "gate_closed", msg: "#{ps&.name || "Someone"} turns from the gate. Nobody goes.") }
          return
        end
        prompt[:accepted] |= [char_id]
        remaining = prompt[:members] - prompt[:accepted]
        unless remaining.empty?
          prompt[:members].each { |cid| to_char(cid, t: "system", msg: "#{ps&.name} is ready to go in. Waiting on #{remaining.size}.") }
          return
        end
        @gate_prompts.delete(key)
        portal = prompt[:portal]
        party = @parties[key]
        party.capital_version = portal["to"] if party
        # everyone standing with the NPC goes now; anyone elsewhere follows the
        # party's decision when they reach her. Every member is told the prompt
        # is over -- silently for those who travel -- so the server, not the
        # client's timer, ends it: a member out of reach otherwise kept a card
        # reading "Waiting for the party..." for the rest of its 30 s
        prompt[:members].each do |cid|
          mz, mem = find_player(cid)
          next unless mem
          if mz.key == prompt[:zone] && mem.dist_to(prompt[:x], prompt[:z]) <= GATE_SEND_REACH
            to_char(cid, t: "gate_closed")
            travel(cid, portal)
          else
            to_char(cid, t: "gate_closed", msg: "The party has entered the empty city. #{prompt[:keeper]} will send you after them.")
          end
        end
      end

      def tick_gate_prompts(t)
        return if !@gate_prompts || @gate_prompts.empty?
        @gate_prompts.select { |_, pr| t - pr[:at] > GATE_PROMPT_TTL }.each do |key, pr|
          @gate_prompts.delete(key)
          pr[:members].each { |cid| to_char(cid, t: "gate_closed", msg: "The gate stays shut: not everyone answered.") }
        end
      end

      # Crystal to crystal costs a small level-scaled fare; the home point is
      # always free (Philip's ruling: teleport to home point at any time).
      CRYSTAL_FARE_BASE = 20
      def crystal_fare(ps) = CRYSTAL_FARE_BASE + ps.level

      def milestone_lit_for?(ps, w) = ps.milestone_lit?(w)

      def record_milestone_lit(ps, milestone_id)
        ps.lit_milestones << milestone_id
        db { Discovery.create!(character_id: ps.char_id, landmark_key: "milestone_#{milestone_id}") }
      rescue ActiveRecord::RecordNotUnique
        nil
      end

      def find_milestone(wl_id)
        Data.zones.each do |zk, zdef|
          w = (zdef["milestones"] || []).find { |x| x["id"] == wl_id }
          return [zk, w] if w
        end
        nil
      end

      # the crystal this character calls home: the one standing where
      # Character.home_* points, if any (a fresh character's home is the city
      # spawn, which is not a crystal until they attune one and choose it)
      def home_crystal_id(char)
        zdef = Data.zones[char.home_zone]
        return nil unless zdef
        w = (zdef["milestones"] || []).find { |m| (m["x"] - char.home_x).abs < 0.5 && (m["z"] - char.home_z).abs < 0.5 }
        w && w["id"]
      end

      def send_crystal_menu(ps, z, wl)
        char = db { Character.find(ps.char_id) }
        to_char(ps.char_id, t: "milestone_menu", from: wl["id"], name: wl["name"], zone: z.key,
                destinations: milestone_destinations(ps, z.key, wl["id"]), fee: crystal_fare(ps),
                home: home_crystal_id(char), home_zone: char.home_zone)
      end

      # every attuned crystal, anywhere -- attuning means having stood there
      def milestone_destinations(ps, current_zone, current_wl)
        out = []
        Data.zones.each do |zk, zdef|
          (zdef["milestones"] || []).each do |w|
            next if zk == current_zone && w["id"] == current_wl
            next unless milestone_lit_for?(ps, w)
            out << { id: w["id"], zone: zk, zone_name: zdef["name"], name: w["name"], fee: Courts::Benefits.fare(ps, zk, crystal_fare(ps)) }
          end
        end
        out
      end

      # Set the home point at the crystal you stand beside. Death returns you
      # here (release), and so does teleport_home.
      def set_home(char_id, wl_id)
        z, ps = find_player(char_id)
        return unless ps && ps.alive?
        wl = (z.definition["milestones"] || []).find { |w| w["id"] == wl_id }
        return to_char(char_id, t: "system", msg: "Stand at a crystal to make it your home point.") unless wl && ps.dist_to(wl["x"], wl["z"]) <= 8
        return to_char(char_id, t: "system", msg: "Attune to the crystal first.") unless milestone_lit_for?(ps, wl)
        db { Character.where(id: char_id).update_all(home_zone: z.key, home_x: wl["x"], home_z: wl["z"]) }
        to_char(char_id, t: "system", msg: "#{wl["name"]} takes your name. Home point set.")
        send_crystal_menu(ps, z, wl)
      end

      def in_combat?(z, ps)
        ps.engaged || z.monsters.any? { |_, m| m.alive? && m.enmity[ps.id].to_i > 0 }
      end

      def milestone_travel(char_id, wl_id)
        z, ps = find_player(char_id)
        return unless ps && ps.alive?
        # the rule Return Home keeps (Philip, 2026-10-19); a portal is still walked through
        return to_char(char_id, t: "system", msg: "Not while something wants you dead.") if in_combat?(z, ps)
        # must be standing at an attuned crystal
        here = (z.definition["milestones"] || []).find { |w| milestone_lit_for?(ps, w) && ps.dist_to(w["x"], w["z"]) <= 8 }
        return to_char(char_id, t: "system", msg: "Stand at an attuned crystal to teleport.") unless here
        dest_zone_key, dest = find_milestone(wl_id)
        return to_char(char_id, t: "system", msg: "No crystal answers to that name.") unless dest
        return to_char(char_id, t: "system", msg: "You have not attuned to that crystal.") unless milestone_lit_for?(ps, dest)
        fare = crystal_fare(ps)
        char = db { Character.find(char_id) }
        fare = 0 if home_crystal_id(char) == wl_id # going home is free
        fare = Courts::Benefits.fare(ps, dest_zone_key, fare) # half fare for the zone's controlling court
        if fare > 0
          # charged against the row, not ps.gold: a REST purchase may have
          # spent it a moment ago, before the recompute that tells this copy
          paid = db { Character.where(id: char_id).where("gold >= ?", fare).update_all(["gold = gold - ?", fare]) }
          return to_char(char_id, t: "system", msg: "Not enough gold for the fare. (#{fare}g)") if paid.zero?
          ps.gold -= fare
        end
        teleport_to_crystal(char_id, dest_zone_key, dest)
        to_char(char_id, t: "system", msg: fare > 0 ? "The crystal carries you. #{fare} gold for the passage." : "The crystal carries you home.")
      end

      # "Return home" from anywhere: alive, not in combat, free.
      def teleport_home(char_id)
        z, ps = find_player(char_id)
        return unless ps && ps.alive?
        return to_char(char_id, t: "system", msg: "Not while something wants you dead.") if in_combat?(z, ps)
        char = db { Character.find(char_id) }
        hid = home_crystal_id(char)
        return to_char(char_id, t: "system", msg: "You have no home crystal yet. Touch one and set it as your home point.") unless hid
        dest_zone_key, dest = find_milestone(hid)
        return unless dest
        teleport_to_crystal(char_id, dest_zone_key, dest)
        to_char(char_id, t: "system", msg: "The crystal carries you home.")
      end

      # land beside the plinth, not on it
      def teleport_to_crystal(char_id, zone_key, wl)
        lx, lz = wl["x"] + 5, wl["z"] + 3
        leave(char_id, transferring: true)
        pos_db { Character.where(id: char_id).update_all(zone: zone_key, x: lx, z: lz, ferry_voyage: nil) }
        @ferry_voyages&.delete(char_id)
        to_char(char_id, t: "zone_change", zone: zone_key, x: lx, z: lz)
      end

      # Presence for REST threads: everyone abroad, by lowercased name. Built
      # from a copy of @online, never by iterating it: a join on the tick
      # thread that adds a key while a request thread walks the hash raises in
      # the join (and leaves a player in a zone but not online). The copy is
      # one C call under the GVL, so it cannot be caught half done.
      def presence_map
        (@online&.dup || {}).each_with_object({}) do |(cid, zk), out|
          # never zone(): it would create a ZoneState from this thread
          mem = @zones&.[](zk)&.players&.[]("p#{cid}")
          next unless mem
          out[mem.name.downcase] = { online: true, level: mem.level, job: mem.job, zone: Data.zones.dig(zk, "name") || zk }
        end
      end

      # Presence for just these names, keyed and valued as presence_map: what
      # the friends list asks, where the whole map was O(online) a request
      # for a hundred names. Each name is one read of the name index, of
      # @online and of a zone's players, never a walk of any of them, so a
      # join or leave on the tick thread cannot catch it mid-iteration.
      def presence_for(names)
        names.each_with_object({}) do |name, out|
          down = name.to_s.downcase
          cid = online_by_name[down]
          zk = cid && @online&.[](cid)
          # never zone(): it would create a ZoneState from this thread
          mem = zk && @zones&.[](zk)&.players&.[]("p#{cid}")
          next unless mem && mem.name.downcase == down
          out[down] = { online: true, level: mem.level, job: mem.job, zone: Data.zones.dig(zk, "name") || zk }
        end
      end

      def presence_of(name)
        presence_for([name])[name.to_s.downcase] || { online: false }
      end

      # ---- companies (guilds; a character may belong to exactly one) ----

      def company_cmd(char_id, raw)
        z, ps = find_player(char_id)
        return unless ps
        parts = raw.split(" ", 3)
        sub = parts[1].to_s.downcase
        arg = parts[2].to_s.strip
        case sub
        when "create"
          return to_char(char_id, t: "system", msg: "Usage: /company create <name>") if arg.empty?
          return to_char(char_id, t: "system", msg: "You already march under a banner. /company leave first.") if company_of(char_id)
          co = Company.new(name: arg, leader_id: char_id)
          founded = db do
            next false unless co.save
            Character.where(id: char_id).update_all(company_id: co.id)
            true
          rescue ActiveRecord::RecordNotUnique
            # Another founder won the race between the uniqueness check and the insert.
            co.errors.add(:name, :taken_ci, message: "is already carried")
            false
          end
          return to_char(char_id, t: "system", msg: banner_refusal(co)) unless founded
          set_online_company(char_id, co.id)
          to_char(char_id, t: "system", msg: "#{co.name} is founded. Invite with /company invite <name>; speak with /c <message>.")
        when "invite"
          co = company_of(char_id)
          return to_char(char_id, t: "system", msg: "You have no company. /company create <name>") unless co
          found = find_player_by_name(arg)
          return to_char(char_id, t: "system", msg: "No one by that name is abroad.") unless found
          _, target = found
          return to_char(char_id, t: "system", msg: "#{target.name} already marches under a banner.") if company_of(target.char_id)
          @company_invites ||= {}
          @company_invites[target.char_id] = { company_id: co.id, at: Vanai.now }
          to_char(target.char_id, t: "system", msg: "#{ps.name} invites you to #{co.name}. /company accept or /company decline.")
          to_char(char_id, t: "system", msg: "Invitation carried to #{target.name}.")
        when "accept"
          inv = (@company_invites ||= {})[char_id]
          return to_char(char_id, t: "system", msg: "No invitation stands.") unless inv && Vanai.now - inv[:at] < 300
          return to_char(char_id, t: "system", msg: "You already march under a banner.") if company_of(char_id)
          @company_invites.delete(char_id)
          co = db { Company.find_by(id: inv[:company_id]) }
          return to_char(char_id, t: "system", msg: "That company has disbanded.") unless co
          db { Character.where(id: char_id).update_all(company_id: co.id) }
          set_online_company(char_id, co.id)
          company_broadcast(co.id, "#{ps.name} joins #{co.name}.")
        when "decline"
          (@company_invites ||= {}).delete(char_id)
          to_char(char_id, t: "system", msg: "Invitation declined.")
        when "leave"
          co = company_of(char_id)
          return to_char(char_id, t: "system", msg: "You march under no banner.") unless co
          db { Character.where(id: char_id).update_all(company_id: nil) }
          set_online_company(char_id, nil)
          remaining = db { Character.where(company_id: co.id).pluck(:id) }
          if remaining.empty?
            db { Company.where(id: co.id).delete_all }
            to_char(char_id, t: "system", msg: "You leave, and the banner of #{co.name} is furled for good.")
          else
            db { Company.where(id: co.id).update_all(leader_id: remaining.first) } if co.leader_id == char_id
            to_char(char_id, t: "system", msg: "You leave #{co.name}.")
            company_broadcast(co.id, "#{ps.name} has left the company.")
          end
        else
          to_char(char_id, t: "system", msg: "/company create|invite|accept|decline|leave — /c <message> to speak.")
        end
      end

      # Why a proposed banner was turned away, in the game's voice.
      def banner_refusal(co)
        return "That banner is already carried." if co.errors.of_kind?(:name, :taken_ci)
        if co.errors.of_kind?(:name, :too_short) || co.errors.of_kind?(:name, :too_long)
          return "A banner bears #{Company::NAME_MIN} to #{Company::NAME_MAX} characters."
        end
        return "A banner bears letters, apostrophes and spaces — nothing else." if co.errors.include?(:name)
        "That banner cannot be raised."
      end

      def company_of(char_id)
        db { Character.find_by(id: char_id)&.company_id.then { |cid| cid && Company.find_by(id: cid) } }
      end

      # To the members online (company_online), where every line once plucked
      # every member from the database to find them.
      def company_broadcast(company_id, msg, from = nil)
        company_online.fetch(company_id, []).to_a.each do |cid|
          next unless @online[cid]
          if from
            to_char(cid, t: "chat", channel: "company", from: from, msg: msg)
          else
            to_char(cid, t: "system", msg: msg)
          end
        end
      end

      # A line needs only the speaker's company id, which is held while they
      # are online; the row is read only for one the world has not seen join.
      def company_chat(char_id, msg)
        _, ps = find_player(char_id)
        return unless ps
        co_id = online_companies.key?(char_id) ? online_companies[char_id] : company_of(char_id)&.id
        return to_char(char_id, t: "system", msg: "You march under no banner. /company create <name>") unless co_id
        company_broadcast(co_id, msg, ps.name)
      end

      # The count is everyone abroad; the lines are the first 20 in the order
      # they came online, as they always were.
      def who(char_id)
        lines = []
        @online.each_key do |cid|
          break if lines.size == 20
          _, mem = find_player(cid)
          next unless mem
          lines << who_line(mem, @online[cid])
        end
        to_char(char_id, t: "system", msg: "Explorers abroad in Ardenfell: #{online_roster.size}")
        lines.each { |l| to_char(char_id, t: "system", msg: l) }
      end

      def who_line(mem, zone_key)
        zname = Data.zones.dig(zone_key, "name") || zone_key
        "#{mem.name} — Lv #{mem.level} #{mem.job} — #{zname}"
      end

      # Everyone abroad as [name, lowercased name, char_id], sorted by name:
      # Player Search's roster. Every page of it used to build a row for every
      # player online and sort them all to serve twenty. Built again only
      # after someone joins or leaves (names never change in play), so it is
      # never stale; level, job and zone are read live for the page served.
      # `@roster_of` is the @online it was built from: one swapped or filled
      # by hand (the tests) is never read through an old roster.
      def online_roster
        return @roster if @roster && @roster_of.equal?(@online) && @roster_size == @online.size
        @roster_of = @online
        @roster_size = @online.size
        @roster = @online.keys.filter_map do |cid|
          _, mem = find_player(cid)
          [mem.name, mem.name.downcase, cid] if mem
        end.sort_by(&:first)
      end

      # the Player Search window's page size: every explorer abroad can be paged
      # through, where a fixed cap used to hide the rest
      WHO_LIST_PAGE = 20

      # structured sibling of /who, for the client's roster panel; one page of
      # it, with the page actually served (a page past the end is the last)
      def who_list(char_id, q = nil, page = 1)
        needle = q.to_s.strip.downcase
        roster = online_roster
        matches = needle.empty? ? roster : roster.select { |_, down, _| down.include?(needle) }
        pages = [(matches.size + WHO_LIST_PAGE - 1) / WHO_LIST_PAGE, 1].max
        page = (page.is_a?(Integer) ? page : Integer(page.to_s, exception: false) || 1).clamp(1, pages)
        rows = (matches[(page - 1) * WHO_LIST_PAGE, WHO_LIST_PAGE] || []).filter_map do |_, _, cid|
          _, mem = find_player(cid)
          next unless mem
          zone_key = @online[cid]
          { name: mem.name, job: mem.job, level: mem.level,
            zone: zone_key, zone_name: Data.zones.dig(zone_key, "name") || zone_key }
        end
        to_char(char_id, t: "who_list", count: matches.size, page: page, pages: pages, q: q.to_s.strip,
                         players: rows)
      end

      def examine(char_id, name)
        found = find_player_by_name(name.to_s)
        return to_char(char_id, t: "system", msg: "They are nowhere to be found.") unless found
        _, tps = found
        equipped = db { Character.find_by(id: tps.char_id)&.equipped&.to_a } || []
        items = equipped.filter_map do |row|
          item = Data.items[row.item_key]
          next unless item
          { slot: row.equipped_slot, key: row.item_key, name: item["name"] }
        end
        to_char(char_id, t: "examine", name: tps.name, title: tps.title, race: tps.race,
                        job: tps.job, level: tps.level, items: items)
      end

      def raise_respond(char_id, accept)
        z, ps = find_player(char_id)
        return unless ps && ps.dead
        offer = ps.pending_raise
        return unless offer
        ps.pending_raise = nil
        if accept && (Vanai.now - offer[:at]) <= Combat::RAISE_OFFER_TTL
          Combat.complete_raise(z, ps, offer)
        elsif !accept
          to_char(char_id, t: "system", msg: "You let it pass. Another Raise, or your home crystal, can still bring you back.")
        end
      end

      def release(char_id)
        z, ps = find_player(char_id)
        return unless ps && ps.dead
        home = db { Character.find(char_id) }
        ps.xp_lost = 0
        ps.pending_raise = nil
        leave(char_id, transferring: true)
        # the home point stands them up whole: nothing of the death is kept
        kept_vitals.delete(char_id)
        # a home point ON a crystal lands beside its plinth; the city spawn
        # default is open ground and needs no offset
        off = home_crystal_id(home) ? [5, 3] : [0, 0]
        hx, hz = home.home_x + off[0], home.home_z + off[1]
        pos_db { Character.where(id: char_id).update_all(zone: home.home_zone, x: hx, z: hz, ferry_voyage: nil, dead_at: nil) }
        @ferry_voyages&.delete(char_id)
        to_char(char_id, t: "zone_change", zone: home.home_zone, x: hx, z: hz, respawn: true)
      end

      def change_job(char_id, job)
        z, ps = find_player(char_id)
        return unless ps && ps.alive?
        return to_char(char_id, t: "system", msg: "That is not a job you know.") unless Character::JOBS.include?(job)
        # no change: no guild scene spent, no TP or effects lost
        return to_char(char_id, t: "system", msg: "That is already your job.") if job == ps.job
        sanctuary = (z.definition["npcs"] || []).find { |n| n["kind"] == "sanctuary" }
        unless sanctuary && ps.dist_to(sanctuary["x"], sanctuary["z"]) <= 10
          return to_char(char_id, t: "system", msg: "Jobs may only be changed beside a trainer, in one of the cities.")
        end
        refusal = npc_refusal(z, ps, sanctuary, 10)
        return to_char(char_id, t: "system", msg: refusal) if refusal
        # under the row lock equip takes: an equip checked against the old
        # job waits, and sees the new one; this pass waits on one in flight,
        # and sees what it put on
        char = db do
          Character.transaction do
            c = Character.lock.find(char_id)
            c.update!(active_job: job)
            c.unequip_incompatible_job_gear!
          end
          # recompute! queries the job row and the equipped pieces itself
          Character.find(char_id)
        end
        ps.recompute!(char)
        ps.hp = ps.max_hp
        ps.mp = ps.max_mp
        ps.tp = 0
        ps.buffs = []
        broadcast_zone(z.key, { t: "player_update", player: ps.public_payload })
        to_char(char_id, ps.self_payload)
        to_char(char_id, t: "abilities", list: Data.abilities_for(job, ps.level).map { |id, a| a.merge("id" => id) })
        to_char(char_id, t: "inventory_dirty")
        to_char(char_id, t: "system", msg: "You take up the way of the #{Data.jobs[job]["name"]}.")
        # the first time a character takes up another job, its guild marks it
        Cutscenes.triggered("job_change", z.key).each { |id| cutscene_trigger(ps, id) }
      end

      def notify_sale(seller_char_id, item_name, proceeds)
        _, ps = find_player(seller_char_id)
        if ps
          ps.gold += proceeds
          to_char(seller_char_id, t: "system", msg: "Auction: your #{item_name} sold for #{proceeds} gold.")
          z, = find_player(seller_char_id)
          z&.mark_self_dirty(ps)
        end
      end

      # What a REST mutation (equip, a sale, a parcel) asks of the world: the
      # player's copy read again from the database. One per character waits
      # in the queue at most: a client posting as fast as it can used to queue
      # a full recompute and a zone broadcast a call, more than a tick could
      # run. The id leaves the set before the read, so a commit landing after
      # it asks again and nothing committed is ever missed. Puma threads ask
      # and the world thread answers, hence the lock.
      RECOMPUTE_LOCK = Mutex.new

      def recompute_pending = (@recompute_pending ||= Set.new)
      # requests that changed a character's rows, counted (under the lock)
      def touches = (@touches ||= Hash.new(0))
      def touch_gen(char_id) = RECOMPUTE_LOCK.synchronize { touches[char_id] }

      # A write to a character's rows that the world's copy does not follow
      # by a recompute (a sale's proceeds to the seller, a court's purse, a
      # scene watched), called once it has committed: a join whose rows the
      # loader read before it reads them again (join_load_current?). Every
      # such write calls this or request_recompute, whoever's they are.
      def touch(char_id) = RECOMPUTE_LOCK.synchronize { touches[char_id] += 1 }

      def request_recompute(char_id)
        RECOMPUTE_LOCK.synchronize do
          # a join whose reads began before this saw the rows before the
          # request's write (join_load_current?)
          touches[char_id] += 1
          next unless recompute_pending.add?(char_id)
          enqueue do
            RECOMPUTE_LOCK.synchronize { recompute_pending.delete(char_id) }
            recompute(char_id)
          end
        end
      end

      # The fields everyone else's copy of a player holds and recompute! can
      # change; where they stand and how they move are the pos stream's.
      RECOMPUTE_MOVING = %i[x z h anim].freeze

      def recompute(char_id)
        z, ps = find_player(char_id)
        return unless ps
        # recompute! queries the job row and the equipped pieces itself
        char = db { Character.find_by(id: char_id) }
        return unless char
        before = ps.public_payload.except(*RECOMPUTE_MOVING)
        ps.recompute!(char)
        # the purse and the sheet are the player's own (the self payload)
        z.mark_self_dirty(ps)
        # the zone hears only of a change it can see: a sale or a parcel
        # changes gold and nothing anyone else is shown
        after = ps.public_payload
        broadcast_zone(z.key, { t: "player_update", player: after }) if after.except(*RECOMPUTE_MOVING) != before
      end

      def discover(char_id, landmark_id)
        z, ps = find_player(char_id)
        return unless ps && ps.alive?
        lm = (z.definition["landmarks"] || []).find { |l| l["id"] == landmark_id }
        return unless lm
        return if ps.dist_to(lm["x"], lm["z"]) > 30
        return if db { Discovery.exists?(character_id: char_id, landmark_key: landmark_id) }
        begin
          db { Discovery.create!(character_id: char_id, landmark_key: landmark_id) }
        rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid
          return
        end
        grant_xp(z, ps, lm["xp"], 0)
        to_char(char_id, t: "discovery", id: landmark_id, name: lm["name"], xp: lm["xp"])
        Quests.on_discover(z, ps, landmark_id)
        # a place with its own scene, the first time it is found (the Census Hall)
        Cutscenes.triggered("landmark", z.key, landmark: landmark_id).each { |id| cutscene_trigger(ps, id) }
      end

      # ---- cutscenes (cutscenes.rb holds the rules) ----

      # Fires a scene from something that happened to `ps` (a quest accepted or
      # handed in). Every member it reaches is sent their own copy: the client
      # always casts the one watching as the subject.
      def cutscene_trigger(ps, id)
        members = party_members_here(ps)
        Cutscenes.audience(ps, id, members).each do |m|
          unless m.cutscenes_due.include?(id)
            m.cutscenes_due << id
            begin
              db { Discovery.create!(character_id: m.char_id, landmark_key: "#{Cutscenes::DUE}#{id}") }
            rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid
              nil
            end
          end
          to_char(m.char_id, t: "cutscene", id: id)
        end
      end

      def party_members_here(ps)
        party = ps.party_id && @parties[ps.party_id]
        return [ps] unless party
        party.member_ids.filter_map { |cid| find_player(cid)&.last }
      end

      def cutscene_begin(char_id, id)
        z, ps = find_player(char_id)
        return unless ps
        fighting = in_combat?(z, ps)
        refusal = Cutscenes.refusal(ps, id, fighting)
        # a fight or a fall passes, and the client tries again; anything else
        # is final, and it says why
        return to_char(char_id, t: "cutscene_refused", id: id, msg: refusal, retry: fighting || !ps.alive?) if refusal
        ps.cutscene = id
        ps.cutscene_at = Vanai.now
        ps.engaged = false
        ps.target_mid = nil
        ps.resting = false
        ps.anim = "idle"
        cutscene_changed(z, ps)
      end

      # Watched to the end or skipped, the scene is seen either way: it stops
      # being owed and becomes one the character may replay.
      def cutscene_end(char_id, id)
        z, ps = find_player(char_id)
        return unless ps
        unless ps.cutscene == id
          # A reconnect mid-scene built a state with nothing playing while the
          # client watched on: an owed scene it says has ended is seen all the
          # same (or it plays again at the next arrival), and placed as its
          # begin would have been allowed to.
          return unless ps.cutscene.nil? && ps.cutscenes_due.include?(id)
          place_on_mark(z, ps, id) unless Cutscenes.refusal(ps, id, in_combat?(z, ps))
          return cutscene_seen(ps, id)
        end
        ps.cutscene = nil
        ps.cutscene_at = nil
        # Only a first viewing leaves its watcher on the scene's mark (Philip,
        # 2026-10-19); a replay was a free walk to it from anywhere in the
        # zone. The world never moves a watcher, so a replay ends where it
        # began, budget and all, and the client is told so. An unmarked scene
        # places no one, so the budget runs on: it refills with the time spent
        # watching, and a replay cannot top it up.
        if ps.cutscenes_due.include?(id)
          place_on_mark(z, ps, id)
        else
          send_position(ps)
        end
        cutscene_seen(ps, id)
        cutscene_changed(z, ps)
      end

      # A scene with a mark stood its subject there (cutscene.ts start) and its
      # walks are a few metres from it: the world places them on the mark too,
      # with a full budget, so the client's next move is not a jump
      def place_on_mark(z, ps, id)
        mark = Cutscenes.scene(id)&.dig("mark")
        return unless mark
        ps.site_levels = SiteLevels.move(z.definition, ps.site_levels, ps.x, ps.z, mark[0], mark[1])
        ps.x = mark[0].to_f
        ps.z = mark[1].to_f
        move_checks.delete(ps.char_id)
      end

      def cutscene_seen(ps, id)
        ps.cutscenes_seen << id
        return unless ps.cutscenes_due.delete?(id)
        db do
          Discovery.where(character_id: ps.char_id, landmark_key: "#{Cutscenes::DUE}#{id}").delete_all
          Discovery.find_or_create_by!(character_id: ps.char_id, landmark_key: "#{Cutscenes::SEEN}#{id}")
        end
      rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid
        nil
      end

      # A client that never says the scene ended (a crash that kept the socket
      # open, a hung tab) must not leave its player frozen under a film icon:
      # past the scene's running time and a margin the world lets them go. The
      # scene stays owed, so it plays again on their next login.
      def cutscene_expire(z, ps, t)
        return unless ps.cutscene && t - ps.cutscene_at > Cutscenes.hold_limit(ps.cutscene)
        ps.cutscene = nil
        ps.cutscene_at = nil
        cutscene_changed(z, ps)
      end

      # Everyone in the zone redraws the film icon; the party bar shows it too.
      def cutscene_changed(z, ps)
        broadcast_zone(z.key, { t: "player_update", player: ps.public_payload })
        sync_party(ps.party_id) if ps.party_id
      end

      # ---- parties ----

      def party_invite(char_id, target_name)
        z, ps = find_player(char_id)
        return unless ps
        found = find_player_by_name(target_name)
        return to_char(char_id, t: "system", msg: "No adventurer by that name is in the world.") unless found
        _, target = found
        return to_char(char_id, t: "system", msg: "They are already in a party.") if target.party_id
        return to_char(char_id, t: "system", msg: "You cannot invite yourself.") if target.char_id == char_id
        party = ps.party_id && @parties[ps.party_id]
        if party
          return to_char(char_id, t: "system", msg: "Only the leader may invite.") unless party.leader_id == char_id
          return to_char(char_id, t: "system", msg: "The party is full (6).") if party.full?
        end
        pending_pid = party&.pid || "pending_#{char_id}"
        to_char(target.char_id, t: "party_invite", from: ps.name, from_id: char_id)
        to_char(char_id, t: "system", msg: "You invite #{target.name} to your party.")
        @pending_invites ||= {}
        @pending_invites[target.char_id] = [char_id, Vanai.now]
      end

      # how long an invitation can be answered
      PARTY_INVITE_TTL = 60.0

      def party_respond(char_id, accept)
        @pending_invites ||= {}
        inviter_id, at = @pending_invites.delete(char_id)
        return unless inviter_id && Vanai.now - at <= PARTY_INVITE_TTL
        _, target = find_player(char_id)
        _, inviter = find_player(inviter_id)
        return unless target && inviter
        unless accept
          to_char(inviter_id, t: "system", msg: "#{target.name} declines your invitation.")
          return
        end
        # both sides as they are now, not as they were when it was sent: a
        # member of two parties draws rewards from both
        return to_char(char_id, t: "system", msg: "You are already in a party.") if target.party_id
        party = inviter.party_id && @parties[inviter.party_id]
        return to_char(char_id, t: "system", msg: "That invitation has lapsed.") if party && party.leader_id != inviter_id
        unless party
          @next_party_id += 1
          party = Party.new("party#{@next_party_id}", inviter_id)
          @parties[party.pid] = party
          inviter.party_id = party.pid
        end
        return to_char(inviter_id, t: "system", msg: "The party is full.") if party.full?
        party.member_ids << char_id
        target.party_id = party.pid
        party.member_ids.each { |cid| to_char(cid, t: "system", msg: "#{target.name} joins the party.") }
        sync_party(party.pid)
      end

      def party_leave(char_id)
        _, ps = find_player(char_id)
        return unless ps&.party_id
        party = @parties[ps.party_id]
        ps.party_id = nil
        return unless party
        to_char(char_id, t: "party", members: [])
        party.member_ids.each { |cid| to_char(cid, t: "system", msg: "#{ps.name} leaves the party.") unless cid == char_id }
        drop_from_party(party, char_id)
      end

      def disband_party(party)
        party.member_ids.each do |cid|
          _, mem = find_player(cid)
          mem.party_id = nil if mem
          @party_grace.delete(cid)
          to_char(cid, t: "party", members: [])
          to_char(cid, t: "system", msg: "The party disbands.")
        end
        @parties.delete(party.pid)
      end

      def restore_party(ps)
        party = @parties.values.find { |pt| pt.member_ids.include?(ps.char_id) }
        ps.party_id = party&.pid
        !!party
      end

      def member_payload(party, cid, mem)
        { id: mem.id, char_id: cid, name: mem.name, job: mem.job, level: mem.level,
          hp: mem.hp, max_hp: mem.max_hp, mp: mem.mp, max_mp: mem.max_mp, tp: mem.tp.to_i,
          zone: @online[cid], leader: cid == party.leader_id, dead: mem.dead, cutscene: !mem.cutscene.nil? }
      end

      def sync_party(pid)
        party = @parties[pid]
        return unless party
        members = party.member_ids.filter_map do |cid|
          _, mem = find_player(cid)
          if mem
            party.snapshots[cid] = member_payload(party, cid, mem)
          elsif (snap = party.snapshots[cid])
            # crossing to another zone, or briefly disconnected: hold the seat
            snap.merge(zone: nil, away: true, leader: cid == party.leader_id)
          end
        end
        party.member_ids.each { |cid| to_char(cid, t: "party", members: members) }
      end

      def tick_parties(t)
        reap_party_grace(t)
        @last_party_sync ||= 0.0
        return if t - @last_party_sync < 2.0
        @last_party_sync = t
        @parties.each_key { |pid| sync_party(pid) }
      end

      # A seat held open for a disconnected member, or one who crossed and never
      # arrived, is released once their grace period lapses.
      def reap_party_grace(t)
        return if @party_grace.empty?
        expired = @party_grace.select { |_, deadline| t >= deadline }.keys
        expired.each do |cid|
          @party_grace.delete(cid)
          next if @online[cid] # came back
          party = @parties.values.find { |pt| pt.member_ids.include?(cid) }
          next unless party
          name = party.snapshots.dig(cid, :name) || "Someone"
          party.member_ids.each { |m| to_char(m, t: "system", msg: "#{name} has left the party.") unless m == cid }
          drop_from_party(party, cid)
        end
      end

      # ---- direct trading ----
      # One active trade per player. Offers reset confirmations; both confirm → atomic swap.

      def trade_of(char_id)
        @trades ||= {}
        @trades.values.find { |t| t[:a] == char_id || t[:b] == char_id }
      end

      def trade_invite(char_id, target_name)
        @trades ||= {}
        @trade_invites ||= {}
        z, ps = find_player(char_id)
        return unless ps
        found = find_player_by_name(target_name)
        return to_char(char_id, t: "system", msg: "No adventurer by that name is in the world.") unless found
        tz, target = found
        return to_char(char_id, t: "system", msg: "You cannot trade with yourself.") if target.char_id == char_id
        return to_char(char_id, t: "system", msg: "They must stand beside you to trade.") if tz.key != z.key || ps.dist_to(target.x, target.z) > 8
        return to_char(char_id, t: "system", msg: "One of you is already trading.") if trade_of(char_id) || trade_of(target.char_id)
        @trade_invites[target.char_id] = [char_id, Vanai.now]
        to_char(target.char_id, t: "trade_invite", from: ps.name)
        to_char(char_id, t: "system", msg: "You offer to trade with #{target.name}.")
      end

      # how long an offer to trade can be answered (a party invitation's)
      TRADE_INVITE_TTL = PARTY_INVITE_TTL

      def trade_respond(char_id, accept)
        @trade_invites ||= {}
        inviter_id, at = Array(@trade_invites.delete(char_id))
        return unless inviter_id
        return to_char(char_id, t: "system", msg: "That offer to trade has lapsed.") if at && Vanai.now - at > TRADE_INVITE_TTL
        tz, target = find_player(char_id)
        iz, inviter = find_player(inviter_id)
        return unless target && inviter
        unless accept
          to_char(inviter_id, t: "system", msg: "#{target.name} declines the trade.")
          return
        end
        # both sides as they are now, not as they were when it was sent (the
        # party's rule): one trade each, and still side by side
        return to_char(char_id, t: "system", msg: "One of you is already trading.") if trade_of(char_id) || trade_of(inviter_id)
        return to_char(char_id, t: "system", msg: "They must stand beside you to trade.") if tz.key != iz.key || target.dist_to(inviter.x, inviter.z) > 8
        # their other offers can no longer be taken up
        @trade_invites.delete_if { |_, inv| [char_id, inviter_id].include?(Array(inv).first) }
        @trades ||= {}
        @next_trade_id = (@next_trade_id || 0) + 1
        @trades[@next_trade_id] = {
          a: inviter_id, b: char_id,
          offers: { inviter_id => { gold: 0, items: [] }, char_id => { gold: 0, items: [] } },
          confirmed: { inviter_id => false, char_id => false },
          # every change of offer is a new revision; a confirm names the one it saw
          rev: 0,
        }
        sync_trade(@next_trade_id)
      end

      def trade_offer(char_id, gold, items)
        trade = trade_of(char_id)
        return unless trade
        gold = (Integer(gold.to_s, exception: false) || 0).clamp(0, 999_999)
        items = Array(items).grep(Hash).first(6).map do |it|
          { inv_id: Integer(it["inv_id"].to_s, exception: false).to_i, qty: (Integer(it["qty"].to_s, exception: false) || 1).clamp(1, 999_999) }
        end
        items = Courts::Relics.tradeable(char_id, items) # a named relic is bound to its finder
        trade[:offers][char_id] = { gold: gold, items: items }
        trade[:rev] = trade[:rev].to_i + 1
        trade[:confirmed].each_key { |k| trade[:confirmed][k] = false }
        sync_trade_by(trade)
      end

      # `rev`: the revision of the trade_state the confirmer was shown. A
      # confirm sent while an offer was changing under it would seal terms
      # never seen (the last-second swap): it counts for nothing, and the
      # window is drawn again.
      def trade_confirm(char_id, rev = nil)
        trade = trade_of(char_id)
        return unless trade
        unless rev == trade[:rev]
          to_char(char_id, t: "system", msg: "The offer changed. Look again.")
          return sync_trade_by(trade)
        end
        trade[:confirmed][char_id] = true
        if trade[:confirmed].values.all?
          execute_trade(trade)
        else
          sync_trade_by(trade)
        end
      end

      def trade_cancel(char_id)
        trade = trade_of(char_id)
        return unless trade
        @trades.delete_if { |_, t| t == trade }
        [trade[:a], trade[:b]].each do |cid|
          to_char(cid, t: "trade_state", closed: true)
          to_char(cid, t: "system", msg: "The trade is cancelled.")
        end
      end

      def execute_trade(trade)
        a, b = trade[:a], trade[:b]
        za, pa = find_player(a)
        zb, pb = find_player(b)
        unless pa && pb && za.key == zb.key && pa.dist_to(pb.x, pb.z) <= 10
          return trade_cancel(a)
        end
        ok = begin
          db do
            ActiveRecord::Base.transaction do
              # in id order, as every REST path that locks two characters
              # does: in invite order, a letter or a purchase between the two
              # deadlocked with it and froze every zone for a second
              rows = Character.lock.where(id: [a, b]).order(:id).index_by(&:id)
              ca, cb = rows[a], rows[b]
              raise ActiveRecord::Rollback unless ca && cb
              offer_a = trade[:offers][a]
              offer_b = trade[:offers][b]
              raise ActiveRecord::Rollback if ca.gold < offer_a[:gold] || cb.gold < offer_b[:gold]
              # validate + move items
              [[ca, cb, offer_a], [cb, ca, offer_b]].each do |giver, taker, offer|
                offer[:items].each do |it|
                  # locked, as every REST path that moves a stack locks it: an
                  # unlocked read here writes back a count a listing, a letter or
                  # a sale has already changed
                  row = giver.inventory_items.lock.find_by(id: it[:inv_id], equipped_slot: nil)
                  raise ActiveRecord::Rollback unless row && row.qty >= it[:qty]
                  item = Data.items[row.item_key]
                  existing = taker.inventory_items.lock.find_by(item_key: row.item_key, equipped_slot: nil, named_relic_id: nil)
                  if existing && %w[consumable material].include?(item["slot"])
                    existing.update!(qty: existing.qty + it[:qty])
                  else
                    taker.inventory_items.create!(item_key: row.item_key, qty: it[:qty])
                  end
                  row.qty -= it[:qty]
                  row.qty.zero? ? row.destroy! : row.save!
                end
              end
              ca.update!(gold: ca.gold - offer_a[:gold] + offer_b[:gold])
              cb.update!(gold: cb.gold - offer_b[:gold] + offer_a[:gold])
              true
            end
          end
        rescue ActiveRecord::ActiveRecordError => e
          # a lock wait or a deadlock the database broke: the trade still
          # closes, and both are told
          Rails.logger.error("[vanai] trade #{a}-#{b}: #{e.class}: #{e.message}")
          ErrorReports.report(e, "trade", level: :warning, char_ids: [a, b])
          false
        end
        @trades.delete_if { |_, t| t == trade }
        [a, b].each do |cid|
          to_char(cid, t: "trade_state", closed: true)
          if ok
            to_char(cid, t: "system", msg: "The trade is sealed. A pleasure doing honest business in a dark world.")
            recompute(cid)
            to_char(cid, t: "inventory_dirty")
          else
            to_char(cid, t: "system", msg: "The trade fell through — goods or gold were missing.")
          end
        end
      end

      def sync_trade_by(trade)
        id = @trades.key(trade)
        sync_trade(id) if id
      end

      def sync_trade(trade_id)
        trade = @trades[trade_id]
        return unless trade
        a, b = trade[:a], trade[:b]
        payload_for = lambda do |me, them|
          _, mine_ps = find_player(me)
          _, their_ps = find_player(them)
          describe = lambda do |cid, offer|
            items = offer[:items].map do |it|
              row = db { InventoryItem.find_by(id: it[:inv_id], character_id: cid) }
              next nil unless row
              { inv_id: row.id, item_key: row.item_key, name: Data.items[row.item_key]["name"], qty: it[:qty] }
            end.compact
            { gold: offer[:gold], items: items }
          end
          { t: "trade_state",
            partner: their_ps&.name || "?",
            mine: describe.call(me, trade[:offers][me]),
            theirs: describe.call(them, trade[:offers][them]),
            my_confirm: trade[:confirmed][me], their_confirm: trade[:confirmed][them], rev: trade[:rev] }
        end
        to_char(a, payload_for.call(a, b))
        to_char(b, payload_for.call(b, a))
      end

      # ---- persistence & rewards ----

      # With the position, whether they lie fallen there (dead_at, kept from
      # the fall; cleared by a release or once they stand again).
      def persist_position(ps, zone_key)
        pos_db do
          Character.where(id: ps.char_id).update_all(
            ["zone = ?, x = ?, z = ?, heading = ?, dead_at = CASE WHEN ? THEN COALESCE(dead_at, CURRENT_TIMESTAMP) END",
             zone_key, ps.x, ps.z, ps.heading, !!ps.dead]
          )
        end
      rescue => e
        Rails.logger.error("[vanai] persist_position: #{e.message}")
        ErrorReports.report(e, "persist_position", char_id: ps.char_id)
      end

      # The fall alone, for the moment it happens or ends (a death, a Raise),
      # so a restart before the next save still knows it. Queued behind the
      # saves rather than waited for: it falls mid-tick, and nothing reads it
      # back before a leave or a release, which flush (PositionWriter#later).
      def persist_death(ps)
        id, dead = ps.char_id, !!ps.dead
        positions.later do
          Character.where(id: id).update_all(["dead_at = CASE WHEN ? THEN COALESCE(dead_at, CURRENT_TIMESTAMP) END", dead])
        end
      rescue => e
        Rails.logger.error("[vanai] persist_death: #{e.message}")
        ErrorReports.report(e, "persist_death", char_id: ps.char_id)
      end

      def persist_job(ps)
        db do
          CharacterJob.where(character_id: ps.char_id, job: ps.job).update_all(level: ps.level, xp: ps.xp)
        end
      rescue => e
        Rails.logger.error("[vanai] persist_job: #{e.message}")
        ErrorReports.report(e, "persist_job", char_id: ps.char_id)
      end

      # A party's kill XP in one statement (Combat.award_xp) rather than one
      # per member: each member's active job row as they stand now. The rows
      # are locked in character id order, the order every multi-character
      # transaction takes, so this cannot deadlock against a trade or a letter.
      def persist_jobs(list)
        return if list.empty?
        return persist_job(list.first) if list.size == 1
        list = list.sort_by(&:char_id)
        pairs = list.flat_map { |ps| [ps.char_id, ps.job] }
        cases = "CASE character_id #{'WHEN ? THEN ? ' * list.size}END"
        db do
          rows = CharacterJob.where("(character_id, job) IN (#{(['(?, ?)'] * list.size).join(', ')})", *pairs)
          CharacterJob.where(id: rows.order(:character_id).lock.select(:id))
                      .update_all(["level = #{cases}, xp = #{cases}",
                                   *list.flat_map { |ps| [ps.char_id, ps.level] },
                                   *list.flat_map { |ps| [ps.char_id, ps.xp] }])
        end
      rescue => e
        Rails.logger.error("[vanai] persist_jobs: #{e.message}")
        ErrorReports.report(e, "persist_jobs", characters: list.size)
      end

      # Nothing for the dead (Philip, 2026-10-19): a party's kill, a quest or a
      # landmark reaching a fallen member earns them no XP and no level.
      # A level-up saves its row itself, before recompute! reads it back.
      # `persist: false` leaves a plain gain unsaved and returns true, for a
      # caller that saves several at once (persist_jobs).
      def grant_xp(zone_state, ps, amount, chain, persist: true)
        return false if amount <= 0 || ps.dead || ps.level >= Stats::MAX_LEVEL
        ps.xp += amount
        to_char(ps.char_id, t: "xp", amount: amount, chain: chain)
        leveled = false
        while ps.level < Stats::MAX_LEVEL && ps.xp >= Stats.tnl(ps.level)
          ps.xp -= Stats.tnl(ps.level)
          ps.level += 1
          leveled = true
        end
        if leveled
          char = db { Character.find(ps.char_id) }
          db { CharacterJob.where(character_id: ps.char_id, job: ps.job).update_all(level: ps.level, xp: ps.xp) }
          ps.recompute!(char)
          ps.hp = ps.max_hp
          ps.mp = ps.max_mp
          zone_state.push_event(k: "levelup", tgt: ps.id)
          broadcast_zone(zone_state.key, { t: "player_update", player: ps.public_payload })
          to_char(ps.char_id, t: "system", msg: "You attain level #{ps.level}!")
          to_char(ps.char_id, t: "abilities", list: Data.abilities_for(ps.job, ps.level).map { |id, a| a.merge("id" => id) })
        elsif persist
          persist_job(ps)
        end
        zone_state.mark_self_dirty(ps)
        !leveled && !persist
      end

      def grant_xp_raw(zone_state, ps, amount)
        grant_xp(zone_state, ps, amount, 0)
      end

      # The stack is read under a row lock inside a transaction (Mail.give!'s
      # rule): a plain read merged into a stack that a listing or a letter is
      # taking from writes back the count from before, and the taken items
      # come back.
      def grant_item(ps, item_key, qty)
        db do
          InventoryItem.transaction do
            row = InventoryItem.lock.find_by(character_id: ps.char_id, item_key: item_key, equipped_slot: nil, named_relic_id: nil)
            if row && Data.items[item_key]["slot"].in?(%w[consumable material])
              row.update!(qty: row.qty + qty)
            else
              InventoryItem.create!(character_id: ps.char_id, item_key: item_key, qty: qty)
            end
          end
        end
        to_char(ps.char_id, t: "inventory_dirty")
      end

      # Takes `count` from the bags (never what is worn), all or nothing, and
      # says how many it took: 0 when the bags no longer hold that many.
      def consume_items(ps, keys, count)
        taken = db do
          InventoryItem.transaction do
            rows = InventoryItem.lock.where(character_id: ps.char_id, item_key: keys, equipped_slot: nil).order(:id).to_a
            raise ActiveRecord::Rollback if rows.sum(&:qty) < count
            remaining = count
            rows.each do |row|
              break if remaining <= 0
              take = [row.qty, remaining].min
              remaining -= take
              row.qty -= take
              row.qty.zero? ? row.destroy! : row.save!
            end
            count
          end
        end
        to_char(ps.char_id, t: "inventory_dirty")
        taken || 0
      end
    end
  end
end
