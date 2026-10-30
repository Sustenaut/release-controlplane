#!/usr/bin/env bash
# Send the release apps' ids and keys from Bitwarden to GitHub, as secrets.json
# says. Run it through with-secrets, which puts the Bitwarden project's secrets
# in its environment, each under its name in upper case with "-" as "_":
#
#   ./with-secrets scripts/push-secrets.sh --check   # checks only, sends nothing
#   ./with-secrets scripts/push-secrets.sh
#
# It uploads nothing until every name is there and every value looks right, so
# a mistake never leaves GitHub half updated. It prints names and lengths, never
# a value, and a value reaches gh on its standard input, never its command line.
# Run it again at any time: it only overwrites.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
map="${PUSH_SECRETS_MAP:-$root/secrets.json}"

check_only=false
case "${1:-}" in
  "") ;;
  --check) check_only=true ;;
  *)
    echo "usage: ./with-secrets scripts/push-secrets.sh [--check]" >&2
    exit 2
    ;;
esac

for tool in jq gh; do
  command -v "$tool" >/dev/null || { echo "$tool is not installed." >&2; exit 1; }
done

variable_of() { tr 'a-z-' 'A-Z_' <<<"$1"; }

mapfile -t names < <(jq -r '.secrets[].name' "$map")
is_optional() { jq -e --arg name "$1" '.secrets[] | select(.name == $name) | .optional == true' "$map" >/dev/null; }

# Step 1: every name is in the Bitwarden project.
missing=0
present=()
echo "Step 1: names"
for name in "${names[@]}"; do
  variable=$(variable_of "$name")
  if [ -n "${!variable+set}" ]; then
    echo "  found    $name"
    present+=("$name")
  elif is_optional "$name"; then
    echo "  missing  $name (optional: it will be skipped)"
  else
    echo "  MISSING  $name"
    missing=$((missing + 1))
  fi
done
if [ "$missing" -gt 0 ]; then
  echo "$missing of ${#names[@]} names are required but not in the Bitwarden project, or its machine account can't read them." >&2
  echo "Add or rename them there, or change the names in secrets.json. Nothing was uploaded." >&2
  exit 1
fi

# Step 2: every value has content of the right kind.
bad=0
echo "Step 2: values"
for name in "${present[@]}"; do
  variable=$(variable_of "$name")
  value="${!variable}"
  check=$(jq -r --arg name "$name" '.secrets[] | select(.name == $name) | .check' "$map")
  problem=""
  if [ -z "$value" ]; then
    problem="is empty"
  elif [ "$check" = id ] && ! [[ $value =~ ^[0-9]+$ ]]; then
    problem="is not an id: only digits are expected"
  elif [ "$check" = key ] && ! [[ $value == "-----BEGIN "*"PRIVATE KEY-----"* && $value == *"-----END "*"PRIVATE KEY-----"* ]]; then
    problem="is not a private key: it needs its BEGIN and END lines"
  fi
  if [ -n "$problem" ]; then
    echo "  BAD      $name $problem (${#value} characters)"
    bad=$((bad + 1))
  else
    echo "  ok       $name (${#value} characters)"
  fi
done
if [ "$bad" -gt 0 ]; then
  echo "$bad of ${#present[@]} values are wrong. Nothing was uploaded." >&2
  exit 1
fi

if $check_only; then
  echo "All ${#present[@]} that are present look right. --check: nothing was uploaded."
  exit 0
fi

# An environment that only its branch may use, made before anything goes in it.
echo "Step 3: upload"
mapfile -t environments < <(jq -r '.environments // {} | keys[]' "$map")
for target in "${environments[@]}"; do
  repo=${target%%#*}
  environment=${target#*#}
  branch=$(jq -r --arg target "$target" '.environments[$target].branch' "$map")
  gh api -X PUT "repos/$repo/environments/$environment" --silent --input - <<<'{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}'
  allowed=$(gh api "repos/$repo/environments/$environment/deployment-branch-policies" --jq '[.branch_policies[].name] | join(" ")')
  if [[ " $allowed " != *" $branch "* ]]; then
    gh api -X POST "repos/$repo/environments/$environment/deployment-branch-policies" --silent -f "name=$branch" -f type=branch
  fi
  echo "  ready    environment $environment of $repo, for $branch only"
done

failed=0
for name in "${present[@]}"; do
  variable=$(variable_of "$name")
  kind=$(jq -r --arg name "$name" '.secrets[] | select(.name == $name) | .kind' "$map")
  github=$(jq -r --arg name "$name" '.secrets[] | select(.name == $name) | .github' "$map")
  mapfile -t targets < <(jq -r --arg name "$name" '.secrets[] | select(.name == $name) | .to[]' "$map")
  for target in "${targets[@]}"; do
    repo=${target%%#*}
    where=(-R "$repo")
    if [[ $target == *"#"* ]]; then where+=(--env "${target#*#}"); fi
    if printf '%s' "${!variable}" | gh "$kind" set "$github" "${where[@]}" >/dev/null; then
      echo "  sent     $name -> $kind $github in $target"
    else
      echo "  FAILED   $name -> $kind $github in $target" >&2
      failed=$((failed + 1))
    fi
  done
done
if [ "$failed" -gt 0 ]; then
  echo "$failed uploads failed. Fix what gh said above and run this again." >&2
  exit 1
fi
echo "Done: ${#present[@]} values sent."
