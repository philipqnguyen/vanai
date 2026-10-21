# Local multiplayer review only. Never starts against a game database.
# DATABASE_URL=postgresql:///vanai_ferry_review_20260924 bundle exec ruby ../tools/qa/ferry_live_server.rb
require 'uri'
uri=URI(ENV.fetch('DATABASE_URL'))
abort 'Use a dedicated local vanai_ferry_review_* database' unless [nil,'','localhost','127.0.0.1'].include?(uri.host) && uri.path.match?(%r{\A/vanai_ferry_review_[a-zA-Z0-9_]+\z})
ENV['RAILS_ENV']='development'
require_relative '../../server/config/environment'
require 'puma'
require 'timeout'
Rails.application.eager_load!
Rails.application.config.action_cable.allowed_request_origins=['http://127.0.0.1:5194']
world=Vanai::World
abort 'A world already exists in this process' if world.instance_variable_get(:@thread)&.alive?
world.define_singleton_method(:ferry_now){@review_time || 500.0}
fixtures=%w[Passengerone Passengertwo Passengerthree].each_with_index.map do |name,i|
 u=User.find_or_create_by!(email:"ferry-live-#{i}@example.invalid"){|v|v.password='ferry-review-only'}
 c=u.characters.first || Character.provision!(user:u,name:name,job:'PLD')
 origin=i==2 ? 'caerdunfields' : 'moonmereshores'
 npc=Vanai::Data.zones[origin]['npcs'].find{|n|n['id']==Vanai::Ferry.port(origin)['npc']}
 c.update!(zone:origin,x:npc['x']+1+i*0.6,z:npc['z'],gold:i==1 ? 10 : 50,ferry_voyage:nil)
 {id:c.id,email:u.email,password:'ferry-review-only',origin:origin,npc:npc['id']}
end
world.boot!
app=lambda do |env|
 headers={'access-control-allow-origin'=>'http://127.0.0.1:5194','access-control-allow-credentials'=>'true','access-control-allow-headers'=>'content-type','access-control-allow-methods'=>'GET,POST,DELETE,OPTIONS'}
 if env['REQUEST_METHOD']=='OPTIONS'
  [204,headers,[]]
 elsif env['PATH_INFO'].start_with?('/__ferry_review/')
  result=Queue.new
  body=JSON.parse(env['rack.input'].read.presence || '{}')
  world.enqueue do
   begin
    case env['PATH_INFO']
    when '/__ferry_review/time'
     world.instance_variable_set(:@review_time,Float(body.fetch('time')));world.instance_variable_set(:@ferry_broadcast_at,0);world.tick_ferry
    when '/__ferry_review/gold'
     id=Integer(body.fetch('id'));raise 'Fixture only' unless fixtures.any?{|f|f[:id]==id}
     world.db{Character.find(id).update!(gold:Integer(body.fetch('gold')))}
    end
    result << {fixtures:fixtures,time:world.ferry_now,characters:world.db{Character.where(id:fixtures.map{|f|f[:id]}).as_json(only:[:id,:zone,:gold,:ferry_voyage])},online:world.instance_variable_get(:@online)}
   rescue => e
    result << {error:e.message}
   end
  end
  payload=Timeout.timeout(10){result.pop}
  [200,headers.merge('content-type'=>'application/json'),[JSON.generate(payload)]]
 else
  code,h,b=Rails.application.call(env);[code,h.merge(headers),b]
 end
end
server=Puma::Server.new(app)
server.add_tcp_listener('127.0.0.1',3013)
puts 'Isolated ferry review: http://127.0.0.1:3013 (client :5194)'
%w[INT TERM].each{|sig|trap(sig){exit}}
server.run.join
