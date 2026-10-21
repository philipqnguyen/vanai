class Company < ApplicationRecord
  NAME_MIN = 3
  NAME_MAX = 24
  # The character-name rule (letters and apostrophes) widened by exactly one
  # thing companies need and people don't: interior spaces, one at a time.
  NAME_FORMAT = /\A[A-Za-z][A-Za-z']*(?: [A-Za-z][A-Za-z']*)*\z/

  # Trim the edges and collapse runs of spaces, so "The  Ashen Vow " is founded
  # rather than refused over typing.
  normalizes :name, with: ->(n) { n.to_s.strip.squeeze(" ") }

  validates :name, presence: true,
                   length: { minimum: NAME_MIN, maximum: NAME_MAX },
                   format: { with: NAME_FORMAT, message: "letters and apostrophes only" }
  validate :name_unique_ci, on: :create

  def name_unique_ci
    errors.add(:name, :taken_ci, message: "is already carried") if
      Company.where("lower(name) = ?", name.to_s.downcase).exists?
  end
end
