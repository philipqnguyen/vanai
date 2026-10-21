ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'action_dispatch/testing/integration'

class FerryIntegrationTest < Minitest::Test
  W = Vanai::World
  F = Vanai::Ferry
  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions].each { |key| W.instance_variable_set("@#{key}", {}) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@trades, {})
    @messages=[];@original_clock=W.method(:ferry_now);@original_send=W.method(:to_char)
    @time=500.0;test=self
    W.define_singleton_method(:ferry_now){test.instance_variable_get(:@time)}
    W.define_singleton_method(:to_char){|id,payload|test.instance_variable_get(:@messages)<<[id,payload]}
    # each move a long walk after the last, so the speed limit never trims
    # the deck routes these tests step along (move_check_test.rb tests that)
    @original_move_now=W.method(:move_now);@move_clock=0.0
    W.define_singleton_method(:move_now){test.instance_variable_set(:@move_clock,test.instance_variable_get(:@move_clock)+60.0)}
    W.initialize_ferry
    @user=User.create!(email:'ferry-test@example.invalid',password:'isolated-test-password')
    @a=passenger('Ferryone','moonmereshores',50)
    @b=passenger('Ferrytwo','moonmereshores',10)
    @c=passenger('Ferrythree','caerdunfields',50)
  end
  def teardown
    W.define_singleton_method(:ferry_now,@original_clock)
    W.define_singleton_method(:to_char,@original_send)
    W.define_singleton_method(:move_now,@original_move_now)
    ActiveRecord::Base.connection.rollback_transaction
  end
  def passenger(name,origin,gold)
    c=Character.provision!(user:@user,name:name,job:'PLD')
    npc=Vanai::Data.zones[origin]['npcs'].find{|n|n['id']==F.port(origin)['npc']}
    c.update!(zone:origin,x:npc['x']+1,z:npc['z'],gold:gold)
    W.join(c.id);c
  end
  def board(c=@a,departure=600) = W.ferry_register(c.id,departure)
  def tick(time)
    @time=time;W.tick_ferry(time)
  end
  def registered?(c) = W.instance_variable_get(:@ferry_registrations).key?(c.id)
  def player(c) = W.find_player(c.id)&.last
  # in steps a run could cover, along the pier, as a client would send them
  def walk_to(c,x,z)
    ps=player(c);n=[(Math.hypot(x-ps.x,z-ps.z)/4).ceil,1].max;x0,z0=ps.x,ps.z
    1.upto(n){|i|W.apply_move(c.id,x0+(x-x0)*i/n,z0+(z-z0)*i/n,0,'run')}
  end
  def messages(c,type) = @messages.select{|id,p|id==c.id&&p[:t]==type}.map(&:last)

  def test_shared_phase_boundaries_and_boats_swap
    assert_equal 'sailing',F.timetable(419.999)[:phase]
    assert_equal 'docked',F.timetable(420)[:phase]
    assert_equal 'docked',F.timetable(599.999)[:phase]
    assert_equal 'sailing',F.timetable(600)[:phase]
    assert_equal 1020,F.timetable(600)[:arrival]
    refute_equal F.voyage('moonmereshores',600)['boat'],F.voyage('caerdunfields',600)['boat']
    assert_equal F.voyage('moonmereshores',600)['boat'],F.voyage('caerdunfields',1200)['boat']
  end
  def test_no_registration_until_arrival_and_stale_confirmation_rejected
    @time=419.99;board;refute registered?(@a)
    @time=420;board;assert registered?(@a)
    W.ferry_cancel(@a.id);@time=600;board;refute registered?(@a)
    assert_equal 50,@a.reload.gold
  end
  def test_simultaneous_departure_both_directions_and_exact_balance
    [@a,@b,@c].each{|c|board(c)}
    assert_equal 'moonmereshores',@a.reload.zone
    tick(600)
    assert_equal 'gulf_to_caerdun',@a.reload.zone
    assert_equal @a.zone,@b.reload.zone
    assert_equal 'gulf_to_moonmere',@c.reload.zone
    assert_equal [40,0,40],[@a.gold,@b.gold,@c.gold]
    assert_equal @a.ferry_voyage,@b.ferry_voyage
    refute registered?(@a)
    [@a,@b,@c].each{|c|W.join(c.id)}
    assert_equal [@a.id,@b.id].sort,W.zone(@a.zone).players.values.map(&:char_id).sort
    assert_equal [@c.id],W.zone(@c.zone).players.values.map(&:char_id)
    @messages.clear;W.chat(@a.id,'say','Same sailing only')
    assert_equal [@a.id,@b.id].sort,@messages.select{|_,p|p[:t]=='chat'}.map(&:first).sort
    tick(1020)
    assert_equal 'caerdunfields',@a.reload.zone
    assert_equal 'moonmereshores',@c.reload.zone
    assert_nil @a.ferry_voyage
    assert_equal [40,0,40],[@a.gold,@b.reload.gold,@c.gold]
  end
  def test_whole_dock_keeps_registration_but_exit_cancels
    board
    walk_to(@a,-190,-239);walk_to(@a,-190,-185) # Far outside NPC range, still on pier.
    assert registered?(@a)
    W.apply_move(@a.id,-183,-185,0,'run') # Beside the narrow pier, in water.
    refute registered?(@a)
    tick(600);assert_equal 50,@a.reload.gold
    assert messages(@a,'system').any?{|m|m[:msg].include?('left the dock')}
  end
  def test_cancel_rejoin_and_duplicate_confirmation_charge_once
    board;W.ferry_cancel(@a.id);board;board;tick(600);tick(600);tick(601)
    assert_equal 40,@a.reload.gold
    assert_equal 1,messages(@a,'zone_change').length
  end
  def test_trade_away_gold_after_registration_uses_database_balance
    board(@b)
    W.execute_trade({a:@b.id,b:@a.id,offers:{@b.id=>{gold:5,items:[]},@a.id=>{gold:0,items:[]}},confirmed:{}})
    assert_equal 5,@b.reload.gold
    player(@b).gold=999 # Explicitly stale cache must not authorize the fare.
    board(@a);tick(600)
    assert_equal 'moonmereshores',@b.reload.zone
    assert_equal 5,@b.gold
    refute registered?(@b)
    assert_equal 'gulf_to_caerdun',@a.reload.zone
    assert_equal 45,@a.gold
    assert messages(@b,'system').any?{|m|m[:msg].include?('need 10 gold')}
  end
  def test_dead_or_combat_at_departure_stays_ashore
    board(@a);board(@b);player(@a).dead=true;player(@b).engaged=true;tick(600)
    assert_equal [50,10],[@a.reload.gold,@b.reload.gold]
    assert_equal 'moonmereshores',@a.zone
    refute registered?(@a);refute registered?(@b)
  end
  def test_disconnect_on_dock_cancels_without_charge
    board;W.leave(@a.id);tick(600);W.join(@a.id)
    assert_equal 'moonmereshores',@a.reload.zone
    assert_equal 50,@a.gold
    refute registered?(@a)
  end
  def test_disconnect_at_sea_and_offline_arrival
    board;tick(600);W.join(@a.id);W.leave(@a.id);tick(1020)
    assert_equal 'caerdunfields',@a.reload.zone
    assert_equal 40,@a.gold
    assert_nil @a.ferry_voyage
    W.join(@a.id);assert_equal 'caerdunfields',W.find_player(@a.id).first.key
  end
  def test_reconnect_during_voyage_keeps_association_and_position
    board;tick(600);W.join(@a.id);W.apply_move(@a.id,3,2,0,'run');W.leave(@a.id)
    @time=700;W.join(@a.id)
    assert_equal [3,2],[player(@a).x,player(@a).z]
    assert_equal 1020,messages(@a,'ferry_status').last[:voyage]['arrival']
    assert_equal 40,@a.reload.gold
  end
  def test_restart_recovers_voyages_and_drops_registrations
    board(@a);tick(600);W.join(@a.id);W.leave(@a.id)
    @time=1100;W.initialize_ferry;W.join(@a.id)
    assert_equal 'caerdunfields',@a.reload.zone
    assert_nil @a.ferry_voyage
    assert_equal 40,@a.gold
    @time=1100;board(@b,1200);assert registered?(@b)
    W.initialize_ferry;refute registered?(@b)
  end
  def test_long_tick_gap_never_charges_missed_journey
    board;tick(1201)
    assert_equal 'moonmereshores',@a.reload.zone
    assert_equal 50,@a.gold
    refute registered?(@a)
  end
  def test_committed_departure_retry_is_idempotent
    v=F.voyage('moonmereshores',600);attrs={zone:v['sea_zone'],x:2,z:-3,ferry_voyage:v}
    2.times{W.ferry_write_transfers(@a.id=>attrs)}
    assert_equal 40,@a.reload.gold
    assert_equal v,@a.ferry_voyage
  end
  def test_removed_portal_ids_cannot_bypass_departure
    W.interact(@a.id,'ms_ferry');W.interact(@c.id,'cf_ferry')
    assert_equal 'moonmereshores',@a.reload.zone
    assert_empty messages(@a,'zone_change')
    assert_equal 'caerdunfields',@c.reload.zone
  end
  def test_ship_movement_is_bounded_authoritatively
    board;tick(600);W.join(@a.id)
    before = [player(@a).x,player(@a).z]
    W.apply_move(@a.id,500,-500,0,'run')
    assert_equal before,[player(@a).x,player(@a).z]
  end
  def test_bow_and_stern_stairs_are_authoritatively_accessible
    board;tick(600);W.join(@a.id)
    path = [[3.5,0],[3.5,2.7],[5,2.7],[10,2.7],[18,2.7],[23,1]]
    (path + path.reverse + [[-4.5,0],[-4.5,5.2],[-8,5.2],[-13.2,5.2],[-17,4],[-21,2]]).each do |x,z|
      W.apply_move(@a.id,x,z,0,'run')
      assert_equal [x,z],[player(@a).x,player(@a).z]
    end
  end
  def test_old_unsubscribe_cannot_remove_reconnected_passenger
    board;tick(600)
    W.join(@a.id,session_id:'old');W.join(@a.id,session_id:'new')
    W.leave(@a.id,session_id:'old')
    assert player(@a)
    assert_equal 'gulf_to_caerdun',W.find_player(@a.id).first.key
    W.leave(@a.id,session_id:'new');assert_nil player(@a)
  end
  def test_cannon_collision_rejects_tunnelling
    board;tick(600);W.join(@a.id)
    # boarding spreads passengers by id (ferry_world.rb); from (3.5, 1.5) a
    # cannon stands on the way to (5, 5), so start from a spot with none
    player(@a).x,player(@a).z=3.5,0.0
    W.apply_move(@a.id,5,5,0,'run')
    W.apply_move(@a.id,-3,5,0,'run')
    assert_equal [5,5],[player(@a).x,player(@a).z]
  end
  def test_failed_batch_rolls_back_charge_and_voyage
    v=F.voyage('moonmereshores',600)
    attrs={zone:v['sea_zone'],x:2,z:-3,ferry_voyage:v}
    assert_raises(ActiveRecord::RecordNotFound){W.ferry_write_transfers(@a.id=>attrs,999999999=>attrs)}
    assert_equal 50,@a.reload.gold
    assert_nil @a.ferry_voyage
    assert_equal 'moonmereshores',@a.zone
  end
  def test_subsidy_errand_keeps_its_reward_and_dialog
    QuestProgress.create!(character_id:@c.id,quest_key:'s_caer_6',status:QuestProgress::ACTIVE,progress:0)
    player(@c).quests['s_caer_6']={'status'=>QuestProgress::ACTIVE,'progress'=>0}
    W.talk(@c.id,F.port('caerdunfields')['npc'])
    assert_equal QuestProgress::COMPLETE,QuestProgress.find_by!(character_id:@c.id,quest_key:'s_caer_6').status
    assert_equal 114,@c.reload.gold
    dialog=messages(@c,'npc_dialog').last
    assert_equal Vanai::Data.quests['s_caer_6']['complete'],dialog[:lines]
    assert_equal 10,dialog[:ferry][:fare]
  end
  def test_dockmaster_retains_quest_and_ferry_dialog
    player(@c).level=5
    npc=F.port('caerdunfields')['npc'];W.talk(@c.id,npc)
    dialog=messages(@c,'npc_dialog').last
    assert_equal 10,dialog[:ferry][:fare]
    assert dialog[:offers].any? # Coll's existing side quest still appears.
  end
end

class FerryBalanceRaceTest < Minitest::Test
  def test_fare_waits_for_a_concurrent_spend_and_reads_committed_balance
    raise 'Test only' unless Rails.env.test?
    user=User.create!(email:"ferry-race-#{SecureRandom.hex(5)}@example.invalid",password:'test-only-password')
    c=Character.provision!(user:user,name:'Ferrybalance',job:'PLD')
    c.update!(zone:'moonmereshores',gold:10)
    locked=Queue.new;release=Queue.new
    spender=Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do
        Character.transaction do
          current=Character.lock.find(c.id);current.update!(gold:5)
          locked << true;release.pop
        end
      end
    end
    locked.pop
    v=Vanai::Ferry.voyage('moonmereshores',600)
    boarding=Thread.new{Vanai::World.ferry_write_transfers(c.id=>{zone:v['sea_zone'],x:2,z:-3,ferry_voyage:v})}
    release << true;spender.value
    accepted,rejected=boarding.value
    assert_empty accepted
    assert_includes rejected[c.id],'need 10 gold'
    assert_equal 5,c.reload.gold
    assert_nil c.ferry_voyage
    assert_equal 'moonmereshores',c.zone
  ensure
    release << true if release
    spender&.join;boarding&.join
    user&.destroy!
  end
end
