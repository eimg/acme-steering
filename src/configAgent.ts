import type {
  ConfigAgentMessage,
  ConfigAgentSession,
  ConfigAgentTurn,
  SteeringPolicyDraft,
} from "./types.js";
import { validatePolicyDraft } from "./policy.js";

export interface ConfigAgent {
  complete(prompt: string, history: ConfigAgentMessage[], current: SteeringPolicyDraft): Promise<ConfigAgentTurn>;
}

export type ConfigAgentMode = "openrouter" | "fake";
type FetchFn = typeof fetch;

export class FakeConfigAgent implements ConfigAgent {
  constructor(private readonly handler?: ConfigAgent["complete"]) {}

  async complete(prompt: string, history: ConfigAgentMessage[], current: SteeringPolicyDraft): Promise<ConfigAgentTurn> {
    if (this.handler) return this.handler(prompt, history, current);
    const lower = prompt.toLowerCase();
    const discussionOnly = lower.includes("without proposing")
      || lower.includes("do not propose")
      || lower.includes("don't propose")
      || lower.includes("explain only");
    if (!discussionOnly && (lower.includes("propose") || lower.includes("change") || lower.includes("update") || lower.includes("manage"))) {
      return {
        message: "I prepared a no-op proposal from the active policy so you can exercise review and activation offline. With a live model, I can translate the requested intent into changed rules. Please inspect the exact JSON before activating it.",
        proposedConfig: structuredClone(current),
        proposalSummary: "Offline test proposal; no policy semantics changed.",
      };
    }
    return {
      message: `The active policy is “${current.name}”. It evaluates ${current.rules.filter((rule) => rule.enabled).length} enabled rules in order and falls back to ${current.defaultOutcome}. Ask me to propose a change when you want a reviewable draft.`,
    };
  }
}

export class OpenRouterConfigAgent implements ConfigAgent {
  constructor(private readonly options: { apiKey: string; model: string; fetchFn?: FetchFn }) {}

  async complete(prompt: string, history: ConfigAgentMessage[], current: SteeringPolicyDraft): Promise<ConfigAgentTurn> {
    const response = await (this.options.fetchFn ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/eimg/acme-steering",
        "X-Title": "Acme Steering",
      },
      body: JSON.stringify({
        model: this.options.model.replace(/^openrouter\//, ""),
        temperature: 0.15,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CONFIG_AGENT_PROMPT },
          { role: "user", content: `Active policy configuration:\n${JSON.stringify(current, null, 2)}` },
          ...history.map(({ role, content }) => ({ role, content })),
          { role: "user", content: `${prompt.trim()}\n\nReturn one JSON object only.` },
        ],
      }),
    });
    const body = await response.json().catch(() => null) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    if (!response.ok) throw new Error(`OpenRouter config agent failed: ${body?.error?.message ?? `${response.status} ${response.statusText}`}`);
    const content = body?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenRouter config agent returned an empty response");
    return parseAgentTurn(content);
  }
}

export function resolveConfigAgentMode(): ConfigAgentMode {
  return process.env.OPENROUTER_API_KEY?.trim() ? "openrouter" : "fake";
}

export function resolveConfigAgentModel(): string {
  return process.env.ACME_STEERING_MODEL
    ?? process.env.HELIX_MODEL
    ?? "openrouter/xiaomi/mimo-v2.5-pro";
}

export function createDefaultConfigAgent(fetchFn?: FetchFn): ConfigAgent {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  return apiKey
    ? new OpenRouterConfigAgent({ apiKey, model: resolveConfigAgentModel(), fetchFn })
    : new FakeConfigAgent();
}

function parseAgentTurn(content: string): ConfigAgentTurn {
  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch { throw new Error("Config agent returned invalid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Config agent response must be an object");
  const value = parsed as { message?: unknown; proposedConfig?: unknown; proposalSummary?: unknown };
  if (typeof value.message !== "string" || !value.message.trim() || value.message.length > 8_000) {
    throw new Error("Config agent response requires a bounded message");
  }
  let proposedConfig: SteeringPolicyDraft | undefined;
  if (value.proposedConfig !== undefined && value.proposedConfig !== null) {
    const validated = validatePolicyDraft(value.proposedConfig);
    if (!validated.ok) throw new Error(`Config agent proposed an invalid policy: ${validated.errors.join(" ")}`);
    proposedConfig = validated.value;
  }
  const proposalSummary = typeof value.proposalSummary === "string" && value.proposalSummary.trim()
    ? value.proposalSummary.trim().slice(0, 500)
    : proposedConfig ? "Agent-proposed policy update." : undefined;
  return { message: value.message.trim(), proposedConfig, proposalSummary };
}

export const CONFIG_AGENT_PROMPT = `You are Acme Steering's configuration authoring assistant.

You may explain the current policy and propose a complete replacement policy configuration. You do not decide workflow cases, activate policy, call sibling products, inspect sibling state, change permissions, or claim that a proposal was applied. Human activation is always a separate action.

The rules are evaluated from top to bottom and the first enabled match wins. Missing, invalid, or unmatched configuration falls back to defaultOutcome. The current host can automatically execute only the accepted, reversible Prelude export because that path has a complete service-principal dispatcher and reconciliation contract. Every other notification-backed automatic result is guarded to human_required; never imply that JSON can bypass that host capability boundary. Favor narrow explicit rules and human_required defaults. Never make high-impact, merge, production, security-sensitive, or ambiguous work automatic without an unambiguous human request and narrowly stated match conditions.

Reply with exactly one JSON object:
{
  "message": "Explanation, questions, or review notes",
  "proposedConfig": { "schemaVersion": "acme.steering.policy.v1", "name": "...", "defaultOutcome": "human_required", "defaultExplanation": "...", "rules": [] },
  "proposalSummary": "Short summary for version history"
}

Omit proposedConfig and proposalSummary when only discussing. When proposing, return the complete configuration, preserve unrelated useful rules, use stable lowercase rule IDs, and explain safety implications in message.`;

export function sessionPublicShape(session: ConfigAgentSession): ConfigAgentSession {
  return structuredClone(session);
}
