/**
 * Document transaction recording routes.
 * Factory function: receives adapter via dependency injection.
 */

import { Router } from 'express';
import { requireJsonBody, requireFields } from '../middleware/validate.js';

const REQUIRED_FIELDS = [
  'operation', 'entity', 'context',
  'initial_path', 'initial_name',
  'current_path', 'current_name',
  'operator', 'state',
];

export function transactionRoutes(adapter) {
  const router = Router();

  // POST /transactions — record a document filing transaction
  router.post('/', requireJsonBody, requireFields(...REQUIRED_FIELDS), (req, res) => {
    try {
      const result = adapter.insertTransaction(req.body);
      res.status(201).json(result);
    } catch (err) {
      if (err.message.includes('not found in v_entities')) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
