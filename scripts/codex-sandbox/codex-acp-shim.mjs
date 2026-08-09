// Pimia divergence: an intermediate sandbox mode for managed Codex agents.
//
// The upstream ACP adapter (`@agentclientprotocol/codex-acp`) exposes three
// closed modes, and none of them is "confined to the workspace but allowed to
// reach the relay":
//
//   read-only          readOnly,        networkAccess: false
//   agent (default)    workspaceWrite,  networkAccess: false   <- no relay
//   agent-full-access  dangerFullAccess                        <- no sandbox
//
// Managed agents need both halves: writes confined to the workspace *and*
// outbound network, because the `buzz` CLI they talk to the relay with runs as
// a sandboxed subprocess. Today the only way to get the network half is
// `agent-full-access`, which drops confinement entirely.
//
// The adapter sends `sandboxPolicy` inline on every `turn/start`, so a global
// `CODEX_CONFIG` override cannot reach it (see `codex_network_env` in
// crates/buzz-acp/src/config.rs, which is dead letter for this adapter). The
// mode table itself is module-private, so it cannot be extended from outside.
//
// This shim therefore launches the *unmodified* upstream bundle and flips the
// single field we need on the wire between the adapter and the Codex
// app-server. It copies no upstream code and writes to no upstream file: the
// npm prefix it reads from is shared with a real Buzz install on the same
// machine, so mutating it is not an option.
//
// Selected per agent with `INITIAL_AGENT_MODE=agent-workspace-network`. Any
// other value is passed through untouched and nothing is rewritten.
//
// See docs/UPSTREAM.md § "Modo de sandbox intermedio para agentes Codex".

import childProcess from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Mode id an operator sets to ask for workspace-write plus outbound network. */
export const PIMIA_NETWORK_MODE_ID = "agent-workspace-network";

/**
 * Upstream mode the shim hands to the adapter once it has claimed the Pimia
 * mode id. `agent` is upstream's workspaceWrite preset; the shim supplies the
 * network half the preset hardcodes off.
 */
export const UPSTREAM_BASE_MODE_ID = "agent";

const UPSTREAM_PACKAGE_SUBPATH = path.join(
  "@agentclientprotocol",
  "codex-acp",
  "dist",
  "index.js",
);

/**
 * Decide whether this launch is a Pimia network-mode launch, and which mode id
 * the upstream adapter should see.
 *
 * A non-matching (or absent) `INITIAL_AGENT_MODE` is left exactly as-is so the
 * shim stays a transparent launcher for read-only and full-access agents.
 */
export function resolveRequestedMode(env) {
  const requested = env.INITIAL_AGENT_MODE;
  if (requested !== PIMIA_NETWORK_MODE_ID) {
    return { networkEnabled: false, upstreamMode: requested };
  }
  return { networkEnabled: true, upstreamMode: UPSTREAM_BASE_MODE_ID };
}

/**
 * Grant outbound network to a workspace-write sandbox policy in place.
 *
 * Returns `true` when the message was changed. Policies of any other type are
 * left alone: `readOnly` must stay offline, and `dangerFullAccess` is already
 * unsandboxed, so widening either would be a change nobody asked for.
 */
export function applyNetworkAccess(message) {
  const policy = message?.params?.sandboxPolicy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return false;
  }
  if (policy.type !== "workspaceWrite" || policy.networkAccess === true) {
    return false;
  }
  policy.networkAccess = true;
  return true;
}

/**
 * Rewrite a chunk of newline-delimited JSON-RPC headed for the Codex
 * app-server.
 *
 * Returns `null` when the chunk is not a clean run of whole frames — a partial
 * frame, or anything that does not parse as JSON. The caller forwards those
 * verbatim: failing to patch costs the agent its network, while mangling a
 * frame would break the session outright.
 */
export function rewriteNdjsonChunk(text) {
  if (!text.endsWith("\n")) {
    return null;
  }
  const lines = text.split("\n");
  // `endsWith("\n")` guarantees a trailing empty element; drop it.
  lines.pop();

  let patched = false;
  const rewritten = [];
  for (const line of lines) {
    if (line.trim() === "") {
      rewritten.push(line);
      continue;
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return null;
    }
    if (applyNetworkAccess(message)) {
      patched = true;
      rewritten.push(JSON.stringify(message));
    } else {
      rewritten.push(line);
    }
  }
  return { text: `${rewritten.join("\n")}\n`, patched };
}

/**
 * Recognise the adapter spawning the Codex app-server, so the shim leaves every
 * other child (MCP servers, the `buzz` CLI itself) untouched.
 *
 * Takes the full argv — including argv[0] — which is what
 * `ChildProcess.prototype.spawn` receives, and which flattens all three ways
 * upstream starts the app-server: `spawn(codexPath, ["app-server"])`,
 * `spawn(execPath, [bundledCodexJs, "app-server"])`, and the Windows shell form
 * `spawn('"<codexPath>" app-server', { shell: true })`, whose argv ends up as
 * `["cmd.exe", "/d", "/s", "/c", '"<codexPath>" app-server']`.
 *
 * `app-server` must stand alone as a token, so paths that merely contain the
 * word (`/opt/app-server-tools/bin/helper`) do not match.
 */
export function isCodexAppServerArgv(argv) {
  if (!Array.isArray(argv)) {
    return false;
  }
  return argv.some(
    (entry) => typeof entry === "string" && /(^|\s)app-server(\s|$)/.test(entry),
  );
}

/**
 * The platform directory the desktop installs its managed npm prefix under.
 *
 * Mirrors Rust's `dirs::data_dir()`, which
 * `managed_agents::managed_node_paths::buzz_managed_npm_prefix` builds on.
 */
export function managedDataDir(env, platform, homedir) {
  if (platform === "win32") {
    return env.APPDATA ?? null;
  }
  if (platform === "darwin") {
    return path.join(homedir, "Library", "Application Support");
  }
  return env.XDG_DATA_HOME || path.join(homedir, ".local", "share");
}

/**
 * Ordered candidate paths for the upstream adapter bundle.
 *
 * `PIMIA_CODEX_ACP_ENTRY` wins so tests and one-off adapter builds can point
 * the shim somewhere else. Both npm global layouts are offered because npm
 * nests global packages under `lib/` on unix and directly under the prefix on
 * Windows.
 */
export function upstreamEntryCandidates(env, platform, homedir) {
  const candidates = [];
  if (env.PIMIA_CODEX_ACP_ENTRY) {
    candidates.push(env.PIMIA_CODEX_ACP_ENTRY);
  }
  const dataDir = managedDataDir(env, platform, homedir);
  if (dataDir) {
    const prefix = path.join(dataDir, "Buzz", "node-tools");
    candidates.push(path.join(prefix, "lib", "node_modules", UPSTREAM_PACKAGE_SUBPATH));
    candidates.push(path.join(prefix, "node_modules", UPSTREAM_PACKAGE_SUBPATH));
  }
  return candidates;
}

function resolveUpstreamEntry(env = process.env) {
  for (const candidate of upstreamEntryCandidates(env, process.platform, os.homedir())) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // Last resort: a `codex-acp` reachable through ordinary node resolution.
  try {
    return createRequire(path.join(process.cwd(), "noop.js")).resolve(
      "@agentclientprotocol/codex-acp/dist/index.js",
    );
  } catch {
    return null;
  }
}

function log(message) {
  process.stderr.write(`pimia-codex-sandbox: ${message}\n`);
}

function wrapCodexStdin(child) {
  const stdin = child?.stdin;
  if (!stdin || typeof stdin.write !== "function") {
    log("codex app-server spawned without a writable stdin — network not granted");
    return;
  }

  const originalWrite = stdin.write.bind(stdin);
  let announced = false;
  let warnedUnrewritable = false;

  stdin.write = (chunk, encoding, callback) => {
    let cb = callback;
    let enc = encoding;
    if (typeof enc === "function") {
      cb = enc;
      enc = undefined;
    }

    let text = null;
    if (typeof chunk === "string") {
      text = chunk;
    } else if (Buffer.isBuffer(chunk)) {
      text = chunk.toString("utf8");
    }

    if (text !== null) {
      const rewritten = rewriteNdjsonChunk(text);
      if (rewritten) {
        if (rewritten.patched && !announced) {
          announced = true;
          log("granted outbound network to the workspace-write sandbox");
        }
        return originalWrite(rewritten.text, "utf8", cb);
      }
      if (!warnedUnrewritable) {
        warnedUnrewritable = true;
        log("unparseable frame to codex app-server — forwarded unchanged");
      }
    }

    return originalWrite(chunk, enc, cb);
  };
}

/**
 * Hook every child process the adapter starts, and wrap the stdin of the one
 * that is the Codex app-server.
 *
 * The hook goes on `ChildProcess.prototype.spawn` rather than the module's
 * `spawn` export: the upstream bundle does `import { spawn } from
 * "node:child_process"`, and an ESM named import is bound once at module
 * instantiation, so reassigning the module property afterwards would never be
 * seen. Every spawn path — `spawn`, `execFile`, `fork`, shell form — funnels
 * through this prototype method, so patching it catches them all regardless of
 * how the caller imported anything.
 */
function installSpawnHook() {
  const { ChildProcess } = childProcess;
  const originalSpawn = ChildProcess.prototype.spawn;
  ChildProcess.prototype.spawn = function spawn(options) {
    const result = originalSpawn.call(this, options);
    if (isCodexAppServerArgv(options?.args)) {
      wrapCodexStdin(this);
    }
    return result;
  };
}

async function main() {
  const { networkEnabled, upstreamMode } = resolveRequestedMode(process.env);
  if (networkEnabled) {
    process.env.INITIAL_AGENT_MODE = upstreamMode;
    installSpawnHook();
    log(`${PIMIA_NETWORK_MODE_ID}: workspace-write sandbox with outbound network`);
  }

  const entry = resolveUpstreamEntry();
  if (!entry) {
    log(
      "could not find @agentclientprotocol/codex-acp. Install it from the desktop " +
        "app (Agents → Codex), or set PIMIA_CODEX_ACP_ENTRY to its dist/index.js.",
    );
    process.exit(1);
  }

  // The upstream bundle starts the ACP server as an import side effect and owns
  // process lifetime from here — argv, stdio, and exit codes are all its own.
  await import(pathToFileURL(entry).href);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}
