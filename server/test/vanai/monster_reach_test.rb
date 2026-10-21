require 'minitest/autorun'
require 'ostruct'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/entities'
require_relative '../../lib/vanai/combat'
require_relative '../../lib/vanai/zone_state'

# Reach is measured to a monster's edge (MonsterState#edge_dist_to, its
# monsters.json radius_m from the bestiary's sizes): a player's auto-attack,
# weapon skills and spells, and a monster's own swing. A 4.15 m-radius crab is
# fought at its legs, not from inside it; a hare must be closed on. The
# client's hotbar_state.ts mirrors the numbers (hotbar_state.test.mjs).
# No database: a bare zone stub, as the other vanai tests do.
class MonsterReachTest < Minitest::Test
  Zone = Struct.new(:monsters) do
    def line_of_sight?(*) = true
  end

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
  end

  def mob(key, x = 0.0) = Vanai::MonsterState.new("m1", key, 10, x, 0.0)

  def test_every_monster_has_a_footprint
    Vanai::Data.monsters.each_key { |k| assert_operator mob(k).radius, :>=, 0.1, k }
  end

  def test_edge_distance
    crab = mob("the_pale_lurker")
    assert_in_delta 4.15, crab.radius, 1e-9
    assert_in_delta 0.85, crab.edge_dist_to(5.0, 0.0), 1e-9
    assert_equal 0.0, crab.edge_dist_to(1.0, 0.0)
  end

  def test_weapon_skill_reaches_a_big_monster_at_its_edge_and_not_a_small_one
    ab = Vanai::Data.abilities.fetch("fast_blade")
    p = OpenStruct.new(x: 7.0, z: 0.0)
    assert_kind_of Vanai::MonsterState, Vanai::Combat.resolve_target(Zone.new({ "m1" => mob("the_pale_lurker") }), p, ab, "m1")
    assert_equal "Too far away.", Vanai::Combat.resolve_target(Zone.new({ "m1" => mob("meadow_hare") }), p, ab, "m1")
    near = OpenStruct.new(x: Vanai::Combat::MELEE_RANGE + 0.6 + 0.3 - 0.01, z: 0.0)
    assert_kind_of Vanai::MonsterState, Vanai::Combat.resolve_target(Zone.new({ "m1" => mob("meadow_hare") }), near, ab, "m1")
  end

  def test_the_median_monster_is_reached_where_it_was
    # centre-to-centre 3.4 (player) and 2.6 (monster) before the sizes
    assert_in_delta 3.4, Vanai::Combat::MELEE_RANGE + 0.6, 1e-9
    assert_in_delta 2.6, Vanai::ZoneState::MOB_ATTACK_RANGE + 0.6, 1e-9
    # a monster that has closed on you is always inside your swing
    assert_operator Vanai::ZoneState::MOB_ATTACK_RANGE, :<, Vanai::Combat::MELEE_RANGE
  end
end
