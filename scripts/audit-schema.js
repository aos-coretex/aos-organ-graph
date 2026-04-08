import Database from 'better-sqlite3';
import { resolve } from 'node:path';

const dbPath = resolve(process.env.GRAPH_DB_PATH || './data/graph.db');

// Concept types that must NOT exist in Graph's database
const FORBIDDEN_TYPES = [
  'verification_result',  // → Vigil
  'autoheal_ticket',      // → Glia
  'remediation_result',   // → Glia
  'event',                // → Spine
];

const ALLOWED_TABLES = ['concepts', 'class_bindings', 'op_sync_state', 'op_agent_tasks', 'op_config', 'sqlite_sequence'];
const ALLOWED_VIEWS = ['v_entities', 'v_doc_transactions', 'v_documents'];

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

try {
  const db = new Database(dbPath, { readonly: true });
  const results = [];

  // ── Check 1: Table whitelist ──
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
  ).all().map(r => r.name);
  const unexpectedTables = tables.filter(t => !ALLOWED_TABLES.includes(t));
  results.push(log('table_whitelist', unexpectedTables.length === 0, {
    found: tables,
    unexpected: unexpectedTables.length > 0 ? unexpectedTables : undefined,
  }));

  // ── Check 2: View whitelist ──
  const views = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name"
  ).all().map(r => r.name);
  const unexpectedViews = views.filter(v => !ALLOWED_VIEWS.includes(v));
  results.push(log('view_whitelist', unexpectedViews.length === 0, {
    found: views,
    unexpected: unexpectedViews.length > 0 ? unexpectedViews : undefined,
  }));

  // ── Check 3: Concept type purity ──
  const conceptTypes = db.prepare(
    "SELECT DISTINCT json_extract(data, '$.type') AS type FROM concepts"
  ).all().map(r => r.type);
  const forbiddenFound = conceptTypes.filter(t => FORBIDDEN_TYPES.includes(t));
  results.push(log('concept_type_purity', forbiddenFound.length === 0, {
    types_present: conceptTypes,
    forbidden_found: forbiddenFound.length > 0 ? forbiddenFound : undefined,
  }));

  // ── Check 4: Schema version ──
  const versionRow = db.prepare(
    "SELECT value FROM op_config WHERE key = 'schema_version'"
  ).get();
  const version = versionRow?.value;
  results.push(log('schema_version', version === '4.0.0', {
    expected: '4.0.0',
    actual: version ?? '(missing)',
  }));

  // ── Check 5: JSON validity ──
  const invalidConcepts = db.prepare(
    'SELECT COUNT(*) AS cnt FROM concepts WHERE NOT json_valid(data)'
  ).get().cnt;
  const invalidBindings = db.prepare(
    'SELECT COUNT(*) AS cnt FROM class_bindings WHERE NOT json_valid(data)'
  ).get().cnt;
  results.push(log('json_validity', invalidConcepts === 0 && invalidBindings === 0, {
    invalid_concepts: invalidConcepts,
    invalid_bindings: invalidBindings,
  }));

  // ── Check 6: Binding integrity ──
  // Five binding formats coexist in the monolith-seeded data:
  //   CSDF full:      out_concept_urn + in_concept_urn + binding_vector_urn
  //   CSDF + relation: out_concept_urn + in_concept_urn + relation
  //   Target:         from_urn + to_urn + relation
  //   Event-binding:  subject + predicate
  //   Entity-binding: (source + target + binding_type) OR (source_urn + target_urn + binding_type)
  // A binding is well-formed if it satisfies ANY of these formats.
  const totalBindings = db.prepare('SELECT COUNT(*) AS cnt FROM class_bindings').get().cnt;
  const malformedBindings = db.prepare(`
    SELECT COUNT(*) AS cnt FROM class_bindings
    WHERE NOT (
      -- CSDF full format
      (json_extract(data, '$.out_concept_urn') IS NOT NULL
       AND json_extract(data, '$.in_concept_urn') IS NOT NULL
       AND json_extract(data, '$.binding_vector_urn') IS NOT NULL)
      OR
      -- CSDF + relation hybrid
      (json_extract(data, '$.out_concept_urn') IS NOT NULL
       AND json_extract(data, '$.in_concept_urn') IS NOT NULL
       AND json_extract(data, '$.relation') IS NOT NULL)
      OR
      -- Target format
      (json_extract(data, '$.from_urn') IS NOT NULL
       AND json_extract(data, '$.to_urn') IS NOT NULL
       AND json_extract(data, '$.relation') IS NOT NULL)
      OR
      -- Event-binding format
      (json_extract(data, '$.subject') IS NOT NULL
       AND json_extract(data, '$.predicate') IS NOT NULL)
      OR
      -- Entity-binding format (short field names)
      (json_extract(data, '$.source') IS NOT NULL
       AND json_extract(data, '$.target') IS NOT NULL
       AND json_extract(data, '$.binding_type') IS NOT NULL)
      OR
      -- Entity-binding format (URN field names)
      (json_extract(data, '$.source_urn') IS NOT NULL
       AND json_extract(data, '$.target_urn') IS NOT NULL
       AND json_extract(data, '$.binding_type') IS NOT NULL)
    )
  `).get().cnt;
  results.push(log('binding_integrity', malformedBindings === 0, {
    total_bindings: totalBindings,
    malformed: malformedBindings,
  }));

  // ── Summary ──
  const passed = results.filter(Boolean).length;
  const failed = results.length - passed;
  const summary = { timestamp: new Date().toISOString(), check: 'summary', passed, failed, total: results.length };
  process.stdout.write(JSON.stringify(summary) + '\n');

  db.close();
  process.exit(failed > 0 ? 1 : 0);
} catch (err) {
  log('audit_error', false, { error: err.message, stack: err.stack });
  process.exit(1);
}
