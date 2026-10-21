require 'minitest/autorun'
require 'ostruct'
require_relative '../../lib/vanai/data'
require_relative '../../lib/vanai/quests'
require_relative '../../lib/vanai/world'

class QuestProgress
  ACTIVE = 1 unless const_defined?(:ACTIVE)
  COMPLETE = 2 unless const_defined?(:COMPLETE)
end

class SiteInteractionsTest < Minitest::Test
  Player = Struct.new(:x, :z, :site_levels, :quests, :dead, :heading, :anim, :resting, :cutscene) do
    def alive? = true
    def char_id = 1
    def level = 1
    def dist_to(x, z) = Math.hypot(self.x-x, self.z-z)
  end

  def setup
    Vanai::Data.load!(File.expand_path('../..', __dir__))
    @definition = Vanai::Data.zones.fetch('moonmere')
    @site = @definition['sites']['returns_archive']
    @shelf = @definition['interactables'].find { |i| i['id']=='mm_shelf_moon' }
    @player = Player.new(@shelf['x'], @shelf['z']+1.6, {}, {'mm1'=>{'status'=>1}}, false)
    @zone = OpenStruct.new(definition:@definition,size:800)
    @credited=[];@messages=[]
  end

  def replace_method(object, name, implementation)
    original=object.method(name)
    object.define_singleton_method(name, &implementation)
    yield
  ensure
    object.define_singleton_method(name, original)
  end

  def interact(id)
    pair=[@zone,@player];messages=@messages;credited=@credited
    replace_method(Vanai::World, :find_player, ->(*){pair}) do
      replace_method(Vanai::World, :to_char, ->(*args,**msg){messages<<(msg.empty? ? args.last : msg)}) do
        replace_method(Vanai::Quests, :on_interact, ->(zone,player,object_id){credited<<object_id}) do
          Vanai::World.interact(1,id)
        end
      end
    end
  end

  def talk(id)
    pair=[@zone,@player];messages=@messages
    replace_method(Vanai::World, :find_player, ->(*){pair}) do
      replace_method(Vanai::World, :to_char, ->(*args,**msg){messages<<(msg.empty? ? args.last : msg)}) do
        Vanai::World.talk(1,id)
      end
    end
  end

  def test_indoor_npcs_answer_at_their_rendered_positions
    %w[archivist_junn_mm provost_selk].each do |id|
      npc=@definition['npcs'].find { |n| n['id']==id }
      @player.x=npc['x']+1;@player.z=npc['z'];@player.site_levels={}
      talk(id)
      assert_equal 'npc_dialog',@messages.last[:t]
      assert_equal id,@messages.last[:npc]
    end
  end

  def test_indoor_npc_rejects_the_same_position_on_another_floor
    npc=@definition['npcs'].find { |n| n['id']=='archivist_junn_mm' }
    @player.x=npc['x']+1;@player.z=npc['z'];@player.site_levels={'returns_archive'=>@site['floors'][1]}
    talk(npc['id'])
    assert_equal 'Meet them on the same floor.',@messages.last[:msg]
  end

  def test_indoor_npc_still_rejects_remote_conversation
    npc=@definition['npcs'].find { |n| n['id']=='archivist_junn_mm' }
    @player.x=npc['x']+9;@player.z=npc['z']
    talk(npc['id'])
    assert_equal 'Too far away.',@messages.last[:msg]
  end

  def test_actual_interact_rejects_upper_shelf_from_downstairs
    interact('mm_shelf_moon')
    assert_empty @credited
    assert_equal 'Use the stairs to reach this floor.', @messages.last[:msg]
  end

  def test_actual_interact_credits_lower_shelf_downstairs
    interact('mm_shelf_twomoons')
    assert_equal ['mm_shelf_twomoons'], @credited
  end

  def test_actual_interact_uses_only_server_floor_history
    @player.site_levels={'returns_archive'=>@site['floors'][1]}
    interact('mm_shelf_moon')
    assert_equal ['mm_shelf_moon'], @credited
    @credited.clear
    interact('mm_shelf_twomoons')
    assert_empty @credited
  end

  def test_permit_stamps_reject_out_of_order_without_success_message
    stamp=@definition['interactables'].find { |i| i['id']=='mm_stamp_bursar' }
    @player.x=stamp['x'];@player.z=stamp['z'];@player.quests={'mm4'=>{'status'=>1,'progress'=>0,'credited'=>[]}}
    interact(stamp['id'])
    assert_empty @credited
    assert_equal Vanai::Data.quests['mm4']['progress'].first,@messages.last[:msg]
    @player.quests['mm4']['credited']=['mm_stamp_registry'];@player.quests['mm4']['progress']=1
    interact(stamp['id'])
    assert_equal ['mm_stamp_bursar'],@credited
  end

  def test_real_quest_credit_rejects_wrong_stamp_and_finishes_legacy_prefix
    @player.quests={'mm4'=>{'status'=>1,'progress'=>2}}
    replace_method(Vanai::World, :db, ->(*){}) do
      replace_method(Vanai::Quests, :notify, ->(*){}) do
        Vanai::Quests.on_interact(@zone,@player,'mm_stamp_bursar')
        assert_equal 2,@player.quests['mm4']['progress']
        Vanai::Quests.on_interact(@zone,@player,'mm_stamp_harbourmaster')
        assert_equal 3,@player.quests['mm4']['progress']
        assert_equal %w[mm_stamp_registry mm_stamp_bursar mm_stamp_harbourmaster],@player.quests['mm4']['credited']
      end
    end
  end

  def test_ordered_permits_preserve_legacy_progress_and_allow_repeat_stamps
    @player.quests={'mm4'=>{'status'=>1,'progress'=>2}}
    assert Vanai::Quests.interaction_in_order?(@player,'mm4','mm_stamp_harbourmaster')
    refute Vanai::Quests.interaction_in_order?(@player,'mm4','mm_stamp_bursar')
    @player.quests['mm4']['credited']=['mm_stamp_registry','mm_stamp_bursar']
    assert Vanai::Quests.interaction_in_order?(@player,'mm4','mm_stamp_registry')
  end

  def test_apply_move_updates_server_floor_state_over_stairs
    r=@site['ramps'].first;@player.x=r['x0'];@player.z=r['z0'];pair=[@zone,@player]
    replace_method(Vanai::World, :find_player, ->(*){pair}) do
      1.upto(5) { |i| Vanai::World.apply_move(1,r['x0']+(r['x1']-r['x0'])*i/5,r['z0']+(r['z1']-r['z0'])*i/5,0,'walk') }
    end
    assert_in_delta @site['floors'][1],@player.site_levels['returns_archive'],0.01
  end
  def test_old_explicit_out_of_order_credit_does_not_invent_a_completed_prefix
    @player.quests={'mm4'=>{'status'=>1,'progress'=>1,'credited'=>['mm_stamp_harbourmaster']}}
    refute Vanai::Quests.interaction_in_order?(@player,'mm4','mm_stamp_bursar')
    assert Vanai::Quests.interaction_in_order?(@player,'mm4','mm_stamp_registry')
    replace_method(Vanai::World, :db, ->(*){}) do
      replace_method(Vanai::Quests, :notify, ->(*){}) do
        Vanai::Quests.on_interact(@zone,@player,'mm_stamp_registry')
        assert_equal 2,@player.quests['mm4']['progress']
        assert_equal %w[mm_stamp_harbourmaster mm_stamp_registry],@player.quests['mm4']['credited']
        Vanai::Quests.on_interact(@zone,@player,'mm_stamp_bursar')
        assert_equal 3,@player.quests['mm4']['progress']
      end
    end
  end

  def test_testimonies_reject_wrong_order_then_credit_each_speaker_once
    @player.quests={'inn1'=>{'status'=>1,'progress'=>0,'credited'=>[]}}
    npcs=Vanai::Data.zones.values.flat_map { |z| z['npcs'] || [] }
    targets=Vanai::Data.quests['inn1']['objective']['targets']
    messages=@messages
    replace_method(Vanai::World, :db, ->(*){}) do
      replace_method(Vanai::Quests, :notify, ->(*){}) do
        replace_method(Vanai::World, :to_char, ->(*args){messages<<args.last}) do
          speak=->(id){Vanai::Quests.talk(@zone,@player,npcs.find { |n| n['id']==id })}
          speak.call(targets.last)
          assert_equal 0,@player.quests['inn1']['progress']
          assert_equal Vanai::Data.quests['inn1']['progress'],messages.last[:lines]
          targets.each { |id| 2.times { speak.call(id) } }
          assert_equal 3,@player.quests['inn1']['progress']
          assert_equal targets,@player.quests['inn1']['credited']
        end
      end
    end
  end

  def test_muster_and_ring_rounds_follow_their_spoken_order
    replace_method(Vanai::World, :db, ->(*){}) do
      replace_method(Vanai::Quests, :notify, ->(*){}) do
        %w[cd1 hw4].each do |key|
          @player.quests={key=>{'status'=>1,'progress'=>0,'credited'=>[]}}
          targets=Vanai::Data.quests[key]['objective']['targets']
          Vanai::Quests.on_interact(@zone,@player,targets.last)
          assert_equal 0,@player.quests[key]['progress']
          targets.each { |id| Vanai::Quests.on_interact(@zone,@player,id) }
          assert_equal targets,@player.quests[key]['credited']
        end
      end
    end
  end

  def test_letters_are_readable_during_the_main_story_conversation
    @definition=Vanai::Data.zones['burnedland'];@zone.definition=@definition
    table=@definition['interactables'].find { |i| i['id']=='emmers_table' }
    @player.x=table['x'];@player.z=table['z'];@player.quests={'ash2'=>{'status'=>1,'progress'=>0}}
    interact('emmers_table')
    assert_equal table['idle_msg'],@messages.last[:msg]
    assert_empty @credited
    assert_includes Vanai::Data.quests['ash2']['readables'],'emmers_table'
  end

  def test_heartwood_ground_talk_and_turnin_reject_the_upper_walkway
    @definition=Vanai::Data.zones['heartwood'];@zone.definition=@definition
    @player.x=-74.5218040636;@player.z=-3.3958268473;@player.quests={}
    @player.site_levels={'upper_boughs'=>24}
    talk('innkeeper_tamsin')
    assert_equal 'Meet them on the same floor.',@messages.last[:msg]
    pair=[@zone,@player];messages=@messages;completed=[]
    replace_method(Vanai::World,:find_player,->(*){pair}) do
      replace_method(Vanai::World,:to_char,->(*args,**msg){messages<<(msg.empty? ? args.last : msg)}) do
        replace_method(Vanai::Quests,:complete!,->(*args){completed<<args.last}) do
          Vanai::World.quest_complete(1,'s_heart_5')
          assert_empty completed
          assert_equal 'Meet them on the same floor.',messages.last[:msg]
          @player.site_levels={}
          Vanai::World.quest_complete(1,'s_heart_5')
          assert_equal ['s_heart_5'],completed
        end
      end
    end
    talk('innkeeper_tamsin')
    assert_equal 'npc_dialog',@messages.last[:t]
  end

  def test_wynn_keeps_city_dialogue_when_healing_and_opening_jobs
    @definition=Vanai::Data.zones['heartwood'];@zone.definition=@definition
    npc=@definition['npcs'].find { |n| n['id']=='chantmaster_wynn' }
    @player=OpenStruct.new(x:npc['x'],z:npc['z'],site_levels:{},hp:1,mp:1,max_hp:100,max_mp:50)
    def @player.alive? = true
    def @player.dist_to(x,z) = Math.hypot(self.x-x,self.z-z)
    def @zone.mark_self_dirty(*) = nil
    talk(npc['id'])
    assert_equal npc['dialog'],@messages.last[:lines].take(npc['dialog'].length)
    assert @messages.last[:sanctuary]
    assert_equal [100,50],[@player.hp,@player.mp]
  end

end
