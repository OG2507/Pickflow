import {
  inspectCommerce84SyncConfiguration,
  synchroniseCommerce84Orders,
} from './commerce84-orders'

const POLLER_KEY = Symbol.for('pickflow.commerce84-order-poller')

type PollerGlobal = typeof globalThis & {
  [POLLER_KEY]?: NodeJS.Timeout
}

function intervalMilliseconds(value: string | undefined): number {
  const parsed = Number(value || '60000')
  return Number.isSafeInteger(parsed) && parsed >= 15000 ? parsed : 60000
}

export function startCommerce84OrderPoller() {
  const global = globalThis as PollerGlobal
  if (global[POLLER_KEY]) return
  if (process.env.COMMERCE84_AUTOMATIC_ORDER_SYNC !== 'true') return

  const inspection = inspectCommerce84SyncConfiguration(process.env)
  if (!inspection.configured || !inspection.configuration) {
    console.error(
      `Commerce84 automatic order sync is disabled: ${inspection.problems.join('; ')}`
    )
    return
  }

  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      const result = await synchroniseCommerce84Orders(inspection.configuration!)
      if (result.imported || result.existing || result.errors.length) {
        console.log('Commerce84 order sync:', result)
      }
    } catch (error) {
      console.error('Commerce84 automatic order sync failed:', error)
    } finally {
      running = false
    }
  }

  const timer = setInterval(
    () => void run(),
    intervalMilliseconds(process.env.COMMERCE84_ORDER_SYNC_INTERVAL_MS)
  )
  timer.unref()
  global[POLLER_KEY] = timer
  setTimeout(() => void run(), 5000).unref()
}
