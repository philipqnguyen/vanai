module Vanai
  # Mail (Philip, 2026-10-14): letters between characters and from the world.
  # The auction house writes when a listing sells (the gold is already in the
  # seller's purse; the letter only says so) and sends an unsold listing home
  # as a parcel when it expires. Players write to each other and may enclose
  # gold and items.
  #
  # A parcel is escrow: what it carries leaves the sender's bags and purse in
  # the transaction that writes the letter and reaches the recipient only when
  # they press Collect, under a lock on the letter that refuses a second
  # collect. Nothing a letter holds is in anyone's inventory in between, so
  # there is nothing to duplicate. The mailbox is open anywhere: unlike the
  # auction house's counter, it is not a place.
  #
  # Kept apart from the courts' letters (CourtLetter), which are offers with
  # their own lifecycle.
  module Mail
    # Item stacks a parcel may carry, besides gold.
    MAX_STACKS = 4
    MAX_GOLD = 999_999
    SUBJECT_MAX = 60
    BODY_MAX = 1000
    # A parcel (anything enclosed) costs the sender this; a plain letter is
    # free. A small sink, and a brake on parcel spam that the rate limit alone
    # would leave free.
    POSTAGE = 10
    # Player letters a sender may post in the window.
    RATE_LIMIT = 10
    RATE_WINDOW = 10.minutes
    # The world tick returns expired listings this often, this many at a time.
    SWEEP_EVERY = 60.0
    SWEEP_BATCH = 25
    HOUSE = "The Auction House"
    # One unequipped row per kind for these; everything else is a row per piece
    # (the auction's cancel, the merchants, crafting and the trade window merge
    # the same way).
    STACKING = %w[consumable material].freeze

    # A readable refusal: the controller turns it into { error: message }.
    class Refusal < StandardError; end

    class << self
      def now = Time.current

      def unread_count(char_id)
        MailLetter.where(recipient_id: char_id).unread.count
      end

      # The badge for every join of a tick, in one grouped count
      # (World.finish_joins).
      def push_unread_many(char_ids)
        counts = MailLetter.where(recipient_id: char_ids).unread.group(:recipient_id).count
        char_ids.each { |id| World.to_char(id, { t: "mail_unread", unread: counts.fetch(id, 0) }) }
      end

      # The badge's number to an online character (a broadcast, safe from any
      # thread); with a letter, the client also says who it is from.
      def push_unread(char_id, letter = nil)
        payload = { t: "mail_unread", unread: unread_count(char_id) }
        payload[:letter] = { from: letter.sender_name, subject: letter.subject } if letter
        World.to_char(char_id, payload)
      end

      # ---- the auction house's letters (inside the caller's transaction) ----

      def sale_letter!(listing, buyer_name)
        name = item_label(listing.item_key, listing.qty)
        MailLetter.create!(
          recipient_id: listing.seller_id, kind: MailLetter::SYSTEM, sender_name: HOUSE,
          subject: "Sold: #{name}"[0, SUBJECT_MAX],
          body: "Your #{name} sold at the auction house to #{buyer_name} for #{listing.price} gold.\n\n" \
                "The gold is already in your purse."
        )
      end

      def return_letter!(listing)
        name = item_label(listing.item_key, listing.qty)
        MailLetter.create!(
          recipient_id: listing.seller_id, kind: MailLetter::SYSTEM, sender_name: HOUSE,
          subject: "Unsold: #{name}"[0, SUBJECT_MAX],
          body: "Your #{name} found no buyer in #{AuctionListing::DURATION.in_days.to_i} days. " \
                "The listing has closed and the goods are enclosed.",
          items: [{ "item_key" => listing.item_key, "qty" => listing.qty }]
        )
      end

      # Every live listing past its date goes home as a parcel; one at a time,
      # each under its own lock, so a buy or a cancel racing the sweep wins or
      # loses cleanly. seller_id narrows it to one seller (their mailbox and
      # their listings run it on read). -> listings returned
      def expire_listings!(at = now, seller_id: nil, limit: SWEEP_BATCH)
        due = AuctionListing.where(status: AuctionListing::ACTIVE).where("expires_at <= ?", at)
        due = due.where(seller_id: seller_id) if seller_id
        letters = due.order(:expires_at).limit(limit).pluck(:id).filter_map do |id|
          AuctionListing.transaction do
            l = AuctionListing.lock.find_by(id: id, status: AuctionListing::ACTIVE)
            next nil unless l && l.expires_at <= at
            l.update!(status: AuctionListing::EXPIRED)
            return_letter!(l)
          end
        end
        letters.group_by(&:recipient_id).each_value { |ls| push_unread(ls.first.recipient_id, ls.last) }
        letters.size
      end

      # The world loop's hook: throttled, and on the loop's own connection like
      # the courts' tick. An empty sweep is one indexed query a minute.
      def tick(t)
        return if @next_sweep && t < @next_sweep
        @next_sweep = t + SWEEP_EVERY
        ActiveRecord::Base.connection_pool.with_connection { expire_listings! }
      rescue => e
        Rails.logger.error("[mail] sweep error: #{e.class}: #{e.message}\n#{e.backtrace.first(8).join("\n")}")
        ErrorReports.report(e, "mail sweep")
      end

      # ---- players' letters ----

      # items: [{ inventory_item_id:, qty: }]. -> the letter, or raises Refusal.
      def send!(sender, to:, subject:, body: "", gold: 0, items: [])
        name = to.to_s.strip[0, 24]
        raise Refusal, "Who is it for?" if name.empty?
        recipient = Character.find_by("LOWER(name) = ?", name.downcase)
        raise Refusal, "No one by that name walks Ardenfell." unless recipient
        raise Refusal, "You cannot write to yourself." if recipient.id == sender.id
        subject = clean(subject, line: true)
        body = clean(body)
        raise Refusal, "Give the letter a subject." if subject.empty?
        raise Refusal, "Keep the subject under #{SUBJECT_MAX} characters." if subject.length > SUBJECT_MAX
        raise Refusal, "Keep the letter under #{BODY_MAX} characters." if body.length > BODY_MAX
        gold = gold.to_i
        raise Refusal, "Enclose between 0 and #{MAX_GOLD} gold." if gold.negative? || gold > MAX_GOLD
        wanted = enclosures(items)
        postage = gold.positive? || wanted.any? ? POSTAGE : 0

        letter = Character.transaction do
          # The limit is the account's, counted under its lock: every character
          # on it shares the one allowance, and parallel posts wait their turn
          # rather than all counting the same number.
          User.lock.find(sender.user_id)
          # The letter's insert takes a key lock on the recipient's row, so
          # both are locked here in id order: two players writing to each
          # other at once would otherwise each wait on the other.
          Character.lock.where(id: [sender.id, recipient.id]).order(:id).load
          me = Character.find(sender.id)
          recent = MailLetter.where(sender_id: Character.where(user_id: me.user_id).select(:id))
                             .where("created_at > ?", now - RATE_WINDOW).count
          raise Refusal, "The post is busy with your letters. Try again in a few minutes." if recent >= RATE_LIMIT
          rows = me.inventory_items.lock.where(id: wanted.keys).index_by(&:id)
          stacks = wanted.map do |id, qty|
            row = rows[id]
            raise Refusal, "You don't have that." unless row
            raise Refusal, "Take it off before you send it." if row.equipped_slot
            item = Data.items[row.item_key]
            raise Refusal, "That cannot be sent." unless item
            # a named relic is bound to its finder (COURTS.md "Named relics");
            # InventoryItem refuses the move too, this is the readable refusal
            raise Refusal, "That relic is bound to you." if item["bound"] || row.named_relic_id
            raise Refusal, "Not enough of those." if row.qty < qty
            row.qty -= qty
            row.qty.zero? ? row.destroy! : row.save!
            { "item_key" => row.item_key, "qty" => qty }
          end
          # after the items, so a parcel that could never go says why first
          if me.gold < gold + postage
            raise Refusal, postage.positive? ? "Not enough gold (#{gold + postage}g with #{postage}g postage)." : "Not enough gold."
          end
          me.update!(gold: me.gold - gold - postage) if gold + postage > 0
          MailLetter.create!(recipient: recipient, sender: me, sender_name: me.name, kind: MailLetter::PLAYER,
                             subject: subject, body: body, gold: gold, items: stacks)
        end
        # the purse and bags in the world's memory follow the database
        World.request_recompute(sender.id) if letter.parcel?
        push_unread(recipient.id, letter)
        letter
      end

      # Gold and items into the recipient's purse and bags, once.
      def collect!(char_id, letter_id)
        letter = MailLetter.transaction do
          l = MailLetter.lock.find_by(id: letter_id, recipient_id: char_id)
          raise Refusal, "No such letter." unless l
          raise Refusal, "Nothing is enclosed." unless l.parcel?
          raise Refusal, "You have already collected this." if l.collected_at
          me = Character.lock.find(char_id)
          me.update!(gold: me.gold + l.gold) if l.gold.positive?
          give!(me, l.stacks)
          l.update!(collected_at: now, read_at: l.read_at || now)
          l
        end
        # the read folds into one already waiting; the word to refresh the
        # bags goes behind it every time
        World.request_recompute(char_id)
        World.enqueue { World.to_char(char_id, t: "inventory_dirty") }
        letter
      end

      # Inside the caller's transaction. The stack it merges into is read under
      # its row lock: a listing or a parcel taking from that row at the same
      # moment commits first, and the merge adds to what it left rather than
      # writing back the count from before it.
      def give!(character, stacks)
        stacks.each do |st|
          key, qty = st["item_key"], st["qty"].to_i
          next if qty < 1
          existing = character.inventory_items.lock.find_by(item_key: key, equipped_slot: nil, named_relic_id: nil)
          if existing && STACKING.include?(Data.items.dig(key, "slot"))
            existing.update!(qty: existing.qty + qty)
          else
            character.inventory_items.create!(item_key: key, qty: qty)
          end
        end
      end

      def item_label(key, qty)
        name = Data.items.dig(key, "name") || key
        qty > 1 ? "#{name} ×#{qty}" : name
      end

      private

      # { inventory_item_id => qty }, the same row named twice adding up
      def enclosures(items)
        wanted = Hash.new(0)
        Array(items).each do |it|
          it = it.to_h.stringify_keys
          id = it["inventory_item_id"].to_i
          qty = it["qty"].to_i
          raise Refusal, "Enclose at least one of each item." if id <= 0 || qty < 1
          wanted[id] += qty
        end
        raise Refusal, "A parcel holds at most #{MAX_STACKS} items." if wanted.size > MAX_STACKS
        wanted
      end

      # Control characters out; a subject is one line, a body keeps its lines.
      def clean(s, line: false)
        s = s.to_s.gsub(/\r\n?/, "\n").gsub(/[\u0000-\u0009\u000B-\u001F\u007F]/, line ? "" : " ")
        s = s.tr("\n", " ") if line
        s.strip
      end
    end
  end
end

# Gold in the post is still in circulation: the courts' daily snapshot counts
# it beside the bounties' and offers' held gold.
Vanai::Courts::GoldLog.held("mail") { MailLetter.where(collected_at: nil).sum(:gold) }
