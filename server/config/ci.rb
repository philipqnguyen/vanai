# Run using bin/ci

CI.run do
  step "Setup", "bin/setup --skip-server"

  step "Security: Gem audit", "bin/bundler-audit"

  # shared/data is the single source of truth for both halves: every giver,
  # target, drop, stock item, recipe input and portal has to resolve
  step "Data: shared/data audit", "python3 ../tools/data/audit.py"
  step "Test: database", "env RAILS_ENV=test bin/rails db:prepare"
  # every file under test/, so a new test runs without being listed here
  step "Test: server", "bin/rails test test/"

  # Optional: set a green GitHub commit status to unblock PR merge.
  # Requires the `gh` CLI and `gh extension install basecamp/gh-signoff`.
  # if success?
  #   step "Signoff: All systems go. Ready for merge and deploy.", "gh signoff"
  # else
  #   failure "Signoff: CI failed. Do not merge or deploy.", "Fix the issues and try again."
  # end
end
