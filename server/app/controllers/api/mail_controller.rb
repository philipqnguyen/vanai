module Api
  # The mailbox (Vanai::Mail has the rules): an inbox a page at a time,
  # reading, writing with gold and items enclosed, collecting, deleting.
  class MailController < BaseController
    before_action :require_character!
    rescue_from(Vanai::Mail::Refusal) { |e| render json: { error: e.message }, status: :unprocessable_entity }
    # Per character, well past any hand at the post: each collect asks the
    # world thread to read the character again (GameController::ACTIONS).
    COLLECTS = 30
    COLLECTS_WINDOW = 10.seconds
    rate_limit to: COLLECTS, within: COLLECTS_WINDOW, only: :collect, by: -> { session[:character_id] }, with: :too_many_attempts

    PER_PAGE = 20
    MAX_PER_PAGE = 50

    # GET /api/mail?page=&per=  newest first, with the unread count
    def index
      c = current_character
      # an expired listing comes home before the inbox is read, sweep or no sweep
      Vanai::Mail.expire_listings!(seller_id: c.id)
      scope = MailLetter.where(recipient_id: c.id)
      per = params[:per].blank? ? PER_PAGE : params[:per].to_i.clamp(1, MAX_PER_PAGE)
      total = scope.count
      pages = [(total + per - 1) / per, 1].max
      page = params[:page].to_i.clamp(1, pages)
      rows = scope.order(created_at: :desc, id: :desc).offset((page - 1) * per).limit(per)
      render json: { letters: rows.map { |l| letter_payload(l) }, page: page, pages: pages, per: per, total: total,
                     unread: Vanai::Mail.unread_count(c.id), limits: limits }
    end

    # GET /api/mail/:id  the whole letter; reading it marks it read
    def show
      l = letter
      return unless l
      l.update!(read_at: Time.current) unless l.read_at
      render json: { letter: letter_payload(l, body: true), unread: Vanai::Mail.unread_count(current_character.id) }
    end

    # POST /api/mail { to, subject, body, gold, items: [{inventory_item_id, qty}] }
    def create
      items = Array(params[:items]).map { |it| it.respond_to?(:permit) ? it.permit(:inventory_item_id, :qty).to_h : {} }
      l = Vanai::Mail.send!(current_character, to: params[:to], subject: params[:subject], body: params[:body],
                                               gold: params[:gold], items: items)
      render json: { ok: true, letter: letter_payload(l, body: true), postage: l.parcel? ? Vanai::Mail::POSTAGE : 0,
                     gold: current_character.reload.gold }
    end

    # POST /api/mail/:id/collect
    def collect
      l = Vanai::Mail.collect!(current_character.id, params[:id])
      render json: { ok: true, letter: letter_payload(l, body: true), gold: current_character.reload.gold,
                     unread: Vanai::Mail.unread_count(current_character.id) }
    end

    # DELETE /api/mail/:id  refused while anything enclosed is still on it
    def destroy
      l = letter
      return unless l
      return render json: { error: "Collect what is enclosed first." }, status: :unprocessable_entity if l.holding?
      l.destroy!
      render json: { ok: true, unread: Vanai::Mail.unread_count(current_character.id) }
    end

    private

    def letter
      l = MailLetter.find_by(id: params[:id], recipient_id: current_character.id)
      render json: { error: "No such letter." }, status: :not_found unless l
      l
    end

    def limits
      { stacks: Vanai::Mail::MAX_STACKS, gold: Vanai::Mail::MAX_GOLD, postage: Vanai::Mail::POSTAGE,
        subject: Vanai::Mail::SUBJECT_MAX, body: Vanai::Mail::BODY_MAX }
    end

    def letter_payload(l, body: false)
      out = {
        id: l.id, kind: l.kind, from: l.sender_name, subject: l.subject, gold: l.gold,
        items: l.stacks.map { |s| { item_key: s["item_key"], qty: s["qty"], name: Vanai::Data.items.dig(s["item_key"], "name") || s["item_key"] } },
        parcel: l.parcel?, read: !l.read_at.nil?, collected: !l.collected_at.nil?,
        # a system letter cannot be answered
        can_reply: l.kind == MailLetter::PLAYER && !l.sender_id.nil?,
        sent_at: l.created_at.iso8601
      }
      out[:body] = l.body if body
      out
    end
  end
end
