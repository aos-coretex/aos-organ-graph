# Graph — Graph-Native Data Store Organ

## Identity

- **Organ:** Graph (#40)
- **Profile:** Deterministic
- **MP-3 deliverable:** data plane (encapsulated database + HTTP API with adapter pattern)

## Current State (MP-3, Relay 5 complete)

Data-plane implementation: SQLite database with graph-native concepts and class_bindings, HTTP API server with full CRUD, storage adapter pattern (SQLiteAdapter is current; GraphheightAdapter will replace it transparently). Call-pattern telemetry operational.

- Seeded from the monolith `ai-kb.db` (Relay 3). Only Graph-owned concept types included.
- HTTP API with all data-plane endpoints (Relay 4): concepts, bindings, query, search, entities, transactions, stats, health, introspect.
- Adapter pattern enforced: all database access goes through `SQLiteStorageAdapter`, wrapped in `TelemetryAdapter`. Route handlers never touch SQLite directly.
- Encapsulation audit passed (Relay 4): zero ESB organs access another organ's database. See `docs/encapsulation-audit.md`.
- Adapter API specification locked (Relay 5): `docs/graph-adapter-api-spec.md`. All operations mapped to future Graphheight services.
- Call-pattern telemetry (Relay 5): every adapter call logged to `adapter_telemetry` table with operation, caller, args_shape, duration, status. Query endpoints at `/telemetry/summary` and `/telemetry/recent`.
- Graphheight 411 (blockchain) + 614 (instance binding) stubs: 8 operations return 501, logged as `not_implemented` in telemetry.

**Pending (MP-4):**
- Spine WebSocket connection, mailbox registration, OTM message processing, live loop

## Running

```bash
npm start       # Start server (port 4020 AOS / 3920 SAAS)
npm test        # Run unit tests
npm run seed    # Populate graph.db from monolith ai-kb.db
npm run audit   # Verify database schema purity
```

## Ports

| Environment | Port |
|---|---|
| AOS (development) | 4020 |
| SAAS (production) | 3920 |

## Database

- **Path:** `data/graph.db` (gitignored)
- **Schema version:** 4.0.0
- **Core tables:** `concepts` (graph-native vertices), `class_bindings` (graph-native edges)
- **Operational tables:** `op_sync_state`, `op_agent_tasks`, `op_config`, `adapter_telemetry`
- **Views:** `v_entities`, `v_doc_transactions`, `v_documents` (monolith-format field names)
- **WAL mode** with 5000ms busy_timeout

## Key Principles

- Graph = interim Graphheight. When Graphheight becomes operational, Graph becomes a thin proxy via the adapter pattern.
- No other organ accesses the SQLite file directly. All reads/writes go through Graph's HTTP API.
- Views use monolith-format JSON field names ($.entity not $.name, $.obsidian_vault not $.vault_path). When Graphheight replaces the backend, data format and views change together.
- Concept type ownership: see `docs/concept-type-ownership.md`

## Conventions

- ES modules (`import`/`export`)
- Node.js built-in test runner (`node:test`, `node:assert/strict`)
- Router factory functions with dependency injection (no `app.locals`)
- In-memory SQLite (`:memory:`) for test isolation
- Structured JSON logging to stdout
- URN format: `urn:llm-ops:<type>:<identifier>`
