class AddCreditedTargetsToQuestProgresses < ActiveRecord::Migration[8.1]
  def change
    # interact objectives credit each distinct target once, so the ids already
    # counted have to survive a relog
    add_column :quest_progresses, :credited_targets, :jsonb, null: false, default: []
  end
end
