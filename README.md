<img alt="banner" src="https://github.com/user-attachments/assets/3c0eb2a6-fce9-4c39-8943-d348ce1bc284" />

<h3 align="center">Pikit — an opinionated Pi coding agent configuration. Batteries included.</h3>

<p align="center">
  <a href="#whats-in-here">What's in here</a> &nbsp;·&nbsp;
  <a href="#install">Install</a> &nbsp;·&nbsp;
  <a href="#extensions">Extensions</a> &nbsp;·&nbsp;
  <a href="#theme">Theme</a> &nbsp;·&nbsp;
  <a href="#configs">Configs</a>
  
</p>

---

## What's in here

```
agent/
├── configs/
│   └── footer.json              # Footer segment configuration — gitignored, see footer/footer.example.json
├── APPEND_SYSTEM.md             # Coding guidelines appended to the system prompt every session
├── settings.example.json        # Opinionated pi settings — copy to settings.json (gitignored)
├── themes/
│   └── slop.json                # Custom warm color theme
└── extensions/
    ├── chat-input/              # Unicode box border around the main chat input editor
    ├── footer/                  # Status bar with git, tokens, cost, context
    ├── spinners/                # Rotating spinner verbs while the agent thinks
    ├── startup/                 # Welcome header shown at session start
    └── styled-outputs/          # Custom styled rendering for all message types (tools, diffs, thinking, skills)
```

---

## Install

```bash
# Install Pi
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# Install Pikit
pi install npm:@adrianapan/pikit

# (Optional, but recommended) Scaffold Pikit's opinionated files into ~/.pi/agent
bash ~/.pi/agent/npm/node_modules/@adrianapan/pikit/setup.sh

# Start Pi
pi
```

### `setup.sh`

You can manually sync the opinionated Pikit configs (settings, keybindings, additional system prompt) by pulling them from the repo and manually placing the relevant files in your Pi folder. Alternatively, you can use the automated `setup.sh` script.

```bash
# flags are optional
bash ~/.pi/agent/npm/node_modules/@adrianapan/pikit/setup.sh [flags]
```

Flag | Description |
|-|-|
| `--settings` | Sync `settings.json` (theme: "slop")
| `--system-prompt` | Sync `APPEND_SYSTEM.md`
| `--keybindings` | Sync `keybindings.json` (two Pikit keybinds)
| `--help`, `-h` | Show this help


* Running it with no flags runs every job, in order: settings, system-prompt, keybindings

* Existing files are backed up to `~/.pi/agent/_bak/` before being replaced

* Idempotent so already-correct files and fields are skipped

### Cloning the repo?

If you decide to clone the repo directly into your `~/.pi` folder instead of installing it via `pi install`, you'll need to install the deps. This repo uses [pnpm](https://pnpm.io/).

```bash
git clone git@github.com:adrianapan/pikit.git
cd ~/.pi
pnpm install
```

> Only local development uses pnpm. End users installing via `pi install npm:@adrianapan/pikit` are unaffected — Pi still installs the published package with npm.

#### Development checks

The dev API baseline is pinned to **Pi 0.99.1**; host-provided Pi packages remain
wildcard peer dependencies and are not bundled.

```bash
pnpm check
pnpm test
```

To run runtime regression tests against another installed Pi host:

```bash
PI_TEST_CODING_AGENT_DIR=/absolute/path/to/@earendil-works/pi-coding-agent pnpm test
```

This override changes the runtime test host, not the TypeScript baseline.

#### Artifacts removal

Pikit no longer includes the Artifacts extension or its `artifact` tool and
`/artifacts` command. After updating, run `setup.sh --system-prompt` to remove
the old artifact instructions from the installed `APPEND_SYSTEM.md` (the previous
file is backed up). Existing generated HTML files and user configuration are left
untouched.

#### Minimum release age

`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (10080 minutes = **7 days**). pnpm refuses to install any package version published less than a week ago, so a compromised release has time to be caught and yanked before it can land in the lockfile.

The practical effect: `pnpm add foo@latest` resolves to the newest version that is at least 7 days old, not to whatever was published this morning. If you genuinely need a fresher version, add it to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`:

```yaml
minimumReleaseAgeExclude:
  - 'some-package@1.2.3'
```

The selected Pi/Chord `0.99.1` dev baseline has exact-version age exceptions;
other versions and packages still use the 7-day gate.

The same file also carries an `allowBuilds` block — pnpm blocks dependency install scripts by default, and the transitive dev-only entries listed there are deliberately left unbuilt.

---


## Extensions

### UI & UX

* **styled-outputs** — Swaps flat console readouts for color-coded diff blocks, expandable sections, custom icons, and visual tool groups. → [`README`](agent/extensions/styled-outputs/README.md)
* **footer** — A dense, customized status line detailing active models, token metrics, live run costs, and current git state; model aliases show their resolved target. Supports Nerd Fonts and ASCII fallbacks. → [`README`](agent/extensions/footer/README.md)
* **chat-input** — Draws a stylized, isolated Unicode frame around your active terminal prompt line while preserving all underlying editing shortcuts. → [`README`](agent/extensions/chat-input/README.md)
* **spinners** — Trades static loader indicators for dynamic, timed thinking states and live token accumulators. → [`README`](agent/extensions/spinners/README.md)
* **startup** — Displays a concise diagnostic dashboard on boot, mapping out active plugins, server states, and shortcut reminders. → [`README`](agent/extensions/startup/README.md)

---

## Theme

### slop

A warm, earthy palette with terracotta primary (`#d67858`) and warm-white text (`#f5f2ee`), covering all 51 pi color tokens including syntax highlighting and thinking level indicators. Activate via `/settings → Theme → slop`.

---

## System prompt

Pi appends [`agent/APPEND_SYSTEM.md`](agent/APPEND_SYSTEM.md) to its default system prompt every session (no extension code involved). It's a trimmed and adapted version of [Andrej Karpathy's coding guidelines](https://github.com/forrestchang/andrej-karpathy-skills/blob/main/CLAUDE.md): think before coding, simplicity first, surgical changes, and goal-driven execution.

---

## Configs

> Best experienced with [Ghostty](https://ghostty.org/) - a fast, GPU-accelerated, cross-platform terminal emulator.

### Models

Launch `pi` in your terminal, then pick your authentication mechanism:

* **Subscription Providers:** Trigger `/login` and authenticate with your existing account context (Claude Pro, ChatGPT Plus, Copilot, or Gemini).
* **Direct API Keys:** Export your keys to your active shell session prior to startup (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).

### Fonts

If interface icons or status graphics look broken, install a modern developer font setup:

```bash
brew install --cask font-jetbrains-mono-nerd-font

```

*Note for iTerm2 users:* Ensure **Settings → Profiles → Text** points to your chosen Nerd Font family, and enable **Use a different font for non-ASCII text**. If layout renders fall back, enforce rendering symbols explicitly via `export FOOTER_NERD_FONTS=1`.

### Custom or local models

`agent/models.json` (gitignored, hot-reloads while pi runs) registers local models or any OpenAI-compatible endpoint. Full reference in the [models docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md).

#### Ollama — local models

Point `baseUrl` at the Ollama daemon and list whichever models you have pulled. `apiKey` is required but ignored locally.

```json
{
  "providers": {
    "ollama": {
      "api": "openai-completions",
      "apiKey": "ollama",
      "baseUrl": "http://127.0.0.1:11434/v1",
      "models": [
        {
          "id": "qwen3.5:4b",
          "name": "Qwen3.5 4B",
          "contextWindow": 265000,
          "input": ["text", "image"],
          "reasoning": true
        }
      ]
    }
  }
}
```

#### Ollama — cloud models

Ollama Cloud needs an API key and a `compat` block, because cloud models don't support the `developer` role pi uses for reasoning models. Store the key in `agent/configs/.env` and read it with the shell-command form so it's resolved at runtime:

```json
{
  "providers": {
    "ollama-cloud": {
      "api": "openai-completions",
      "apiKey": "!grep ^OLLAMA_API_KEY ~/.pi/agent/configs/.env | cut -d= -f2",
      "baseUrl": "https://ollama.com/v1",
      "compat": {
        "supportsDeveloperRole": false
      },
      "models": [
        {
          "id": "qwen3.5:cloud",
          "name": "Qwen 3.5",
          "contextWindow": 265000,
          "input": ["text", "image"],
          "reasoning": true
        }
      ]
    }
  }
}
```

Browse models at [ollama.com/search](https://ollama.com/search); cloud variants use the `:cloud` suffix.

> pi extensions run with full system access; that applies to this kit and anything else you install. Review the source before trusting a package; everything here is small enough to read in one sitting.
