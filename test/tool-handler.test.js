/**
 * Graph tool_call_request handler — MP-TOOL-1 relay t8r-2.
 *
 * Tests the D4 map-lookup handler: dispatch, health gate, TOOL_NOT_FOUND,
 * TOOL_ERROR, TOOL_TIMEOUT, envelope-vs-payload discipline.
 *
 * Uses an inline `declarations` object to isolate from the real
 * tool-declarations.json file (tests run in any checkout state).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { TelemetryAdapter } from '../server/adapter/telemetry.js';
import { createToolHandler } from '../server/tool-handler.js';

// Minimal declarations fixture — mirror the live-file shape for Graph.
const DECLARATIONS_FIXTURE = {
  organs: {
    graph: {
      organ_number: 40,
      organ_port: 4020,
      tools: {
        get_stats:          { method: 'getStats' },
        query:              { method: 'query' },
        insert_concept:     { method: 'insertConcept' },
        update_concept:     { method: 'updateConcept' },
        insert_binding:     { method: 'insertBinding' },
        insert_transaction: { method: 'insertTransaction' },
        query_entities:     { method: 'queryEntities' },
        search:             { method: 'search' },
      },
    },
  },
};

function envelope(tool, params = {}, overrides = {}) {
  return {
    message_id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    target_organ: 'Graph',
    reply_to: 'mcp-router',
    payload: { event_type: 'tool_call_request', tool, params },
    ...overrides,
  };
}

describe('Graph tool-handler — D4 dispatch', () => {
  let db;
  let adapter;
  let handler;

  before(() => {
    db = initDatabase(':memory:');
    const sqlite = new SQLiteStorageAdapter(db);
    adapter = new TelemetryAdapter(sqlite, db);
    handler = createToolHandler(adapter, { declarations: DECLARATIONS_FIXTURE });
  });

  after(() => {
    adapter.close();
  });

  it('constructs without throwing when every declared method exists', () => {
    // Arranged above — constructor ran in `before()`. Just assert the handler is a function.
    assert.equal(typeof handler, 'function');
  });

  it('fails fast on startup when a decl points to a missing method (D5 fail-fast)', () => {
    const broken = {
      organs: {
        graph: {
          tools: {
            get_stats: { method: 'doesNotExist' },
          },
        },
      },
    };
    assert.throws(
      () => createToolHandler(adapter, { declarations: broken }),
      /doesNotExist/
    );
  });

  it('dispatches graph__get_stats → SUCCESS with stats data', async () => {
    const res = await handler(envelope('graph__get_stats'));
    assert.equal(res.event_type, 'tool_call_response');
    assert.equal(res.schema_version, '1.0');
    assert.equal(res.status, 'SUCCESS');
    assert.equal(res.tool, 'graph__get_stats');
    assert.equal(typeof res.data.total_concepts, 'number');
  });

  it('dispatches graph__query with params', async () => {
    await adapter.insertConcept(
      'urn:test:handler:1',
      JSON.stringify({ type: 'test', marker: 'handler-dispatch' })
    );
    const res = await handler(envelope('graph__query', {
      sql: 'SELECT urn FROM concepts WHERE urn = ?',
      params: ['urn:test:handler:1'],
    }));
    assert.equal(res.status, 'SUCCESS');
    assert.equal(res.data.count, 1);
  });

  it('unknown tool → TOOL_NOT_FOUND (not NOT_IMPLEMENTED)', async () => {
    const res = await handler(envelope('graph__bogus'));
    assert.equal(res.status, 'TOOL_NOT_FOUND');
    assert.equal(res.tool, 'graph__bogus');
    assert.match(res.reason, /graph/);
  });

  it('missing tool name → TOOL_NOT_FOUND with "unknown"', async () => {
    const res = await handler({ payload: { event_type: 'tool_call_request' } });
    assert.equal(res.status, 'TOOL_NOT_FOUND');
    assert.equal(res.tool, 'unknown');
  });

  it('method throws → TOOL_ERROR with error.code and error.message', async () => {
    const res = await handler(envelope('graph__update_concept', {
      urn: 'urn:test:nope',
      data: '{"x":1}',
    }));
    assert.equal(res.status, 'TOOL_ERROR');
    assert.equal(res.error.code, 'ENOTFOUND');
    assert.match(res.error.message, /urn:test:nope/);
  });

  it('method validation failure → TOOL_ERROR with EBADPARAM', async () => {
    const res = await handler(envelope('graph__query', { sql: 123 }));
    assert.equal(res.status, 'TOOL_ERROR');
    assert.equal(res.error.code, 'EBADPARAM');
  });

  it('ORGAN_DEGRADED when healthCheck reports a failure', async () => {
    const degradedHandler = createToolHandler(adapter, {
      declarations: DECLARATIONS_FIXTURE,
      healthCheck: async () => ({ db_connected: 'down' }),
    });
    const res = await degradedHandler(envelope('graph__get_stats'));
    assert.equal(res.status, 'ORGAN_DEGRADED');
    assert.equal(res.checks_status, 'down');
  });

  it('ORGAN_DEGRADED when healthCheck itself throws (fail-closed)', async () => {
    const brokenHandler = createToolHandler(adapter, {
      declarations: DECLARATIONS_FIXTURE,
      healthCheck: async () => { throw new Error('health fn broken'); },
    });
    const res = await brokenHandler(envelope('graph__get_stats'));
    assert.equal(res.status, 'ORGAN_DEGRADED');
    assert.equal(res.checks_status, 'down');
  });

  it('TOOL_TIMEOUT when method exceeds declared timeout_ms', async () => {
    // Build a handler with a very low timeout by using a method that sleeps.
    // Easiest: inject a declarations fixture with a tight timeout_ms on a
    // known method, and replace that method with a slow sleep via a proxy
    // adapter.
    const slowAdapter = Object.create(adapter);
    slowAdapter.getStats = () => new Promise(r => setTimeout(r, 100));
    const tightDecl = {
      organs: {
        graph: {
          tools: {
            get_stats: { method: 'getStats', timeout_ms: 20 },
          },
        },
      },
    };
    const slowHandler = createToolHandler(slowAdapter, { declarations: tightDecl });
    const res = await slowHandler(envelope('graph__get_stats'));
    assert.equal(res.status, 'TOOL_TIMEOUT');
    assert.equal(res.limit_ms, 20);
    assert.ok(res.elapsed_ms >= 20);
  });

  it('payload response passes tool-response-schema validation', async () => {
    const { validateToolResponse } = await import('@coretex/organ-boot/tool-response-schema');
    const res = await handler(envelope('graph__get_stats'));
    assert.equal(validateToolResponse(res), true);
  });
});

describe('Graph tool-handler — live file integration', () => {
  let db;
  let adapter;

  before(() => {
    db = initDatabase(':memory:');
    const sqlite = new SQLiteStorageAdapter(db);
    adapter = new TelemetryAdapter(sqlite, db);
  });

  after(() => {
    adapter.close();
  });

  it('resolves all 8 Graph tools against the live tool-declarations.json', () => {
    // No `declarations` override → reads from the default file path.
    // This is the single regression guard against declaration/method drift.
    const handler = createToolHandler(adapter);
    assert.equal(typeof handler, 'function');
  });
});
