# Communication style

- 默认使用简单、结论优先的叙述方式。讨论设计或方案时，先说明核心思路、主要差异和推荐结论。
- 不要主动展开文件级改动清单、接口细节、完整边界情况或冗长实现步骤；只有用户明确要求深入时再补充。
- 能用几段短文说明的内容，不要写成长篇分层方案。避免术语堆叠，并保持用户无需反复阅读就能理解。

# Architecture preferences

- 设计阶段就避免以不断增长的 `if/else`、`switch` 或类型判断承载业务差异。优先使用清晰的职责拆分、策略分派、注册表和组合；必要的输入校验与简单控制流不受此限制。
- 不允许出现上帝组件、上帝对象或持续膨胀的入口文件。状态和行为必须放在实际拥有该职责的模块中；入口层只负责组合、编排和暴露能力。
- 新能力落地前先确定所有者和扩展点。若实现主要是在大型组件或主流程中追加状态、分支和方法，应先拆出独立职责，再接入外层。

# UI font-size rules

- 字号按信息角色统一，不随组件随意放大：页面标题约 `22px`，连续正文与主要输入约 `14px`，常规按钮、菜单、导航和列表约 `13px`，辅助说明与紧凑控件约 `11px`，代码约 `12px`。
- 优先复用项目已有的字号 token 或共用类，不散落新的任意字号；确有特殊层级时才局部覆盖，并保持同类组件一致。
- 密集工具栏、Composer 操作行、状态切换和菜单项不能直接沿用组件库偏大的默认字号，应主动校准到 `11–13px`。
- `10px` 只用于极弱、非关键元数据，不用于正文、操作标签、表单内容或必须快速识别的状态；不要用缩小字体代替合理的布局和截断。
- 缩小字号时同步检查行高、图标尺寸、对齐、焦点环和点击区域；文字可以紧凑，但交互命中区不得随之缩小。

# Release process

dsh-plugin 通过 `dsh plugin --profile <profile> add <npm 包名或本地路径>` 安装，不生成 standalone ZIP 等额外交付物；发布产物只有 npm 包。用户安装方式：

- 从 npm 安装：`dsh plugin --profile web add @winterchenhuan/dsh-shadow-mind`
- 本地目录开发：`npm run build` 后 `dsh plugin --profile web add ./dsh-shadow-mind`

1. 发布前更新 `package.json` 版本，并运行 `npm install` 同步 lockfile。不要覆盖同版本的既有正式产物；代码有变化时应提升版本。
2. 运行 `npm run verify`，要求类型检查及全部测试通过。
3. 运行 `npm run build`，确认扩展入口为 `dist/index.js`，包内不分发 `src/` 和测试。`yaml` 等运行时依赖声明在 `dependencies` 中，由 npm 安装时自动解析；`@deepseek-ai/*` 等 DSH 核心包保持在 `peerDependencies`/external。
4. 用 `npm pack --dry-run` 检查包内容：应包含 `dist/`、`cordis.patch.yml`、`README.md`、`DESIGN.md`，不含 `src/` 和测试文件。
5. 冒烟检查：在隔离目录中用 Node 直接 import `dist/index.js`，确认默认导出为 Cordis 插件工厂且无加载错误；随后通过 `dsh plugin --profile <profile> add <本地路径>` 注册并启动 DSH，确认可识别 `/shadow` 命令和全部管理工具。加载待测入口时避免本机已配置的同名插件造成假冲突。
6. 运行 `npm publish`（`prepublishOnly` 会自动执行 `npm run verify`，`prepack` 自动构建）。发布后确认 registry 的 `latest` 指向新版本。
