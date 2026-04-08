/**
 * Diagnostic routes — heartbeat + introspection.
 * Factory function: receives adapter via dependency injection.
 */

import { Router } from 'express';

export function healthRoutes(adapter, startTime) {
  const router = Router();

  // GET /health — heartbeat
  router.get('/health', (_req, res) => {
    const dbOk = adapter.healthCheck();
    const uptimeS = Math.floor((Date.now() - startTime) / 1000);
    res.json({
      status: dbOk ? 'ok' : 'degraded',
      uptime_s: uptimeS,
      loop_iteration: 0,
      spine_connected: false,
    });
  });

  // GET /introspect — diagnostics (placeholders until MP-4)
  router.get('/introspect', (_req, res) => {
    const stats = adapter.getStats();
    res.json({
      mailbox_depth: 0,
      last_message_ts: null,
      connected_producers: [],
      connected_consumers: [],
      total_concepts: stats.total_concepts,
      total_bindings: stats.total_bindings,
    });
  });

  return router;
}
