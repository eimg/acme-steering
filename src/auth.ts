import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  DEV_USER_HEADER,
  hasPermission as identityHasPermission,
  identityBaseUrl,
  IdentityClientError,
  localAdminFallback,
  resolveConsumerAuthMode,
  resolvePrincipal,
  type AuthMode,
  type Principal,
} from "acme-identity/client";
import type { SteeringActor } from "./types.js";

export type { AuthMode } from "acme-identity/client";

export interface AuthRequest {
  authorization?: string;
  cookie?: string;
  devUser?: string;
}

export interface SessionResult {
  status: number;
  body: unknown;
  setCookie?: string;
}

export interface SteeringAuthAdapter {
  readonly mode: AuthMode;
  readonly provider: string;
  readonly accountUrl?: string;
  resolve(request: AuthRequest): Promise<SteeringActor>;
  signIn?(credentials: unknown, request: AuthRequest): Promise<SessionResult>;
  signOut?(request: AuthRequest): Promise<SessionResult>;
}

type AuthLocals = { principal?: SteeringActor };

export function resolveAuthMode(value = process.env.ACME_AUTH_MODE): AuthMode {
  return resolveConsumerAuthMode(value);
}

export function createStandaloneAuthAdapter(): SteeringAuthAdapter {
  return {
    mode: "off",
    provider: "standalone",
    async resolve() {
      return actorFromPrincipal(localAdminFallback("off"));
    },
  };
}

export function createAcmeIdentityAuthAdapter({
  baseUrl = process.env.ACME_IDENTITY_URL ?? "http://127.0.0.1:8316",
  fetchFn = fetch,
  timeoutMs = 3_000,
}: {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
} = {}): SteeringAuthAdapter {
  const providerUrl = identityBaseUrl(baseUrl);
  const callSession = async (method: "POST" | "DELETE", credentials: unknown, request: AuthRequest) => {
    let response: globalThis.Response;
    try {
      response = await fetchFn(`${providerUrl}/api/session`, {
        method,
        headers: {
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
          ...forwardedHeaders(request),
        },
        ...(method === "POST" ? { body: JSON.stringify(credentials ?? {}) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new IdentityClientError(
        `Identity service unreachable at ${providerUrl}`,
        "unavailable",
        { cause: error },
      );
    }
    return sessionResult(response);
  };

  return {
    mode: "local",
    provider: "acme-identity",
    accountUrl: `${providerUrl}/?tab=account`,
    async resolve(request) {
      return actorFromPrincipal(await resolvePrincipal({
        authMode: "local",
        identityUrl: providerUrl,
        fetchFn,
        timeoutMs,
        authorization: request.authorization,
        cookie: request.cookie,
        devUser: request.devUser,
      }));
    },
    async signIn(credentials, request) {
      return callSession("POST", credentials, request);
    },
    async signOut(request) {
      return callSession("DELETE", undefined, request);
    },
  };
}

export function createAuthAdapterFromEnv(
  mode = resolveAuthMode(),
  options: { fetchFn?: typeof fetch; baseUrl?: string } = {},
): SteeringAuthAdapter {
  return mode === "off" ? createStandaloneAuthAdapter() : createAcmeIdentityAuthAdapter(options);
}

export function authenticateRequests(adapter: SteeringAuthAdapter): RequestHandler {
  return async (req, res, next) => {
    try {
      (res.locals as AuthLocals).principal = await adapter.resolve(authRequest(req));
      next();
    } catch (error) {
      sendAuthError(res, error);
    }
  };
}

export function requirePermission(permission: string): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const principal = principalFrom(res);
    if (!principal) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!hasActorPermission(principal, permission)) {
      res.status(403).json({ error: `Missing permission: ${permission}` });
      return;
    }
    next();
  };
}

export function hasActorPermission(principal: SteeringActor, permission: string): boolean {
  return identityHasPermission(principal, permission);
}

export function principalFrom(res: Response): SteeringActor | undefined {
  return (res.locals as AuthLocals).principal;
}

export function sessionRoutes(app: import("express").Express, adapter: SteeringAuthAdapter): void {
  app.get("/api/auth/session", async (req, res) => {
    try {
      const principal = await adapter.resolve(authRequest(req));
      res.json({
        schemaVersion: "acme.session.v1",
        authMode: adapter.mode,
        provider: adapter.provider,
        accountUrl: adapter.accountUrl,
        principal,
        capabilities: capabilities(principal),
      });
    } catch (error) {
      sendAuthError(res, error);
    }
  });
  app.post("/api/auth/session", async (req, res) => {
    if (!adapter.signIn) {
      res.status(405).json({ error: "Interactive sign-in is unavailable in off mode" });
      return;
    }
    try {
      sendSessionResult(res, await adapter.signIn(req.body, authRequest(req)));
    } catch (error) {
      sendAuthError(res, error);
    }
  });
  app.delete("/api/auth/session", async (req, res) => {
    if (!adapter.signOut) {
      res.json({ schemaVersion: "acme.session.v1", signedOut: true });
      return;
    }
    try {
      sendSessionResult(res, await adapter.signOut(authRequest(req)));
    } catch (error) {
      sendAuthError(res, error);
    }
  });
}

export function sameOriginWrites(): RequestHandler {
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    const site = req.headers["sec-fetch-site"];
    if (site === "same-origin" || site === "none") {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (!origin) {
      next();
      return;
    }
    const expected = `${req.protocol}://${req.headers.host ?? ""}`;
    if (origin.replace(/\/$/, "") === expected) {
      next();
      return;
    }
    res.status(403).json({ error: "Cross-origin request blocked" });
  };
}

function capabilities(principal: SteeringActor): Record<string, boolean> {
  return {
    read: hasActorPermission(principal, "steering.read"),
    decide: hasActorPermission(principal, "steering.decide"),
    manage: hasActorPermission(principal, "steering.manage"),
    automate: hasActorPermission(principal, "steering.automate"),
  };
}

function authRequest(req: Request): AuthRequest {
  return {
    authorization: req.headers.authorization,
    cookie: req.headers.cookie,
    devUser: header(req, DEV_USER_HEADER),
  };
}

function forwardedHeaders(request: AuthRequest): Record<string, string> {
  return {
    ...(request.authorization ? { authorization: request.authorization } : {}),
    ...(request.cookie ? { cookie: request.cookie } : {}),
  };
}

async function sessionResult(response: globalThis.Response): Promise<SessionResult> {
  return {
    status: response.status,
    body: await response.json().catch(() => ({ error: response.statusText })),
    setCookie: response.headers.get("set-cookie") ?? undefined,
  };
}

function sendSessionResult(res: Response, result: SessionResult): void {
  if (result.setCookie) res.setHeader("set-cookie", result.setCookie);
  res.status(result.status).json(result.body);
}

function sendAuthError(res: Response, error: unknown): void {
  const unavailable = error instanceof IdentityClientError
    && (error.code === "unavailable" || error.code === "config");
  res.status(unavailable ? 503 : 401).json({
    error: error instanceof Error ? error.message : "Authentication required",
  });
}

function actorFromPrincipal(principal: Principal): SteeringActor {
  return {
    id: principal.sub,
    issuer: principal.iss,
    username: principal.username,
    displayName: principal.displayName,
    email: principal.email,
    roles: principal.roles,
    permissions: principal.permissions,
    kind: principal.kind === "service" ? "service" : principal.kind === "dev" ? "development" : "human",
  };
}

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}
