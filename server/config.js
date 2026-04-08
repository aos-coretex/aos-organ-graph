/**
 * Graph organ configuration.
 *
 * Environment detection: GRAPH_PORT → SAAS vs AOS default.
 * Database path: GRAPH_DB_PATH → AI_KB_DB_PATH fallback → ./data/graph.db.
 * Spine URL: SPINE_URL → AOS 4000 / SAAS 3900.
 */

import { hostname } from 'node:os';

const isProduction = process.env.NODE_ENV === 'production';

const port = parseInt(process.env.GRAPH_PORT, 10)
  || (isProduction ? 3920 : 4020);

const dbPath = process.env.GRAPH_DB_PATH
  || process.env.AI_KB_DB_PATH
  || './data/graph.db';

export default {
  port,
  dbPath,
  binding: '127.0.0.1',
  machineId: hostname(),
  spineUrl: process.env.SPINE_URL || (isProduction ? 'http://127.0.0.1:3900' : 'http://127.0.0.1:4000'),
};
