/**
 * Graph organ — main entry point.
 *
 * MP-3: HTTP API data plane (encapsulated database + adapter pattern).
 * MP-4: organ-boot factory + Spine dual-interface (HTTP + OTM).
 */

import { resolve } from 'node:path';
import { createOrgan } from '@coretex/organ-boot';
import config from './config.js';
import { initDatabase } from './db/init.js';
import { SQLiteStorageAdapter } from './adapter/sqlite.js';
import { TelemetryAdapter } from './adapter/telemetry.js';
import { conceptRoutes } from './routes/concepts.js';
import { bindingRoutes } from './routes/bindings.js';
import { queryRoutes } from './routes/query.js';
import { entityRoutes } from './routes/entities.js';
import { transactionRoutes } from './routes/transactions.js';
import { statsRoutes } from './routes/stats.js';
import { telemetryRoutes } from './routes/telemetry.js';
import { handleDirectedMessage } from './handlers/messages.js';

function log(event, data = {}) {
  const entry = { timestamp: new Date().toISOString(), event, ...data };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

// --- Initialize database and adapter (fail fast, before organ boot) ---

const dbPath = resolve(config.dbPath);
const db = initDatabase(dbPath);
const sqliteAdapter = new SQLiteStorageAdapter(db);
const adapter = new TelemetryAdapter(sqliteAdapter, db);

const stats = adapter.getStats();
log('db_initialized', {
  path: dbPath,
  concepts: stats.total_concepts,
  bindings: stats.total_bindings,
});

// --- Boot organ ---

const organ = await createOrgan({
  name: 'Graph',
  port: config.port,
  binding: config.binding,
  spineUrl: config.spineUrl,

  routes: (app) => {
    // Caller identification for telemetry (X-Organ-Name header or 'direct')
    app.use((req, _res, next) => {
      adapter.setCaller(req.headers['x-organ-name'] || 'direct');
      next();
    });

    // MP-3 HTTP routes (unchanged)
    app.use('/concepts', conceptRoutes(adapter));
    app.use('/bindings', bindingRoutes(adapter));
    app.use(queryRoutes(adapter));
    app.use('/entities', entityRoutes(adapter));
    app.use('/transactions', transactionRoutes(adapter));
    app.use('/stats', statsRoutes(adapter, config));
    app.use('/telemetry', telemetryRoutes(db));
    // Note: /health and /introspect now provided by organ-boot
  },

  onMessage: (envelope) => handleDirectedMessage(envelope, adapter),

  dependencies: [],

  healthCheck: async () => {
    const dbOk = adapter.healthCheck();
    return {
      db_connected: dbOk ? 'ok' : 'down',
    };
  },

  introspectCheck: async () => {
    const dbStats = adapter.getStats();
    return {
      total_concepts: dbStats.total_concepts,
      total_bindings: dbStats.total_bindings,
      concepts_by_type: dbStats.concepts_by_type,
      schema_version: dbStats.schema_version,
      db_path: dbPath,
    };
  },

  onShutdown: async () => {
    adapter.close();
  },
});

export { organ };
