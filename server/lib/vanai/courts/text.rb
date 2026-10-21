require "json"
require "set"

module Vanai
  module Courts
    # Model-written text before anyone reads it (COURTS.md "Council cycle":
    # player names and chat are a prompt-injection surface). A proclamation, a
    # letter or a bounty line is reduced to plain prose, its player names are
    # checked against the real roster, and it is clamped to its length cap. The
    # clamp on the verbs limits what a turn can do; this limits what it can say.
    module Text
      # Names are written {{Name}} in the court's text (the council rules say
      # so). Anything else in braces is not a name and is dropped.
      NAME = /\{\{\s*([^{}]{1,40}?)\s*\}\}/
      # A bare capitalised word: the shape a name takes when the court forgets
      # the braces. Character names are letters only, two or more of them.
      BARE = /(?<![[:alpha:]])[[:upper:]][[:alpha:]]+/
      # What a struck-out name reads as: the players are explorers (Philip,
      # 2026-10-18); the court's licence they hold is a charter.
      UNKNOWN = "an explorer".freeze
      # Words a court may always write bare, whatever shared/data happens to
      # say: what it calls the players. Without them "Explorers of the Grove"
      # would be struck as a name nobody can vouch for.
      ALWAYS = %w[explorer explorers].freeze
      ELLIPSIS = "…".freeze
      # server/lib/vanai/courts -> shared/data, without needing Rails.root.
      DATA_DIR = File.expand_path("../../../../shared/data", __dir__)

      class << self
        # -> the cleaned string ("" when nothing readable is left).
        # roster: names allowed to appear (an Enumerable, matched without regard
        # to case, rendered as the roster spells them), or nil to ask the
        # database which of the names written exist.
        def clean(text, max:, roster: nil)
          s = plain(text.to_s)
          wanted = s.scan(NAME).flatten.map(&:strip).uniq
          known = known_names(wanted + bare_unknowns(s.gsub(NAME, " ")), roster)
          s = s.gsub(NAME) { known[Regexp.last_match(1).strip.downcase] || UNKNOWN }
          s = s.delete("{}").gsub(/\s+/, " ").strip
          clamp(strike_bare(s, known), max)
        end

        # COURTS.md: "every player name in it is checked against the real
        # roster", not only the ones the court remembered to brace. A
        # capitalised word that is a real explorer's name stays (in the roster's
        # spelling), one of the world's own words stays (places, people of the
        # quests, items, the courts' register), anything else is a name nobody
        # can vouch for and is struck like an unknown {{Name}}. An NPC's name
        # (Innkeeper Tamsin) is a world word and passes: it names no player.
        def strike_bare(s, known)
          s.gsub(BARE) do |w|
            next w if lexicon.include?(w.downcase)
            next known[w.downcase] if known.key?(w.downcase)
            sentence_start?(Regexp.last_match.pre_match) ? UNKNOWN.capitalize : UNKNOWN
          end
        end

        # The bare capitalised words that are not world words: the ones the
        # roster (or the characters table) has to answer for.
        def bare_unknowns(s) = s.scan(BARE).uniq.reject { |w| lexicon.include?(w.downcase) }

        def sentence_start?(before) = before.rstrip.empty? || before.rstrip.match?(/[.!?]["”’)]?\z/)

        # Every word in shared/data (both halves read it, so it is the world's
        # vocabulary: zones, NPCs, items, monsters, the quests' dialogue, the
        # courts' own templates) plus courts.json council.words, the formal
        # register a court writes in that the data happens not to use, and
        # ALWAYS. Built once; a data change needs a restart anyway
        # (CONTRIBUTING.md).
        def lexicon
          @lexicon ||= begin
            words = Set.new(ALWAYS)
            Dir[File.join(DATA_DIR, "*.json")].each { |f| collect_words(JSON.parse(File.read(f)), words) }
            words.freeze
          end
        end

        def collect_words(v, into)
          case v
          when Hash then v.each { |k, x| collect_words(k, into); collect_words(x, into) }
          when Array then v.each { |x| collect_words(x, into) }
          when String then v.scan(/[[:alpha:]]+/) { |w| into << w.downcase }
          end
        end

        # A proper name mid-sentence: its own leading article in lower case
        # ("sworn to the Court of Caerdun", "enters the Orchard-Wife's Knife").
        def mid(s) = s.to_s.sub(/\AThe /, "the ")

        # The names written in a text, as {{Name}}, before cleaning.
        def names_in(text) = text.to_s.scan(NAME).flatten.map(&:strip).uniq

        # Cuts at a word boundary when one is near, with an ellipsis, so a
        # clamped proclamation still reads as a sentence that was cut.
        def clamp(s, max)
          return s if s.length <= max
          cut = s[0, max - 1]
          space = cut.rindex(" ")
          cut = cut[0, space] if space && space > max * 0.8
          cut.sub(/[\s,;:.\-]+\z/, "") + ELLIPSIS
        end

        # Markup and control characters out: HTML tags, Markdown emphasis,
        # headings, code ticks, link syntax (the link text stays), bare URLs.
        def plain(s)
          s = s.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
          s = s.unicode_normalize(:nfc)
          s = s.gsub(/<[^>]*>/, " ")
          s = s.gsub(/\[([^\]]*)\]\([^)]*\)/, '\1')
          s = s.gsub(%r{\bhttps?://\S+}i, "")
          s = s.gsub(/[*_`~#|>\[\]\\]+/, "")
          s.gsub(/[[:cntrl:]​-‏ -‮⁠-⁯﻿]/, " ")
        end

        # name (downcased) -> the roster's spelling, for the wanted names that
        # exist.
        def known_names(wanted, roster)
          return {} if wanted.empty?
          pool = if roster
                   roster.map(&:to_s)
                 else
                   Character.where("lower(name) IN (?)", wanted.map(&:downcase)).pluck(:name)
                 end
          by_lower = pool.to_h { |n| [n.downcase, n] }
          wanted.filter_map { |w| (n = by_lower[w.downcase]) && [w.downcase, n] }.to_h
        end
      end
    end
  end
end
