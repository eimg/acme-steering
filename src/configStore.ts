import type Database from "better-sqlite3";
import { defaultPolicyConfig, validatePolicyDraft } from "./policy.js";
import type { SteeringActor, SteeringPolicyConfig, SteeringPolicyDraft } from "./types.js";

type ConfigRow = {
  version: number;
  config_json: string;
  created_by_json: string;
  change_summary: string;
  created_at: string;
};

export class PolicyConfigConflictError extends Error {}
export class PolicyConfigValidationError extends Error {
  constructor(readonly errors: string[]) {
    super("Policy configuration is invalid");
  }
}

export class PolicyConfigStore {
  constructor(private readonly db: Database.Database) {
    this.bootstrap();
  }

  active(): SteeringPolicyConfig {
    const row = this.db.prepare("SELECT * FROM policy_config_versions ORDER BY version DESC LIMIT 1").get() as ConfigRow;
    return mapConfig(row);
  }

  history(limit = 20): SteeringPolicyConfig[] {
    const rows = this.db.prepare("SELECT * FROM policy_config_versions ORDER BY version DESC LIMIT ?")
      .all(Math.max(1, Math.min(limit, 100))) as ConfigRow[];
    return rows.map(mapConfig);
  }

  activate(input: {
    draft: unknown;
    expectedVersion: number;
    actor: SteeringActor;
    changeSummary: string;
  }): SteeringPolicyConfig {
    const current = this.active();
    if (current.version !== input.expectedVersion) {
      throw new PolicyConfigConflictError(`Policy changed from version ${input.expectedVersion} to ${current.version}; review the current config before activating.`);
    }
    const validated = validatePolicyDraft(input.draft);
    if (!validated.ok) throw new PolicyConfigValidationError(validated.errors);
    const changeSummary = input.changeSummary.trim();
    if (!changeSummary || changeSummary.length > 500) {
      throw new PolicyConfigValidationError(["changeSummary is required and must be 500 characters or fewer."]);
    }
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO policy_config_versions (config_json, created_by_json, change_summary, created_at)
      VALUES (?, ?, ?, ?)
    `).run(JSON.stringify(validated.value), JSON.stringify(input.actor), changeSummary, now);
    return {
      ...validated.value,
      version: Number(result.lastInsertRowid),
      createdAt: now,
      createdBy: input.actor,
      changeSummary,
    };
  }

  private bootstrap(): void {
    const count = Number((this.db.prepare("SELECT COUNT(*) AS count FROM policy_config_versions").get() as { count: number }).count);
    if (count) return;
    const config = defaultPolicyConfig();
    this.db.prepare(`
      INSERT INTO policy_config_versions (config_json, created_by_json, change_summary, created_at)
      VALUES (?, ?, ?, ?)
    `).run(
      JSON.stringify(draftOf(config)),
      JSON.stringify(config.createdBy),
      config.changeSummary,
      config.createdAt,
    );
  }
}

export function draftOf(config: SteeringPolicyConfig): SteeringPolicyDraft {
  return {
    schemaVersion: config.schemaVersion,
    name: config.name,
    defaultOutcome: config.defaultOutcome,
    defaultExplanation: config.defaultExplanation,
    rules: structuredClone(config.rules),
  };
}

function mapConfig(row: ConfigRow): SteeringPolicyConfig {
  const draft = JSON.parse(row.config_json) as SteeringPolicyDraft;
  return {
    ...draft,
    version: row.version,
    createdAt: row.created_at,
    createdBy: JSON.parse(row.created_by_json) as SteeringActor,
    changeSummary: row.change_summary,
  };
}
