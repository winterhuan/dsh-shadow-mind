import { expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'

it('resolves partial inputs with the same defaults as the Loader schema', () => {
  expect(resolveConfig({ definitionsDirectory: '/shadow-minds' })).toEqual({
    definitionsDirectory: '/shadow-minds',
    heartbeatProbability: 0.2,
    heartbeatTools: [],
    maxParallel: 2,
    timeoutSeconds: 120,
    headlessDrainTimeoutSeconds: 30,
    resultBatchWindowMs: 250,
    maxHeartbeatRunsPerTask: 4,
    maxDefinitions: 16,
    maxDefinitionBytes: 16384,
    maxTrajectoryChars: 48000,
    maxEntryChars: 8000,
    maxReportChars: 4000,
    maxOutputTokens: 4096,
    excludedExtensions: [],
    defaultThinkingLevel: 'high',
    randomSeed: 0,
  })
})

it('preserves explicit falsey settings', () => {
  const config = {
    definitionsDirectory: '/shadow-minds', heartbeatProbability: 0, heartbeatTools: [], maxParallel: 1,
    timeoutSeconds: 1, headlessDrainTimeoutSeconds: 0, resultBatchWindowMs: 0, maxHeartbeatRunsPerTask: 0,
    maxDefinitions: 1, maxDefinitionBytes: 256, maxTrajectoryChars: 1024, maxEntryChars: 128,
    maxReportChars: 128, maxOutputTokens: 256, excludedExtensions: [], defaultThinkingLevel: 'low', randomSeed: 0,
  }
  expect(resolveConfig(config)).toMatchObject({ heartbeatProbability: 0, maxParallel: 1, timeoutSeconds: 1,
    headlessDrainTimeoutSeconds: 0, resultBatchWindowMs: 0, maxHeartbeatRunsPerTask: 0, randomSeed: 0 })
})
