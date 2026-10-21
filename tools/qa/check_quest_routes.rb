# Replay collision-checked browser routes through the authoritative floor tracker.
require 'json'
require_relative '../../server/lib/vanai/site_levels'
root=File.expand_path('../..',__dir__)
definitions=JSON.parse(File.read(File.join(root,'shared/data/zones.json')))
report=JSON.parse(File.read(ARGV.fetch(0,File.join(root,'.playwright-mcp/quest-routes.json'))))
failures=[];count=0
report.fetch('sites').each do |site|
 definition=definitions.fetch(site.fetch('zone'))
 site.fetch('routes').each do |route|
  count+=1
  unless route['ok']
   failures << "#{site['zone']}/#{route['id']}: client route missing"
   next
  end
  target=(definition.fetch('interactables',[])+definition.fetch('npcs',[])).find{|t| t['id']==route['id']}
  path=route.fetch('path');levels={}
  path.each_cons(2) do |a,b|
   levels=Vanai::SiteLevels.move(definition,levels,a[0],a[1],b[0],b[1])
   # Exterior approach heights are outside the indoor floor tracker.
   next unless levels.key?(site['id'])
   unless (levels.fetch(site['id'])-b[2]).abs<0.08
    failures << "#{site['zone']}/#{route['id']}: server/client height diverged at #{b.inspect}"
    break
   end
  end
  x, z=path.last
  failures << "#{site['zone']}/#{route['id']}: final floor rejected" unless Vanai::SiteLevels.reachable?(definition,levels,target,x,z)
 end
end
puts "#{count} rendered routes replayed; #{failures.length} failures"
puts failures
exit(failures.empty? ? 0 : 1)
