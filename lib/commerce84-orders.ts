import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_COMMERCE84_ORDER_ENDPOINT =
  'https://thebadgeroom.com/api/pickflow/orders'
const DEFAULT_SYNC_LIMIT = 20

export type Commerce84Address = {
  firstName: string
  lastName: string
  company?: string
  address1: string
  address2?: string
  city: string
  region?: string
  postalCode: string
  countryCode: string
  email: string
  phone?: string
}

export type Commerce84OrderLine = {
  orderLineId: string
  sku: string
  productName: string
  quantity: number
  unitPriceMinor: number
  lineTotalMinor: number
  vatStatus: 'Standard' | 'Zero' | 'Exempt'
}

export type Commerce84OrderEnvelope = {
  contractVersion: '1.0'
  fulfilmentId: string
  idempotencyKey: string
  availableAt: string
  storeCode: string
  orderId: string
  orderNumber: string
  currency: 'GBP'
  shippingMethod: string
  shippingCostMinor: number
  orderTotalMinor: number
  shippingAddress: Commerce84Address
  notes?: string
  lines: Commerce84OrderLine[]
}

type Commerce84Claim = {
  claimToken: string
  envelope: Commerce84OrderEnvelope
}

type PickflowProduct = {
  productid: number
  sku: string
  altsku: string | null
  productname: string
  packquantity: number | null
  weight: number | null
  isactive: boolean | null
}

type PickflowSkuMapping = {
  websitesku: string
  realsku: string
}

type ResolvedOrderLine = {
  orderid?: number
  productid: number
  sku: string
  productname: string
  quantityordered: number
  unitprice: number
  linetotal: number
  status: 'Pending'
  unitweightg: number
}

type ImportedOrder = {
  orderid: number
  ordernumber: string
  fulfilmentId: string
  claimToken: string
}

export type Commerce84SyncConfiguration = {
  endpoint: string
  apiSecret: string
  syncLimit: number
}

export type Commerce84SyncResult = {
  claimed: number
  imported: number
  existing: number
  reported: number
  errors: string[]
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : Number.NaN
}

export function inspectCommerce84SyncConfiguration(
  environment: NodeJS.ProcessEnv
): { configured: boolean; problems: string[]; configuration?: Commerce84SyncConfiguration } {
  const endpoint = (
    environment.COMMERCE84_ORDER_ENDPOINT || DEFAULT_COMMERCE84_ORDER_ENDPOINT
  ).replace(/\/+$/, '')
  const apiSecret = clean(environment.COMMERCE84_ORDER_API_SECRET)
  const syncLimit = positiveInteger(
    environment.COMMERCE84_ORDER_SYNC_LIMIT,
    DEFAULT_SYNC_LIMIT
  )
  const problems: string[] = []
  try {
    if (new URL(endpoint).protocol !== 'https:') {
      problems.push('COMMERCE84_ORDER_ENDPOINT must use HTTPS')
    }
  } catch {
    problems.push('COMMERCE84_ORDER_ENDPOINT is invalid')
  }
  if (apiSecret.length < 32) {
    problems.push('COMMERCE84_ORDER_API_SECRET is missing or too short')
  }
  if (!Number.isSafeInteger(syncLimit) || syncLimit > 100) {
    problems.push('COMMERCE84_ORDER_SYNC_LIMIT must be between 1 and 100')
  }
  return problems.length
    ? { configured: false, problems }
    : { configured: true, problems, configuration: { endpoint, apiSecret, syncLimit } }
}

function countryName(countryCode: string): string {
  switch (countryCode.toUpperCase()) {
    case 'GB':
      return 'United Kingdom'
    case 'US':
      return 'United States'
    case 'CA':
      return 'Canada'
    default:
      return countryCode.toUpperCase()
  }
}

export function resolveCommerce84OrderLines(
  lines: readonly Commerce84OrderLine[],
  mappings: readonly PickflowSkuMapping[],
  products: readonly PickflowProduct[]
): ResolvedOrderLine[] {
  const mappingByWebsiteSku = new Map(
    mappings.map((mapping) => [
      mapping.websitesku.trim().toUpperCase(),
      mapping.realsku.trim().toUpperCase(),
    ])
  )
  const productBySku = new Map(
    products.map((product) => [product.sku.trim().toUpperCase(), product])
  )
  const productByAltSku = new Map(
    products
      .filter((product) => product.altsku?.trim())
      .map((product) => [product.altsku!.trim().toUpperCase(), product])
  )

  return lines.map((line) => {
    const websiteSku = line.sku.trim().toUpperCase()
    const mappedSku = mappingByWebsiteSku.get(websiteSku) || websiteSku
    const wholesale = mappedSku.endsWith('-W')
    const lookupSku = wholesale ? mappedSku.slice(0, -2) : mappedSku
    const product = productBySku.get(lookupSku) || productByAltSku.get(lookupSku)
    if (!product || product.isactive === false) {
      throw new Error(`Commerce84 SKU ${websiteSku} is not an active Pickflow product`)
    }
    const packQuantity = Math.max(1, Math.floor(Number(product.packquantity) || 1))
    const quantityordered = line.quantity * (wholesale ? packQuantity : 1)
    return {
      productid: product.productid,
      sku: product.sku,
      productname: product.productname || line.productName,
      quantityordered,
      unitprice: line.unitPriceMinor / 100,
      linetotal: line.lineTotalMinor / 100,
      status: 'Pending',
      unitweightg: Math.max(0, Number(product.weight) || 0),
    }
  })
}

function validEnvelope(value: unknown): value is Commerce84OrderEnvelope {
  if (!value || typeof value !== 'object') return false
  const order = value as Partial<Commerce84OrderEnvelope>
  return (
    order.contractVersion === '1.0' &&
    clean(order.fulfilmentId) !== '' &&
    clean(order.orderId) !== '' &&
    clean(order.orderNumber) !== '' &&
    order.currency === 'GBP' &&
    Array.isArray(order.lines) &&
    order.lines.length > 0
  )
}

async function claimNextOrder(
  configuration: Commerce84SyncConfiguration,
  fetchImpl: typeof fetch
): Promise<Commerce84Claim | undefined> {
  const response = await fetchImpl(`${configuration.endpoint}/claim`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-commerce84-api-key': configuration.apiSecret,
    },
    body: JSON.stringify({ workerId: 'pickflow-jks' }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 204) return undefined
  if (!response.ok) {
    throw new Error(`Commerce84 claim failed with HTTP ${response.status}`)
  }
  const value: unknown = await response.json()
  if (
    !value ||
    typeof value !== 'object' ||
    !clean((value as Partial<Commerce84Claim>).claimToken) ||
    !validEnvelope((value as Partial<Commerce84Claim>).envelope)
  ) {
    throw new Error('Commerce84 returned an invalid order claim')
  }
  return value as Commerce84Claim
}

async function reportStatus(
  configuration: Commerce84SyncConfiguration,
  fetchImpl: typeof fetch,
  claimToken: string,
  envelope: Commerce84OrderEnvelope,
  order: { orderid: number; ordernumber: string },
  status: 'accepted' | 'picking' | 'packed' | 'dispatched' | 'cancelled',
  trackingNumber?: string | null
): Promise<void> {
  const response = await fetchImpl(`${configuration.endpoint}/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-commerce84-api-key': configuration.apiSecret,
    },
    body: JSON.stringify({
      claimToken,
      report: {
        contractVersion: '1.0',
        fulfilmentId: envelope.fulfilmentId,
        idempotencyKey: `${envelope.fulfilmentId}:${status}`,
        pickflowOrderId: String(order.orderid),
        pickflowOrderNumber: order.ordernumber,
        status,
        occurredAt: new Date().toISOString(),
        trackingNumber: clean(trackingNumber) || undefined,
      },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw new Error(`Commerce84 ${status} report failed with HTTP ${response.status}`)
  }
}

async function loadProductMaps(supabase: SupabaseClient) {
  const [{ data: mappings, error: mappingError }, { data: products, error: productError }] =
    await Promise.all([
      supabase.from('tblskumapping').select('websitesku, realsku').range(0, 9999),
      supabase
        .from('tblproducts')
        .select(
          'productid, sku, altsku, productname, packquantity, weight, isactive'
        )
        .range(0, 9999),
    ])
  if (mappingError) throw new Error(`Pickflow SKU mapping load failed: ${mappingError.message}`)
  if (productError) throw new Error(`Pickflow product load failed: ${productError.message}`)
  return {
    mappings: (mappings || []) as PickflowSkuMapping[],
    products: (products || []) as PickflowProduct[],
  }
}

async function findOrCreateClient(
  supabase: SupabaseClient,
  address: Commerce84Address
): Promise<number> {
  const email = address.email.trim().toLowerCase()
  const { data: existing, error: lookupError } = await supabase
    .from('tblclients')
    .select('clientid')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()
  if (lookupError) throw new Error(`Pickflow client lookup failed: ${lookupError.message}`)
  if (existing?.clientid) return existing.clientid

  const { data: created, error } = await supabase
    .from('tblclients')
    .insert({
      companyname: address.company || '',
      firstname: address.firstName,
      lastname: address.lastName,
      email,
      phone: address.phone || '',
      address1: address.address1,
      address2: address.address2 || '',
      address3: '',
      town: address.city,
      county: address.region || '',
      postcode: address.postalCode,
      country: countryName(address.countryCode),
      clienttype: 'Website',
      source: 'The Badge Room',
      iswholesale: false,
      isreducedwholesale: false,
      isactive: true,
    })
    .select('clientid')
    .single()
  if (error || !created) {
    throw new Error(`Pickflow client creation failed: ${error?.message || 'no row'}`)
  }
  return created.clientid
}

async function existingOrder(
  supabase: SupabaseClient,
  fulfilmentId: string
): Promise<{ orderid: number; ordernumber: string } | undefined> {
  const { data, error } = await supabase
    .from('tblorders')
    .select('orderid, ordernumber')
    .eq('externalorderref', fulfilmentId)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Pickflow order lookup failed: ${error.message}`)
  return data?.orderid
    ? { orderid: data.orderid, ordernumber: data.ordernumber }
    : undefined
}

async function importClaim(
  supabase: SupabaseClient,
  claim: Commerce84Claim,
  maps: Awaited<ReturnType<typeof loadProductMaps>>
): Promise<{ order: ImportedOrder; existing: boolean }> {
  const envelope = claim.envelope
  const found = await existingOrder(supabase, envelope.fulfilmentId)
  if (found) {
    return {
      order: {
        ...found,
        fulfilmentId: envelope.fulfilmentId,
        claimToken: claim.claimToken,
      },
      existing: true,
    }
  }

  const resolvedLines = resolveCommerce84OrderLines(
    envelope.lines,
    maps.mappings,
    maps.products
  )
  const clientid = await findOrCreateClient(supabase, envelope.shippingAddress)
  const address = envelope.shippingAddress
  const subtotalMinor = envelope.lines.reduce(
    (total, line) => total + line.lineTotalMinor,
    0
  )
  const totalWeightG = resolvedLines.reduce(
    (total, line) => total + line.unitweightg * line.quantityordered,
    0
  )
  const { data: createdOrder, error: orderError } = await supabase
    .from('tblorders')
    .insert({
      ordernumber: envelope.orderNumber,
      clientid,
      orderdate: envelope.availableAt,
      ordersource: 'The Badge Room',
      externalorderref: envelope.fulfilmentId,
      externalreference: envelope.orderId,
      status: 'New',
      isebay: false,
      isblindship: false,
      shiptoname: `${address.firstName} ${address.lastName}`.trim(),
      shiptoaddress1: address.address1,
      shiptoaddress2: address.address2 || '',
      shiptoaddress3: '',
      shiptotown: address.city,
      shiptocounty: address.region || '',
      shiptopostcode: address.postalCode,
      shiptocountry: countryName(address.countryCode),
      subtotal: subtotalMinor / 100,
      productvat: 0,
      shippingvat: 0,
      totalvat: 0,
      shippingcost: envelope.shippingCostMinor / 100,
      shippingmethod: envelope.shippingMethod,
      ordertotal: envelope.orderTotalMinor / 100,
      ordertotalincvat: envelope.orderTotalMinor / 100,
      totalweightg: totalWeightG,
      notes: envelope.notes || `Commerce84 order ${envelope.orderNumber}`,
      createdby: 'commerce84',
    })
    .select('orderid, ordernumber')
    .single()
  if (orderError || !createdOrder) {
    const raced = await existingOrder(supabase, envelope.fulfilmentId)
    if (raced) {
      return {
        order: {
          ...raced,
          fulfilmentId: envelope.fulfilmentId,
          claimToken: claim.claimToken,
        },
        existing: true,
      }
    }
    throw new Error(`Pickflow order creation failed: ${orderError?.message || 'no row'}`)
  }

  const lineRows = resolvedLines.map(({ unitweightg: _weight, ...line }) => ({
    ...line,
    orderid: createdOrder.orderid,
  }))
  const { error: lineError } = await supabase.from('tblorderlines').insert(lineRows)
  if (lineError) {
    await supabase.from('tblorderlines').delete().eq('orderid', createdOrder.orderid)
    await supabase.from('tblorders').delete().eq('orderid', createdOrder.orderid)
    throw new Error(`Pickflow order-line creation failed: ${lineError.message}`)
  }
  return {
    order: {
      orderid: createdOrder.orderid,
      ordernumber: createdOrder.ordernumber,
      fulfilmentId: envelope.fulfilmentId,
      claimToken: claim.claimToken,
    },
    existing: false,
  }
}

function statusReport(
  status: string
): 'picking' | 'packed' | 'dispatched' | 'cancelled' | undefined {
  if (status === 'Printed' || status === 'Picking' || status === 'Packed') {
    return status === 'Packed' ? 'packed' : 'picking'
  }
  if (status === 'Dispatched' || status === 'Invoiced' || status === 'Completed') {
    return 'dispatched'
  }
  if (status === 'Cancelled') return 'cancelled'
  return undefined
}

async function reportExistingOrderStatuses(
  supabase: SupabaseClient,
  configuration: Commerce84SyncConfiguration,
  fetchImpl: typeof fetch
): Promise<number> {
  const { data, error } = await supabase
    .from('tblorders')
    .select('orderid, ordernumber, status, trackingnumber, externalorderref')
    .eq('ordersource', 'The Badge Room')
    .not('externalorderref', 'is', null)
    .range(0, 9999)
  if (error) throw new Error(`Pickflow status load failed: ${error.message}`)

  let reported = 0
  for (const order of data || []) {
    const mapped = statusReport(order.status)
    if (!mapped || !clean(order.externalorderref)) continue
    const envelope = {
      fulfilmentId: order.externalorderref,
    } as Commerce84OrderEnvelope
    await reportStatus(
      configuration,
      fetchImpl,
      '',
      envelope,
      { orderid: order.orderid, ordernumber: order.ordernumber },
      mapped,
      order.trackingnumber
    )
    reported += 1
  }
  return reported
}

export async function synchroniseCommerce84Orders(
  configuration: Commerce84SyncConfiguration,
  options: {
    supabase?: SupabaseClient
    fetchImpl?: typeof fetch
  } = {}
): Promise<Commerce84SyncResult> {
  const fetchImpl = options.fetchImpl || fetch
  const supabase =
    options.supabase ||
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  const result: Commerce84SyncResult = {
    claimed: 0,
    imported: 0,
    existing: 0,
    reported: 0,
    errors: [],
  }
  const maps = await loadProductMaps(supabase)

  for (let index = 0; index < configuration.syncLimit; index += 1) {
    let claim: Commerce84Claim | undefined
    try {
      claim = await claimNextOrder(configuration, fetchImpl)
      if (!claim) break
      result.claimed += 1
      const imported = await importClaim(supabase, claim, maps)
      if (imported.existing) result.existing += 1
      else result.imported += 1
      await reportStatus(
        configuration,
        fetchImpl,
        claim.claimToken,
        claim.envelope,
        imported.order,
        'accepted'
      )
      result.reported += 1
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error')
      break
    }
  }

  try {
    result.reported += await reportExistingOrderStatuses(
      supabase,
      configuration,
      fetchImpl
    )
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Status sync failed')
  }
  return result
}
