#!/usr/bin/env node

/**
 * Register all 11 encapsulation CV tests in Vigil via HTTP API.
 *
 * Usage: node scripts/register-cv-tests.js
 *
 * Requires Vigil running on port 4015.
 */

import http from 'node:http';

const VIGIL_BASE = 'http://127.0.0.1:4015';

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
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

const TESTS = [
  {
    id: 'encap-vigil-db-isolated',
    name: 'Vigil database isolation',
    tier: 'unit',
    group: 'encapsulation',
    schedule: 'daily',
    deterministic: [{ event: 'organ_startup' }],
    timeout_ms: 5000,
    dependencies: [],
  },
  {
    id: 'encap-glia-db-isolated',
    name: 'Glia database isolation',
    tier: 'unit',
    group: 'encapsulation',
    schedule: 'daily',
    deterministic: [{ event: 'organ_startup' }],
    timeout_ms: 5000,
    dependencies: [],
  },
  {
    id: 'encap-graph-db-clean',
    name: 'Graph database cleanliness',
    tier: 'unit',
    group: 'encapsulation',
    schedule: 'daily',
    deterministic: [{ event: 'organ_startup' }],
    timeout_ms: 5000,
    dependencies: [],
  },
  {
    id: 'encap-no-cross-db-access',
    name: 'No cross-organ DB access',
    tier: 'unit',
    group: 'encapsulation',
    schedule: 'daily',
    deterministic: [{ event: 'organ_startup' }],
    timeout_ms: 10000,
    dependencies: [],
  },
  {
    id: 'encap-safevault-targets',
    name: 'SafeVault backup targets',
    tier: 'unit',
    group: 'encapsulation',
    schedule: 'daily',
    deterministic: [{ event: 'organ_startup' }],
    timeout_ms: 5000,
    dependencies: [],
  },
  {
    id: 'encap-graph-api-concepts',
    name: 'Graph concept CRUD',
    tier: 'integration',
    group: 'encapsulation',
    schedule: 'daily',
    deterministic: [{ event: 'organ_startup' }],
    timeout_ms: 10000,
    dependencies: ['encap-graph-db-clean'],
  },
  {
    id: 'encap-graph-api-bindings',
    name: 'Graph binding CRUD',
    tier: 'integration',
    group: 'encapsulation',
    schedule: 'daily',
    deterministic: [{ event: 'organ_startup' }],
    timeout_ms: 10000,
    dependencies: ['encap-graph-db-clean'],
  },
  {
    id: 'encap-graph-api-query-safety',
    name: 'Graph query safety',
    tier: 'integration',
    group: 'encapsulation',
    schedule: 'daily',
    deterministic: [{ event: 'organ_startup' }],
    timeout_ms: 10000,
    dependencies: ['encap-graph-db-clean'],
  },
  {
    id: 'encap-vigil-api-results',
    name: 'Vigil result storage',
    tier: 'integration',
    group: 'encapsulation',
    schedule: 'daily',
    deterministic: [{ event: 'organ_startup' }],
    timeout_ms: 10000,
    dependencies: ['encap-vigil-db-isolated'],
  },
  {
    id: 'encap-glia-api-tickets',
    name: 'Glia ticket lifecycle',
    tier: 'integration',
    group: 'encapsulation',
    schedule: 'daily',
    deterministic: [{ event: 'organ_startup' }],
    timeout_ms: 15000,
    dependencies: ['encap-glia-db-isolated'],
  },
  {
    id: 'encap-graph-telemetry-logging',
    name: 'Graph telemetry logging',
    tier: 'integration',
    group: 'encapsulation',
    schedule: 'daily',
    deterministic: [{ event: 'organ_startup' }],
    timeout_ms: 10000,
    dependencies: ['encap-graph-db-clean'],
  },
];

async function main() {
  console.log('Registering encapsulation CV tests in Vigil...\n');

  let success = 0;
  let failed = 0;

  for (const test of TESTS) {
    try {
      const res = await httpPost(`${VIGIL_BASE}/tests/register`, test);
      if (res.status === 201) {
        console.log(`  [ok]  ${test.id} (${test.tier})`);
        success++;
      } else {
        console.log(`  [FAIL] ${test.id}: ${res.status} — ${JSON.stringify(res.body)}`);
        failed++;
      }
    } catch (err) {
      console.log(`  [FAIL] ${test.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nRegistered: ${success}/${TESTS.length}`);
  if (failed > 0) {
    console.log(`Failed: ${failed}`);
    process.exit(1);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
