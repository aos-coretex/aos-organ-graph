/**
 * Transaction recording endpoint tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { transactionRoutes } from '../server/routes/transactions.js';

async function request(app, method, path, body) {
  const { default: http } = await import('node:http');
  const server = app.listen(0);
  const port = server.address().port;

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
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
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Transaction routes', () => {
  let app;
  let adapter;

  before(() => {
    const db = initDatabase(':memory:');
    adapter = new SQLiteStorageAdapter(db);

    // Seed an entity for transaction validation
    adapter.insertConcept('urn:ent:tx:1', '{"type":"entity","entity":"test-entity","tier":"individual","status":"active"}');

    app = express();
    app.use(express.json());
    app.use('/transactions', transactionRoutes(adapter));
  });

  after(() => {
    adapter.close();
  });

  const validTx = {
    operation: 'INGEST',
    entity: 'test-entity',
    context: 'filesystem',
    initial_path: '/path/to/file',
    initial_name: 'doc.md',
    current_path: '/path/to/file',
    current_name: 'doc.md',
    operator: 'claude',
    state: 'original',
  };

  it('POST /transactions — creates transaction + binding (R7 payload shape)', async () => {
    const res = await request(app, 'POST', '/transactions', validTx);
    assert.equal(res.status, 201);
    // R7 envelope (c2a-http-route-03)
    assert.equal(res.body.status, 'SUCCESS');
    assert.equal(res.body.tool, 'graph__insert_transaction');
    assert.equal(res.body.meta.transport, 'http');
    assert.equal(res.body.meta.organ, 'graph');
    assert.ok(typeof res.body.elapsed_ms === 'number');
    // Payload
    assert.ok(res.body.data.urn.startsWith('urn:llm-ops:doc_transaction:'));
    assert.ok(res.body.data.binding.startsWith('ubn:llm-ops:filed_in:'));
    assert.ok(res.body.data.timestamp);
  });

  it('POST /transactions — verifies concept and binding in DB', async () => {
    const res = await request(app, 'POST', '/transactions', {
      ...validTx,
      rationale: 'test verification',
    });
    assert.equal(res.status, 201);

    // Verify concept was created
    const concept = adapter.getConcept(res.body.data.urn);
    assert.ok(concept);
    assert.equal(concept.data.type, 'doc_transaction');
    assert.equal(concept.data.operation, 'INGEST');

    // Verify binding was created
    const binding = adapter.getBinding(res.body.data.binding);
    assert.ok(binding);
    assert.equal(binding.data.relation, 'filed_in');
    assert.equal(binding.data.from_urn, res.body.data.urn);
  });

  it('POST /transactions — 400 on nonexistent entity', async () => {
    const res = await request(app, 'POST', '/transactions', {
      ...validTx,
      entity: 'nonexistent-entity',
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('not found'));
  });

  it('POST /transactions — 400 on missing required fields', async () => {
    const res = await request(app, 'POST', '/transactions', {
      operation: 'INGEST',
      entity: 'test-entity',
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('Missing'));
  });

  it('POST /transactions — includes optional fields', async () => {
    const res = await request(app, 'POST', '/transactions', {
      ...validTx,
      department: 'engineering',
      source: 'manual',
      rationale: 'test optional fields',
    });
    assert.equal(res.status, 201);

    const concept = adapter.getConcept(res.body.data.urn);
    assert.equal(concept.data.department, 'engineering');
    assert.equal(concept.data.source, 'manual');
    assert.equal(concept.data.rationale, 'test optional fields');
  });
});
