module Vanai
  module Courts
    # A hall's board (COURTS.md "The audience hall"): the court's
    # proclamations, its board notices and its open bounties, newest first,
    # paginated on the server about twenty at a time.
    #
    # The items come from several tables, so the page is a keyset over
    # (created_at, type rank, id), descending: each source fetches at most
    # `limit + 1` rows past the cursor with its own indexed query, and the merge
    # keeps the first `limit`. The cursor is opaque to the client.
    module Board
      # type => [rank, block(court, cursor, limit) -> [item hashes]]. S3 adds
      # "bounty". The rank only breaks ties between rows stamped alike.
      SOURCES = {}

      class << self
        def source(type, rank, &block)
          SOURCES[type.to_s] = [rank, block]
        end

        # -> { items: [...], next: cursor or nil }
        def page(court, before: nil, limit: Courts.config.page)
          limit = limit.to_i.clamp(1, 50)
          cursor = parse(before)
          rows = SOURCES.flat_map do |type, (rank, block)|
            block.call(court, cursor && cursor.merge(rank: rank), limit + 1).map { |r| r.merge(type: type, rank: rank) }
          end
          rows.sort_by! { |r| [-r[:at].to_r, -r[:rank], -r[:id]] }
          shown = rows.first(limit)
          more = rows.size > limit
          { items: shown.map { |r| r.except(:rank).merge(at: r[:at].iso8601) },
            next: more && shown.any? ? cursor_for(shown.last) : nil }
        end

        # The keyset condition for one source of rank `rank`: rows strictly
        # after the cursor in (created_at desc, rank desc, id desc) order.
        def after(scope, cursor, table)
          return scope unless cursor
          t, cr, cid, rank = cursor[:at], cursor[:cursor_rank], cursor[:id], cursor[:rank]
          if rank < cr
            scope.where("#{table}.created_at <= ?", t)
          elsif rank > cr
            scope.where("#{table}.created_at < ?", t)
          else
            scope.where("#{table}.created_at < ? OR (#{table}.created_at = ? AND #{table}.id < ?)", t, t, cid)
          end
        end

        def cursor_for(row)
          "#{row[:at].utc.iso8601(6)}~#{row[:rank]}~#{row[:id]}"
        end

        def parse(before)
          return nil if before.blank?
          at, rank, id = before.to_s.split("~", 3)
          { at: Time.iso8601(at), cursor_rank: Integer(rank), id: Integer(id) }
        rescue ArgumentError, TypeError
          nil
        end
      end

      source("proclamation", 2) do |court, cursor, limit|
        after(Proclamation.where(court: court), cursor, "proclamations").order(created_at: :desc, id: :desc).limit(limit)
          .map { |p| { id: p.id, at: p.created_at, court: p.court, cycle: p.cycle, text: p.text } }
      end

      source("news", 1) do |court, cursor, limit|
        after(CourtNews.where(audience: "board", court: court), cursor, "court_news").order(created_at: :desc, id: :desc).limit(limit)
          .map { |n| { id: n.id, at: n.created_at, court: n.court, cycle: n.cycle, kind: n.kind, text: n.text } }
      end
    end
  end
end
