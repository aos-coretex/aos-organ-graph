#!/usr/bin/env bash
#
# seed-governance-v1.sh — MP-17 relay g7c-1 seeder
#
# Seeds the single Constitution concept (urn:llm-ops:governance:constitution) in Graph.
# Idempotent: re-runs detect existing concepts, compare payload shape, report drift.
#
# Exit codes:
#   0 — success (created or already-present-and-matching)
#   2 — drift detected (existing concept payload differs)
#   3 — Graph unreachable or API error
#
# Usage: seed-governance-v1.sh [GRAPH_URL]
#   GRAPH_URL defaults to http://127.0.0.1:4020 (Graph AOS port)

set -euo pipefail

GRAPH_URL="${1:-http://127.0.0.1:4020}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_DIR="${SCRIPT_DIR}/seed-governance-v1"
CONSTITUTION_URN="urn:llm-ops:governance:constitution"
CONSTITUTION_TEMPLATE="${SEED_DIR}/constitution-seed.json"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

require_file() {
  [ -f "$1" ] || { log "ERROR: missing seed file: $1"; exit 3; }
}

check_graph() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${GRAPH_URL}/health" || true)
  [ "$code" = "200" ] || { log "ERROR: Graph not reachable at ${GRAPH_URL} (HTTP ${code})"; exit 3; }
}

urlencode_urn() {
  # URNs contain colons that curl would otherwise misinterpret in the path only if
  # surrounded by forbidden chars. Graph accepts the URN as a path segment directly;
  # we only percent-encode characters that would otherwise break routing.
  printf '%s' "$1" | /usr/bin/python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=":"))'
}

fetch_concept() {
  local urn="$1"
  local encoded
  encoded=$(urlencode_urn "$urn")
  curl -s -w '\n%{http_code}' --max-time 5 "${GRAPH_URL}/concepts/${encoded}"
}

post_concept() {
  local urn="$1" data_json="$2"
  # Graph requires data as an object (not a stringified JSON).
  curl -s -w '\n%{http_code}' --max-time 5 -X POST "${GRAPH_URL}/concepts" \
    -H 'Content-Type: application/json' \
    -d "$(/usr/bin/python3 -c 'import json,sys; print(json.dumps({"urn":sys.argv[1],"data":json.loads(sys.argv[2])}))' "$urn" "$data_json")"
}

seed_constitution() {
  require_file "$CONSTITUTION_TEMPLATE"
  local payload
  payload=$(/usr/bin/python3 -c '
import json, sys, datetime
with open(sys.argv[1]) as f:
    d = json.load(f)
d["seeded_at_iso"] = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"
print(json.dumps(d, separators=(",", ":")))
' "$CONSTITUTION_TEMPLATE")

  log "checking Constitution at ${CONSTITUTION_URN}"
  local resp body code
  resp=$(fetch_concept "$CONSTITUTION_URN")
  body=$(printf '%s' "$resp" | /usr/bin/sed '$d')
  code=$(printf '%s' "$resp" | /usr/bin/tail -n1)

  if [ "$code" = "200" ]; then
    # Compare on shape (type, version, REQUIRES_HUMAN_AUTHORSHIP, scope, authority).
    local drift
    drift=$(/usr/bin/python3 -c '
import json, sys
existing = json.loads(sys.argv[1]).get("data", {})
proposed = json.loads(sys.argv[2])
keys = ["type", "version", "REQUIRES_HUMAN_AUTHORSHIP", "authority", "scope"]
diffs = [k for k in keys if existing.get(k) != proposed.get(k)]
print(",".join(diffs) if diffs else "")
' "$body" "$payload")
    if [ -n "$drift" ]; then
      log "WARN: Constitution exists but drifts on fields: $drift"
      log "      existing URN: $CONSTITUTION_URN (inspect manually via GET /concepts)"
      return 2
    fi
    log "Constitution already present with matching shape — no write"
    return 0
  fi
  if [ "$code" = "404" ]; then
    log "Constitution not found — inserting"
    local insert_resp insert_code
    insert_resp=$(post_concept "$CONSTITUTION_URN" "$payload")
    insert_code=$(printf '%s' "$insert_resp" | /usr/bin/tail -n1)
    if [ "$insert_code" = "201" ]; then
      log "Constitution created"
      return 0
    else
      log "ERROR: unexpected POST /concepts response: HTTP $insert_code"
      printf '%s\n' "$insert_resp" | /usr/bin/sed '$d'
      return 3
    fi
  fi
  log "ERROR: unexpected GET /concepts/:urn response: HTTP $code"
  return 3
}

log "seed-governance-v1 starting (Graph: ${GRAPH_URL})"
check_graph
rc=0
seed_constitution || rc=$?
log "done (exit $rc)"
exit $rc
