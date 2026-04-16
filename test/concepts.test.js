/**
 * Concept CRUD endpoint tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { conceptRoutes } from '../server/routes/concepts.js';

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

describe('Concept routes', () => {
  let app;
  let adapter;

  before(() => {
    const db = initDatabase(':memory:');
    adapter = new SQLiteStorageAdapter(db);
    app = express();
    app.use(express.json());
    app.use('/concepts', conceptRoutes(adapter));
  });

  after(() => {
    adapter.close();
  });

  it('POST /concepts — creates a concept', async () => {
    const res = await request(app, 'POST', '/concepts', {
      urn: 'urn:test:concept:100',
      data: { type: 'test', name: 'route-test' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.urn, 'urn:test:concept:100');
    assert.equal(res.body.type, 'test');
    assert.equal(res.body.status, 'created');
  });

  it('POST /concepts — 400 on missing urn', async () => {
    const res = await request(app, 'POST', '/concepts', {
      data: { type: 'test' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'SCHEMA_VALIDATION_FAILED');
  });

  it('POST /concepts — 400 on missing type in data', async () => {
    const res = await request(app, 'POST', '/concepts', {
      urn: 'urn:test:concept:bad',
      data: { name: 'no-type' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'SCHEMA_VALIDATION_FAILED');
  });

  it('POST /concepts — 409 on duplicate URN', async () => {
    const res = await request(app, 'POST', '/concepts', {
      urn: 'urn:test:concept:100',
      data: { type: 'test' },
    });
    assert.equal(res.status, 409);
  });

  it('GET /concepts/:urn — retrieves a concept', async () => {
    const encoded = encodeURIComponent('urn:test:concept:100');
    const res = await request(app, 'GET', `/concepts/${encoded}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.urn, 'urn:test:concept:100');
    assert.equal(res.body.data.name, 'route-test');
    assert.ok(res.body.created_at);
  });

  it('GET /concepts/:urn — 404 on missing', async () => {
    const encoded = encodeURIComponent('urn:test:nonexistent:1');
    const res = await request(app, 'GET', `/concepts/${encoded}`);
    assert.equal(res.status, 404);
  });

  it('PATCH /concepts/:urn — merges data (R7 payload shape)', async () => {
    const encoded = encodeURIComponent('urn:test:concept:100');
    const res = await request(app, 'PATCH', `/concepts/${encoded}`, {
      data: { status: 'active' },
    });
    assert.equal(res.status, 200);
    // R7 envelope (c2a-http-route-03)
    assert.equal(res.body.status, 'SUCCESS');
    assert.equal(res.body.tool, 'graph__update_concept');
    assert.equal(res.body.meta.transport, 'http');
    assert.equal(res.body.meta.organ, 'graph');
    assert.ok(typeof res.body.elapsed_ms === 'number');
    // Payload — merged concept
    assert.equal(res.body.data.urn, 'urn:test:concept:100');
    assert.equal(res.body.data.data.status, 'active');
    assert.equal(res.body.data.data.name, 'route-test');
  });

  it('PATCH /concepts/:urn — 404 on missing', async () => {
    const encoded = encodeURIComponent('urn:test:nonexistent:1');
    const res = await request(app, 'PATCH', `/concepts/${encoded}`, {
      data: { x: 1 },
    });
    assert.equal(res.status, 404);
  });

  it('POST /concepts — 400 hard-rejects envelope-level type (a7u-5 drift class)', async () => {
    const res = await request(app, 'POST', '/concepts', {
      urn: 'urn:test:concept:envelope-type',
      type: 'test',
      data: { type: 'test', name: 'envelope-type-drift' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'SCHEMA_VALIDATION_FAILED');
  });
});
