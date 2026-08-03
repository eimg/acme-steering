/**
 * Web UI delivery for Acme Steering.
 *
 * `npm run dev` serves source modules through Vite middleware and carries HMR
 * over Steering's own HTTP server. Built mode serves the production bundle.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type RequestHandler } from "express";
import type { ViteDevServer } from "vite";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceWebDir = resolve(packageRoot, "web");
const sourceIndex = join(sourceWebDir, "index.html");
const builtWebDir = resolve(packageRoot, "dist/web");
const builtIndex = join(builtWebDir, "index.html");

let hmrHost: Server | undefined;
let devServer: Promise<ViteDevServer> | undefined;

export function webFromSource(): boolean {
  return process.env.ACME_STEERING_DEV === "1" && existsSync(sourceIndex);
}

export function attachHmr(server: Server): void {
  hmrHost = server;
}

function viteDevServer(): Promise<ViteDevServer> {
  devServer ??= Promise.all([import("vite"), import("@vitejs/plugin-react")]).then(
    ([vite, react]) => vite.createServer({
      configFile: false,
      root: sourceWebDir,
      appType: "custom",
      plugins: [react.default()],
      server: { middlewareMode: true, hmr: hmrHost ? { server: hmrHost } : true },
    }),
  );
  return devServer;
}

export function webAssets(): RequestHandler {
  if (!webFromSource()) return express.static(builtWebDir, { index: false });
  const pending = viteDevServer();
  pending.catch((error: unknown) => {
    console.error("Vite dev server failed to start:", error instanceof Error ? error.message : error);
  });
  return (req, res, next) => {
    pending.then((vite) => vite.middlewares(req, res, next)).catch(next);
  };
}

export function webIndex(): RequestHandler {
  if (!webFromSource()) return (_req, res) => res.sendFile(builtIndex);
  return (req, res, next) => {
    viteDevServer()
      .then(async (vite) => {
        const html = await readFile(sourceIndex, "utf8");
        res.status(200).type("html").end(await vite.transformIndexHtml(req.originalUrl, html));
      })
      .catch(next);
  };
}
