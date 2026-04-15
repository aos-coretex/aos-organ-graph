/**
 * Binding CRUD endpoint tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { bindingRoutes } from '../server/routes/bindings.js';

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

describe('Binding routes', () => {
  let app;
  let adapter;

  before(() => {
    const db = initDatabase(':memory:');
    adapter = new SQLiteStorageAdapter(db);
    app = express();
    app.use(express.json());
    app.use('/bindings', bindingRoutes(adapter));
  });

  after(() => {
    adapter.close();
  });

  it('POST /bindings — creates a binding', async () => {
    const res = await request(app, 'POST', '/bindings', {
      ubn: 'ubn:test:depends_on:100',
      data: { from_urn: 'urn:test:a:1', to_urn: 'urn:test:b:1', relation: 'depends_on' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.ubn, 'ubn:test:depends_on:100');
    assert.equal(res.body.relation, 'depends_on');
    assert.equal(res.body.from, 'urn:test:a:1');
    assert.equal(res.body.to, 'urn:test:b:1');
    assert.equal(res.body.status, 'created');
  });

  it('POST /bindings — 400 on missing required fields', async () => {
    const res = await request(app, 'POST', '/bindings', {
      ubn: 'ubn:test:depends_on:bad',
      data: { from_urn: 'urn:test:a:1' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'SCHEMA_VALIDATION_FAILED');
  });

  it('POST /bindings — 400 on missing ubn', async () => {
    const res = await request(app, 'POST', '/bindings', {
      data: { from_urn: 'urn:test:a:1', to_urn: 'urn:test:b:1', relation: 'test' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'SCHEMA_VALIDATION_FAILED');
  });

  it('POST /bindings — 409 on duplicate UBN', async () => {
    const res = await request(app, 'POST', '/bindings', {
      ubn: 'ubn:test:depends_on:100',
      data: { from_urn: 'urn:test:c:1', to_urn: 'urn:test:d:1', relation: 'test' },
    });
    assert.equal(res.status, 409);
  });

  it('GET /bindings/:ubn — retrieves a binding', async () => {
    const encoded = encodeURIComponent('ubn:test:depends_on:100');
    const res = await request(app, 'GET', `/bindings/${encoded}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ubn, 'ubn:test:depends_on:100');
    assert.equal(res.body.data.relation, 'depends_on');
    assert.ok(res.body.created_at);
  });

  it('GET /bindings/:ubn — 404 on missing', async () => {
    const encoded = encodeURIComponent('ubn:test:nonexistent:1');
    const res = await request(app, 'GET', `/bindings/${encoded}`);
    assert.equal(res.status, 404);
  });

  it('POST /bindings — 400 hard-rejects envelope-level source_urn / target_urn (analog of a7u-5 drift)', async () => {
    const res = await request(app, 'POST', '/bindings', {
      ubn: 'ubn:test:depends_on:envelope-drift',
      source_urn: 'urn:test:a:1',
      target_urn: 'urn:test:b:1',
      data: { from_urn: 'urn:test:a:1', to_urn: 'urn:test:b:1', relation: 'depends_on' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'SCHEMA_VALIDATION_FAILED');
  });
});
