#!/usr/bin/env bash
# Checks that the nightly's pubkit facts can flow (README, fleet-nightly.yml's pubkit job),
# and says what is still missing. Run it from this repository's root on main (git latest),
# with its .env for ./with-secrets and the shared-infra checkout beside it:
#
#   scripts/go-live-pubkit-facts.sh
#
# The facts need two things this repository does not make itself, which pubkit.json's
# deploy block declares:
#   - the private storage tenant pubkit-checks, which a pull request to Sustenaut/storage
#     adds to its tenants.json (its deploy publishes it);
#   - integrations' INGEST_PUBKIT_CHECKS, which a pull request to Sustenaut/release-state
#     sets (its apply sets the variable and redeploys integrations).
# This walks the release unit read-only and passes once both are ready. It changes nothing.
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

git fetch -q origin main
[[ $(git rev-parse HEAD) == $(git rev-parse origin/main) ]] || { echo "check out main first (git latest)" >&2; exit 1; }
grep -q '"pubkit-checks"' pubkit.json || { echo "main has no pubkit-checks tenant yet: merge the pull request first" >&2; exit 1; }
[[ -f ../shared-infra/pubkit.json ]] || { echo "no ../shared-infra checkout beside this one, for the zones" >&2; exit 1; }

walk=$(./with-secrets ./pubdeploy walk --unit release --server sustenaut --zones ../shared-infra/pubkit.json 2>&1 || true)
missing=$(grep -E '^(missing|drift|blocked) +(storage\.tenant:pubkit-checks|github\.variable-entry:Sustenaut/integrations/INGEST_PUBKIT_CHECKS)' <<<"$walk" || true)
if [[ -n $missing ]]; then
  echo "Not ready yet:"
  while IFS= read -r line; do echo "  $line"; done <<<"$missing"
  cat <<'TODO'

  storage.tenant:pubkit-checks       merge Sustenaut/storage's pull request adding it to tenants.json
  INGEST_PUBKIT_CHECKS (both parts)  merge Sustenaut/release-state's pull request setting it
Then run this again.
TODO
  exit 1
fi
cat <<'DONE'
Ready: the tenant pubkit-checks and integrations' INGEST_PUBKIT_CHECKS are in place.
Tonight's nightly (02:41 UTC) writes the first facts; to try it now:
  gh workflow run nightly -R Sustenaut/release-controlplane
DONE
