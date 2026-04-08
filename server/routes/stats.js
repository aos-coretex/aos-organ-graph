/**
 * Aggregate statistics routes.
 * Factory function: receives adapter + config via dependency injection.
 */

import { Router } from 'express';

export function statsRoutes(adapter, config) {
  const router = Router();

  // GET /stats — aggregate database statistics
  router.get('/', (_req, res) => {
    try {
      const stats = adapter.getStats();
      res.json({
        ...stats,
        machine_id: config.machineId,
        db_path: config.dbPath,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
