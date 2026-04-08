/**
 * Telemetry tests — TelemetryAdapter wrapper + query endpoints.
 *
 * Covers:
 * 1. Telemetry capture (correct row inserted per adapter call)
 * 2. Telemetry on error (status: "error", error_message recorded)
 * 3. Stub operations (status: "not_implemented")
 * 4. Telemetry query (summary aggregation, recent entries, filters)
 * 5. Args shape extraction (various argument types)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { TelemetryAdapter, describeValue, computeArgsShape } from '../server/adapter/telemetry.js';
import { telemetryRoutes } from '../server/routes/telemetry.js';
import { StorageAdapter } from '../server/adapter/interface.js';

// --- HTTP request helper (same pattern as other test files) ---

async function request(app, method, path) {
  const { default: http } = await import('node:http');
  const server = app.listen(0);
  const port = server.address().port;

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        server.close();
        resolve({ status: res.statusCode, body: JSON.parse(data) });
      });
    });
    req.on('error', (err) => { server.close(); reject(err); });
    req.end();
  });
}

/** Read all telemetry rows from the db. */
function readTelemetry(db) {
  return db.prepare('SELECT * FROM adapter_telemetry ORDER BY id').all();
}

// ================================================================
// Args shape extraction
// ================================================================

describe('describeValue', () => {
  it('describes undefined', () => {
    assert.equal(describeValue(undefined), 'undefined');
  });

  it('describes null', () => {
    assert.equal(describeValue(null), 'null');
  });

  it('describes boolean', () => {
    assert.equal(describeValue(true), 'boolean');
    assert.equal(describeValue(false), 'boolean');
  });

  it('describes number', () => {
    assert.equal(describeValue(42), 'number');
    assert.equal(describeValue(3.14), 'number');
  });

  it('describes plain string with length', () => {
    assert.equal(describeValue('hello'), 'string(5)');
    assert.equal(describeValue('urn:test:1'), 'string(10)');
  });

  it('describes JSON object string with keys', () => {
    assert.equal(
      describeValue('{"type":"entity","name":"test"}'),
      'object{type,name}'
    );
  });

  it('describes JSON array string with length', () => {
    assert.equal(describeValue('[1,2,3]'), 'array(3)');
    assert.equal(describeValue('[]'), 'array(0)');
  });

  it('describes native object with keys', () => {
    assert.equal(
      describeValue({ operation: 'ingest', entity: 'kb1' }),
      'object{operation,entity}'
    );
  });

  it('describes native array with length', () => {
    assert.equal(describeValue([1, 2]), 'array(2)');
  });

  it('handles non-JSON string gracefully', () => {
    assert.equal(describeValue('not json'), 'string(8)');
  });

  it('handles JSON primitive string (number in string)', () => {
    // JSON.parse("42") returns 42, not an object — treat as string
    assert.equal(describeValue('42'), 'string(2)');
  });
});

describe('computeArgsShape', () => {
  it('computes shape for insertConcept', () => {
    const shape = computeArgsShape('insertConcept', [
      'urn:test:concept:1',
      '{"type":"entity","name":"test"}'
    ]);
    assert.equal(shape, 'urn:string(18),data:object{type,name}');
  });

  it('computes shape for getConcept', () => {
    const shape = computeArgsShape('getConcept', ['urn:test:1']);
    assert.equal(shape, 'urn:string(10)');
  });

  it('computes shape for query with params', () => {
    const shape = computeArgsShape('query', [
      'SELECT * FROM concepts WHERE urn = ?',
      ['urn:test:1']
    ]);
    assert.equal(shape, 'sql:string(36),params:array(1)');
  });

  it('computes empty shape for getStats', () => {
    assert.equal(computeArgsShape('getStats', []), '');
  });

  it('computes shape for insertTransaction with object arg', () => {
    const shape = computeArgsShape('insertTransaction', [{
      operation: 'ingest',
      entity: 'test-kb',
      context: 'test'
    }]);
    assert.equal(shape, 'fields:object{operation,entity,context}');
  });

  it('computes shape for search with optional params', () => {
    const shape = computeArgsShape('search', ['hello', null, 20]);
    assert.equal(shape, 'keyword:string(5),type:null,limit:number');
  });
});

// ================================================================
// TelemetryAdapter — capture
// ================================================================

describe('TelemetryAdapter', () => {
  let db;
  let sqliteAdapter;
  let adapter;

  before(() => {
    db = initDatabase(':memory:');
    sqliteAdapter = new SQLiteStorageAdapter(db);
    adapter = new TelemetryAdapter(sqliteAdapter, db);
  });

  after(() => {
    sqliteAdapter.close();
  });

  it('extends StorageAdapter', () => {
    assert.ok(adapter instanceof StorageAdapter);
  });

  it('captures telemetry for insertConcept', () => {
    adapter.setCaller('lobe');
    adapter.insertConcept('urn:tel:test:1', '{"type":"test","name":"telemetry"}');

    const rows = readTelemetry(db);
    const row = rows.find(r => r.operation === 'insertConcept');
    assert.ok(row, 'telemetry row should exist for insertConcept');
    assert.equal(row.operation, 'insertConcept');
    assert.equal(row.caller, 'lobe');
    assert.equal(row.args_shape, 'urn:string(14),data:object{type,name}');
    assert.equal(row.status, 'ok');
    assert.equal(typeof row.duration_ms, 'number');
    assert.ok(row.duration_ms >= 0);
    assert.equal(row.error_message, null);
    assert.ok(row.timestamp);
  });

  it('captures telemetry for getConcept', () => {
    adapter.setCaller('direct');
    const result = adapter.getConcept('urn:tel:test:1');

    assert.ok(result);
    assert.equal(result.data.name, 'telemetry');

    const rows = readTelemetry(db);
    const row = rows.find(r => r.operation === 'getConcept');
    assert.ok(row);
    assert.equal(row.caller, 'direct');
    assert.equal(row.status, 'ok');
  });

  it('captures telemetry on error', () => {
    adapter.setCaller('axon');

    assert.throws(
      () => adapter.insertConcept('urn:tel:bad:1', '{"no_type_field":"oops"}'),
      /type/
    );

    const rows = readTelemetry(db);
    const errorRows = rows.filter(r => r.status === 'error');
    assert.ok(errorRows.length > 0, 'should have at least one error row');
    const row = errorRows[errorRows.length - 1];
    assert.equal(row.operation, 'insertConcept');
    assert.equal(row.caller, 'axon');
    assert.equal(row.status, 'error');
    assert.ok(row.error_message.includes('type'));
    assert.ok(row.duration_ms >= 0);
  });

  it('passes through results correctly', () => {
    const result = adapter.insertConcept(
      'urn:tel:test:2',
      '{"type":"test","value":"passthrough"}'
    );
    assert.equal(result.urn, 'urn:tel:test:2');
    assert.equal(result.type, 'test');
    assert.equal(result.status, 'created');
  });

  it('captures telemetry for getStats', () => {
    adapter.getStats();
    const rows = readTelemetry(db);
    const row = rows.find(r => r.operation === 'getStats');
    assert.ok(row);
    assert.equal(row.status, 'ok');
    assert.equal(row.args_shape, null); // empty shape stored as null
  });

  it('defaults caller to direct', () => {
    // Reset caller
    adapter.setCaller(null);
    adapter.healthCheck();

    const rows = readTelemetry(db);
    const healthRows = rows.filter(r => r.operation === 'healthCheck');
    const lastRow = healthRows[healthRows.length - 1];
    assert.equal(lastRow.caller, 'direct');
  });
});

// ================================================================
// Stub operations — 501 + telemetry
// ================================================================

describe('TelemetryAdapter stub operations', () => {
  let db;
  let sqliteAdapter;
  let adapter;

  before(() => {
    db = initDatabase(':memory:');
    sqliteAdapter = new SQLiteStorageAdapter(db);
    adapter = new TelemetryAdapter(sqliteAdapter, db);
  });

  after(() => {
    sqliteAdapter.close();
  });

  const stubs = [
    { method: 'recordRuling',         args: ['{"decision":"test"}'] },
    { method: 'checkSpent',           args: ['urn:token:1'] },
    { method: 'markSpent',            args: ['urn:token:1', 'executor-1'] },
    { method: 'mintToken',            args: ['{"scope":"test"}', 3600] },
    { method: 'mintGovernanceVersion', args: ['constitution.md', 'abc123'] },
    { method: 'verifyHash',           args: ['urn:version:1', 'abc123'] },
    { method: 'publishReference',     args: ['urn:source:1', 'github', 'repo/123'] },
    { method: 'bindInstance',         args: ['urn:from:1', 'urn:to:1', 'instance_of', '{"data":"test"}'] },
  ];

  for (const { method, args } of stubs) {
    it(`${method} returns 501 and telemetry logs not_implemented`, () => {
      const result = adapter[method](...args);
      assert.equal(result.status, 501);
      assert.equal(result.error, 'Not implemented');

      const rows = readTelemetry(db);
      const methodRows = rows.filter(r => r.operation === method);
      const lastRow = methodRows[methodRows.length - 1];
      assert.equal(lastRow.status, 'not_implemented');
      assert.ok(lastRow.duration_ms >= 0);
    });
  }
});

// ================================================================
// Interface — new stub methods throw on base class
// ================================================================

describe('StorageAdapter stub interface', () => {
  const base = new StorageAdapter();

  const stubMethods = [
    'recordRuling', 'checkSpent', 'markSpent', 'mintToken',
    'mintGovernanceVersion', 'verifyHash', 'publishReference', 'bindInstance',
  ];

  for (const method of stubMethods) {
    it(`${method} throws on base class`, () => {
      assert.throws(() => base[method](), /not implemented/);
    });
  }
});

// ================================================================
// Telemetry query routes
// ================================================================

describe('Telemetry routes', () => {
  let app;
  let db;
  let sqliteAdapter;
  let adapter;

  before(() => {
    db = initDatabase(':memory:');
    sqliteAdapter = new SQLiteStorageAdapter(db);
    adapter = new TelemetryAdapter(sqliteAdapter, db);

    // Generate telemetry data
    adapter.setCaller('lobe');
    adapter.insertConcept('urn:tr:1', '{"type":"test","name":"a"}');
    adapter.insertConcept('urn:tr:2', '{"type":"test","name":"b"}');
    adapter.getConcept('urn:tr:1');

    adapter.setCaller('vigil');
    adapter.getStats();
    adapter.healthCheck();

    // One stub call
    adapter.setCaller('nomos');
    adapter.mintToken('{"scope":"test"}', 300);

    app = express();
    app.use(express.json());
    app.use('/telemetry', telemetryRoutes(db));
  });

  after(() => {
    sqliteAdapter.close();
  });

  it('GET /telemetry/summary — returns aggregated data', async () => {
    const res = await request(app, 'GET', '/telemetry/summary');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.operations));
    assert.ok(res.body.total_calls >= 6);
    assert.ok(res.body.period_start);
    assert.ok(res.body.period_end);

    // Check insertConcept entry
    const insertOp = res.body.operations.find(o => o.operation === 'insertConcept');
    assert.ok(insertOp);
    assert.equal(insertOp.call_count, 2);
    assert.ok(insertOp.avg_duration_ms >= 0);
    assert.ok(insertOp.callers.includes('lobe'));

    // Check mintToken is present (stub)
    const mintOp = res.body.operations.find(o => o.operation === 'mintToken');
    assert.ok(mintOp);
    assert.equal(mintOp.call_count, 1);
    assert.ok(mintOp.callers.includes('nomos'));
  });

  it('GET /telemetry/summary — filters by operation', async () => {
    const res = await request(app, 'GET', '/telemetry/summary?operation=insertConcept');
    assert.equal(res.status, 200);
    assert.equal(res.body.operations.length, 1);
    assert.equal(res.body.operations[0].operation, 'insertConcept');
  });

  it('GET /telemetry/summary — filters by caller', async () => {
    const res = await request(app, 'GET', '/telemetry/summary?caller=vigil');
    assert.equal(res.status, 200);
    assert.ok(res.body.operations.length >= 1);
    for (const op of res.body.operations) {
      assert.ok(op.callers.includes('vigil'));
    }
  });

  it('GET /telemetry/recent — returns recent entries', async () => {
    const res = await request(app, 'GET', '/telemetry/recent');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.entries));
    assert.ok(res.body.count >= 6);
    assert.ok(res.body.entries[0].id >= res.body.entries[1].id); // Descending order
  });

  it('GET /telemetry/recent — respects limit', async () => {
    const res = await request(app, 'GET', '/telemetry/recent?limit=2');
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);
    assert.equal(res.body.entries.length, 2);
  });

  it('GET /telemetry/recent — entries have correct shape', async () => {
    const res = await request(app, 'GET', '/telemetry/recent?limit=1');
    const entry = res.body.entries[0];
    assert.ok(entry.id);
    assert.ok(entry.operation);
    assert.ok(entry.timestamp);
    assert.ok(['ok', 'error', 'not_implemented'].includes(entry.status));
  });
});
