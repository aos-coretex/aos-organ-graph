import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Initialize Graph's SQLite database with schema v4.0.0.
 *
 * Tables: concepts, class_bindings, op_sync_state, op_agent_tasks, op_config
 * Views: v_entities, v_doc_transactions, v_documents (monolith-format field names)
 * Indexes: 6 computed indexes on JSON fields
 *
 * @param {string} dbPath - Path to SQLite file, or ':memory:' for tests
 * @returns {import('better-sqlite3').Database}
 */
export function initDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);

  // Pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  // --- Core tables (graph-native model) ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS concepts (
      urn         TEXT PRIMARY KEY,
      data        TEXT NOT NULL CHECK(json_valid(data)),
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS class_bindings (
      ubn         TEXT PRIMARY KEY,
      data        TEXT NOT NULL CHECK(json_valid(data)),
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Operational tables ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS op_sync_state (
      vault       TEXT PRIMARY KEY,
      last_scan   TEXT,
      file_count  INTEGER,
      status      TEXT CHECK(status IN ('idle', 'scanning', 'error'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS op_agent_tasks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type     TEXT,
      target_urn    TEXT,
      status        TEXT CHECK(status IN ('pending', 'running', 'done', 'failed')),
      created_at    TEXT,
      completed_at  TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS op_config (
      key         TEXT PRIMARY KEY,
      value       TEXT,
      updated_at  TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`INSERT OR IGNORE INTO op_config (key, value) VALUES ('schema_version', '4.0.0')`);

  // --- Views (monolith-format JSON field names) ---

  db.exec(`
    CREATE VIEW IF NOT EXISTS v_entities AS
    SELECT
      urn,
      json_extract(data, '$.entity') AS entity,
      json_extract(data, '$.tier') AS tier,
      json_extract(data, '$.filesystem_kb') AS filesystem_kb,
      json_extract(data, '$.obsidian_vault') AS obsidian_vault,
      json_extract(data, '$.dev_project') AS dev_project,
      json_extract(data, '$.dev_vault') AS dev_vault,
      json_extract(data, '$.corporate_vault') AS corporate_vault,
      json_extract(data, '$.status') AS status,
      created_at
    FROM concepts
    WHERE json_extract(data, '$.type') = 'entity'
  `);

  db.exec(`
    CREATE VIEW IF NOT EXISTS v_doc_transactions AS
    SELECT
      urn,
      json_extract(data, '$.timestamp') AS timestamp,
      json_extract(data, '$.operation') AS operation,
      json_extract(data, '$.entity') AS entity,
      json_extract(data, '$.context') AS context,
      json_extract(data, '$.initial_path') AS initial_path,
      json_extract(data, '$.initial_name') AS initial_name,
      json_extract(data, '$.current_path') AS current_path,
      json_extract(data, '$.current_name') AS current_name,
      json_extract(data, '$.department') AS department,
      json_extract(data, '$.source') AS source,
      json_extract(data, '$.operator') AS operator,
      json_extract(data, '$.rationale') AS rationale,
      json_extract(data, '$.state') AS state,
      json_extract(data, '$.storage_uri') AS storage_uri,
      created_at
    FROM concepts
    WHERE json_extract(data, '$.type') = 'doc_transaction'
  `);

  db.exec(`
    CREATE VIEW IF NOT EXISTS v_documents AS
    SELECT
      urn,
      json_extract(data, '$.display_path') AS display_path,
      json_extract(data, '$.storage_uri') AS storage_uri,
      json_extract(data, '$.filename') AS filename,
      json_extract(data, '$.extension') AS extension,
      json_extract(data, '$.size_bytes') AS size_bytes,
      json_extract(data, '$.sha256') AS sha256,
      json_extract(data, '$.vault') AS vault,
      json_extract(data, '$.tier') AS tier,
      json_extract(data, '$.modified_at') AS modified_at,
      created_at
    FROM concepts
    WHERE json_extract(data, '$.type') = 'document'
  `);

  // --- Indexes (computed on JSON fields for query performance) ---

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_concepts_type
      ON concepts(json_extract(data, '$.type'))
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_concepts_entity
      ON concepts(json_extract(data, '$.entity'))
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_concepts_status
      ON concepts(json_extract(data, '$.status'))
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bindings_from
      ON class_bindings(json_extract(data, '$.from_urn'))
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bindings_to
      ON class_bindings(json_extract(data, '$.to_urn'))
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bindings_relation
      ON class_bindings(json_extract(data, '$.relation'))
  `);

  // --- Telemetry table (operational instrumentation, NOT a graph concept) ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS adapter_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      caller TEXT,
      args_shape TEXT,
      duration_ms REAL,
      status TEXT CHECK(status IN ('ok', 'error', 'not_implemented')),
      error_message TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_operation
      ON adapter_telemetry(operation)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp
      ON adapter_telemetry(timestamp)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_caller
      ON adapter_telemetry(caller)
  `);

  return db;
}
