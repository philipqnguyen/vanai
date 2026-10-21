require 'json'
a=JSON.parse(File.read(ARGV[0]));r=JSON.parse(File.read(ARGV[1]))
expected=[r.fetch('characters').map { |c| c.fetch('id') }, [r.fetch('observer').fetch('id')]]
raise 'Unexpected fixture count' unless expected.map(&:size)==[10,1]
users=a.fetch('users').map.with_index do |email,i|
  raise 'Unexpected fixture email' unless email.match?(/\Areplacement-(qa|observer)-[a-z]+@example\.invalid\z/)
  u=User.find_by!(email:email)
  raise 'Unexpected ownership' unless u.characters.pluck(:id).sort==expected[i].sort
  u
end
User.transaction { users.each(&:destroy!) }
raise 'Fixture remains' if User.where(email:a.fetch('users')).exists? || Character.where(id:expected.flatten).exists?
puts 'Removed exactly two replacement test accounts and eleven owned characters.'
