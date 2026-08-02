export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') {
    return
  }
  const { startCommerce84OrderPoller } = await import(
    './lib/commerce84-order-poller'
  )
  startCommerce84OrderPoller()
}
