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
      ubn: 'ubn:test:bind:100',
      data: '{"from_urn":"urn:a","to_urn":"urn:b","relation":"depends_on"}',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.ubn, 'ubn:test:bind:100');
    assert.equal(res.body.relation, 'depends_on');
    assert.equal(res.body.from, 'urn:a');
    assert.equal(res.body.to, 'urn:b');
    assert.equal(res.body.status, 'created');
  });

  it('POST /bindings — 400 on missing required fields', async () => {
    const res = await request(app, 'POST', '/bindings', {
      ubn: 'ubn:test:bind:bad',
      data: '{"from_urn":"urn:a"}',
    });
    assert.equal(res.status, 400);
  });

  it('POST /bindings — 400 on missing ubn', async () => {
    const res = await request(app, 'POST', '/bindings', {
      data: '{"from_urn":"urn:a","to_urn":"urn:b","relation":"test"}',
    });
    assert.equal(res.status, 400);
  });

  it('POST /bindings — 409 on duplicate UBN', async () => {
    const res = await request(app, 'POST', '/bindings', {
      ubn: 'ubn:test:bind:100',
      data: '{"from_urn":"urn:c","to_urn":"urn:d","relation":"test"}',
    });
    assert.equal(res.status, 409);
  });

  it('GET /bindings/:ubn — retrieves a binding', async () => {
    const encoded = encodeURIComponent('ubn:test:bind:100');
    const res = await request(app, 'GET', `/bindings/${encoded}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ubn, 'ubn:test:bind:100');
    assert.equal(res.body.data.relation, 'depends_on');
    assert.ok(res.body.created_at);
  });

  it('GET /bindings/:ubn — 404 on missing', async () => {
    const encoded = encodeURIComponent('ubn:nonexistent:1');
    const res = await request(app, 'GET', `/bindings/${encoded}`);
    assert.equal(res.status, 404);
  });
});
