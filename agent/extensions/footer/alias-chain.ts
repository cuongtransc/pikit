import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** alias name -> ordered `provider/model` target refs. */
export type AliasChainMap = Map<string, string[]>;

interface AliasChainCache {
  path: string;
  mtimeMs: number;
  size: number;
  mode: number;
  map: AliasChainMap;
}

/** A chain entry the producer would accept: `<provider>/<model>`. */
const CHAIN_REF = /^[^/\s]+\/.+$/;

let cache: AliasChainCache | null = null;

/** Path of the fallback-alias map, resolved the same way pi resolves its agent dir. */
export function getAliasMapPath(): string {
  return join(getAgentDir(), "model-alias.json");
}

/** Drop the memoized map (used by tests and HOME/PI_CODING_AGENT_DIR switches). */
export function clearAliasChainCache(): void {
  cache = null;
}

/**
 * Read the pi-model-fallback-alias map. The file is `{ "<alias>": ["provider/model", ...] }`
 * plus `$settings`/`$defaults` keys that are not aliases. Returns null when the file is
 * missing, unreadable or malformed, so callers can degrade to a plain arrow. A successful
 * parse is memoized and re-read only when the file's mtime, size or mode moves; a failed
 * read is never memoized, so a transient failure (or one fixed by a chmod) recovers on the
 * next render.
 */
export function loadAliasChains(path: string = getAliasMapPath()): AliasChainMap | null {
  let mtimeMs: number;
  let size: number;
  let mode: number;
  try {
    const stat = statSync(path);
    mtimeMs = stat.mtimeMs;
    size = stat.size;
    mode = stat.mode;
  } catch {
    cache = null;
    return null;
  }

  if (cache && cache.path === path && cache.mtimeMs === mtimeMs && cache.size === size && cache.mode === mode) {
    return cache.map;
  }

  let map: AliasChainMap | null = null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      map = new Map();
      for (const [alias, chain] of Object.entries(parsed)) {
        // `$settings` and `$defaults` are configuration, never alias names.
        if (alias.startsWith("$")) continue;
        // A chain the producer would reject is a malformed map: degrade wholesale
        // rather than compare positions against refs that were never valid.
        if (!Array.isArray(chain) || !chain.every((ref) => typeof ref === "string" && CHAIN_REF.test(ref))) {
          map = null;
          break;
        }
        map.set(alias, chain as string[]);
      }
    }
  } catch {
    map = null;
  }

  // Never memoize a failure: its stat signature can be unchanged when the file
  // becomes readable again.
  if (!map) {
    cache = null;
    return null;
  }

  cache = { path, mtimeMs, size, mode, map };
  return map;
}
