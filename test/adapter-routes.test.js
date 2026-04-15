/**
 * Adapter HTTP stub route tests (repair-graph-02).
 *
 * Verifies the six MP-3 blockchain stub routes return HTTP 501 with the
 * RFI-1 Option A body shape, and that TelemetryAdapter records each call
 * as status=not_implemented.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { TelemetryAdapter } from '../server/adapter/telemetry.js';
import { adapterRoutes, ADAPTER_STUB_ROUTES } from '../server/routes/adapter.js';

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
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
        });
      });
    });
    req.on('error', (err) => { server.close(); reject(err); });
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

function readTelemetry(db) {
  return db.prepare('SELECT * FROM adapter_telemetry ORDER BY id').all();
}

describe('Adapter stub routes (repair-graph-02)', () => {
  let app;
  let db;
  let sqlite;
  let adapter;

  before(() => {
    db = initDatabase(':memory:');
    sqlite = new SQLiteStorageAdapter(db);
    adapter = new TelemetryAdapter(sqlite, db);
    app = express();
    app.use(express.json());
    app.use('/adapter', adapterRoutes(adapter));
  });

  after(() => {
    adapter.close();
  });

  const cases = [
    { route: '/adapter/recordRuling', body: { ruling: { ruling_id: 'r1' } }, op: 'recordRuling' },
    { route: '/adapter/checkSpent', body: { token_urn: 'urn:test:token:1' }, op: 'checkSpent' },
    { route: '/adapter/markSpent', body: { token_urn: 'urn:test:token:1', executor: 'Cerberus' }, op: 'markSpent' },
    { route: '/adapter/mintToken', body: { scope: { tenant_urn: 'urn:test' }, ttl: 3600 }, op: 'mintToken' },
    { route: '/adapter/mintGovernanceVersion', body: { document: 'msp', hash: 'abc' }, op: 'mintGovernanceVersion' },
    { route: '/adapter/verifyHash', body: { version_urn: 'urn:test:v:1', hash: 'abc' }, op: 'verifyHash' },
  ];

  for (const { route, body, op } of cases) {
    it(`POST ${route} returns HTTP 501 + {error:'Not implemented'}`, async () => {
      const res = await request(app, 'POST', route, body);
      assert.equal(res.status, 501);
      assert.match(res.headers['content-type'] || '', /application\/json/);
      assert.deepEqual(res.body, { error: 'Not implemented' });
    });

    it(`POST ${route} records telemetry status=not_implemented`, async () => {
      const before = readTelemetry(db).filter(r => r.operation === op).length;
      await request(app, 'POST', route, body);
      const after = readTelemetry(db).filter(r => r.operation === op);
      assert.equal(after.length, before + 1);
      assert.equal(after[after.length - 1].status, 'not_implemented');
      assert.equal(after[after.length - 1].caller, 'direct');
    });
  }

  it('every name in ADAPTER_STUB_ROUTES has a corresponding 501 POST handler', async () => {
    for (const name of ADAPTER_STUB_ROUTES) {
      const res = await request(app, 'POST', `/adapter/${name}`, {});
      assert.equal(res.status, 501, `route /adapter/${name} should return 501`);
    }
  });

  it('an un-mounted adapter route returns 404 (distinguishability guarantee)', async () => {
    const res = await request(app, 'POST', '/adapter/nonexistent', {});
    assert.equal(res.status, 404);
  });
});
