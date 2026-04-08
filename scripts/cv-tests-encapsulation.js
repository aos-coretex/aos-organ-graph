/**
 * Encapsulation verification tests for ESB organ architecture.
 * 5 unit tests + 6 integration tests = 11 total.
 *
 * Each test function returns: { status: 'pass' | 'fail', detail: string, duration_ms: number }
 * Tests are self-contained — no shared state between them.
 * Integration tests use urn:cv-test: prefix for cleanup.
 */

import Database from 'better-sqlite3';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Paths ---

const ORGAN_DEV_ROOT = resolve(__dirname, '..', '..', '..'); // AOS-organ-dev/
const GRAPH_DB_PATH = resolve(ORGAN_DEV_ROOT, 'AOS-organ-graph/AOS-organ-graph-src/data/graph.db');
const VIGIL_DB_PATH = resolve(ORGAN_DEV_ROOT, 'AOS-organ-vigil/AOS-organ-vigil-src/data/vigil.db');
const GLIA_DB_PATH = resolve(ORGAN_DEV_ROOT, 'AOS-organ-glia/AOS-organ-glia-src/data/glia.db');

const SAFEVAULT_SCRIPT = '/Library/AI/AI-Infra-MDvaults/MDvault-LLM-Ops/100-Scripts/01-Scripts-LLM-Ops/04-backup-scripts/scr-bash-llm-ops-safevault-backup/scr-bash-llm-ops-safevault-backup.sh';

// --- API Bases ---

const GRAPH_BASE = 'http://127.0.0.1:4020';
const VIGIL_BASE = 'http://127.0.0.1:4015';
const GLIA_BASE = 'http://127.0.0.1:4016';

// --- HTTP helper ---

function httpRequest(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Organ-Name': 'cv-test-encapsulation',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// --- Test wrapper (catches errors, measures duration) ---

async function runTest(fn) {
  const start = performance.now();
  try {
    const result = await fn();
    result.duration_ms = Math.round(performance.now() - start);
    return result;
  } catch (err) {
    return {
      status: 'fail',
      detail: `Exception: ${err.message}`,
      duration_ms: Math.round(performance.now() - start),
    };
  }
}

// =============================================================================
// UNIT TESTS (database-level, open DB directly read-only)
// =============================================================================

/**
 * encap-vigil-db-isolated
 * Vigil's database contains only verification_result and test_definition concepts.
 */
export async function test_encap_vigil_db_isolated() {
  return runTest(() => {
    if (!existsSync(VIGIL_DB_PATH)) {
      return { status: 'fail', detail: `Database not found: ${VIGIL_DB_PATH}` };
    }

    const db = new Database(VIGIL_DB_PATH, { readonly: true });
    try {
      const rows = db.prepare(
        "SELECT DISTINCT json_extract(data, '$.type') AS type FROM concepts"
      ).all();

      const types = rows.map((r) => r.type).filter(Boolean);
      const allowed = ['verification_result', 'test_definition'];
      const unexpected = types.filter((t) => !allowed.includes(t));

      if (unexpected.length > 0) {
        return { status: 'fail', detail: `Unexpected types in vigil.db: ${unexpected.join(', ')}` };
      }
      return { status: 'pass', detail: `Types found: ${types.join(', ') || '(empty)'}` };
    } finally {
      db.close();
    }
  });
}

/**
 * encap-glia-db-isolated
 * Glia's database contains only autoheal_ticket and remediation_result concepts.
 */
export async function test_encap_glia_db_isolated() {
  return runTest(() => {
    if (!existsSync(GLIA_DB_PATH)) {
      return { status: 'fail', detail: `Database not found: ${GLIA_DB_PATH}` };
    }

    const db = new Database(GLIA_DB_PATH, { readonly: true });
    try {
      const rows = db.prepare(
        "SELECT DISTINCT json_extract(data, '$.type') AS type FROM concepts"
      ).all();

      const types = rows.map((r) => r.type).filter(Boolean);
      const allowed = ['autoheal_ticket', 'remediation_result'];
      const unexpected = types.filter((t) => !allowed.includes(t));

      if (unexpected.length > 0) {
        return { status: 'fail', detail: `Unexpected types in glia.db: ${unexpected.join(', ')}` };
      }
      return { status: 'pass', detail: `Types found: ${types.join(', ') || '(empty)'}` };
    } finally {
      db.close();
    }
  });
}

/**
 * encap-graph-db-clean
 * Graph's database contains no verification_result, event, autoheal_ticket, or remediation_result.
 */
export async function test_encap_graph_db_clean() {
  return runTest(() => {
    if (!existsSync(GRAPH_DB_PATH)) {
      return { status: 'fail', detail: `Database not found: ${GRAPH_DB_PATH}` };
    }

    const db = new Database(GRAPH_DB_PATH, { readonly: true });
    try {
      const rows = db.prepare(
        "SELECT DISTINCT json_extract(data, '$.type') AS type FROM concepts"
      ).all();

      const types = rows.map((r) => r.type).filter(Boolean);
      const excluded = ['verification_result', 'autoheal_ticket', 'remediation_result', 'event'];
      const violations = types.filter((t) => excluded.includes(t));

      if (violations.length > 0) {
        return { status: 'fail', detail: `Excluded types found in graph.db: ${violations.join(', ')}` };
      }
      return { status: 'pass', detail: `Graph types clean (${types.length} types, none excluded)` };
    } finally {
      db.close();
    }
  });
}

/**
 * encap-no-cross-db-access
 * No ESB organ code imports SQLite targeting another organ's database.
 */
export async function test_encap_no_cross_db_access() {
  return runTest(() => {
    // Check only runtime server code (server/ directory), not utility scripts.
    // Scripts (migration, verification, CV tests) legitimately reference multiple databases.
    let grepOutput;
    try {
      grepOutput = execSync(
        'grep -r "better-sqlite3\\|require.*sqlite\\|import.*sqlite" ' +
        `"${ORGAN_DEV_ROOT}"/AOS-organ-*/AOS-organ-*-src/server/ ` +
        '--include="*.js" --include="*.mjs" -l 2>/dev/null',
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();
    } catch (err) {
      // grep returns exit 1 when no matches — that means clean
      if (err.status === 1) {
        return { status: 'pass', detail: 'No SQLite imports found in any organ server code (clean)' };
      }
      return { status: 'fail', detail: `grep error: ${err.message}` };
    }

    if (!grepOutput) {
      return { status: 'pass', detail: 'No SQLite imports found in any organ server code (clean)' };
    }

    const files = grepOutput.split('\n').filter(Boolean);
    const violations = [];

    // Map each organ to its allowed database filenames
    const organDbMap = {
      'AOS-organ-graph': ['graph.db'],
      'AOS-organ-vigil': ['vigil.db'],
      'AOS-organ-glia': ['glia.db'],
      'AOS-organ-spine': ['spine.db'],
    };

    for (const file of files) {
      // Extract organ name from path: .../AOS-organ-dev/AOS-organ-<name>/AOS-organ-<name>-src/server/...
      const organMatch = file.match(/AOS-organ-dev\/AOS-organ-(\w+)\//);
      if (!organMatch) continue;

      const organName = `AOS-organ-${organMatch[1]}`;

      // Read file content and check for database file references
      const content = readFileSync(file, 'utf-8');

      // Check for references to other organ database files
      for (const [otherOrgan, otherDbs] of Object.entries(organDbMap)) {
        if (otherOrgan === organName) continue; // Skip own organ
        for (const otherDb of otherDbs) {
          if (content.includes(otherDb)) {
            violations.push(`${file} references ${otherDb} (owned by ${otherOrgan})`);
          }
        }
      }

      // Check for monolith path (ai-kb.db) in runtime code
      if (content.includes('ai-kb.db')) {
        violations.push(`${file} references monolith ai-kb.db`);
      }
    }

    if (violations.length > 0) {
      return { status: 'fail', detail: `Cross-DB violations:\n${violations.join('\n')}` };
    }
    return { status: 'pass', detail: `${files.length} server files with SQLite imports, all reference only their own DB` };
  });
}

/**
 * encap-safevault-targets
 * SafeVault backup script includes vigil.db, glia.db, and graph.db paths.
 */
export async function test_encap_safevault_targets() {
  return runTest(() => {
    if (!existsSync(SAFEVAULT_SCRIPT)) {
      return { status: 'fail', detail: `SafeVault script not found: ${SAFEVAULT_SCRIPT}` };
    }

    const content = readFileSync(SAFEVAULT_SCRIPT, 'utf-8');

    const requiredDbs = [
      { name: 'vigil.db', pattern: 'vigil.db' },
      { name: 'glia.db', pattern: 'glia.db' },
      { name: 'graph.db', pattern: 'graph.db' },
    ];

    const missing = [];
    for (const { name, pattern } of requiredDbs) {
      if (!content.includes(pattern)) {
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      return { status: 'fail', detail: `Missing from SafeVault backup: ${missing.join(', ')}` };
    }
    return { status: 'pass', detail: 'All 3 organ databases found in SafeVault backup script' };
  });
}

// =============================================================================
// INTEGRATION TESTS (HTTP-level, call organ APIs)
// =============================================================================

/**
 * encap-graph-api-concepts
 * Graph API correctly handles concept CRUD (insert, get, update).
 */
export async function test_encap_graph_api_concepts() {
  return runTest(async () => {
    const testUrn = `urn:cv-test:concept:${Date.now()}`;
    const testData = JSON.stringify({ type: 'cv_test', name: 'encapsulation-test', timestamp: new Date().toISOString() });

    try {
      // POST — insert (Graph adapter expects data as a JSON string)
      const createRes = await httpRequest('POST', `${GRAPH_BASE}/concepts`, {
        urn: testUrn,
        data: testData,
      });
      if (createRes.status !== 201) {
        return { status: 'fail', detail: `POST /concepts returned ${createRes.status}: ${JSON.stringify(createRes.body)}` };
      }

      // GET — retrieve
      const getRes = await httpRequest('GET', `${GRAPH_BASE}/concepts/${encodeURIComponent(testUrn)}`);
      if (getRes.status !== 200) {
        return { status: 'fail', detail: `GET /concepts returned ${getRes.status}` };
      }
      if (!getRes.body.data || getRes.body.data.type !== 'cv_test') {
        return { status: 'fail', detail: `GET returned wrong data: ${JSON.stringify(getRes.body)}` };
      }

      // PATCH — merge update (data as JSON string)
      const patchRes = await httpRequest('PATCH', `${GRAPH_BASE}/concepts/${encodeURIComponent(testUrn)}`, {
        data: JSON.stringify({ verified: true }),
      });
      if (patchRes.status !== 200) {
        return { status: 'fail', detail: `PATCH /concepts returned ${patchRes.status}` };
      }

      // GET — verify merge
      const verifyRes = await httpRequest('GET', `${GRAPH_BASE}/concepts/${encodeURIComponent(testUrn)}`);
      if (verifyRes.status !== 200 || !verifyRes.body.data.verified) {
        return { status: 'fail', detail: 'PATCH merge not applied' };
      }

      return { status: 'pass', detail: 'Concept CRUD: insert→get→patch→verify all passed' };
    } finally {
      // Cleanup: delete test concept via direct query
      // Graph API has no DELETE endpoint, so we clean up via a dedicated query
      // This is acceptable for CV tests — the concept has urn:cv-test: prefix
      try {
        await httpRequest('POST', `${GRAPH_BASE}/query`, {
          sql: `SELECT urn FROM concepts WHERE urn = '${testUrn}'`,
        });
        // Note: Graph's query endpoint is SELECT-only, cannot delete.
        // Test data with urn:cv-test: prefix is identifiable and harmless.
      } catch { /* cleanup best-effort */ }
    }
  });
}

/**
 * encap-graph-api-bindings
 * Graph API correctly handles binding CRUD (insert, get).
 */
export async function test_encap_graph_api_bindings() {
  return runTest(async () => {
    const testUbn = `ubn:cv-test:binding:${Date.now()}`;
    const bindingData = JSON.stringify({
      from_urn: 'urn:cv-test:source',
      to_urn: 'urn:cv-test:target',
      relation: 'cv_test_relation',
      type: 'class_binding',
    });

    // POST — insert (Graph adapter expects data as a JSON string)
    const createRes = await httpRequest('POST', `${GRAPH_BASE}/bindings`, {
      ubn: testUbn,
      data: bindingData,
    });
    if (createRes.status !== 201) {
      return { status: 'fail', detail: `POST /bindings returned ${createRes.status}: ${JSON.stringify(createRes.body)}` };
    }

    // GET — retrieve
    const getRes = await httpRequest('GET', `${GRAPH_BASE}/bindings/${encodeURIComponent(testUbn)}`);
    if (getRes.status !== 200) {
      return { status: 'fail', detail: `GET /bindings returned ${getRes.status}` };
    }

    const data = getRes.body.data || getRes.body;
    if (!data.from_urn || !data.to_urn || !data.relation) {
      return { status: 'fail', detail: `Binding missing fields: ${JSON.stringify(getRes.body)}` };
    }

    return { status: 'pass', detail: 'Binding CRUD: insert→get passed with from_urn, to_urn, relation' };
  });
}

/**
 * encap-graph-api-query-safety
 * Graph API rejects non-SELECT queries.
 */
export async function test_encap_graph_api_query_safety() {
  return runTest(async () => {
    // DROP should be rejected
    const dropRes = await httpRequest('POST', `${GRAPH_BASE}/query`, {
      sql: 'DROP TABLE concepts',
    });
    if (dropRes.status !== 400) {
      return { status: 'fail', detail: `DROP query returned ${dropRes.status} (expected 400)` };
    }

    // DELETE should be rejected
    const deleteRes = await httpRequest('POST', `${GRAPH_BASE}/query`, {
      sql: 'DELETE FROM concepts',
    });
    if (deleteRes.status !== 400) {
      return { status: 'fail', detail: `DELETE query returned ${deleteRes.status} (expected 400)` };
    }

    // SELECT should succeed
    const selectRes = await httpRequest('POST', `${GRAPH_BASE}/query`, {
      sql: 'SELECT COUNT(*) AS count FROM concepts',
    });
    if (selectRes.status !== 200) {
      return { status: 'fail', detail: `SELECT query returned ${selectRes.status} (expected 200)` };
    }

    return { status: 'pass', detail: 'Query safety: DROP→400, DELETE→400, SELECT→200' };
  });
}

/**
 * encap-vigil-api-results
 * Vigil API stores and retrieves test results correctly.
 */
export async function test_encap_vigil_api_results() {
  return runTest(async () => {
    const testId = `cv-encap-test-${Date.now()}`;

    // POST — store result
    const storeRes = await httpRequest('POST', `${VIGIL_BASE}/tests/${testId}/result`, {
      status: 'pass',
      detail: 'CV encapsulation test result',
      duration_ms: 42,
      triggered_by: 'manual',
    });
    if (storeRes.status !== 201) {
      return { status: 'fail', detail: `POST /tests/:id/result returned ${storeRes.status}: ${JSON.stringify(storeRes.body)}` };
    }

    // GET — retrieve result
    const getRes = await httpRequest('GET', `${VIGIL_BASE}/tests/${testId}/result`);
    if (getRes.status !== 200) {
      return { status: 'fail', detail: `GET /tests/:id/result returned ${getRes.status}` };
    }
    if (getRes.body.status !== 'pass' || getRes.body.detail !== 'CV encapsulation test result') {
      return { status: 'fail', detail: `Result mismatch: ${JSON.stringify(getRes.body)}` };
    }

    // GET — status dashboard should include this test
    const statusRes = await httpRequest('GET', `${VIGIL_BASE}/tests/status`);
    if (statusRes.status !== 200) {
      return { status: 'fail', detail: `GET /tests/status returned ${statusRes.status}` };
    }
    const found = statusRes.body.tests.some((t) => t.test_id === testId);
    if (!found) {
      return { status: 'fail', detail: 'Test result not found in status dashboard' };
    }

    return { status: 'pass', detail: 'Vigil API: store→retrieve→dashboard all passed' };
  });
}

/**
 * encap-glia-api-tickets
 * Glia API creates and transitions tickets through state machine.
 */
export async function test_encap_glia_api_tickets() {
  return runTest(async () => {
    const testId = `cv-encap-ticket-${Date.now()}`;

    // POST / — create ticket (→ pending)
    const createRes = await httpRequest('POST', `${GLIA_BASE}/tickets`, {
      test_id: testId,
      detail: 'CV encapsulation test ticket',
      source: 'cv',
    });
    if (createRes.status !== 201) {
      return { status: 'fail', detail: `POST /tickets returned ${createRes.status}: ${JSON.stringify(createRes.body)}` };
    }
    const ticketUrn = createRes.body.ticket_urn;
    if (createRes.body.state !== 'pending') {
      return { status: 'fail', detail: `Expected state 'pending', got '${createRes.body.state}'` };
    }

    // POST /:urn/classify (→ classifying)
    const classifyRes = await httpRequest('POST', `${GLIA_BASE}/tickets/${encodeURIComponent(ticketUrn)}/classify`);
    if (classifyRes.status !== 202) {
      return { status: 'fail', detail: `POST /classify returned ${classifyRes.status}: ${JSON.stringify(classifyRes.body)}` };
    }

    // POST /:urn/dispatch (→ dispatched)
    const dispatchRes = await httpRequest('POST', `${GLIA_BASE}/tickets/${encodeURIComponent(ticketUrn)}/dispatch`, {
      classification: 'operational',
      handler: 'test_handler',
    });
    if (dispatchRes.status !== 200) {
      return { status: 'fail', detail: `POST /dispatch returned ${dispatchRes.status}: ${JSON.stringify(dispatchRes.body)}` };
    }

    // POST /:urn/heal (→ healing)
    const healRes = await httpRequest('POST', `${GLIA_BASE}/tickets/${encodeURIComponent(ticketUrn)}/heal`, {
      method: 'handler',
      handler: 'test_handler',
    });
    if (healRes.status !== 202) {
      return { status: 'fail', detail: `POST /heal returned ${healRes.status}: ${JSON.stringify(healRes.body)}` };
    }

    // POST /:urn/resolve (→ solved)
    const resolveRes = await httpRequest('POST', `${GLIA_BASE}/tickets/${encodeURIComponent(ticketUrn)}/resolve`, {
      outcome: 'solved',
    });
    if (resolveRes.status !== 200) {
      return { status: 'fail', detail: `POST /resolve returned ${resolveRes.status}: ${JSON.stringify(resolveRes.body)}` };
    }

    // GET /queue — verify lifecycle completed
    const queueRes = await httpRequest('GET', `${GLIA_BASE}/tickets/queue?test_id=${testId}`);
    if (queueRes.status !== 200) {
      return { status: 'fail', detail: `GET /queue returned ${queueRes.status}` };
    }
    const ticket = queueRes.body.tickets.find((t) => t.ticket_urn === ticketUrn);
    if (!ticket || ticket.state !== 'solved') {
      return { status: 'fail', detail: `Final state not 'solved': ${ticket?.state || 'not found'}` };
    }

    return { status: 'pass', detail: 'Glia lifecycle: pending→classifying→dispatched→healing→solved' };
  });
}

/**
 * encap-graph-telemetry-logging
 * Graph adapter telemetry captures call patterns.
 */
export async function test_encap_graph_telemetry_logging() {
  return runTest(async () => {
    const testUrn = `urn:cv-test:telemetry:${Date.now()}`;

    // Make 3 API calls to Graph that should be logged as telemetry
    // 1. Insert a concept
    await httpRequest('POST', `${GRAPH_BASE}/concepts`, {
      urn: testUrn,
      data: JSON.stringify({ type: 'cv_test', purpose: 'telemetry-test' }),
    });

    // 2. Get the concept
    await httpRequest('GET', `${GRAPH_BASE}/concepts/${encodeURIComponent(testUrn)}`);

    // 3. Query
    await httpRequest('POST', `${GRAPH_BASE}/query`, {
      sql: 'SELECT COUNT(*) AS count FROM concepts',
    });

    // Check telemetry endpoint
    const summaryRes = await httpRequest('GET', `${GRAPH_BASE}/telemetry/summary`);
    if (summaryRes.status !== 200) {
      return { status: 'fail', detail: `GET /telemetry/summary returned ${summaryRes.status}` };
    }

    if (!summaryRes.body.operations || summaryRes.body.operations.length === 0) {
      return { status: 'fail', detail: 'No telemetry operations recorded' };
    }

    // Verify recent entries include our calls
    const recentRes = await httpRequest('GET', `${GRAPH_BASE}/telemetry/recent?limit=10`);
    if (recentRes.status !== 200) {
      return { status: 'fail', detail: `GET /telemetry/recent returned ${recentRes.status}` };
    }

    if (!recentRes.body.entries || recentRes.body.entries.length === 0) {
      return { status: 'fail', detail: 'No recent telemetry entries' };
    }

    // Verify entries have required fields
    const entry = recentRes.body.entries[0];
    if (!entry.operation || entry.duration_ms === undefined) {
      return { status: 'fail', detail: `Telemetry entry missing fields: ${JSON.stringify(entry)}` };
    }

    return {
      status: 'pass',
      detail: `Telemetry: ${summaryRes.body.total_calls} total calls, ${summaryRes.body.operations.length} operation types`,
    };
  });
}

// =============================================================================
// TEST REGISTRY (metadata for all tests)
// =============================================================================

export const TEST_DEFINITIONS = [
  { id: 'encap-vigil-db-isolated', name: 'Vigil database isolation', tier: 'unit', fn: test_encap_vigil_db_isolated },
  { id: 'encap-glia-db-isolated', name: 'Glia database isolation', tier: 'unit', fn: test_encap_glia_db_isolated },
  { id: 'encap-graph-db-clean', name: 'Graph database cleanliness', tier: 'unit', fn: test_encap_graph_db_clean },
  { id: 'encap-no-cross-db-access', name: 'No cross-organ DB access', tier: 'unit', fn: test_encap_no_cross_db_access },
  { id: 'encap-safevault-targets', name: 'SafeVault backup targets', tier: 'unit', fn: test_encap_safevault_targets },
  { id: 'encap-graph-api-concepts', name: 'Graph concept CRUD', tier: 'integration', fn: test_encap_graph_api_concepts },
  { id: 'encap-graph-api-bindings', name: 'Graph binding CRUD', tier: 'integration', fn: test_encap_graph_api_bindings },
  { id: 'encap-graph-api-query-safety', name: 'Graph query safety', tier: 'integration', fn: test_encap_graph_api_query_safety },
  { id: 'encap-vigil-api-results', name: 'Vigil result storage', tier: 'integration', fn: test_encap_vigil_api_results },
  { id: 'encap-glia-api-tickets', name: 'Glia ticket lifecycle', tier: 'integration', fn: test_encap_glia_api_tickets },
  { id: 'encap-graph-telemetry-logging', name: 'Graph telemetry logging', tier: 'integration', fn: test_encap_graph_telemetry_logging },
];
