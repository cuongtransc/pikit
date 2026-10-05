import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { visibleWidth } from "@earendil-works/pi-tui";

// Exercise the real Pi loader/jiti without changing the project's dev dependencies.
const piDir = process.env.PI_TEST_CODING_AGENT_DIR
  ? resolve(process.env.PI_TEST_CODING_AGENT_DIR)
  : dirname(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))));
const { loadExtensions } = await import(pathToFileURL(join(piDir, "dist/core/extensions/loader.js")));
const extensionPath = fileURLToPath(new URL("../agent/extensions/footer/index.ts", import.meta.url));
const statsConfig = {
  row1LeftSegments: ["token_in", "token_out", "cache_read", "cache_write", "cost", "thinking"],
  row1RightSegments: [], row2LeftSegments: ["context_pct", "context_total"], row2RightSegments: [],
};

function usage(input = 10) {
  return { input, output: 2, cacheRead: 3, cacheWrite: 4, totalTokens: input + 9,
    cost: { input: 0.04, output: 0.02, cacheRead: 0.02, cacheWrite: 0.02, total: 0.1 } };
}
function assistant(id, stopReason = "stop", input = 10) {
  return { type: "message", id, parentId: null, timestamp: new Date(0).toISOString(),
    message: { role: "assistant", content: [{ type: "text", text: "response" }],
      api: "openai-completions", provider: "fixture", model: "fixture", timestamp: 0,
      stopReason, usage: usage(input) } };
}

async function fixture(t, { config = statsConfig, entries = [assistant("a")], countAPI = true, statusAPI = true, ansiTheme = false, aliasMap = undefined } = {}) {
  const root = await mkdtemp(join(tmpdir(), "pikit-footer-"));
  const oldHome = process.env.HOME;
  process.env.HOME = root;
  t.after(async () => {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    await rm(root, { recursive: true, force: true });
  });
  const configPath = join(root, ".pi", "agent", "configs", "footer.json");
  await mkdir(dirname(configPath), { recursive: true });
  if (config !== null) await writeFile(configPath, JSON.stringify(config));
  const aliasPath = join(root, ".pi", "agent", "model-alias.json");
  if (aliasMap !== undefined) {
    await writeFile(aliasPath, typeof aliasMap === "string" ? aliasMap : JSON.stringify(aliasMap));
  }
  const state = {
    entries, branch: [assistant("active")], sessionId: "session-a", leafId: "leaf-a",
    thinking: "high", scans: 0, reads: 0, branchReads: 0, contextReads: 0,
    statuses: new Map(), themeCalls: [],
    context: { tokens: 800, contextWindow: 2000, percent: 40 },
  };
  const manager = {
    getSessionId: () => state.sessionId,
    getLeafId: () => state.leafId,
    getEntries: () => {
      state.reads++;
      // Iteration is the expensive aggregation; length is the older-API fallback.
      const copy = [...state.entries];
      copy[Symbol.iterator] = function* () { state.scans++; yield* state.entries; };
      return copy;
    },
    getBranch: () => { state.branchReads++; return state.branch; },
  };
  if (countAPI) manager.getEntryCount = () => state.entries.length;
  const loaded = await loadExtensions([extensionPath], root);
  assert.deepEqual(loaded.errors, []);
  loaded.runtime.getThinkingLevel = () => state.thinking;
  const theme = { fg: (name, text) => {
    state.themeCalls.push([name, text]);
    return ansiTheme ? `\x1b[38;5;8m${text}\x1b[0m` : text;
  } };
  let component;
  const ctx = {
    cwd: root, hasUI: true, mode: "tui", sessionManager: manager,
    model: { id: "virtual", name: "Virtual", provider: "fixture", reasoning: true, contextWindow: 1000000 },
    modelRegistry: { isUsingOAuth: () => false },
    getContextUsage: () => { state.contextReads++; return state.context; },
    ui: { setFooter: (factory) => {
      component = factory({ requestRender() {} }, theme,
        { getGitBranch: () => null, onBranchChange: () => () => {},
          ...(statusAPI ? { getExtensionStatuses: () => state.statuses } : {}) });
    } },
  };
  for (const handler of loaded.extensions[0].handlers.get("session_start")) {
    await handler({ type: "session_start", reason: "startup" }, ctx);
  }
  t.after(() => component?.dispose());
  return { state, ctx, root, configPath, aliasPath,
    emit: async (type, event, eventCtx = ctx) => {
      for (const handler of loaded.extensions[0].handlers.get(type) ?? []) await handler(event, eventCtx);
    },
    render: (width = 240, trim = true) => component.render(width)
      .map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""))
      .map((line) => trim ? line.trim() : line),
    rawRender: (width = 240) => component.render(width) };
}

for (const layout of ["default", "example"]) {
  test(`${layout} layout places context at bottom-left and token/cost stats at bottom-right`, async (t) => {
    const config = layout === "default" ? null : JSON.parse(await readFile(
      new URL("../agent/extensions/footer/footer.example.json", import.meta.url), "utf8"));
    const f = await fixture(t, { config });
    for (const width of [100, 120, 240]) {
      const lines = f.render(width, false);
      assert.equal(lines.length, 4);
      assert.match(lines[1], /Virtual \(fixture\)/);
      assert.doesNotMatch(lines[1], /40\.0%|2\.0k/);
      // The shipped example enables contextBar.compactLabel; the default layout keeps the window label.
      const contextLabel = layout === "example" ? "40%" : "40\\.0% \\/ 2\\.0k";
      assert.match(lines[3], new RegExp(`^ ▋{18} ${contextLabel} +T:`));
      assert.match(lines[3], /\$0\.10 $/);
      assert.equal(lines[3].length, width, "bottom row keeps both sides aligned");
    }
    for (const width of [20, 44, 80]) {
      assert.ok(f.render(width).every((line) => [...line].length <= width));
    }
  });
}

test("explicit context placement overrides the default layout", async (t) => {
  const f = await fixture(t, { config: { row1RightSegments: ["context_pct"], row2LeftSegments: [] } });
  assert.match(f.render()[1], /40\.0% \/ 2\.0k$/);
  assert.doesNotMatch(f.render()[3], /40\.0%|2\.0k/);
  assert.match(f.render()[3], /T:.*\$0\.10$/);
});

// Omitting any host accounting category (or walking nested usage a second time) breaks this total.
test("footer totals all entries including spent errors, abandoned branches and nested parent usage", async (t) => {
  const entries = [assistant("success"), assistant("failed", "error"), assistant("cancelled", "aborted"),
    { type: "message", message: { role: "toolResult", toolCallId: "call", toolName: "nested",
      content: [], details: {}, isError: false, timestamp: 0, usage: usage(),
      nestedCalls: { complete: true, calls: [{ id: "call/0", name: "child", arguments: {},
        status: "ok", durationMs: 1 }] } } },
    { type: "compaction", usage: usage() }, { type: "branch_summary", usage: usage() },
    { type: "usage", provider: "fixture", model: "fixture", usage: usage() },
    { type: "message", message: { role: "toolResult", content: [], isError: false } },
    { type: "custom", usage: usage(999) }];
  const f = await fixture(t, { entries });
  assert.equal(f.render()[1], "↑ 70 ↓ 14 21 28 $0.70 high");
});

test("unchanged renders skip history scans and use live thinking level", async (t) => {
  const f = await fixture(t);
  f.state.branch.push({ type: "thinking_level_change", thinkingLevel: "off" });
  assert.match(f.render()[1], /high$/);
  f.state.thinking = "low";
  assert.match(f.render()[1], /low$/);
  f.render();
  assert.equal(f.state.scans, 1);
  assert.equal(f.state.reads, 1, "getEntryCount avoids copying entries on cache hits");
  assert.equal(f.state.branchReads, 0, "footer must not rebuild active branch/thinking history");
  assert.equal(f.state.contextReads, 1, "canonical context accounting also scans history on the host");
});

test("partial session APIs do not suppress unrelated footer segments", async (t) => {
  const f = await fixture(t, { config: { ...statsConfig, row1LeftSegments: ["text:status ready"] } });
  f.ctx.sessionManager = { getBranch: () => [] };
  assert.equal(f.render()[1], "status ready");
});

test("older Pi getEntries length fallback avoids repeated aggregation", async (t) => {
  const f = await fixture(t, { countAPI: false });
  f.render(); f.render(); f.render();
  assert.equal(f.state.scans, 1);
  assert.equal(f.state.reads, 3);
  assert.equal(f.state.branchReads, 0);
  f.state.entries.push(assistant("new"));
  assert.match(f.render()[1], /^↑ 20 ↓ 4/);
  assert.equal(f.state.scans, 2);
});

test("cache invalidates on leaf, count, session ID and manager identity, not branch length", async (t) => {
  const f = await fixture(t);
  f.render();
  f.state.leafId = "leaf-b";
  f.render();
  assert.equal(f.state.scans, 2);
  f.state.entries.push(assistant("other-branch", "stop", 30));
  assert.match(f.render()[1], /^↑ 40 ↓ 4/);
  f.state.sessionId = "session-b";
  f.state.entries = [assistant("replacement", "stop", 50), assistant("replacement-2", "stop", 60)];
  assert.match(f.render()[1], /^↑ 110 ↓ 4/);
  f.ctx.sessionManager = { ...f.ctx.sessionManager };
  f.render();
  assert.equal(f.state.scans, 5);
});

test("context meter uses canonical percent and physical window, including model changes", async (t) => {
  const f = await fixture(t);
  assert.match(f.render()[3], /40\.0% \/ 2\.0k 2000$/);
  // Percent is authoritative even when it differs from tokens / window.
  f.state.context = { tokens: 100, contextWindow: 4000, percent: 12.5 };
  f.ctx.model = { ...f.ctx.model, id: "new-virtual" };
  assert.match(f.render()[3], /12\.5% \/ 4\.0k 4000$/);
  f.ctx.model.contextWindow = 500000;
  f.state.context = { tokens: 50, contextWindow: 500, percent: 10 };
  assert.match(f.render()[3], /10\.0% \/ 500 500$/);
});

test("virtual context cache follows live physical catalog replacement, mutation and removal", async (t) => {
  const f = await fixture(t);
  f.ctx.model = { ...f.ctx.model, api: "pi-virtual" };
  let physical = { id: "physical", provider: "fixture", contextWindow: 2000 };
  f.ctx.modelRegistry.getAll = () => physical ? [physical] : [];
  f.ctx.getContextUsage = () => {
    f.state.contextReads++;
    const contextWindow = physical?.contextWindow ?? 1000000;
    return { tokens: 800, contextWindow, percent: 800 / contextWindow * 100 };
  };
  assert.match(f.render()[3], /40\.0% \/ 2\.0k 2000$/);
  f.render();
  assert.equal(f.state.contextReads, 1);
  physical = { ...physical, contextWindow: 4000 };
  assert.match(f.render()[3], /20\.0% \/ 4\.0k 4000$/);
  physical.contextWindow = 8000;
  assert.match(f.render()[3], /10\.0% \/ 8\.0k 8000$/);
  physical = undefined;
  assert.match(f.render()[3], /0\.1% \/ 1\.0M 1000000$/);
});

test("finalized routed response refreshes physical context before message persistence", async (t) => {
  const f = await fixture(t);
  assert.match(f.render()[3], /40\.0% \/ 2\.0k 2000$/);
  // Host agent state (and routed limits) changes before message_end persistence;
  // selected virtual model, leaf and count still have their previous identities.
  f.state.context = { tokens: 800, contextWindow: 4000, percent: 20 };
  await f.emit("message_end", { type: "message_end", message: assistant("routed").message });
  assert.match(f.render()[3], /20\.0% \/ 4\.0k 4000$/);
  f.render();
  assert.equal(f.state.contextReads, 2, "unchanged frames remain cached after refresh");
});

for (const context of [
  { tokens: null, contextWindow: 2000, percent: null },
  { tokens: 800, contextWindow: 2000, percent: null },
  undefined,
]) {
  test(`context unknown stays unknown (${JSON.stringify(context)}) without hiding the footer`, async (t) => {
    const f = await fixture(t);
    f.state.context = context;
    const lines = f.render();
    assert.equal(lines.length, 4);
    assert.match(lines[3], /\?/);
    assert.doesNotMatch(lines[3], /(?:0\.0|40\.0)%/);
    assert.match(lines[1], /\$0\.10/);
  });
}

for (const initial of ["missing", "malformed"]) {
  test(`config caches ${initial} result until TTL expires`, async (t) => {
    let now = 10000;
    t.mock.method(Date, "now", () => now);
    const f = await fixture(t, { config: null });
    if (initial === "malformed") await writeFile(f.configPath, "{broken");
    assert.doesNotMatch(f.render().join("\n"), /NEW-CONFIG/);
    await writeFile(f.configPath, JSON.stringify({ ...statsConfig, row1LeftSegments: ["text:NEW-CONFIG"] }));
    now += 4999;
    assert.doesNotMatch(f.render().join("\n"), /NEW-CONFIG/);
    now += 1;
    assert.match(f.render().join("\n"), /NEW-CONFIG/);
  });
}

test("config cache follows HOME path identity before TTL expiration", async (t) => {
  const f = await fixture(t, { config: { ...statsConfig, row1LeftSegments: ["text:HOME-A"] } });
  assert.equal(f.render()[1], "HOME-A");
  const secondHome = join(f.root, "other-home");
  const configPath = join(secondHome, ".pi", "agent", "configs", "footer.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ ...statsConfig, row1LeftSegments: ["text:HOME-B"] }));
  process.env.HOME = secondHome;
  assert.equal(f.render()[1], "HOME-B");
  assert.ok(await readFile(configPath, "utf8"));
});

const modelConfig = { ...statsConfig, row1LeftSegments: ["model"], row2LeftSegments: [] };
function routed(id, provider = "physical-provider", model = "physical-model", thinkingLevel = "medium") {
  const entry = assistant(id);
  Object.assign(entry.message, { provider, model, thinkingLevel });
  return entry;
}
function selectedBranch(...responses) {
  return [{ type: "model_change", provider: "router", modelId: "virtual" }, ...responses];
}
function selectVirtual(f, id = "virtual") {
  f.ctx.model = { ...f.ctx.model, api: "pi-virtual", provider: "router", id, name: id };
}

// Reading allEntries here would show the abandoned route instead of the current branch.
test("virtual model shows current-branch physical provider/model and routed thinking, cached across frames", async (t) => {
  const f = await fixture(t, { config: modelConfig, entries: [routed("abandoned", "wrong", "abandoned", "max")] });
  selectVirtual(f);
  f.state.branch = selectedBranch(routed("active"));
  assert.equal(f.render()[1], "virtual (router) → physical-model (physical-provider) • medium");
  f.state.thinking = "low";
  f.render(); f.render();
  assert.equal(f.state.branchReads, 1, "route must reuse the session-stat cache");
  assert.equal(f.state.scans, 1);
});

test("virtual selection before a response and ordinary models keep concise selected-model UI", async (t) => {
  const f = await fixture(t, { config: modelConfig });
  f.state.branch = [];
  selectVirtual(f);
  assert.equal(f.render()[1], "virtual (router)");
  f.ctx.model = { ...f.ctx.model, api: "openai-completions", name: "Claude Sonnet", provider: "anthropic" };
  f.state.branch = [routed("old")];
  assert.equal(f.render()[1], "Sonnet (anthropic)");
});

test("virtual route follows branch, session and manager changes, including a branch without responses", async (t) => {
  const f = await fixture(t, { config: modelConfig });
  selectVirtual(f);
  f.state.branch = selectedBranch(routed("first"));
  assert.match(f.render()[1], /physical-model/);
  f.state.leafId = "other-leaf";
  f.state.branch = selectedBranch(routed("other", "other-provider", "other-model", "off"));
  assert.equal(f.render()[1], "virtual (router) → other-model (other-provider) • off");
  f.state.leafId = "empty-leaf";
  f.state.branch = [];
  assert.equal(f.render()[1], "virtual (router)");
  f.state.sessionId = "other-session";
  f.state.branch = selectedBranch(routed("session", "session-provider", "session-model", "high"));
  assert.match(f.render()[1], /session-model \(session-provider\) • high$/);
  f.ctx.sessionManager = { ...f.ctx.sessionManager, getBranch: () => [] };
  assert.equal(f.render()[1], "virtual (router)");
});

test("changing virtual selection hides previous route until that selection has a response", async (t) => {
  const f = await fixture(t, { config: modelConfig });
  selectVirtual(f);
  f.state.branch = selectedBranch(routed("old"));
  f.render();
  selectVirtual(f, "new-virtual");
  f.state.branch.push({ type: "model_change", provider: "router", modelId: "new-virtual" });
  f.state.leafId = "selection";
  await f.emit("model_select", { type: "model_select", model: f.ctx.model, source: "set" });
  assert.equal(f.render()[1], "new-virtual (router)");
  f.state.branch.push(routed("new", "new-provider", "new-model", "low"));
  f.state.entries.push(f.state.branch.at(-1));
  f.state.leafId = "response";
  assert.equal(f.render()[1], "new-virtual (router) → new-model (new-provider) • low");
});

test("tree navigation does not attribute a different virtual selection's response to the live selection", async (t) => {
  const { SessionManager } = await import(pathToFileURL(join(piDir, "dist/core/session-manager.js")));
  const f = await fixture(t, { config: modelConfig });
  const manager = SessionManager.inMemory(f.root);
  f.ctx.sessionManager = manager;
  manager.appendModelChange("router", "virtual-A");
  const responseA = manager.appendMessage(routed("a", "physical", "physical-A").message);
  selectVirtual(f, "virtual-A");
  assert.equal(f.render()[1], "virtual-A (router) → physical-A (physical) • medium");
  manager.appendModelChange("router", "virtual-B");
  selectVirtual(f, "virtual-B");
  assert.equal(f.render()[1], "virtual-B (router)");
  manager.branch(responseA);
  await f.emit("session_tree", { type: "session_tree", newLeafId: responseA });
  assert.equal(f.render()[1], "virtual-B (router)", "tree navigation preserves B's live selection, not A's recorded one");
  manager.appendModelChange("router", "virtual-B");
  manager.appendMessage(routed("b", "physical", "physical-B", "low").message);
  assert.equal(f.render()[1], "virtual-B (router) → physical-B (physical) • low");
  f.ctx.model = { ...f.ctx.model, provider: "another-router" };
  assert.equal(f.render()[1], "virtual-B (another-router)", "a different provider with the same model id is a different selection");
});

test("session tree and selection events refresh the footer context rather than retaining an old selection", async (t) => {
  const f = await fixture(t, { config: modelConfig });
  selectVirtual(f);
  f.state.branch = selectedBranch(routed("first"));
  f.render();
  const treeCtx = { ...f.ctx, model: { ...f.ctx.model, api: "openai-completions", id: "tree-model", name: "Tree Model" } };
  await f.emit("session_tree", { type: "session_tree", newLeafId: "tree-leaf", oldLeafId: "leaf-a" }, treeCtx);
  assert.equal(f.render()[1], "Tree Model (router)");
  const selectCtx = { ...treeCtx, model: { ...treeCtx.model, name: "Selected Model", id: "selected" } };
  await f.emit("model_select", { type: "model_select", model: selectCtx.model, source: "cycle" }, selectCtx);
  assert.equal(f.render()[1], "Selected Model (router)");
});

test("physical response without recorded thinking does not borrow selected thinking", async (t) => {
  const f = await fixture(t, { config: modelConfig });
  selectVirtual(f);
  f.state.branch = selectedBranch(routed("no-level"));
  delete f.state.branch[1].message.thinkingLevel;
  assert.equal(f.render()[1], "virtual (router) → physical-model (physical-provider)");
});

test("physical history without a recorded virtual selection cannot prove a route", async (t) => {
  const f = await fixture(t, { config: modelConfig });
  selectVirtual(f);
  f.state.branch = [routed("old-physical")];
  assert.equal(f.render()[1], "virtual (router)");
});

test("virtual footer remains width-bounded on narrow terminals", async (t) => {
  const f = await fixture(t, { config: modelConfig });
  selectVirtual(f);
  f.state.branch = selectedBranch(routed("active"));
  for (const width of [20, 44, 80]) {
    const lines = f.render(width);
    assert.equal(lines.length, 4);
    assert.ok(lines.every((line) => [...line].length <= width));
  }
});

// ── Model alias target ──────────────────────────────────────────────────────
const aliasConfig = { ...statsConfig, row1LeftSegments: ["model"], row2LeftSegments: [] };
const aliasRightConfig = { ...statsConfig, row1LeftSegments: ["model"], row1RightSegments: ["text:RIGHT-ANCHOR"],
  row2LeftSegments: [], row2RightSegments: [] };
function selectAlias(f, name = "implementer-medium") {
  f.ctx.model = { id: name, name, provider: "alias", reasoning: true, contextWindow: 1000000 };
}
const ANSI_MUTED = "\x1b[38;5;8m";
const ANSI_WARNING = "\x1b[33m";
const ANSI_RESET = "\x1b[39m";
const themedStatus = (target, cooldown) =>
  `${ANSI_MUTED}${target}${ANSI_RESET}${cooldown ? ` \u00b7 ${ANSI_WARNING}${cooldown}${ANSI_RESET}` : ""}`;

test("alias footer shows the resolved target model from the model-alias status", async (t) => {
  const f = await fixture(t, { config: aliasConfig });
  selectAlias(f);
  f.state.statuses.set("model-alias", "opencode-go/deepseek-v4.1-flash");
  assert.equal(f.render()[1], "implementer-medium \u2192 deepseek-v4.1-flash");
});

test("alias footer strips ANSI status colours and appends a dimmed cooldown", async (t) => {
  const f = await fixture(t, { config: aliasConfig });
  selectAlias(f);
  f.state.statuses.set("model-alias", themedStatus("opencode-go/deepseek-v4.1-flash", "cooldown: openai-codex/gpt-6-luna 5m"));
  assert.equal(f.render()[1], "implementer-medium \u2192 deepseek-v4.1-flash \u00b7 cooldown: openai-codex/gpt-6-luna 5m");
  assert.ok(f.state.themeCalls.some(([name, text]) => name === "dim" &&
    text === "· cooldown: openai-codex/gpt-6-luna 5m"));
});

test("alias footer drops only the provider segment of a multi-slash target", async (t) => {
  const f = await fixture(t, { config: aliasConfig });
  selectAlias(f);
  f.state.statuses.set("model-alias", "openrouter/meta-llama/llama-3.3-70b");
  assert.equal(f.render()[1], "implementer-medium \u2192 meta-llama/llama-3.3-70b");
});

test("alias footer truncates the target and cooldown to the available width", async (t) => {
  const f = await fixture(t, { config: aliasConfig });
  selectAlias(f);
  f.state.statuses.set("model-alias", themedStatus("opencode-go/deepseek-v4.1-flash", "cooldown: openai-codex/gpt-6-luna 5m"));
  for (const width of [24, 40, 80]) {
    const lines = f.render(width);
    assert.equal(lines.length, 4);
    assert.ok(lines.every((line) => [...line].length <= width), `width ${width}`);
  }
  const narrow = f.render(40)[1];
  assert.match(narrow, /implementer-medium \u2192 deepseek/);
  assert.doesNotMatch(narrow, /gpt-6-luna/);
  assert.match(narrow, /\.\.\.$/);
});

test("alias footer stays width-bounded when the theme emits ANSI styling", async (t) => {
  const f = await fixture(t, { config: aliasConfig, ansiTheme: true });
  selectAlias(f);
  f.state.statuses.set("model-alias", themedStatus("opencode-go/deepseek-v4.1-flash", "cooldown: openai-codex/gpt-6-luna 5m"));
  for (const width of [24, 40, 80]) {
    const lines = f.rawRender(width);
    assert.equal(lines.length, 4);
    assert.ok(lines.every((line) => visibleWidth(line) <= width), `width ${width}`);
  }
  assert.ok(f.rawRender(80).some((line) => line.includes("\x1b[")), "styled output carries ANSI escapes");
});

test("alias footer keeps right-side segments and width bounds under a long target", async (t) => {
  const f = await fixture(t, { config: aliasRightConfig, ansiTheme: true });
  selectAlias(f);
  f.state.statuses.set("model-alias", themedStatus("opencode-go/deepseek-v4.1-flash", "cooldown: openai-codex/gpt-6-luna 5m"));
  for (const width of [40, 60, 80, 120]) {
    const lines = f.rawRender(width);
    assert.equal(lines.length, 4);
    assert.ok(lines.every((line) => visibleWidth(line) <= width), `width ${width}`);
    const row1 = lines[1].replace(/\x1b\[[0-9;]*m/g, "");
    assert.match(row1, /RIGHT-ANCHOR/, `right side preserved at width ${width}`);
  }
  for (const width of [60, 80, 120]) {
    const row1 = f.rawRender(width)[1].replace(/\x1b\[[0-9;]*m/g, "");
    assert.match(row1, /\u2192 deepseek-v4\.1-flash/, `alias target retained at width ${width}`);
  }
});

// Pins the producer contract this parser depends on:
// `<provider/model> · cooldown: <ref> <n>m, <ref> <n>m` (see
// pi-model-fallback-alias/src/status/status.ts formatFooterStatus).
test("alias footer parses the producer's provider/model \u00b7 cooldown format", async (t) => {
  const f = await fixture(t, { config: aliasConfig });
  selectAlias(f);
  f.state.statuses.set("model-alias", "opencode-go/deepseek-v4.1-flash \u00b7 cooldown: openai-codex/gpt-6-luna 5m, other-provider/other-model 12m");
  assert.equal(f.render()[1], "implementer-medium \u2192 deepseek-v4.1-flash \u00b7 cooldown: openai-codex/gpt-6-luna 5m, other-provider/other-model 12m");
});

test("alias without a published status keeps the plain (alias) provider text", async (t) => {
  const f = await fixture(t, { config: aliasConfig });
  selectAlias(f);
  assert.equal(f.render()[1], "implementer-medium (alias)");
  f.state.statuses.set("model-alias", "");
  assert.equal(f.render()[1], "implementer-medium (alias)");
  f.state.statuses.set("model-alias", "cooldown: openai-codex/gpt-6-luna 5m");
  assert.equal(f.render()[1], "implementer-medium (alias)");
});

test("alias footer tolerates hosts without an extension status API", async (t) => {
  const f = await fixture(t, { config: aliasConfig, statusAPI: false });
  selectAlias(f);
  f.state.statuses.set("model-alias", "opencode-go/deepseek-v4.1-flash");
  assert.equal(f.render()[1], "implementer-medium (alias)");
});

test("non-alias models ignore the model-alias status", async (t) => {
  const f = await fixture(t, { config: aliasConfig });
  f.ctx.model = { ...f.ctx.model, id: "sonnet", name: "Sonnet", provider: "anthropic" };
  f.state.statuses.set("model-alias", "opencode-go/deepseek-v4.1-flash");
  assert.equal(f.render()[1], "Sonnet (anthropic)");
});

test("alias footer re-reads the status on each render", async (t) => {
  const f = await fixture(t, { config: aliasConfig });
  selectAlias(f);
  f.state.statuses.set("model-alias", "opencode-go/deepseek-v4.1-flash");
  assert.match(f.render()[1], /deepseek-v4\.1-flash/);
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-luna");
  assert.equal(f.render()[1], "implementer-medium \u2192 gpt-6-luna");
  f.state.statuses.delete("model-alias");
  assert.equal(f.render()[1], "implementer-medium (alias)");
});

// ── Short alias labels, fallback marker and compact options ──────────────────
const shortLabelConfig = {
  ...statsConfig,
  row1LeftSegments: ["model"],
  row2LeftSegments: [],
  segmentOptions: {
    model: {
      aliasLabels: {
        "implementer-medium": "impl", "implementer-high": "impl+", "reviewer-medium": "rev",
        "reviewer-high": "rev+", "mid-model": "mid", "high-model": "high",
        scout: "scout", planner: "plan", main: "main",
      },
    },
  },
};
const fallbackChain = {
  "implementer-medium": [
    "opencode-go/deepseek-v4.1-flash",
    "openai-codex/gpt-6-sol",
    "openai-codex/gpt-6-luna",
  ],
};

test("short alias labels render a compact label with no arrow spaces", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig, aliasMap: fallbackChain });
  selectAlias(f);
  f.state.statuses.set("model-alias", "opencode-go/deepseek-v4.1-flash");
  assert.equal(f.render()[1], "impl\u2192deepseek-v4.1-flash");
});

test("an alias missing from aliasLabels keeps its full name", async (t) => {
  const f = await fixture(t, { config: { ...statsConfig, row1LeftSegments: ["model"], row2LeftSegments: [],
    segmentOptions: { model: { aliasLabels: { scout: "scout" } } } }, aliasMap: fallbackChain });
  selectAlias(f);
  f.state.statuses.set("model-alias", "opencode-go/deepseek-v4.1-flash");
  assert.equal(f.render()[1], "implementer-medium\u2192deepseek-v4.1-flash");
});

test("a served target that is not the chain head renders \u2193 in the warning colour", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig, aliasMap: fallbackChain });
  selectAlias(f);
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.equal(f.render()[1], "impl\u2193gpt-6-sol");
  assert.ok(f.state.themeCalls.some(([name, text]) => name === "warning" && text === "gpt-6-sol"),
    "fallback target uses the warning colour");
  f.state.themeCalls.length = 0;
  f.state.statuses.set("model-alias", "opencode-go/deepseek-v4.1-flash");
  assert.equal(f.render()[1], "impl\u2192deepseek-v4.1-flash");
  assert.ok(!f.state.themeCalls.some(([name]) => name === "warning"), "the chain head is not a fallback");
});

test("a target absent from a readable chain keeps the plain arrow", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig,
    aliasMap: { "implementer-medium": ["opencode-go/other-model"] } });
  selectAlias(f);
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.equal(f.render()[1], "impl\u2192gpt-6-sol");
});

test("a missing or unreadable alias map falls back to the plain arrow", async (t) => {
  const noMap = await fixture(t, { config: shortLabelConfig });
  selectAlias(noMap);
  noMap.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.equal(noMap.render()[1], "impl\u2192gpt-6-sol");
  assert.ok(!noMap.state.themeCalls.some(([name]) => name === "warning"));

  const broken = await fixture(t, { config: shortLabelConfig, aliasMap: "{ broken json" });
  selectAlias(broken);
  broken.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.equal(broken.render()[1], "impl\u2192gpt-6-sol");
});

test("the fallback marker follows map changes after the first read", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig,
    aliasMap: { "implementer-medium": ["opencode-go/deepseek-v4.1-flash"] } });
  selectAlias(f);
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.equal(f.render()[1], "impl\u2192gpt-6-sol");
  await writeFile(f.aliasPath, JSON.stringify(fallbackChain));
  assert.equal(f.render()[1], "impl\u2193gpt-6-sol");
});

// ── Producer map forms, nested expansion and cache recovery ──────────────────
test("an object-form alias entry with targets is accepted", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig, aliasMap: {
    "implementer-medium": {
      targets: ["opencode-go/deepseek-v4.1-flash", "openai-codex/gpt-6-sol"],
      timeouts: { firstEventMs: 1000 },
      cooldown: { baseMs: 60000 },
    },
  } });
  selectAlias(f);
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.equal(f.render()[1], "impl\u2193gpt-6-sol");
});

test("a single-string alias entry is accepted", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig, aliasMap: {
    "implementer-medium": "opencode-go/deepseek-v4.1-flash",
  } });
  selectAlias(f);
  f.state.statuses.set("model-alias", "opencode-go/deepseek-v4.1-flash");
  assert.equal(f.render()[1], "impl\u2192deepseek-v4.1-flash");
});

test("one rejected alias entry does not disable the others", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig, aliasMap: {
    "implementer-medium": ["opencode-go/deepseek-v4.1-flash", "openai-codex/gpt-6-sol"],
    scout: { bad: "shape" },
    "reviewer-medium": 42,
  } });
  selectAlias(f);
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.equal(f.render()[1], "impl\u2193gpt-6-sol");
});

test("nested alias refs are expanded before comparing the served target", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig, aliasMap: {
    base: ["opencode-go/a1", "openai-codex/a2"],
    "implementer-medium": ["alias/base", "openai-codex/gpt-6-sol"],
  } });
  selectAlias(f);
  f.state.statuses.set("model-alias", "opencode-go/a1");
  assert.equal(f.render()[1], "impl\u2192a1", "the expanded head is not a fallback");
  f.state.statuses.set("model-alias", "openai-codex/a2");
  assert.equal(f.render()[1], "impl\u2193a2", "a shadowed nested target is a fallback");
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.equal(f.render()[1], "impl\u2193gpt-6-sol");
});

test("a dropped nested alias makes the next ref the head", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig, aliasMap: {
    "implementer-medium": ["alias/missing", "openai-codex/gpt-6-sol"],
  } });
  selectAlias(f);
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.equal(f.render()[1], "impl\u2192gpt-6-sol");
});

test("the served provider disambiguates a model id shared by two chain refs", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig, aliasMap: {
    "implementer-medium": ["provider-one/shared", "provider-two/shared"],
  } });
  selectAlias(f);
  f.state.statuses.set("model-alias", "provider-one/shared");
  assert.equal(f.render()[1], "impl\u2192shared");
  f.state.statuses.set("model-alias", "provider-two/shared");
  assert.equal(f.render()[1], "impl\u2193shared");
});

test("the cache recovers after a malformed map is fixed", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig, aliasMap: "{ broken json" });
  selectAlias(f);
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.equal(f.render()[1], "impl\u2192gpt-6-sol");
  await writeFile(f.aliasPath, JSON.stringify(fallbackChain));
  assert.equal(f.render()[1], "impl\u2193gpt-6-sol");
});

test("a same-size rewrite with an unchanged mtime is still picked up", async (t) => {
  const v1 = '{"implementer-medium":["p/aa","x/bb"]}';
  const v2 = '{"implementer-medium":["x/bb","p/aa"]}';
  assert.equal(v1.length, v2.length, "fixture must be a same-size rewrite");
  const f = await fixture(t, { config: shortLabelConfig, aliasMap: v1 });
  selectAlias(f);
  f.state.statuses.set("model-alias", "x/bb");
  assert.equal(f.render()[1], "impl\u2193bb");
  const before = await stat(f.aliasPath);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await writeFile(f.aliasPath, v2);
  // Restore the exact mtime (fractional seconds) so only ctime can signal the rewrite.
  await utimes(f.aliasPath, before.atimeMs / 1000, before.mtimeMs / 1000);
  assert.equal(f.render()[1], "impl\u2192bb", "the reordered chain is a cache miss");
});

test("compact alias rendering stays width-bounded on narrow terminals", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig, aliasMap: fallbackChain, ansiTheme: true });
  selectAlias(f);
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-luna");
  for (const width of [8, 12, 24, 40]) {
    const lines = f.rawRender(width);
    assert.equal(lines.length, 4);
    assert.ok(lines.every((line) => visibleWidth(line) <= width), `width ${width}`);
  }
});

test("a malformed chain ref leaves the plain arrow", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig,
    aliasMap: { "implementer-medium": ["NOT-A-REF", "openai-codex/gpt-6-sol"] } });
  selectAlias(f);
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.equal(f.render()[1], "impl\u2192gpt-6-sol");
});

test("a ref the producer accepts (whitespace provider) is not treated as malformed", async (t) => {
  const f = await fixture(t, { config: shortLabelConfig,
    aliasMap: { "implementer-medium": ["my prov/model", "other/fb"] } });
  selectAlias(f);
  f.state.statuses.set("model-alias", "other/fb");
  assert.equal(f.render()[1], "impl\u2193fb");
});

test("an alias named like an Object property keeps its full name", async (t) => {
  const f = await fixture(t, { config: { ...statsConfig, row1LeftSegments: ["model"], row2LeftSegments: [],
    segmentOptions: { model: { aliasLabels: {} } } }, aliasMap: { constructor: ["p/head", "p/fallback"] } });
  selectAlias(f, "constructor");
  f.state.statuses.set("model-alias", "p/head");
  assert.equal(f.render()[1], "constructor\u2192head");
});

const compactThinkingConfig = {
  ...statsConfig,
  row1LeftSegments: ["text:\u26a1", "thinking"],
  row2LeftSegments: [],
  segmentOptions: { model: { compactThinking: true } },
};

test("compactThinking joins the \u26a1 marker to the thinking level", async (t) => {
  const f = await fixture(t, { config: compactThinkingConfig });
  f.state.thinking = "low";
  assert.equal(f.render()[1], "\u26a1low");
});

test("compactThinking joins the \u26a1 marker on a right-side row", async (t) => {
  const f = await fixture(t, { config: { ...statsConfig, row1LeftSegments: ["text:LEFT"],
    row1RightSegments: ["text:\u26a1", "thinking"], row2LeftSegments: [], row2RightSegments: [],
    segmentOptions: { model: { compactThinking: true } } } });
  f.state.thinking = "low";
  const row1 = f.render()[1];
  assert.match(row1, /\u26a1low$/);
  assert.doesNotMatch(row1, /\u26a1 low/);
});

test("thinking keeps its space when compactThinking is off", async (t) => {
  const f = await fixture(t, { config: { ...statsConfig,
    row1LeftSegments: ["text:\u26a1", "thinking"], row2LeftSegments: [] } });
  f.state.thinking = "low";
  assert.equal(f.render()[1], "\u26a1 low");
});

const compactContextConfig = {
  ...statsConfig,
  row1LeftSegments: [],
  row2LeftSegments: ["context_pct"],
  row2RightSegments: [],
  segmentOptions: { contextBar: { barWidth: 6, compactLabel: true } },
};

test("compactLabel renders a rounded percent without the context window", async (t) => {
  const f = await fixture(t, { config: compactContextConfig });
  f.state.context = { tokens: 240, contextWindow: 1000000, percent: 24.3 };
  assert.equal(f.render()[3], "\u258b\u258b\u258b\u258b\u258b\u258b 24%");
  f.state.leafId = "leaf-compact";
  f.state.context = { tokens: 125, contextWindow: 1000, percent: 12.5 };
  assert.equal(f.render()[3], "\u258b\u258b\u258b\u258b\u258b\u258b 13%");
});

test("context label keeps its decimal percent and window by default", async (t) => {
  const f = await fixture(t, { config: { ...statsConfig, row1LeftSegments: [], row2LeftSegments: ["context_pct"],
    row2RightSegments: [], segmentOptions: { contextBar: { barWidth: 6 } } } });
  f.state.context = { tokens: 240, contextWindow: 1000000, percent: 24.3 };
  assert.equal(f.render()[3], "\u258b\u258b\u258b\u258b\u258b\u258b 24.3% / 1.0M");
});

// The approved single-row look, exercised end to end through the real extension.
test("approved compact layout renders short label, fallback marker, glued thinking and compact context", async (t) => {
  const f = await fixture(t, {
    config: {
      row1LeftSegments: ["pi", "model", "text:\u26a1", "thinking", "separator", "context_pct", "separator", "cost"],
      row1RightSegments: [], row2LeftSegments: [], row2RightSegments: [],
      segmentOptions: {
        model: { aliasLabels: { "implementer-medium": "impl" }, compactThinking: true },
        contextBar: { barWidth: 6, compactLabel: true },
      },
    },
    aliasMap: fallbackChain,
  });
  selectAlias(f);
  f.state.thinking = "low";
  f.state.context = { tokens: 240, contextWindow: 1000000, percent: 24.3 };
  f.state.statuses.set("model-alias", "opencode-go/deepseek-v4.1-flash");
  assert.match(f.render()[1], /impl\u2192deepseek-v4\.1-flash \u26a1low \| \u258b{6} 24% \| \$0\.10$/);
  f.state.statuses.set("model-alias", "openai-codex/gpt-6-sol");
  assert.match(f.render()[1], /impl\u2193gpt-6-sol \u26a1low \| \u258b{6} 24% \| \$0\.10$/);
});
