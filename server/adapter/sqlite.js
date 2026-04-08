/**
 * SQLiteStorageAdapter — concrete StorageAdapter backed by better-sqlite3.
 *
 * This is the ONLY module that calls db.prepare(). All other Graph modules
 * access storage exclusively through the adapter methods.
 */

import { randomBytes } from 'node:crypto';
import { StorageAdapter } from './interface.js';

export class SQLiteStorageAdapter extends StorageAdapter {

  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    super();
    this._db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    const db = this._db;

    // --- Concepts ---

    this._insertConceptStmt = db.prepare(`
      INSERT INTO concepts (urn, data) VALUES (?, ?)
    `);

    this._getConceptStmt = db.prepare(
      'SELECT urn, data, created_at FROM concepts WHERE urn = ?'
    );

    this._updateConceptData = db.prepare(`
      UPDATE concepts SET data = ? WHERE urn = ?
    `);

    // --- Bindings ---

    this._insertBindingStmt = db.prepare(`
      INSERT INTO class_bindings (ubn, data) VALUES (?, ?)
    `);

    this._getBindingStmt = db.prepare(
      'SELECT ubn, data, created_at FROM class_bindings WHERE ubn = ?'
    );

    // --- Entities ---

    this._getEntitiesAll = db.prepare(
      "SELECT * FROM v_entities WHERE status = ?"
    );

    this._getEntitiesByTier = db.prepare(
      "SELECT * FROM v_entities WHERE tier = ? AND status = ?"
    );

    // --- Stats ---

    this._countConcepts = db.prepare(
      'SELECT COUNT(*) as count FROM concepts'
    );

    this._countBindings = db.prepare(
      'SELECT COUNT(*) as count FROM class_bindings'
    );

    this._conceptsByType = db.prepare(`
      SELECT json_extract(data, '$.type') as type, COUNT(*) as count
      FROM concepts
      GROUP BY json_extract(data, '$.type')
    `);

    this._countActiveEntities = db.prepare(
      "SELECT COUNT(*) as count FROM v_entities WHERE status = 'active'"
    );

    this._countDocTransactions = db.prepare(`
      SELECT COUNT(*) as count FROM concepts
      WHERE json_extract(data, '$.type') = 'doc_transaction'
    `);

    this._countDocuments = db.prepare(`
      SELECT COUNT(*) as count FROM concepts
      WHERE json_extract(data, '$.type') = 'document'
    `);

    this._getSchemaVersion = db.prepare(
      "SELECT value FROM op_config WHERE key = 'schema_version'"
    );

    // --- Entity existence check (for transactions) ---

    this._entityExists = db.prepare(
      'SELECT urn FROM v_entities WHERE entity = ?'
    );

    // --- Health ---

    this._healthPing = db.prepare('SELECT 1');
  }

  // ================================================================
  // Concepts
  // ================================================================

  insertConcept(urn, data) {
    const parsed = JSON.parse(data);
    if (!parsed.type) {
      throw new Error('Concept data must include a "type" field');
    }
    this._insertConceptStmt.run(urn, data);
    return { urn, type: parsed.type, status: 'created' };
  }

  getConcept(urn) {
    const row = this._getConceptStmt.get(urn);
    if (!row) return null;
    return {
      urn: row.urn,
      data: JSON.parse(row.data),
      created_at: row.created_at,
    };
  }

  updateConcept(urn, mergeData) {
    const existing = this._getConceptStmt.get(urn);
    if (!existing) return null;

    const existingData = JSON.parse(existing.data);
    const newFields = JSON.parse(mergeData);
    const merged = { ...existingData, ...newFields };
    const mergedJson = JSON.stringify(merged);

    this._updateConceptData.run(mergedJson, urn);
    return { urn, data: merged, status: 'updated' };
  }

  // ================================================================
  // Bindings
  // ================================================================

  insertBinding(ubn, data) {
    const parsed = JSON.parse(data);
    if (!parsed.from_urn || !parsed.to_urn || !parsed.relation) {
      throw new Error('Binding data must include "from_urn", "to_urn", and "relation"');
    }
    this._insertBindingStmt.run(ubn, data);
    return {
      ubn,
      relation: parsed.relation,
      from: parsed.from_urn,
      to: parsed.to_urn,
      status: 'created',
    };
  }

  getBinding(ubn) {
    const row = this._getBindingStmt.get(ubn);
    if (!row) return null;
    return {
      ubn: row.ubn,
      data: JSON.parse(row.data),
      created_at: row.created_at,
    };
  }

  // ================================================================
  // Query
  // ================================================================

  query(sql, params = []) {
    const trimmed = sql.trim().toUpperCase();
    const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE'];
    for (const keyword of forbidden) {
      if (trimmed.startsWith(keyword)) {
        throw new Error('Only SELECT queries are allowed');
      }
    }
    const rows = this._db.prepare(sql).all(...params);
    return { rows, count: rows.length };
  }

  search(keyword, type = null, limit = 20) {
    const pattern = `%${keyword}%`;
    let sql;
    let params;

    if (type) {
      sql = `SELECT urn, data, created_at FROM concepts
             WHERE data LIKE ? AND json_extract(data, '$.type') = ?
             LIMIT ?`;
      params = [pattern, type, limit];
    } else {
      sql = `SELECT urn, data, created_at FROM concepts
             WHERE data LIKE ?
             LIMIT ?`;
      params = [pattern, limit];
    }

    const rows = this._db.prepare(sql).all(...params);
    const results = rows.map(r => ({
      urn: r.urn,
      data: JSON.parse(r.data),
      created_at: r.created_at,
    }));
    return { results, count: results.length };
  }

  // ================================================================
  // Entities
  // ================================================================

  getEntities(tier = null, status = 'active') {
    let rows;
    if (tier) {
      rows = this._getEntitiesByTier.all(tier, status);
    } else {
      rows = this._getEntitiesAll.all(status);
    }
    return { entities: rows, count: rows.length };
  }

  // ================================================================
  // Transactions
  // ================================================================

  insertTransaction(fields) {
    const entityRow = this._entityExists.get(fields.entity);
    if (!entityRow) {
      throw new Error(`Entity "${fields.entity}" not found in v_entities`);
    }

    const timestamp = new Date().toISOString();
    const randHex = randomBytes(4).toString('hex');
    const urn = `urn:llm-ops:doc_transaction:${timestamp}-${randHex}`;
    const ubn = `ubn:llm-ops:filed_in:${timestamp}-${randHex}`;

    const conceptData = JSON.stringify({
      type: 'doc_transaction',
      timestamp,
      operation: fields.operation,
      entity: fields.entity,
      context: fields.context,
      initial_path: fields.initial_path,
      initial_name: fields.initial_name,
      current_path: fields.current_path,
      current_name: fields.current_name,
      department: fields.department || null,
      source: fields.source || null,
      operator: fields.operator,
      rationale: fields.rationale || null,
      state: fields.state,
    });

    const bindingData = JSON.stringify({
      from_urn: urn,
      to_urn: entityRow.urn,
      relation: 'filed_in',
    });

    // Atomic: insert concept + binding in a transaction
    const insertTx = this._db.transaction(() => {
      this._insertConceptStmt.run(urn, conceptData);
      this._insertBindingStmt.run(ubn, bindingData);
    });
    insertTx();

    return { urn, timestamp, binding: ubn, status: 'created' };
  }

  // ================================================================
  // Statistics
  // ================================================================

  getStats() {
    const totalConcepts = this._countConcepts.get().count;
    const totalBindings = this._countBindings.get().count;

    const conceptsByType = this._conceptsByType.all()
      .reduce((acc, r) => { acc[r.type] = r.count; return acc; }, {});

    const activeEntities = this._countActiveEntities.get().count;
    const docTransactions = this._countDocTransactions.get().count;
    const indexedDocuments = this._countDocuments.get().count;

    const versionRow = this._getSchemaVersion.get();
    const schemaVersion = versionRow ? versionRow.value : 'unknown';

    return {
      total_concepts: totalConcepts,
      total_bindings: totalBindings,
      concepts_by_type: conceptsByType,
      active_entities: activeEntities,
      doc_transactions: docTransactions,
      indexed_documents: indexedDocuments,
      schema_version: schemaVersion,
    };
  }

  // ================================================================
  // Diagnostics
  // ================================================================

  healthCheck() {
    try {
      this._healthPing.get();
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this._db.close();
  }

  // ================================================================
  // Blockchain stubs (Graphheight 411 — not yet operational)
  // ================================================================

  recordRuling(_ruling) {
    return { error: 'Not implemented', status: 501 };
  }

  checkSpent(_tokenUrn) {
    return { error: 'Not implemented', status: 501 };
  }

  markSpent(_tokenUrn, _executor) {
    return { error: 'Not implemented', status: 501 };
  }

  mintToken(_scope, _ttl) {
    return { error: 'Not implemented', status: 501 };
  }

  mintGovernanceVersion(_document, _hash) {
    return { error: 'Not implemented', status: 501 };
  }

  verifyHash(_versionUrn, _hash) {
    return { error: 'Not implemented', status: 501 };
  }

  // ================================================================
  // Reference stub (Graphheight 411)
  // ================================================================

  publishReference(_sourceUrn, _targetSystem, _targetId) {
    return { error: 'Not implemented', status: 501 };
  }

  // ================================================================
  // Instance binding stub (Graphheight 614)
  // ================================================================

  bindInstance(_fromUrn, _toUrn, _relation, _instanceData) {
    return { error: 'Not implemented', status: 501 };
  }
}
