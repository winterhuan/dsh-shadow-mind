# dsh-shadow-mind

Parallel cognitive runtime for [DeepSeek Harness](https://github.com/deepseek-ai/dsh) (DSH / Cordis).

This package is a DSH port of the original [pi-shadow-mind](https://github.com/liuzhengdongfortest/pi-shadow-mind) project, which runs multiple "Shadow Mind" agents beside a main agent to provide independent reviews, fact-checking, and parallel cognitive work.

> **Status**: functional prototype / early port. Core heartbeat scheduling, read-only shadow agents, and management tools work end-to-end. Several advanced features from `pi-shadow-mind` are not yet fully migrated. See [Gaps vs pi-shadow-mind](#gaps-vs-pi-shadow-mind) below.

## Relation to pi-shadow-mind

- Original project: https://github.com/liuzhengdongfortest/pi-shadow-mind
- This port adapts the same concepts to the DSH/Cordis runtime.
- Because DSH uses different primitives (continuable subagents, native background notices, and the Cordis plugin model), the implementation is not a line-by-line translation.

## Features

- **Heartbeat scheduling**: After each main-agent turn, randomly activates configured Shadow Minds.
- **Read-only shadows**: Each shadow receives a sanitized main-session trajectory and a restricted tool allowlist.
- **Management tools**: Create, update, delete, list, enable, and disable shadow definitions via model tools.
- **Config tools**: Read and write the global `config.json` via model tools.
- **Pause/resume/epoch**: `/shadow pause` and `/shadow resume`; new user input increments the epoch and cancels running shadows from the previous epoch.
- **Tool-call argument redaction**: Tool-call arguments are redacted before being forwarded to shadows (credentials are not leaked). Tool results are summarized.

## Installation

```bash
npm install dsh-shadow-mind
```

Then load it in your DSH/Cordis composition (e.g., agent preset) as a plugin. The package exports a default plugin factory from `dist/index.js`.

## Configuration

Shadow definitions and global config live in:

```
~/.dsh/agent/shadow-minds/
├── config.json
├── grounded-reviewer.md
├── requirement-keeper.md
└── ...
```

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

## Gaps vs pi-shadow-mind

The following features from the original `pi-shadow-mind` are not yet fully migrated:

| Feature | Status |
|---|---|
| Independent Shadow AgentSession | **Partial**: DSH continuable subagents are used instead of a separate Pi AgentSession. |
| `report_to_main` tool | **Missing**: DSH native background notices are used instead. Report batching and `steer`/`followUp` are not yet replicated. |
| Tool allowlist resolution (`resolveShadowTools`) | **Simplified**: missing-tool reporting and `report_to_main` injection are not implemented. |
| Per-shadow model auth check | **Missing**: `run_with_model` is passed as `agentOptions`, but auth validation is not performed. |
| Per-shadow `timeout_seconds` | **Not enforced**: DSH subagent spec does not expose a direct per-run timeout. |
| Per-shadow `thinking_level` | **Not applied**: DSH uses reasoning effort, which is not yet mapped. |
| Shutdown drain / headless mode | **Missing**: no `waitForSettled` or headless drain. |
| Debug session logs | **Skipped**: per-user request, no JSONL session logs are written. |
| UI status panel / message renderer | **Partial**: a Client indicator exists in the dynamic prototype; the real package currently only exposes `/shadow`. |
| Test suite | **Missing**: original tests were removed during the port and not yet rewritten for DSH. |

See the original [DESIGN.md](DESIGN.md) for the full design (this is the original pi-shadow-mind design; it describes goals that are only partially implemented in this DSH port).

## Development

```bash
npm install
npm run typecheck
npm run build
```

## License

MIT
