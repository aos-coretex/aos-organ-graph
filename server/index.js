/**
 * Graph organ — main entry point.
 *
 * HTTP API server for graph-native data store.
 * MP-3 deliverable: data plane (encapsulated database + HTTP API with adapter pattern).
 */

import express from 'express';
import config from './config.js';
import { initDatabase } from './db/init.js';
import { SQLiteStorageAdapter } from './adapter/sqlite.js';
import { TelemetryAdapter } from './adapter/telemetry.js';
import { loggingMiddleware } from './middleware/logging.js';
import { conceptRoutes } from './routes/concepts.js';
import { bindingRoutes } from './routes/bindings.js';
import { queryRoutes } from './routes/query.js';
import { entityRoutes } from './routes/entities.js';
import { transactionRoutes } from './routes/transactions.js';
import { statsRoutes } from './routes/stats.js';
import { healthRoutes } from './routes/health.js';
import { telemetryRoutes } from './routes/telemetry.js';

// --- Initialize database and adapter ---

const db = initDatabase(config.dbPath);
const sqliteAdapter = new SQLiteStorageAdapter(db);
const adapter = new TelemetryAdapter(sqliteAdapter, db);
const startTime = Date.now();

// --- Express app ---

const app = express();
app.use(express.json());
app.use(loggingMiddleware);

// Caller identification for telemetry (X-Organ-Name header or 'direct')
app.use((req, _res, next) => {
  adapter.setCaller(req.headers['x-organ-name'] || 'direct');
  next();
});

// --- Mount routes ---

app.use('/concepts', conceptRoutes(adapter));
app.use('/bindings', bindingRoutes(adapter));
app.use(queryRoutes(adapter));
app.use('/entities', entityRoutes(adapter));
app.use('/transactions', transactionRoutes(adapter));
app.use('/stats', statsRoutes(adapter, config));
app.use(healthRoutes(adapter, startTime));
app.use('/telemetry', telemetryRoutes(db));

// --- Start ---

const stats = adapter.getStats();
const server = app.listen(config.port, config.binding, () => {
  console.log(
    `Graph organ listening on ${config.binding}:${config.port}, ` +
    `DB: ${config.dbPath}, ` +
    `concepts: ${stats.total_concepts}, bindings: ${stats.total_bindings}`
  );
});

// --- Graceful shutdown ---

function shutdown(signal) {
  console.log(`${signal} received — shutting down Graph organ`);
  server.close(() => {
    adapter.close();
    console.log('Graph organ stopped');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, adapter };
