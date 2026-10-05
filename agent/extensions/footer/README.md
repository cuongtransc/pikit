# footer

A customizable two-row footer for the pi coding agent. Provides a rich status bar at the bottom of the terminal showing model info, git status, token usage, and more.

<img alt="preview" src="https://github.com/user-attachments/assets/b0e90d1b-2f93-4a94-a373-94d2f85d6bf8" />


## Layout

```
Row 1 left:  π | <model name> (<provider>) ⚡ <level> | <folder> <path> <branch> <dirty>
Row 1 right: (empty by default)

Row 2 left:  <context bar> <pct%> / <max tokens>
Row 2 right: T: <total> (<cache-read> cached, <hit-rate>% hit) ↑ <in> ↓ <out> | $<cost>
```

## Features

- **Two-row layout**: Info grouped by purpose across two lines
- **Context bar**: 20-character gradient block bar with configurable colours and % indicator
- **Git integration**: Shows current branch and working tree status (staged, unstaged, untracked)
- **Token tracking**: Composite `T:` line with total, cache-read count, cache hit rate, input, and output counts
- **Thinking level**: Lowercase selected level name with per-level colour
- **Virtual routing**: The `model` segment adds `→ <physical model> (<provider>) • <routed thinking>` after a response on the current session branch. Ordinary models and virtual selections without a response keep the concise selected-model display.
- **Model aliases**: When the `model-alias` status is available, aliases show `→ <resolved model>` and any active cooldown, which updates live. The target is the model that served the last turn (or the selected target before the first turn), not a prediction of the next turn after a cooldown expires. Set `segmentOptions.model.aliasLabels` to shorten the alias and mark fallbacks (see [Compact alias options](#compact-alias-options)).
- **Compact display**: `segmentOptions.model.compactThinking` joins the `⚡` marker to the level (`⚡low`), and `segmentOptions.contextBar.compactLabel` turns `24.3% / 1.0M` into `24%`.
- **Nerd Font support**: Automatic detection with ASCII fallbacks
- **Live updates**: Git status refreshes automatically as you work

## Configuration

Create `~/.pi/agent/configs/footer.json` to customise the footer. Each row's
left and right segments are configured independently:

```json
{
  "row1LeftSegments":  ["pi", "separator", "model", "text:⚡", "thinking", "separator", "path", "git"],
  "row1RightSegments": [],
  "row2LeftSegments":  ["context_pct"],
  "row2RightSegments": ["token_total", "separator", "cost"],

  "colors": {
    "model": "#c07898",
    "thinkingHigh": "#afb9fe",
    "separator": "#87827a"
  },

  "segmentOptions": {
    "path": { "mode": "basename" },
    "git": {
      "showBranch": true,
      "showStaged": true,
      "showUnstaged": true,
      "showUntracked": true
    }
  }
}
```

See `footer.example.json` in this directory for a full annotated example.

## Available Segments

| Segment | Description | Notes |
|---------|-------------|-------|
| `pi` | π symbol in accent blue | — |
| `model` | Selected model name + `(provider)`, with physical route for virtual models | Route uses the latest current-branch assistant's recorded provider/model/thinking; missing routed thinking is omitted, never inferred from the selected level. Alias models instead show `→ <resolved model>` plus any active cooldown from the `model-alias` status (the last-served target, or the selected target before the first turn), falling back to `(alias)` when no target status exists. `segmentOptions.model.aliasLabels` switches to short labels and a fallback marker |
| `path` | Current working directory | `segmentOptions.path.mode`: `"basename"` (default) · `"abbreviated"` · `"full"` |
| `git` | Git branch and dirty indicators | `showBranch`, `showStaged`, `showUnstaged`, `showUntracked` (all bool) |
| `context_pct` | Gradient bar + `X.X%` + max tokens | Bar fully configurable via `segmentOptions.contextBar` (see below). % and max tokens use `contextLabel` colour. Max tokens formatted with K/M suffix (e.g. `128k`, `2M`). `segmentOptions.contextBar.compactLabel` drops the max tokens and rounds the percent (`24%`). Set `DEBUG_PCT` in `context.ts` to a number (0–100) to pin the bar at a fixed value for visual testing. |
| `cost` | `$<amount>` | `$` dim, amount in `cost` colour (`muted` by default) |
| `thinking` | `<level>` | Lowercase level with per-level colour; always visible |
| `token_total` | `T: <total> (<cache-read> cached, <hit-rate>% hit) ↑ <in> ↓ <out>` | Hit rate is `cacheRead / (input + cacheRead + cacheWrite)`; labels are dim and numbers use the `tokens` colour |
| `token_in` | Input tokens | Available for custom layouts |
| `token_out` | Output tokens | Available for custom layouts |
| `cache_read` | Cache read tokens (hidden if zero) | — |
| `cache_write` | Cache write tokens (hidden if zero) | — |
| `context_total` | Total context window size | — |
| `separator` | `\|` divider | Coloured via `separator` in `colors` |
| `text:...` | Literal text, e.g. `text:⚡` | With `segmentOptions.model.compactThinking`, a `text:⚡` segment immediately before `thinking` drops its separator space |

## Compact alias options

Alias rendering is opt-in. Setting `segmentOptions.model.aliasLabels` (even to `{}`) switches
the `model` segment for alias providers from `label → model` to a compact `label→model`, and
enables the fallback marker:

- `aliasLabels` maps an alias name to a short label, e.g.
  `{ "implementer-medium": "impl", "reviewer-high": "rev+" }`. An alias missing from the map
  keeps its full name.
- **Fallback marker**: the footer reads the `pi-model-fallback-alias` map (`PI_MODEL_ALIAS_MAP` if
  set, otherwise `~/.pi/agent/model-alias.json`; `PI_CODING_AGENT_DIR` is honoured, the same way pi
  resolves its agent dir) and mirrors the producer's parser: an alias is a non-empty array of
  `<provider>/<model>` refs, a single ref string, or an object
  `{ "targets": [...], "timeouts": …, "cooldown": … }` whose policy fields the producer would
  accept. Nested `alias/<name>` refs are expanded recursively before comparison, dropping unknown
  or cyclic nested aliases, exactly as the producer does. When the served `model-alias` target is
  not the first ref in that expanded chain, the footer renders `label↓model` with the model in the
  `warning` colour; a target that is the expanded chain head, or is absent from a readable chain,
  keeps the plain `label→model`. The ref rule is the producer's own `isModelRef`: a string whose
  first `/` is neither first nor last, whitespace included. A role the producer would reject is
  skipped and only that alias loses its marker, never the whole map. The parsed map is cached and
  re-read when the file's mtime, ctime, size or mode changes; a failed read is never cached, so a
  transient failure or a fixed permission recovers on the next render.

```json
{
  "segmentOptions": {
    "model": {
      "aliasLabels": {
        "implementer-medium": "impl",
        "implementer-high": "impl+",
        "reviewer-medium": "rev",
        "reviewer-high": "rev+",
        "mid-model": "mid",
        "high-model": "high",
        "scout": "scout",
        "planner": "plan",
        "main": "main"
      },
      "compactThinking": true
    }
  }
}
```

`segmentOptions.model.compactThinking` joins the `text:⚡` marker to the thinking level, so
`⚡ low` becomes `⚡low`.

`segmentOptions.contextBar.compactLabel` renders a rounded percent with no window label:
`▋▋▋▋▋▋ 24%` instead of `▋▋▋▋▋▋ 24.3% / 1.0M`.

All three options are off by default, so an existing `footer.json` keeps its current output.

## Branch and route accounting

Usage/cost totals include all session entries, including abandoned branches. Virtual
route identity is separate: it comes only from assistant messages on the active
branch, after its latest model-selection entry, and only when that recorded
provider/model matches the live virtual selection. Navigating into another
selection's history keeps the selected-only display. Switching branch/session or
selecting a new model invalidates the cached route. Before that selection has a
response, only its selected model is shown. The separate `thinking` segment
continues to show the live selected level, not the physical response's level.

Route lookup shares the session-stat cache (manager/session/leaf/count/model);
unchanged frames do not rescan branch history. Ordinary models never need a route
scan. Physical routes become visible once the assistant message is persisted;
`message_end` invalidates accounting while the host finalizes the response.

## Context Bar

The `context_pct` segment's bar is fully configurable via `segmentOptions.contextBar`:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `barWidth` | number | `18` | Number of characters wide |
| `filledChar` | string | `"▋"` | Character used for the filled portion |
| `unfilledChar` | string | `"▋"` | Character used for the unfilled portion |
| `unfilledColor` | color | `"#4e4c49"` | Color of the unfilled portion — hex or pi theme token |
| `gradientStart` | color | `"#f29373"` | Gradient color at the left/empty end — hex or pi theme token |
| `gradientMid` | color | `"#d67858"` | Gradient midpoint color — hex or pi theme token |
| `gradientEnd` | color | `"#ae4f2f"` | Gradient color at the right/full end — hex or pi theme token |
| `gradientMidPoint` | number | `0.55` | Where `gradientMid` sits along the bar (0–1). Below this fraction the gradient runs start→mid; above it mid→end |
| `compactLabel` | boolean | `false` | Drop `/ <window>` and round the percent to an integer (`24%`) |

All color fields accept either a hex string (e.g. `"#ff6347"`) or a pi theme token (e.g. `"accent"`, `"warning"`, `"dim"`).

```json
{
  "segmentOptions": {
    "contextBar": {
      "barWidth": 20,
      "unfilledColor": "dim",
      "gradientStart": "#56b6c2",
      "gradientMid": "#61afef",
      "gradientEnd": "#c678dd",
      "gradientMidPoint": 0.4
    }
  }
}
```

## Thinking Levels

The `thinking` segment shows per-level colours:

| Level | Display | Default colour |
|-------|---------|---------------|
| `off` | `off` | dim |
| `minimal` | `minimal` | muted |
| `low` | `low` | warning |
| `medium` | `medium` | success |
| `high` | `high` | `#afb9fe` |
| `xhigh` | `xhigh` | rainbow gradient |
| `max` | `max` | rainbow gradient |

Override any level colour via the corresponding key in `colors`. Setting `thinkingXhigh` or `thinkingMax` replaces the rainbow gradient with a solid colour:

```json
{
  "colors": {
    "thinkingXhigh": "#9575cd",
    "thinkingMax": "#ce93d8"
  }
}
```

## Git Status Indicators

The `git` segment shows:
- Branch name coloured green (clean) or amber (dirty)
- `*N` — unstaged changes
- `+N` — staged changes
- `?N` — untracked files

## Icons

Nerd Font icons are auto-detected from your terminal. Ghostty, WezTerm, Kitty, iTerm2, Alacritty, Foot, Rio, and Contour are recognised automatically — everything else falls back to plain Unicode symbols. If detection gets it wrong (e.g. when running inside tmux), override it:

```bash
export FOOTER_NERD_FONTS=1  # force Nerd Fonts on
export FOOTER_NERD_FONTS=0  # force plain icons
```

### Installing a Nerd Font (macOS)

```bash
brew install --cask font-jetbrains-mono-nerd-font
```

Other fonts available via `brew search nerd-font`.

### Configuring iTerm2

1. Open **Settings → Profiles → Text**
2. Set **Font** to `JetBrainsMonoNL Nerd Font Propo`, size `10` (recommended)
3. Enable **Use a different font for non-ASCII text** and set the same font there — required for icons to render correctly

### Custom Icons

To swap out any icon, add an `icons` key to your `~/.pi/agent/configs/footer.json`. Browse available Nerd Font glyphs at [nerdfonts.com/cheat-sheet](https://www.nerdfonts.com/cheat-sheet):

```json
{
  "icons": {
    "branch": "",
    "separator": "|"
  }
}
```
