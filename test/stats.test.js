/**
 * Statistics endpoint tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { statsRoutes } from '../server/routes/stats.js';

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

describe('Stats routes', () => {
  let app;
  let adapter;

  before(() => {
    const db = initDatabase(':memory:');
    adapter = new SQLiteStorageAdapter(db);

    // Seed test data
    adapter.insertConcept('urn:s:1', '{"type":"entity","entity":"e1","tier":"enterprise","status":"active"}');
    adapter.insertConcept('urn:s:2', '{"type":"document","name":"doc1"}');
    adapter.insertConcept('urn:s:3', '{"type":"document","name":"doc2"}');
    adapter.insertBinding('ubn:s:1', '{"from_urn":"urn:s:2","to_urn":"urn:s:1","relation":"belongs_to"}');

    const config = { machineId: 'test-machine', dbPath: ':memory:' };
    app = express();
    app.use(express.json());
    app.use('/stats', statsRoutes(adapter, config));
  });

  after(() => {
    adapter.close();
  });

  it('GET /stats — returns correct shape', async () => {
    const res = await request(app, 'GET', '/stats');
    assert.equal(res.status, 200);
    assert.equal(res.body.total_concepts, 3);
    assert.equal(res.body.total_bindings, 1);
    assert.equal(res.body.concepts_by_type.entity, 1);
    assert.equal(res.body.concepts_by_type.document, 2);
    assert.equal(res.body.active_entities, 1);
    assert.equal(res.body.schema_version, '4.0.0');
    assert.equal(res.body.machine_id, 'test-machine');
    assert.equal(res.body.db_path, ':memory:');
  });

  it('GET /stats — doc_transactions count', async () => {
    const res = await request(app, 'GET', '/stats');
    assert.equal(res.body.doc_transactions, 0);
  });

  it('GET /stats — indexed_documents count', async () => {
    const res = await request(app, 'GET', '/stats');
    assert.equal(res.body.indexed_documents, 2);
  });
});
