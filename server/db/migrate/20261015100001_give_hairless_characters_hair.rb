# Every player character has hair (Philip, 2026-10-15). Character creation
# once offered "No hair" for every race; it no longer does, and the model
# refuses it. A character saved with "none" already reads as their race's
# default through Character#appearance_payload, but the row itself still says
# "none": rewrite it to the style that default names, so the stored record and
# what everyone sees agree.
#
# The defaults are frozen here (a migration must not read the live model):
# Aedri waves (male) or braid (female), Valdren cascade (male) or braid
# (female), Karrog braid, Rasha waves, Nym tousled.
#
# Irreversible in substance: which characters were bald is not kept, and
# there is nothing to restore it to, so `down` does nothing.
class GiveHairlessCharactersHair < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      UPDATE characters
      SET appearance = jsonb_set(appearance, '{hair}', to_jsonb(
        CASE
          WHEN race = 'aedri' AND appearance->>'face' = 'female' THEN 'braid'
          WHEN race = 'aedri' THEN 'waves'
          WHEN race = 'valdren' AND appearance->>'face' = 'female' THEN 'braid'
          WHEN race = 'valdren' THEN 'cascade'
          WHEN race = 'karrog' THEN 'braid'
          WHEN race = 'rasha' THEN 'waves'
          ELSE 'tousled'
        END))
      WHERE appearance->>'hair' = 'none'
        AND race IN ('aedri', 'valdren', 'karrog', 'rasha', 'nym')
    SQL
  end

  def down; end
end
