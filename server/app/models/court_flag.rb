# The courts' few world-wide flags (dormant, gold_log_day, capital_leader), one
# row each. `get` of an absent flag is nil, which the dormant check reads as
# "never set" (tmp/courts/PLAN.md 1.5).
class CourtFlag < ApplicationRecord
  def self.get(key)
    where(key: key.to_s).pick(:value)
  end

  def self.set(key, value)
    upsert({ key: key.to_s, value: value, updated_at: Time.current }, unique_by: :key)
    value
  end
end
