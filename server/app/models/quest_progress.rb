class QuestProgress < ApplicationRecord
  belongs_to :character
  ACTIVE = 1
  COMPLETE = 2
end
