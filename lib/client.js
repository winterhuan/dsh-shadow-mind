window.__ModuleLoader__.load({
	id: "@winterhuan/dsh-shadow-mind",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let zod = require("zod");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react = require("react");
		// node_modules/.pnpm/@deepseek-ai+dsh-typert-protocol@0.2.2-rc.1_@deepseek-ai+cordis@4.1.0/node_modules/@deepseek-ai/dsh-typert-protocol/lib/types/remote-info.js
		/** Lazy assembly of generated Remote definitions using caller-supplied Zod; no runtime imports. */
		/**
		* Retain one generated definition per endpoint without constructing parsers or projections.
		* The class instance builds its shared descriptor/method index on first access;
		* input schemas and JSON Schema projections are cached only when requested.
		* @param spec - compiler-produced method facts and Zod factories.
		* @param zod - the generated artifact's Zod runtime for named-input parsers.
		* @returns a lazy, mountable info instance with no registration or transport effects.
		*/
		function createTypertRemoteInfo(spec, zod) {
			return new RemoteInfo(spec, zod);
		}
		var RemoteInfo = class {
			spec;
			zod;
			index;
			constructor(spec, zod) {
				this.spec = spec;
				this.zod = zod;
			}
			get package() {
				return this.spec.package;
			}
			get descriptors() {
				return this.resolve().descriptors;
			}
			get methods() {
				return this.resolve().methods;
			}
			resolve() {
				if (this.index !== void 0) return this.index;
				const zod = this.zod;
				const descriptors = [];
				const methods = Object.create(null);
				for (const [endpoint, definition] of Object.entries(this.spec.methods)) {
					const separator = endpoint.indexOf("/");
					const namespace = endpoint.slice(0, separator);
					const method = endpoint.slice(separator + 1);
					const parameters = definition.parameters.map((parameter) => ({
						...parameter,
						wire: parameter.wire ?? parameter.name
					}));
					const descriptor = {
						...definition,
						id: `${this.spec.package}#${endpoint}`,
						namespace,
						method,
						parameters,
						result: definition.result.description === void 0 ? definition.result : new ResultValue(definition.result)
					};
					if (definition.invocation.kind === "direct") {
						const inputs = [];
						methods[endpoint] = Object.assign(descriptor, {
							input(options) {
								const strict = options?.strict === true;
								return inputs[strict ? 1 : 0] ??= new NamedInput(parameters, strict, zod);
							},
							invoke(remote, input, signal) {
								const named = input;
								const values = parameters.map((parameter) => named[parameter.wire]);
								if (definition.cancellation !== void 0) values.push(signal);
								const receiver = Reflect.get(remote, namespace);
								return Reflect.get(receiver, method).apply(receiver, values);
							}
						});
					}
					descriptors.push(descriptor);
				}
				return this.index = {
					descriptors,
					methods
				};
			}
		};
		function optional(parameter) {
			return parameter.source === "json" && parameter.acceptsUndefined === true;
		}
		var NamedInput = class {
			parameters;
			strict;
			zod;
			schema;
			projection;
			constructor(parameters, strict, zod) {
				this.parameters = parameters;
				this.strict = strict;
				this.zod = zod;
			}
			codec(parameter) {
				return this.strict ? parameter.strictCodec : parameter.codec;
			}
			create = () => this.schema ??= this.zod.strictObject(Object.fromEntries(this.parameters.map((parameter) => {
				const value = this.codec(parameter).create();
				return [parameter.wire, optional(parameter) ? value.optional() : value.nonoptional()];
			})));
			get jsonSchema() {
				return this.project().jsonSchema;
			}
			get jsonSchemaError() {
				return this.project().jsonSchemaError;
			}
			project() {
				if (this.projection !== void 0) return this.projection;
				const unavailable = this.parameters.find((parameter) => this.codec(parameter).jsonSchema === void 0);
				if (unavailable !== void 0) return this.projection = { jsonSchemaError: this.codec(unavailable).jsonSchemaError ?? `No JSON Schema for parameter ${unavailable.wire}` };
				return this.projection = { jsonSchema: {
					type: "object",
					properties: Object.fromEntries(this.parameters.map((parameter) => [parameter.wire, {
						...this.codec(parameter).jsonSchema,
						...parameter.description === void 0 ? {} : { description: parameter.description }
					}])),
					required: this.parameters.filter((parameter) => !optional(parameter)).map((parameter) => parameter.wire),
					additionalProperties: false
				} };
			}
		};
		var ResultValue = class {
			spec;
			projection;
			constructor(spec) {
				this.spec = spec;
			}
			get mode() {
				return this.spec.mode;
			}
			get typeSymbol() {
				return this.spec.typeSymbol;
			}
			get create() {
				return this.spec.create;
			}
			get decode() {
				return this.spec.decode;
			}
			get encode() {
				return this.spec.encode;
			}
			get description() {
				return this.spec.description;
			}
			get jsonSchemaError() {
				return this.spec.jsonSchemaError;
			}
			get jsonSchema() {
				if (this.projection === void 0) {
					const schema = this.spec.jsonSchema;
					this.projection = { value: schema === void 0 ? void 0 : {
						...schema,
						description: this.spec.description
					} };
				}
				return this.projection.value;
			}
		};
		// lib/typert.remote-client.js
		let _winterhuan_dsh_shadow_mind_shadowMind_snapshot_parameter_0$schema$value;
		const _winterhuan_dsh_shadow_mind_shadowMind_snapshot_parameter_0$schema = () => _winterhuan_dsh_shadow_mind_shadowMind_snapshot_parameter_0$schema$value ??= zod.z.string();
		let _winterhuan_dsh_shadow_mind_shadowMind_snapshot_result$schema$value;
		const _winterhuan_dsh_shadow_mind_shadowMind_snapshot_result$schema = () => _winterhuan_dsh_shadow_mind_shadowMind_snapshot_result$schema$value ??= zod.z.object({
			"present": zod.z.boolean(),
			"paused": zod.z.boolean(),
			"autoEnabled": zod.z.boolean(),
			"epoch": zod.z.number(),
			"activeCount": zod.z.number(),
			"running": zod.z.array(zod.z.object({
				"childId": zod.z.string(),
				"shadowId": zod.z.string(),
				"startedAt": zod.z.number(),
				"timeoutMs": zod.z.number()
			})),
			"eventCount": zod.z.number(),
			"recentEvents": zod.z.array(zod.z.object({
				"seq": zod.z.number(),
				"at": zod.z.string(),
				"kind": zod.z.string(),
				"data": zod.z.union([zod.z.undefined(), zod.z.string()]).optional()
			})),
			"shadows": zod.z.array(zod.z.object({
				"id": zod.z.string(),
				"name": zod.z.string(),
				"enabled": zod.z.boolean(),
				"activationProbability": zod.z.number(),
				"tools": zod.z.array(zod.z.string())
			})),
			"diagnostics": zod.z.array(zod.z.object({
				"filePath": zod.z.string(),
				"message": zod.z.string()
			})),
			"heartbeatProbability": zod.z.number(),
			"maxParallelShadows": zod.z.number(),
			"defaultShadowTimeoutSeconds": zod.z.number(),
			"defaultShadowModel": zod.z.union([zod.z.literal(null), zod.z.string()])
		});
		let _winterhuan_dsh_shadow_mind_shadowMind_snapshot_parameter_0_strict$schema$value;
		const _winterhuan_dsh_shadow_mind_shadowMind_snapshot_parameter_0_strict$schema = () => _winterhuan_dsh_shadow_mind_shadowMind_snapshot_parameter_0_strict$schema$value ??= zod.z.string();
		const TYPERT_REMOTE = createTypertRemoteInfo({
			package: "@winterhuan/dsh-shadow-mind",
			methods: { "shadowMind/snapshot": {
				service: "shadowMind",
				description: "Return only the live state owned by the requested root Session.",
				invocation: { kind: "direct" },
				parameters: [{
					name: "sessionId",
					source: "json",
					codec: {
						mode: "strict",
						typeSymbol: "@winterhuan/dsh-shadow-mind#shadowMind/snapshot:sessionId",
						create: _winterhuan_dsh_shadow_mind_shadowMind_snapshot_parameter_0$schema,
						jsonSchema: { "type": "string" }
					},
					strictCodec: {
						mode: "strict",
						typeSymbol: "@winterhuan/dsh-shadow-mind#shadowMind/snapshot:sessionId",
						create: _winterhuan_dsh_shadow_mind_shadowMind_snapshot_parameter_0_strict$schema,
						jsonSchema: { "type": "string" }
					}
				}],
				cancellation: { parameter: "signal" },
				result: {
					mode: "strict",
					typeSymbol: "@winterhuan/dsh-shadow-mind/types#ShadowMindSnapshot",
					create: _winterhuan_dsh_shadow_mind_shadowMind_snapshot_result$schema,
					jsonSchema: {
						"type": "object",
						"properties": {
							"present": { "type": "boolean" },
							"paused": { "type": "boolean" },
							"autoEnabled": { "type": "boolean" },
							"epoch": { "type": "number" },
							"activeCount": { "type": "number" },
							"running": {
								"type": "array",
								"items": {
									"type": "object",
									"properties": {
										"childId": { "type": "string" },
										"shadowId": { "type": "string" },
										"startedAt": { "type": "number" },
										"timeoutMs": { "type": "number" }
									},
									"required": [
										"childId",
										"shadowId",
										"startedAt",
										"timeoutMs"
									],
									"additionalProperties": true
								}
							},
							"eventCount": { "type": "number" },
							"recentEvents": {
								"type": "array",
								"items": {
									"type": "object",
									"properties": {
										"seq": { "type": "number" },
										"at": { "type": "string" },
										"kind": { "type": "string" },
										"data": { "type": "string" }
									},
									"required": [
										"seq",
										"at",
										"kind"
									],
									"additionalProperties": true
								}
							},
							"shadows": {
								"type": "array",
								"items": {
									"type": "object",
									"properties": {
										"id": { "type": "string" },
										"name": { "type": "string" },
										"enabled": { "type": "boolean" },
										"activationProbability": { "type": "number" },
										"tools": {
											"type": "array",
											"items": { "type": "string" }
										}
									},
									"required": [
										"id",
										"name",
										"enabled",
										"activationProbability",
										"tools"
									],
									"additionalProperties": true
								}
							},
							"diagnostics": {
								"type": "array",
								"items": {
									"type": "object",
									"properties": {
										"filePath": { "type": "string" },
										"message": { "type": "string" }
									},
									"required": ["filePath", "message"],
									"additionalProperties": true
								}
							},
							"heartbeatProbability": { "type": "number" },
							"maxParallelShadows": { "type": "number" },
							"defaultShadowTimeoutSeconds": { "type": "number" },
							"defaultShadowModel": { "oneOf": [{
								"type": "null",
								"const": null
							}, { "type": "string" }] }
						},
						"required": [
							"present",
							"paused",
							"autoEnabled",
							"epoch",
							"activeCount",
							"running",
							"eventCount",
							"recentEvents",
							"shadows",
							"diagnostics",
							"heartbeatProbability",
							"maxParallelShadows",
							"defaultShadowTimeoutSeconds",
							"defaultShadowModel"
						],
						"additionalProperties": true
					}
				},
				sourceLocation: {
					"file": "packages/shadow-mind/src/index.ts",
					"line": 313,
					"column": 9
				}
			} }
		}, zod.z);
		// lib/types/client/locales.js
		const en = {
			title: "Shadow Mind",
			description: "Configure independent reviews and inspect their activity for this Session.",
			active: "Active",
			paused: "Paused",
			unavailable: "This plugin is not loaded, so its settings are unavailable.",
			connectionError: "Shadow status could not be refreshed.",
			activeRuns: "Active runs",
			configuredShadows: "Responsibilities",
			recordedEvents: "Recorded events",
			diagnostics: "Diagnostics",
			noAgent: "No active Agent for this Session.",
			heartbeatProbability: "Heartbeat probability",
			heartbeatTools: "Heartbeat tool names",
			maxParallel: "Maximum parallel runs",
			timeoutSeconds: "Default timeout (seconds)",
			resultBatchWindowMs: "Report batch window (ms)",
			maxHeartbeatRunsPerTask: "Heartbeat runs per task",
			defaultShadowModel: "Default model (provider/model)",
			defaultThinkingLevel: "Default thinking level",
			overridden: "Overridden",
			reset: "Reset to default",
			readOnly: "This deployment stores settings read-only.",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
			invalidNumber: "Enter a valid number, or leave blank to use the default."
		};
		const zh = {
			title: "Shadow Mind",
			description: "配置独立审查，并查看当前会话的运行情况。",
			active: "运行中",
			paused: "已暂停",
			unavailable: "插件未加载，当前无法配置。",
			connectionError: "无法刷新 Shadow 状态。",
			activeRuns: "运行任务",
			configuredShadows: "职责数",
			recordedEvents: "已记录事件",
			diagnostics: "诊断",
			noAgent: "当前会话没有运行中的 Agent。",
			heartbeatProbability: "心跳触发概率",
			heartbeatTools: "心跳工具名称",
			maxParallel: "最大并行运行数",
			timeoutSeconds: "默认超时（秒）",
			resultBatchWindowMs: "报告合并窗口（毫秒）",
			maxHeartbeatRunsPerTask: "每项任务心跳运行上限",
			defaultShadowModel: "默认模型（provider/model）",
			defaultThinkingLevel: "默认思考级别",
			overridden: "已覆盖",
			reset: "恢复默认",
			readOnly: "本部署的设置为只读。",
			save: "保存",
			saving: "保存中…",
			saveFailed: "本部署未接受这些值，草稿已保留供修改。",
			invalidNumber: "请输入有效数字；留空表示恢复默认值。"
		};
		function formLabels(t) {
			return {
				unavailable: t("unavailable"),
				readOnly: t("readOnly"),
				saveFailed: t("saveFailed"),
				save: t("save"),
				saving: t("saving")
			};
		}
		// lib/types/client/ShadowMindCard.js
		/** Settings page for the profile fields Shadow Mind exposes to users. */
		function ShadowMindCard(props) {
			const state = props.useShadowSettings((snapshot) => snapshot);
			if (props.view === "summary") return props.t("description");
			const disabled = !state.writable;
			const field = (name, label, numeric = false) => (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
				id: `plugin-config-shadow-${name}`,
				label: props.t(label),
				overriddenLabel: props.t("overridden"),
				resetLabel: props.t("reset"),
				invalidLabel: props.t("invalidNumber"),
				numeric,
				disabled,
				...state[name],
				onEdit: (text) => {
					props.edit(name, text);
				},
				onReset: () => {
					props.resetField(name);
				}
			});
			return (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.SettingsForm, {
				labels: formLabels(props.t),
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					field("heartbeatProbability", "heartbeatProbability", true),
					field("heartbeatTools", "heartbeatTools"),
					field("maxParallel", "maxParallel", true),
					field("timeoutSeconds", "timeoutSeconds", true),
					field("resultBatchWindowMs", "resultBatchWindowMs", true),
					field("maxHeartbeatRunsPerTask", "maxHeartbeatRunsPerTask", true),
					field("defaultShadowModel", "defaultShadowModel"),
					field("defaultThinkingLevel", "defaultThinkingLevel")
				]
			});
		}
		// lib/types/client/settings-controller.js
		/** Host entry id owning Shadow Mind's live profile values. */
		const SHADOW_SETTINGS_NS = "shadow-mind-runtime";
		const listField = (field) => ({
			field,
			format: (value) => Array.isArray(value) && value.every((item) => typeof item === "string") ? value.join(", ") : "",
			parse: (text) => ({
				kind: "set",
				value: text.split(",").map((item) => item.trim()).filter(Boolean)
			})
		});
		var ShadowSettingsController = class {
			form;
			store;
			constructor(scope) {
				this.form = new _deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(scope, [
					(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("heartbeatProbability"),
					listField("heartbeatTools"),
					(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("maxParallel"),
					(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("timeoutSeconds"),
					(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("resultBatchWindowMs"),
					(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("maxHeartbeatRunsPerTask"),
					(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("defaultShadowModel"),
					(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("defaultThinkingLevel")
				]);
				this.store = this.form.bind(() => this.projection());
			}
			projection() {
				return {
					...this.form.shell(),
					heartbeatProbability: this.form.field("heartbeatProbability"),
					heartbeatTools: this.form.field("heartbeatTools"),
					maxParallel: this.form.field("maxParallel"),
					timeoutSeconds: this.form.field("timeoutSeconds"),
					resultBatchWindowMs: this.form.field("resultBatchWindowMs"),
					maxHeartbeatRunsPerTask: this.form.field("maxHeartbeatRunsPerTask"),
					defaultShadowModel: this.form.field("defaultShadowModel"),
					defaultThinkingLevel: this.form.field("defaultThinkingLevel")
				};
			}
			inject() {
				return {
					hooks: { shadowSettings: this.store },
					...this.form.actions()
				};
			}
			dispose() {
				this.form.dispose();
			}
		};
		// lib/types/client/snapshot-controller.js
		/** Session-keyed Remote polling shared by both conversation status slots. */
		/** Owns one poll loop per mounted root Session and cancels it when unused. */
		var ShadowSnapshotController = class {
			remote;
			intervalMs;
			entries = /* @__PURE__ */ new Map();
			constructor(remote, intervalMs = 2e3) {
				this.remote = remote;
				this.intervalMs = intervalMs;
			}
			storeFor(sessionId) {
				return this.entry(sessionId).store;
			}
			watch(sessionId) {
				const entry = this.entry(sessionId);
				entry.references += 1;
				if (entry.references === 1) this.poll(sessionId, entry);
				return () => {
					if (this.entries.get(sessionId) !== entry) return;
					entry.references = Math.max(0, entry.references - 1);
					if (entry.references > 0) return;
					if (entry.timer !== void 0) clearTimeout(entry.timer);
					entry.request?.abort(/* @__PURE__ */ new Error("Shadow status slot unmounted"));
					this.entries.delete(sessionId);
				};
			}
			dispose() {
				for (const [sessionId, entry] of this.entries) {
					if (entry.timer !== void 0) clearTimeout(entry.timer);
					entry.request?.abort(/* @__PURE__ */ new Error("Shadow client disposed"));
					this.entries.delete(sessionId);
				}
			}
			entry(sessionId) {
				let entry = this.entries.get(sessionId);
				if (entry === void 0) {
					entry = {
						store: (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({ status: "loading" }),
						references: 0
					};
					this.entries.set(sessionId, entry);
				}
				return entry;
			}
			async poll(sessionId, entry) {
				if (entry.references === 0 || this.entries.get(sessionId) !== entry) return;
				const request = new AbortController();
				entry.request?.abort(/* @__PURE__ */ new Error("Shadow status refresh superseded"));
				entry.request = request;
				try {
					const result = await this.remote.snapshot(sessionId, request.signal);
					if (request.signal.aborted || this.entries.get(sessionId) !== entry) return;
					if (result.ok) entry.store.set({
						status: "ready",
						snapshot: result.value
					});
					else entry.store.set({
						status: "error",
						...entry.store.getSnapshot().snapshot === void 0 ? {} : { snapshot: entry.store.getSnapshot().snapshot }
					});
				} catch (_error) {
					if (!request.signal.aborted && this.entries.get(sessionId) === entry) {
						const current = entry.store.getSnapshot();
						entry.store.set({
							status: "error",
							...current.snapshot === void 0 ? {} : { snapshot: current.snapshot }
						});
					}
				} finally {
					if (entry.request === request) entry.request = void 0;
					if (entry.references > 0 && this.entries.get(sessionId) === entry) entry.timer = setTimeout(() => {
						this.poll(sessionId, entry);
					}, this.intervalMs);
				}
			}
		};
		// \0dsh-css:/home/maiscrm/projects/dsh-creative/plugins/dsh-shadow-mind/src/client/StatusBand.module.css.mjs
		const css = ".qvO_gG_band{align-items:center;gap:var(--dsh-space-2,8px) var(--dsh-space-4,16px);min-height:28px;color:var(--dsh-ink-secondary,#555);flex-wrap:wrap;padding:4px 12px;font-size:12px;display:flex}.qvO_gG_title{color:var(--dsh-ink-primary,#222);font-weight:500}";
		const tagId = "@winterhuan/dsh-shadow-mind/StatusBand.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@winterhuan/dsh-shadow-mind";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var StatusBand_module_css_default = {
			"band": "qvO_gG_band",
			"title": "qvO_gG_title"
		};
		// lib/types/client/StatusBand.js
		/** Session-scoped Shadow activity summary beneath the composer. */
		function ShadowStatusBand(props) {
			const state = props.useShadowSnapshot((snapshot) => snapshot);
			(0, react.useEffect)(() => props.controller.watch(props.sessionId), [props.controller, props.sessionId]);
			if (state.status === "loading" && state.snapshot === void 0) return null;
			if (state.status === "error" && state.snapshot === void 0) return (0, react_jsx_runtime.jsx)("div", {
				className: StatusBand_module_css_default.band,
				role: "status",
				children: props.t("connectionError")
			});
			const snapshot = state.snapshot;
			if (snapshot === void 0 || !snapshot.present) return (0, react_jsx_runtime.jsx)("div", {
				className: StatusBand_module_css_default.band,
				role: "status",
				children: props.t("noAgent")
			});
			return (0, react_jsx_runtime.jsxs)("div", {
				className: StatusBand_module_css_default.band,
				role: "status",
				"aria-live": "polite",
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						className: StatusBand_module_css_default.title,
						children: props.t(snapshot.paused ? "paused" : "active")
					}),
					(0, react_jsx_runtime.jsxs)("span", { children: [
						props.t("activeRuns"),
						": ",
						snapshot.activeCount,
						"/",
						snapshot.maxParallelShadows
					] }),
					(0, react_jsx_runtime.jsxs)("span", { children: [
						props.t("configuredShadows"),
						": ",
						snapshot.shadows.length
					] }),
					(0, react_jsx_runtime.jsxs)("span", { children: [
						props.t("recordedEvents"),
						": ",
						snapshot.eventCount
					] }),
					snapshot.diagnostics.length > 0 ? (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
						tone: "warning",
						children: [
							props.t("diagnostics"),
							": ",
							snapshot.diagnostics.length
						]
					}) : null
				]
			});
		}
		// lib/types/client/StatusChip.js
		/** Compact Shadow state beside the current Session's input controls. */
		function ShadowStatusChip(props) {
			const state = props.useShadowSnapshot((snapshot) => snapshot);
			(0, react.useEffect)(() => props.controller.watch(props.sessionId), [props.controller, props.sessionId]);
			if (state.status === "loading" && state.snapshot === void 0) return null;
			if (state.status === "error" && state.snapshot === void 0) return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
				tone: "warning",
				children: props.t("connectionError")
			});
			const snapshot = state.snapshot;
			if (snapshot === void 0 || !snapshot.present) return null;
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
				tone: snapshot.paused ? "neutral" : "success",
				children: props.t(snapshot.paused ? "paused" : "active")
			});
		}
		// lib/types/client/index.js
		const NS = "settings.shadowMind";
		const inject = [
			"remote",
			"slots",
			"locale",
			"configForms"
		];
		async function apply(ctx, _config) {
			const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE);
			const ui = ctx.inject(["remote.shadowMind"], (current) => mount(current));
			try {
				await ui;
			} catch (error) {
				try {
					await ui.dispose();
				} finally {
					await disposeRemote();
				}
				throw error;
			}
			return async () => {
				try {
					await ui.dispose();
				} finally {
					await disposeRemote();
				}
			};
		}
		function mount(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				en,
				zh
			}), "shadow-mind: dictionaries");
			const t = ctx.locale.bind(NS);
			const form = new ShadowSettingsController(ctx.configForms.get(SHADOW_SETTINGS_NS));
			const snapshots = new ShadowSnapshotController(ctx.remote.shadowMind);
			ctx.effect(() => () => {
				form.dispose();
				snapshots.dispose();
			}, "shadow-mind: client state");
			ctx.effect(() => ctx.configForms.whileServed([SHADOW_SETTINGS_NS], () => ctx.slots.inject("plugins.item", () => ctx.slots.register({
				name: "plugins.item",
				id: "shadow-mind",
				order: 45,
				label: () => t("title"),
				locale: NS,
				inject: () => form.inject()
			}, ShadowMindCard))), "shadow-mind: settings page");
			ctx.effect(() => ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "shadow-mind-status",
				order: 40,
				locale: NS,
				inject: (sessionId) => ({
					hooks: { shadowSnapshot: snapshots.storeFor(sessionId) },
					controller: snapshots
				})
			}, ShadowStatusChip)), "shadow-mind: session status");
			ctx.effect(() => ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "shadow-mind-status",
				order: 40,
				locale: NS,
				inject: (sessionId) => ({
					hooks: { shadowSnapshot: snapshots.storeFor(sessionId) },
					controller: snapshots
				})
			}, ShadowStatusBand)), "shadow-mind: activity band");
		}
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map