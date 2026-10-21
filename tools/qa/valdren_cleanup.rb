require 'json'
a=JSON.parse(File.read(ARGV[0]));r=JSON.parse(File.read(ARGV[1]))
expected=[r.fetch('characters').map { |c| c.fetch('id') }, [r.fetch('observer').fetch('id')]]
raise 'Unexpected fixture count' unless expected.map(&:size)==[4,1]
users=a.fetch('users').map.with_index do |email,i|
  raise 'Unexpected fixture email' unless email.match?(/\Avaldren-(qa|observer)-[a-z]+@example\.invalid\z/)
  u=User.find_by!(email:email)
  raise 'Unexpected ownership' unless u.characters.pluck(:id).sort==expected[i].sort
  u
end
User.transaction { users.each(&:destroy!) }
raise 'Fixture remains' if User.where(email:a.fetch('users')).exists? || Character.where(id:expected.flatten).exists?
puts 'Removed exactly two Valdren test accounts and five owned characters.'
