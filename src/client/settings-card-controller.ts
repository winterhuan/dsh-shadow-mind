/**
 * Staged form over the `shadow-mind` settings namespace for the plugin
 * settings page.
 *
 * Mirrors the tree-in `CardForm` pattern (ui-settings-plugins) without
 * importing it: a client bundle must not value-import another plugin's
 * package, so this module re-implements the small staged-draft model it
 * needs. Drafts stay local until save; each save is one revision-fenced
 * document write per changed field; a field shows whether saving would
 * leave a user-layer override (presence in the raw user layer, not a value
 * comparison).
 */
import type {
  SettingsScope,
  SettingsScopeSnapshot,
  SnapshotStore,
} from "@deepseek-ai/dsh-client-runtime/client";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-runtime/client";

/** Namespace owned by the Host plugin; must match SHADOW_SETTINGS_NAMESPACE. */
export const SHADOW_CLIENT_SETTINGS_NS = "shadow-mind";

/** The section fields this card edits (camelCase settings keys). */
export interface ShadowClientSettings {
  heartbeatProbability?: number;
  maxParallelShadows?: number;
  defaultShadowTimeoutSeconds?: number;
  headlessDrainTimeoutSeconds?: number;
  resultBatchWindowMs?: number;
  defaultShadowModel?: string;
  defaultThinkingLevel?: "minimal" | "low" | "medium" | "high";
  randomSeed?: number;
}

/** One field's staged draft. */
interface Draft {
  text: string;
  /** True when this edit clears the field whatever text it shows. */
  clear: boolean;
}

/** What one field renders: its draft, override badge, and validity. */
export interface ShadowFieldState {
  text: string;
  overridden: boolean;
  invalid: boolean;
}

/** Card-level state every field row shares. */
export interface ShadowSettingsCardState {
  /** False while the namespace is not served to this client. */
  available: boolean;
  /** Whether the Host document accepts writes. */
  writable: boolean;
  /** Whether any staged edit would change the stored section. */
  dirty: boolean;
  /** Whether some staged draft is invalid, which blocks the save. */
  invalid: boolean;
  /** Whether a save is crossing the wire. */
  saving: boolean;
  /** Whether the last save did not land as staged; cleared by the next edit or save. */
  failed: boolean;
  fields: {
    heartbeatProbability: ShadowFieldState;
    maxParallelShadows: ShadowFieldState;
    defaultShadowTimeoutSeconds: ShadowFieldState;
    headlessDrainTimeoutSeconds: ShadowFieldState;
    resultBatchWindowMs: ShadowFieldState;
    defaultShadowModel: ShadowFieldState;
    defaultThinkingLevel: ShadowFieldState;
    randomSeed: ShadowFieldState;
  };
}

/** The registration-side face the card's slot entry injects. */
export interface ShadowSettingsCardFace {
  hooks: {
    shadowSettingsCard: SnapshotStore<ShadowSettingsCardState>;
  };
  edit(field: keyof ShadowClientSettings & string, text: string): void;
  resetField(field: keyof ShadowClientSettings & string): void;
  save(): void;
  discard(): void;
}

/** How one field converts between its stored value and its draft text. */
interface FieldSpec {
  format(value: unknown): string;
  /** The write the draft stages, or undefined when the draft is invalid. */
  parse(text: string): { kind: "set"; value: unknown } | { kind: "clear" } | undefined;
}

const FIELD_NAMES = [
  "heartbeatProbability",
  "maxParallelShadows",
  "defaultShadowTimeoutSeconds",
  "headlessDrainTimeoutSeconds",
  "resultBatchWindowMs",
  "defaultShadowModel",
  "defaultThinkingLevel",
  "randomSeed",
] as const;

/** Whole number within [min,max]; an empty draft clears the field. */
function intField(min: number, max: number): FieldSpec {
  return {
    format: (value) => (typeof value === "number" ? String(value) : ""),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      if (!/^-?\d+$/.test(trimmed)) return undefined;
      const parsed = Number(trimmed);
      if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return undefined;
      return { kind: "set", value: parsed };
    },
  };
}

/** Free text within [min,max] characters after trimming; empty clears. */
function textField(): FieldSpec {
  return {
    format: (value) => (typeof value === "string" ? value : ""),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      // Non-empty model ids are non-empty strings; deeper validation stays with the Host schema.
      return { kind: "set", value: trimmed };
    },
  };
}

/** One of the four thinking levels; empty clears back to inheritance. */
function enumField(allowed: readonly string[]): FieldSpec {
  return {
    format: (value) => (typeof value === "string" ? value : ""),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      return allowed.includes(trimmed) ? { kind: "set", value: trimmed } : undefined;
    },
  };
}

const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;

const SPECS: Record<(typeof FIELD_NAMES)[number], FieldSpec> = {
  heartbeatProbability: {
    format: (value) => (typeof value === "number" ? String(value) : ""),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return undefined;
      return { kind: "set", value: parsed };
    },
  },
  maxParallelShadows: intField(1, 8),
  defaultShadowTimeoutSeconds: intField(1, 86_400),
  headlessDrainTimeoutSeconds: intField(0, 3_600),
  resultBatchWindowMs: intField(0, 60_000),
  defaultShadowModel: textField(),
  defaultThinkingLevel: enumField(THINKING_LEVELS),
  randomSeed: intField(0, 0xffff_ffff),
};

/** Bridges the bound `shadow-mind` scope onto the card's snapshot store. */
export class ShadowSettingsCardController {
  private readonly drafts = new Map<string, Draft>();
  private readonly store: SnapshotStore<ShadowSettingsCardState>;
  private saving = false;
  private failed = false;

  constructor(private readonly scope: SettingsScope<ShadowClientSettings>) {
    this.store = createSnapshotStore(this.project());
    scope.subscribe(() => this.publish());
  }

  /** @returns the face injected into the card's slot entry. */
  inject(): ShadowSettingsCardFace {
    return {
      hooks: { shadowSettingsCard: this.store },
      edit: (field, text) => {
        this.drafts.set(field, { text, clear: false });
        this.failed = false;
        this.publish();
      },
      resetField: (field) => {
        this.drafts.set(field, { text: this.spec(field).format(this.baseValue(field)), clear: true });
        this.failed = false;
        this.publish();
      },
      save: () => void this.save(),
      discard: () => {
        if (this.drafts.size === 0 && !this.failed) return;
        this.drafts.clear();
        this.failed = false;
        this.publish();
      },
    };
  }

  private project(): ShadowSettingsCardState {
    const snapshot = this.scope.getSnapshot();
    const planned = this.plan();
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable,
      dirty: planned.length > 0,
      invalid: planned.some((entry) => !entry.run),
      saving: this.saving,
      failed: this.failed,
      fields: Object.fromEntries(
        FIELD_NAMES.map((name) => [name, this.field(name)]),
      ) as ShadowSettingsCardState["fields"],
    };
  }

  private field(name: (typeof FIELD_NAMES)[number]): ShadowFieldState {
    const spec = this.spec(name);
    const draft = this.drafts.get(name);
    if (draft === undefined) {
      return { text: spec.format(this.sectionValue(name)), overridden: this.stored(name), invalid: false };
    }
    const write = draft.clear ? ({ kind: "clear" } as const) : spec.parse(draft.text);
    return {
      text: draft.text,
      overridden: write?.kind === "set",
      invalid: write === undefined,
    };
  }

  /** Write every valid staged edit, then re-seed from what the Host accepted. */
  private async save(): Promise<void> {
    const plan = this.plan();
    const writes = plan.filter((entry): entry is { field: string; run: () => Promise<boolean> } => entry.run !== undefined);
    if (plan.length === 0 || plan.length !== writes.length || this.saving) return;
    this.saving = true;
    this.failed = false;
    this.publish();
    let landed = true;
    for (const write of writes) {
      landed = await write.run() && landed;
    }
    if (landed) this.drafts.clear();
    this.saving = false;
    this.failed = !landed;
    this.publish();
  }

  /** Every staged edit a save would attempt, in staging order. */
  private plan(): Array<{ field: string; run: (() => Promise<boolean>) | undefined }> {
    const plan: Array<{ field: string; run: (() => Promise<boolean>) | undefined }> = [];
    for (const [field, draft] of this.drafts) {
      const spec = this.spec(field as (typeof FIELD_NAMES)[number]);
      if (draft.clear) {
        if (this.stored(field)) {
          plan.push({ field, run: async () => {
            await this.scope.unset(field);
            return !this.stored(field);
          } });
        }
        continue;
      }
      if (draft.text === spec.format(this.sectionValue(field as (typeof FIELD_NAMES)[number]))) continue;
      const write = spec.parse(draft.text);
      if (write === undefined) {
        plan.push({ field, run: undefined });
      } else if (write.kind === "clear") {
        plan.push({ field, run: async () => {
          await this.scope.unset(field);
          return !this.stored(field);
        } });
      } else {
        const value = write.value;
        plan.push({ field, run: async () => {
          await this.scope.set(field, value);
          return (this.userLayer() as Record<string, unknown> | undefined)?.[field] === value;
        } });
      }
    }
    return plan;
  }

  private spec(field: (typeof FIELD_NAMES)[number]): FieldSpec {
    return SPECS[field];
  }

  private snapshotOf(): SettingsScopeSnapshot<ShadowClientSettings> {
    return this.scope.getSnapshot();
  }

  private sectionValue(field: string): unknown {
    return (this.snapshotOf().value as Record<string, unknown> | undefined)?.[field];
  }

  private baseValue(field: string): unknown {
    return (this.snapshotOf().base as Record<string, unknown> | undefined)?.[field];
  }

  private userLayer(): unknown {
    return this.snapshotOf().user;
  }

  private stored(field: string): boolean {
    const user = this.userLayer() as Record<string, unknown> | undefined;
    return user !== undefined && user !== null && Object.hasOwn(user, field);
  }

  private publish(): void {
    this.store.set(this.project());
  }
}
