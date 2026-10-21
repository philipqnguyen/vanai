# Replay the browser's complete stair/ring/bridge round trip through the actual
# authoritative floor tracker. Run after heartwood_story.mjs.
require 'json'
require_relative '../../server/lib/vanai/site_levels'
root=File.expand_path('../..',__dir__)
z=JSON.parse(File.read("#{root}/shared/data/zones.json"))['heartwood']
input=ARGV[0] || "#{root}/.playwright-mcp/heartwood-story-fixes/geometry.json"
r=JSON.parse(File.read(input))
st=z['sites']['upper_boughs']['ramps'][0];x=st['x0'];zz=st['z0'];levels={};failures=[]
r['upperHistory'].each_with_index do |(nx,nz,y),i|
 levels=Vanai::SiteLevels.move(z,levels,x,zz,nx,nz);x=nx;zz=nz
 server_y=levels['upper_boughs']
 failures<<{i:i,client:y,server:server_y,point:[x,zz]} unless server_y && (server_y-y).abs<0.25
end
result={samples:r['upperHistory'].size,failures:failures.take(20),failure_count:failures.size}
File.write("#{File.dirname(input)}/server-history.json",JSON.pretty_generate(result))
puts JSON.generate(result)
exit(failures.empty? ? 0 : 1)
