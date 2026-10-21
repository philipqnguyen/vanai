require_relative 'dungeon_navigation'

module Vanai
  class ZoneState
    TICK = 0.25
    AGGRO_RANGE = 12.0
    # A monster strikes from its own edge (MonsterState#edge_dist_to): 2.0
    # keeps the median monster (radius 0.6) striking from where centre-to-
    # centre 2.6 did, and stays inside the player's MELEE_RANGE, so a monster
    # that has closed on you is always within your swing.
    MOB_ATTACK_RANGE = 2.0
    # One arc is ~0.75s; anything faster than this is a client repeating itself.
    JUMP_COOLDOWN = 0.6
    # A pos frame carries only the rows that changed (pos_row); every this
    # many ticks (2 s) it carries every row, which bounds how long a client
    # that lost a frame holds a stale one.
    KEYFRAME = 8
    # Seconds between a player's periodic position saves.
    SAVE_EVERY = 15

    attr_reader :key, :definition, :players, :monsters, :events, :navigation

    def initialize(key)
      @key = key
      @definition = Data.zones.fetch(key)
      @navigation = DungeonNavigation.new(@definition['layout']) if @definition['kind'] == 'dungeon' && @definition['layout']
      @players = {}
      @monsters = {}
      @events = []
      @self_dirty = {}
      @jumps = []
      @tick_count = 0
      # each entity's last pos row and what came of it (pos_row); the next
      # tick to send every row; and the world clock of the last tick, which a
      # resting entity's row is restamped with when it moves again
      @pos_memo = {}
      @next_keyframe = 0
      @last_s = nil
      @next_mid = 0
      # a boss's mid => the mids of the adds it called, and when its next
      # Silence falls: both are per fight, so a reset or a respawn clears them
      @adds = {}
      @hushfall = {}
      spawn_camps!
    end

    def line_of_sight?(x,z,gx,gz) = !@navigation || @navigation.line?(x,z,gx,gz,0.05)

    # How close to the floor's edge a player may stand, for the server. The
    # client's walls stand 0.85 m in from a cell edge (dungeon-kit shell.ts,
    # outdoor.ts) and its body is 0.45 m (scene.ts resolveCollision), so an
    # honest player is 1.3 m from it; a machinery plinth is the cell itself,
    # 0.45 m. 0.3 here (0.4 along a line, line? adds 0.1) refuses no step the
    # client can take, and every wall is still a wall.
    STEP_MARGIN = 0.3

    # A player's step from (x0, z0) to (x1, z1): anywhere outside a dungeon.
    # In one, it must end on the floor and get there along it -- straight, or,
    # when the server walks a clamped player across a bend the client went
    # round, by a floor route not much longer than the step. A player
    # the world finds off the floor (an old save) may step back onto it.
    def walkable_step?(x0, z0, x1, z1)
      return true unless @navigation
      return false unless @navigation.clear?(x1, z1, STEP_MARGIN)
      return true unless @navigation.clear?(x0, z0, STEP_MARGIN)
      return true if @navigation.line?(x0, z0, x1, z1, STEP_MARGIN - 0.1)
      floor_route?(x0, z0, x1, z1)
    end

    # Breadth-first over floor cells, no further than the step's own length
    # in cells and three more (where in its cell each end stands, and the
    # corner a bend costs on a 4-way grid): every chord of a simulated honest
    # walk in all eleven dungeons fits, a wall between rooms with no door
    # beside it does not.
    def floor_route?(x0, z0, x1, z1)
      cell = @definition['layout']['cell'].to_f
      from, to = @navigation.cell(x0, z0), @navigation.cell(x1, z1)
      limit = (Math.hypot(x1 - x0, z1 - z0) / cell).ceil + 3
      seen = { from => 0 }
      queue = [from]
      until queue.empty?
        here = queue.shift
        return true if here == to
        next if seen[here] >= limit
        [[1, 0], [-1, 0], [0, 1], [0, -1]].each do |dx, dz|
          nxt = [here[0] + dx, here[1] + dz]
          next if seen.key?(nxt) || !@navigation.clear?(nxt[0] * cell, nxt[1] * cell, 0)
          seen[nxt] = seen[here] + 1
          queue << nxt
        end
      end
      false
    end

    def safe? = !!@definition["safe"]
    def size = @definition["size"].to_f

    def spawn_camps!
      (@definition["camps"] || []).each do |camp|
        camp["count"].times { spawn_monster(camp) }
      end
    end

    def spawn_monster(camp)
      @next_mid += 1
      mid = "m#{@key}_#{@next_mid}"
      lvl = Combat.rng.rand(camp["min_lvl"]..camp["max_lvl"])
      ang = Combat.rng.rand * Math::PI * 2
      r = Combat.rng.rand * camp["radius"]
      x = (camp["x"] + Math.cos(ang) * r).clamp(-size / 2 + 5, size / 2 - 5)
      z = (camp["z"] + Math.sin(ang) * r).clamp(-size / 2 + 5, size / 2 - 5)
      m = MonsterState.new(mid, camp["monster"], lvl, x, z, camp)
      @monsters[mid] = m
      m
    end

    def add_player(ps)
      @players[ps.id] = ps
      World.broadcast_zone(@key, { t: "player_join", player: ps.public_payload })
      # every row on the next frame: the newcomer's snapshot is the whole
      # zone, and a rejoin after a dropped line may have missed rows
      @next_keyframe = @tick_count
    end

    def remove_player(pid)
      ps = @players.delete(pid)
      return unless ps
      @monsters.each_value { |m| m.enmity.delete(pid) }
      World.broadcast_zone(@key, { t: "player_leave", id: pid })
      ps
    end

    def push_event(ev)
      @events << ev
    end

    def mark_self_dirty(p)
      @self_dirty[p.char_id] = p
    end

    def broadcast_system(msg)
      World.broadcast_zone(@key, { t: "chat", channel: "system", msg: msg })
    end

    # crystal attunement is per character: the ones this character has touched
    def snapshot_payload(ps)
      lights = (@definition["milestones"] || []).to_h { |w| [w["id"], ps.milestone_lit?(w)] }
      {
        t: "snapshot", zone: @key,
        players: @players.values.map(&:public_payload),
        monsters: @monsters.values.select(&:alive?).map(&:public_payload),
        milestones: lights
      }
    end

    # ---- main tick ----

    def tick(t)
      @tick_count += 1
      tick_players(t)
      tick_monsters(t)
      flush(t)
    end

    def tick_players(t)
      due = nil
      @players.each_value do |p|
        # buff expiry + periodic buff effects
        p.buffs.reject! { |b| t > b[:ends_at] }
        p.buffs.each do |b|
          next unless %w[hot mp_regen poison].include?(b[:kind].to_s)
          b[:next_tick] ||= t + 3
          next if t < b[:next_tick]
          b[:next_tick] = t + 3
          if b[:kind].to_s == "hot" && p.alive?
            Combat.apply_heal(self, p, p, b[:power], b[:name])
          elsif b[:kind].to_s == "mp_regen" && p.alive?
            p.mp = [p.mp + b[:power], p.max_mp].min
            mark_self_dirty(p)
          elsif b[:kind].to_s == "poison" && p.alive?
            push_event(k: "dot", tgt: p.id, dmg: b[:power])
            Combat.damage_player(self, p, b[:power])
          end
        end

        # chain decay
        p.chain_count = 0 if p.chain_count > 0 && t - p.chain_at > 30

        # cast completion
        if p.casting && t >= p.casting[:ends_at]
          Combat.finish_cast(self, p)
        end

        # auto-attack
        if p.engaged && p.alive? && !p.casting
          m = @monsters[p.target_mid]
          if m&.alive?
            if m.edge_dist_to(p.x, p.z) <= Combat::MELEE_RANGE
              if t >= p.atk_ready_at
                p.atk_ready_at = t + p.sheet["delay"]
                Combat.player_swing(self, p, m)
                mark_self_dirty(p)
              end
            end
          else
            p.engaged = false
            p.target_mid = nil
          end
        end

        # regen cadence (every 3s)
        if t - p.last_regen_at >= 3.0
          p.last_regen_at = t
          if p.alive?
            in_combat = @monsters.any? { |_, m| m.alive? && m.enmity[p.id].to_i > 0 }
            if p.resting && !in_combat
              p.hp = [p.hp + 4 + (p.level * 0.8).round, p.max_hp].min
              p.mp = [p.mp + 3 + (p.level * 0.6).round, p.max_mp].min
              mark_self_dirty(p)
            elsif !in_combat && (p.hp < p.max_hp || p.mp < p.max_mp)
              p.hp = [p.hp + (p.max_hp * 0.02).round + 1, p.max_hp].min
              p.mp = [p.mp + (p.max_mp * 0.01).round + 1, p.max_mp].min
              mark_self_dirty(p)
            end
          end
        end

        World.cutscene_expire(self, p, t) if p.cutscene

        # periodic position persistence: the first save after a join comes
        # at once, as it always has; from it each character keeps a phase of
        # their own, or everyone who joined in one tick (a restart's
        # reconnects) would save in one tick every 15 s for as long as they
        # stayed.
        if t - p.last_save_at > SAVE_EVERY
          p.last_save_at = p.last_save_at.zero? ? t - save_phase(p) : t
          (due ||= []) << p
        end
      end
      persist_positions(due) if due
    end

    # Where in the 15 s a character's saves fall, from their id alone (Combat's
    # rng is the fights', and tests seed it): consecutive ids, as one storm's
    # characters mostly are, land on different ticks.
    def save_phase(p) = (p.char_id.to_i % (SAVE_EVERY / TICK).to_i) * TICK

    # The saves due this tick, copied as they stand at the end of
    # tick_players (nothing in it moves anyone, and a fall or a Raise in it has
    # already written dead_at): World.positions writes every zone's in one
    # statement, off this thread once the world's own is running
    # (PositionWriter).
    def persist_positions(due)
      World.positions.save(due.map { |p| [p.char_id, @key, p.x, p.z, p.heading, p.dead] })
    end

    def tick_monsters(t)
      # Who an aggressive monster may pick, taken once a tick rather than once
      # a monster: nothing in this loop adds or removes a player, and the
      # order (find takes the first) is @players' own. In a zone nobody is in
      # there is no one to pick, so the scan is skipped.
      candidates = @players.values
      # over a copy: a boss calls its adds, and a fallen add leaves, mid-walk
      @monsters.values.each do |m|
        case m.state
        when :dead
          # an add has no camp to come back to: it is gone once it falls
          if !m.camp
            @monsters.delete(m.mid)
          elsif m.respawn_at && t >= m.respawn_at
            respawn(m)
          end
        when :idle
          next if safe?
          # a monster sung asleep before it was ever pulled stays where it lies
          next if t < m.sleep_until
          # aggressive scan
          if m.definition["aggressive"] && !candidates.empty?
            victim = candidates.find do |p|
              # a player watching a cutscene is never picked: they cannot answer
              p.alive? && !p.cutscene && p.level < m.level + 8 && m.dist_to(p.x, p.z) < AGGRO_RANGE && line_of_sight?(m.x,m.z,p.x,p.z)
            end
            if victim
              Combat.aggro!(self, m, victim)
              next
            end
          end
          # wander
          if t >= m.wander_at
            m.wander_at = t + 4 + Combat.rng.rand * 5
            if m.camp
              ang = Combat.rng.rand * Math::PI * 2
              r = Combat.rng.rand * m.camp["radius"]
              m.move_goal = [m.camp["x"] + Math.cos(ang) * r, m.camp["z"] + Math.sin(ang) * r]
            end
          end
          step_towards(m, TICK, 0.45) if m.move_goal
        when :aggro
          next if t < m.sleep_until || t < m.stun_until
          # retarget by enmity
          top = m.top_enmity
          target = top && @players[top]
          unless target&.alive?
            m.enmity.delete(top) if top
            if m.enmity.empty?
              reset_monster(m)
              next
            else
              next
            end
          end
          m.target_pid = target.id

          # leash
          leash = (m.camp ? m.camp["radius"] * 2.5 + 40 : 80)
          if m.dist_to(m.spawn_x, m.spawn_z) > leash
            reset_monster(m)
            next
          end

          # boss mechanics
          boss_tick(m, t) if m.definition["boss"]

          # telegraph resolution
          if m.telegraph && t >= m.telegraph[:at]
            resolve_telegraph(m, t)
            next
          end

          # casting resolution (regular casters)
          if m.casting
            if t >= m.casting[:ends_at]
              c = m.casting
              m.casting = nil
              victim = @players[c[:target]]
              if victim&.alive? && m.dist_to(victim.x, victim.z) < 18 && line_of_sight?(m.x,m.z,victim.x,victim.z)
                dmg = [((m.sheet["dmg"] * 1.5 - victim.sheet["def"] * 0.3) * Combat.variance).round, 1].max
                dmg = [(dmg * (1.0 - [victim.buff_power("buff_def"), 75].min / 100.0)).round, 1].max
                push_event(k: "spell", src: m.mid, tgt: victim.id, dmg: dmg, name: "Writ of Compliance")
                Combat.damage_player(self, victim, dmg)
                Combat.inflict_ailment(self, m, victim)
              end
            end
            next
          end

          dist = m.edge_dist_to(target.x, target.z)
          if dist > MOB_ATTACK_RANGE || !line_of_sight?(m.x,m.z,target.x,target.z)
            m.move_goal = [target.x, target.z]
            step_towards(m, TICK, 1.0)
          elsif t >= m.atk_ready_at
            m.atk_ready_at = t + m.sheet["delay"]
            if m.definition["caster"] && (m.cast_cycle += 1) % 3 == 0
              m.casting = { ends_at: t + 1.6, target: target.id }
              push_event(k: "mcast", src: m.mid, name: "Writ of Compliance", ms: 1600)
              push_event(k: "cast_start", src: m.mid, name: "Writ of Compliance", ms: 1600)
            else
              Combat.monster_swing(self, m, target)
            end
          end
        end
      end
    end

    def boss_tick(m, t)
      # adds at 66% / 33% — each dungeon's boss calls its own rank-and-file
      [[66, 0.66], [33, 0.33]].each do |label, frac|
        next if m.adds_done[label]
        if m.hp < m.max_hp * frac
          add_key = (@definition["camps"] || []).map { |c| c["monster"] }.find do |k|
            d = Data.monsters[k]
            d && !d["boss"] && !d["miniboss"] && !d["notorious"]
          end || "barrow_wight"
          add_lvl = [m.level - 2, 1].max
          2.times do
            add = spawn_monster({ "monster" => add_key, "min_lvl" => add_lvl, "max_lvl" => add_lvl,
                                  "x" => m.x, "z" => m.z, "radius" => 4, "count" => 1, "respawn" => 99999 })
            add.camp = nil
            add.state = :aggro
            add.enmity.merge!(m.enmity)
            (@adds[m.mid] ||= []) << add.mid
            World.broadcast_zone(@key, { t: "monster_spawn", monster: add.public_payload })
          end
          m.adds_done[label] = true
          broadcast_system("#{m.name} calls the household to its side!")
        end
      end
      # the Silence: a telegraphed burst every 25s, broken by a skillchain
      @hushfall[m.mid] ||= t + 12
      if t >= @hushfall[m.mid] && !m.telegraph
        @hushfall[m.mid] = t + 25
        m.telegraph = { at: t + 3.2, name: "The Silence" }
        push_event(k: "boss_telegraph", tgt: m.mid, name: "The Silence", ms: 3200)
        broadcast_system("#{m.name} draws in the silence... (Break it with a skillchain!)")
      end
    end

    def resolve_telegraph(m, t)
      m.telegraph = nil
      @players.each_value do |p|
        next unless p.alive? && m.dist_to(p.x, p.z) < 9 && line_of_sight?(m.x,m.z,p.x,p.z)
        dmg = [((m.sheet["dmg"] * 2.4 - p.sheet["def"] * 0.3) * Combat.variance).round, 1].max
        dmg = [(dmg * (1.0 - [p.buff_power("buff_def"), 75].min / 100.0)).round, 1].max
        push_event(k: "spell", src: m.mid, tgt: p.id, dmg: dmg, name: "The Silence")
        Combat.damage_player(self, p, dmg)
      end
    end

    def reset_monster(m)
      # an add whose fight is over goes home with its household: it has no
      # camp to stand in
      return dismiss(m) unless m.camp
      m.state = :idle
      m.target_pid = nil
      m.enmity.clear
      m.hp = m.max_hp
      m.casting = nil
      m.telegraph = nil
      m.move_goal = [m.spawn_x, m.spawn_z]
      clear_fight(m)
    end

    # What one fight leaves on a monster, cleared when it resets or comes
    # back: the next party pulls a boss with its 12 s of grace before the
    # Silence and its adds still to call.
    def clear_fight(m)
      m.adds_done = {}
      m.sleep_until = 0.0
      m.stun_until = 0.0
      m.cast_cycle = 0
      @hushfall.delete(m.mid)
      dismiss_adds(m)
    end

    # A boss's living adds leave with it, when it falls or resets.
    def dismiss_adds(boss)
      (@adds.delete(boss.mid) || []).each do |mid|
        add = @monsters[mid]
        dismiss(add) if add&.alive?
      end
    end

    # Out of the zone at once; the client drops a monster on its "mdie".
    def dismiss(m)
      m.state = :dead
      m.enmity.clear
      @monsters.delete(m.mid)
      push_event(k: "mdie", tgt: m.mid)
    end

    def respawn(m)
      camp = m.camp
      ang = Combat.rng.rand * Math::PI * 2
      r = Combat.rng.rand * camp["radius"]
      m.x = camp["x"] + Math.cos(ang) * r
      m.z = camp["z"] + Math.sin(ang) * r
      m.spawn_x = m.x
      m.spawn_z = m.z
      m.level = Combat.rng.rand(camp["min_lvl"]..camp["max_lvl"])
      m.sheet = Stats.monster_sheet(m.key, m.level)
      m.max_hp = m.sheet["hp"]
      m.hp = m.max_hp
      m.state = :idle
      m.enmity.clear
      clear_fight(m)
      World.broadcast_zone(@key, { t: "monster_spawn", monster: m.public_payload })
    end

    def step_towards(m, dt, speed_mult)
      gx, gz = m.move_goal
      if @navigation
        point = @navigation.waypoint(m.x,m.z,gx,gz)
        return unless point
        gx,gz = point
      end
      dx = gx - m.x
      dz = gz - m.z
      dist = Math.hypot(dx, dz)
      if dist < 0.4
        m.move_goal = nil if !@navigation || Math.hypot(m.move_goal[0]-m.x,m.move_goal[1]-m.z) < 0.4
        return
      end
      spd = m.definition["move_speed"] * speed_mult * dt
      spd = [spd,dist].min if @navigation
      m.x += dx / dist * spd
      m.z += dz / dist * spd
      m.instance_variable_set(:@moved, true)
    end

    # Records a takeoff for the next position broadcast. The instant matters:
    # clients play the arc against the world clock, so the jump lands on the
    # same timeline as the movement it belongs to.
    def note_jump(ps, t)
      return if ps.jumped_at && t - ps.jumped_at < JUMP_COOLDOWN
      ps.jumped_at = t
      @jumps << [ps.id, t.round(3)]
    end

    def flush(t)
      unless @events.empty?
        World.broadcast_zone(@key, { t: "combat", ev: @events })
        @events = []
      end
      # `s` is the world clock this snapshot describes. The client plays
      # snapshots back against server time, so network jitter cannot stretch
      # or reverse the motion between two of them.
      s = t.round(3)
      if @players.empty?
        # nobody here to be shown anything: no rows are built, and the next
        # arrival is sent the whole zone (its snapshot, then a keyframe)
        @pos_memo = {} unless @pos_memo.empty?
      else
        broadcast_positions(s)
      end
      @jumps = []
      @last_s = s
      @self_dirty.each_value { |p| World.to_char(p.char_id, p.self_payload) }
      @self_dirty = {}
    end

    # Positions at 4 Hz, as deltas: a row goes out when it changed since the
    # tick before, and once more the tick after it stops changing, so the
    # client's last two samples of a thing that has come to rest are the same
    # spot and interp.ts coasts it nowhere. A tick where nothing changed and
    # nobody jumped sends no frame at all: every Track holds its last sample
    # (interp.ts), and no client reads a missing row as a departure (that is
    # player_leave and mdie). Every KEYFRAME ticks, and on the frame after a
    # join, every row goes out.
    def broadcast_positions(s)
      keyframe = @tick_count >= @next_keyframe
      @next_keyframe = @tick_count + KEYFRAME if keyframe
      ppos = []
      pback = []
      @players.each_value do |p|
        pos_row([p.id, p.x.round(2), p.z.round(2), p.heading.round(2), p.anim], 4, keyframe, ppos, pback)
      end
      mpos = []
      mback = []
      rows = @players.size
      @monsters.each_value do |m|
        next unless m.alive?
        rows += 1
        pos_row([m.mid, m.x.round(2), m.z.round(2), (100.0 * m.hp / m.max_hp).round, m.state.to_s, m.target_pid],
                2, keyframe, mpos, mback)
      end
      # an entity gone from the rows (fallen, left) is forgotten: if it comes
      # back (a respawn) it starts again, with no resting row to restamp
      @pos_memo.delete_if { |_, e| e[3] != @tick_count } if @pos_memo.size > rows
      return if !keyframe && ppos.empty? && mpos.empty? && @jumps.empty?
      payload = { t: "pos", s: s, p: ppos, m: mpos }
      # rows that rested past the last tick and move on this one, as they
      # stood at the last tick: the client pushes them first, so its Track
      # plays the start of the move over one tick from where the entity
      # stood, not across the whole rest from the last sample it had
      payload[:r] = { s: @last_s, p: pback, m: mback } unless pback.empty? && mback.empty?
      # takeoffs since the last broadcast, each stamped with when it happened
      payload[:j] = @jumps unless @jumps.empty?
      World.broadcast_zone(@key, payload)
    end

    # One entity's row this tick, into `out` if it goes. The memo holds
    # [row, changed, sent, seen], updated in place: the row, whether it
    # differed from the tick before's, the tick it last went out and the tick
    # it was last in the rows. `pose` is how many fields after the id are
    # where it stands (players: x, z, heading, anim; monsters: x, z): only a
    # move needs its resting row restamped into `back`.
    def pos_row(row, pose, keyframe, out, back)
      was = @pos_memo[row[0]]
      unless was
        @pos_memo[row[0]] = [row, false, @tick_count, @tick_count]
        out << row
        return
      end
      changed = row != was[0]
      if keyframe || changed || was[1]
        if changed && was[2] < @tick_count - 1 && (1..pose).any? { |i| row[i] != was[0][i] }
          back << was[0]
        end
        out << row
        was[2] = @tick_count
      end
      was[0] = row
      was[1] = changed
      was[3] = @tick_count
    end
  end
end
