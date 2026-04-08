import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { initDatabase } from '../server/db/init.js';

// Concept types owned by other organs — excluded from Graph
const EXCLUDED_TYPES = [
  'verification_result',  // → Vigil (#120)
  'autoheal_ticket',      // → Glia (#130)
  'remediation_result',   // → Glia (#130)
  'event',                // → Spine (#20)
];

// Concept types explicitly owned by Graph
const GRAPH_TYPES = [
  'entity', 'document', 'doc_transaction', 'class_binding',
  'architecture', 'constitutional_article', 'derivation',
  'external_reference', 'github-organization', 'infrastructure',
  'infrastructure-directory', 'event_registry', 'event_schema',
  'project', 'sector', 'persona', 'team',
];

const sourcePath = resolve(process.env.SOURCE_DB_PATH || '/Library/AI/AI-Datastore/AI-KB-DB/ai-kb.db');
const targetPath = resolve(process.env.GRAPH_DB_PATH || './data/graph.db');

function log(event, data = {}) {
  const entry = { timestamp: new Date().toISOString(), event, ...data };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

try {
  const startMs = Date.now();

  log('seed_start', { source: sourcePath, target: targetPath });

  // Open source in read-only mode — monolith is never modified
  const sourceDb = new Database(sourcePath, { readonly: true });

  // Initialize target database (creates schema v4.0.0 if needed)
  const targetDb = initDatabase(targetPath);

  // ── Step 1: Seed concepts (selective extraction) ──

  const excludePlaceholders = EXCLUDED_TYPES.map(() => '?').join(', ');
  const conceptRows = sourceDb.prepare(`
    SELECT urn, data, created_at FROM concepts
    WHERE json_extract(data, '$.type') NOT IN (${excludePlaceholders})
       OR json_extract(data, '$.type') IS NULL
  `).all(...EXCLUDED_TYPES);

  // Also grab concepts with NULL type (excluded by NOT IN, which doesn't match NULL)
  const nullTypeRows = sourceDb.prepare(`
    SELECT urn, data, created_at FROM concepts
    WHERE json_extract(data, '$.type') IS NULL
  `).all();

  // Merge — conceptRows already includes non-excluded types; nullTypeRows handles NULLs
  // Actually NOT IN with NULL types: SQL `NULL NOT IN (...)` evaluates to NULL (falsy),
  // so NULL-type rows are excluded from the first query. We need to add them back.
  const allConceptRows = [...conceptRows, ...nullTypeRows];

  log('concept_query_complete', {
    non_excluded: conceptRows.length,
    null_type: nullTypeRows.length,
    total_to_migrate: allConceptRows.length,
  });

  const insertConcept = targetDb.prepare(
    'INSERT OR IGNORE INTO concepts (urn, data, created_at) VALUES (?, ?, ?)'
  );

  const conceptCounts = { migrated: 0, skipped: 0 };
  const migratedByType = {};
  const unknownTypes = [];

  const seedConcepts = targetDb.transaction(() => {
    for (const row of allConceptRows) {
      const result = insertConcept.run(row.urn, row.data, row.created_at);
      const type = (() => { try { return JSON.parse(row.data).type ?? '(null)'; } catch { return '(invalid)'; } })();

      if (result.changes > 0) {
        conceptCounts.migrated++;
        migratedByType[type] = (migratedByType[type] || 0) + 1;

        if (type !== '(null)' && type !== '(invalid)' && !GRAPH_TYPES.includes(type)) {
          unknownTypes.push(type);
        }
      } else {
        conceptCounts.skipped++;
      }
    }
  });
  seedConcepts();

  // Count excluded types in source for the report
  const excludedCounts = {};
  for (const type of EXCLUDED_TYPES) {
    const row = sourceDb.prepare(
      "SELECT COUNT(*) as cnt FROM concepts WHERE json_extract(data, '$.type') = ?"
    ).get(type);
    excludedCounts[type] = row.cnt;
  }

  // ── Step 2: Seed class_bindings (full copy — all bindings are structural) ──

  const bindingRows = sourceDb.prepare(
    'SELECT ubn, data, created_at FROM class_bindings'
  ).all();

  const insertBinding = targetDb.prepare(
    'INSERT OR IGNORE INTO class_bindings (ubn, data, created_at) VALUES (?, ?, ?)'
  );

  const bindingCounts = { migrated: 0, skipped: 0 };

  const seedBindings = targetDb.transaction(() => {
    for (const row of bindingRows) {
      const result = insertBinding.run(row.ubn, row.data, row.created_at);
      if (result.changes > 0) {
        bindingCounts.migrated++;
      } else {
        bindingCounts.skipped++;
      }
    }
  });
  seedBindings();

  // ── Step 3: Seed operational tables ──

  // op_sync_state: copy all rows
  const syncRows = sourceDb.prepare('SELECT vault, last_scan, file_count, status FROM op_sync_state').all();
  const insertSync = targetDb.prepare(
    'INSERT OR IGNORE INTO op_sync_state (vault, last_scan, file_count, status) VALUES (?, ?, ?, ?)'
  );
  let syncMigrated = 0;
  for (const row of syncRows) {
    const result = insertSync.run(row.vault, row.last_scan, row.file_count, row.status);
    if (result.changes > 0) syncMigrated++;
  }

  // op_agent_tasks: copy only pending or running tasks
  const taskRows = sourceDb.prepare(
    "SELECT task_type, target_urn, status, created_at, completed_at FROM op_agent_tasks WHERE status IN ('pending', 'running')"
  ).all();
  const insertTask = targetDb.prepare(
    'INSERT INTO op_agent_tasks (task_type, target_urn, status, created_at, completed_at) VALUES (?, ?, ?, ?, ?)'
  );
  let tasksMigrated = 0;
  for (const row of taskRows) {
    insertTask.run(row.task_type, row.target_urn, row.status, row.created_at, row.completed_at);
    tasksMigrated++;
  }

  // op_config: already seeded with schema_version = '4.0.0' by initDatabase
  // Do NOT copy monolith's schema_version or other config entries

  // ── Report ──

  const elapsedMs = Date.now() - startMs;

  log('seed_concepts', {
    migrated: conceptCounts.migrated,
    skipped: conceptCounts.skipped,
    by_type: migratedByType,
  });

  log('seed_excluded', { by_type: excludedCounts });

  if (unknownTypes.length > 0) {
    const unique = [...new Set(unknownTypes)];
    log('seed_warning_unknown_types', {
      message: 'Concept types not in definitive ownership map — defaulted to Graph',
      types: unique,
    });
  }

  log('seed_bindings', {
    migrated: bindingCounts.migrated,
    skipped: bindingCounts.skipped,
    source_total: bindingRows.length,
  });

  log('seed_operational', {
    sync_state_rows: syncMigrated,
    agent_tasks_rows: tasksMigrated,
  });

  log('seed_complete', {
    total_concepts_migrated: conceptCounts.migrated,
    total_bindings_migrated: bindingCounts.migrated,
    elapsed_ms: elapsedMs,
  });

  sourceDb.close();
  targetDb.close();

  process.exit(0);
} catch (err) {
  log('seed_error', { error: err.message, stack: err.stack });
  process.exit(1);
}
