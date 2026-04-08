/**
 * Entity listing endpoint tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { entityRoutes } from '../server/routes/entities.js';

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
    req.end();
  });
}

describe('Entity routes', () => {
  let app;
  let adapter;

  before(() => {
    const db = initDatabase(':memory:');
    adapter = new SQLiteStorageAdapter(db);

    // Seed entities
    adapter.insertConcept('urn:ent:1', '{"type":"entity","entity":"graphheight","tier":"enterprise","status":"active"}');
    adapter.insertConcept('urn:ent:2', '{"type":"entity","entity":"blubox","tier":"artifact","status":"active"}');
    adapter.insertConcept('urn:ent:3', '{"type":"entity","entity":"old-proj","tier":"individual","status":"archived"}');

    app = express();
    app.use(express.json());
    app.use('/entities', entityRoutes(adapter));
  });

  after(() => {
    adapter.close();
  });

  it('GET /entities — lists active entities by default', async () => {
    const res = await request(app, 'GET', '/entities');
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);
    for (const e of res.body.entities) {
      assert.equal(e.status, 'active');
    }
  });

  it('GET /entities?tier=enterprise — filters by tier', async () => {
    const res = await request(app, 'GET', '/entities?tier=enterprise');
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.entities[0].entity, 'graphheight');
  });

  it('GET /entities?status=archived — filters by status', async () => {
    const res = await request(app, 'GET', '/entities?status=archived');
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.entities[0].entity, 'old-proj');
  });

  it('GET /entities?tier=smb — empty result for no matches', async () => {
    const res = await request(app, 'GET', '/entities?tier=smb');
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 0);
  });
});
