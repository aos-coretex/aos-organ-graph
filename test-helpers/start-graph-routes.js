/**
 * Test helper — spin up a minimal in-process Graph HTTP instance for cross-organ
 * integration tests. Bypasses createOrgan (no Spine, no live loop, no LaunchAgent)
 * but uses the SAME route modules and the SAME schema-gate middleware that run
 * in production. This is the seam the schema gate sits on, and the seam each
 * governance organ adapter must satisfy.
 *
 * Usage (from any organ's test):
 *   import { startGraphRoutes } from '<path>/AOS-organ-graph-src/test-helpers/start-graph-routes.js';
 *   const graph = await startGraphRoutes();
 *   // graph.url -> http://127.0.0.1:<random>
 *   // graph.adapter -> the SQLiteStorageAdapter for direct readback if needed
 *   await graph.close();
 *
 * The instance uses an in-memory SQLite DB (`:memory:`) so each test gets
 * a clean slate. No state leaks between test runs.
 */

import express from 'express';
import { initDatabase } from '../server/db/init.js';
import { SQLiteStorageAdapter } from '../server/adapter/sqlite.js';
import { conceptRoutes } from '../server/routes/concepts.js';
import { bindingRoutes } from '../server/routes/bindings.js';
import { queryRoutes } from '../server/routes/query.js';

/**
 * Start an in-process Graph HTTP server bound to a random ephemeral port.
 * Returns { url, adapter, close }.
 */
export async function startGraphRoutes() {
  const db = initDatabase(':memory:');
  const adapter = new SQLiteStorageAdapter(db);

  const app = express();
  app.use(express.json());
  app.use('/concepts', conceptRoutes(adapter));
  app.use('/bindings', bindingRoutes(adapter));
  app.use(queryRoutes(adapter));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        adapter,
        async close() {
          await new Promise((r) => server.close(r));
          adapter.close();
        },
      });
    });
    server.on('error', reject);
  });
}
