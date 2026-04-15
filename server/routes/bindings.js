/**
 * Binding CRUD routes — POST, GET.
 * Factory function: receives adapter via dependency injection.
 */

import { Router } from 'express';
import { requireJsonBody } from '../middleware/validate.js';
import { validateBindingBody } from '../middleware/schema-validate.js';

export function bindingRoutes(adapter) {
  const router = Router();

  // POST /bindings — insert a new binding
  router.post('/', requireJsonBody, validateBindingBody, (req, res) => {
    try {
      const dataStr = typeof req.body.data === 'string'
        ? req.body.data
        : JSON.stringify(req.body.data);
      const result = adapter.insertBinding(req.body.ubn, dataStr);
      res.status(201).json(result);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint') || err.message.includes('PRIMARY KEY')) {
        return res.status(409).json({ error: `Binding already exists: ${req.body.ubn}` });
      }
      if (err.message.includes('"from_urn"') || err.message.includes('"to_urn"') || err.message.includes('"relation"')) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // GET /bindings/:ubn — retrieve a binding by UBN
  router.get('/:ubn', (req, res) => {
    const ubn = decodeURIComponent(req.params.ubn);
    const binding = adapter.getBinding(ubn);
    if (!binding) {
      return res.status(404).json({ error: `Binding not found: ${ubn}` });
    }
    res.json(binding);
  });

  return router;
}
