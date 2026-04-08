import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';

// ── Paths ──

const AOS_ROOT = '/Library/AI/AI-AOS/AOS-organ-dev';

const paths = {
  monolith: resolve(process.env.SOURCE_DB_PATH || '/Library/AI/AI-Datastore/AI-KB-DB/ai-kb.db'),
  graph:    resolve(process.env.GRAPH_DB_PATH  || `${AOS_ROOT}/AOS-organ-graph/AOS-organ-graph-src/data/graph.db`),
  vigil:    resolve(process.env.VIGIL_DB_PATH  || `${AOS_ROOT}/AOS-organ-vigil/AOS-organ-vigil-src/data/vigil.db`),
  glia:     resolve(process.env.GLIA_DB_PATH   || `${AOS_ROOT}/AOS-organ-glia/AOS-organ-glia-src/data/glia.db`),
};

const organDirs = {
  vigil: resolve(`${AOS_ROOT}/AOS-organ-vigil/AOS-organ-vigil-src`),
  glia:  resolve(`${AOS_ROOT}/AOS-organ-glia/AOS-organ-glia-src`),
  graph: resolve(`${AOS_ROOT}/AOS-organ-graph/AOS-organ-graph-src`),
};

// ── Logging ──

function log(event, data = {}) {
  const entry = { timestamp: new Date().toISOString(), event, ...data };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

// ── Helpers ──

function countDb(dbPath) {
  if (!existsSync(dbPath)) return { concepts: 0, bindings: 0 };
  const db = new Database(dbPath, { readonly: true });
  const concepts = db.prepare('SELECT COUNT(*) AS cnt FROM concepts').get().cnt;
  let bindings = 0;
  try {
    bindings = db.prepare('SELECT COUNT(*) AS cnt FROM class_bindings').get().cnt;
  } catch { /* Vigil and Glia have no class_bindings table */ }
  db.close();
  return { concepts, bindings };
}

function collectAllCounts() {
  const monolith = new Database(paths.monolith, { readonly: true });
  const counts = {
    monolith_concepts: monolith.prepare('SELECT COUNT(*) AS cnt FROM concepts').get().cnt,
    monolith_events: monolith.prepare(
      "SELECT COUNT(*) AS cnt FROM concepts WHERE json_extract(data, '$.type') = 'event'"
    ).get().cnt,
    monolith_bindings: monolith.prepare('SELECT COUNT(*) AS cnt FROM class_bindings').get().cnt,
    monolith_types: monolith.prepare(
      "SELECT json_extract(data, '$.type') AS type, COUNT(*) AS cnt FROM concepts GROUP BY type ORDER BY cnt DESC"
    ).all(),
  };
  monolith.close();

  const g = countDb(paths.graph);
  const v = countDb(paths.vigil);
  const l = countDb(paths.glia);

  counts.graph_concepts = g.concepts;
  counts.graph_bindings = g.bindings;
  counts.vigil_concepts = v.concepts;
  counts.glia_concepts  = l.concepts;

  return counts;
}

function runSeed(organ) {
  return execFileSync(process.execPath, ['scripts/seed-from-monolith.js'], {
    cwd: organDirs[organ],
    encoding: 'utf8',
    env: { ...process.env, SOURCE_DB_PATH: paths.monolith },
    timeout: 60000,
  });
}

function runVerification() {
  let output, exitCode = 0;
  try {
    output = execFileSync(process.execPath, ['scripts/verify-migration.js'], {
      cwd: organDirs.graph,
      encoding: 'utf8',
      env: {
        ...process.env,
        SOURCE_DB_PATH: paths.monolith,
        GRAPH_DB_PATH:  paths.graph,
        VIGIL_DB_PATH:  paths.vigil,
        GLIA_DB_PATH:   paths.glia,
      },
      timeout: 120000,
    });
  } catch (e) {
    output = e.stdout || '';
    exitCode = e.status || 1;
  }
  return { output, exitCode };
}

function generateReport(preCounts, postCounts, verifyResults) {
  const now = new Date().toISOString();

  const rc      = verifyResults.row_count_accounting       || {};
  const bc      = verifyResults.binding_completeness       || {};
  const purity  = verifyResults.concept_type_purity        || {};
  const cs      = verifyResults.data_integrity_checksum    || {};
  const jv      = verifyResults.json_validity              || {};
  const bri     = verifyResults.binding_referential_integrity || {};
  const schema  = verifyResults.schema_structure           || {};
  const summary = verifyResults.summary                    || {};

  const fmtTypes = (obj) => obj?.types_found?.map(t => t ?? '(null)').join(', ') ?? '—';

  const delta = {
    graph: postCounts.graph_concepts - preCounts.graph_concepts,
    vigil: postCounts.vigil_concepts - preCounts.vigil_concepts,
    glia:  postCounts.glia_concepts  - preCounts.glia_concepts,
  };

  // Dangling references section
  let danglingSection = 'None\n';
  const parts = [];

  if (bri.cross_organ_refs?.length > 0) {
    parts.push('### Cross-Organ References (expected — resolved via Spine)\n');
    for (const ref of bri.cross_organ_refs) {
      parts.push(`- \`${ref.ubn}\` → \`${ref.urn}\` (field: \`${ref.field}\`, found in: ${ref.found_in})`);
    }
    parts.push('');
  }

  if (bri.pre_existing_dangling_refs?.length > 0) {
    parts.push('### Pre-Existing Dangling (not in any database — monolith data quality)\n');
    for (const ref of bri.pre_existing_dangling_refs) {
      parts.push(`- \`${ref.ubn}\` → \`${ref.urn}\` (field: \`${ref.field}\`)`);
    }
    parts.push('');
  }

  if (bri.migration_dangling_refs?.length > 0) {
    parts.push('### Migration-Caused Dangling (in monolith but not in ESB)\n');
    for (const ref of bri.migration_dangling_refs) {
      parts.push(`- \`${ref.ubn}\` → \`${ref.urn}\` (field: \`${ref.field}\`, type: ${ref.monolith_type})`);
    }
  }

  if (parts.length > 0) danglingSection = parts.join('\n') + '\n';

  return `# Data Migration Attestation Report

> Generated: ${now}
> Source: ${paths.monolith} (monolith)
> Targets: graph.db, vigil.db, glia.db

## Row Count Accounting

| Source | Count |
|---|---|
| Monolith total concepts | ${rc.monolith_total ?? '—'} |
| Events (excluded — Spine) | ${rc.events_excluded ?? '—'} |
| Graph concepts | ${rc.graph_count ?? '—'} |
| Vigil concepts | ${rc.vigil_count ?? '—'} |
| Glia concepts | ${rc.glia_count ?? '—'} |
| **Balance** | **${rc.balance ?? '—'}**${rc.orphans ? ` (${rc.orphans} orphan${rc.orphans > 1 ? 's' : ''} — monolith deleted after prior seed)` : ''} |

## Binding Completeness

| Source | Count |
|---|---|
| Monolith bindings | ${bc.monolith_bindings ?? '—'} |
| Graph bindings | ${bc.graph_bindings ?? '—'} |
| **Delta** | **${bc.delta ?? '—'}** |

## Concept Type Purity

| Database | Types Found | Expected | Status |
|---|---|---|---|
| Graph | ${fmtTypes(purity.graph)} | All except verification_result, autoheal_ticket, remediation_result, event | ${purity.graph?.status ?? '—'} |
| Vigil | ${fmtTypes(purity.vigil)} | verification_result, test_definition | ${purity.vigil?.status ?? '—'} |
| Glia | ${fmtTypes(purity.glia)} | autoheal_ticket, remediation_result | ${purity.glia?.status ?? '—'} |

## Data Integrity

| Check | Result |
|---|---|
| Sample checksum (100 per DB) | ${cs.result ?? '—'} |
| JSON validity | ${jv.result ?? '—'} |
| Binding referential integrity | ${bri.result ?? '—'} (${bri.migration_dangling ?? 0} migration-caused, ${bri.pre_existing_dangling ?? 0} pre-existing, ${bri.cross_organ ?? 0} cross-organ) |
| Schema structure | ${schema.result ?? '—'} |
| Idempotency | ${delta.graph === 0 && delta.vigil === 0 && delta.glia === 0 ? 'PASS (zero new rows)' : `PENDING (delta: graph=${delta.graph}, vigil=${delta.vigil}, glia=${delta.glia})`} |

## Migration Delta (this run)

| Database | Before | After | New Rows |
|---|---|---|---|
| Graph concepts | ${preCounts.graph_concepts} | ${postCounts.graph_concepts} | ${delta.graph} |
| Vigil concepts | ${preCounts.vigil_concepts} | ${postCounts.vigil_concepts} | ${delta.vigil} |
| Glia concepts | ${preCounts.glia_concepts} | ${postCounts.glia_concepts} | ${delta.glia} |

## Dangling References

${danglingSection}
## Overall Status: ${summary.overall ?? 'UNKNOWN'}
`;
}

// ── Main ──

try {
  const startMs = Date.now();
  log('migration_start', { source: paths.monolith });

  // Step 1: Verify monolith exists and is accessible
  if (!existsSync(paths.monolith)) {
    log('migration_error', { error: `Monolith not found: ${paths.monolith}` });
    process.exit(1);
  }

  // Step 2: Pre-migration counts
  const preCounts = collectAllCounts();
  log('pre_migration_counts', preCounts);

  // Step 3: Run Vigil seed
  log('seed_start', { organ: 'vigil' });
  const vigilOut = runSeed('vigil');
  log('seed_complete', { organ: 'vigil', output_lines: vigilOut.trim().split('\n').length });

  // Step 4: Run Glia seed
  log('seed_start', { organ: 'glia' });
  const gliaOut = runSeed('glia');
  log('seed_complete', { organ: 'glia', output_lines: gliaOut.trim().split('\n').length });

  // Step 5: Run Graph seed
  log('seed_start', { organ: 'graph' });
  const graphOut = runSeed('graph');
  log('seed_complete', { organ: 'graph', output_lines: graphOut.trim().split('\n').length });

  // Step 6: Post-migration counts
  const postCounts = collectAllCounts();
  log('post_migration_counts', postCounts);

  const delta = {
    graph_concepts: postCounts.graph_concepts - preCounts.graph_concepts,
    vigil_concepts: postCounts.vigil_concepts - preCounts.vigil_concepts,
    glia_concepts:  postCounts.glia_concepts  - preCounts.glia_concepts,
    graph_bindings: postCounts.graph_bindings - preCounts.graph_bindings,
  };
  log('migration_delta', delta);

  // Step 7: Run cross-database verification
  log('verification_start');
  const { output: verifyOutput, exitCode: verifyExit } = runVerification();

  // Parse structured verification output
  const verifyResults = {};
  for (const line of verifyOutput.trim().split('\n')) {
    try {
      const parsed = JSON.parse(line);
      verifyResults[parsed.check] = parsed;
    } catch { /* skip unparseable lines */ }
  }
  log('verification_complete', {
    exit_code: verifyExit,
    summary: verifyResults.summary,
  });

  // Step 8: Generate attestation report
  const report = generateReport(preCounts, postCounts, verifyResults);
  const reportPath = resolve(organDirs.graph, 'docs/migration-attestation.md');
  writeFileSync(reportPath, report);
  log('report_generated', { path: reportPath });

  const elapsedMs = Date.now() - startMs;
  log('migration_complete', {
    elapsed_ms: elapsedMs,
    verification: verifyResults.summary?.overall ?? 'UNKNOWN',
    report: reportPath,
  });

  process.exit(verifyExit);
} catch (err) {
  log('migration_error', { error: err.message, stack: err.stack });
  process.exit(1);
}
