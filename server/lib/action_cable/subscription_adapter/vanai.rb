# cable.yml's `adapter: vanai` is required as action_cable/subscription_adapter/vanai
# and looked up as ActionCable::SubscriptionAdapter::Vanai
# (ActionCable::Server::Configuration#pubsub_adapter); the adapter itself lives
# with the game's code, which Zeitwerk leaves alone.
require Rails.root.join("lib/vanai/cable_adapter").to_s

module ActionCable
  module SubscriptionAdapter
    Vanai = ::Vanai::CableAdapter
  end
end
