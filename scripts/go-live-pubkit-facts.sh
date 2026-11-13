#!/usr/bin/env bash
# Brings up the nightly's pubkit facts (README, fleet-nightly.yml's pubkit job): the
# private storage tenant pubkit-checks they go to, which pubkit.json's deploy block
# declares. Run it once this is merged, from this repository's root on main (git latest),
# with its .env for ./with-secrets and the shared-infra checkout beside it:
#
#   scripts/go-live-pubkit-facts.sh
#
# It walks the release unit with --fulfil, which makes what is missing and skips what is
# ready: here the tenant (written by this repository's main, as its GitHub Actions job's
# token) and the check that integrations' INGEST_PUBKIT_CHECKS names it (set by
# Sustenaut/release-state). It asks before each change, and the first error stops it.
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

git fetch -q origin main
[[ $(git rev-parse HEAD) == $(git rev-parse origin/main) ]] || { echo "check out main first (git latest)" >&2; exit 1; }
grep -q '"pubkit-checks"' pubkit.json || { echo "main has no pubkit-checks tenant yet: merge the pull request first" >&2; exit 1; }
[[ -f ../shared-infra/pubkit.json ]] || { echo "no ../shared-infra checkout beside this one, for the zones" >&2; exit 1; }

./with-secrets ./pubdeploy walk --fulfil --unit release --server sustenaut --zones ../shared-infra/pubkit.json

cat <<'DONE'

Done. Tonight's nightly (02:41 UTC) writes the first facts; to try it now:
  gh workflow run nightly -R Sustenaut/release-controlplane
The ingest loads them once INGEST_PUBKIT_CHECKS is set (Sustenaut/release-state).
DONE
