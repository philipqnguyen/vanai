class User < ApplicationRecord
  has_secure_password
  # A session counts only while it carries this (Api::BaseController,
  # ApplicationCable::Connection): signing out or a new password replaces it,
  # which ends every copy of the old cookie, wherever it is.
  has_secure_token :session_token
  has_many :characters, dependent: :destroy

  # Uniqueness is checked case-insensitively, like the lower(email) index it
  # stands in front of; the index still decides a race (RegistrationsController).
  # 254 is the longest address mail can carry (RFC 5321).
  validates :email, presence: true, length: { maximum: 254 }, format: { with: /\A[^@\s]+@[^@\s]+\z/ }, uniqueness: { case_sensitive: false }
  # Checked when a password is set, so an older, shorter one still signs in.
  validates :password, length: { minimum: 8 }, allow_nil: true

  scope :not_banned, -> { where(banned_at: nil) }

  # A password reset (DEPLOY.md "Moderation and accounts") signs out every
  # browser and closes every socket the account has open.
  before_save -> { self.session_token = self.class.generate_unique_secure_token }, if: -> { persisted? && password_digest_changed? }
  after_update_commit :disconnect!, if: :saved_change_to_password_digest?

  def self.find_by_email(email)
    email = email.to_s.downcase.strip
    where("lower(email) = ?", email).first unless email.length > 254
  end

  # Signing out: every session holding the old token is over, here and on any
  # other machine, and the account's sockets are closed (see ban!).
  def sign_out_everywhere!
    regenerate_session_token
    disconnect!
  end

  def banned? = banned_at.present?
  def muted? = muted_at.present?

  # ---- moderation (lib/tasks/accounts.rake; DEPLOY.md "Moderation and accounts") ----

  # Refused at sign-in, on every request and at the socket. Their open sockets
  # are closed too: across processes with the Redis cable adapter (production);
  # under development's in-process adapter, the next reconnect is refused.
  def ban!
    update!(banned_at: Time.current)
    disconnect!
  end

  def unban! = update!(banned_at: nil)
  def mute! = update!(muted_at: Time.current)
  def unmute! = update!(muted_at: nil)

  # The world holds a reading of each mute for a few seconds (World::MUTE_TTL).
  # A change committed in its own process is forgotten there at once, so the
  # next line said reads it; from another process it lands within the TTL.
  after_update_commit -> { Vanai::World.forget_mutes(characters.ids) }, if: :saved_change_to_muted_at?

  def disconnect!
    characters.ids.each do |cid|
      ActionCable.server.remote_connections.where(current_user_id: id, current_character_id: cid).disconnect
    end
  end

  # The account and every character on it, for good. Banned and disconnected
  # first so the world lets go of them. The rows that would refuse a
  # character's deletion go with it: their auction listings (a live one's goods
  # with it), their friend lists, and their companies' lead, handed on or the
  # company furled when no one is left.
  def delete_account!
    ban!
    ids = characters.ids
    transaction do
      AuctionListing.where(seller_id: ids).delete_all
      AuctionListing.where(buyer_id: ids).update_all(buyer_id: nil)
      Friendship.where(character_id: ids).delete_all
      company_ids = Character.where(id: ids).where.not(company_id: nil).distinct.pluck(:company_id)
      destroy!
      company_ids.each do |co|
        remaining = Character.where(company_id: co).order(:id).pluck(:id)
        if remaining.empty?
          Company.where(id: co).delete_all
        else
          Company.where(id: co, leader_id: ids).update_all(leader_id: remaining.first)
        end
      end
    end
  end
end
