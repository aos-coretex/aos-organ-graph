/**
 * TelemetryAdapter — decorator that wraps any StorageAdapter and logs every
 * call to the adapter_telemetry table.
 *
 * Captures: operation name, caller (organ), argument shapes, duration, status.
 * Telemetry is operational instrumentation — NOT a graph concept.
 *
 * MP-3 Relay 5 deliverable.
 */

import { StorageAdapter } from './interface.js';

/**
 * Parameter name mappings for each adapter method.
 * Used by args_shape computation to label arguments.
 */
const PARAM_NAMES = {
  insertConcept:        ['urn', 'data'],
  getConcept:           ['urn'],
  updateConcept:        ['urn', 'mergeData'],
  insertBinding:        ['ubn', 'data'],
  getBinding:           ['ubn'],
  query:                ['sql', 'params'],
  search:               ['keyword', 'type', 'limit'],
  getEntities:          ['tier', 'status'],
  insertTransaction:    ['fields'],
  getStats:             [],
  healthCheck:          [],
  // Stubs (Graphheight 411 / 614)
  recordRuling:         ['ruling'],
  checkSpent:           ['tokenUrn'],
  markSpent:            ['tokenUrn', 'executor'],
  mintToken:            ['scope', 'ttl'],
  mintGovernanceVersion: ['document', 'hash'],
  verifyHash:           ['versionUrn', 'hash'],
  publishReference:     ['sourceUrn', 'targetSystem', 'targetId'],
  bindInstance:         ['fromUrn', 'toUrn', 'relation', 'instanceData'],
};

/**
 * Describe a single value's type shape (types, not values).
 *
 * Strings that parse as JSON objects get expanded to reveal field names.
 * This enables access-pattern analysis without leaking sensitive data.
 */
export function describeValue(val) {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'number') return 'number';
  if (Array.isArray(val)) return `array(${val.length})`;
  if (typeof val === 'object') return `object{${Object.keys(val).join(',')}}`;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return `object{${Object.keys(parsed).join(',')}}`;
      }
      if (Array.isArray(parsed)) {
        return `array(${parsed.length})`;
      }
    } catch {
      // Not JSON — treat as plain string
    }
    return `string(${val.length})`;
  }
  return typeof val;
}

/**
 * Compute a compact args_shape string for an adapter call.
 *
 * @param {string} operation - Adapter method name
 * @param {any[]} args - Arguments passed to the method
 * @returns {string} Compact shape descriptor
 */
export function computeArgsShape(operation, args) {
  const names = PARAM_NAMES[operation] || [];
  if (names.length === 0 && args.length === 0) return '';
  return names.map((name, i) => `${name}:${describeValue(args[i])}`).join(',');
}

export class TelemetryAdapter extends StorageAdapter {

  /**
   * @param {StorageAdapter} inner - The adapter to wrap
   * @param {import('better-sqlite3').Database} db - Database for telemetry writes
   */
  constructor(inner, db) {
    super();
    this._inner = inner;
    this._db = db;
    this._caller = 'direct';

    this._insertTelemetry = db.prepare(`
      INSERT INTO adapter_telemetry
        (operation, caller, args_shape, duration_ms, status, error_message, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
  }

  /**
   * Set the caller for the current request context.
   * Called by middleware before route handlers execute.
   *
   * @param {string} caller - Organ name or 'direct'
   */
  setCaller(caller) {
    this._caller = caller || 'direct';
  }

  /**
   * Wrap an adapter call with telemetry recording.
   *
   * @param {string} operation - Method name
   * @param {any[]} args - Method arguments
   * @param {Function} fn - The actual adapter call
   * @returns {any} The adapter result
   */
  _wrapCall(operation, args, fn) {
    const argsShape = computeArgsShape(operation, args);
    const start = performance.now();
    let result;
    let status = 'ok';
    let errorMessage = null;

    try {
      result = fn();

      // Detect stub responses (501 Not Implemented)
      if (result && result.status === 501) {
        status = 'not_implemented';
      }
    } catch (err) {
      status = 'error';
      errorMessage = err.message;
      const durationMs = performance.now() - start;
      this._recordTelemetry(operation, argsShape, durationMs, status, errorMessage);
      throw err;
    }

    const durationMs = performance.now() - start;
    this._recordTelemetry(operation, argsShape, durationMs, status, errorMessage);
    return result;
  }

  /**
   * Write a telemetry row. Silently swallows write errors to prevent
   * telemetry failures from breaking adapter operations.
   */
  _recordTelemetry(operation, argsShape, durationMs, status, errorMessage) {
    try {
      this._insertTelemetry.run(
        operation,
        this._caller,
        argsShape || null,
        durationMs,
        status,
        errorMessage
      );
    } catch {
      // Telemetry must never break adapter operations
    }
  }

  // ================================================================
  // Concept operations
  // ================================================================

  insertConcept(urn, data) {
    return this._wrapCall('insertConcept', [urn, data],
      () => this._inner.insertConcept(urn, data));
  }

  getConcept(urn) {
    return this._wrapCall('getConcept', [urn],
      () => this._inner.getConcept(urn));
  }

  updateConcept(urn, mergeData) {
    return this._wrapCall('updateConcept', [urn, mergeData],
      () => this._inner.updateConcept(urn, mergeData));
  }

  // ================================================================
  // Binding operations
  // ================================================================

  insertBinding(ubn, data) {
    return this._wrapCall('insertBinding', [ubn, data],
      () => this._inner.insertBinding(ubn, data));
  }

  getBinding(ubn) {
    return this._wrapCall('getBinding', [ubn],
      () => this._inner.getBinding(ubn));
  }

  // ================================================================
  // Query operations
  // ================================================================

  query(sql, params) {
    return this._wrapCall('query', [sql, params],
      () => this._inner.query(sql, params));
  }

  search(keyword, type, limit) {
    return this._wrapCall('search', [keyword, type, limit],
      () => this._inner.search(keyword, type, limit));
  }

  getEntities(tier, status) {
    return this._wrapCall('getEntities', [tier, status],
      () => this._inner.getEntities(tier, status));
  }

  // ================================================================
  // Transaction operations
  // ================================================================

  insertTransaction(fields) {
    return this._wrapCall('insertTransaction', [fields],
      () => this._inner.insertTransaction(fields));
  }

  // ================================================================
  // Statistics & Diagnostics
  // ================================================================

  getStats() {
    return this._wrapCall('getStats', [],
      () => this._inner.getStats());
  }

  healthCheck() {
    return this._wrapCall('healthCheck', [],
      () => this._inner.healthCheck());
  }

  close() {
    // close() is not instrumented — it's a lifecycle operation
    this._inner.close();
  }

  // ================================================================
  // Blockchain stubs (Graphheight 411)
  // ================================================================

  recordRuling(ruling) {
    return this._wrapCall('recordRuling', [ruling],
      () => this._inner.recordRuling(ruling));
  }

  checkSpent(tokenUrn) {
    return this._wrapCall('checkSpent', [tokenUrn],
      () => this._inner.checkSpent(tokenUrn));
  }

  markSpent(tokenUrn, executor) {
    return this._wrapCall('markSpent', [tokenUrn, executor],
      () => this._inner.markSpent(tokenUrn, executor));
  }

  mintToken(scope, ttl) {
    return this._wrapCall('mintToken', [scope, ttl],
      () => this._inner.mintToken(scope, ttl));
  }

  mintGovernanceVersion(document, hash) {
    return this._wrapCall('mintGovernanceVersion', [document, hash],
      () => this._inner.mintGovernanceVersion(document, hash));
  }

  verifyHash(versionUrn, hash) {
    return this._wrapCall('verifyHash', [versionUrn, hash],
      () => this._inner.verifyHash(versionUrn, hash));
  }

  // ================================================================
  // Reference stub (Graphheight 411)
  // ================================================================

  publishReference(sourceUrn, targetSystem, targetId) {
    return this._wrapCall('publishReference', [sourceUrn, targetSystem, targetId],
      () => this._inner.publishReference(sourceUrn, targetSystem, targetId));
  }

  // ================================================================
  // Instance binding stub (Graphheight 614)
  // ================================================================

  bindInstance(fromUrn, toUrn, relation, instanceData) {
    return this._wrapCall('bindInstance', [fromUrn, toUrn, relation, instanceData],
      () => this._inner.bindInstance(fromUrn, toUrn, relation, instanceData));
  }
}
