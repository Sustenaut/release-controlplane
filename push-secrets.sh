#!/usr/bin/env bash
# Puts the app's secrets into the cluster on the Sustenaut k3s server: the Secret
# release-secrets and the network policy (k8s/admin/), in namespace release. Run it from
# the repository root through with-secrets, whenever a secret or var.team changes:
#
#   ./with-secrets ./push-secrets.sh
#
# From Bitwarden (which with-secrets exports in upper case):
#   github-release-reader-id, github-release-reader-key    the reader app
#   github-release-writer-id, github-release-writer-key    the state writer app
#   release-cookie-secret      oauth2-proxy's cookie secret (32 random bytes, base64)
# From Terraform: the team (var.team), and the owner, the one operator for now.
# Not here: the sign-in client (the Secret release-oidc), which register-client.sh
# registers with auth.sustenaut.eu and puts in on the server.
# They travel to the server inside the SSH connection, never on a command line. The
# pods read them at start: after a change, restart them with
#   ssh root@sustenaut k3s kubectl -n release rollout restart deployment/app deployment/oauth2-proxy
set -euo pipefail
root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
# Terraform outputs come from business-plan's infra/: a checkout of it beside this one,
# or BUSINESS_PLAN=its path.
infra="${BUSINESS_PLAN:-$root/../business-plan}/infra"
[ -d "$infra" ] || { echo "no business-plan checkout at ${infra%/infra}: clone it beside this repository or set BUSINESS_PLAN" >&2; exit 1; }

for name in GITHUB_RELEASE_READER_ID GITHUB_RELEASE_READER_KEY GITHUB_RELEASE_WRITER_ID \
  GITHUB_RELEASE_WRITER_KEY RELEASE_COOKIE_SECRET; do
  if [ -z "${!name:-}" ]; then
    echo "$name is not set: run this through ./with-secrets, and check the secret is in Bitwarden." >&2
    exit 1
  fi
done

# SSH reaches the server over Sustenaut's tailnet only (be signed in to it).
server=$(terraform -chdir="$infra" output -json sustenaut_server | jq -r .ssh_host)
site=$(terraform -chdir="$infra" output -json opportunity)
team=$(jq -r '.team | join(",")' <<<"$site")
team_emails=$(jq -r '.team[]' <<<"$site")
owner=$(jq -r .owner <<<"$site")
b64() { printf '%s' "$1" | base64 -w0; }

# shellcheck disable=SC2087 # expanded here on purpose: the values go in the SSH stream
ssh "root@$server" 'k3s kubectl apply -f -' <<YAML
apiVersion: v1
kind: Secret
type: Opaque
metadata:
  name: release-secrets
  namespace: release
data:
  reader-app-id: $(b64 "$GITHUB_RELEASE_READER_ID")
  reader-app-key: $(b64 "$GITHUB_RELEASE_READER_KEY")
  writer-app-id: $(b64 "$GITHUB_RELEASE_WRITER_ID")
  writer-app-key: $(b64 "$GITHUB_RELEASE_WRITER_KEY")
  cookie-secret: $(b64 "$RELEASE_COOKIE_SECRET")
  team: $(b64 "$team")
  team-emails: $(b64 "$team_emails")
  operators: $(b64 "$owner")
---
$(cat "$root/k8s/admin/network-policy.yaml")
YAML
