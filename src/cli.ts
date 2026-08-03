#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import { DEFAULT_PORT } from "./types.js";
import { attachHmr, webFromSource } from "./webAssets.js";

loadEnvFile(resolve(process.cwd(), ".env"));

function usage(): never {
  console.error(`Usage:
  acme-steering serve [--port <n>] [--host <host>]

Environment:
  ACME_AUTH_MODE          off | local (default: off)
  ACME_IDENTITY_URL       Identity URL in local mode (default: http://127.0.0.1:8316)
  ACME_STEERING_DATA_DIR  Local data directory (default: ./data)
  PORT                    Default port if --port is not given`);
  process.exit(2);
}

function parseArgs(args: string[]): { port: number; host: string } {
  let port = Number(process.env.PORT ?? DEFAULT_PORT);
  let host = "127.0.0.1";
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--port") {
      port = Number(args[++index]);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) usage();
    } else if (args[index] === "--host") {
      host = args[++index];
      if (!host) usage();
    } else {
      usage();
    }
  }
  return { port, host };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "serve") usage();
  const { port, host } = parseArgs(args.slice(1));
  const db = openDatabase();
  const app = await createApp({ db });
  const server = app.listen(port, host, () => {
    console.log(`Acme Steering listening on http://${host}:${port}${webFromSource() ? "  (web from source)" : ""}`);
  });
  attachHmr(server);
  await new Promise<void>((resolvePromise, reject) => {
    const stop = () => server.close((error) => error ? reject(error) : resolvePromise());
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  db.close();
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals <= 0) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
