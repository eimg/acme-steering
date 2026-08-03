import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ConfigAgent } from "./configAgent.js";
import { draftOf, PolicyConfigStore } from "./configStore.js";
import type { ConfigAgentMessage, ConfigAgentSession } from "./types.js";

type SessionRow = {
  id: string;
  status: ConfigAgentSession["status"];
  messages_json: string;
  proposed_config_json?: string;
  proposal_summary?: string;
  based_on_version: number;
  error?: string;
  created_at: string;
  updated_at: string;
};

export class ConfigAgentSessionNotFoundError extends Error {}
export class ConfigAgentSessionConflictError extends Error {}

export class ConfigAgentService {
  private readonly configs: PolicyConfigStore;

  constructor(private readonly db: Database.Database, private readonly createAgent: () => ConfigAgent) {
    this.configs = new PolicyConfigStore(db);
  }

  async start(prompt: string): Promise<ConfigAgentSession> {
    const now = new Date().toISOString();
    const session: ConfigAgentSession = {
      id: randomUUID(), status: "active", messages: [], basedOnVersion: this.configs.active().version,
      createdAt: now, updatedAt: now,
    };
    this.save(session);
    return this.turn(session.id, prompt);
  }

  async turn(id: string, prompt: string): Promise<ConfigAgentSession> {
    const session = this.get(id);
    if (session.status !== "active") throw new ConfigAgentSessionConflictError(`Config agent session is ${session.status}`);
    const active = this.configs.active();
    if (active.version !== session.basedOnVersion) {
      throw new ConfigAgentSessionConflictError(`Policy changed from version ${session.basedOnVersion} to ${active.version}; start a new discussion against the current policy.`);
    }
    const history = structuredClone(session.messages);
    session.messages.push(message("user", prompt));
    session.updatedAt = new Date().toISOString();
    this.save(session);
    try {
      const result = await this.createAgent().complete(prompt, history, draftOf(active));
      session.messages.push(message("assistant", result.message));
      session.proposedConfig = result.proposedConfig;
      session.proposalSummary = result.proposalSummary;
      session.error = undefined;
    } catch (error) {
      session.status = "error";
      session.error = error instanceof Error ? error.message : String(error);
    }
    session.updatedAt = new Date().toISOString();
    this.save(session);
    return session;
  }

  get(id: string): ConfigAgentSession {
    const row = this.db.prepare("SELECT * FROM config_agent_sessions WHERE id = ?").get(id) as SessionRow | undefined;
    if (!row) throw new ConfigAgentSessionNotFoundError(`Config agent session not found: ${id}`);
    return mapSession(row);
  }

  markApplied(id: string): ConfigAgentSession {
    const session = this.get(id);
    if (!session.proposedConfig) throw new ConfigAgentSessionConflictError("This session has no proposed configuration");
    session.status = "applied";
    session.updatedAt = new Date().toISOString();
    this.save(session);
    return session;
  }

  private save(session: ConfigAgentSession): void {
    this.db.prepare(`
      INSERT INTO config_agent_sessions (
        id, status, messages_json, proposed_config_json, proposal_summary,
        based_on_version, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, messages_json=excluded.messages_json,
        proposed_config_json=excluded.proposed_config_json, proposal_summary=excluded.proposal_summary,
        error=excluded.error, updated_at=excluded.updated_at
    `).run(
      session.id, session.status, JSON.stringify(session.messages),
      session.proposedConfig ? JSON.stringify(session.proposedConfig) : null,
      session.proposalSummary ?? null, session.basedOnVersion, session.error ?? null,
      session.createdAt, session.updatedAt,
    );
  }
}

function message(role: ConfigAgentMessage["role"], content: string): ConfigAgentMessage {
  return { role, content, createdAt: new Date().toISOString() };
}

function mapSession(row: SessionRow): ConfigAgentSession {
  return {
    id: row.id,
    status: row.status,
    messages: JSON.parse(row.messages_json) as ConfigAgentMessage[],
    proposedConfig: row.proposed_config_json ? JSON.parse(row.proposed_config_json) : undefined,
    proposalSummary: row.proposal_summary ?? undefined,
    basedOnVersion: row.based_on_version,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
