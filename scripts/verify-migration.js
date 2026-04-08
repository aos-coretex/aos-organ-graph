import Database from 'better-sqlite3';
import { resolve } from 'node:path';

// ── Database paths ──
// Cross-organ verification requires all four databases.
// Each path is overridable via environment variable for test isolation.

const AOS_ROOT = '/Library/AI/AI-AOS/AOS-organ-dev';

const paths = {
  monolith: resolve(process.env.SOURCE_DB_PATH || '/Library/AI/AI-Datastore/AI-KB-DB/ai-kb.db'),
  graph:    resolve(process.env.GRAPH_DB_PATH  || `${AOS_ROOT}/AOS-organ-graph/AOS-organ-graph-src/data/graph.db`),
  vigil:    resolve(process.env.VIGIL_DB_PATH  || `${AOS_ROOT}/AOS-organ-vigil/AOS-organ-vigil-src/data/vigil.db`),
  glia:     resolve(process.env.GLIA_DB_PATH   || `${AOS_ROOT}/AOS-organ-glia/AOS-organ-glia-src/data/glia.db`),
};

// ── Ownership constants (from concept-type-ownership.md) ──

const GRAPH_FORBIDDEN = ['verification_result', 'autoheal_ticket', 'remediation_result', 'event'];
const VIGIL_ALLOWED   = ['verification_result', 'test_definition'];
const GLIA_ALLOWED    = ['autoheal_ticket', 'remediation_result'];

const EXPECTED_TABLES = [
  'concepts', 'class_bindings', 'op_sync_state',
  'op_agent_tasks', 'op_config', 'adapter_telemetry',
];
const EXPECTED_VIEWS = ['v_entities', 'v_doc_transactions', 'v_documents'];

// ── Logging ──

function log(check, passed, detail = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    check,
    result: passed ? 'PASS' : 'FAIL',
    ...detail,
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
  return passed;
}

// ── Main ──

try {
  const monolith = new Database(paths.monolith, { readonly: true });
  const graph    = new Database(paths.graph,    { readonly: true });
  const vigil    = new Database(paths.vigil,    { readonly: true });
  const glia     = new Database(paths.glia,     { readonly: true });

  const results = [];

  // ════════════════════════════════════════════════════════════
  // Check 1: Row count accounting (no data loss)
  // ════════════════════════════════════════════════════════════
  //
  // Every concept in the monolith must appear in exactly one ESB
  // organ database OR be an event (excluded — Spine):
  //   monolith_total == graph + vigil + glia + events_excluded

  const totalMonolith = monolith.prepare(
    'SELECT COUNT(*) AS cnt FROM concepts'
  ).get().cnt;

  const eventsExcluded = monolith.prepare(
    "SELECT COUNT(*) AS cnt FROM concepts WHERE json_extract(data, '$.type') = 'event'"
  ).get().cnt;

  const graphCount = graph.prepare('SELECT COUNT(*) AS cnt FROM concepts').get().cnt;
  const vigilCount = vigil.prepare('SELECT COUNT(*) AS cnt FROM concepts').get().cnt;
  const gliaCount  = glia.prepare('SELECT COUNT(*) AS cnt FROM concepts').get().cnt;

  const esbPlusEvents = graphCount + vigilCount + gliaCount + eventsExcluded;
  const balance = totalMonolith - esbPlusEvents;

  // balance > 0 → data loss (monolith has concepts not in any ESB DB) → FAIL
  // balance == 0 → perfect partition → PASS
  // balance < 0 → ESB has orphans (monolith deleted rows after prior seed) → PASS
  //   Orphans are not data loss; INSERT OR IGNORE doesn't sync deletions.
  const orphanCount = balance < 0 ? Math.abs(balance) : 0;
  const dataLoss    = balance > 0;

  let unaccountedDetail;
  if (balance !== 0) {
    const monolithByType = monolith.prepare(
      "SELECT json_extract(data, '$.type') AS type, COUNT(*) AS cnt FROM concepts GROUP BY type ORDER BY cnt DESC"
    ).all();
    unaccountedDetail = { monolith_distribution: monolithByType };
  }

  results.push(log('row_count_accounting', !dataLoss, {
    monolith_total: totalMonolith,
    events_excluded: eventsExcluded,
    graph_count: graphCount,
    vigil_count: vigilCount,
    glia_count: gliaCount,
    esb_plus_events: esbPlusEvents,
    balance,
    orphans: orphanCount > 0 ? orphanCount : undefined,
    ...(unaccountedDetail || {}),
  }));

  // ════════════════════════════════════════════════════════════
  // Check 2: Binding completeness
  // ════════════════════════════════════════════════════════════
  //
  // All class_bindings go to Graph (structural data).

  const monolithBindings = monolith.prepare(
    'SELECT COUNT(*) AS cnt FROM class_bindings'
  ).get().cnt;

  const graphBindings = graph.prepare(
    'SELECT COUNT(*) AS cnt FROM class_bindings'
  ).get().cnt;

  const bindingDelta = monolithBindings - graphBindings;

  results.push(log('binding_completeness', bindingDelta === 0, {
    monolith_bindings: monolithBindings,
    graph_bindings: graphBindings,
    delta: bindingDelta,
  }));

  // ════════════════════════════════════════════════════════════
  // Check 3: Concept type purity per organ
  // ════════════════════════════════════════════════════════════

  const typeQuery = "SELECT DISTINCT json_extract(data, '$.type') AS type FROM concepts";

  const graphTypes = graph.prepare(typeQuery).all().map(r => r.type);
  const vigilTypes = vigil.prepare(typeQuery).all().map(r => r.type);
  const gliaTypes  = glia.prepare(typeQuery).all().map(r => r.type);

  // Graph: must NOT contain forbidden types (allowlist = everything else)
  const graphForbidden = graphTypes.filter(t => GRAPH_FORBIDDEN.includes(t));

  // Vigil: must contain ONLY allowed types
  const vigilForeign = vigilTypes.filter(t => !VIGIL_ALLOWED.includes(t));

  // Glia: must contain ONLY allowed types
  const gliaForeign = gliaTypes.filter(t => !GLIA_ALLOWED.includes(t));

  const purityPassed = graphForbidden.length === 0
    && vigilForeign.length === 0
    && gliaForeign.length === 0;

  results.push(log('concept_type_purity', purityPassed, {
    graph: {
      types_found: graphTypes,
      expected: 'All except ' + GRAPH_FORBIDDEN.join(', '),
      forbidden_found: graphForbidden.length > 0 ? graphForbidden : undefined,
      status: graphForbidden.length === 0 ? 'PASS' : 'FAIL',
    },
    vigil: {
      types_found: vigilTypes,
      expected: VIGIL_ALLOWED.join(', '),
      foreign_found: vigilForeign.length > 0 ? vigilForeign : undefined,
      status: vigilForeign.length === 0 ? 'PASS' : 'FAIL',
    },
    glia: {
      types_found: gliaTypes,
      expected: GLIA_ALLOWED.join(', '),
      foreign_found: gliaForeign.length > 0 ? gliaForeign : undefined,
      status: gliaForeign.length === 0 ? 'PASS' : 'FAIL',
    },
  }));

  // ════════════════════════════════════════════════════════════
  // Check 4: Data integrity (checksum verification)
  // ════════════════════════════════════════════════════════════
  //
  // Sample up to 100 concepts from each ESB database.
  // Verify data JSON and created_at are byte-identical to monolith.

  function sampleChecksum(esbDb, label, sampleSize = 100) {
    const sample = esbDb.prepare(
      'SELECT urn, data, created_at FROM concepts ORDER BY RANDOM() LIMIT ?'
    ).all(sampleSize);

    let matched = 0;
    let mismatched = 0;
    let missingInMonolith = 0;
    const mismatches = [];

    for (const row of sample) {
      const ref = monolith.prepare(
        'SELECT data, created_at FROM concepts WHERE urn = ?'
      ).get(row.urn);

      if (!ref) {
        // Concept exists in ESB but not in monolith (orphan from prior seed)
        missingInMonolith++;
        continue;
      }

      if (ref.data === row.data && ref.created_at === row.created_at) {
        matched++;
      } else {
        mismatched++;
        if (mismatches.length < 5) {
          mismatches.push({
            urn: row.urn,
            data_match: ref.data === row.data,
            created_at_match: ref.created_at === row.created_at,
          });
        }
      }
    }

    return {
      label,
      sample_size: sample.length,
      matched,
      mismatched,
      missing_in_monolith: missingInMonolith,
      mismatches: mismatches.length > 0 ? mismatches : undefined,
    };
  }

  const graphChecksum = sampleChecksum(graph, 'graph');
  const vigilChecksum = sampleChecksum(vigil, 'vigil');
  const gliaChecksum  = sampleChecksum(glia,  'glia');

  const checksumPassed = graphChecksum.mismatched === 0
    && vigilChecksum.mismatched === 0
    && gliaChecksum.mismatched === 0;

  results.push(log('data_integrity_checksum', checksumPassed, {
    graph: graphChecksum,
    vigil: vigilChecksum,
    glia: gliaChecksum,
  }));

  // ════════════════════════════════════════════════════════════
  // Check 5: JSON validity
  // ════════════════════════════════════════════════════════════

  const jsonQuery = 'SELECT COUNT(*) AS cnt FROM concepts WHERE NOT json_valid(data)';
  const graphInvalid = graph.prepare(jsonQuery).get().cnt;
  const vigilInvalid = vigil.prepare(jsonQuery).get().cnt;
  const gliaInvalid  = glia.prepare(jsonQuery).get().cnt;

  results.push(log('json_validity',
    graphInvalid === 0 && vigilInvalid === 0 && gliaInvalid === 0, {
      graph_invalid: graphInvalid,
      vigil_invalid: vigilInvalid,
      glia_invalid: gliaInvalid,
    }));

  // ════════════════════════════════════════════════════════════
  // Check 6: Binding referential integrity (Graph only)
  // ════════════════════════════════════════════════════════════
  //
  // For each binding, extract URN-reference fields and verify
  // they resolve to a concept. Six binding formats coexist
  // (see audit-schema.js). Cross-organ references are expected
  // and documented — they resolve via Spine in MP-4.

  const allBindings = graph.prepare('SELECT ubn, data FROM class_bindings').all();
  const graphUrnSet = new Set(
    graph.prepare('SELECT urn FROM concepts').all().map(r => r.urn)
  );

  let totalUrnsChecked = 0;
  let migrationDanglingCount = 0;   // URN in monolith but not in ESB (migration failure)
  let preExistingDanglingCount = 0; // URN not in any DB (pre-existing data quality issue)
  const migrationDanglingRefs = [];
  const preExistingDanglingRefs = [];
  const crossOrganRefs = [];

  for (const binding of allBindings) {
    let parsed;
    try { parsed = JSON.parse(binding.data); } catch { continue; }

    // Collect URN-reference fields from all binding formats.
    // Explicit concept-reference fields are always checked.
    // Short-name fields (source, target, subject) are checked
    // only if they look like URNs.
    const urnCandidates = [];

    for (const f of ['out_concept_urn', 'in_concept_urn', 'from_urn', 'to_urn', 'source_urn', 'target_urn']) {
      if (parsed[f] && typeof parsed[f] === 'string') {
        urnCandidates.push([f, parsed[f]]);
      }
    }
    for (const f of ['source', 'target', 'subject']) {
      if (parsed[f] && typeof parsed[f] === 'string' && parsed[f].startsWith('urn:')) {
        urnCandidates.push([f, parsed[f]]);
      }
    }

    for (const [field, urn] of urnCandidates) {
      totalUrnsChecked++;
      if (graphUrnSet.has(urn)) continue;

      // Not in Graph — classify the reference
      const inVigil    = vigil.prepare('SELECT 1 FROM concepts WHERE urn = ?').get(urn);
      const inGlia     = glia.prepare('SELECT 1 FROM concepts WHERE urn = ?').get(urn);
      const inMonolith = monolith.prepare('SELECT 1 FROM concepts WHERE urn = ?').get(urn);

      if (inVigil || inGlia) {
        // Cross-organ: concept lives in another ESB organ
        if (crossOrganRefs.length < 30) {
          crossOrganRefs.push({
            ubn: binding.ubn, field, urn,
            found_in: inVigil ? 'vigil' : 'glia',
          });
        }
      } else if (inMonolith) {
        // In monolith but not in any ESB DB — check if it's a Spine event
        const monolithType = monolith.prepare(
          "SELECT json_extract(data, '$.type') AS type FROM concepts WHERE urn = ?"
        ).get(urn)?.type;

        if (monolithType === 'event') {
          // Expected: events go to Spine, not ESB organs
          if (crossOrganRefs.length < 30) {
            crossOrganRefs.push({
              ubn: binding.ubn, field, urn,
              found_in: 'monolith_only (Spine event)',
            });
          }
        } else {
          // Migration failure: non-event concept in monolith but not in any ESB DB
          migrationDanglingCount++;
          if (migrationDanglingRefs.length < 30) {
            migrationDanglingRefs.push({
              ubn: binding.ubn, field, urn, monolith_type: monolithType,
            });
          }
        }
      } else {
        // Not in any database — pre-existing data quality issue.
        // The binding was created referencing a concept that was never created.
        // This is not a migration failure — the migration faithfully preserved it.
        preExistingDanglingCount++;
        if (preExistingDanglingRefs.length < 30) {
          preExistingDanglingRefs.push({ ubn: binding.ubn, field, urn });
        }
      }
    }
  }

  // Only migration-caused dangles are failures.
  // Pre-existing dangles and cross-organ refs are documented.
  results.push(log('binding_referential_integrity', migrationDanglingCount === 0, {
    total_bindings: allBindings.length,
    total_urns_checked: totalUrnsChecked,
    migration_dangling: migrationDanglingCount,
    pre_existing_dangling: preExistingDanglingCount,
    cross_organ: crossOrganRefs.length,
    migration_dangling_refs: migrationDanglingRefs.length > 0 ? migrationDanglingRefs : undefined,
    pre_existing_dangling_refs: preExistingDanglingRefs.length > 0 ? preExistingDanglingRefs : undefined,
    cross_organ_refs: crossOrganRefs.length > 0 ? crossOrganRefs : undefined,
  }));

  // ════════════════════════════════════════════════════════════
  // Check 7: Schema structure audit (Graph only)
  // ════════════════════════════════════════════════════════════
  //
  // Subsumes audit-schema.js checks + Relay 5 adapter_telemetry
  // + view functionality verification.

  // 7a: Table inventory
  const actualTables = graph.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map(r => r.name);

  const actualViews = graph.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name"
  ).all().map(r => r.name);

  const missingTables = EXPECTED_TABLES.filter(t => !actualTables.includes(t));
  const unexpectedTables = actualTables.filter(t => !EXPECTED_TABLES.includes(t));
  const missingViews = EXPECTED_VIEWS.filter(v => !actualViews.includes(v));

  // 7b: adapter_telemetry existence (Relay 5)
  const hasTelemetry = actualTables.includes('adapter_telemetry');

  // 7c: Views are functional (return counts without error)
  let viewsOk = true;
  const viewCounts = {};
  for (const vname of EXPECTED_VIEWS) {
    try {
      viewCounts[vname] = graph.prepare(`SELECT COUNT(*) AS cnt FROM "${vname}"`).get().cnt;
    } catch (e) {
      viewCounts[vname] = `ERROR: ${e.message}`;
      viewsOk = false;
    }
  }

  // 7d: Schema version
  const schemaVersion = graph.prepare(
    "SELECT value FROM op_config WHERE key = 'schema_version'"
  ).get()?.value;

  // 7e: Binding JSON validity (not covered by Check 5 which is concepts only)
  const invalidBindingJson = graph.prepare(
    'SELECT COUNT(*) AS cnt FROM class_bindings WHERE NOT json_valid(data)'
  ).get().cnt;

  const schemaPassed = missingTables.length === 0
    && missingViews.length === 0
    && hasTelemetry
    && viewsOk
    && schemaVersion === '4.0.0'
    && invalidBindingJson === 0;

  results.push(log('schema_structure', schemaPassed, {
    tables: actualTables,
    views: actualViews,
    missing_tables: missingTables.length > 0 ? missingTables : undefined,
    unexpected_tables: unexpectedTables.length > 0 ? unexpectedTables : undefined,
    missing_views: missingViews.length > 0 ? missingViews : undefined,
    adapter_telemetry: hasTelemetry ? 'present' : 'MISSING',
    view_counts: viewCounts,
    schema_version: schemaVersion ?? '(missing)',
    invalid_binding_json: invalidBindingJson,
  }));

  // ── Summary ──

  const passed = results.filter(Boolean).length;
  const failed = results.length - passed;

  process.stdout.write(JSON.stringify({
    timestamp: new Date().toISOString(),
    check: 'summary',
    passed,
    failed,
    total: results.length,
    overall: failed === 0 ? 'PASS' : 'FAIL',
  }) + '\n');

  monolith.close();
  graph.close();
  vigil.close();
  glia.close();

  process.exit(failed > 0 ? 1 : 0);
} catch (err) {
  log('verification_error', false, { error: err.message, stack: err.stack });
  process.exit(1);
}
