/**
 * Concept CRUD routes — POST, GET, PATCH.
 * Factory function: receives adapter via dependency injection.
 */

import { Router } from 'express';
import { requireJsonBody } from '../middleware/validate.js';
import { validateConceptBody, validateConceptPatchBody } from '../middleware/schema-validate.js';

export function conceptRoutes(adapter) {
  const router = Router();

  // POST /concepts — insert a new concept
  router.post('/', requireJsonBody, validateConceptBody, (req, res) => {
    try {
      // Adapter contract: data is a JSON string. Stringify if object was sent.
      const dataStr = typeof req.body.data === 'string'
        ? req.body.data
        : JSON.stringify(req.body.data);
      const result = adapter.insertConcept(req.body.urn, dataStr);
      res.status(201).json(result);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint') || err.message.includes('PRIMARY KEY')) {
        return res.status(409).json({ error: `Concept already exists: ${req.body.urn}` });
      }
      if (err.message.includes('"type" field')) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // GET /concepts/:urn — retrieve a concept by URN
  router.get('/:urn', (req, res) => {
    const urn = decodeURIComponent(req.params.urn);
    const concept = adapter.getConcept(urn);
    if (!concept) {
      return res.status(404).json({ error: `Concept not found: ${urn}` });
    }
    res.json(concept);
  });

  // PATCH /concepts/:urn — merge new fields into existing concept
  router.patch('/:urn', requireJsonBody, validateConceptPatchBody, (req, res) => {
    const urn = decodeURIComponent(req.params.urn);
    try {
      const dataStr = typeof req.body.data === 'string'
        ? req.body.data
        : JSON.stringify(req.body.data);
      const result = adapter.updateConcept(urn, dataStr);
      if (!result) {
        return res.status(404).json({ error: `Concept not found: ${urn}` });
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
