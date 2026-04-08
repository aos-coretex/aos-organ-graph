# CV Tests — Encapsulation Verification

> **Group:** `encapsulation`
> **Schedule:** `daily`
> **Deterministic triggers:** `organ_startup`
> **Test count:** 11 (5 unit + 6 integration)
> **Script:** `scripts/cv-tests-encapsulation.js`
> **Runner:** `scripts/run-encap-tests.js`
> **Registration:** `scripts/register-cv-tests.js`

---

## Purpose

These tests verify that the ESB organ architecture maintains strict database encapsulation:
- Each organ's database contains only its owned concept types
- No organ accesses another organ's database directly
- All inter-organ data access occurs through HTTP APIs
- SafeVault backs up all organ databases

---

## Unit Tests

### encap-vigil-db-isolated

| Field | Value |
|---|---|
| **Tier** | unit |
| **What it verifies** | Vigil's database contains only `verification_result` and `test_definition` concepts |
| **Method** | Opens `vigil.db` read-only, queries distinct concept types |
| **Pass** | All types are in the allowed set |
| **Fail** | Any unexpected concept type found in vigil.db |
| **Dependencies** | None (database-level) |

### encap-glia-db-isolated

| Field | Value |
|---|---|
| **Tier** | unit |
| **What it verifies** | Glia's database contains only `autoheal_ticket` and `remediation_result` concepts |
| **Method** | Opens `glia.db` read-only, queries distinct concept types |
| **Pass** | All types are in the allowed set |
| **Fail** | Any unexpected concept type found in glia.db |
| **Dependencies** | None (database-level) |

### encap-graph-db-clean

| Field | Value |
|---|---|
| **Tier** | unit |
| **What it verifies** | Graph's database does not contain types owned by other organs |
| **Method** | Opens `graph.db` read-only, queries distinct concept types |
| **Pass** | None of `verification_result`, `autoheal_ticket`, `remediation_result`, `event` found |
| **Fail** | Any excluded concept type found in graph.db |
| **Dependencies** | None (database-level) |

### encap-no-cross-db-access

| Field | Value |
|---|---|
| **Tier** | unit |
| **What it verifies** | No organ's source code imports SQLite targeting another organ's database |
| **Method** | Static analysis: grep for SQLite imports across all organ source trees, verify each file only references its own database |
| **Pass** | All SQLite-importing files reference only their own organ's database |
| **Fail** | Any file references another organ's `.db` file (seed scripts excluded) |
| **Dependencies** | None (static analysis) |

### encap-safevault-targets

| Field | Value |
|---|---|
| **Tier** | unit |
| **What it verifies** | SafeVault backup script includes all three organ databases |
| **Method** | Reads the SafeVault backup script, checks for `vigil.db`, `glia.db`, `graph.db` references |
| **Pass** | All three database filenames found in the backup script |
| **Fail** | Any organ database missing from the backup configuration |
| **Dependencies** | None (file-level) |

---

## Integration Tests

All integration tests require the respective organ servers to be running.

### encap-graph-api-concepts

| Field | Value |
|---|---|
| **Tier** | integration |
| **What it verifies** | Graph API correctly handles concept CRUD (insert, get, update) |
| **Method** | POST a test concept (`urn:cv-test:` prefix) → GET it back → PATCH with merge data → verify merge |
| **Pass** | All 4 operations return expected status codes and data |
| **Fail** | Any operation returns unexpected status or data mismatch |
| **Dependencies** | `encap-graph-db-clean` |
| **Cleanup** | Test data uses `urn:cv-test:` prefix for identification |

### encap-graph-api-bindings

| Field | Value |
|---|---|
| **Tier** | integration |
| **What it verifies** | Graph API correctly handles binding CRUD (insert, get) |
| **Method** | POST a test binding (`ubn:cv-test:` prefix) → GET it back → verify from_urn, to_urn, relation |
| **Pass** | Both operations return expected status codes and binding fields present |
| **Fail** | Any operation returns unexpected status or missing fields |
| **Dependencies** | `encap-graph-db-clean` |

### encap-graph-api-query-safety

| Field | Value |
|---|---|
| **Tier** | integration |
| **What it verifies** | Graph API rejects non-SELECT queries |
| **Method** | POST DROP statement → expect 400, POST DELETE statement → expect 400, POST SELECT → expect 200 |
| **Pass** | DROP and DELETE return 400, SELECT returns 200 |
| **Fail** | Any non-SELECT query accepted, or SELECT query rejected |
| **Dependencies** | `encap-graph-db-clean` |

### encap-vigil-api-results

| Field | Value |
|---|---|
| **Tier** | integration |
| **What it verifies** | Vigil API stores and retrieves test results correctly |
| **Method** | POST a test result → GET it back → check it appears in status dashboard |
| **Pass** | All 3 operations return expected status codes and matching data |
| **Fail** | Result storage, retrieval, or dashboard listing fails |
| **Dependencies** | `encap-vigil-db-isolated` |

### encap-glia-api-tickets

| Field | Value |
|---|---|
| **Tier** | integration |
| **What it verifies** | Glia API creates and transitions tickets through the full state machine |
| **Method** | POST ticket (→pending) → classify (→classifying) → dispatch (→dispatched) → heal (→healing) → resolve (→solved) → verify in queue |
| **Pass** | All 5 state transitions succeed with expected status codes, final state is `solved` |
| **Fail** | Any state transition rejected or final state incorrect |
| **Dependencies** | `encap-glia-db-isolated` |

### encap-graph-telemetry-logging

| Field | Value |
|---|---|
| **Tier** | integration |
| **What it verifies** | Graph adapter telemetry captures call patterns |
| **Method** | Make 3 API calls (insert, get, query) → check /telemetry/summary and /telemetry/recent |
| **Pass** | Telemetry entries exist with operation, duration, and caller fields |
| **Fail** | No telemetry recorded or entries missing required fields |
| **Dependencies** | `encap-graph-db-clean` |

---

## Running

```bash
# All tests (requires Graph on 4020, Vigil on 4015, Glia on 4016)
node scripts/run-encap-tests.js

# Unit tests only (no servers required)
node scripts/run-encap-tests.js --unit-only

# Integration tests only
node scripts/run-encap-tests.js --integration-only

# JSON output
node scripts/run-encap-tests.js --json

# Register tests in Vigil (requires Vigil running)
node scripts/register-cv-tests.js
```

---

## Registration

Tests are registered in Vigil's database via `POST /tests/register`, not in the monolith CV registry YAML. This is the ESB-native registration mechanism. The monolith registry is not modified.

When the monolith CV registry is deprecated, these test definitions are already in Vigil's database and require no migration.
