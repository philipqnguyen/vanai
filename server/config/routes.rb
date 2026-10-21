Rails.application.routes.draw do
  mount ActionCable.server => "/cable"

  namespace :api do
    post "register", to: "registrations#create"
    post "login", to: "sessions#create"
    delete "logout", to: "sessions#destroy"
    get "me", to: "sessions#me"

    get "characters", to: "characters#index"
    post "characters", to: "characters#create"
    post "characters/:id/select", to: "characters#select"

    get "game/state", to: "game#state"
    post "game/equip", to: "game#equip"
    post "game/unequip", to: "game#unequip"
    post "game/vendor", to: "game#vendor"
    post "game/scene_seen", to: "game#scene_seen"

    get "auction", to: "auction#index"
    post "auction/list", to: "auction#list_item"
    post "auction/buy", to: "auction#buy"
    post "auction/cancel", to: "auction#cancel"
    get "auction/mine", to: "auction#mine"
    get "auction/price", to: "auction#price"

    get "mail", to: "mail#index"
    post "mail", to: "mail#create"
    get "mail/:id", to: "mail#show"
    post "mail/:id/collect", to: "mail#collect"
    delete "mail/:id", to: "mail#destroy"

    post "craft", to: "craft#create"

    get "courts", to: "courts#index"
    get "courts/news", to: "courts#news"
    get "courts/board", to: "courts#board"
    get "courts/bounties", to: "courts#bounties"
    get "courts/book", to: "courts#book"
    get "courts/letters", to: "courts#letters"
    get "courts/record", to: "courts#record"
    get "friends", to: "friends#index"
    post "friends", to: "friends#create"
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
