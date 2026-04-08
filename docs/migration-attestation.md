# Data Migration Attestation Report

> Generated: 2026-04-08T01:17:09.004Z
> Source: /Library/AI/AI-Datastore/AI-KB-DB/ai-kb.db (monolith)
> Targets: graph.db, vigil.db, glia.db

## Row Count Accounting

| Source | Count |
|---|---|
| Monolith total concepts | 4913 |
| Events (excluded — Spine) | 189 |
| Graph concepts | 121 |
| Vigil concepts | 4572 |
| Glia concepts | 32 |
| **Balance** | **-1** (1 orphan — monolith deleted after prior seed) |

## Binding Completeness

| Source | Count |
|---|---|
| Monolith bindings | 179 |
| Graph bindings | 179 |
| **Delta** | **0** |

## Concept Type Purity

| Database | Types Found | Expected | Status |
|---|---|---|---|
| Graph | (null), architecture, class_binding, constitutional_article, derivation, doc_transaction, document, entity, event_registry, external_reference, github-organization, infrastructure, infrastructure-directory, persona, project, sector, team | All except verification_result, autoheal_ticket, remediation_result, event | PASS |
| Vigil | verification_result | verification_result, test_definition | PASS |
| Glia | autoheal_ticket, remediation_result | autoheal_ticket, remediation_result | PASS |

## Data Integrity

| Check | Result |
|---|---|
| Sample checksum (100 per DB) | PASS |
| JSON validity | PASS |
| Binding referential integrity | PASS (0 migration-caused, 13 pre-existing, 30 cross-organ) |
| Schema structure | PASS |
| Idempotency | PASS (zero new rows) |

## Migration Delta (this run)

| Database | Before | After | New Rows |
|---|---|---|---|
| Graph concepts | 121 | 121 | 0 |
| Vigil concepts | 4572 | 4572 | 0 |
| Glia concepts | 32 | 32 | 0 |

## Dangling References

### Cross-Organ References (expected — resolved via Spine)

- `ubn:llm-ops:corroboration:2026-04-02T01:35:05Z-cross_pollination_radiant_to_minder:sourced-from` → `urn:llm-ops:event:2026-04-02T01:35:05Z-cross_pollination_radiant_to_minder` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:corroboration:2026-04-02T01:35:05Z-cross_pollination_radiant_to_minder:created` → `urn:llm-ops:event:2026-04-02T01:35:05Z-cross_pollination_radiant_to_minder` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:corroboration:2026-04-02T01:54:59Z-cross_pollination_radiant_to_minder:sourced-from` → `urn:llm-ops:event:2026-04-02T01:54:59Z-cross_pollination_radiant_to_minder` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:corroboration:2026-04-02T01:54:59Z-cross_pollination_radiant_to_minder:created` → `urn:llm-ops:event:2026-04-02T01:54:59Z-cross_pollination_radiant_to_minder` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:corroboration:2026-04-02T01:55:08Z-cross_pollination_radiant_to_minder:sourced-from` → `urn:llm-ops:event:2026-04-02T01:55:08Z-cross_pollination_radiant_to_minder` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:corroboration:2026-04-02T01:55:08Z-cross_pollination_radiant_to_minder:created` → `urn:llm-ops:event:2026-04-02T01:55:08Z-cross_pollination_radiant_to_minder` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T02:10:20Z:participated-by` → `urn:llm-ops:event:2026-04-02T02:10:20Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T02:10:20Z:observed-by` → `urn:llm-ops:event:2026-04-02T02:10:20Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T15:30:55Z:participated-by` → `urn:llm-ops:event:2026-04-02T15:30:55Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T15:30:55Z:observed-by` → `urn:llm-ops:event:2026-04-02T15:30:55Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T16:29:50Z:participated-by` → `urn:llm-ops:event:2026-04-02T16:29:50Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T16:29:50Z:observed-by` → `urn:llm-ops:event:2026-04-02T16:29:50Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T16:50:38Z:participated-by` → `urn:llm-ops:event:2026-04-02T16:50:38Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T16:50:38Z:observed-by` → `urn:llm-ops:event:2026-04-02T16:50:38Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T16:54:16Z:participated-by` → `urn:llm-ops:event:2026-04-02T16:54:16Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T16:54:16Z:observed-by` → `urn:llm-ops:event:2026-04-02T16:54:16Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T17:11:05Z:participated-by` → `urn:llm-ops:event:2026-04-02T17:11:05Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T17:11:05Z:observed-by` → `urn:llm-ops:event:2026-04-02T17:11:05Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T17:20:24Z:participated-by` → `urn:llm-ops:event:2026-04-02T17:20:24Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T17:20:24Z:observed-by` → `urn:llm-ops:event:2026-04-02T17:20:24Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T17:32:03Z:participated-by` → `urn:llm-ops:event:2026-04-02T17:32:03Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T17:32:03Z:observed-by` → `urn:llm-ops:event:2026-04-02T17:32:03Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T17:35:23Z:participated-by` → `urn:llm-ops:event:2026-04-02T17:35:23Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T17:35:23Z:observed-by` → `urn:llm-ops:event:2026-04-02T17:35:23Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T18:34:48Z:participated-by` → `urn:llm-ops:event:2026-04-02T18:34:48Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T18:34:48Z:observed-by` → `urn:llm-ops:event:2026-04-02T18:34:48Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T18:36:27Z:participated-by` → `urn:llm-ops:event:2026-04-02T18:36:27Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T18:36:27Z:observed-by` → `urn:llm-ops:event:2026-04-02T18:36:27Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T18:39:17Z:participated-by` → `urn:llm-ops:event:2026-04-02T18:39:17Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))
- `ubn:llm-ops:session:2026-04-02T18:39:17Z:observed-by` → `urn:llm-ops:event:2026-04-02T18:39:17Z-session_start` (field: `out_concept_urn`, found in: monolith_only (Spine event))

### Pre-Existing Dangling (not in any database — monolith data quality)

- `ubn:ai-kb:owns-repo-org:llm-ops:coretex-agentic` → `urn:ai-kb:entity:llm-ops` (field: `from_urn`)
- `ubn:llm-ops:event-binding:2026-04-02T01:04:49Z-session_classified_decision-0` → `urn:llm-ops:entity:llm-ops` (field: `subject`)
- `ubn:llm-ops:binding:caeb-consumer-autoheal` → `urn:llm-ops:entity:caeb` (field: `target`)
- `ubn:llm-ops:binding:caeb-consumer-mcb` → `urn:llm-ops:entity:caeb` (field: `target`)
- `ubn:coretex:project:syntra:platform-binding` → `urn:llm-ops:concept:platform` (field: `to_urn`)
- `ubn:syntra:document:dc3d0ad16f263a3ea59f01625831a4248cc533b6a73b5f4ae019f718c382bd27:project-binding` → `urn:syntra:document:dc3d0ad16f263a3ea59f01625831a4248cc533b6a73b5f4ae019f718c382bd27` (field: `source_urn`)
- `ubn:syntra:document:a99d48e37af8ed0810b6ea8179bbb10a828a4a4370814015ca4569b5f71c2692:project-binding` → `urn:syntra:document:a99d48e37af8ed0810b6ea8179bbb10a828a4a4370814015ca4569b5f71c2692` (field: `source_urn`)
- `ubn:syntra:document:dc3d0ad16f263a3ea59f01625831a4248cc533b6a73b5f4ae019f718c382bd27:amends:a99d48e37af8ed0810b6ea8179bbb10a828a4a4370814015ca4569b5f71c2692` → `urn:syntra:document:a99d48e37af8ed0810b6ea8179bbb10a828a4a4370814015ca4569b5f71c2692` (field: `source_urn`)
- `ubn:syntra:document:dc3d0ad16f263a3ea59f01625831a4248cc533b6a73b5f4ae019f718c382bd27:amends:a99d48e37af8ed0810b6ea8179bbb10a828a4a4370814015ca4569b5f71c2692` → `urn:syntra:document:dc3d0ad16f263a3ea59f01625831a4248cc533b6a73b5f4ae019f718c382bd27` (field: `target_urn`)
- `ubn:syntra:document:a99d48e37af8ed0810b6ea8179bbb10a828a4a4370814015ca4569b5f71c2692:amends:dc3d0ad16f263a3ea59f01625831a4248cc533b6a73b5f4ae019f718c382bd27` → `urn:syntra:document:a99d48e37af8ed0810b6ea8179bbb10a828a4a4370814015ca4569b5f71c2692` (field: `source_urn`)
- `ubn:syntra:document:a99d48e37af8ed0810b6ea8179bbb10a828a4a4370814015ca4569b5f71c2692:amends:dc3d0ad16f263a3ea59f01625831a4248cc533b6a73b5f4ae019f718c382bd27` → `urn:syntra:document:dc3d0ad16f263a3ea59f01625831a4248cc533b6a73b5f4ae019f718c382bd27` (field: `target_urn`)
- `ubn:syntra:document:fc1d007ad5e11f10eee4ba4daa8940a58083127c480f007e001a6086ec686e9d:project-binding` → `urn:syntra:document:fc1d007ad5e11f10eee4ba4daa8940a58083127c480f007e001a6086ec686e9d` (field: `source_urn`)
- `ubn:syntra:document:4acf08dbe855eb5522c5a3fe821d0efbd4e389f0fccd1961f105eadc13f78e7f:project-binding` → `urn:syntra:document:4acf08dbe855eb5522c5a3fe821d0efbd4e389f0fccd1961f105eadc13f78e7f` (field: `source_urn`)


## Overall Status: PASS
