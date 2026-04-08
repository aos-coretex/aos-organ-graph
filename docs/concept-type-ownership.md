# Concept Type Ownership Map

> **Established:** 2026-04-07
> **Authority:** Relay e3d-3 (MP-3: Database Encapsulation)
> **Status:** Definitive — all downstream relays and organ developers reference this document

---

## Ownership Table

| Concept Type | Owner | Rationale |
|---|---|---|
| `entity` | **Graph** | URN-based identity — structural substrate |
| `document` | **Graph** | Filesystem KB document registration |
| `doc_transaction` | **Graph** | Filing operations with entity bindings |
| `class_binding` | **Graph** | Edge data (also in class_bindings table) |
| `architecture` | **Graph** | Architectural documentation concepts |
| `constitutional_article` | **Graph** | Governance structure references |
| `derivation` | **Graph** | Derived structural data |
| `external_reference` | **Graph** | Pointers to external systems |
| `github-organization` | **Graph** | SCM identity concepts |
| `infrastructure` | **Graph** | Infrastructure documentation |
| `infrastructure-directory` | **Graph** | Infrastructure location concepts |
| `event_registry` | **Graph** | Event type definitions (structural metadata, not events) |
| `event_schema` | **Graph** | Event structure definitions (structural metadata) |
| `project` | **Graph** | Project identity concepts |
| `sector` | **Graph** | Sector definitions |
| `persona` | **Graph** | Persona identity |
| `team` | **Graph** | Team identity |
| `verification_result` | **Vigil** | Test results — CV verification data |
| `autoheal_ticket` | **Glia** | Healing tickets — remediation workflow |
| `remediation_result` | **Glia** | Fix outcomes — remediation results |
| `event` | **Spine** | Platform events — event bus data |

## Default Rule

Any concept type encountered that is **not listed** in the table above belongs to **Graph** by default. Structural data stays in the graph. The seed script logs a warning for unlisted types so they can be explicitly classified in a future pass.

## Excluded Types (Seeding)

During seeding from the monolith (`ai-kb.db`), these types are excluded from Graph's database:

| Type | Excluded Because | Migrated To |
|---|---|---|
| `verification_result` | Vigil-owned data | `vigil.db` (Relay e3d-1) |
| `autoheal_ticket` | Glia-owned data | `glia.db` (Relay e3d-2) |
| `remediation_result` | Glia-owned data | `glia.db` (Relay e3d-2) |
| `event` | Spine-owned data | Spine event store (MP-2) |

## Monolith Distribution at Classification Time

Queried 2026-04-07 from `/Library/AI/AI-Datastore/AI-KB-DB/ai-kb.db`:

| Type | Count | Owner |
|---|---|---|
| `verification_result` | 4557 | Vigil |
| `event` | 189 | Spine |
| *(null/empty type)* | 77 | Graph (default rule) |
| `remediation_result` | 31 | Glia |
| `entity` | 15 | Graph |
| `external_reference` | 7 | Graph |
| `team` | 4 | Graph |
| `constitutional_article` | 4 | Graph |
| `document` | 3 | Graph |
| `sector` | 1 | Graph |
| `project` | 1 | Graph |
| `persona` | 1 | Graph |
| `infrastructure-directory` | 1 | Graph |
| `infrastructure` | 1 | Graph |
| `github-organization` | 1 | Graph |
| `event_registry` | 1 | Graph |
| `doc_transaction` | 1 | Graph |
| `derivation` | 1 | Graph |
| `class_binding` | 1 | Graph |
| `architecture` | 1 | Graph |
| **Total** | **4898** | |

**Graph receives:** 121 concepts (4898 - 4557 - 189 - 31 = 121)
**Graph receives:** 179 class_bindings (all — bindings are structural)
