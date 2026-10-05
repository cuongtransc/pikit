import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** alias name -> ordered, nested-expanded `provider/model` target refs. */
export type AliasChainMap = Map<string, string[]>;

interface AliasChainCache {
  path: string;
  mtimeMs: number;
  ctimeMs: number;
  size: number;
  mode: number;
  map: AliasChainMap;
}

let cache: AliasChainCache | null = null;

/** Path of the fallback-alias map, resolved the same way pi resolves its agent dir. */
export function getAliasMapPath(): string {
  return join(getAgentDir(), "model-alias.json");
}

/**
 * The producer's ref rule (`isModelRef` in the fallback extension): a string whose
 * first `/` is neither first nor last. Whitespace and further slashes are allowed.
 */
export function isModelRef(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const slash = value.indexOf("/");
  return slash > 0 && slash < value.length - 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function splitModelRef(ref: string): [string, string] {
  const slash = ref.indexOf("/");
  return [ref.slice(0, slash), ref.slice(slash + 1)];
}

/** Mirror `normalizeTargets`: a single ref or a non-empty array of refs. */
function normalizeTargets(value: unknown): string[] | null {
  const targets = typeof value === "string" ? [value] : value;
  if (!Array.isArray(targets) || targets.length === 0) return null;
  if (!targets.every((target) => isModelRef(target))) return null;
  return targets as string[];
}

/**
 * Mirror `parseRoleConfig`: a bare string/array of refs, or an object whose only
 * allowed keys are `targets`/`timeouts`/`cooldown` and which carries `targets`.
 * Returns null for a role the producer would reject.
 */
function parseRoleTargets(value: unknown): string[] | null {
  if (typeof value === "string" || Array.isArray(value)) return normalizeTargets(value);
  if (!isRecord(value)) return null;
  const validKeys = new Set(["targets", "timeouts", "cooldown"]);
  if (Object.keys(value).some((key) => !validKeys.has(key)) || !("targets" in value)) return null;
  return normalizeTargets(value.targets);
}

/**
 * Mirror `expandAlias` from the producer: replace `alias/<name>` refs with the
 * referenced role's expanded refs, in order, dropping unknown or cyclic nested
 * aliases and de-duplicating while preserving first-seen order.
 */
function expandAlias(role: string, aliases: Map<string, string[]>, path: string[]): string[] {
  const targets = aliases.get(role);
  if (!targets) return [];
  const expanded: string[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    const [providerId, nestedRole] = splitModelRef(target);
    if (providerId !== "alias") {
      appendUnique(expanded, seen, target);
      continue;
    }
    if (nestedRole === role || path.includes(nestedRole)) continue;
    if (!aliases.has(nestedRole)) continue;
    for (const nestedTarget of expandAlias(nestedRole, aliases, [...path, role])) {
      appendUnique(expanded, seen, nestedTarget);
    }
  }
  return expanded;
}

function appendUnique(targets: string[], seen: Set<string>, target: string): void {
  if (seen.has(target)) return;
  seen.add(target);
  targets.push(target);
}

/** Drop the memoized map (used by tests and HOME/PI_CODING_AGENT_DIR switches). */
export function clearAliasChainCache(): void {
  cache = null;
}

/**
 * Read the pi-model-fallback-alias map and expand its nested aliases the way the
 * producer does, so a served target can be compared against the actual chain.
 *
 * Entry forms mirror `fallback/config.ts`: a non-empty array of `<provider>/<model>`
 * refs, a single ref string, or an object `{ targets, timeouts, cooldown }`. A role
 * the producer would reject is skipped, never the whole map; `$settings`/`$defaults`
 * keys are configuration, not aliases. Returns null only when the file is missing,
 * unreadable, not a JSON object, or unparseable, so callers degrade to a plain arrow.
 *
 * A successful parse is memoized and re-read only when the file's mtime, ctime, size
 * or mode moves; a failed read is never memoized, so a transient failure or a fixed
 * permission recovers on the next render.
 */
export function loadAliasChains(path: string = getAliasMapPath()): AliasChainMap | null {
  let mtimeMs: number;
  let ctimeMs: number;
  let size: number;
  let mode: number;
  try {
    const stat = statSync(path);
    mtimeMs = stat.mtimeMs;
    ctimeMs = stat.ctimeMs;
    size = stat.size;
    mode = stat.mode;
  } catch {
    cache = null;
    return null;
  }

  if (
    cache &&
    cache.path === path &&
    cache.mtimeMs === mtimeMs &&
    cache.ctimeMs === ctimeMs &&
    cache.size === size &&
    cache.mode === mode
  ) {
    return cache.map;
  }

  let raw: Map<string, string[]> | null = null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (isRecord(parsed)) {
      raw = new Map();
      for (const [role, value] of Object.entries(parsed)) {
        if (role.startsWith("$")) continue;
        const targets = parseRoleTargets(value);
        // Skip only the odd role; the rest of the map still drives the marker.
        if (!targets) continue;
        raw.set(role, targets);
      }
    }
  } catch {
    raw = null;
  }

  // Never memoize a failure: its stat signature can be unchanged when the file
  // becomes readable again.
  if (!raw) {
    cache = null;
    return null;
  }

  const map: AliasChainMap = new Map();
  for (const role of raw.keys()) {
    map.set(role, expandAlias(role, raw, []));
  }

  cache = { path, mtimeMs, ctimeMs, size, mode, map };
  return map;
}
