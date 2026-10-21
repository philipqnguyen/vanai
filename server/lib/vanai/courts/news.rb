module Vanai
  module Courts
    # The courts' scripted news (COURTS.md "The court window and its news").
    # Templated, not AI, so it keeps running while the courts are dormant: each
    # event has a few templates per court in that court's voice in courts.json
    # `news`, and the names filled into them are checked against the roster.
    # Nothing from the courts goes in chat: news is stored (court_news) for the
    # court window's News tab and the hall boards, and sent live as `court_news`
    # (or, for a notice only for the players in one zone, `court_notice`).
    #
    # Audiences: all; court (that court's sworn members); board (that court's
    # hall board); zone (live only, never stored).
    module News
      PLACEHOLDERS = %w[cycle zone court from relic name names target].freeze
      # Placeholders that carry player names: checked against the roster.
      NAME_VARS = %w[name names].freeze
      # name => block(closed, opened) -> [{ "kind" =>, "court" =>, "vars" => {} }]
      # or nil. Later steps add theirs: S4 the control changes, S5 the named
      # relics registered. Registration order is the digest's order.
      DIGEST_SECTIONS = {}

      class << self
        def on_digest(name, &block)
          DIGEST_SECTIONS[name.to_s] = block
        end

        # A template for `kind` in `court`'s voice (or the neutral one where the
        # event is nobody's), with `vars` filled in. rng picks among the
        # court's templates; tests pass a seeded one.
        def render(kind, court, vars = {}, rng: Random)
          t = Courts.config.news.fetch(kind.to_s)
          t = t.fetch(court) if t.is_a?(Hash)
          t = Array(t).sample(random: rng) if t.is_a?(Array)
          fill(t, vars)
        end

        # Fills {placeholders}; names go through the roster first, so a name
        # that is no real explorer's is struck out, as in the courts' own text.
        def fill(template, vars)
          vars = vars.transform_keys(&:to_s)
          vars = vars.merge(NAME_VARS.select { |k| vars.key?(k) }.to_h { |k| [k, roster_names(vars[k])] })
          template.gsub(/\{(\w+)\}/) do
            m = Regexp.last_match
            next m[0] unless vars.key?(m[1])
            midsentence(vars[m[1]].to_s, m.pre_match)
          end
        end

        # Zone names carry their article ("The Caerdun Fields"): mid-sentence
        # it reads "passes to the Caerdun Fields", not "to The Caerdun Fields".
        # And a value that opens a sentence opens it with a capital ("An
        # explorer brought...", where a struck name became "an explorer").
        def midsentence(value, before)
          if before.rstrip.empty? || before.rstrip.match?(/[.!?]\z/)
            return value.empty? ? value : "#{value[0].upcase}#{value[1..]}"
          end
          return value unless value.start_with?("The ") && before.rstrip.match?(/[^.!?:\n]\z/)
          "t#{value[1..]}"
        end

        # One or several names, as the roster spells them, joined for prose.
        def roster_names(value)
          names = Array(value).map(&:to_s)
          known = Text.known_names(names, nil)
          shown = names.map { |n| known[n.downcase] || Text::UNKNOWN }
          shown.size <= 2 ? shown.join(" and ") : "#{shown[0..-2].join(", ")} and #{shown.last}"
        end

        # Stores an item (unless it is a zone notice) and delivers it live to its
        # audience online, or holds the delivery until the surrounding `hold`
        # block ends (a boundary or a council turn, whose transaction must commit
        # first). text: given, or rendered from `kind`'s templates with `vars`.
        def publish!(kind:, audience: "all", court: nil, zone: nil, vars: {}, text: nil, payload: {}, card: nil, cycle: nil)
          text ||= render(kind, court, vars)
          if audience == "zone"
            msg = { t: "court_notice", kind: kind.to_s, text: text, zone: zone, court: court }
            deliver { Courts.each_online { |ps| World.to_char(ps.char_id, msg) if ps.zone == zone } }
            return nil
          end
          item = CourtNews.create!(cycle: cycle || Courts.cycle_number, court: court, audience: audience, kind: kind.to_s,
                                   text: text, payload: payload || {}, created_at: Courts.now)
          msg = { t: "court_news", item: item_json(item), card: card }
          deliver do
            Courts.each_online { |ps| World.to_char(ps.char_id, msg) if hears?(ps.court, item) }
          end
          item
        end

        # Live messages queued inside the block go out when it ends normally and
        # are dropped if it raises. Nested holds join the outermost.
        def hold
          return yield if @outbox
          @outbox = []
          begin
            result = yield
            box = @outbox
          ensure
            @outbox = nil
          end
          box.each(&:call)
          result
        end

        # A live message (a to_char) that must wait for the surrounding `hold`
        # to commit, like the news itself; sent at once outside a hold.
        def later(&block) = deliver(&block)

        def item_json(item)
          { id: item.id, cycle: item.cycle, court: item.court, kind: item.kind, text: item.text,
            payload: item.payload, at: item.created_at&.iso8601 }
        end

        # Who sees an item in the court window: every world item, and their own
        # court's. Board items live on the board, not in the window.
        def hears?(court, item)
          item.audience == "all" || (item.audience == "court" && item.court == court)
        end

        # court_news joined to the characters it is unread for (unread_count's
        # rule, per row): visible to their court, newer than what they last
        # saw, and not from before they existed.
        def unread_join(char_ids)
          ActiveRecord::Base.sanitize_sql_array([<<~SQL.squish, char_ids.map(&:to_i)])
            INNER JOIN characters ON characters.id IN (?)
              AND (court_news.audience = 'all' OR (court_news.audience = 'court' AND court_news.court = characters.court))
              AND court_news.id > characters.court_news_seen_id
              AND court_news.created_at >= characters.created_at
          SQL
        end

        def visible(court)
          CourtNews.where("audience = 'all' OR (audience = 'court' AND court = ?)", court)
        end

        # The News tab, newest first, `limit` at a time before `before_id`.
        def page(court, before_id: nil, limit: Courts.config.page)
          scope = visible(court).order(id: :desc).limit(limit.to_i.clamp(1, 50))
          scope = scope.where("id < ?", before_id.to_i) if before_id.present?
          items = scope.to_a
          { items: items.map { |i| item_json(i) }, next: items.size == limit.to_i ? items.last&.id : nil }
        end

        # Unread: what the window would show that arrived after the character
        # last opened it, and never anything from before they existed (a new
        # character is not handed the whole history as unread).
        def unread_count(character)
          visible(character.court).where("id > ?", character.court_news_seen_id.to_i)
                                  .where("created_at >= ?", character.created_at).count
        end

        # unread_count for many characters in one query: char_id => count (a
        # character with nothing unread is absent).
        def unread_counts(char_ids)
          return {} if char_ids.empty?
          CourtNews.joins(unread_join(char_ids)).group("characters.id").count.transform_keys(&:to_i)
        end

        # The latest digest of all, as the window shows it (or nil): digests
        # are written once per cycle in order, so a character has not been
        # shown it exactly when its cycle is past their marker.
        def latest_digest
          d = CourtNews.where(kind: "digest", audience: "all").order(id: :desc).first
          d && item_json(d)
        end

        # The latest digest the character has not been shown, or nil: a player
        # who was offline sees the latest at login, and older ones stay in News.
        def unseen_digest(character)
          d = CourtNews.where(kind: "digest", audience: "all").where("cycle > ?", character.court_digest_seen_cycle.to_i)
                       .order(id: :desc).first
          d && item_json(d)
        end

        # The window opened (news_id) or the digest card shown (digest_cycle):
        # both markers only ever rise, and never past what exists.
        def seen!(char_id, news_id: nil, digest_cycle: nil)
          # whatever the cable sent: .to_s first, as an Array has no to_i
          news_id = news_id.to_s.to_i
          digest_cycle = digest_cycle.to_s.to_i
          sets = []
          if news_id.to_i.positive?
            n = [news_id.to_i, CourtNews.maximum(:id).to_i].min
            sets << "court_news_seen_id = GREATEST(court_news_seen_id, #{n})"
          end
          if digest_cycle.to_i.positive?
            c = [digest_cycle.to_i, Courts.cycle_number].min
            sets << "court_digest_seen_cycle = GREATEST(court_digest_seen_cycle, #{c})"
          end
          return if sets.empty?
          Character.where(id: char_id).update_all(sets.join(", "))
        end

        # The daily digest, once per cycle, to everyone (COURTS.md): a header,
        # then each registered section's lines in its court's voice (control
        # changes at the boundary, named relics registered that cycle with their
        # finders), or the quiet line when there is nothing to tell. Stored under
        # the closing cycle's number; sent with the digest card.
        def digest!(closed, _opened)
          return if CourtNews.where(kind: "digest", cycle: closed.number).exists?
          sections = {}
          lines = []
          DIGEST_SECTIONS.each do |name, block|
            entries = Array(block.call(closed, _opened))
            sections[name] = entries
            entries.each { |e| lines << render(e.fetch("kind"), e["court"], e["vars"] || {}) }
          end
          lines = [render("digest_quiet", nil)] if lines.empty?
          header = render("digest_header", nil, { "cycle" => closed.number })
          publish!(kind: "digest", audience: "all", cycle: closed.number, text: ([header] + lines).join("\n"),
                   payload: { "cycle" => closed.number, "header" => header, "lines" => lines, "sections" => sections },
                   card: "digest")
        end

        private

        def deliver(&block)
          @outbox ? @outbox << block : block.call
        end
      end

      # The digest's own sections start empty but present, so the client and
      # the tests see the shape S4 (control) and S5 (named relics) fill.
      on_digest("control") { |_closed, _opened| [] }
      on_digest("named") { |_closed, _opened| [] }
    end
  end
end

# The digest is the boundary's last word: it reports what every other block
# changed (control, relics), so it runs after them all.
Vanai::Courts::Cycle.on_boundary("digest", last: true) { |closed, opened| Vanai::Courts::News.digest!(closed, opened) }
