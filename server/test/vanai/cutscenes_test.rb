require 'minitest/autorun'
require 'ostruct'
require 'set'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/quests'
require_relative '../../lib/vanai/entities'
require_relative '../../lib/vanai/cutscenes'
require_relative '../../lib/vanai/world'

class QuestProgress
  ACTIVE = 1 unless const_defined?(:ACTIVE)
  COMPLETE = 2 unless const_defined?(:COMPLETE)
end

# Cutscenes (Philip's rulings 2026-10-11): a scene plays for the current
# player and stars them; when a party member sets off a party scene, every
# member here gets their own copy. While one plays the watcher stands still
# for everyone else under a film icon, on the party bar too, and nothing
# picks a fight with them. Walks the real shared/data with the world's
# persistence and messaging stubbed.
class CutscenesTest < Minitest::Test
  Player = Struct.new(:char_id, :name, :zone, :party_id, :cutscene, :cutscene_at, :cutscenes_seen, :cutscenes_due,
                      :engaged, :target_mid, :resting, :anim, :dead, :x, :z, :heading, :site_levels, keyword_init: true) do
    def alive? = !dead
    def id = "p#{char_id}"
    def public_payload = { id: id, name: name, cs: !cutscene.nil? }
    def dist_to(px, pz) = Math.hypot(x - px, z - pz)
  end

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
    @zone = OpenStruct.new(key: 'caerdun', monsters: {}, definition: Vanai::Data.zones['caerdun'], size: 700.0)
    @players = {}
    @sent = []
    @broadcasts = []
    @synced = []
    @rows = []
    @saved = %i[@online @parties].to_h { |iv| [iv, Vanai::World.instance_variable_get(iv)] }
    Vanai::World.instance_variable_set(:@online, {})
    Vanai::World.instance_variable_set(:@parties, {})
  end

  def teardown
    @saved.each { |iv, v| Vanai::World.instance_variable_set(iv, v) }
  end

  def player(id, zone: 'caerdun', due: [], seen: [])
    @players[id] = Player.new(char_id: id, name: "P#{id}", zone: zone, cutscenes_seen: seen.to_set, cutscenes_due: due.to_set,
                              engaged: false, resting: false, anim: 'run', dead: false, x: -208.0, z: -10.0, heading: 0.0, site_levels: {})
  end

  def party_of(*ids)
    party = Vanai::Party.new('pt1', ids.first)
    party.member_ids = ids
    ids.each { |id| @players[id].party_id = 'pt1' }
    Vanai::World.instance_variable_get(:@parties)['pt1'] = party
  end

  def replace_method(object, name, implementation)
    original = object.method(name)
    object.define_singleton_method(name, &implementation)
    yield
  ensure
    object.define_singleton_method(name, original)
  end

  def world(&block)
    players, zone, sent, casts, synced, rows = @players, @zone, @sent, @broadcasts, @synced, @rows
    stubs = {
      find_player: ->(cid) { players[cid] && [zone, players[cid]] },
      to_char: ->(cid, payload = nil, **kw) { sent << [cid, payload || kw] },
      broadcast_zone: ->(key, payload) { casts << [key, payload] },
      sync_party: ->(pid) { synced << pid },
      # the Discovery rows a block would write, without a database
      db: ->(&blk) { rows << blk; nil }
    }
    stubs.reverse_each.reduce(block) { |inner, (name, impl)| -> { replace_method(Vanai::World, name, impl, &inner) } }.call
  end

  def to(id) = @sent.select { |cid, _| cid == id }.map(&:last)

  def with_scene(id, scene)
    Vanai::Data.cutscenes[id] = scene
    yield
  ensure
    Vanai::Data.cutscenes.delete(id)
  end

  # ---------- the data ----------

  def test_every_scene_passes_the_servers_rules
    assert_empty Vanai::Data.cutscene_problems
  end

  def test_openings_cover_the_three_cities
    %w[caerdun heartwood moonmere].each do |city|
      id = Vanai::Cutscenes.opening_for(city)
      refute_nil id, city
      assert_equal city, Vanai::Data.cutscenes[id]['zone']
      assert Vanai::Data.cutscene_duration(id) > 20, "#{id} is a scene, not a flicker"
    end
  end

  def test_there_is_one_intro_told_in_chapters
    intro = Vanai::Cutscenes.intro_id
    refute_nil intro
    assert Vanai::Data.cutscenes[intro]['chapters'].size >= 5
    # it plays before the world is joined: no zone owes it on a join
    p = player(1, due: [intro])
    assert_empty Vanai::Cutscenes.due_here(p)
    assert_match(/elsewhere/, Vanai::Cutscenes.refusal(p, intro, false))
  end

  def test_the_hold_outlasts_the_scene
    id = Vanai::Cutscenes.opening_for('caerdun')
    assert_operator Vanai::Cutscenes.hold_limit(id), :>, Vanai::Data.cutscene_duration(id)
  end

  def test_discovery_rows_split_into_seen_and_due
    rows = %w[scene_seen_a scene_due_b zone_caerdun milestone_crystal_caerdun scene_due_c].map { |k| OpenStruct.new(landmark_key: k) }
    seen, due = Vanai::Cutscenes.load_state(rows)
    assert_equal Set['a'], seen
    assert_equal Set['b', 'c'], due
  end

  # ---------- who is shown what ----------

  def test_a_scene_owed_plays_on_join_only_in_its_own_zone
    opening = Vanai::Cutscenes.opening_for('caerdun')
    here = player(1, due: [opening])
    away = player(2, zone: 'heartwood', due: [opening])
    assert_equal [opening], Vanai::Cutscenes.due_here(here).to_a
    assert_empty Vanai::Cutscenes.due_here(away)
  end

  def test_only_a_scene_owed_or_already_seen_may_start
    opening = Vanai::Cutscenes.opening_for('caerdun')
    stranger = player(1)
    assert_match(/not yours/, Vanai::Cutscenes.refusal(stranger, opening, false))
    assert_nil Vanai::Cutscenes.refusal(player(2, due: [opening]), opening, false)
    assert_nil Vanai::Cutscenes.refusal(player(3, seen: [opening]), opening, false), 'a replay of a scene seen'
    assert_match(/elsewhere/, Vanai::Cutscenes.refusal(player(4, zone: 'heartwood', seen: [opening]), opening, false))
    assert_match(/fight/, Vanai::Cutscenes.refusal(player(5, due: [opening]), opening, true))
    fallen = player(6, due: [opening])
    fallen.dead = true
    assert_match(/fallen/, Vanai::Cutscenes.refusal(fallen, opening, false))
    assert_match(/No such/, Vanai::Cutscenes.refusal(stranger, 'nonsense', false))
  end

  def test_a_party_scene_reaches_every_member_here_each_as_the_subject
    scene = { 'zone' => 'caerdun', 'party' => true, 'trigger' => { 'type' => 'quest_complete', 'quest' => 'cd1' }, 'shots' => [{ 'dur' => 3 }] }
    with_scene('t_party', scene) do
      a, b, c = player(1), player(2), player(3, zone: 'heartwood')
      party_of(1, 2, 3)
      world { Vanai::World.cutscene_trigger(b, 't_party') } # b set it off
      # a and b get it -- a too, though b triggered it -- and c, elsewhere, does not
      assert_equal [{ t: 'cutscene', id: 't_party' }], to(1)
      assert_equal [{ t: 'cutscene', id: 't_party' }], to(2)
      assert_empty to(3)
      # the message names the scene, never whoever set it off: each client
      # casts its own player as the subject
      refute @sent.any? { |_, m| m.key?(:by) || m.key?(:subject) || m.key?(:from) }
      assert a.cutscenes_due.include?('t_party')
      assert b.cutscenes_due.include?('t_party')
      refute c.cutscenes_due.include?('t_party')
    end
  end

  def test_a_solo_scene_reaches_only_its_triggerer_and_a_seen_one_does_not_repeat
    scene = { 'zone' => 'caerdun', 'trigger' => { 'type' => 'quest_accept', 'quest' => 'cd1' }, 'shots' => [{ 'dur' => 3 }] }
    with_scene('t_solo', scene) do
      player(1); player(2, seen: ['t_solo'])
      party_of(1, 2)
      world do
        Vanai::World.cutscene_trigger(@players[1], 't_solo')
        Vanai::World.cutscene_trigger(@players[2], 't_solo')
      end
      assert_equal [{ t: 'cutscene', id: 't_solo' }], to(1)
      assert_empty to(2), 'already seen, and the scene does not repeat'
      assert_equal ['t_solo'], Vanai::Cutscenes.for_quest('quest_accept', 'cd1') & ['t_solo']
    end
  end

  # ---------- while it plays ----------

  def test_begin_stills_the_watcher_and_shows_the_film_icon
    opening = Vanai::Cutscenes.opening_for('caerdun')
    p = player(1, due: [opening])
    player(2)
    party_of(1, 2)
    world { Vanai::World.cutscene_begin(1, opening) }
    assert_equal opening, p.cutscene
    assert_equal 'idle', p.anim
    update = @broadcasts.find { |_, m| m[:t] == 'player_update' }
    assert_equal true, update.last[:player][:cs], 'everyone in the zone sees the icon'
    assert_equal ['pt1'], @synced, 'and the party bar'
    # moving is ignored until it ends
    world { Vanai::World.apply_move(1, 0.0, 0.0, 1.0, 'run') }
    assert_equal [-208.0, -10.0], [p.x, p.z]
  end

  def test_begin_in_a_fight_is_refused_and_may_retry
    opening = Vanai::Cutscenes.opening_for('caerdun')
    p = player(1, due: [opening])
    p.engaged = true
    world { Vanai::World.cutscene_begin(1, opening) }
    assert_nil p.cutscene
    refused = to(1).find { |m| m[:t] == 'cutscene_refused' }
    assert refused[:retry]
  end

  def test_the_party_bar_carries_the_flag
    p = player(1)
    party = Vanai::Party.new('pt1', 1)
    p.cutscene = 'x'
    mem = OpenStruct.new(id: 'p1', name: 'P1', job: 'PLD', level: 1, hp: 1, max_hp: 1, mp: 1, max_mp: 1, tp: 0, dead: false, cutscene: 'x')
    assert_equal true, Vanai::World.member_payload(party, 1, mem)[:cutscene]
    mem.cutscene = nil
    assert_equal false, Vanai::World.member_payload(party, 1, mem)[:cutscene]
  end

  def test_end_marks_it_seen_and_lets_the_watcher_go
    opening = Vanai::Cutscenes.opening_for('caerdun')
    p = player(1, due: [opening])
    world do
      Vanai::World.cutscene_begin(1, opening)
      Vanai::World.cutscene_end(1, 'some_other_scene') # not the one playing: ignored
      assert_equal opening, p.cutscene
      Vanai::World.cutscene_end(1, opening)
    end
    assert_nil p.cutscene
    assert p.cutscenes_seen.include?(opening)
    refute p.cutscenes_due.include?(opening)
    assert_equal 1, @rows.size, 'one write: the due row out, the seen row in'
    assert_equal false, @broadcasts.last.last[:player][:cs]
    world { Vanai::World.apply_move(1, -200.0, -10.0, 1.0, 'run') }
    assert_equal(-200.0, p.x)
  end

  def test_a_client_that_never_ends_is_let_go_after_the_hold
    opening = Vanai::Cutscenes.opening_for('caerdun')
    p = player(1, due: [opening])
    world { Vanai::World.cutscene_begin(1, opening) }
    began = p.cutscene_at
    world { Vanai::World.cutscene_expire(@zone, p, began + Vanai::Data.cutscene_duration(opening)) }
    assert_equal opening, p.cutscene, 'still inside its running time'
    world { Vanai::World.cutscene_expire(@zone, p, began + Vanai::Cutscenes.hold_limit(opening) + 1) }
    assert_nil p.cutscene
    assert p.cutscenes_due.include?(opening), 'still owed: it plays again next login'
  end

  # ---------- the triggers the other scenes use ----------

  def test_triggered_matches_type_zone_and_fields
    with_scene('t_q', { 'zone' => 'caerdun', 'trigger' => { 'type' => 'quest_complete', 'quest' => 'cd1' }, 'shots' => [{ 'dur' => 3 }] }) do
      assert_includes Vanai::Cutscenes.triggered('quest_complete', 'caerdun', quest: 'cd1'), 't_q'
      refute_includes Vanai::Cutscenes.triggered('quest_complete', 'caerdun', quest: 'cd2'), 't_q'
      refute_includes Vanai::Cutscenes.triggered('quest_complete', 'heartwood', quest: 'cd1'), 't_q', 'filmed in Caerdun, so it fires there'
    end
    with_scene('t_any', { 'zone' => '*', 'trigger' => { 'type' => 'attune' }, 'shots' => [{ 'dur' => 3 }] }) do
      assert_includes Vanai::Cutscenes.triggered('attune', 'huntingwood'), 't_any', 'a scene that plays anywhere'
      assert Vanai::Cutscenes.plays_in?(Vanai::Data.cutscenes['t_any'], 'glassworks')
    end
  end

  # Philip, 2026-10-12: no boss reveals; every dungeon reveals itself instead,
  # the first time a character walks in
  def test_every_dungeon_reveals_itself_on_a_first_visit
    Vanai::Data.zones.each do |key, z|
      next unless z['kind'] == 'dungeon'
      assert_equal 1, Vanai::Cutscenes.triggered('zone_first_visit', key).size, key
    end
    refute Vanai::Data.cutscenes.any? { |_, s| s.dig('trigger', 'type') == 'boss' }
  end
end
