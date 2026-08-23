/**
 * The Shadow Mind card inside the plugin settings page
 * (`settings.plugin.item`, keyed by the `shadow-mind` namespace).
 *
 * Self-drawn chrome: the tree-in PluginCard/ValueField live in another
 * plugin's client package, which this bundle must not value-import. Layout,
 * font sizes, and tokens follow the shared settings-page conventions
 * (13px labels and controls, 12px hints, 11px badges).
 */
import { useState, type CSSProperties, type JSX } from "react";
import type { InjectFace, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
// Side-effect type import: pulls the `settings.plugin.item` SlotMap entry
// (declared by the settings-plugins package) into this program.
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type { ShadowSettingsCardFace } from "./settings-card-controller.js";

export type ShadowSettingsCardProps = PropsRuntime<"settings.plugin.item"> &
  InjectFace<ShadowSettingsCardFace>;

const cardStyle: CSSProperties = {
  borderTop: "1px solid var(--dsw-alias-border-l2)",
  padding: "14px 16px",
};

const headStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  border: "none",
  background: "none",
  padding: 0,
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

const titleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  lineHeight: "22px",
  color: "var(--dsw-alias-label-primary)",
};

const descriptionStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 11,
  lineHeight: "17px",
  color: "var(--dsw-alias-label-tertiary)",
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "12px 0",
};

const fieldHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const labelStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  fontWeight: 500,
  lineHeight: "20px",
  color: "var(--dsw-alias-label-primary)",
};

const badgeStyle: CSSProperties = {
  borderRadius: 999,
  padding: "1px 8px",
  fontSize: 11,
  lineHeight: "17px",
  whiteSpace: "nowrap",
  fontWeight: 500,
  background: "var(--dsw-alias-bg-module-platform)",
  color: "var(--dsw-alias-label-secondary)",
};

const resetStyle: CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  font: "inherit",
  fontSize: 12,
  lineHeight: "18px",
  color: "var(--dsw-alias-label-secondary)",
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  height: 34,
  padding: "0 12px",
  border: "1px solid var(--dsw-alias-border-l2)",
  borderRadius: 8,
  background: "var(--dsw-alias-bg-layer-3)",
  font: "inherit",
  fontSize: 13,
  lineHeight: "20px",
  color: "var(--dsw-alias-label-primary)",
};

const invalidInputStyle: CSSProperties = {
  ...inputStyle,
  borderColor: "var(--dsw-alias-label-error)",
};

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: "18px",
  color: "var(--dsw-alias-label-tertiary)",
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: "18px",
  color: "var(--dsw-alias-label-error)",
};

const footerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  paddingTop: 12,
};

const buttonStyle: CSSProperties = {
  height: 28,
  padding: "0 12px",
  border: "1px solid var(--dsw-alias-border-l2)",
  borderRadius: 6,
  background: "var(--dsw-alias-bg-layer-3)",
  font: "inherit",
  fontSize: 13,
  lineHeight: "18px",
  color: "var(--dsw-alias-label-primary)",
  cursor: "pointer",
};

/** One labelled control row with its override badge, reset, and hint. */
function FieldRow(props: {
  id: string;
  label: string;
  hint: string;
  text: string;
  overridden: boolean;
  invalid: boolean;
  disabled: boolean;
  numeric?: boolean;
  options?: Array<{ value: string; label: string }>;
  onEdit(text: string): void;
  onReset(): void;
}): JSX.Element {
  return (
    <div style={fieldStyle}>
      <div style={fieldHeadStyle}>
        <label style={labelStyle} htmlFor={props.id}>{props.label}</label>
        {props.overridden && <span style={badgeStyle}>已覆盖</span>}
        {props.overridden && (
          <button style={resetStyle} type="button" disabled={props.disabled} onClick={props.onReset}>
            重置
          </button>
        )}
      </div>
      {props.options ? (
        <select
          id={props.id}
          style={props.invalid ? invalidInputStyle : inputStyle}
          disabled={props.disabled}
          value={props.text}
          onChange={(event) => props.onEdit(event.target.value)}
        >
          {props.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <input
          id={props.id}
          style={props.invalid ? invalidInputStyle : inputStyle}
          disabled={props.disabled}
          inputMode={props.numeric ? "decimal" : undefined}
          value={props.text}
          onChange={(event) => props.onEdit(event.target.value)}
        />
      )}
      {props.invalid ? <p style={errorStyle}>输入无效，保存将被阻止</p> : <p style={hintStyle}>{props.hint}</p>}
    </div>
  );
}

/**
 * Render the Shadow Mind settings card.
 * @param props - the injected form face bound by the slot entry.
 * @returns the card, or nothing while the namespace is unavailable.
 */
export function ShadowSettingsCard(props: ShadowSettingsCardProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const state = props.useShadowSettingsCard((snapshot) => snapshot);
  if (!state.available) return null;
  const disabled = !state.writable || state.saving;
  const f = state.fields;
  return (
    <div style={cardStyle}>
      <button style={headStyle} type="button" onClick={() => setOpen((value) => !value)}>
        <span style={{ ...titleStyle, flex: 1 }}>Shadow Mind</span>
        {(state.dirty || state.failed) && <span style={badgeStyle}>{state.failed ? "保存失败" : "未保存"}</span>}
        <span style={{ ...descriptionStyle, margin: 0 }}>{open ? "收起" : "展开"}</span>
      </button>
      <p style={descriptionStyle}>心跳调度、并行上限、默认模型与超时；保存在用户设置文档中。</p>
      {open && (
        <div>
          <FieldRow
            id="shadow-config-heartbeat"
            label="心跳激活概率"
            hint="每次符合条件的回合结束时，各 Shadow 独立按此概率激活；0 到 1。"
            {...f.heartbeatProbability}
            numeric
            disabled={disabled}
            onEdit={(text) => props.edit("heartbeatProbability", text)}
            onReset={() => props.resetField("heartbeatProbability")}
          />
          <FieldRow
            id="shadow-config-parallel"
            label="最大并行 Shadow 数"
            hint="同时运行的 Shadow 上限，1 到 8。"
            {...f.maxParallelShadows}
            numeric
            disabled={disabled}
            onEdit={(text) => props.edit("maxParallelShadows", text)}
            onReset={() => props.resetField("maxParallelShadows")}
          />
          <FieldRow
            id="shadow-config-timeout"
            label="默认运行超时（秒）"
            hint="单个 Shadow 未显式配置 timeout_seconds 时使用。"
            {...f.defaultShadowTimeoutSeconds}
            numeric
            disabled={disabled}
            onEdit={(text) => props.edit("defaultShadowTimeoutSeconds", text)}
            onReset={() => props.resetField("defaultShadowTimeoutSeconds")}
          />
          <FieldRow
            id="shadow-config-drain"
            label="退出排空窗口（秒）"
            hint="进程退出前等待未完成 Shadow 报告的最长时间。"
            {...f.headlessDrainTimeoutSeconds}
            numeric
            disabled={disabled}
            onEdit={(text) => props.edit("headlessDrainTimeoutSeconds", text)}
            onReset={() => props.resetField("headlessDrainTimeoutSeconds")}
          />
          <FieldRow
            id="shadow-config-batch"
            label="报告合并窗口（毫秒）"
            hint="多条 report_to_main 在此窗口内合并为一次唤醒。"
            {...f.resultBatchWindowMs}
            numeric
            disabled={disabled}
            onEdit={(text) => props.edit("resultBatchWindowMs", text)}
            onReset={() => props.resetField("resultBatchWindowMs")}
          />
          <FieldRow
            id="shadow-config-model"
            label="默认 Shadow 模型"
            hint="留空表示跟随 Main 会话当前模型。"
            {...f.defaultShadowModel}
            disabled={disabled}
            onEdit={(text) => props.edit("defaultShadowModel", text)}
            onReset={() => props.resetField("defaultShadowModel")}
          />
          <FieldRow
            id="shadow-config-thinking"
            label="默认 thinking level"
            hint="Shadow 子会话的推理力度；重置后回退继承值。"
            {...f.defaultThinkingLevel}
            disabled={disabled}
            options={[
              { value: "minimal", label: "minimal" },
              { value: "low", label: "low" },
              { value: "medium", label: "medium" },
              { value: "high", label: "high" },
            ]}
            onEdit={(text) => props.edit("defaultThinkingLevel", text)}
            onReset={() => props.resetField("defaultThinkingLevel")}
          />
          <FieldRow
            id="shadow-config-seed"
            label="随机种子"
            hint="固定后心跳调度可复现；留空为随机。下次会话生效。"
            {...f.randomSeed}
            numeric
            disabled={disabled}
            onEdit={(text) => props.edit("randomSeed", text)}
            onReset={() => props.resetField("randomSeed")}
          />
          <div style={footerStyle}>
            <button
              style={buttonStyle}
              type="button"
              disabled={!state.writable || state.saving || !state.dirty || state.invalid}
              onClick={props.save}
            >
              {state.saving ? "保存中…" : "保存"}
            </button>
            <button
              style={buttonStyle}
              type="button"
              disabled={!state.dirty && !state.failed}
              onClick={props.discard}
            >
              放弃修改
            </button>
            {!state.writable && <p style={hintStyle}>当前设置文档为只读。</p>}
          </div>
        </div>
      )}
    </div>
  );
}
