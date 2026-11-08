import { describe, expect, it, vi } from 'vitest'
import { pluginRecordOf, Session } from '@deepseek-ai/dsh-session'
import { savedState } from '../src/records.ts'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { harness, reportResponse, textResponse, toolResponse } from './fixtures/harness.ts'

describe('native review lifecycle', () => {
  it('delivers one structured completion report and lets the root revise without recursive reviews', async () => {
    const { agent, send, adapter, ctx } = await harness((options, child) => child ? reportResponse(options) : textResponse('Task result.'))
    send()
    await agent.whenIdle()
    const reports = agent.session.deriveMessages().filter(message => message.source.kind === 'shadow-report')
    expect(reports).toHaveLength(1)
    expect(adapter.requests.filter(request => request.tools?.some(tool => tool.name === 'structured_output'))).toHaveLength(1)
    const childRequest = adapter.requests.find(request => request.tools?.some(tool => tool.name === 'structured_output'))
    expect(childRequest?.tools?.map(tool => tool.name).sort()).toEqual(['glob', 'grep', 'read', 'structured_output'])
    expect(adapter.requests).toHaveLength(3)
    expect(ctx.agents.list().map(item => item.id)).toEqual([agent.id])
    expect(savedState(agent.session).completionClaimed).toBe(true)
    const restored = Session.create(agent.id, agent.session.snapshotEvents(), agent.session.header)
    expect(savedState(restored)).toEqual(savedState(agent.session))
  })

  it('keeps silent reviews out of model context and persists their outcome', async () => {
    const { agent, send, ctx } = await harness((_options, child) => child
      ? toolResponse('structured_output', { status: 'silent', content: '', refs: [] }) : textResponse('Done.'))
    send()
    await agent.whenIdle()
    expect(agent.session.deriveMessages().some(message => message.source.kind === 'shadow-report')).toBe(false)
    expect(await ctx.shadowMind.status(agent)).toContain('completion: silent')
  })

  it('lets a manually selected reviewer read real evidence after pause and resume', async () => {
    let childCalls = 0
    const { agent, send, ctx } = await harness((options, child) => {
      if (!child) return textResponse('Done.')
      if (childCalls++ === 0) return toolResponse('read', { file_path: 'evidence.txt' })
      expect(JSON.stringify(options.messages)).toContain('A fixture file that the reviewer can read.')
      return reportResponse(options)
    })
    const command = (line: string) => ctx.commands.execute(agent, line, [], new AbortController().signal)
    await command('/shadow pause')
    send()
    await agent.whenIdle()
    expect(childCalls).toBe(0)
    await command('/shadow resume')
    expect((await command('/shadow check completion'))?.result.kind).toBe('success')
    await agent.whenIdle()
    expect(childCalls).toBe(2)
    expect(agent.session.deriveMessages().filter(message => message.source.kind === 'shadow-report')).toHaveLength(1)
  })

  it('includes project instructions in the budget and rejects before a child model request', async () => {
    const { agent, send, ctx, directory, workspace, adapter } = await harness((_options, child) => child
      ? toolResponse('structured_output', { status: 'silent', content: '', refs: [] }) : textResponse('Done.'))
    await writeFile(join(workspace, 'AGENTS.md'), 'Project rule. '.repeat(2000))
    await writeFile(join(directory, 'completion.md'), '---\nrun_with_model: fixture/small\n---\nCheck completion.')
    vi.spyOn(adapter, 'resolveModel').mockImplementation((provider, model) => Promise.resolve({
      provider, id: model, name: model, context: { contextWindow: model === 'small' ? 20000 : 200000 },
    }))
    const errors: string[] = []
    ctx.on('agent/error', ({ error }) => errors.push(String(error)))
    send()
    await agent.whenIdle()
    expect(adapter.requests).toHaveLength(1)
    expect(errors.join('\n')).toContain('conservative context budget')
    expect(await ctx.shadowMind.status(agent)).toContain('completion: failed')
    expect(ctx.agents.list()).toHaveLength(1)
  })

  it('rejects fabricated citations instead of delivering ungrounded feedback', async () => {
    const { agent, send, ctx } = await harness((_options, child) => child
      ? toolResponse('structured_output', { status: 'report', content: 'Unsupported.', refs: [999999] }) : textResponse('Done.'))
    send()
    await agent.whenIdle()
    expect(agent.session.deriveMessages().some(message => message.source.kind === 'shadow-report')).toBe(false)
    expect(await ctx.shadowMind.status(agent)).toContain('outside its captured trajectory')
  })

  it('queues completion reviewers at capacity and delivers one combined batch', async () => {
    const { agent, send, adapter } = await harness((options, child) => child
      ? reportResponse(options, JSON.stringify(options.messages).includes('Review responsibility: first') ? 'First finding.' : 'Second finding.') : textResponse('Done.'), { maxParallel: 1 }, ['first', 'second'])
    send()
    await agent.whenIdle()
    const reports = agent.session.deriveMessages().filter(message => message.source.kind === 'shadow-report')
    expect(reports).toHaveLength(1)
    const source = reports[0]?.source
    if (source?.kind !== 'shadow-report') throw new Error('missing report source')
    expect(source.reports).toHaveLength(2)
    expect(adapter.requests).toHaveLength(4)
  })

  it('cancels old reviewers on new user input and never delivers their late finding', async () => {
    const entered = Promise.withResolvers<void>()
    let children = 0
    const { agent, send, ctx } = await harness(async function* (options, child) {
      if (child && children++ === 0) {
        entered.resolve()
        await new Promise<void>(resolve => {
          if (options.signal?.aborted) resolve()
          else options.signal?.addEventListener('abort', () => resolve(), { once: true })
        })
        yield* reportResponse(options, 'Stale finding.')
      } else yield* child ? toolResponse('structured_output', { status: 'silent', content: '', refs: [] }) : textResponse('Done.')
    })
    send('First task.')
    await entered.promise
    send('Second task.')
    await agent.whenIdle()
    expect(JSON.stringify(agent.session.deriveMessages())).not.toContain('Stale finding.')
    expect(await ctx.shadowMind.status(agent)).toContain('cancelled')
    expect(ctx.agents.list()).toHaveLength(1)
  })

  it('pauses during a running review and preserves the pause after Session restoration', async () => {
    const entered = Promise.withResolvers<void>()
    const { agent, send, ctx } = await harness(async function* (options, child) {
      if (!child) { yield* textResponse('Done.'); return }
      entered.resolve()
      await new Promise<void>(resolve => {
        if (options.signal?.aborted) resolve()
        else options.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    })
    send()
    await entered.promise
    await ctx.shadowMind.pause(agent, true)
    await agent.whenIdle()
    expect(savedState(agent.session).paused).toBe(true)
    expect(agent.session.deriveMessages().some(message => message.source.kind === 'shadow-report')).toBe(false)
    const terminal = agent.session.snapshotEvents().flatMap(event => {
      const item = pluginRecordOf(event)
      return item?.type === 'plugin:shadow-mind/state' ? [item.data] : []
    })
    expect(terminal).toContainEqual(expect.objectContaining({ kind: 'run', status: 'cancelled' }))
  })

  it('runs a background review during a tool-using step before the root finishes its turn', async () => {
    const childStarted = Promise.withResolvers<void>()
    let rootCalls = 0
    const { agent, send, ctx, directory } = await harness(async function* (options, child) {
      if (child) { childStarted.resolve(); yield* reportResponse(options); return }
      if (rootCalls++ === 0) { yield* toolResponse('probe', {}); return }
      if (rootCalls === 2) await childStarted.promise
      yield* textResponse('Done.')
    }, { maxHeartbeatRunsPerTask: 1 }, [])
    await writeFile(join(directory, 'background.md'), '---\ntrigger: [heartbeat]\nactivation_probability: 1\nactivation_tools: [probe]\n---\nReview repository changes.')
    ctx.tools.register(defineTool({ name: 'probe', description: 'Read deterministic test evidence.', parameters: {},
      output: { schema: { type: 'boolean' }, render: () => [{ type: 'text', text: 'Evidence read.' }] }, execute: async () => true }))
    send()
    await agent.whenIdle()
    expect(agent.session.deriveMessages().filter(message => message.source.kind === 'shadow-report')).toHaveLength(1)
    expect(savedState(agent.session).heartbeatRuns).toBe(1)
  })

  it('records timeout and waits for the child to leave the registry', async () => {
    const { agent, send, ctx } = await harness(async function* (options, child) {
      if (!child) { yield* textResponse('Done.'); return }
      await new Promise<void>(resolve => {
        if (options.signal?.aborted) resolve()
        else options.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    }, { timeoutSeconds: 1 })
    send()
    await agent.whenIdle()
    expect(await ctx.shadowMind.status(agent)).toContain('completion: timeout')
    expect(ctx.agents.list()).toHaveLength(1)
    expect(agent.session.deriveMessages().some(message => message.source.kind === 'shadow-report')).toBe(false)
  })

  it('joins an active child before plugin unload completes', async () => {
    const entered = Promise.withResolvers<void>()
    const { agent, send, ctx, runtime } = await harness(async function* (options, child) {
      if (!child) { yield* textResponse('Done.'); return }
      entered.resolve()
      await new Promise<void>(resolve => {
        if (options.signal?.aborted) resolve()
        else options.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    })
    send()
    await entered.promise
    await runtime.dispose()
    expect(ctx.agents.list().map(item => item.id)).toEqual([agent.id])
    await agent.whenIdle()
    expect(agent.session.deriveMessages().some(message => message.source.kind === 'shadow-report')).toBe(false)
  })

  it('never executes a write-capable inherited tool requested by the reviewer', async () => {
    let writes = 0
    let childCalls = 0
    const { agent, send, ctx } = await harness((_options, child) => {
      if (!child) return textResponse('Done.')
      return childCalls++ === 0 ? toolResponse('dangerous_write', {}) : toolResponse('structured_output', { status: 'silent', content: '', refs: [] })
    })
    ctx.tools.register(defineTool({ name: 'dangerous_write', description: 'Write test data.', parameters: {},
      output: { schema: { type: 'boolean' }, render: () => [] }, execute: async () => { writes += 1; return true } }))
    send()
    await agent.whenIdle()
    expect(childCalls).toBe(2)
    expect(writes).toBe(0)
    expect(await ctx.shadowMind.status(agent)).toContain('completion: silent')
  })
})
