require_relative 'ferry'

module Vanai
  module World
    class << self
      def ferry_now = Time.now.to_f

      def initialize_ferry
        @ferry_registrations = {}
        @ferry_voyages = db { Character.where.not(ferry_voyage: nil).pluck(:id, :ferry_voyage).to_h }
        @ferry_broadcast_at = 0
      end

      def ferry_status(char_id, now = ferry_now)
        z, ps = find_player(char_id)
        return unless ps
        origin = Ferry.port(z.key) ? z.key : Ferry.origin(z.key)
        return unless origin
        { t: 'ferry_status', **Ferry.timetable(now), origin: origin, destination: Ferry.port(origin)['destination'],
          registered: !!@ferry_registrations&.key?(char_id), voyage: @ferry_voyages&.[](char_id),
          fare: Ferry.config['fare'], on_dock: Ferry.on_dock?(z.key, ps.x, ps.z) }
      end

      def ferry_register(char_id, departure)
        z, ps = find_player(char_id)
        return unless ps
        port = Ferry.port(z.key)
        npc = port && z.definition['npcs'].find { |n| n['id'] == port['npc'] }
        return to_char(char_id, t: 'system', msg: 'Speak to the dockmaster to board.') unless npc && ps.dist_to(npc['x'], npc['z']) <= 8
        now = ferry_now
        schedule = Ferry.timetable(now)
        unless schedule[:phase] == 'docked' && departure.to_f == schedule[:next_departure]
          to_char(char_id, t: 'system', msg: 'That boarding window has closed. Wait for the next arrival.')
          return to_char(char_id, ferry_status(char_id, now))
        end
        return to_char(char_id, t: 'system', msg: 'You must be alive and out of combat to board.') unless ps.alive? && !in_combat?(z, ps)
        return to_char(char_id, t: 'system', msg: 'Stand on the dock to register.') unless Ferry.on_dock?(z.key, ps.x, ps.z)
        @ferry_registrations ||= {}
        @ferry_registrations[char_id] = { origin: z.key, departure: schedule[:next_departure] }
        to_char(char_id, t: 'system', msg: 'Your name is on the boarding list. Keep 10 gold and stay on the dock until departure; you can cancel at any time.')
        to_char(char_id, ferry_status(char_id, now))
      end

      def ferry_cancel(char_id, message = 'Boarding cancelled. You remain on shore; no fare was charged.')
        return unless @ferry_registrations&.delete(char_id)
        to_char(char_id, t: 'system', msg: message) if message
        status = ferry_status(char_id)
        to_char(char_id, status) if status
      end

      def ferry_check_registration(char_id)
        r = @ferry_registrations&.[](char_id)
        return unless r
        z, ps = find_player(char_id)
        valid = ps && z.key == r[:origin] && Ferry.on_dock?(z.key, ps.x, ps.z)
        return ferry_cancel(char_id, 'You left the dock. Boarding cancelled; no fare was charged.') unless valid
        ferry_cancel(char_id, 'Boarding cancelled: you must be alive and out of combat. No fare was charged.') unless ps.alive? && !in_combat?(z, ps)
      end

      # Lock current balances, not PlayerState: REST purchases can commit while
      # the world thread waits for the DB. Charge and voyage are one transaction.
      # All passengers become durable before any client receives a zone change.
      def ferry_write_transfers(transfers)
        accepted = {}; rejected = {}
        pos_db do
          Character.transaction do
            transfers.sort.each do |cid, attrs|
              c = Character.lock.find(cid)
              v = attrs[:ferry_voyage]
              if v
                if c.ferry_voyage == v
                  accepted[cid] = attrs # idempotent recovery after commit
                  next
                end
                if c.ferry_voyage || c.zone != v['origin']
                  rejected[cid] = 'Your boarding registration is no longer valid.'
                  next
                end
                if c.gold < Ferry.config['fare']
                  rejected[cid] = 'You need 10 gold at departure. You remain on the dock; boarding was cancelled.'
                  next
                end
                # written as it stands: a row an older rule would refuse (a
                # retired appearance) still sails and still lands
                c.update_columns(**attrs, gold: c.gold - Ferry.config['fare'], updated_at: Time.current)
              else
                c.update_columns(**attrs, updated_at: Time.current)
              end
              accepted[cid] = attrs
            end
          end
        end
        [accepted, rejected]
      end

      # A batch that would not write is written again a passenger at a time:
      # one whose row is gone (an account deleted at sea) used to roll back
      # the whole batch on every tick, and hold every ship. A rejection with
      # no message is a row that is gone.
      def ferry_write_alone(transfers)
        transfers.each_with_object([{}, {}]) do |(cid, attrs), (accepted, rejected)|
          one_accepted, one_rejected = ferry_write_transfers(cid => attrs)
          accepted.merge!(one_accepted)
          rejected.merge!(one_rejected)
        rescue ActiveRecord::RecordNotFound
          rejected[cid] = nil
        rescue ActiveRecord::ActiveRecordError => e
          Rails.logger.error("[vanai] ferry transfer char=#{cid}: #{e.class}: #{e.message}")
          ErrorReports.report(e, "ferry transfer", char_id: cid)
          rejected[cid] = 'The crossing could not be recorded. Try again with the next boat; no fare was charged.' if attrs[:ferry_voyage]
        end
      end

      def ferry_transfer_batch(transfers)
        return if transfers.empty?
        accepted, rejected = begin
          ferry_write_transfers(transfers)
        rescue ActiveRecord::ActiveRecordError
          ferry_write_alone(transfers)
        end
        rejected.each do |cid, message|
          next ferry_cancel(cid, message) if message
          # nobody left to carry: forget them
          @ferry_registrations&.delete(cid)
          @ferry_voyages&.delete(cid)
        end
        accepted.each do |cid, attrs|
          @ferry_registrations.delete(cid)
          attrs[:ferry_voyage] ? @ferry_voyages[cid] = attrs[:ferry_voyage] : @ferry_voyages.delete(cid)
          # Never save the old zone over the already committed destination.
          leave(cid, transferring: true, persist: false) if @online[cid]
          to_char(cid, t: 'zone_change', zone: attrs[:zone], x: attrs[:x], z: attrs[:z])
        end
      end

      def tick_ferry(now = ferry_now)
        return unless @ferry_voyages
        arrivals = @ferry_voyages.filter_map do |cid, v|
          next if now < v['arrival']
          dest = Ferry.port(v['origin']).fetch('arrival')
          [cid, { zone: v['destination'], x: dest['x'], z: dest['z'], ferry_voyage: nil }]
        end.to_h
        # each part on its own: one that raises costs only itself, never the
        # other ships
        guarded('ferry arrivals') { ferry_transfer_batch(arrivals) }
        guarded('ferry registrations') { @ferry_registrations.keys.each { |cid| ferry_check_registration(cid) } }
        departures = @ferry_registrations.to_a.filter_map do |cid, r|
          next if now < r[:departure]
          # A long-stalled world never charges for a whole missed journey.
          # A restart intentionally drops uncommitted dock registrations.
          if now >= r[:departure] + Ferry.config['crossing']
            ferry_cancel(cid, 'That sailing has passed. Register for the next boat; no fare was charged.')
            next
          end
          v = Ferry.voyage(r[:origin], r[:departure])
          # Spread companions across the clear starboard part of the deck.
          [cid, { zone: v['sea_zone'], x: 3.5 + (cid % 3) * 0.9, z: -1.5 + ((cid / 3) % 3) * 1.5, ferry_voyage: v }]
        end.to_h
        guarded('ferry departures') { ferry_transfer_batch(departures) }
        if now >= @ferry_broadcast_at
          @ferry_broadcast_at = now + 2
          @online.keys.each do |cid|
            status = ferry_status(cid, now)
            to_char(cid, status) if status
          end
        end
      end

      def ferry_recover_join(char)
        v = char.ferry_voyage
        return false unless v
        @ferry_voyages ||= {}
        @ferry_voyages[char.id] = v
        if ferry_now >= v['arrival']
          dest = Ferry.port(v['origin']).fetch('arrival')
          ferry_transfer_batch(char.id => { zone: v['destination'], x: dest['x'], z: dest['z'], ferry_voyage: nil })
          return true
        end
        false
      end
    end
  end
end
