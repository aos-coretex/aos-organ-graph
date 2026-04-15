/**
 * Graph organ tool_call_request handler — MP-TOOL-1 relay t8r-2.
 *
 * D1: composes over the factory default (universal fallback in
 * `@coretex/organ-boot` installs NOT_IMPLEMENTED; this handler, when registered
 * via `createOrgan({ toolCallHandler })`, fully replaces it).
 *
 * D4: method lookup by name from the per-organ slice of tool-declarations.json.
 * No switch-case. The map is built once at startup; every dispatch is a hash
 * lookup.
 *
 * D5: every declared tool for organ `graph` must resolve to a method; the
 * factory throws at construction time if any decl points to a missing method
 * (fail-fast — detected in unit tests, never at runtime).
 *
 * D7: tool methods never emit Spine OTMs. The handler itself returns a
 * tool_call_response PAYLOAD; the live-loop wraps into the directed OTM
 * envelope (correlation_id + reply_to).
 */

import { readFileSync } from 'node:fs';
import {
  success,
  toolNotFound,
  toolError,
  toolTimeout,
  organDegraded,
} from '@coretex/organ-boot/tool-errors';
import { createToolMethods } from './tool-methods.js';

const DEFAULT_DECLARATIONS_PATH = '/Library/AI/AI-AOS/AOS-organ-dev/AOS-organ-mcp-router/AOS-organ-mcp-router-src/config/tool-declarations.json';
const DEFAULT_TIMEOUT_MS = 25000;
const ORGAN_NAME = 'graph';

/**
 * Derive the organ's top-level health status from its flat `checks` object.
 * Mirrors the logic in `@coretex/organ-boot/health.js::createHealthRouter`
 * so the tool-handler can fail-closed on degraded without coupling to the
 * HTTP-side derivation.
 */
function deriveHealthStatus(checks) {
  if (!checks || typeof checks !== 'object') return 'ok';
  const values = Object.values(checks);
  if (values.some(v => v === 'down' || v === 'error')) return 'down';
  if (values.some(v => v === 'degraded' || v === 'warning')) return 'degraded';
  return 'ok';
}

/**
 * Build a per-organ tool_call_request handler for Graph.
 *
 * @param {import('./adapter/telemetry.js').TelemetryAdapter} adapter
 * @param {object} [options]
 * @param {function} [options.healthCheck] — async () => flat checks object.
 *                  If omitted, ORGAN_DEGRADED is never returned (graceful
 *                  degradation in tests / environments without a health fn).
 * @param {string}   [options.declarationsPath] — override for tests.
 * @param {object}   [options.declarations]     — pre-parsed declarations
 *                                                object (overrides file read;
 *                                                used in unit tests).
 * @returns {function(object): Promise<object>} handler(envelope) → payload
 */
export function createToolHandler(adapter, options = {}) {
  const {
    healthCheck,
    declarationsPath = DEFAULT_DECLARATIONS_PATH,
    declarations: providedDeclarations,
  } = options;

  const declarations = providedDeclarations
    ?? JSON.parse(readFileSync(declarationsPath, 'utf-8'));

  const organEntry = declarations.organs?.[ORGAN_NAME];
  if (!organEntry) {
    throw new Error(`tool-declarations.json has no entry for organ "${ORGAN_NAME}"`);
  }

  const methods = createToolMethods(adapter);

  // Build the dispatch map. Fail-fast at construction time (D5).
  const map = new Map();
  for (const [action, decl] of Object.entries(organEntry.tools)) {
    const toolName = `${ORGAN_NAME}__${action}`;
    const method = methods[decl.method];
    if (typeof method !== 'function') {
      throw new Error(
        `${toolName}: declared method '${decl.method}' is not implemented on Graph tool-methods`
      );
    }
    map.set(toolName, {
      method,
      timeout_ms: decl.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    });
  }

  return async function handleToolCallRequest(envelope) {
    const tool = envelope?.payload?.tool;
    const params = envelope?.payload?.params ?? {};

    // 1. Health gate — fail-closed on degraded
    if (typeof healthCheck === 'function') {
      let status = 'ok';
      try {
        const checks = await healthCheck();
        status = deriveHealthStatus(checks);
      } catch {
        status = 'down';
      }
      if (status !== 'ok') {
        return organDegraded(tool ?? 'unknown', status);
      }
    }

    // 2. Tool lookup
    const entry = typeof tool === 'string' ? map.get(tool) : undefined;
    if (!entry) {
      return toolNotFound(tool ?? 'unknown', ORGAN_NAME);
    }

    // 3. Dispatch with per-tool timeout
    const start = Date.now();
    let timer;
    try {
      const data = await Promise.race([
        Promise.resolve().then(() => entry.method(params)),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => {
            const err = new Error(`tool ${tool} exceeded ${entry.timeout_ms}ms`);
            err._timeout = true;
            reject(err);
          }, entry.timeout_ms);
          if (typeof timer.unref === 'function') timer.unref();
        }),
      ]);
      return success(tool, data);
    } catch (err) {
      const elapsed = Date.now() - start;
      if (err && err._timeout) {
        return toolTimeout(tool, elapsed, entry.timeout_ms);
      }
      const code = (err && err.code) || 'internal_error';
      const message = (err && err.message) || String(err);
      return toolError(tool, code, message);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
