/**
 * Graph organ tool methods — MP-TOOL-1 relay t8r-2.
 *
 * Thin wrappers that map declared MCP tool params to existing
 * `TelemetryAdapter` operations. Each method:
 *   - accepts a single `params` object (fields per the tool's MCP input schema)
 *   - returns the `data` field of a SUCCESS response (serializable object)
 *   - throws on invalid params or adapter error; the tool-handler catches
 *     and wraps into TOOL_ERROR
 *
 * D7: methods MUST NOT emit Spine OTMs. All data operations go through the
 * adapter (SQLite today; Graphheight when operational — transparent swap).
 *
 * Envelope-vs-payload rule: methods return PAYLOAD (the `data` field contents).
 * The tool-handler wraps into the tool_call_response OTM envelope.
 */

/**
 * Build the Graph method map bound to a TelemetryAdapter.
 * @param {import('./adapter/telemetry.js').TelemetryAdapter} adapter
 * @returns {Object.<string, function(object): Promise<object>>}
 */
export function createToolMethods(adapter) {
  return {
    getStats: async () => {
      return adapter.getStats();
    },

    query: async (params) => {
      if (!params || typeof params.sql !== 'string') {
        const err = new Error('graph__query requires `sql` string');
        err.code = 'EBADPARAM';
        throw err;
      }
      return adapter.query(params.sql, params.params ?? []);
    },

    insertConcept: async (params) => {
      if (!params || typeof params.urn !== 'string' || typeof params.data !== 'string') {
        const err = new Error('graph__insert_concept requires `urn` string and `data` JSON string');
        err.code = 'EBADPARAM';
        throw err;
      }
      return adapter.insertConcept(params.urn, params.data);
    },

    updateConcept: async (params) => {
      if (!params || typeof params.urn !== 'string' || typeof params.data !== 'string') {
        const err = new Error('graph__update_concept requires `urn` string and `data` JSON string');
        err.code = 'EBADPARAM';
        throw err;
      }
      const result = adapter.updateConcept(params.urn, params.data);
      if (result === null) {
        const err = new Error(`Concept not found: ${params.urn}`);
        err.code = 'ENOTFOUND';
        throw err;
      }
      return result;
    },

    insertBinding: async (params) => {
      if (!params || typeof params.ubn !== 'string' || typeof params.data !== 'string') {
        const err = new Error('graph__insert_binding requires `ubn` string and `data` JSON string');
        err.code = 'EBADPARAM';
        throw err;
      }
      return adapter.insertBinding(params.ubn, params.data);
    },

    insertTransaction: async (params) => {
      if (!params || !params.operation || !params.entity || !params.context
          || !params.current_path || !params.current_name) {
        const err = new Error(
          'graph__insert_transaction requires operation, entity, context, current_path, current_name'
        );
        err.code = 'EBADPARAM';
        throw err;
      }
      return adapter.insertTransaction(params);
    },

    queryEntities: async (params = {}) => {
      return adapter.getEntities(params.tier ?? null, params.status ?? 'active');
    },

    search: async (params) => {
      if (!params || typeof params.keyword !== 'string') {
        const err = new Error('graph__search requires `keyword` string');
        err.code = 'EBADPARAM';
        throw err;
      }
      return adapter.search(params.keyword, params.concept_type ?? null, params.limit ?? 20);
    },
  };
}
