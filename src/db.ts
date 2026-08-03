import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function resolveDataDir(): string {
  return process.env.ACME_STEERING_DATA_DIR ?? join(projectRoot, "data");
}

export function openDatabase(path = join(resolveDataDir(), "steering.db")): Database.Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS steering_cases (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      source_product TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      source_revision TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT NOT NULL,
      summary TEXT NOT NULL,
      proposed_action TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      risk TEXT NOT NULL,
      risk_assessment_json TEXT,
      reversible INTEGER NOT NULL CHECK(reversible IN (0, 1)),
      evidence_json TEXT NOT NULL,
      choices_json TEXT NOT NULL,
      facts_json TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      policy_outcome TEXT NOT NULL,
      policy_explanation TEXT NOT NULL,
      status TEXT NOT NULL,
      resolution TEXT,
      rationale TEXT,
      resolved_by_json TEXT,
      decision_id TEXT,
      decision_delivery_status TEXT,
      decision_delivery_summary TEXT,
      decision_delivered_at TEXT,
      application_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      applied_at TEXT
    );

    CREATE TABLE IF NOT EXISTS case_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL,
      body TEXT NOT NULL,
      author_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES steering_cases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflow_events (
      id TEXT PRIMARY KEY,
      source_product TEXT NOT NULL,
      source_resource_type TEXT NOT NULL,
      source_resource_id TEXT NOT NULL,
      source_revision TEXT NOT NULL,
      source_url TEXT,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail TEXT,
      notification_json TEXT NOT NULL,
      case_id TEXT,
      received_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES steering_cases(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS policy_config_versions (
      version INTEGER PRIMARY KEY AUTOINCREMENT,
      config_json TEXT NOT NULL,
      created_by_json TEXT NOT NULL,
      change_summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config_agent_sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      proposed_config_json TEXT,
      proposal_summary TEXT,
      based_on_version INTEGER NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS action_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      decision_id TEXT,
      actor_json TEXT NOT NULL,
      policy_id TEXT,
      policy_version TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES steering_cases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS case_escalations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL,
      required_permission TEXT NOT NULL,
      reason TEXT NOT NULL,
      deadline_at TEXT,
      fallback TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      closed_at TEXT,
      FOREIGN KEY (case_id) REFERENCES steering_cases(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cases_status_updated
      ON steering_cases(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cases_policy_updated
      ON steering_cases(policy_outcome, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_case_messages_case
      ON case_messages(case_id, created_at ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_workflow_events_received
      ON workflow_events(received_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_events_resource
      ON workflow_events(source_product, source_resource_type, source_resource_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_config_agent_updated
      ON config_agent_sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_action_attempts_case
      ON action_attempts(case_id, created_at ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_escalations_case
      ON case_escalations(case_id, created_at DESC, id DESC);
  `);

  const caseColumns = new Set((db.prepare("PRAGMA table_info(steering_cases)").all() as Array<{ name: string }>)
    .map((column) => column.name));
  if (!caseColumns.has("decision_id")) db.exec("ALTER TABLE steering_cases ADD COLUMN decision_id TEXT");
  if (!caseColumns.has("decision_delivery_status")) db.exec("ALTER TABLE steering_cases ADD COLUMN decision_delivery_status TEXT");
  if (!caseColumns.has("decision_delivery_summary")) db.exec("ALTER TABLE steering_cases ADD COLUMN decision_delivery_summary TEXT");
  if (!caseColumns.has("decision_delivered_at")) db.exec("ALTER TABLE steering_cases ADD COLUMN decision_delivered_at TEXT");
  if (!caseColumns.has("risk_assessment_json")) db.exec("ALTER TABLE steering_cases ADD COLUMN risk_assessment_json TEXT");
}
