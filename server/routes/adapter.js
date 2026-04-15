/**
 * Graphheight adapter HTTP surface — 501 stubs for MP-3 blockchain operations.
 *
 * Bridge between MP-3 relay-e3d-5's adapter-method contract (internal stubs on
 * SQLiteStorageAdapter returning { error, status: 501 }) and consumer organs
 * that expect HTTP POST /adapter/<op> → HTTP 501. Cerberus's graph-adapter.js
 * gates its concept-fallback on HTTP status 501 exactly; HTTP 404 collapses to
 * GRAPHHEIGHT_UNREACHABLE and hides the "route exists, intentionally
 * unimplemented" signal.
 *
 * All routes delegate to the adapter (wrapped by TelemetryAdapter) so stub
 * calls surface in `adapter_telemetry` as status=not_implemented — identical
 * to direct-method-call stub calls.
 *
 * Restored by repair-graph-02 (2026-04-14) per REPAIR-RFI-1 reply
 * (Q1=A / Q2=B / Q3=delegate). Six routes cover the full MP-3 blockchain stub
 * set; verifySignature is intentionally excluded (Cerberus-local per
 * decision #29, not an adapter contract).
 */

import { Router } from 'express';

function respond501(adapterCall, res) {
  const result = adapterCall();
  res.status(501).json({ error: result.error });
}

export function adapterRoutes(adapter) {
  const router = Router();

  router.post('/recordRuling', (req, res) => {
    respond501(() => adapter.recordRuling(req.body?.ruling), res);
  });

  router.post('/checkSpent', (req, res) => {
    respond501(() => adapter.checkSpent(req.body?.token_urn), res);
  });

  router.post('/markSpent', (req, res) => {
    respond501(() => adapter.markSpent(req.body?.token_urn, req.body?.executor), res);
  });

  router.post('/mintToken', (req, res) => {
    respond501(() => adapter.mintToken(req.body?.scope, req.body?.ttl), res);
  });

  router.post('/mintGovernanceVersion', (req, res) => {
    respond501(() => adapter.mintGovernanceVersion(req.body?.document, req.body?.hash), res);
  });

  router.post('/verifyHash', (req, res) => {
    respond501(() => adapter.verifyHash(req.body?.version_urn, req.body?.hash), res);
  });

  return router;
}

export const ADAPTER_STUB_ROUTES = Object.freeze([
  'recordRuling',
  'checkSpent',
  'markSpent',
  'mintToken',
  'mintGovernanceVersion',
  'verifyHash',
]);
