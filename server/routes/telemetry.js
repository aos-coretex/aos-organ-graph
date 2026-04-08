/**
 * Telemetry query routes — operational instrumentation endpoints.
 *
 * Factory function: receives db via dependency injection.
 * Queries the adapter_telemetry table directly (not through the adapter —
 * telemetry is operational, not graph data).
 */

import { Router } from 'express';

/**
 * Build a filtered summary query dynamically.
 * Avoids SQLite parameter binding edge cases with IS NULL patterns.
 */
function buildSummaryQuery(since, operation, caller) {
  const conditions = [];
  const params = [];

  if (since) {
    conditions.push('timestamp >= ?');
    params.push(since);
  }
  if (operation) {
    conditions.push('operation = ?');
    params.push(operation);
  }
  if (caller) {
    conditions.push('caller = ?');
    params.push(caller);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const summarySQL = `
    SELECT
      operation,
      COUNT(*) AS call_count,
      AVG(duration_ms) AS avg_duration_ms,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count,
      MIN(timestamp) AS period_start,
      MAX(timestamp) AS period_end
    FROM adapter_telemetry
    ${where}
    GROUP BY operation
    ORDER BY call_count DESC
  `;

  const totalSQL = `SELECT COUNT(*) AS total FROM adapter_telemetry ${where}`;

  return { summarySQL, totalSQL, params };
}

export function telemetryRoutes(db) {
  const router = Router();

  // --- Prepared statements (for non-filtered queries) ---

  const callersForOp = db.prepare(
    'SELECT DISTINCT caller FROM adapter_telemetry WHERE operation = ?'
  );

  const recentEntries = db.prepare(`
    SELECT id, operation, caller, args_shape, duration_ms, status, error_message, timestamp
    FROM adapter_telemetry
    ORDER BY id DESC
    LIMIT ?
  `);

  // GET /telemetry/summary — aggregate telemetry summary
  router.get('/summary', (req, res) => {
    try {
      const since = req.query.since || null;
      const operation = req.query.operation || null;
      const caller = req.query.caller || null;

      const { summarySQL, totalSQL, params } = buildSummaryQuery(since, operation, caller);

      const rows = db.prepare(summarySQL).all(...params);
      const total = db.prepare(totalSQL).get(...params).total;

      // Attach distinct callers to each operation
      const operations = rows.map(row => ({
        operation: row.operation,
        call_count: row.call_count,
        avg_duration_ms: Math.round(row.avg_duration_ms * 1000) / 1000,
        error_count: row.error_count,
        callers: callersForOp.all(row.operation).map(r => r.caller),
      }));

      const periodStart = rows.length > 0
        ? rows.reduce((min, r) => r.period_start < min ? r.period_start : min, rows[0].period_start)
        : null;
      const periodEnd = rows.length > 0
        ? rows.reduce((max, r) => r.period_end > max ? r.period_end : max, rows[0].period_end)
        : null;

      res.json({
        operations,
        total_calls: total,
        period_start: periodStart,
        period_end: periodEnd,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /telemetry/recent — recent telemetry entries for debugging
  router.get('/recent', (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const entries = recentEntries.all(limit);
      res.json({ entries, count: entries.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
