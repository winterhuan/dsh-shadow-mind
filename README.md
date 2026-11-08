---
description: "Configure independent read-only reviews of DSH tasks with Markdown responsibilities, background checks, and completion feedback."
kind: "package-bundle"
---

# dsh-shadow-mind

English | [中文](README.zh.md)

## Summary

Review a task independently while the main agent works and before its turn ends. Define each review responsibility in Markdown; actionable findings return to the main agent with evidence references and a child-session address. Use `/shadow` to inspect, pause, resume, or request a review. This bundle targets DSH `0.2.2-rc.1` and adds model cost and completion latency.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Use Node.js `^22.19.0 || >=24`, pnpm `11.7.0`, and exactly DSH `0.2.2-rc.1`. The profile must supply native Agent Presets, the `spawn` provider, filesystem services, and a configured model. The standard Web profile provides the required services; a custom headless profile must compose them explicitly.

### Install a local build

Run these commands from this package directory. Keep the same shell so the temporary `DSH_HOME` remains selected; this profile has separate sessions and configuration.

```sh
pnpm install --frozen-lockfile
pnpm run build
export DSH_HOME="$(mktemp -d)"
dsh --profile shadow-dev --from-default-profile web --dump-config > "$DSH_HOME/default-profile.yml"
dsh plugin --profile shadow-dev add "$PWD"
mkdir -p "$DSH_HOME/shadow-minds"
cp examples/completion.md "$DSH_HOME/shadow-minds/completion.md"
```

The bundle activates the scheduler, `/shadow` command, and review preset together. No definitions are installed automatically. The copied completion example enables one final check per human task; copy [architecture.md](examples/architecture.md) to the same directory to opt into probabilistic background checks.

Before opening Web, select an appropriate model and workspace in the development profile. The following patch keeps default workspace files inside the temporary home.

```sh
cat > "$DSH_HOME/workspace.patch.yml" <<'YAML'
- id: workspace-controller
  config:
    documentsDirectory: !!js dshHomePath('documents')
YAML
dsh --profile shadow-dev --patch "$DSH_HOME/workspace.patch.yml" --host 127.0.0.1 --port 0 --no-open
```

Open the local URL printed by DSH and send a task. Rebuild, restart the development process, and hard-refresh Web after source edits. Remove this layer with `dsh plugin --profile shadow-dev remove dsh-shadow-mind`.

### Control reviews

Commands act on the current root session. The command result shows recent outcomes and child-session addresses; Web's native subagent menu opens the review transcript.

```text
/shadow status
/shadow check
/shadow check completion
/shadow pause
/shadow resume
```

`check` waits for all enabled definitions or the selected id. It requires a previous human task and refuses a concurrent batch or a paused session. Manual checks ignore trigger probability and count as the final check for that task. `pause` cancels active reviews and waits for child cleanup; `resume` enables future triggers without replaying old work. Pause state, claimed checks, and recent outcomes survive session restoration.

### Define responsibilities

Store top-level `.md` files in `$DSH_HOME/shadow-minds`. The scheduler reloads them for each batch, so edits apply to later activations. Start with the shipped examples; their YAML frontmatter accepts these fields.

| Field | Default | Meaning |
| --- | --- | --- |
| `id`, `name` | Filename without `.md` | Stable lowercase id and display name. |
| `enabled` | `true` | Disable a responsibility without deleting it. |
| `trigger` | `[final_response]` | List containing `heartbeat`, `final_response`, or both. |
| `activation_probability` | `0.1` | Probability per eligible heartbeat; final and manual checks always run. |
| `activation_tools` | `[]` | Optional exact tool names that qualify a completed step for a heartbeat. |
| `run_with_model` | Parent model | Explicit `provider/model`; both must be available to the profile. |
| `reasoning_effort` | Inherited setting | Optional model-supported reasoning setting. |

The Markdown body defines the review responsibility. Unsupported fields, including `tools`, are errors; a definition cannot grant extra tools. Invalid files remain visible in status, and every definition sharing a duplicate id is excluded. Exceeding the directory-wide definition limit rejects the batch.

### Bound cost and diagnose failures

Override the `shadow-mind-runtime` row in a profile patch to change these settings; [config.ts](src/config.ts) owns validation and allowed ranges.

| Setting | Default | Effect |
| --- | --- | --- |
| `definitionsDirectory` | `$DSH_HOME/shadow-minds` | Responsibility files. |
| `maxParallel` | `2` | Concurrent reviews across this plugin instance. |
| `timeoutSeconds` | `120` | Per-review deadline including slot waiting and child startup. |
| `maxHeartbeatRunsPerTask` | `4` | Attempt budget per human task; skipped or failed attempts consume it. |
| `maxDefinitions` | `16` | Maximum Markdown files in the directory. |
| `maxDefinitionBytes` | `16384` | Maximum bytes per definition. |
| `maxTrajectoryChars`, `maxEntryChars` | `48000`, `8000` | Total trajectory and per-entry text limits. |
| `maxReportChars` | `4000` | Maximum accepted finding text per reviewer. |
| `maxOutputTokens` | `4096` | Requested child output budget. |

Background checks skip when capacity is occupied; final and manual checks queue. New human input cancels reviews of the previous task, and their late reports are discarded. Status distinguishes `silent`, `not_relevant`, `failed`, `timeout`, `cancelled`, and `skipped`; an infrastructure failure never counts as a clean review. Open the child transcript for native errors. For an oversized-context error, reduce trajectory limits or choose a model with a larger context window.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Scheduling, evidence, and development — click to expand</summary>

[The scheduler](src/index.ts) observes tool-bearing `step/end` events and intercepts `agent/turn-stopping`. It joins pending background work before claiming a final batch, then admits findings as a relay message. A claim belongs to the latest real user message, so the main agent's correction does not start another final review.

Each activation starts a fresh native child with the [review preset](cordis.patch.yml), project instructions, a bounded [effective trajectory](src/trajectory.ts), and structured output. Replacements in the session surface are respected. Reasoning and raw tool-result bodies are omitted; the child must inspect relevant files independently. [The policy](src/review-policy.ts) filters advertised tools and rejects disallowed execution. It wraps the instruction loader so its budget check includes newly admitted project instructions.

[Result validation](src/report.ts) accepts `report`, `silent`, or `not_relevant`. A report requires actionable text and at least one displayed event sequence reference; references identify supplied observations, not independently verified truth. A batch combines accepted findings and deduplicates identical text. [Session records](src/records.ts) retain metadata without changing model context; accepted feedback is an ordinary durable message. The plugin never replays unfinished reviews after restart.

Run `pnpm run typecheck`, `pnpm run build`, `pnpm test`, and `pnpm run check:package` before release. Tests use the production AgentLoop, preset composition, and spawn provider with a deterministic adapter. [The acceptance adapter](tests/fixtures/keyless-model.mjs) also exercises a real Web profile without model-generation API calls; it does not measure review quality.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Completion example](examples/completion.md) and [architecture example](examples/architecture.md) provide editable responsibilities. [Package metadata](package.json) declares the bundle exports and exact DSH compatibility. [pi-shadow-mind](https://github.com/liu-zhengdong/pi-shadow-mind) inspired the independent-review approach; this implementation uses DSH's native sessions and activations.

-----

<a id="model-experience"></a>
## Model Experience

### Review context and feedback

#### What the model sees

The main model receives no new tools or persistent prompt prefix. It receives actionable findings as `shadow-report` relay messages with reviewer identity, child-session address, and event references. Each fresh child receives its responsibility, quoted observations, project instructions, and only `read`, `grep`, `glob`, and `structured_output`. Human command results and scheduler metadata stay outside model context.

#### Token effect

Every activation adds a separate model request and may add read-tool turns. Trajectory, definitions, reports, output, concurrency, and deadlines are bounded. Before each child request, the policy compares serialized UTF-8 bytes plus output reserve with advertised context capacity. This conservative heuristic is not a tokenizer or a monetary limit; a missing model context limit prevents that comparison.

#### KV Cache effect

The main request prefix remains unchanged until ordinary feedback extends its history. Review children share stable preset text but receive fresh task-specific evidence; cross-child cache reuse depends on the provider. This plugin promises no cache-hit improvement.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Final checks delay turn completion, but streamed answer text can appear before review finishes. Findings invite a correction; they do not hide or replace the first answer.
- Read-only tool exposure is not an operating-system sandbox. The configured filesystem provider controls readable paths, and custom implementations under allowed tool names remain trusted.
- Background evidence is a snapshot of a live workspace. Citations and byte budgets do not prove semantic correctness, snapshot isolation, or complete coverage.
- The plugin requires the native local `spawn` provider and preset composition. It has no custom panel, definition-management tools, or automatic replay of interrupted reviews. Session-format migrations may omit plugin metadata.
- Real-model review quality, Linux/Windows acceptance, and custom headless composition have not been validated.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
