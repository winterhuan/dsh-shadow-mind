import { expect, it } from 'vitest'
import { Slots } from '../src/slots.ts'

it('holds capacity until release and removes cancelled queue entries', async () => {
  const slots = new Slots(1)
  const controller = new AbortController()
  const release = await slots.acquire(controller.signal, false)
  expect(release).toBeTypeOf('function')
  expect(await slots.acquire(controller.signal, false)).toBeUndefined()
  const cancelled = new AbortController()
  const queued = slots.acquire(cancelled.signal, true)
  const rejected = expect(queued).rejects.toThrow('cancelled')
  cancelled.abort(new Error('cancelled'))
  await rejected
  const next = slots.acquire(controller.signal, true)
  release?.()
  const last = await next
  expect(await slots.acquire(controller.signal, false)).toBeUndefined()
  last?.()
  expect(await slots.acquire(controller.signal, false)).toBeTypeOf('function')
})
