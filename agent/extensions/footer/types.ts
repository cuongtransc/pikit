import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { Usage } from "@earendil-works/pi-ai";
import type { IconSet } from "./icons.js";

// Theme color - either a pi theme color name or a custom hex color
export type ColorValue = ThemeColor | `#${string}`;

// Semantic color names for segments
export type SemanticColor =
  | "pi"
  | "model"
  | "path"
  | "git"
  | "gitDirty"
  | "gitClean"
  | "thinking"
  | "thinkingOff"
  | "thinkingMinimal"
  | "thinkingLow"
  | "thinkingMedium"
  | "thinkingHigh"
  | "thinkingXhigh"
  | "thinkingMax"
  | "context"
  | "contextWarn"
  | "contextError"
  | "contextLabel"
  | "cost"
  | "tokens"
  | "separator";

// Color scheme mapping semantic names to actual colors
export type ColorScheme = Partial<Record<SemanticColor, ColorValue>>;

// Segment identifiers
export type StatusLineSegmentId =
  | "pi"
  | "model"
  | "path"
  | "git"
  | "token_in"
  | "token_out"
  | "token_total"
  | "cost"
  | "context_pct"
  | "context_total"
  | "cache_read"
  | "cache_write"
  | "thinking"
  | "separator"
  | `text:${string}`;

// Per-segment options
export interface StatusLineSegmentOptions {
  path?: {
    mode?: "basename" | "abbreviated" | "full";
    maxLength?: number;
  };
  git?: {
    showBranch?: boolean;
    showStaged?: boolean;
    showUnstaged?: boolean;
    showUntracked?: boolean;
  };
  contextBar?: {
    barWidth?: number;
    filledChar?: string;
    unfilledChar?: string;
    unfilledColor?: ColorValue;
    gradientStart?: ColorValue;
    gradientMid?: ColorValue;
    gradientEnd?: ColorValue;
    gradientMidPoint?: number;
    /** Render a rounded `24%` instead of `24.3% / 1.0M`. */
    compactLabel?: boolean;
  };
  model?: {
    /** Short label per alias name, e.g. `{ "implementer-medium": "impl" }`. */
    aliasLabels?: Record<string, string>;
    /** Join the `text:⚡` marker to the thinking level (`⚡low`, not `⚡ low`). */
    compactThinking?: boolean;
  };
}

// Git status data
export interface GitStatus {
  branch: string | null;
  staged: number;
  unstaged: number;
  untracked: number;
}

// Usage statistics
export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

// Context passed to segment render functions
export interface SegmentContext {
  model: { id: string; name?: string; reasoning?: boolean; contextWindow?: number; provider?: string; baseUrl?: string } | undefined;
  routedModel?: { provider: string; id: string; thinkingLevel?: string };
  aliasStatus?: { target: string; provider?: string; cooldown?: string } | null;
  isLocalModel: boolean;
  thinkingLevel: string;
  sessionId: string | undefined;
  usageStats: UsageStats;
  contextTokens: number | null;
  contextPercent: number | null;
  contextWindow: number;
  usingSubscription: boolean;
  sessionStartTime: number;
  git: GitStatus;
  options: StatusLineSegmentOptions;
  width: number;
  theme: Theme;
  colors: ColorScheme;
  icons: IconSet;
}

// Minimal event shapes used by the footer handlers
export interface ToolResultEvent {
  toolName: string;
  input?: { command?: string };
}

export interface UserBashEvent {
  command: string;
}

// Structural shape keeps newer usage entry categories compatible with Pi 0.80 types.
export interface SessionEvent {
  type: string;
  provider?: string;
  modelId?: string;
  message?: { role: string; usage?: Usage; provider?: string; model?: string; api?: string; thinkingLevel?: string };
  usage?: Usage;
}

// Rendered segment output
export interface RenderedSegment {
  content: string;
  visible: boolean;
}

// User configuration from footer.json
export interface FooterUserConfig {
  row1LeftSegments?: StatusLineSegmentId[];
  row1RightSegments?: StatusLineSegmentId[];
  row2LeftSegments?: StatusLineSegmentId[];
  row2RightSegments?: StatusLineSegmentId[];
  colors?: ColorScheme;
  segmentOptions?: StatusLineSegmentOptions;
  icons?: Partial<IconSet>;
}
