module Vanai
  # Cutscenes (Philip's rulings 2026-10-11). The scenes themselves are data
  # (shared/data/cutscenes/*.json) and play entirely in the client; the world
  # decides only who is shown one and when, and holds the "in a cutscene"
  # flag that everyone else sees.
  #
  # - A scene plays for the current player, and that player is always its
  #   subject. When a party member triggers a party scene, every member here
  #   gets their own copy, starring themselves, never the triggerer.
  # - While it plays the watcher stands still for everyone else, with a film
  #   icon over their head and beside their name on the party bar. Monsters
  #   do not pick them as a target, and the world ignores their movement.
  #
  # Per-character state lives in Discovery rows, like the rest of what a
  # character has seen: "scene_due_<id>" is a scene owed to them (the opening,
  # from the moment the character is made) and "scene_seen_<id>" is one they
  # have watched or skipped, which is what a replay is allowed to show again.
  module Cutscenes
    DUE = "scene_due_".freeze
    SEEN = "scene_seen_".freeze
    # Past a scene's own running time, how long the world keeps waiting for
    # the client to report its end before letting the watcher go.
    HOLD_MARGIN = 60.0

    module_function

    def scene(id) = Data.cutscenes[id]

    def opening_for(city)
      Data.cutscenes.find { |_, s| s.dig("trigger", "type") == "opening" && s.dig("trigger", "city") == city }&.first
    end

    # The intro (Philip's ruling 2026-10-11): one scene every new character
    # sees before their city's opening. It plays before the world is joined,
    # so the client reports it seen over REST (GameController#scene_seen).
    def intro_id = Data.cutscenes.find { |_, s| s.dig("trigger", "type") == "intro" }&.first

    def hold_limit(id) = Data.cutscene_duration(id) + HOLD_MARGIN

    # The Discovery rows a character carries, split into the two sets.
    def load_state(discoveries) = load_keys(discoveries.map(&:landmark_key))

    # The same from their landmark keys alone, which PlayerState plucks: a
    # join builds no row object for each of a long journey's discoveries.
    def load_keys(keys)
      [keys.filter_map { |k| k.delete_prefix(SEEN) if k.start_with?(SEEN) }.to_set,
       keys.filter_map { |k| k.delete_prefix(DUE) if k.start_with?(DUE) }.to_set]
    end

    # A scene filmed "anywhere" (zone "*": the first crystal) plays in whatever
    # zone its watcher is in; its shots point at the watcher and at the nearest
    # crystal, never at a place.
    ANYWHERE = "*".freeze
    def plays_in?(s, zone) = !!s && !s["chapters"] && (s["zone"] == ANYWHERE || s["zone"] == zone)

    # Scenes owed to this player that can play where they now stand.
    def due_here(ps)
      ps.cutscenes_due.select { |id| plays_in?(scene(id), ps.zone) }
    end

    # Scenes a trigger of `type` sets off here, narrowed by `match` (a trigger's
    # own fields: the quest, the monster).
    def triggered(type, zone, **match)
      Data.cutscenes.select do |_, s|
        t = s["trigger"] || {}
        t["type"] == type && plays_in?(s, zone) && match.all? { |k, v| t[k.to_s] == v }
      end.keys
    end

    # Who a trigger reaches. A solo scene reaches its triggerer; a party scene
    # reaches every member standing in the zone it is filmed in, because the
    # scene is shot there. A member who already saw a scene that does not
    # repeat is left out.
    def audience(ps, id, members)
      s = scene(id)
      return [] unless s
      people = s["party"] ? members.select { |m| m.zone == s["zone"] } : [ps]
      people = [ps] if people.empty? && ps.zone == s["zone"]
      people.reject { |m| !s["repeat"] && m.cutscenes_seen.include?(id) }.uniq(&:char_id)
    end

    # Scenes that fire when a quest event happens.
    def for_quest(type, quest_key)
      Data.cutscenes.select { |_, s| s.dig("trigger", "type") == type && s.dig("trigger", "quest") == quest_key }.keys
    end

    # Whether this player may start a scene now: a scene owed to them, or a
    # replay of one already seen, in the zone it was filmed in, alive and out
    # of combat.
    def refusal(ps, id, in_combat)
      s = scene(id)
      return "No such scene." unless s
      return "That scene is not yours to watch." unless ps.cutscenes_due.include?(id) || ps.cutscenes_seen.include?(id)
      return "That scene is filmed elsewhere." unless plays_in?(s, ps.zone)
      return "Not while you are fallen." unless ps.alive?
      return "Not in the middle of a fight." if in_combat
      nil
    end
  end
end
