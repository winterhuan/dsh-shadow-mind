import { clientBundle } from './scripts/tsdown.client.ts'

export default clientBundle(import.meta.dirname, [], { hostPhase: true })
