# One letter in a character's mailbox (Vanai::Mail has the rules). A parcel's
# gold and items are held here, out of every inventory, until collected.
class MailLetter < ApplicationRecord
  belongs_to :recipient, class_name: "Character"
  belongs_to :sender, class_name: "Character", optional: true

  PLAYER = "player"
  SYSTEM = "system"

  validates :kind, inclusion: { in: [PLAYER, SYSTEM] }
  validates :subject, presence: true
  validates :gold, numericality: { greater_than_or_equal_to: 0 }

  scope :unread, -> { where(read_at: nil) }

  def stacks = Array(items)

  def parcel? = gold.positive? || stacks.any?

  # Something attached and not yet taken: the letter cannot be thrown away.
  def holding? = parcel? && collected_at.nil?
end
