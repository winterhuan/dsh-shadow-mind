/** Staged profile configuration edits for the Shadow Mind settings card. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsNumberField, settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'

/** Host entry id owning Shadow Mind's live profile values. */
export const SHADOW_SETTINGS_NS = 'shadow-mind-runtime'

export interface ShadowSettings {
  heartbeatProbability?: number
  heartbeatTools?: string[]
  maxParallel?: number
  timeoutSeconds?: number
  resultBatchWindowMs?: number
  maxHeartbeatRunsPerTask?: number
  defaultShadowModel?: string
  defaultThinkingLevel?: string
}

export interface ShadowSettingsState extends SettingsFormShell {
  heartbeatProbability: SettingsFieldState
  heartbeatTools: SettingsFieldState
  maxParallel: SettingsFieldState
  timeoutSeconds: SettingsFieldState
  resultBatchWindowMs: SettingsFieldState
  maxHeartbeatRunsPerTask: SettingsFieldState
  defaultShadowModel: SettingsFieldState
  defaultThinkingLevel: SettingsFieldState
}

export interface ShadowSettingsFace extends SettingsFormActions {
  hooks: { shadowSettings: SnapshotStore<ShadowSettingsState> }
}

const listField = (field: string) => ({
  field,
  format: (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string') ? value.join(', ') : '',
  parse: (text: string) => ({ kind: 'set' as const, value: text.split(',').map(item => item.trim()).filter(Boolean) }),
})

export class ShadowSettingsController {
  private readonly form: SettingsFormModel<ShadowSettings>
  private readonly store: SnapshotStore<ShadowSettingsState>

  constructor(scope: SettingsFormScope<ShadowSettings>) {
    this.form = new SettingsFormModel(scope, [
      settingsNumberField('heartbeatProbability'), listField('heartbeatTools'), settingsNumberField('maxParallel'),
      settingsNumberField('timeoutSeconds'), settingsNumberField('resultBatchWindowMs'),
      settingsNumberField('maxHeartbeatRunsPerTask'), settingsTextField('defaultShadowModel'), settingsTextField('defaultThinkingLevel'),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): ShadowSettingsState {
    return {
      ...this.form.shell(), heartbeatProbability: this.form.field('heartbeatProbability'), heartbeatTools: this.form.field('heartbeatTools'),
      maxParallel: this.form.field('maxParallel'), timeoutSeconds: this.form.field('timeoutSeconds'),
      resultBatchWindowMs: this.form.field('resultBatchWindowMs'), maxHeartbeatRunsPerTask: this.form.field('maxHeartbeatRunsPerTask'),
      defaultShadowModel: this.form.field('defaultShadowModel'), defaultThinkingLevel: this.form.field('defaultThinkingLevel'),
    }
  }

  inject(): ShadowSettingsFace { return { hooks: { shadowSettings: this.store }, ...this.form.actions() } }
  dispose(): void { this.form.dispose() }
}
