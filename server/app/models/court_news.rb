# A stored court notice or digest (the court window's News tab). Written by
# Vanai::Courts.publish!; audience all | court | board.
class CourtNews < ApplicationRecord
  self.table_name = "court_news"
  AUDIENCES = %w[all court board].freeze

  validates :audience, inclusion: { in: AUDIENCES }
end
