/**
 * Entity listing routes — from v_entities view.
 * Factory function: receives adapter via dependency injection.
 */

import { Router } from 'express';

export function entityRoutes(adapter) {
  const router = Router();

  // GET /entities — list entities, optional tier/status filter
  router.get('/', (req, res) => {
    try {
      const tier = req.query.tier || null;
      const status = req.query.status || 'active';
      const result = adapter.getEntities(tier, status);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
