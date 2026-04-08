/**
 * StorageAdapter interface — the boundary where SQLite swaps to Graphheight.
 *
 * Current:  SQLiteStorageAdapter (server/adapter/sqlite.js)
 * Future:   GraphheightStorageAdapter (HTTP calls to Graphheight 911 -> 311)
 *
 * All graph.db access MUST go through this adapter. No direct db.prepare()
 * calls outside the adapter module.
 */

export class StorageAdapter {

  // --- Concept operations (Graphheight 511 equivalent) ---

  /** Insert a concept. Returns { urn, type, status: "created" }. */
  insertConcept(_urn, _data) {
    throw new Error('StorageAdapter.insertConcept() not implemented');
  }

  /** Get a concept by URN. Returns { urn, data, created_at } or null. */
  getConcept(_urn) {
    throw new Error('StorageAdapter.getConcept() not implemented');
  }

  /** Merge new fields into existing concept data. Returns { urn, data, status: "updated" } or null. */
  updateConcept(_urn, _mergeData) {
    throw new Error('StorageAdapter.updateConcept() not implemented');
  }

  // --- Binding operations (Graphheight 611-614 equivalent) ---

  /** Insert a binding. Returns { ubn, relation, from, to, status: "created" }. */
  insertBinding(_ubn, _data) {
    throw new Error('StorageAdapter.insertBinding() not implemented');
  }

  /** Get a binding by UBN. Returns { ubn, data, created_at } or null. */
  getBinding(_ubn) {
    throw new Error('StorageAdapter.getBinding() not implemented');
  }

  // --- Query operations ---

  /** Execute a read-only SQL query. Returns { rows, count }. */
  query(_sql, _params) {
    throw new Error('StorageAdapter.query() not implemented');
  }

  /** Keyword search across concept data. Returns { results, count }. */
  search(_keyword, _type, _limit) {
    throw new Error('StorageAdapter.search() not implemented');
  }

  /** List entities from v_entities view. Returns { entities, count }. */
  getEntities(_tier, _status) {
    throw new Error('StorageAdapter.getEntities() not implemented');
  }

  // --- Transaction operations ---

  /** Record a document transaction + filed_in binding. Returns { urn, timestamp, binding, status: "created" }. */
  insertTransaction(_fields) {
    throw new Error('StorageAdapter.insertTransaction() not implemented');
  }

  // --- Statistics ---

  /** Aggregate stats. Returns { total_concepts, total_bindings, concepts_by_type, ... }. */
  getStats() {
    throw new Error('StorageAdapter.getStats() not implemented');
  }

  // --- Diagnostics ---

  /** Health check — returns true if storage is reachable. */
  healthCheck() {
    throw new Error('StorageAdapter.healthCheck() not implemented');
  }

  /** Close the underlying storage connection. */
  close() {
    throw new Error('StorageAdapter.close() not implemented');
  }

  // --- Blockchain operations (Graphheight 411 — stubbed until operational) ---

  /** Record an append-only ruling. Returns { urn, status: "recorded" }. */
  recordRuling(_ruling) {
    throw new Error('StorageAdapter.recordRuling() not implemented');
  }

  /** Check if a token has been spent. Returns { spent: boolean }. */
  checkSpent(_tokenUrn) {
    throw new Error('StorageAdapter.checkSpent() not implemented');
  }

  /** Mark a token as spent. Returns { status: "spent" }. */
  markSpent(_tokenUrn, _executor) {
    throw new Error('StorageAdapter.markSpent() not implemented');
  }

  /** Mint a scoped token with TTL. Returns { token_urn, expires_at }. */
  mintToken(_scope, _ttl) {
    throw new Error('StorageAdapter.mintToken() not implemented');
  }

  /** Mint a governance document version. Returns { version_urn, hash }. */
  mintGovernanceVersion(_document, _hash) {
    throw new Error('StorageAdapter.mintGovernanceVersion() not implemented');
  }

  /** Verify a governance document hash. Returns { valid: boolean }. */
  verifyHash(_versionUrn, _hash) {
    throw new Error('StorageAdapter.verifyHash() not implemented');
  }

  // --- Reference operations (Graphheight 411 — stubbed) ---

  /** Publish a cross-system reference. Returns { reference_urn, status: "published" }. */
  publishReference(_sourceUrn, _targetSystem, _targetId) {
    throw new Error('StorageAdapter.publishReference() not implemented');
  }

  // --- Instance binding (Graphheight 614 — stubbed) ---

  /** Create an instance binding. Returns { ubn, status: "created" }. */
  bindInstance(_fromUrn, _toUrn, _relation, _instanceData) {
    throw new Error('StorageAdapter.bindInstance() not implemented');
  }
}
