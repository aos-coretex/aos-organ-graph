/**
 * Read-only query and keyword search routes.
 * Factory function: receives adapter via dependency injection.
 */

import { Router } from 'express';
import { requireJsonBody, requireFields } from '../middleware/validate.js';

export function queryRoutes(adapter) {
  const router = Router();

  // POST /query — execute a read-only SQL query
  router.post('/query', requireJsonBody, requireFields('sql'), (req, res) => {
    try {
      const result = adapter.query(req.body.sql, req.body.params || []);
      res.json(result);
    } catch (err) {
      if (err.message === 'Only SELECT queries are allowed') {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /search — keyword search across concept data
  router.post('/search', requireJsonBody, requireFields('keyword'), (req, res) => {
    try {
      const { keyword, concept_type, limit } = req.body;
      const result = adapter.search(keyword, concept_type || null, limit || 20);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
