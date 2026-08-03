import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, api, type CaseView, type Config, type InboxView, type Resolution, type Session, type SteeringCase, type WorkflowEvent } from "./api";

const views: Array<{ id: InboxView; label: string; hint: string }> = [
  { id: "attention", label: "Needs attention", hint: "Waiting for judgment" },
  { id: "activity", label: "Activity", hint: "Workflow notifications" },
  { id: "automated", label: "Automated", hint: "Delegated by policy" },
  { id: "history", label: "History", hint: "Resolved and closed" },
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
      : <CenteredState title="Administrator access required" body="This first pass allows only principals with steering.read." />;
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
                <b>{item.id === "activity" ? events.length : summary[item.id]}</b>
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="status-dot" />
            <div><strong>Standalone first pass</strong><p>Manual workflow remains the fallback. No sibling product is required.</p></div>
          </div>
        </aside>

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
              onMutation={afterMutation}
            />
          ) : <Empty label="Select a case to inspect its decision context." />}
        </section>
      </main>
    </div>
  );
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

function CaseDetail({ item, canDecide, onMutation }: { item: SteeringCase; canDecide: boolean; onMutation: (next: SteeringCase) => Promise<void> }) {
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

      {!!item.messages?.length && <DetailSection title="Discussion">
        <div className="message-list">
          {item.messages.map((entry) => <div className="message" key={entry.id}><div><strong>{entry.author.displayName}</strong><span>{relativeTime(entry.createdAt)}</span></div><p>{entry.body}</p></div>)}
        </div>
      </DetailSection>}

      {active && canDecide && <div className="decision-box">
        <label htmlFor="rationale">Decision note <span>Required for rejection, revision, and escalation</span></label>
        <textarea id="rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Add reasoning, conditions, or revision guidance…" maxLength={2000} />
        <div className="decision-actions">
          {item.choices.map((choice) => <button key={choice.id} disabled={busy} className={`decision-button ${choice.tone ?? "neutral"}`} title={choice.consequence} onClick={() => void resolve(choice.id)}>{choice.label}</button>)}
        </div>
        <div className="discussion-compose">
          <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask or add context without authorizing…" maxLength={2000} onKeyDown={(event) => { if (event.key === "Enter") void sendMessage(); }} />
          <button className="ghost-button" disabled={busy || !message.trim()} onClick={() => void sendMessage()}>Add note</button>
        </div>
      </div>}

      {item.applicationSummary && <div className="application-result"><span>Application outcome</span><strong>{item.applicationSummary}</strong>{item.resolvedBy && <small>{item.resolvedBy.displayName} · {item.resolvedAt ? formatDate(item.resolvedAt) : ""}</small>}</div>}
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
    <div className="brand-mark auth-logo">AS</div><span className="eyebrow auth-eyebrow">Acme Identity</span><h1>Sign in to Acme Steering</h1><p>The first pass restricts the Steering inbox to an Identity principal with the required permissions.</p>
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
    <p><strong>{session.principal.displayName}</strong> is signed in as @{session.principal.username}, but this first pass only admits principals with Steering access.</p>
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
