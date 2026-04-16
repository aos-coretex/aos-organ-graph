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
  // c2a-http-route-03: return the MP-TOOL-1 R7 tool_call_response payload shape
  // so MCP-Router's _callHttp (which wraps the response body as `result`) yields
  // {result:{status:"SUCCESS",data,tool,elapsed_ms,meta}} — the conformance-scan
  // classifier reads result.status and expects a value from the closed enum.
  // Pre-fix the adapter-native shape was {urn,timestamp,binding,status:"created"}
  // which collided with the classifier's result.status probe.
  router.post('/', requireJsonBody, requireFields(...REQUIRED_FIELDS), (req, res) => {
    const startTime = Date.now();
    try {
      const result = adapter.insertTransaction(req.body);
      res.status(201).json({
        status: 'SUCCESS',
        data: {
          urn: result.urn,
          timestamp: result.timestamp,
          binding: result.binding,
        },
        tool: 'graph__insert_transaction',
        elapsed_ms: Date.now() - startTime,
        meta: { transport: 'http', organ: 'graph' },
      });
    } catch (err) {
      if (err.message.includes('not found in v_entities')) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
