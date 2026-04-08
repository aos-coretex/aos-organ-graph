/**
 * Spine directed message handler for Graph.
 *
 * Dual-interface: every adapter operation available via HTTP is also available
 * via Spine directed OTMs. Both interfaces call the same adapter functions.
 *
 * MP-4 deliverable: Spine connectivity for the data plane.
 */

function log(event, data = {}) {
  const entry = { timestamp: new Date().toISOString(), event, ...data };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

/**
 * Handle a directed OTM message.
 * @param {object} envelope - Spine message { event_type, payload, from, id }
 * @param {import('../adapter/telemetry.js').TelemetryAdapter} adapter
 * @returns {object|null} - response payload or null
 */
export function handleDirectedMessage(envelope, adapter) {
  const { event_type, payload } = envelope;

  // Set caller for telemetry (use the sending organ name)
  adapter.setCaller(envelope.from || 'spine');

  try {
    switch (event_type) {
      case 'insert_concept':
        return handleInsertConcept(payload, adapter);

      case 'insert_binding':
        return handleInsertBinding(payload, adapter);

      case 'query':
        return handleQuery(payload, adapter);

      case 'query_concepts':
        return handleQueryConcepts(payload, adapter);

      case 'query_bindings':
        return handleQueryBindings(payload, adapter);

      case 'search':
        return handleSearch(payload, adapter);

      case 'delete_concept':
        return handleDeleteConcept(payload, adapter);

      case 'delete_binding':
        return handleDeleteBinding(payload, adapter);

      default:
        log('unknown_message_type', { event_type });
        return null;
    }
  } catch (err) {
    log('message_handler_error', { event_type, error: err.message });
    return { event_type: `${event_type}_error`, error: err.message };
  }
}

function handleInsertConcept(payload, adapter) {
  const { urn, data } = payload;
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
  const result = adapter.insertConcept(urn, dataStr);
  return { event_type: 'insert_concept_result', ...result };
}

function handleInsertBinding(payload, adapter) {
  const { ubn, data } = payload;
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
  const result = adapter.insertBinding(ubn, dataStr);
  return { event_type: 'insert_binding_result', ...result };
}

function handleQuery(payload, adapter) {
  const { sql, params } = payload;
  const result = adapter.query(sql, params);
  return { event_type: 'query_result', ...result };
}

function handleQueryConcepts(payload, adapter) {
  // Single concept by URN
  if (payload.urn) {
    const concept = adapter.getConcept(payload.urn);
    return { event_type: 'query_concepts_result', concept };
  }

  // Filtered query
  let sql = 'SELECT urn, data, created_at FROM concepts WHERE 1=1';
  const params = [];

  if (payload.type) {
    sql += " AND json_extract(data, '$.type') = ?";
    params.push(payload.type);
  }
  if (payload.entity) {
    sql += " AND json_extract(data, '$.entity') = ?";
    params.push(payload.entity);
  }
  sql += ' LIMIT ?';
  params.push(payload.limit || 50);

  const { rows } = adapter.query(sql, params);
  const concepts = rows.map(r => ({
    urn: r.urn,
    data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
    created_at: r.created_at,
  }));
  return { event_type: 'query_concepts_result', concepts, count: concepts.length };
}

function handleQueryBindings(payload, adapter) {
  // Single binding by UBN
  if (payload.ubn) {
    const binding = adapter.getBinding(payload.ubn);
    return { event_type: 'query_bindings_result', binding };
  }

  // Filtered query
  let sql = 'SELECT ubn, data, created_at FROM class_bindings WHERE 1=1';
  const params = [];

  if (payload.relation) {
    sql += " AND json_extract(data, '$.relation') = ?";
    params.push(payload.relation);
  }
  if (payload.from_urn) {
    sql += " AND json_extract(data, '$.from_urn') = ?";
    params.push(payload.from_urn);
  }
  if (payload.to_urn) {
    sql += " AND json_extract(data, '$.to_urn') = ?";
    params.push(payload.to_urn);
  }
  sql += ' LIMIT ?';
  params.push(payload.limit || 50);

  const { rows } = adapter.query(sql, params);
  const bindings = rows.map(r => ({
    ubn: r.ubn,
    data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
    created_at: r.created_at,
  }));
  return { event_type: 'query_bindings_result', bindings, count: bindings.length };
}

function handleSearch(payload, adapter) {
  const { keyword, type, limit } = payload;
  const result = adapter.search(keyword, type, limit);
  return { event_type: 'search_result', ...result };
}

function handleDeleteConcept(payload, adapter) {
  const result = adapter.deleteConcept(payload.urn);
  if (result) {
    return { event_type: 'delete_concept_result', ...result };
  }
  return { event_type: 'delete_concept_result', urn: payload.urn, status: 'not_found' };
}

function handleDeleteBinding(payload, adapter) {
  const result = adapter.deleteBinding(payload.ubn);
  if (result) {
    return { event_type: 'delete_binding_result', ...result };
  }
  return { event_type: 'delete_binding_result', ubn: payload.ubn, status: 'not_found' };
}
