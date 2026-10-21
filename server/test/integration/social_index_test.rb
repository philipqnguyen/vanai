ENV['RAILS_ENV'] = 'test'
require_relative '../../config/environment'
require 'minitest/autorun'
require 'action_dispatch/testing/integration'

# What the world keeps in memory for the social commands, which once walked
# every player online or asked the database on every line: the name index
# (/tell, examine, invites), the mute reading, the company members online
# (/c), Player Search's sorted roster and the friends list's presence. Each
# test pins that the answer is what the walk or the query gave, and that the
# fast path really asks nothing. The world harness is security_realtime_test.rb's.
class SocialIndexTest < Minitest::Test
  W = Vanai::World
  PAGE = W.singleton_class::WHO_LIST_PAGE

  def setup
    raise 'Test database only' unless Rails.env.test?
    raise 'No running world allowed' if W.instance_variable_get(:@thread)&.alive?
    ActiveRecord::Base.connection.begin_transaction(joinable: false)
    %i[zones parties online party_grace sessions move_checks kept_vitals pending_invites trades trade_invites
       company_invites].each { |key| W.instance_variable_set("@#{key}", {}) }
    %i[online_by_name online_companies company_online mutes roster].each { |key| W.instance_variable_set("@#{key}", nil) }
    W.instance_variable_set(:@queue, Queue.new)
    W.instance_variable_set(:@next_party_id, 0)
    W.initialize_ferry
    @messages = []
    @zone_said = []
    test = self
    @originals = { to_char: W.method(:to_char), broadcast_zone: W.method(:broadcast_zone) }
    W.define_singleton_method(:to_char) { |id, payload = nil, **kw| test.instance_variable_get(:@messages) << [id, payload || kw] }
    W.define_singleton_method(:broadcast_zone) { |key, payload| test.instance_variable_get(:@zone_said) << [key, payload] }
    @user = User.create!(email: 'social-index@example.invalid', password: 'isolated-test-password')
    @sql = []
    @counting = ActiveSupport::Notifications.subscribe('sql.active_record') do |*, p|
      next if p[:name] == 'SCHEMA' || p[:sql] =~ /\A\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/
      test.instance_variable_get(:@sql) << p[:sql]
    end
  end

  def teardown
    ActiveSupport::Notifications.unsubscribe(@counting)
    (W.instance_variable_get(:@online) || {}).keys.each { |cid| W.leave(cid, persist: false) }
    @originals.each { |name, m| W.define_singleton_method(name, m) }
    ActiveRecord::Base.connection.rollback_transaction
  end

  def make_char(name, user: @user, zone: 'caerdun')
    c = Character.provision!(user: user, name: name, job: 'PLD', city: 'caerdun')
    c.update!(zone: zone) unless zone == 'caerdun'
    c
  end

  def to(id) = @messages.select { |cid, _| cid == id }.map(&:last)
  def said(id) = to(id).filter_map { |p| p[:msg] }

  def queries
    @sql.clear
    yield
    @sql.dup
  end

  # The walk find_player_by_name was, kept here as the oracle.
  def walked(name)
    name = name.to_s.downcase
    return nil if name.empty?
    W.instance_variable_get(:@online).each_key do |cid|
      z, ps = W.find_player(cid)
      return [z, ps] if ps && ps.name.downcase == name
    end
    nil
  end

  # ---- the name index ----

  def test_a_name_finds_whom_the_walk_found_and_no_one_once_they_leave
    a = make_char('Indexed')
    b = make_char('Otherone', zone: 'heartwood')
    [a, b].each { |c| W.join(c.id) }
    ['Indexed', 'INDEXED', 'otherone', 'Nobody', '', nil, 'Index'].each do |name|
      found = walked(name)
      got = W.find_player_by_name(name)
      assert_equal [found&.last&.char_id, found&.first&.key], [got&.last&.char_id, got&.first&.key], name.inspect
    end
    assert_empty queries { 50.times { W.find_player_by_name('nobody at all') } }
    W.leave(b.id, persist: false)
    assert_nil W.find_player_by_name('otherone')
    refute W.online_by_name.key?('otherone'), 'the index lets go of them'
    W.join(b.id)
    assert_equal b.id, W.find_player_by_name('Otherone').last.char_id
    # an entry whose body is another's (a test swapping @online) is a miss
    W.online_by_name['ghost'] = a.id
    assert_nil W.find_player_by_name('ghost')
  end

  def test_a_tell_reaches_the_one_named
    a = make_char('Teller')
    b = make_char('Hearer', zone: 'moonmere')
    [a, b].each { |c| W.join(c.id) }
    @messages.clear
    W.chat(a.id, 'say', '/tell hearer across the gulf')
    assert_equal ['across the gulf'], to(b.id).select { |p| p[:t] == 'chat' }.map { |p| p[:msg] }
    W.chat(a.id, 'say', '/tell Nobodyhere hello')
    assert_includes said(a.id), 'No explorer answers to that name.'
  end

  # ---- the mute ----

  def test_a_line_said_asks_the_database_nothing_and_a_mute_still_lands
    talker = make_char('Speaker')
    W.join(talker.id)
    W.chat(talker.id, 'say', 'first')
    assert_empty queries { 20.times { |i| W.chat(talker.id, 'say', "line #{i}") } }, 'the reading stands'
    assert_equal 21, @zone_said.count { |_, p| p[:t] == 'chat' }
    # a mute from this process lands on the very next line (User's after_commit)
    @user.mute!
    @zone_said.clear
    W.chat(talker.id, 'say', 'muted now')
    assert_empty @zone_said
    assert_includes said(talker.id), 'You are muted. No one hears what you say.'
    @user.unmute!
    W.chat(talker.id, 'say', 'heard again')
    assert_equal ['heard again'], @zone_said.map { |_, p| p[:msg] }
  end

  # A mute from another process (the rake task) cannot reach this one: it is
  # read again within MUTE_TTL, and at once on the next arrival.
  def test_a_mute_from_elsewhere_lands_within_the_ttl
    talker = make_char('Farmuted')
    W.join(talker.id)
    W.chat(talker.id, 'say', 'before')
    User.where(id: @user.id).update_all(muted_at: Time.current) # no callbacks: another process
    original = Vanai.method(:now)
    start = Vanai.now
    @zone_said.clear
    W.chat(talker.id, 'say', 'still read as unmuted')
    assert_equal 1, @zone_said.size, 'within the TTL the old reading stands'
    Vanai.define_singleton_method(:now) { start + W.singleton_class::MUTE_TTL + 0.1 }
    @zone_said.clear
    W.chat(talker.id, 'say', 'past the ttl')
    assert_empty @zone_said
    Vanai.define_singleton_method(:now) { start }
    User.where(id: @user.id).update_all(muted_at: nil)
    W.join(talker.id)
    @zone_said.clear
    W.chat(talker.id, 'say', 'an arrival reads it again')
    assert_equal 1, @zone_said.count { |_, p| p[:t] == 'chat' }
  ensure
    Vanai.define_singleton_method(:now, original) if original
  end

  # ---- the company ----

  def test_company_lines_reach_the_members_online_and_ask_the_database_nothing
    other_user = User.create!(email: 'social-index-2@example.invalid', password: 'isolated-test-password')
    lead = make_char('Bannerlead')
    member = make_char('Bannerfoot', user: other_user, zone: 'heartwood')
    late = make_char('Bannerlate', user: other_user)
    outsider = make_char('Outsider')
    [lead, member, outsider].each { |c| W.join(c.id) }
    W.chat(lead.id, 'say', '/company create Ashen Vow')
    co = Company.find_by(name: 'Ashen Vow')
    assert co
    W.chat(lead.id, 'say', '/company invite Bannerfoot')
    W.chat(member.id, 'say', '/company accept')
    assert_equal co.id, member.reload.company_id
    # one who was already a member when they came online
    late.update!(company_id: co.id)
    W.join(late.id)
    W.chat(lead.id, 'say', '/c warm up')
    @messages.clear
    sql = queries { W.chat(lead.id, 'say', '/c to the banner') }
    assert_empty sql, 'a /c line reads nothing from the database'
    heard = @messages.select { |_, p| p[:t] == 'chat' && p[:channel] == 'company' }
    assert_equal [lead.id, member.id, late.id].sort, heard.map(&:first).sort
    assert heard.all? { |_, p| p[:from] == 'Bannerlead' && p[:msg] == 'to the banner' }
    # the members online are the rows' members online, always
    online = W.instance_variable_get(:@online)
    assert_equal Character.where(company_id: co.id).pluck(:id).select { |id| online[id] }.sort, W.company_online[co.id].to_a.sort

    W.chat(member.id, 'say', '/company leave')
    assert_nil member.reload.company_id
    @messages.clear
    W.chat(lead.id, 'say', '/c after the leave')
    assert_equal [lead.id, late.id].sort, @messages.select { |_, p| p[:channel] == 'company' }.map(&:first).sort
    W.chat(member.id, 'say', '/c anyone?')
    assert_includes said(member.id), 'You march under no banner. /company create <name>'
    W.leave(late.id, persist: false)
    refute_includes W.company_online[co.id].to_a, late.id, 'a leave takes them off the roll'
    W.chat(outsider.id, 'say', '/c hello')
    assert_includes said(outsider.id), 'You march under no banner. /company create <name>'
  end

  # ---- Player Search ----

  # The page who_list served before the roster: every row built and sorted.
  def who_oracle(q, page)
    online = W.instance_variable_get(:@online)
    needle = q.to_s.strip.downcase
    rows = online.keys.filter_map do |cid|
      _, mem = W.find_player(cid)
      next unless mem
      next if !needle.empty? && !mem.name.downcase.include?(needle)
      { name: mem.name, job: mem.job, level: mem.level, zone: online[cid],
        zone_name: Vanai::Data.zones.dig(online[cid], 'name') || online[cid] }
    end.sort_by { |row| row[:name] }
    pages = [(rows.size + PAGE - 1) / PAGE, 1].max
    page = (page.is_a?(Integer) ? page : Integer(page.to_s, exception: false) || 1).clamp(1, pages)
    { t: 'who_list', count: rows.size, page: page, pages: pages, q: q.to_s.strip,
      players: rows[(page - 1) * PAGE, PAGE] || [] }
  end

  def who_page(char_id, q, page)
    @messages.clear
    W.who_list(char_id, q, page)
    to(char_id).find { |p| p[:t] == 'who_list' }
  end

  def test_player_search_pages_what_the_full_rebuild_served
    letters = ('a'..'z').to_a
    chars = 45.times.map { |i| make_char("Seek#{letters[i % 26]}#{letters[(i * 7) % 26]}#{letters[i / 26]}", zone: %w[caerdun heartwood moonmere][i % 3]) }
    chars.each { |c| W.join(c.id) }
    me = chars.first.id
    cases = [['', 1], ['', 2], ['', 3], ['', 99], [nil, {}], ['SEEKA', 1], ['seek', 3], ['zz', 1], [' seekb ', '1'], ['', Float::INFINITY]]
    cases.each { |q, page| assert_equal who_oracle(q, page), who_page(me, q, page), [q, page].inspect }
    # level and job are read live; a leave and a join move the roster
    _, ps = W.find_player(chars[5].id)
    ps.level = 37
    W.leave(chars[0].id, persist: false)
    me = chars[1].id
    W.join(make_char('Aardvark').id)
    cases.each { |q, page| assert_equal who_oracle(q, page), who_page(me, q, page), [q, page].inspect }
    # a page served from the roster builds no row for the rest
    assert_empty queries { who_page(me, '', 2) }
  end

  def test_slash_who_counts_everyone_and_lists_the_first_twenty
    chars = 25.times.map { |i| make_char("Whoer#{('a'..'z').to_a[i]}") }
    chars.each { |c| W.join(c.id) }
    @messages.clear
    W.chat(chars[0].id, 'say', '/who')
    msgs = said(chars[0].id)
    assert_equal 'Explorers abroad in Ardenfell: 25', msgs.first
    online = W.instance_variable_get(:@online)
    expected = online.keys.first(20).map do |cid|
      _, mem = W.find_player(cid)
      "#{mem.name} — Lv #{mem.level} #{mem.job} — #{Vanai::Data.zones.dig(online[cid], 'name') || online[cid]}"
    end
    assert_equal expected, msgs.drop(1)
  end

  # ---- presence for the friends list ----

  def test_presence_for_answers_as_the_whole_map_did
    a = make_char('Presentone')
    b = make_char('Presenttwo', zone: 'moonmere')
    offline = make_char('Absentone')
    [a, b].each { |c| W.join(c.id) }
    map = W.presence_map
    names = ['Presentone', 'PRESENTTWO', offline.name, 'Nobody', '']
    got = W.presence_for(names)
    names.each { |n| assert_equal [map[n.downcase]], [got[n.downcase]], n }
    assert_equal map.slice('presentone', 'presenttwo'), got
    assert_equal({ online: false }, W.presence_of('Absentone'))
    assert_equal map['presenttwo'], W.presence_of('presentTwo')
  end

  def test_the_friends_list_shows_who_is_abroad
    api = ActionDispatch::Integration::Session.new(Rails.application)
    api.host! 'localhost'
    api.post '/api/register', params: { email: 'social-index-friends@example.invalid', password: 'isolated-test-password' }, as: :json
    api.post '/api/characters', params: { name: 'Befriender', race: 'aedri', job: 'PLD', city: 'caerdun' }, as: :json
    me = Character.find(JSON.parse(api.response.body).dig('character', 'id'))
    api.post "/api/characters/#{me.id}/select", as: :json
    abroad = make_char('Abroadpal', zone: 'heartwood')
    home = make_char('Homepal')
    W.join(abroad.id)
    co = Company.create!(name: 'Lamp Wardens', leader_id: me.id)
    Character.where(id: [me.id, abroad.id, home.id]).update_all(company_id: co.id)
    Friendship.create!(character_id: me.id, friend_name: 'Homepal')
    Friendship.create!(character_id: me.id, friend_name: 'Abroadpal')
    api.get '/api/friends'
    body = JSON.parse(api.response.body)
    seen = { 'online' => true, 'level' => 1, 'job' => 'PLD', 'zone' => Vanai::Data.zones.dig('heartwood', 'name') }
    assert_equal [{ 'name' => 'Abroadpal' }.merge(seen), { 'name' => 'Homepal', 'online' => false }], body['friends']
    assert_equal 'Lamp Wardens', body.dig('company', 'name')
    assert_equal [{ 'name' => 'Abroadpal' }.merge(seen), { 'name' => 'Befriender', 'online' => false },
                  { 'name' => 'Homepal', 'online' => false }], body.dig('company', 'members')
  end
end
