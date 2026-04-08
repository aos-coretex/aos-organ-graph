/**
 * Spine message handler tests for Graph.
 *
 * Tests the directed message dispatch — every adapter operation
 * available via Spine OTMs.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { TelemetryAdapter } from '../server/adapter/telemetry.js';
import { handleDirectedMessage } from '../server/handlers/messages.js';

function envelope(event_type, payload, from = 'Engram') {
  return { event_type, payload, from, id: `test-${Date.now()}` };
}

describe('Graph Spine message handlers', () => {
  let db;
  let adapter;

  before(() => {
    db = initDatabase(':memory:');
    const sqlite = new SQLiteStorageAdapter(db);
    adapter = new TelemetryAdapter(sqlite, db);
  });

  after(() => {
    adapter.close();
  });

  // ================================================================
  // insert_concept
  // ================================================================

  it('insert_concept — creates concept and returns result', () => {
    const res = handleDirectedMessage(
      envelope('insert_concept', {
        urn: 'urn:test:concept:1',
        data: { type: 'test', name: 'spine-test-concept' },
      }),
      adapter
    );
    assert.equal(res.event_type, 'insert_concept_result');
    assert.equal(res.urn, 'urn:test:concept:1');
    assert.equal(res.type, 'test');
    assert.equal(res.status, 'created');
  });

  it('insert_concept — accepts string data', () => {
    const res = handleDirectedMessage(
      envelope('insert_concept', {
        urn: 'urn:test:concept:str',
        data: '{"type":"test","name":"string-data"}',
      }),
      adapter
    );
    assert.equal(res.status, 'created');
  });

  it('insert_concept — returns error for duplicate URN', () => {
    const res = handleDirectedMessage(
      envelope('insert_concept', {
        urn: 'urn:test:concept:1',
        data: { type: 'test', name: 'duplicate' },
      }),
      adapter
    );
    assert.equal(res.event_type, 'insert_concept_error');
    assert.ok(res.error);
  });

  // ================================================================
  // insert_binding
  // ================================================================

  it('insert_binding — creates binding and returns result', () => {
    const res = handleDirectedMessage(
      envelope('insert_binding', {
        ubn: 'ubn:test:binding:1',
        data: { from_urn: 'urn:a', to_urn: 'urn:b', relation: 'test_rel' },
      }),
      adapter
    );
    assert.equal(res.event_type, 'insert_binding_result');
    assert.equal(res.ubn, 'ubn:test:binding:1');
    assert.equal(res.relation, 'test_rel');
    assert.equal(res.status, 'created');
  });

  // ================================================================
  // query
  // ================================================================

  it('query — executes SELECT and returns rows', () => {
    const res = handleDirectedMessage(
      envelope('query', {
        sql: 'SELECT urn FROM concepts LIMIT 5',
        params: [],
      }),
      adapter
    );
    assert.equal(res.event_type, 'query_result');
    assert.ok(Array.isArray(res.rows));
    assert.ok(res.count > 0);
  });

  it('query — rejects non-SELECT', () => {
    const res = handleDirectedMessage(
      envelope('query', {
        sql: 'DELETE FROM concepts',
        params: [],
      }),
      adapter
    );
    assert.equal(res.event_type, 'query_error');
    assert.ok(res.error.includes('SELECT'));
  });

  // ================================================================
  // query_concepts
  // ================================================================

  it('query_concepts — by URN returns single concept', () => {
    const res = handleDirectedMessage(
      envelope('query_concepts', { urn: 'urn:test:concept:1' }),
      adapter
    );
    assert.equal(res.event_type, 'query_concepts_result');
    assert.ok(res.concept);
    assert.equal(res.concept.urn, 'urn:test:concept:1');
    assert.equal(res.concept.data.type, 'test');
  });

  it('query_concepts — by URN returns null for missing', () => {
    const res = handleDirectedMessage(
      envelope('query_concepts', { urn: 'urn:nonexistent' }),
      adapter
    );
    assert.equal(res.event_type, 'query_concepts_result');
    assert.equal(res.concept, null);
  });

  it('query_concepts — filtered by type', () => {
    const res = handleDirectedMessage(
      envelope('query_concepts', { type: 'test', limit: 10 }),
      adapter
    );
    assert.equal(res.event_type, 'query_concepts_result');
    assert.ok(Array.isArray(res.concepts));
    assert.ok(res.count > 0);
    for (const c of res.concepts) {
      assert.equal(c.data.type, 'test');
    }
  });

  // ================================================================
  // query_bindings
  // ================================================================

  it('query_bindings — by UBN returns single binding', () => {
    const res = handleDirectedMessage(
      envelope('query_bindings', { ubn: 'ubn:test:binding:1' }),
      adapter
    );
    assert.equal(res.event_type, 'query_bindings_result');
    assert.ok(res.binding);
    assert.equal(res.binding.ubn, 'ubn:test:binding:1');
  });

  it('query_bindings — filtered by relation', () => {
    const res = handleDirectedMessage(
      envelope('query_bindings', { relation: 'test_rel', limit: 10 }),
      adapter
    );
    assert.equal(res.event_type, 'query_bindings_result');
    assert.ok(Array.isArray(res.bindings));
    assert.ok(res.count > 0);
  });

  // ================================================================
  // search
  // ================================================================

  it('search — returns matching concepts', () => {
    const res = handleDirectedMessage(
      envelope('search', { keyword: 'spine-test', limit: 10 }),
      adapter
    );
    assert.equal(res.event_type, 'search_result');
    assert.ok(Array.isArray(res.results));
    assert.ok(res.count > 0);
  });

  it('search — with type filter', () => {
    const res = handleDirectedMessage(
      envelope('search', { keyword: 'spine', type: 'test', limit: 10 }),
      adapter
    );
    assert.equal(res.event_type, 'search_result');
    assert.ok(res.count > 0);
  });

  // ================================================================
  // delete_concept
  // ================================================================

  it('delete_concept — deletes existing concept', () => {
    // Insert one to delete
    adapter.insertConcept('urn:test:del:1', '{"type":"test","name":"to-delete"}');

    const res = handleDirectedMessage(
      envelope('delete_concept', { urn: 'urn:test:del:1' }),
      adapter
    );
    assert.equal(res.event_type, 'delete_concept_result');
    assert.equal(res.status, 'deleted');

    // Verify gone
    const check = adapter.getConcept('urn:test:del:1');
    assert.equal(check, null);
  });

  it('delete_concept — returns not_found for missing', () => {
    const res = handleDirectedMessage(
      envelope('delete_concept', { urn: 'urn:nonexistent' }),
      adapter
    );
    assert.equal(res.event_type, 'delete_concept_result');
    assert.equal(res.status, 'not_found');
  });

  // ================================================================
  // delete_binding
  // ================================================================

  it('delete_binding — deletes existing binding', () => {
    adapter.insertBinding('ubn:test:del:1', '{"from_urn":"urn:x","to_urn":"urn:y","relation":"del_test"}');

    const res = handleDirectedMessage(
      envelope('delete_binding', { ubn: 'ubn:test:del:1' }),
      adapter
    );
    assert.equal(res.event_type, 'delete_binding_result');
    assert.equal(res.status, 'deleted');

    const check = adapter.getBinding('ubn:test:del:1');
    assert.equal(check, null);
  });

  // ================================================================
  // Unknown message
  // ================================================================

  it('unknown event_type — returns null', () => {
    const res = handleDirectedMessage(
      envelope('bogus_event', {}),
      adapter
    );
    assert.equal(res, null);
  });
});
