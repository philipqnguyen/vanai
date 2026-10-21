module Vanai
  module Courts
    # The audience halls (COURTS.md "The audience hall"): one per city, where a
    # herald speaks for the unseen court beside four stations: the board, the
    # registry desk, the swearing desk and the book of names.
    #
    # The halls live in courts.json, not zones.json, and are injected into the
    # loaded zone definitions on both sides (here from Data.load!, on the client
    # by court-data.ts injectCourtHalls). Caerdun's and Moonmere's NPCs and
    # interactables are written into zones.json by data moves from their city
    # plans, which throw on a record with no plan spot, and the auction session is
    # rewriting those plans; injecting at load keeps the two apart
    # (tmp/courts/PLAN.md 7). This file is required by data.rb, before the rest
    # of the courts, so `inject!` and its constants touch nothing but the data.
    module Halls
      STATIONS = %w[board registry swearing book].freeze
      # The same reach the world gives any interactable (World.interact).
      STATION_REACH = 7

      class << self
        # Adds each hall's herald to its zone's `npcs` (kind "herald") and its
        # stations to `interactables` (`court_station`), carrying the hall's
        # site, floor and height. Idempotent: an id already present is left alone.
        def inject!(zones, courts_data)
          (courts_data["halls"] || {}).each do |court, hall|
            zone = zones[hall["zone"]] or raise ArgumentError, "court hall #{court}: no zone #{hall["zone"]}"
            npcs = (zone["npcs"] ||= [])
            its = (zone["interactables"] ||= [])
            herald = herald_record(court, hall)
            npcs << herald unless npcs.any? { |n| n["id"] == herald["id"] }
            Array(hall["stations"]).each do |s|
              rec = station_record(court, hall, s)
              its << rec unless its.any? { |i| i["id"] == rec["id"] }
            end
          end
          zones
        end

        def herald_record(court, hall)
          h = hall.fetch("herald")
          rec = { "id" => h.fetch("id"), "name" => h.fetch("name"), "title" => h.fetch("title"), "kind" => "herald",
                  "court" => court, "body" => h["body"], "x" => h.fetch("x"), "z" => h.fetch("z"), "h" => h["h"],
                  "dialog" => Array(h["dialog"]) }
          place(rec, hall)
        end

        def station_record(court, hall, s)
          rec = { "id" => s.fetch("id"), "name" => s.fetch("name"), "prop" => s.fetch("prop"),
                  "x" => s.fetch("x"), "z" => s.fetch("z"), "yaw" => s["yaw"],
                  "court_station" => s.fetch("station"), "court" => court }
          rec["label"] = s["label"] if s["label"]
          rec["next_label"] = s["next_label"] if s["next_label"]
          place(rec, hall)
        end

        # ---- the world thread (reach and floor already checked by World) ----

        # The herald: like a trainer, never a quest giver (World.talk hands a
        # herald here before Quests.talk can offer anything). It reads the
        # court's newest proclamation, or an idle line when there is none.
        def talk(_z, ps, npc)
          court = npc.fetch("court")
          latest = Proclamation.where(court: court).order(created_at: :desc, id: :desc).first
          lines = Array(npc["dialog"])
          lines += if latest
                     ["Hear the court's latest proclamation:", latest.text]
                   else
                     [Array(Courts.config.data.dig("herald_lines", court)).sample].compact
                   end
          World.to_char(ps.char_id, t: "npc_dialog", npc: npc["id"], name: npc["name"], title: npc["title"],
                                    lines: lines, offers: [], turnins: [],
                                    herald: { court: court, court_name: Courts.config.name(court) })
        end

        # A station: the panel it opens, with what the panel needs.
        def interact(_z, ps, it)
          court = it.fetch("court")
          base = { t: "court_panel", station: it["court_station"], station_id: it["id"], court: court,
                   court_name: Courts.config.name(court) }
          extra = case it["court_station"]
                  when "board" then (pg = Board.page(court)) && { page: pg.merge(taken: Bounties.taken(ps.char_id, pg)) }
                  when "swearing" then swearing_panel(ps, court)
                  when "registry" then Relics.registry_panel(ps, court)
                  when "book" then Relics.book(court: court)
                  else {}
                  end
          World.to_char(ps.char_id, base.merge(extra))
        end

        # The swearing desk of `court` in the player's zone, or nil.
        def desk(zone_def, court, station = "swearing")
          (zone_def["interactables"] || []).find { |i| i["court_station"] == station && i["court"] == court }
        end

        # Why the player cannot use this station from where they stand, or nil.
        def refusal(z, ps, it)
          return "Too far away." if ps.dist_to(it["x"], it["z"]) > STATION_REACH
          return "Use the stairs to reach this floor." unless SiteLevels.reachable?(z.definition, ps.site_levels, it, ps.x, ps.z)
          nil
        end

        def swearing_panel(ps, court)
          c = Character.where(id: ps.char_id).pick(:court, :court_switched_cycle)
          sworn, switched = c
          { sworn: sworn, sworn_name: sworn && Courts.config.name(sworn), switch_used: switched == Courts.cycle_number,
            cycle_ends_in: Courts.cycle_ends_in,
            courts: KEYS.map { |k| { key: k, name: Courts.config.name(k), short: Courts.config.court(k)["short"] } } }
        end

        private

        # A hall on an upper floor carries the site and floor the server's
        # SiteLevels judges reach by; a ground-level hall carries at most a height.
        def place(rec, hall)
          rec["y"] = hall["y"] if hall.key?("y")
          if hall["site"]
            rec["site"] = hall["site"]
            rec["floor"] = hall.fetch("floor")
          end
          rec.compact
        end
      end
    end
  end
end
