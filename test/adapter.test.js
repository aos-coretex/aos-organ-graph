/**
 * StorageAdapter contract tests.
 * Verifies interface enforcement and SQLite implementation correctness.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { StorageAdapter } from '../server/adapter/interface.js';

describe('StorageAdapter interface', () => {
  it('throws on unimplemented methods', () => {
    const base = new StorageAdapter();
    assert.throws(() => base.insertConcept(), /not implemented/);
    assert.throws(() => base.getConcept(), /not implemented/);
    assert.throws(() => base.updateConcept(), /not implemented/);
    assert.throws(() => base.insertBinding(), /not implemented/);
    assert.throws(() => base.getBinding(), /not implemented/);
    assert.throws(() => base.query(), /not implemented/);
    assert.throws(() => base.search(), /not implemented/);
    assert.throws(() => base.getEntities(), /not implemented/);
    assert.throws(() => base.insertTransaction(), /not implemented/);
    assert.throws(() => base.getStats(), /not implemented/);
    assert.throws(() => base.healthCheck(), /not implemented/);
    assert.throws(() => base.close(), /not implemented/);
  });
});

describe('SQLiteStorageAdapter', () => {
  let db;
  let adapter;

  before(() => {
    db = initDatabase(':memory:');
    adapter = new SQLiteStorageAdapter(db);
  });

  after(() => {
    adapter.close();
  });

  it('extends StorageAdapter', () => {
    assert.ok(adapter instanceof StorageAdapter);
  });

  it('healthCheck returns true for open database', () => {
    assert.equal(adapter.healthCheck(), true);
  });

  it('getStats returns correct initial shape', () => {
    const stats = adapter.getStats();
    assert.equal(typeof stats.total_concepts, 'number');
    assert.equal(typeof stats.total_bindings, 'number');
    assert.equal(typeof stats.concepts_by_type, 'object');
    assert.equal(typeof stats.active_entities, 'number');
    assert.equal(typeof stats.doc_transactions, 'number');
    assert.equal(typeof stats.indexed_documents, 'number');
    assert.equal(stats.schema_version, '4.0.0');
  });

  it('insertConcept requires type field in data', () => {
    assert.throws(
      () => adapter.insertConcept('urn:test:bad:1', '{"name":"no-type"}'),
      /type/
    );
  });

  it('insertConcept succeeds with valid data', () => {
    const result = adapter.insertConcept(
      'urn:test:concept:1',
      '{"type":"test","name":"hello"}'
    );
    assert.equal(result.urn, 'urn:test:concept:1');
    assert.equal(result.type, 'test');
    assert.equal(result.status, 'created');
  });

  it('getConcept returns parsed data', () => {
    const concept = adapter.getConcept('urn:test:concept:1');
    assert.ok(concept);
    assert.equal(concept.urn, 'urn:test:concept:1');
    assert.equal(concept.data.type, 'test');
    assert.equal(concept.data.name, 'hello');
    assert.ok(concept.created_at);
  });

  it('getConcept returns null for missing URN', () => {
    assert.equal(adapter.getConcept('urn:nonexistent:1'), null);
  });

  it('updateConcept merges fields', () => {
    const result = adapter.updateConcept(
      'urn:test:concept:1',
      '{"status":"active","extra":"field"}'
    );
    assert.ok(result);
    assert.equal(result.data.type, 'test');
    assert.equal(result.data.name, 'hello');
    assert.equal(result.data.status, 'active');
    assert.equal(result.data.extra, 'field');
    assert.equal(result.status, 'updated');
  });

  it('updateConcept returns null for missing URN', () => {
    assert.equal(
      adapter.updateConcept('urn:nonexistent:1', '{"x":1}'),
      null
    );
  });

  it('insertBinding requires from_urn, to_urn, relation', () => {
    assert.throws(
      () => adapter.insertBinding('ubn:test:1', '{"from_urn":"a"}'),
      /to_urn/
    );
  });

  it('insertBinding succeeds with valid data', () => {
    const result = adapter.insertBinding(
      'ubn:test:bind:1',
      '{"from_urn":"urn:a","to_urn":"urn:b","relation":"test_rel"}'
    );
    assert.equal(result.ubn, 'ubn:test:bind:1');
    assert.equal(result.relation, 'test_rel');
    assert.equal(result.from, 'urn:a');
    assert.equal(result.to, 'urn:b');
    assert.equal(result.status, 'created');
  });

  it('getBinding returns parsed data', () => {
    const binding = adapter.getBinding('ubn:test:bind:1');
    assert.ok(binding);
    assert.equal(binding.ubn, 'ubn:test:bind:1');
    assert.equal(binding.data.relation, 'test_rel');
  });

  it('getBinding returns null for missing UBN', () => {
    assert.equal(adapter.getBinding('ubn:nonexistent:1'), null);
  });

  it('query executes SELECT', () => {
    const result = adapter.query('SELECT COUNT(*) as c FROM concepts');
    assert.ok(result.rows.length > 0);
    assert.equal(typeof result.count, 'number');
  });

  it('query rejects non-SELECT statements', () => {
    assert.throws(() => adapter.query('DROP TABLE concepts'), /Only SELECT/);
    assert.throws(() => adapter.query('INSERT INTO concepts VALUES (1,2)'), /Only SELECT/);
    assert.throws(() => adapter.query('UPDATE concepts SET urn = 1'), /Only SELECT/);
    assert.throws(() => adapter.query('DELETE FROM concepts'), /Only SELECT/);
    assert.throws(() => adapter.query('ALTER TABLE concepts ADD col TEXT'), /Only SELECT/);
    assert.throws(() => adapter.query('CREATE TABLE evil (id INT)'), /Only SELECT/);
  });

  it('query supports parameterized queries', () => {
    const result = adapter.query(
      'SELECT * FROM concepts WHERE urn = ?',
      ['urn:test:concept:1']
    );
    assert.equal(result.count, 1);
  });

  it('search finds matching concepts', () => {
    const result = adapter.search('hello');
    assert.ok(result.count > 0);
    assert.ok(result.results[0].data.name === 'hello');
  });

  it('search filters by type', () => {
    adapter.insertConcept('urn:test:other:1', '{"type":"other","name":"hello-other"}');
    const result = adapter.search('hello', 'other');
    assert.equal(result.count, 1);
    assert.equal(result.results[0].data.type, 'other');
  });

  it('search respects limit', () => {
    const result = adapter.search('hello', null, 1);
    assert.equal(result.count, 1);
  });
});
