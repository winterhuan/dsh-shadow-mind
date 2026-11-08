/** Deployment limits for bounded, read-only reviews. */
import z from '@deepseek-ai/schemastery'

/** Runtime configuration resolved by Cordis before the plugin starts. */
export interface Config {
  definitionsDirectory: string
  maxParallel: number
  timeoutSeconds: number
  maxHeartbeatRunsPerTask: number
  maxDefinitions: number
  maxDefinitionBytes: number
  maxTrajectoryChars: number
  maxEntryChars: number
  maxReportChars: number
  maxOutputTokens: number
}

/** Validated deployment settings; deadlines include queueing and startup. */
export const Config: z<Pick<Config, 'definitionsDirectory'> & Partial<Config>, Config> = z.object({
  definitionsDirectory: z.string().required(),
  maxParallel: z.number().step(1).min(1).max(8).default(2),
  timeoutSeconds: z.number().min(1).max(3600).default(120),
  maxHeartbeatRunsPerTask: z.number().step(1).min(0).max(100).default(4),
  maxDefinitions: z.number().step(1).min(1).max(100).default(16),
  maxDefinitionBytes: z.number().step(1).min(256).max(1048576).default(16384),
  maxTrajectoryChars: z.number().step(1).min(1024).max(1048576).default(48000),
  maxEntryChars: z.number().step(1).min(128).max(65536).default(8000),
  maxReportChars: z.number().step(1).min(128).max(65536).default(4000),
  maxOutputTokens: z.number().step(1).min(256).max(32768).default(4096),
})
