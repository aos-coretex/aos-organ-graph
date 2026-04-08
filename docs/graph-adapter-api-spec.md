# Graph Adapter API Specification

> Version: 1.0.0
> Date: 2026-04-07
> Status: Active (loose — stabilizing via telemetry)
> Locked by: MP-3 Relay 5

## Operations

### Concept Operations (-> Graphheight 511: uGraph_concept)

| Operation | Parameters | Returns | HTTP Endpoint |
|---|---|---|---|
| `insertConcept` | `urn: string, data: JSON (must include type)` | `{ urn, type, status: "created" }` | `POST /concepts` |
| `getConcept` | `urn: string` | `{ urn, data, created_at }` or null | `GET /concepts/:urn` |
| `updateConcept` | `urn: string, mergeData: JSON` | `{ urn, data, status: "updated" }` | `PATCH /concepts/:urn` |
| `queryConcepts` | `sql: string (SELECT), params: any[]` | `{ rows, count }` | `POST /query` |

### Blockchain Operations (-> Graphheight 411: uGraph_blockchain)

| Operation | Parameters | Returns | HTTP Endpoint | Status |
|---|---|---|---|---|
| `recordRuling` | `ruling: JSON (append-only)` | `{ urn, status: "recorded" }` | -- | **STUB** |
| `checkSpent` | `token_urn: string` | `{ spent: boolean }` | -- | **STUB** |
| `markSpent` | `token_urn: string, executor: string` | `{ status: "spent" }` | -- | **STUB** |
| `mintToken` | `scope: JSON, ttl: number` | `{ token_urn, expires_at }` | -- | **STUB** |
| `mintGovernanceVersion` | `document: string, hash: string` | `{ version_urn, hash }` | -- | **STUB** |
| `verifyHash` | `version_urn: string, hash: string` | `{ valid: boolean }` | -- | **STUB** |

### Binding Operations (-> Graphheight 611-614)

| Operation | Graphheight Service | Parameters | Returns | HTTP Endpoint |
|---|---|---|---|---|
| `insertBinding` | 611 (class) / 612 (symbolic) / 613 (composition) / 614 (instance) | `ubn: string, data: JSON (from_urn, to_urn, relation)` | `{ ubn, relation, from, to, status: "created" }` | `POST /bindings` |
| `getBinding` | -- | `ubn: string` | `{ ubn, data, created_at }` or null | `GET /bindings/:ubn` |
| `queryBindings` | 912 (Graph8QL) | `sql: string, params: any[]` | `{ rows, count }` | `POST /query` |
| `bindInstance` | 614 (instance) | `from_urn, to_urn, relation, instance_data` | `{ ubn, status: "created" }` | -- | **STUB** |

### Discovery Operations (existing)

| Operation | Parameters | Returns | HTTP Endpoint |
|---|---|---|---|
| `search` | `keyword: string, concept_type?: string, limit?: number` | `{ results, count }` | `POST /search` |
| `getEntities` | `tier?: string, status?: string` | `{ entities, count }` | `GET /entities` |
| `getStats` | -- | `{ total_concepts, total_bindings, concepts_by_type, ... }` | `GET /stats` |

### Transaction Operations

| Operation | Parameters | Returns | HTTP Endpoint |
|---|---|---|---|
| `insertTransaction` | `operation, entity, context, paths, operator, state, ...` | `{ urn, timestamp, binding, status: "created" }` | `POST /transactions` |

### Reference Operations (-> Graphheight 411)

| Operation | Parameters | Returns | Status |
|---|---|---|---|
| `publishReference` | `source_urn, target_system, target_id` | `{ reference_urn, status: "published" }` | **STUB** |

## Telemetry

Every adapter call is instrumented by `TelemetryAdapter` (decorator pattern). Telemetry is recorded in the `adapter_telemetry` table — operational instrumentation outside the graph-native model.

### Telemetry Fields

| Field | Type | Description |
|---|---|---|
| `operation` | TEXT | Adapter method name (e.g., `insertConcept`) |
| `caller` | TEXT | Organ name from `X-Organ-Name` header, or `direct` |
| `args_shape` | TEXT | Compact type description of arguments (types, not values) |
| `duration_ms` | REAL | Wall-clock execution time in milliseconds |
| `status` | TEXT | `ok`, `error`, or `not_implemented` |
| `error_message` | TEXT | Error message (only when status = `error`) |
| `timestamp` | TEXT | ISO 8601 timestamp |

### Args Shape Format

Compact type descriptor revealing access patterns without logging sensitive data.

| Argument type | Shape format | Example |
|---|---|---|
| String (plain) | `paramName:string(length)` | `urn:string(22)` |
| String (JSON object) | `paramName:object{keys}` | `data:object{type,name}` |
| String (JSON array) | `paramName:array(length)` | `params:array(3)` |
| Number | `paramName:number` | `limit:number` |
| Boolean | `paramName:boolean` | `flag:boolean` |
| Null | `paramName:null` | `tier:null` |
| Undefined | `paramName:undefined` | `status:undefined` |
| Object | `paramName:object{keys}` | `fields:object{operation,entity}` |
| Array | `paramName:array(length)` | `params:array(0)` |

### Telemetry Query Endpoints

| Endpoint | Method | Query Params | Response |
|---|---|---|---|
| `/telemetry/summary` | GET | `since?: ISO8601, operation?: string, caller?: string` | `{ operations: [{ operation, call_count, avg_duration_ms, error_count, callers }], total_calls, period_start, period_end }` |
| `/telemetry/recent` | GET | `limit?: number` (default 50) | `{ entries: TelemetryEntry[], count }` |

## Graphheight Service Mapping

When Graphheight becomes operational, each adapter operation routes to its target service:

| Adapter Operation | Graphheight Service | Port |
|---|---|---|
| `insertConcept`, `getConcept`, `updateConcept` | 511 (uGraph_concept) | TBD |
| `insertBinding`, `getBinding` | 611-614 (binding generators) | TBD |
| `bindInstance` | 614 (uGraph_instance_bindings) | TBD |
| `query`, `search`, `queryBindings` | 912 (Graph8QL) | TBD |
| `recordRuling`, `checkSpent`, `markSpent`, `mintToken`, `mintGovernanceVersion`, `verifyHash` | 411 (uGraph_blockchain) | TBD |
| `publishReference` | 411 (uGraph_blockchain) | TBD |
| `getEntities`, `getStats` | 911 (admin webserver) | TBD |

## Migration Path

1. **Current:** SQLiteStorageAdapter handles all operations. TelemetryAdapter wraps it for instrumentation.
2. **Stabilization:** Telemetry data reveals which operations are called most, by whom, with what patterns.
3. **Contract lock:** When telemetry confirms stable access patterns, the API spec version increments and locks.
4. **Graphheight mirror:** Graphheight's external API is built to match the locked adapter contract.
5. **Swap:** GraphheightStorageAdapter replaces SQLiteStorageAdapter. TelemetryAdapter wraps it identically.
6. **Thin proxy:** When adapter overhead is negligible (confirmed by telemetry), Graph becomes a thin HTTP proxy to Graphheight.
