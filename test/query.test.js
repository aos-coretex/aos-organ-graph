/**
 * Query and search endpoint tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { queryRoutes } from '../server/routes/query.js';

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

describe('Query routes', () => {
  let app;
  let adapter;

  before(() => {
    const db = initDatabase(':memory:');
    adapter = new SQLiteStorageAdapter(db);

    // Seed test data
    adapter.insertConcept('urn:q:test:1', '{"type":"entity","entity":"test-ent","tier":"individual","status":"active"}');
    adapter.insertConcept('urn:q:test:2', '{"type":"document","name":"readme","keywords":"graph database"}');

    app = express();
    app.use(express.json());
    app.use(queryRoutes(adapter));
  });

  after(() => {
    adapter.close();
  });

  it('POST /query — executes SELECT', async () => {
    const res = await request(app, 'POST', '/query', {
      sql: 'SELECT COUNT(*) as c FROM concepts',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.rows);
    assert.equal(typeof res.body.count, 'number');
  });

  it('POST /query — parameterized query', async () => {
    const res = await request(app, 'POST', '/query', {
      sql: 'SELECT * FROM concepts WHERE urn = ?',
      params: ['urn:q:test:1'],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
  });

  it('POST /query — 400 on DROP', async () => {
    const res = await request(app, 'POST', '/query', {
      sql: 'DROP TABLE concepts',
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('SELECT'));
  });

  it('POST /query — 400 on INSERT', async () => {
    const res = await request(app, 'POST', '/query', {
      sql: "INSERT INTO concepts VALUES ('x','{}','now')",
    });
    assert.equal(res.status, 400);
  });

  it('POST /query — 400 on UPDATE', async () => {
    const res = await request(app, 'POST', '/query', {
      sql: "UPDATE concepts SET data = '{}' WHERE urn = 'x'",
    });
    assert.equal(res.status, 400);
  });

  it('POST /query — 400 on DELETE', async () => {
    const res = await request(app, 'POST', '/query', {
      sql: "DELETE FROM concepts WHERE urn = 'x'",
    });
    assert.equal(res.status, 400);
  });

  it('POST /query — 400 on ALTER', async () => {
    const res = await request(app, 'POST', '/query', {
      sql: 'ALTER TABLE concepts ADD COLUMN evil TEXT',
    });
    assert.equal(res.status, 400);
  });

  it('POST /query — 400 on CREATE', async () => {
    const res = await request(app, 'POST', '/query', {
      sql: 'CREATE TABLE evil (id INT)',
    });
    assert.equal(res.status, 400);
  });

  it('POST /query — 400 on missing sql', async () => {
    const res = await request(app, 'POST', '/query', {});
    assert.equal(res.status, 400);
  });

  it('POST /search — keyword match', async () => {
    const res = await request(app, 'POST', '/search', {
      keyword: 'graph',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.count > 0);
  });

  it('POST /search — type filter', async () => {
    const res = await request(app, 'POST', '/search', {
      keyword: 'test',
      concept_type: 'entity',
    });
    assert.equal(res.status, 200);
    for (const r of res.body.results) {
      assert.equal(r.data.type, 'entity');
    }
  });

  it('POST /search — limit enforcement', async () => {
    const res = await request(app, 'POST', '/search', {
      keyword: 'test',
      limit: 1,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.count <= 1);
  });

  it('POST /search — 400 on missing keyword', async () => {
    const res = await request(app, 'POST', '/search', {});
    assert.equal(res.status, 400);
  });
});
