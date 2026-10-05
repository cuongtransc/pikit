export interface AliasStatus {
  /** Model portion of the resolved provider/model target reference. */
  target: string;
  /** Provider portion of the resolved target reference, when present. */
  provider?: string;
  /** Optional cooldown segment published alongside the active target. */
  cooldown?: string;
}

const ANSI_ESCAPE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g;
const STATUS_SEPARATOR = " · ";

/** Remove terminal control sequences before interpreting an extension status. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, "");
}

/**
 * Parse the model-alias extension's footer status, e.g.
 * `opencode-go/deepseek-v4.1-flash · cooldown: openai-codex/gpt-6-luna 5m`.
 */
export function parseAliasStatus(raw: string | undefined | null): AliasStatus | null {
  if (!raw) return null;

  const plain = stripAnsi(raw).trim();
  if (!plain) return null;

  const separatorIndex = plain.indexOf(STATUS_SEPARATOR);
  const targetRef = (separatorIndex < 0 ? plain : plain.slice(0, separatorIndex)).trim();
  const cooldown = separatorIndex < 0 ? undefined : plain.slice(separatorIndex + STATUS_SEPARATOR.length).trim();
  if (targetRef.startsWith("cooldown:")) return null;
  const providerSeparator = targetRef.indexOf("/");
  if (providerSeparator < 0) return null;

  // Split at the first slash without trimming the parts: a model id may contain
  // whitespace the producer accepts verbatim, and the footer must rebuild the
  // exact ref to compare it against the chain.
  const provider = targetRef.slice(0, providerSeparator);
  const target = targetRef.slice(providerSeparator + 1);
  if (!target) return null;

  return { target, ...(provider ? { provider } : {}), ...(cooldown ? { cooldown } : {}) };
}
