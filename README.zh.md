---
description: "通过 Markdown 职责、后台检查和完成反馈，为 DSH 任务配置独立只读审查。"
kind: "package-bundle"
---

# dsh-shadow-mind

[English](README.md) | 中文

## Summary

在主智能体工作期间及回合结束前，独立审查任务。用 Markdown 定义审查职责；可执行的问题会携带证据引用和子会话地址返回主智能体。使用 `/shadow` 查看状态、暂停、恢复或主动检查。此包适配 DSH `0.2.2-rc.1`，会增加模型调用成本和完成延迟。

## Table of Contents

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

使用 Node.js `^22.19.0 || >=24`、pnpm `11.7.0` 和精确版本 DSH `0.2.2-rc.1`。Profile 必须提供原生 Agent Preset、`spawn` 提供者、文件系统服务和已配置的模型。标准 Web profile 提供所需服务；自定义 headless profile 必须显式组合这些能力。

### 安装本地构建

在本包目录执行以下命令。保持在同一 shell 中操作，以继续使用临时 `DSH_HOME`；此 profile 的会话和配置独立保存。

```sh
pnpm install --frozen-lockfile
pnpm run build
export DSH_HOME="$(mktemp -d)"
dsh --profile shadow-dev --from-default-profile web --dump-config > "$DSH_HOME/default-profile.yml"
dsh plugin --profile shadow-dev add "$PWD"
mkdir -p "$DSH_HOME/shadow-minds"
cp examples/completion.md "$DSH_HOME/shadow-minds/completion.md"
```

安装层同时启用调度器、`/shadow` 命令和审查 preset。安装不会自动写入职责定义。复制的完成检查示例为每个人类任务启用一次最终检查；将 [architecture.md](examples/architecture.md) 复制到同一目录可启用概率后台检查。

打开 Web 前，先在开发 profile 中选择适合的模型和工作区。以下补丁将默认工作区文件放在临时 home 内。

```sh
cat > "$DSH_HOME/workspace.patch.yml" <<'YAML'
- id: workspace-controller
  config:
    documentsDirectory: !!js dshHomePath('documents')
YAML
dsh --profile shadow-dev --patch "$DSH_HOME/workspace.patch.yml" --host 127.0.0.1 --port 0 --no-open
```

打开 DSH 输出的本地地址并发送任务。修改源码后重新构建、重启开发进程并硬刷新 Web。使用 `dsh plugin --profile shadow-dev remove dsh-shadow-mind` 移除此安装层。

### 控制审查

命令作用于当前根会话。命令结果显示近期结果和子会话地址；Web 原生子智能体菜单可打开审查记录。

```text
/shadow status
/shadow check
/shadow check completion
/shadow pause
/shadow resume
```

`check` 等待所有已启用职责或指定 id 完成。执行前必须已有一个人类任务；存在并发批次或会话已暂停时会拒绝执行。人工检查忽略触发概率，并计为该任务的最终检查。`pause` 取消活动审查并等待子会话清理；`resume` 启用后续触发，不重放旧工作。暂停状态、已认领检查和近期结果会在会话恢复后保留。

### 定义职责

将顶层 `.md` 文件放在 `$DSH_HOME/shadow-minds` 中。调度器每批重新加载，因此修改会作用于后续激活。可以从随包示例开始；YAML frontmatter 支持以下字段。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `id`, `name` | 去掉 `.md` 的文件名 | 稳定的小写 id 和显示名称。 |
| `enabled` | `true` | 无需删除文件即可禁用职责。 |
| `trigger` | `[final_response]` | 包含 `heartbeat`、`final_response` 或两者的列表。 |
| `activation_probability` | `0.1` | 每次符合条件的心跳触发概率；最终和人工检查始终执行。 |
| `activation_tools` | `[]` | 可选的精确工具名；完成步骤含这些工具时才符合心跳条件。 |
| `run_with_model` | 父会话模型 | 显式 `provider/model`；两者都必须在 profile 中可用。 |
| `reasoning_effort` | 继承设置 | 可选的模型支持的推理设置。 |

Markdown 正文定义审查职责。不支持的字段（包括 `tools`）会报错；职责不能授予额外工具。无效文件会在状态中显示，id 重复的所有职责都会被排除。目录文件数超过上限时整批拒绝执行。

### 限制成本和排查失败

在 profile 补丁中覆盖 `shadow-mind-runtime` 行以修改以下设置；[config.ts](src/config.ts) 定义校验规则及允许范围。

| 设置 | 默认值 | 作用 |
| --- | --- | --- |
| `definitionsDirectory` | `$DSH_HOME/shadow-minds` | 职责文件目录。 |
| `maxParallel` | `2` | 本插件实例的并发审查数。 |
| `timeoutSeconds` | `120` | 单次审查时限，包含等待槽位和启动子会话。 |
| `maxHeartbeatRunsPerTask` | `4` | 每个人类任务的尝试预算；跳过或失败的尝试也消耗预算。 |
| `maxDefinitions` | `16` | 目录中 Markdown 文件的最大数量。 |
| `maxDefinitionBytes` | `16384` | 每个定义的最大字节数。 |
| `maxTrajectoryChars`, `maxEntryChars` | `48000`, `8000` | 轨迹总字符数和单条内容字符数上限。 |
| `maxReportChars` | `4000` | 每个审查者可提交的问题文本长度上限。 |
| `maxOutputTokens` | `4096` | 请求的子会话输出 token 预算。 |

容量占满时后台检查跳过，最终和人工检查排队。新的人类输入会取消上一任务的审查，迟到报告会被丢弃。状态区分 `silent`、`not_relevant`、`failed`、`timeout`、`cancelled` 和 `skipped`；基础设施失败不会被当作审查通过。原生错误可在子会话记录中查看。若上下文超限，请降低轨迹上限或选择上下文窗口更大的模型。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>调度、证据与开发——点击展开</summary>

[调度器](src/index.ts) 观察包含工具执行的 `step/end`，并接入 `agent/turn-stopping`。它先等待未完成的后台工作，再认领最终批次，随后将问题作为中继消息送入主会话。认领归属最新的真实用户消息，因此主智能体修正答案不会再次触发最终审查。

每次激活使用[审查 preset](cordis.patch.yml)、项目指令、有界的[有效轨迹](src/trajectory.ts)和结构化输出启动全新原生子会话。轨迹遵循会话表面的替换记录，省略推理和原始工具结果正文；子会话需要独立读取相关文件。[策略](src/review-policy.ts)过滤对模型展示的工具并拒绝越界调用。它包裹指令加载器，确保预算检查包含新加入的项目指令。

[结果校验](src/report.ts)接受 `report`、`silent` 或 `not_relevant`。报告必须包含可执行问题和至少一个已展示的事件序号引用；引用标识的是已提供的观察，不代表事实已经独立验证。一个批次合并被接受的问题，并按完全相同的文本去重。[会话记录](src/records.ts)保存元数据而不改变模型上下文；被接受的反馈是普通持久消息。插件不会在重启后重放未完成的审查。

发布前运行 `pnpm run typecheck`、`pnpm run build`、`pnpm test` 和 `pnpm run check:package`。测试通过确定性适配器使用生产 AgentLoop、preset 组合和 spawn 提供者。[验收适配器](tests/fixtures/keyless-model.mjs)也可在不调用模型生成 API 的情况下验证真实 Web profile；它不衡量审查质量。

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

[完成检查示例](examples/completion.md)和[架构检查示例](examples/architecture.md)提供可编辑职责。[包元数据](package.json)声明安装层导出和精确 DSH 兼容版本。[pi-shadow-mind](https://github.com/liu-zhengdong/pi-shadow-mind)提供了独立审查的设计启发；本实现使用 DSH 原生会话和激活机制。

-----

<a id="model-experience"></a>
## Model Experience

### 审查上下文与反馈

#### What the model sees

主模型不会获得新工具或持久提示前缀。可执行问题以 `shadow-report` 中继消息送达，附带审查者身份、子会话地址和事件引用。每个全新子会话接收自己的职责、引用的观察、项目指令，以及仅有的 `read`、`grep`、`glob` 和 `structured_output` 工具。人工命令结果和调度元数据不进入模型上下文。

#### Token effect

每次激活都会增加独立模型请求，并可能增加读取工具回合。轨迹、定义、报告、输出、并发和时限都有上限。每次子会话请求前，策略将序列化 UTF-8 字节数加上输出预留，与模型声明的上下文容量比较。这是保守估算，不是分词器或金额上限；模型未声明上下文上限时无法进行该比较。

#### KV Cache effect

主请求前缀保持不变，直至普通反馈扩展其历史。审查子会话共享稳定 preset 文本，但每次接收新的任务证据；跨子会话缓存复用取决于模型提供者。此插件不保证缓存命中改善。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- 最终检查延迟回合完成，但流式答案文本可能在审查结束前显示。问题反馈促使修正，不会隐藏或替换首个答案。
- 只读工具范围不是操作系统沙箱。配置的文件系统提供者控制可读取路径，允许工具名下的自定义实现仍被信任。
- 后台证据来自活动工作区的快照。引用和字节预算不能证明语义正确性、快照隔离或完整覆盖。
- 插件需要原生本地 `spawn` 提供者和 preset 组合。没有自定义面板、职责管理工具或中断审查自动重放。会话格式迁移可能省略插件元数据。
- 真实模型审查质量、Linux/Windows 验收和自定义 headless 组合尚未验证。

<a id="dev-note"></a>
### Dev Note

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
