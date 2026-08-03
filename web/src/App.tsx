import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, api, type CaseView, type Config, type ConfigAgentSession, type InboxView, type PolicyConfig, type PolicyDraft, type Resolution, type Session, type SteeringCase, type WorkflowEvent } from "./api";

const views: Array<{ id: InboxView; label: string; hint: string }> = [
  { id: "attention", label: "Needs attention", hint: "Waiting for judgment" },
  { id: "activity", label: "Activity", hint: "Workflow notifications" },
  { id: "automated", label: "Automated", hint: "Delegated by policy" },
  { id: "history", label: "History", hint: "Resolved and closed" },
  { id: "config", label: "Configuration", hint: "Policy and agent authoring" },
];

export function App() {
  const [config, setConfig] = useState<Config>();
  const [session, setSession] = useState<Session>();
  const [authError, setAuthError] = useState<string>();

  const loadSession = useCallback(async () => {
    try {
      const [nextConfig, nextSession] = await Promise.all([api.config(), api.session()]);
      setConfig(nextConfig);
      setSession(nextSession);
      setAuthError(undefined);
    } catch (error) {
      const nextConfig = await api.config().catch(() => undefined);
      setConfig(nextConfig);
      setSession(undefined);
      setAuthError(error instanceof ApiError && error.status === 401 ? undefined : errorMessage(error));
    }
  }, []);

  useEffect(() => void loadSession(), [loadSession]);

  if (!config) return <CenteredState title="Opening Steering" body="Loading the local decision channel…" />;
  if (!session) {
    return config.authMode === "local"
      ? <SignIn error={authError} onSignedIn={loadSession} />
      : <CenteredState title="Steering unavailable" body={authError ?? "The local operator could not be resolved."} />;
  }
  if (!session.capabilities.read) {
    return config.authMode === "local"
      ? <AccessRequired session={session} onSessionChange={loadSession} />
      : <CenteredState title="Steering access required" body="This workspace requires a principal with steering.read." />;
  }

  return <Inbox config={config} session={session} onSessionChange={loadSession} />;
}

function Inbox({ config, session, onSessionChange }: { config: Config; session: Session; onSessionChange: () => Promise<void> }) {
  const [view, setView] = useState<InboxView>("attention");
  const [items, setItems] = useState<SteeringCase[]>([]);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [summary, setSummary] = useState<Record<CaseView, number>>({ attention: 0, automated: 0, history: 0 });
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<SteeringCase>();
  const [selectedEvent, setSelectedEvent] = useState<WorkflowEvent>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [signingOut, setSigningOut] = useState(false);
  const accountMenuRef = useOutsideDismissDetails();

  const refresh = useCallback(async (keepSelection = true) => {
    setLoading(true);
    setError(undefined);
    try {
      const nextSummary = await api.summary();
      setSummary(nextSummary);
      if (view === "config") {
        setItems([]);
        setDetail(undefined);
        setSelectedEvent(undefined);
        return;
      }
      if (view === "activity") {
        const nextEvents = await api.events();
        setEvents(nextEvents.items);
        setSelectedEvent(nextEvents.items[0]);
        setItems([]);
        setDetail(undefined);
        return;
      }
      const nextCases = await api.cases(view);
      setItems(nextCases.items);
      const nextId = keepSelection && selectedId && nextCases.items.some((item) => item.id === selectedId)
        ? selectedId
        : nextCases.items[0]?.id;
      setSelectedId(nextId);
      setDetail(nextId ? await api.case(nextId) : undefined);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [selectedId, view]);

  useEffect(() => void refresh(false), [view]);

  const select = async (id: string) => {
    setSelectedId(id);
    setError(undefined);
    try {
      setDetail(await api.case(id));
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  };

  const afterMutation = async (next: SteeringCase) => {
    setDetail(next);
    await refresh(true);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">AS</div>
        <div className="brand-copy">
          <strong>Acme Steering</strong>
          <span>Local decision channel</span>
        </div>
        <div className="topbar-spacer" />
        {config.fixtureMode && <span className="mode-pill">Fixture workspace</span>}
        <details className="account-menu" ref={accountMenuRef}>
          <summary className="account-trigger" aria-label={`Account: ${session.principal.displayName}`}>
            <span className="account-avatar" aria-hidden="true">{session.principal.displayName.charAt(0).toUpperCase()}</span>
            <span className="account-trigger-name">{session.principal.displayName}</span>
          </summary>
          <div className="account-popover">
            <div className="account-heading">
              <strong>{session.principal.displayName}</strong>
              <span>@{session.principal.username}</span>
            </div>
            <div className="account-context">
              <span className={`account-status ${session.authMode === "off" ? "development" : "connected"}`} />
              <div>
                <strong>{session.authMode === "off" ? "Authentication off" : "Acme Identity"}</strong>
                <span>{session.authMode === "off"
                  ? "Development admin access"
                  : session.principal.roles.join(", ") || session.principal.kind}</span>
              </div>
            </div>
            {session.accountUrl && <a className="account-action" href={session.accountUrl} target="_blank" rel="noreferrer">My identity account <span aria-hidden="true">↗</span></a>}
            {session.authMode === "local" && <button className="account-action" type="button" disabled={signingOut} onClick={async () => {
              setSigningOut(true);
              try { await api.signOut(); await onSessionChange(); }
              finally { setSigningOut(false); }
            }}>{signingOut ? "Signing out…" : "Sign out"}</button>}
          </div>
        </details>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">Steering</div>
          <nav>
            {views.map((item) => (
              <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)}>
                <span><strong>{item.label}</strong><small>{item.hint}</small></span>
                <b>{item.id === "activity" ? events.length : item.id === "config" ? "⚙" : summary[item.id]}</b>
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="status-dot" />
            <div><strong>Local steering active</strong><p>Source products retain workflow authority through explicit public contracts.</p></div>
          </div>
        </aside>

        {view === "config" ? <ConfigWorkspace config={config} canManage={session.capabilities.manage} /> : <>
        <section className="case-list-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">{viewLabel(view)}</span><h1>{view === "activity" ? events.length : summary[view]} {view === "activity" ? "events" : summary[view] === 1 ? "case" : "cases"}</h1></div>
            <button className="icon-button" aria-label="Refresh" onClick={() => void refresh(true)}>↻</button>
          </div>
          {error && <div className="inline-error">{error}</div>}
          <div className="case-list">
            {view === "activity" && events.map((entry) => (
              <button key={entry.id} className={`case-row ${selectedEvent?.id === entry.id ? "selected" : ""}`} onClick={() => setSelectedEvent(entry)}>
                <div className="case-row-top"><span className={`source-icon source-${sourceClass(entry.source.product)}`}>{initials(entry.source.product)}</span><span className="risk risk-low">event</span></div>
                <strong>{entry.event.summary}</strong>
                <p>{entry.event.detail ?? humanize(entry.event.type)}</p>
                <div className="case-meta"><span>{entry.source.product}</span><span>{relativeTime(entry.event.occurredAt)}</span></div>
              </button>
            ))}
            {view !== "activity" && <>
            {loading && !items.length ? <Empty label="Loading cases…" /> : items.map((item) => (
              <button key={item.id} className={`case-row ${selectedId === item.id ? "selected" : ""}`} onClick={() => void select(item.id)}>
                <div className="case-row-top"><span className={`source-icon source-${sourceClass(item.sourceProduct)}`}>{initials(item.sourceProduct)}</span><span className={`risk risk-${item.risk}`}>{item.risk}</span></div>
                <strong>{item.title}</strong>
                <p>{item.reason}</p>
                <div className="case-meta"><span>{item.sourceProduct}</span><span>{relativeTime(item.updatedAt)}</span></div>
              </button>
            ))}
            {!loading && !items.length && <Empty label={view === "attention" ? "Nothing is waiting for attention." : "No cases in this view yet."} />}
            </>}
            {!loading && view === "activity" && !events.length && <Empty label="No workflow notifications yet." />}
          </div>
        </section>

        <section className="detail-panel">
          {view === "activity" && selectedEvent ? <WorkflowEventDetail item={selectedEvent} /> : detail ? (
            <CaseDetail
              item={detail}
              canDecide={session.capabilities.decide}
              advisor={config.advisorEnabled ? { mode: config.advisorMode, model: config.advisorModel } : undefined}
              onMutation={afterMutation}
            />
          ) : <Empty label="Select a case to inspect its decision context." />}
        </section>
        </>}
      </main>
    </div>
  );
}

function ConfigWorkspace({ config, canManage }: { config: Config; canManage: boolean }) {
  const [active, setActive] = useState<PolicyConfig>();
  const [history, setHistory] = useState<PolicyConfig[]>([]);
  const [editor, setEditor] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentSession, setAgentSession] = useState<ConfigAgentSession>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    const result = await api.policyConfig();
    setActive(result.active);
    setHistory(result.history);
    setEditor(JSON.stringify(policyDraft(result.active), null, 2));
  }, []);

  useEffect(() => { void load().catch((nextError) => setError(errorMessage(nextError))); }, [load]);

  const activateDirect = async () => {
    if (!active) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      const parsed = JSON.parse(editor) as PolicyDraft;
      const next = await api.activatePolicy(parsed, active.version, changeSummary);
      setNotice(`Activated policy version ${next.version}. Existing case evaluations remain historical snapshots.`);
      setChangeSummary("");
      setAgentSession(undefined);
      await load();
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const sendAgentPrompt = async () => {
    if (!prompt.trim()) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      const next = agentSession?.status === "active"
        ? await api.messageConfigAgent(agentSession.id, prompt.trim())
        : await api.startConfigAgent(prompt.trim());
      setAgentSession(next);
      setPrompt("");
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const activateProposal = async () => {
    if (!agentSession?.proposedConfig) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      const result = await api.activateAgentProposal(agentSession.id);
      setAgentSession(result.session);
      setNotice(`Activated agent-assisted policy version ${result.active.version}.`);
      await load();
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  return <section className="config-workspace">
    <div className="config-heading">
      <div><span className="eyebrow">Delegation policy</span><h1>Steering configuration</h1><p>Configuration is the source of truth. The agent may explain or propose; only your explicit activation changes policy.</p></div>
      {active && <span className="status-badge status-applied">Version {active.version}</span>}
    </div>
    {error && <div className="inline-error">{error}</div>}
    {notice && <div className="inline-notice">{notice}</div>}
    <div className="config-columns">
      <div className="config-stack">
        <section className="config-card">
          <div className="config-card-heading"><div><span className="eyebrow">Active policy</span><h2>{active?.name ?? "Loading…"}</h2></div><span>{active?.rules.filter((rule) => rule.enabled).length ?? 0} enabled rules</span></div>
          {active && <div className="config-meta"><span>Fallback: {humanize(active.defaultOutcome)}</span><span>Activated by {active.createdBy.displayName}</span><span>{formatDate(active.createdAt)}</span><span>Source automation guarded off</span></div>}
          <textarea className="config-editor" aria-label="Policy configuration JSON" spellCheck={false} value={editor} onChange={(event) => setEditor(event.target.value)} disabled={!canManage || busy} />
          <label className="config-label">Change summary<input value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} maxLength={500} placeholder="Why this policy version should replace the current one" disabled={!canManage || busy} /></label>
          <div className="config-actions"><button className="decision-button primary" disabled={!canManage || busy || !changeSummary.trim() || !active} onClick={() => void activateDirect()}>{busy ? "Working…" : "Validate and activate"}</button><button className="ghost-button" disabled={busy || !active} onClick={() => active && setEditor(JSON.stringify(policyDraft(active), null, 2))}>Reset editor</button></div>
          {!canManage && <p className="permission-note">You can inspect policy, but `steering.manage` is required to change it or use the authoring agent.</p>}
        </section>

        <section className="config-card compact">
          <span className="eyebrow">Version history</span>
          <div className="version-list">{history.map((item) => <div key={item.version}><strong>v{item.version} · {item.name}</strong><span>{item.changeSummary}</span><small>{item.createdBy.displayName} · {formatDate(item.createdAt)}</small></div>)}</div>
        </section>
      </div>

      <section className="config-card agent-card">
        <div className="config-card-heading"><div><span className="eyebrow">Config author</span><h2>Discuss with agent</h2></div><span className={`mode-pill ${config.configAgentMode === "fake" ? "offline" : ""}`}>{config.configAgentMode === "fake" ? "Offline test agent" : config.configAgentModel ?? "OpenRouter"}</span></div>
        <p className="agent-boundary">The agent receives only this Steering policy and this conversation. It has no sibling-product tools or authority to activate changes.</p>
        <div className="agent-messages">
          {agentSession?.messages.map((message, index) => <div className={`agent-message ${message.role}`} key={`${message.createdAt}-${index}`}><span>{message.role === "user" ? "You" : "Config agent"}</span><p>{message.content}</p></div>)}
          {!agentSession?.messages.length && <div className="agent-empty"><strong>Start with intent, not syntax.</strong><p>Ask what the current policy does, explore a tradeoff, or request a reviewable configuration proposal.</p></div>}
        </div>
        {agentSession?.error && <div className="inline-error">{agentSession.error}</div>}
        <div className="agent-compose"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} placeholder="For example: explain which actions can run automatically, then propose a safer default…" disabled={!canManage || busy || agentSession?.status === "applied" || agentSession?.status === "error"} /><button className="decision-button primary" disabled={!canManage || busy || !prompt.trim() || agentSession?.status === "applied" || agentSession?.status === "error"} onClick={() => void sendAgentPrompt()}>{busy ? "Thinking…" : agentSession ? "Send" : "Start discussion"}</button></div>

        {agentSession?.proposedConfig && <div className="agent-proposal">
          <div><span className="eyebrow">Reviewable proposal</span><h3>{agentSession.proposedConfig.name}</h3><p>{agentSession.proposalSummary}</p></div>
          <pre>{JSON.stringify(agentSession.proposedConfig, null, 2)}</pre>
          <button className="decision-button primary" disabled={!canManage || busy || agentSession.status !== "active"} onClick={() => void activateProposal()}>{agentSession.status === "applied" ? "Activated" : "Activate exact proposal"}</button>
        </div>}
        {agentSession && <button className="ghost-button new-agent-session" disabled={busy} onClick={() => { setAgentSession(undefined); setPrompt(""); }}>Start new discussion</button>}
      </section>
    </div>
  </section>;
}

function policyDraft(config: PolicyConfig): PolicyDraft {
  return { schemaVersion: config.schemaVersion, name: config.name, defaultOutcome: config.defaultOutcome, defaultExplanation: config.defaultExplanation, rules: config.rules };
}

function WorkflowEventDetail({ item }: { item: WorkflowEvent }) {
  return <article className="case-detail">
    <div className="detail-heading"><div className="detail-title-row"><span className={`source-icon large source-${sourceClass(item.source.product)}`}>{initials(item.source.product)}</span><div><span className="eyebrow">{item.source.product} · {item.source.resourceType}:{item.source.resourceId}</span><h2>{item.event.summary}</h2></div></div></div>
    <div className="context-banner"><div><span>Workflow event</span><strong>{humanize(item.event.type)}</strong></div><div className="context-facts"><span>Revision {item.source.revision}</span><span>{relativeTime(item.event.occurredAt)}</span></div></div>
    <DetailSection title="What happened"><p>{item.event.detail ?? item.event.summary}</p></DetailSection>
    {item.steering && <DetailSection title="Steering sync"><p>This event marks case {item.steering.caseKey} as {item.steering.state}. Source workflow state remains authoritative.</p></DetailSection>}
    {item.source.url && <a className="account-action" href={item.source.url} target="_blank" rel="noreferrer">Open source record <span aria-hidden="true">↗</span></a>}
  </article>;
}

function CaseDetail({ item, canDecide, advisor, onMutation }: {
  item: SteeringCase;
  canDecide: boolean;
  advisor?: { mode: "openrouter" | "fake"; model?: string };
  onMutation: (next: SteeringCase) => Promise<void>;
}) {
  const [rationale, setRationale] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const active = ["pending", "deferred", "escalated", "revision_requested"].includes(item.status);

  useEffect(() => {
    setRationale("");
    setMessage("");
    setError(undefined);
  }, [item.id]);

  const resolve = async (resolution: Resolution) => {
    setBusy(true);
    setError(undefined);
    try {
      await onMutation(await api.resolve(item.id, resolution, rationale, item.sourceRevision));
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await onMutation(await api.message(item.id, message.trim()));
      setMessage("");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const askAdvisor = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await onMutation(await api.askAdvisor(item.id, message.trim()));
      setMessage("");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const redeliverDecision = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onMutation(await api.redeliverDecision(item.id));
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="case-detail">
      <div className="detail-heading">
        <div className="detail-title-row">
          <span className={`source-icon large source-${sourceClass(item.sourceProduct)}`}>{initials(item.sourceProduct)}</span>
          <div><span className="eyebrow">{item.sourceProduct} · {item.sourceRef}</span><h2>{item.title}</h2></div>
        </div>
        <span className={`status-badge status-${item.status}`}>{humanize(item.status)}</span>
      </div>

      <div className="context-banner">
        <div><span>Why you are being asked</span><strong>{item.reason}</strong></div>
        <div className="context-facts"><span>{item.risk} risk</span><span>{item.reversible ? "Reversible" : "Not reversible"}</span><span>Revision {item.sourceRevision}</span></div>
      </div>

      <DetailSection title="Context"><p>{item.summary}</p></DetailSection>
      <DetailSection title="Proposed action"><p>{item.proposedAction}</p></DetailSection>
      <DetailSection title="Recommendation"><p>{item.recommendation}</p></DetailSection>

      <div className="policy-card">
        <div><span className="eyebrow">Policy evaluation</span><strong>{humanize(item.policy.outcome)}</strong></div>
        <p>{item.policy.explanation}</p>
        <code>{item.policy.policyId} · {item.policy.policyVersion}</code>
      </div>

      <DetailSection title="Evidence">
        <div className="evidence-grid">
          {item.evidence.map((evidence) => <div className="evidence-card" key={`${evidence.label}-${evidence.detail}`}><strong>{evidence.label}</strong><span>{evidence.detail}</span></div>)}
        </div>
      </DetailSection>

      <DetailSection title="Discussion">
        {!!item.messages?.length ? <div className="message-list">
          {item.messages.map((entry) => <div className={`message ${entry.author.id === "service:acme-steering:advisor" ? "advisor" : ""}`} key={entry.id}><div><strong>{entry.author.displayName}</strong><span>{entry.author.id === "service:acme-steering:advisor" ? "Generated advice" : relativeTime(entry.createdAt)}</span></div><p>{entry.body}</p></div>)}
        </div> : <p className="discussion-empty">No discussion yet.</p>}
        {canDecide && <div className="case-discussion-compose">
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask the advisor or add human context without authorizing…" maxLength={2000} disabled={busy} />
          <div><span>{advisor ? `Advisor: ${advisor.mode === "fake" ? "offline test mode" : advisor.model ?? "OpenRouter"}` : "Advisor unavailable"}</span><button className="ghost-button" disabled={busy || !message.trim()} onClick={() => void sendMessage()}>Add note</button><button className="decision-button primary" disabled={busy || !message.trim() || !advisor} onClick={() => void askAdvisor()}>{busy ? "Working…" : "Ask advisor"}</button></div>
        </div>}
      </DetailSection>

      {active && canDecide && <div className="decision-box">
        <label htmlFor="rationale">Decision note <span>Required for rejection, revision, and escalation</span></label>
        <textarea id="rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Add reasoning, conditions, or revision guidance…" maxLength={2000} />
        <div className="decision-actions">
          {item.choices.map((choice) => <button key={choice.id} disabled={busy} className={`decision-button ${choice.tone ?? "neutral"}`} title={choice.consequence} onClick={() => void resolve(choice.id)}>{choice.label}</button>)}
        </div>
      </div>}

      {item.applicationSummary && <div className="application-result"><span>Application outcome</span><strong>{item.applicationSummary}</strong>{item.resolvedBy && <small>{item.resolvedBy.displayName} · {item.resolvedAt ? formatDate(item.resolvedAt) : ""}</small>}</div>}
      {item.decisionDeliverySummary && <div className="application-result"><span>Source decision delivery · {humanize(item.decisionDeliveryStatus ?? "unknown")}</span><strong>{item.decisionDeliverySummary}</strong>{item.decisionDeliveredAt && <small>{formatDate(item.decisionDeliveredAt)}</small>}{canDecide && item.decisionDeliveryStatus === "unavailable" && <button className="ghost-button" disabled={busy} onClick={() => void redeliverDecision()}>{busy ? "Retrying…" : "Retry delivery"}</button>}</div>}
      {error && <div className="inline-error">{error}</div>}
    </article>
  );
}

function SignIn({ error, onSignedIn }: { error?: string; onSignedIn: () => Promise<void> }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();
  return <div className="auth-page"><form className="auth-card" onSubmit={async (event) => {
    event.preventDefault();
    setBusy(true);
    setLocalError(undefined);
    try { await api.signIn(username, password); await onSignedIn(); }
    catch (nextError) { setLocalError(errorMessage(nextError)); }
    finally { setBusy(false); }
  }}>
    <div className="brand-mark auth-logo">AS</div><span className="eyebrow auth-eyebrow">Acme Identity</span><h1>Sign in to Acme Steering</h1><p>The Steering inbox requires an Identity principal with the appropriate permissions.</p>
    <label>Username<input autoComplete="username" autoFocus required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
    <label>Password<input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {(localError || error) && <div className="inline-error">{localError ?? error}</div>}
    <button className="decision-button primary" disabled={busy || !username || !password}>{busy ? "Signing in…" : "Sign in"}</button>
  </form></div>;
}

function AccessRequired({ session, onSessionChange }: { session: Session; onSessionChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return <div className="auth-page"><div className="auth-card restricted-card">
    <div className="brand-mark auth-logo">AS</div>
    <span className="eyebrow auth-eyebrow">Access restricted</span>
    <h1>Administrator access required</h1>
    <p><strong>{session.principal.displayName}</strong> is signed in as @{session.principal.username}, but this account does not currently have Steering access.</p>
    <div className="account-context restricted-account">
      <span className="account-status connected" />
      <div><strong>Acme Identity</strong><span>{session.principal.roles.join(", ") || session.principal.kind}</span></div>
    </div>
    {error && <div className="inline-error">{error}</div>}
    <div className="restricted-actions">
      <button className="decision-button primary" disabled={busy} onClick={async () => {
        setBusy(true);
        setError(undefined);
        try { await api.signOut(); await onSessionChange(); }
        catch (nextError) { setError(errorMessage(nextError)); }
        finally { setBusy(false); }
      }}>{busy ? "Switching account…" : "Sign out and use administrator"}</button>
      {session.accountUrl && <a className="identity-link" href={session.accountUrl} target="_blank" rel="noreferrer">Open my Identity account ↗</a>}
    </div>
  </div></div>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3>{children}</section>;
}

function Empty({ label }: { label: string }) {
  return <div className="empty-state"><div>◇</div><p>{label}</p></div>;
}

function CenteredState({ title, body }: { title: string; body: string }) {
  return <div className="centered-state"><div className="brand-mark auth-logo">AS</div><h1>{title}</h1><p>{body}</p></div>;
}

function viewLabel(view: InboxView): string {
  return views.find((item) => item.id === view)?.label ?? view;
}

function sourceClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
}

function initials(value: string): string {
  return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Unexpected error";
}

function useOutsideDismissDetails() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      const menu = ref.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);
  return ref;
}
