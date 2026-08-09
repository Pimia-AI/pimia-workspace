import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyNetworkAccess,
  isCodexAppServerArgv,
  managedDataDir,
  PIMIA_NETWORK_MODE_ID,
  resolveRequestedMode,
  rewriteNdjsonChunk,
  UPSTREAM_BASE_MODE_ID,
  upstreamEntryCandidates,
} from "./codex-acp-shim.mjs";

function turnStart(sandboxPolicy) {
  return {
    id: 7,
    method: "turn/start",
    params: { threadId: "t1", input: [], sandboxPolicy },
  };
}

const workspaceWrite = () => ({
  type: "workspaceWrite",
  writableRoots: [],
  networkAccess: false,
  excludeTmpdirEnvVar: false,
  excludeSlashTmp: false,
});

test("the Pimia mode id is claimed and translated to upstream's workspaceWrite preset", () => {
  assert.deepEqual(resolveRequestedMode({ INITIAL_AGENT_MODE: PIMIA_NETWORK_MODE_ID }), {
    networkEnabled: true,
    upstreamMode: UPSTREAM_BASE_MODE_ID,
  });
});

test("every other mode is passed through untouched and disables rewriting", () => {
  for (const mode of ["agent", "read-only", "agent-full-access", undefined]) {
    assert.deepEqual(resolveRequestedMode({ INITIAL_AGENT_MODE: mode }), {
      networkEnabled: false,
      upstreamMode: mode,
    });
  }
});

test("a workspace-write policy gains network access", () => {
  const message = turnStart(workspaceWrite());
  assert.equal(applyNetworkAccess(message), true);
  assert.equal(message.params.sandboxPolicy.networkAccess, true);
  // Confinement is untouched — only the network flag moves.
  assert.equal(message.params.sandboxPolicy.type, "workspaceWrite");
  assert.deepEqual(message.params.sandboxPolicy.writableRoots, []);
});

test("read-only and full-access policies are never widened", () => {
  const readOnly = turnStart({ type: "readOnly", networkAccess: false });
  assert.equal(applyNetworkAccess(readOnly), false);
  assert.equal(readOnly.params.sandboxPolicy.networkAccess, false);

  const fullAccess = turnStart({ type: "dangerFullAccess" });
  assert.equal(applyNetworkAccess(fullAccess), false);
  assert.deepEqual(fullAccess.params.sandboxPolicy, { type: "dangerFullAccess" });
});

test("messages without a sandbox policy are left alone", () => {
  for (const message of [
    {},
    { method: "initialize" },
    { method: "x", params: null },
    { method: "x", params: { sandboxPolicy: "workspaceWrite" } },
    { method: "x", params: { sandboxPolicy: ["workspaceWrite"] } },
  ]) {
    assert.equal(applyNetworkAccess(message), false);
  }
});

test("an already-granted policy reports no change", () => {
  const message = turnStart({ ...workspaceWrite(), networkAccess: true });
  assert.equal(applyNetworkAccess(message), false);
});

test("a whole frame is rewritten and stays newline delimited", () => {
  const chunk = `${JSON.stringify(turnStart(workspaceWrite()))}\n`;
  const result = rewriteNdjsonChunk(chunk);
  assert.equal(result.patched, true);
  assert.ok(result.text.endsWith("\n"));
  assert.equal(result.text.split("\n").filter(Boolean).length, 1);
  assert.equal(JSON.parse(result.text).params.sandboxPolicy.networkAccess, true);
});

test("several frames in one chunk are each considered", () => {
  const chunk = [
    JSON.stringify({ id: 1, method: "initialize", params: {} }),
    JSON.stringify(turnStart(workspaceWrite())),
    JSON.stringify(turnStart({ type: "readOnly", networkAccess: false })),
  ]
    .map((line) => `${line}\n`)
    .join("");

  const result = rewriteNdjsonChunk(chunk);
  assert.equal(result.patched, true);
  const messages = result.text.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(messages.length, 3);
  assert.equal(messages[0].method, "initialize");
  assert.equal(messages[1].params.sandboxPolicy.networkAccess, true);
  assert.equal(messages[2].params.sandboxPolicy.networkAccess, false);
});

test("a chunk with nothing to patch reports no change", () => {
  const chunk = `${JSON.stringify({ id: 1, method: "initialize", params: {} })}\n`;
  const result = rewriteNdjsonChunk(chunk);
  assert.equal(result.patched, false);
  assert.equal(result.text, chunk);
});

test("partial and unparseable chunks refuse rewriting so the caller forwards them verbatim", () => {
  assert.equal(rewriteNdjsonChunk('{"id":1,"method":"turn/start"'), null);
  assert.equal(rewriteNdjsonChunk(`${JSON.stringify(turnStart(workspaceWrite()))}`), null);
  assert.equal(rewriteNdjsonChunk("not json at all\n"), null);
});

test("blank lines between frames survive", () => {
  const chunk = `\n${JSON.stringify(turnStart(workspaceWrite()))}\n`;
  const result = rewriteNdjsonChunk(chunk);
  assert.equal(result.patched, true);
  assert.ok(result.text.startsWith("\n"));
});

test("only the codex app-server spawn is recognised", () => {
  // argv as ChildProcess.prototype.spawn sees it: argv[0] included.
  assert.equal(isCodexAppServerArgv(["/usr/local/bin/codex", "app-server"]), true);
  assert.equal(
    isCodexAppServerArgv(["/path/to/node", "/pkg/bin/codex.js", "app-server"]),
    true,
  );
  assert.equal(
    isCodexAppServerArgv(["cmd.exe", "/d", "/s", "/c", '"C:\\codex.exe" app-server']),
    true,
  );

  // Other children the adapter spawns must stay untouched.
  assert.equal(isCodexAppServerArgv(["buzz", "messages", "send"]), false);
  assert.equal(isCodexAppServerArgv(["/usr/local/bin/codex", "login"]), false);
  assert.equal(isCodexAppServerArgv(["/opt/app-server-tools/bin/helper"]), false);
  assert.equal(isCodexAppServerArgv(undefined), false);
});

test("the managed data dir matches Rust's dirs::data_dir per platform", () => {
  assert.equal(
    managedDataDir({}, "darwin", "/Users/x"),
    path.join("/Users/x", "Library", "Application Support"),
  );
  assert.equal(managedDataDir({ APPDATA: "C:\\Roaming" }, "win32", "C:\\Users\\x"), "C:\\Roaming");
  assert.equal(managedDataDir({}, "linux", "/home/x"), path.join("/home/x", ".local", "share"));
  assert.equal(
    managedDataDir({ XDG_DATA_HOME: "/custom/data" }, "linux", "/home/x"),
    "/custom/data",
  );
});

test("an explicit entry override is tried before the managed npm prefix", () => {
  const candidates = upstreamEntryCandidates(
    { PIMIA_CODEX_ACP_ENTRY: "/tmp/custom/index.js" },
    "darwin",
    "/Users/x",
  );
  assert.equal(candidates[0], "/tmp/custom/index.js");
  assert.ok(
    candidates
      .slice(1)
      .some((candidate) => candidate.includes(path.join("Buzz", "node-tools"))),
  );
});

test("both npm global layouts are offered", () => {
  const candidates = upstreamEntryCandidates({}, "darwin", "/Users/x");
  assert.ok(candidates.some((c) => c.includes(path.join("node-tools", "lib", "node_modules"))));
  assert.ok(candidates.some((c) => c.includes(path.join("node-tools", "node_modules"))));
});

// ── End-to-end: the spawn hook, exercised through a real child process ───────
//
// The pure functions above cannot show that the hook is actually installed on
// the adapter's Codex child. These tests stand in a fake adapter (which spawns
// a child exactly the way upstream does) and a fake app-server (which records
// what reached its stdin), then assert on what crossed the wire.

const SHIM = fileURLToPath(new URL("./codex-acp-shim.mjs", import.meta.url));

function buildFixture({ mode }) {
  const dir = mkdtempSync(path.join(tmpdir(), "codex-sandbox-"));
  const received = path.join(dir, "received.ndjson");
  const fakeCodex = path.join(dir, "fake-codex.mjs");
  const fakeAdapter = path.join(dir, "fake-adapter.mjs");

  writeFileSync(
    fakeCodex,
    `import fs from "node:fs";
let buf = "";
process.stdin.on("data", (chunk) => { buf += chunk.toString(); });
process.stdin.on("end", () => { fs.writeFileSync(${JSON.stringify(received)}, buf); });
`,
  );

  // Mirrors upstream's startCodexConnection: spawn(execPath, [codexJs, "app-server"]).
  writeFileSync(
    fakeAdapter,
    `import { spawn } from "node:child_process";
const child = spawn(process.execPath, [${JSON.stringify(fakeCodex)}, "app-server"]);
const frame = {
  id: 1,
  method: "turn/start",
  params: {
    threadId: "t1",
    approvalPolicy: "on-request",
    sandboxPolicy: { type: "workspaceWrite", writableRoots: [], networkAccess: false },
  },
};
child.stdin.write(JSON.stringify(frame) + "\\n");
child.stdin.end();
await new Promise((resolve) => child.on("exit", resolve));
`,
  );

  const env = { ...process.env, PIMIA_CODEX_ACP_ENTRY: fakeAdapter };
  if (mode === undefined) {
    delete env.INITIAL_AGENT_MODE;
  } else {
    env.INITIAL_AGENT_MODE = mode;
  }
  execFileSync(process.execPath, [SHIM], { env, stdio: "pipe" });

  return JSON.parse(readFileSync(received, "utf8").trim());
}

test("end to end: the Pimia mode grants network on the frame the app-server receives", () => {
  const frame = buildFixture({ mode: PIMIA_NETWORK_MODE_ID });
  assert.equal(frame.params.sandboxPolicy.networkAccess, true);
  // The sandbox itself is unchanged — this is not full access by another name.
  assert.equal(frame.params.sandboxPolicy.type, "workspaceWrite");
  assert.equal(frame.params.approvalPolicy, "on-request");
});

test("end to end: without the Pimia mode the frame crosses the wire untouched", () => {
  for (const mode of [undefined, "agent", "agent-full-access"]) {
    const frame = buildFixture({ mode });
    assert.equal(frame.params.sandboxPolicy.networkAccess, false);
  }
});
