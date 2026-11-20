import { expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { Config } from '../src/config.ts'
import { captureTrajectory } from '../src/trajectory.ts'

it('respects a partial context replacement and preserves unrelated visible constraints', () => {
  const session = Session.create(SessionId('trajectory'))
  const append = (text: string) => session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }), { surfaceOp: 'append' })
  append('Keep the public API stable.')
  const removed = append('Old detailed discussion no longer present in model context.')
  append('Latest task.')
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Compacted summary.' }] }),
    { surfaceOp: { op: 'replace', startSeq: removed.seq, endSeq: removed.seq }, sourceEventSeqs: [removed.seq] })
  const trajectory = captureTrajectory(session, Config({ definitionsDirectory: '/unused' }))
  expect(trajectory.text).toContain('Keep the public API stable.')
  expect(trajectory.text).toContain('Compacted summary.')
  expect(trajectory.text).not.toContain('Old detailed discussion')
  expect(trajectory.refs).not.toContain(removed.seq)
})

it('bounds oversized text and marks omissions', () => {
  const session = Session.create(SessionId('bounded'))
  for (let index = 0; index < 20; index++) session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: `Message ${index}: ${'x'.repeat(4000)}` }] }), { surfaceOp: 'append' })
  const trajectory = captureTrajectory(session, Config({ definitionsDirectory: '/unused', maxTrajectoryChars: 1024, maxEntryChars: 256 }))
  expect(trajectory.text.length).toBeLessThanOrEqual(1024)
  expect(trajectory.text).toContain('[truncated]')
  expect(trajectory.omitted).toBeGreaterThan(0)
  expect(trajectory.text).toContain('Message 19:')
})

it('redacts tool argument values before passing the trajectory to a Shadow', () => {
  const session = Session.create(SessionId('redacted-trajectory'))
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createAssistantMessage({ source: { provider: 'fixture', model: 'fixture' }, content: [
      { type: 'tool-call', id: ToolCallId('call-1'), name: 'search', arguments: JSON.stringify({ token: 'secret-value', query: 'private query' }) },
    ] }),
    stream: [],
  }, { surfaceOp: 'append' })
  const trajectory = captureTrajectory(session, Config({ definitionsDirectory: '/unused' }))
  expect(trajectory.text).toContain('token: [redacted]')
  expect(trajectory.text).toContain('query: [redacted]')
  expect(trajectory.text).not.toContain('secret-value')
  expect(trajectory.text).not.toContain('private query')
})
