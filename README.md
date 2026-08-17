# dsh-shadow-mind

Parallel cognitive runtime for [DeepSeek Harness](https://github.com/deepseek-ai/dsh) (DSH / Cordis).

The plugin runs multiple "Shadow Mind" agents beside the main agent to provide independent reviews, fact-checking, and parallel cognitive work. After each main-agent turn, a heartbeat scheduler randomly activates configured shadows, each with its own responsibility, tool allowlist, and run timeout.

> **Status**: functional prototype. Core heartbeat scheduling, restricted-tool shadow agents, per-run timeouts, lifecycle cleanup, and management tools work end-to-end. See [Known Limitations](#known-limitations) below.

## Features

- **Heartbeat scheduling**: After each main-agent turn, randomly activates configured Shadow Minds.
- **Restricted-tool shadows**: Each shadow receives a sanitized main-session trajectory and an explicit tool allowlist. The default allowlist is read-only; configuring other tools can broaden that access.
- **Per-run timeout**: `timeout_seconds` (or the config default) bounds each shadow run; an expired run is interrupted and its slot is released.
- **Lifecycle cleanup**: `subagent/end` removes finished shadow runs, so slots and `active` counts stay accurate within an epoch.
- **Management tools**: Create, update, delete, list, enable, and disable shadow definitions via model tools. Persistent writes are gated behind the DSH approval service when one is mounted.
- **Config tools**: Read and write the global `config.json` via model tools (writes validate the merged result before persisting).
- **Pause/resume/epoch**: `/shadow pause` and `/shadow resume`; pausing also aborts running shadows. New user input increments the epoch and cancels running shadows from the previous epoch.
- **Auto toggle**: `/shadow auto on|off` actually enables/disables heartbeat activation.
- **Tool-call argument redaction**: Tool-call arguments are redacted before being forwarded to shadows (credentials are not leaked). Tool results are summarized.

## Installation

DSH plugins are loaded through a Cordis composition (profile or agent preset).

### 1. Install the package into a DSH profile

```bash
dsh plugin --profile web add @winterchenhuan/dsh-shadow-mind
```

For local development, build the package before adding the directory so `dist/index.js` exists:

```bash
cd /path/to/dsh-shadow-mind
npm install
npm run build
dsh plugin --profile web add /path/to/dsh-shadow-mind
```

The profile stores the local package as a path dependency; rerun `npm run build` after source changes, then restart DSH.

The current repository version is `0.1.6`. Before publishing that version, installing by package name resolves the latest published npm version instead; use the local-directory procedure above to test the current checkout.

The package ships a `cordis.patch.yml`. The profile loader reads the package's `dsh.bundle.patch` manifest and applies it automatically; no manual profile `cordis.patch.yml` editing is needed.

### 2. Restart DSH

Restart DSH and the plugin will be loaded. The package exports a default Cordis plugin factory from `dist/index.js`.

## Configuration

Shadow definitions and global config live in:

```
$DSH_HOME/agent/shadow-minds/
├── config.json
├── grounded-reviewer.md
├── requirement-keeper.md
└── ...
```

`$DSH_HOME` defaults to `~/.dsh` (honoring the `DSH_HOME` environment variable), so the default location is `~/.dsh/agent/shadow-minds/`.

Example `config.json`:

```json
{
  "heartbeat_probability": 0.33,
  "max_parallel_shadows": 2,
  "default_shadow_timeout_seconds": 120,
  "headless_drain_timeout_seconds": 30,
  "result_batch_window_ms": 5000,
  "default_shadow_model": null,
  "default_thinking_level": "low",
  "random_seed": null
}
```

The timeout and heartbeat fields are active. `headless_drain_timeout_seconds`, `result_batch_window_ms`, and `default_thinking_level` are accepted for configuration compatibility but are not active yet; see [Known Limitations](#known-limitations).

Example shadow definition `grounded-reviewer.md`:

```md
---
id: grounded-reviewer
name: Project Grounding Checker
enabled: true
activation_probability: 0.6
run_with_model: openai/gpt-5-mini
thinking_level: low
tools:
  - read
  - grep
  - glob
---

Check whether the main agent's claims are supported by the current workspace. If nothing is worth reporting, reply exactly: NOT_RELEVANT.
```

## Usage

After installation, restart the target profile and start DSH Web normally:

```bash
dsh web
```

(`dsh --profile web` is equivalent.)

In the Web UI, continue using the main agent. Shadow activations happen after main-agent turns according to the configured probability. Use `/shadow status` first to confirm the plugin loaded and to see registry/config diagnostics.

## Commands

Use the single `/shadow` umbrella command:

```
/shadow status
/shadow probe <id> [tools]
/shadow list
/shadow clean
/shadow auto <on|off>
/shadow pause
/shadow resume
```

## Management Tools

These are registered as model-callable tools:

- `list_shadows`
- `create_shadow`
- `update_shadow`
- `delete_shadow`
- `enable_shadow`
- `disable_shadow`
- `trigger_shadow`
- `read_shadow_config`
- `write_shadow_config`

## Known Limitations

The following areas are not fully implemented yet:

| Area | Status |
|---|---|
| Independent Shadow AgentSession | **Partial**: DSH continuable subagents are used instead of a separate agent session. |
| `report_to_main` tool | **Missing**: DSH native background notices are used instead. Report batching and `steer`/`followUp` are not yet replicated. |
| Tool allowlist resolution | **Simplified**: missing-tool reporting and `report_to_main` injection are not implemented. |
| Per-shadow model auth check | **Missing**: `run_with_model` is passed as `agentOptions`, but auth validation is not performed. |
| Per-shadow `timeout_seconds` | **Enforced**: each run is bounded by `timeout_seconds` or `default_shadow_timeout_seconds`; expired runs are interrupted and their slots released. |
| Per-shadow `thinking_level` | **Not applied**: DSH uses reasoning effort, which is not yet mapped. |
| Shutdown drain / headless mode | **Missing**: no headless drain on process shutdown. |
| UI status panel / message renderer | **Partial**: a Client indicator exists in the dynamic prototype; the real package currently only exposes `/shadow`. |
| Debug session logs | **Not needed**: shadow runs are DSH continuable subagents, and DSH Web already shows their execution (trajectory, tool calls, results) live. The `debug` frontmatter field was removed accordingly. |
| Test suite | **Minimal**: vitest suite covers the pure scheduling, parsing, serialization, config, and drain logic; no harness integration tests yet. |

See [DESIGN.md](DESIGN.md) for the project's design goals; some of them are not fully implemented yet.

## Development

```bash
npm install
npm run typecheck
npm run verify   # typecheck + unit tests
npm run build
```

`npm pack` runs `prepack` (i.e. `npm run build`) automatically, so a release tarball always contains `dist/index.js`.

## License

MIT
