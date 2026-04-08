/**
 * Graph organ configuration.
 *
 * Environment detection: GRAPH_PORT → SAAS vs AOS default.
 * Database path: GRAPH_DB_PATH → AI_KB_DB_PATH fallback → ./data/graph.db.
 */

import { hostname } from 'node:os';

const port = parseInt(process.env.GRAPH_PORT, 10)
  || (process.env.NODE_ENV === 'production' ? 3920 : 4020);

const dbPath = process.env.GRAPH_DB_PATH
  || process.env.AI_KB_DB_PATH
  || './data/graph.db';

export default {
  port,
  dbPath,
  binding: '127.0.0.1',
  machineId: hostname(),
};
