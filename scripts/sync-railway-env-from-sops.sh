#!/usr/bin/env bash

set -euo pipefail

SERVICE="${1:-}"
ENVIRONMENT="${2:-default}"
SECRETS_FILE="${3:-ops/secrets/services.enc.yaml}"

if [[ -z "$SERVICE" ]]; then
  echo "Usage: bash scripts/sync-railway-env-from-sops.sh <service> [environment] [secrets_file]"
  exit 1
fi

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "[env-sync] $SECRETS_FILE not found, skipping sync"
  exit 0
fi

if ! command -v sops >/dev/null 2>&1; then
  echo "[env-sync] sops is required but not installed"
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "[env-sync] npx is required but not available"
  exit 1
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

sops -d "$SECRETS_FILE" > "$TMP_FILE"

extract_block() {
  local service="$1"
  local target_env="$2"
  local file="$3"

  awk -v service="$service" -v target_env="$target_env" '
    BEGIN {
      in_service = 0;
      in_block = 0;
      found_block = 0;
    }

    /^  [A-Za-z0-9_-]+:/ {
      if ($0 ~ "^  " service ":$") {
        in_service = 1;
        in_block = 0;
      } else {
        in_service = 0;
        in_block = 0;
      }
      next;
    }

    in_service == 1 && $0 ~ "^    " target_env ": \|$" {
      in_block = 1;
      found_block = 1;
      next;
    }

    in_service == 1 && in_block == 1 {
      if ($0 ~ /^    [A-Za-z0-9_-]+:/ || $0 ~ /^  [A-Za-z0-9_-]+:/ || $0 ~ /^sops:/) {
        in_block = 0;
        next;
      }

      if ($0 ~ /^      /) {
        print substr($0, 7);
      } else if ($0 ~ /^[[:space:]]*$/) {
        print "";
      }
    }

    END {
      if (found_block == 0) {
        exit 2;
      }
    }
  ' "$file"
}

BLOCK_CONTENT=""
if BLOCK_CONTENT="$(extract_block "$SERVICE" "$ENVIRONMENT" "$TMP_FILE" 2>/dev/null)"; then
  :
elif BLOCK_CONTENT="$(extract_block "$SERVICE" "default" "$TMP_FILE" 2>/dev/null)"; then
  echo "[env-sync] $SERVICE/$ENVIRONMENT not found, falling back to $SERVICE/default"
else
  echo "[env-sync] no env block found for service '$SERVICE'"
  exit 0
fi

if [[ -z "${BLOCK_CONTENT// }" ]]; then
  echo "[env-sync] env block is empty for service '$SERVICE'"
  exit 0
fi

echo "[env-sync] syncing vars for service '$SERVICE' (scope: $ENVIRONMENT)"
while IFS= read -r line; do
  trimmed="${line#${line%%[![:space:]]*}}"
  if [[ -z "$trimmed" || "$trimmed" == \#* ]]; then
    continue
  fi

  if [[ "$trimmed" != *=* ]]; then
    echo "[env-sync] skipping invalid line: $trimmed"
    continue
  fi

  if [[ "$ENVIRONMENT" == "default" ]]; then
    npx @railway/cli variables --set "$trimmed" --service "$SERVICE"
  else
    npx @railway/cli variables --set "$trimmed" --service "$SERVICE" --environment "$ENVIRONMENT"
  fi
done <<< "$BLOCK_CONTENT"

echo "[env-sync] completed for service '$SERVICE'"
