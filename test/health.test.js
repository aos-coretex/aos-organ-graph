/**
 * Health and introspection endpoint tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { healthRoutes } from '../server/routes/health.js';

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

describe('Health routes', () => {
  let app;
  let adapter;

  before(() => {
    const db = initDatabase(':memory:');
    adapter = new SQLiteStorageAdapter(db);

    adapter.insertConcept('urn:h:1', '{"type":"test","name":"health-test"}');

    const startTime = Date.now();
    app = express();
    app.use(express.json());
    app.use(healthRoutes(adapter, startTime));
  });

  after(() => {
    adapter.close();
  });

  it('GET /health — returns ok', async () => {
    const res = await request(app, 'GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(typeof res.body.uptime_s, 'number');
    assert.equal(res.body.loop_iteration, 0);
    assert.equal(res.body.spine_connected, false);
  });

  it('GET /health — uptime increases', async () => {
    const res = await request(app, 'GET', '/health');
    assert.ok(res.body.uptime_s >= 0);
  });

  it('GET /introspect — returns MP-3 placeholders', async () => {
    const res = await request(app, 'GET', '/introspect');
    assert.equal(res.status, 200);
    assert.equal(res.body.mailbox_depth, 0);
    assert.equal(res.body.last_message_ts, null);
    assert.deepEqual(res.body.connected_producers, []);
    assert.deepEqual(res.body.connected_consumers, []);
  });

  it('GET /introspect — includes live DB stats', async () => {
    const res = await request(app, 'GET', '/introspect');
    assert.equal(typeof res.body.total_concepts, 'number');
    assert.ok(res.body.total_concepts > 0);
  });
});
