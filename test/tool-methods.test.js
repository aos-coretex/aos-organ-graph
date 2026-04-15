/**
 * Graph tool methods — MP-TOOL-1 relay t8r-2.
 *
 * Methods are thin adapter wrappers — tests verify param plumbing, return
 * shape, and error surfacing. In-memory SQLite isolates from real data.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { TelemetryAdapter } from '../server/adapter/telemetry.js';
import { createToolMethods } from '../server/tool-methods.js';

describe('Graph tool-methods — thin adapter wrappers', () => {
  let db;
  let adapter;
  let methods;

  before(() => {
    db = initDatabase(':memory:');
    const sqlite = new SQLiteStorageAdapter(db);
    adapter = new TelemetryAdapter(sqlite, db);
    methods = createToolMethods(adapter);
  });

  after(() => {
    adapter.close();
  });

  it('exposes exactly the 8 declared methods', () => {
    const expected = [
      'getStats', 'query', 'insertConcept', 'updateConcept',
      'insertBinding', 'insertTransaction', 'queryEntities', 'search',
    ];
    for (const name of expected) {
      assert.equal(typeof methods[name], 'function', `methods.${name} is not a function`);
    }
  });

  it('getStats returns serializable aggregate', async () => {
    const stats = await methods.getStats();
    assert.equal(typeof stats.total_concepts, 'number');
    assert.equal(typeof stats.total_bindings, 'number');
    assert.ok(stats.schema_version);
  });

  it('insertConcept + query round-trip via SELECT', async () => {
    await methods.insertConcept({
      urn: 'urn:test:concept:tool-methods-1',
      data: JSON.stringify({ type: 'test', name: 'tm-rt' }),
    });

    const q = await methods.query({
      sql: 'SELECT urn FROM concepts WHERE urn = ?',
      params: ['urn:test:concept:tool-methods-1'],
    });
    assert.equal(q.count, 1);
    assert.equal(q.rows[0].urn, 'urn:test:concept:tool-methods-1');
  });

  it('updateConcept merges JSON fields', async () => {
    await methods.insertConcept({
      urn: 'urn:test:concept:upd-1',
      data: JSON.stringify({ type: 'test', name: 'original' }),
    });
    const result = await methods.updateConcept({
      urn: 'urn:test:concept:upd-1',
      data: JSON.stringify({ name: 'updated', extra: 1 }),
    });
    assert.equal(result.status, 'updated');
    assert.equal(result.data.name, 'updated');
    assert.equal(result.data.extra, 1);
    assert.equal(result.data.type, 'test');
  });

  it('updateConcept throws ENOTFOUND for missing URN', async () => {
    await assert.rejects(
      () => methods.updateConcept({
        urn: 'urn:test:concept:does-not-exist',
        data: JSON.stringify({ x: 1 }),
      }),
      (err) => err.code === 'ENOTFOUND'
    );
  });

  it('insertBinding requires from_urn/to_urn/relation in data', async () => {
    // Seed two concepts so the binding is meaningful
    await methods.insertConcept({
      urn: 'urn:test:concept:bind-from',
      data: JSON.stringify({ type: 'test' }),
    });
    await methods.insertConcept({
      urn: 'urn:test:concept:bind-to',
      data: JSON.stringify({ type: 'test' }),
    });
    const result = await methods.insertBinding({
      ubn: 'ubn:test:relates_to:1',
      data: JSON.stringify({
        from_urn: 'urn:test:concept:bind-from',
        to_urn: 'urn:test:concept:bind-to',
        relation: 'relates_to',
      }),
    });
    assert.equal(result.status, 'created');
    assert.equal(result.relation, 'relates_to');
  });

  it('search returns matching concepts', async () => {
    await methods.insertConcept({
      urn: 'urn:test:concept:searchable-alpha',
      data: JSON.stringify({ type: 'test', marker: 'searchable-alpha-unique' }),
    });
    const res = await methods.search({
      keyword: 'searchable-alpha-unique',
    });
    assert.ok(res.count >= 1);
    assert.ok(res.results.some(r => r.urn === 'urn:test:concept:searchable-alpha'));
  });

  it('queryEntities accepts empty params', async () => {
    const res = await methods.queryEntities({});
    assert.equal(typeof res.count, 'number');
    assert.ok(Array.isArray(res.entities));
  });

  it('insertTransaction requires operation+entity+context+paths (validation)', async () => {
    await assert.rejects(
      () => methods.insertTransaction({ operation: 'INGEST' }),
      (err) => err.code === 'EBADPARAM'
    );
  });

  it('query rejects non-string sql', async () => {
    await assert.rejects(
      () => methods.query({ sql: 123 }),
      (err) => err.code === 'EBADPARAM'
    );
  });

  it('insertConcept rejects missing urn', async () => {
    await assert.rejects(
      () => methods.insertConcept({ data: '{"type":"x"}' }),
      (err) => err.code === 'EBADPARAM'
    );
  });
});
