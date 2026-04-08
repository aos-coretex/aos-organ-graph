#!/usr/bin/env node

/**
 * Run all 11 encapsulation CV tests and report results.
 *
 * Usage: node scripts/run-encap-tests.js [--unit-only] [--integration-only] [--json]
 *
 * - Runs all test functions from cv-tests-encapsulation.js
 * - Reports pass/fail/blocked for each
 * - Stores results in Vigil via POST /tests/:id/result (if Vigil is running)
 * - Exit code: 0 if all pass, 1 if any fail
 * - Output: structured JSON matching CV test output patterns
 */

import http from 'node:http';
import { TEST_DEFINITIONS } from './cv-tests-encapsulation.js';

const VIGIL_BASE = 'http://127.0.0.1:4015';

// --- Args ---

const args = process.argv.slice(2);
const unitOnly = args.includes('--unit-only');
const integrationOnly = args.includes('--integration-only');
const jsonOutput = args.includes('--json');

// --- HTTP helper ---

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

// --- Store result in Vigil ---

async function storeInVigil(testId, result) {
  try {
    await httpPost(`${VIGIL_BASE}/tests/${testId}/result`, {
      status: result.status,
      detail: result.detail,
      duration_ms: result.duration_ms,
      triggered_by: 'manual',
    });
  } catch {
    // Vigil may not be running — that's ok for unit tests
  }
}

// --- Main ---

async function main() {
  const now = new Date().toISOString();
  const results = [];
  let passCount = 0;
  let failCount = 0;
  let blockedCount = 0;

  // Filter tests by tier
  let tests = TEST_DEFINITIONS;
  if (unitOnly) tests = tests.filter((t) => t.tier === 'unit');
  if (integrationOnly) tests = tests.filter((t) => t.tier === 'integration');

  if (!jsonOutput) {
    console.log(`\nEncapsulation CV Tests — ${now}\n${'='.repeat(60)}\n`);
  }

  for (const test of tests) {
    try {
      const result = await test.fn();

      results.push({
        id: test.id,
        name: test.name,
        tier: test.tier,
        status: result.status,
        detail: result.detail,
        duration_ms: result.duration_ms,
        timestamp: now,
      });

      if (result.status === 'pass') passCount++;
      else if (result.status === 'blocked') blockedCount++;
      else failCount++;

      if (!jsonOutput) {
        const statusLabel = result.status === 'pass' ? 'PASS' : result.status === 'blocked' ? 'BLOCKED' : 'FAIL';
        const pad = ' '.repeat(Math.max(0, 35 - test.id.length));
        console.log(
          `[${now}] ${test.id}${pad} ${statusLabel}  (${result.duration_ms}ms)  [manual]` +
          (result.status !== 'pass' ? `  ${result.detail}` : '')
        );
      }

      // Store in Vigil (non-blocking)
      storeInVigil(test.id, result);
    } catch (err) {
      const result = { status: 'fail', detail: `Exception: ${err.message}`, duration_ms: 0 };
      results.push({
        id: test.id,
        name: test.name,
        tier: test.tier,
        ...result,
        timestamp: now,
      });
      failCount++;

      if (!jsonOutput) {
        const pad = ' '.repeat(Math.max(0, 35 - test.id.length));
        console.log(`[${now}] ${test.id}${pad} FAIL  (0ms)  [manual]  ${result.detail}`);
      }

      storeInVigil(test.id, result);
    }
  }

  // Summary
  const summary = {
    pass: passCount,
    fail: failCount,
    blocked: blockedCount,
    total: results.length,
    group: 'encapsulation',
    timestamp: now,
  };

  if (jsonOutput) {
    console.log(JSON.stringify({ results, summary }, null, 2));
  } else {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PASS: ${passCount}`);
    console.log(`FAIL: ${failCount}`);
    console.log(`BLOCKED: ${blockedCount}`);
    console.log(`Total: ${results.length}`);
  }

  // Give Vigil stores a moment to complete
  await new Promise((r) => setTimeout(r, 500));

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
