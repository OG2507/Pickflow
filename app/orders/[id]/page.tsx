'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logActivity, logChanges } from '@/lib/activity'

type Order = {
  orderid: number
  ordernumber: string | null
  clientid: number
  orderdate: string | null
  requireddate: string | null
  ordersource: string | null
  status: string
  isblindship: boolean
  shiptoname: string | null
  shiptoaddress1: string | null
  shiptoaddress2: string | null
  shiptoaddress3: string | null
  shiptotown: string | null
  shiptocounty: string | null
  shiptopostcode: string | null
  shiptocountry: string
  shippingmethod: string | null
  trackingnumber: string | null
  despatchdate: string | null
  subtotal: number
  productvat: number
  shippingvat: number
  totalvat: number
  shippingcost: number
  ordertotal: number
  ordertotalincvat: number
  totalweightg: number
  notes: string | null
  createdby: string | null
  isebay: boolean
  cadorderid: string | null
  externalorderref: string | null
  externalreference: string | null
  royalmailexportedat: string | null
}

type OrderLine = {
  orderlineid: number
  productid: number | null
  sku: string | null
  productname: string | null
  quantityordered: number
  quantitypicked: number
  unitprice: number
  linetotal: number
  vatstatus: string
  vatrate: number
  vatamount: number
  linetotalincvat: number
  status: string
  notes: string | null
}

type ShippingRate = {
  shippingrateid: number
  methodname: string
  price: number
  minweightg: number | null
  maxweightg: number | null
}

type Product = {
  productid: number
  sku: string
  productname: string
  category: string | null
  salesprice: number
  wholesaleprice: number
  reducedwholesaleprice: number
  pricingcode: string | null
  vatstatus: string
  weight: number | null
  isactive: boolean
}

// Status flows
const WEBSITE_FLOW = ['New', 'Printed', 'Picking', 'Dispatched', 'Completed']
const MANUAL_FLOW  = ['New', 'Printed', 'Post Printed', 'Picking', 'Dispatched', 'Invoiced', 'Completed']
const WEBSITE_SOURCES = ['Shopwired']

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price)

function ClientSummary({ clientid, router }: { clientid: number, router: any }) {
  const [client, setClient] = useState<any>(null)

  useEffect(() => {
    supabase
      .from('tblclients')
      .select('clientid, clientcode, companyname, firstname, lastname, email, phone, clienttype')
      .eq('clientid', clientid)
      .single()
      .then(({ data }) => setClient(data))
  }, [clientid])

  if (!client) return <div className="pf-loading">Loading…</div>

  const name = client.companyname ||
    [client.firstname, client.lastname].filter(Boolean).join(' ') || '—'

  return (
    <div>
      <div className="pf-meta-row">
        <span>Name</span>
        <span
          className="pf-link"
          style={{ cursor: 'pointer', color: 'var(--pf-brand)' }}
          onClick={() => router.push(`/clients/${client.clientid}`)}
        >
          {name}
        </span>
      </div>
      {client.clientcode && (
        <div className="pf-meta-row">
          <span>Code</span>
          <span>{client.clientcode}</span>
        </div>
      )}
      {client.clienttype && (
        <div className="pf-meta-row">
          <span>Type</span>
          <span>{client.clienttype}</span>
        </div>
      )}
      {client.email && (
        <div className="pf-meta-row">
          <span>Email</span>
          <span>{client.email}</span>
        </div>
      )}
      {client.phone && (
        <div className="pf-meta-row">
          <span>Phone</span>
          <span>{client.phone}</span>
        </div>
      )}
    </div>
  )
}

const VAT_RATE = 0.20 // pulled from AppSettings in a real implementation

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [originalOrder, setOriginalOrder] = useState<Order | null>(null)
  const [lines, setLines] = useState<OrderLine[]>([])
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Product search for adding lines
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [addingLine, setAddingLine] = useState(false)
  const [shippingInvalid, setShippingInvalid] = useState(false)

  // Client info for pricing
  const [clientIsReduced, setClientIsReduced] = useState(false)

  const isWebsiteOrder = (o: Order) => WEBSITE_SOURCES.includes(o.ordersource || '')
  const statusFlow = (o: Order) => isWebsiteOrder(o) ? WEBSITE_FLOW : MANUAL_FLOW

  const fetchOrder = useCallback(async () => {
    const { data, error } = await supabase
      .from('tblorders')
      .select('*')
      .eq('orderid', id)
      .single()

    if (error || !data) {
      setError('Order not found.')
      setLoading(false)
      return
    }

    setOrder(data)
    setOriginalOrder(data)

    // Fetch client pricing flag
    const { data: client } = await supabase
      .from('tblclients')
      .select('isreducedwholesale')
      .eq('clientid', data.clientid)
      .single()

    if (client) setClientIsReduced(client.isreducedwholesale)

    // Fetch order lines
    const { data: linesData } = await supabase
      .from('tblorderlines')
      .select('*')
      .eq('orderid', id)
      .order('orderlineid')

    setLines(linesData || [])
    setLoading(false)
  }, [id])

  const fetchShippingRates = useCallback(async (weightG: number) => {
    let query = supabase
      .from('tblshippingrates')
      .select('shippingrateid, methodname, price, minweightg, maxweightg')
      .eq('isactive', true)
      .order('displayorder')

    if (weightG > 0) {
      query = query
        .or(`minweightg.is.null,minweightg.lte.${weightG}`)
        .or(`maxweightg.is.null,maxweightg.gte.${weightG}`)
    }

    const { data } = await query
    setShippingRates(data || [])
  }, [])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  useEffect(() => {
    if (order) fetchShippingRates(order.totalweightg || 0)
  }, [order?.totalweightg, fetchShippingRates])

  // ── Recalculate totals ─────────────────────────────────────────
  const recalculateTotals = async (currentLines: OrderLine[], shippingCost: number) => {
    const subtotal = currentLines.reduce((sum, l) => sum + l.linetotal, 0)
    const productVAT = currentLines.reduce((sum, l) => sum + l.vatamount, 0)
    const hasStandardLines = currentLines.some((l) => l.vatstatus === 'Standard')
    const totalWeightG = await calculateWeight(currentLines)

    // ── Check if current shipping method is still valid for new weight ──
    // If not, clear it to force reselection — prevents underpaid postage
    let validatedShippingCost = shippingCost
    let validatedShippingMethod = order?.shippingmethod || null

    if (validatedShippingMethod && totalWeightG > 0) {
      const { data: rateCheck } = await supabase
        .from('tblshippingrates')
        .select('methodname')
        .eq('methodname', validatedShippingMethod)
        .eq('isactive', true)
        .or(`minweightg.is.null,minweightg.lte.${totalWeightG}`)
        .or(`maxweightg.is.null,maxweightg.gte.${totalWeightG}`)
        .maybeSingle()

      if (!rateCheck) {
        // Shipping method no longer valid — clear it
        validatedShippingCost = 0
        validatedShippingMethod = null
        await supabase
          .from('tblorders')
          .update({ shippingmethod: null, shippingcost: 0 })
          .eq('orderid', id)
        setOrder((prev) => prev ? { ...prev, shippingmethod: null, shippingcost: 0 } : prev)
        setShippingInvalid(true)
      } else {
        setShippingInvalid(false)
      }
    }

    const shippingVAT = hasStandardLines ? validatedShippingCost * VAT_RATE : 0
    const totalVAT = productVAT + shippingVAT
    const orderTotal = subtotal + validatedShippingCost
    const orderTotalIncVAT = subtotal + productVAT + validatedShippingCost + shippingVAT

    await supabase
      .from('tblorders')
      .update({
        subtotal,
        productvat:      productVAT,
        shippingvat:     shippingVAT,
        totalvat:        totalVAT,
        ordertotal:      orderTotal,
        ordertotalincvat: orderTotalIncVAT,
        totalweightg:    totalWeightG,
      })
      .eq('orderid', id)

    setOrder((prev) => prev ? {
      ...prev,
      subtotal,
      productvat:      productVAT,
      shippingvat:     shippingVAT,
      totalvat:        totalVAT,
      ordertotal:      orderTotal,
      ordertotalincvat: orderTotalIncVAT,
      totalweightg:    totalWeightG,
    } : prev)

    fetchShippingRates(totalWeightG)
  }

  const calculateWeight = async (currentLines: OrderLine[]) => {
    let total = 0
    for (const line of currentLines) {
      if (line.productid) {
        const { data } = await supabase
          .from('tblproducts')
          .select('weight')
          .eq('productid', line.productid)
          .single()
        if (data?.weight) total += data.weight * line.quantityordered
      }
    }
    return total
  }

  // ── Product search ─────────────────────────────────────────────
  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([])
      return
    }
    const search = async () => {
      const term = productSearch.trim()
      const { data, error } = await supabase
        .from('tblproducts')
        .select('productid, sku, productname, category, salesprice, wholesaleprice, reducedwholesaleprice, pricingcode, vatstatus, weight, isactive')
        .eq('isactive', true)
        .or(`sku.ilike.%${term}%,productname.ilike.%${term}%`)
        .limit(8)

      if (error) console.error('Product search error:', error)
      setProductResults(data || [])
    }
    const timer = setTimeout(search, 200)
    return () => clearTimeout(timer)
  }, [productSearch])

  // ── Get correct price for client ───────────────────────────────
  const getClientPrice = async (product: Product): Promise<number> => {
    // Fetch all active pricing rules for this client
    const { data: pricingRules } = await supabase
      .from('tblclientpricing')
      .select('pricingtype, fixedprice, pricingcode, category')
      .eq('clientid', order!.clientid)
      .eq('isactive', true)
      .not('fixedprice', 'is', null)

    const rules = pricingRules || []

    // 1. Fixed Category — match on category text
    const categoryRule = rules.find(
      (r) => r.pricingtype === 'Fixed Category' &&
             r.category &&
             product.category &&
             r.category.trim().toLowerCase() === product.category.trim().toLowerCase()
    )
    if (categoryRule) return categoryRule.fixedprice

    // 2. Fixed PriceBand — match on pricingcode
    const bandRule = rules.find(
      (r) => r.pricingtype !== 'Fixed Category' && r.pricingcode === product.pricingcode
    )
    if (bandRule) return bandRule.fixedprice

    // If product has a price band, use band prices
    if (product.pricingcode) {
      const { data: band } = await supabase
        .from('tblpricingcodes')
        .select('salesprice, wholesaleprice, reducedwholesaleprice')
        .eq('pricingcode', product.pricingcode)
        .single()

      if (band) {
        if (clientIsReduced && band.reducedwholesaleprice > 0) return band.reducedwholesaleprice
        if (band.wholesaleprice > 0) return band.wholesaleprice
        return band.salesprice
      }
    }

    // Fall back to product prices
    if (clientIsReduced && product.reducedwholesaleprice > 0) return product.reducedwholesaleprice
    if (product.wholesaleprice > 0) return product.wholesaleprice
    return product.salesprice
  }

  // ── Add order line ─────────────────────────────────────────────
  const addLine = async (product: Product) => {
    if (!order) return
    setAddingLine(true)
    setShowProductSearch(false)
    setProductSearch('')

    const unitPrice = await getClientPrice(product)
    const lineTotal = unitPrice * 1 // qty 1 default
    const vatRate = product.vatstatus === 'Standard' ? VAT_RATE : 0
    const vatAmount = lineTotal * vatRate

    const { data, error } = await supabase
      .from('tblorderlines')
      .insert({
        orderid:        parseInt(id),
        productid:      product.productid,
        sku:            product.sku,
        productname:    product.productname,
        quantityordered: 1,
        quantitypicked:  0,
        unitprice:      unitPrice,
        linetotal:      lineTotal,
        vatstatus:      product.vatstatus,
        vatrate:        vatRate,
        vatamount:      vatAmount,
        linetotalincvat: lineTotal + vatAmount,
        status:         'Pending',
      })
      .select()
      .single()

    if (!error && data) {
      logActivity({
        action:      'create',
        entityType:  'order_line',
        entityId:    data.orderlineid,
        entityLabel: `${product.sku} × 1 — ${order?.ordernumber || `Order ${id}`}`,
      })
      const newLines = [...lines, data]
      setLines(newLines)
      await recalculateTotals(newLines, order.shippingcost || 0)
    }

    setAddingLine(false)
  }

  // ── Update line quantity ───────────────────────────────────────
  const updateLineQty = async (lineId: number, qty: number) => {
    if (qty < 1) return
    const line = lines.find((l) => l.orderlineid === lineId)
    if (!line) return

    const prevQty = line.quantityordered
    const lineTotal = line.unitprice * qty
    const vatAmount = lineTotal * line.vatrate

    await supabase
      .from('tblorderlines')
      .update({
        quantityordered: qty,
        linetotal:       lineTotal,
        vatamount:       vatAmount,
        linetotalincvat: lineTotal + vatAmount,
      })
      .eq('orderlineid', lineId)

    if (prevQty !== qty) {
      logActivity({
        action:      'update',
        entityType:  'order_line',
        entityId:    lineId,
        entityLabel: `${line.sku} — ${order?.ordernumber || `Order ${id}`}`,
        fieldName:   'quantityordered',
        oldValue:    prevQty,
        newValue:    qty,
      })
    }

    const newLines = lines.map((l) =>
      l.orderlineid === lineId
        ? { ...l, quantityordered: qty, linetotal: lineTotal, vatamount: vatAmount, linetotalincvat: lineTotal + vatAmount }
        : l
    )
    setLines(newLines)
    await recalculateTotals(newLines, order?.shippingcost || 0)
  }

  // ── Remove line ────────────────────────────────────────────────
  const removeLine = async (lineId: number) => {
    const line = lines.find((l) => l.orderlineid === lineId)
    await supabase.from('tblorderlines').delete().eq('orderlineid', lineId)
    if (line) {
      logActivity({
        action:      'delete',
        entityType:  'order_line',
        entityId:    lineId,
        entityLabel: `${line.sku} × ${line.quantityordered} — ${order?.ordernumber || `Order ${id}`}`,
      })
    }
    const newLines = lines.filter((l) => l.orderlineid !== lineId)
    setLines(newLines)
    await recalculateTotals(newLines, order?.shippingcost || 0)
  }

  // ── Draft quantity state (local display only — committed on blur) ──
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({})
  const [pickedDraft, setPickedDraft] = useState<Record<number, string>>({})

  // ── Update picked quantity (Picking stage only) ────────────────
  // Tracks which lines have been manually adjusted so they can be highlighted.
  const [editedPickedLines, setEditedPickedLines] = useState<Set<number>>(new Set())

  const updatePickedQty = async (lineId: number, qty: number) => {
    if (qty < 0) return
    await supabase
      .from('tblorderlines')
      .update({ quantitypicked: qty })
      .eq('orderlineid', lineId)
    setLines((prev) => prev.map((l) =>
      l.orderlineid === lineId ? { ...l, quantitypicked: qty } : l
    ))
    setEditedPickedLines((prev) => new Set(prev).add(lineId))
  }

  // ── Shipping method ────────────────────────────────────────────
  const selectShipping = async (methodName: string, price: number) => {
    await supabase
      .from('tblorders')
      .update({ shippingmethod: methodName, shippingcost: price })
      .eq('orderid', id)

    setOrder((prev) => prev ? { ...prev, shippingmethod: methodName, shippingcost: price } : prev)
    setShippingInvalid(false)
    setDirty(false)
    await recalculateTotals(lines, price)
  }

  // ── Save order header ──────────────────────────────────────────
  const saveHeader = async () => {
    if (!order) return
    setSaving(true)
    setError(null)

    const patch = {
      requireddate:   order.requireddate,
      isblindship:    order.isblindship,
      shiptoname:     order.shiptoname,
      shiptoaddress1: order.shiptoaddress1,
      shiptoaddress2: order.shiptoaddress2,
      shiptoaddress3: order.shiptoaddress3,
      shiptotown:     order.shiptotown,
      shiptocounty:   order.shiptocounty,
      shiptopostcode: order.shiptopostcode,
      shiptocountry:  order.shiptocountry,
      trackingnumber: order.trackingnumber,
      notes:          order.notes,
    }

    const { error } = await supabase
      .from('tblorders')
      .update(patch)
      .eq('orderid', id)

    if (error) {
      setError('Save failed: ' + error.message)
    } else {
      // Diff against the originally loaded state — only logs fields that actually changed
      if (originalOrder) {
        logChanges({
          entityType:  'order',
          entityId:    id as string,
          entityLabel: order.ordernumber || `Order ${id}`,
          before:      originalOrder as any,
          after:       { ...originalOrder, ...patch } as any,
        })
      }
      // Promote current state to the new baseline for subsequent edits
      setOriginalOrder(prev => prev ? { ...prev, ...patch } : prev)
      setDirty(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  const [confirmingPick, setConfirmingPick] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const [pendingTrackingNumber, setPendingTrackingNumber] = useState('')

  // ── Print Order ────────────────────────────────────────────────
  const exportToRoyalMail = async () => {
    const res = await fetch(`/api/royalmail-export?orderid=${order!.orderid}`)
    if (!res.ok) {
      const data = await res.json()
      setError(`Royal Mail export failed: ${data.error}`)
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `royalmail-${new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    // Refresh order to show export timestamp
    await fetchOrder()
  }

  const exportToQuickFile = async () => {
    const res = await fetch(`/api/quickfile-export?orderid=${order!.orderid}`)
    if (!res.ok) {
      const data = await res.json()
      setError(`QuickFile export failed: ${data.error}`)
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quickfile-${order!.ordernumber || order!.orderid}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    await fetchOrder()
  }

  const printOrder = async () => {
    if (!order) return

    // Fetch picking data for each line
    type PickLine = {
      sku: string
      productname: string
      quantityordered: number
      productid: number | null
      pickingbintracked: boolean
      binlocation: string | null
      binqty: number
      overflowlocations: { locationcode: string; locationname: string | null; quantityonhand: number; bagsize: number }[]
    }

    const pickLines: PickLine[] = []

    // Helper to build pick lines for a single product
    const buildPickLinesForProduct = async (
      productid: number,
      sku: string,
      productname: string,
      quantityordered: number
    ) => {
      const { data: product } = await supabase
        .from('tblproducts')
        .select('pickingbintracked, bagsizedefault, isbundle')
        .eq('productid', productid)
        .single()

      // If bundle — expand into components instead
      if (product?.isbundle) {
        const { data: components } = await supabase
          .from('tblproductcomponents')
          .select(`quantity, tblproducts!childproductid (productid, sku, productname)`)
          .eq('parentproductid', productid)

        for (const comp of components || []) {
          const child = (comp as any).tblproducts
          if (!child) continue
          await buildPickLinesForProduct(
            child.productid,
            child.sku,
            `${child.productname} [part of ${sku}]`,
            quantityordered * comp.quantity
          )
        }
        return
      }

      const productBagsize = product?.bagsizedefault || 1

      const { data: stockLevels } = await supabase
        .from('tblstocklevels')
        .select(`stocklevelid, quantityonhand, pickpriority, bagsize, locationid,
          tbllocations (locationid, locationcode, locationname, locationtype, pickpriority, isactive)`)
        .eq('productid', productid)
        .order('pickpriority')

      const levels = (stockLevels || []).filter((s: any) => s.tbllocations?.isactive)
      const binLevel = levels.find((s: any) => s.tbllocations?.locationtype === 'Picking Bin')
      const overflowLevels = levels
        .filter((s: any) => s.tbllocations?.locationtype !== 'Picking Bin' && s.quantityonhand > 0)
        .sort((a: any, b: any) => (a.tbllocations?.pickpriority || 9999) - (b.tbllocations?.pickpriority || 9999))

      pickLines.push({
        sku,
        productname,
        quantityordered,
        productid,
        pickingbintracked: product?.pickingbintracked || false,
        binlocation:       (binLevel as any)?.tbllocations?.locationcode || null,
        binqty:            binLevel?.quantityonhand || 0,
        overflowlocations: overflowLevels.map((s: any) => ({
          locationcode:   s.tbllocations?.locationcode || '',
          locationname:   s.tbllocations?.locationname || null,
          quantityonhand: s.quantityonhand,
          bagsize:        s.bagsize > 0 ? s.bagsize : productBagsize,
        })),
      })
    }

    for (const line of lines) {
      if (!line.productid) {
        // Still add to pick lines with no location info — shows on picking list as manual check
        pickLines.push({
          sku: line.sku || '',
          productname: line.productname || '',
          quantityordered: line.quantityordered,
          productid: null,
          pickingbintracked: false,
          binlocation: null,
          binqty: 0,
          overflowlocations: [],
        })
        continue
      }
      await buildPickLinesForProduct(
        line.productid,
        line.sku || '',
        line.productname || '',
        line.quantityordered
      )
    }

    // Build picking instructions per line
    const buildPickInstructions = (pl: PickLine): string[] => {
      const instructions: string[] = []
      const qty = pl.quantityordered

      if (pl.pickingbintracked && pl.binqty > 0) {
        // Mode 2a — tracked, bin has stock
        let remaining = qty
        const fromBin = Math.min(pl.binqty, remaining)

        if (fromBin > 0) {
          instructions.push(`>> Take ${fromBin} from bin ${pl.binlocation}`)
          remaining -= fromBin
        }

        for (const ovf of pl.overflowlocations) {
          if (remaining <= 0) break
          const bagsize = ovf.bagsize || 1

          if (bagsize === 1) {
            instructions.push(`>> Also take ${remaining} from ${ovf.locationcode}`)
            instructions.push(`+  Top up bin ${pl.binlocation} from ${ovf.locationcode} if possible`)
            instructions.push(`*  Update bin ${pl.binlocation} count after topping up`)
            remaining = 0
          } else {
            const fullBags = Math.floor(remaining / bagsize)
            const partial = remaining % bagsize

            if (fullBags > 0) {
              instructions.push(`>> Take ${fullBags} bag${fullBags > 1 ? 's' : ''} (${fullBags * bagsize}) from ${ovf.locationcode}`)
              remaining -= fullBags * bagsize
            }
            if (partial > 0 && remaining > 0) {
              const toBin = bagsize - partial
              instructions.push(`>> Open 1 bag from ${ovf.locationcode} — take ${partial} for order`)
              instructions.push(`+  Put remaining ${toBin} into bin ${pl.binlocation}`)
              instructions.push(`*  Update bin ${pl.binlocation} count`)
              remaining -= partial
            }
          }
        }

        if (remaining > 0) {
          instructions.push(`!  Short by ${remaining} — check stock manually`)
        }

      } else if (pl.pickingbintracked && pl.binqty === 0) {
        // Mode 2b — tracked, bin is empty
        if (pl.overflowlocations.length === 0) {
          instructions.push(`!  Bin ${pl.binlocation} is empty — no overflow found`)
          instructions.push(`!  Check stock manually`)
        } else {
          let remaining = qty
          for (const ovf of pl.overflowlocations) {
            if (remaining <= 0) break
            const bagsize = ovf.bagsize || 1

            if (bagsize === 1) {
              instructions.push(`!  Bin ${pl.binlocation} is empty`)
              instructions.push(`>> Take ${remaining} from ${ovf.locationcode}`)
              instructions.push(`+  Top up bin ${pl.binlocation} from ${ovf.locationcode} if possible`)
              instructions.push(`*  Update both bin ${pl.binlocation} and ${ovf.locationcode} counts`)
              remaining = 0
            } else {
              const fullBags = Math.floor(remaining / bagsize)
              const partial = remaining % bagsize

              instructions.push(`!  Bin ${pl.binlocation} is empty`)
              if (fullBags > 0) {
                instructions.push(`>> Take ${fullBags} bag${fullBags > 1 ? 's' : ''} (${fullBags * bagsize}) from ${ovf.locationcode}`)
                remaining -= fullBags * bagsize
              }
              if (partial > 0 && remaining > 0) {
                const toBin = bagsize - partial
                instructions.push(`>> Open 1 bag from ${ovf.locationcode} — take ${partial} for order`)
                instructions.push(`+  Put remaining ${toBin} into bin ${pl.binlocation}`)
                remaining -= partial
              }
              instructions.push(`*  Update bin ${pl.binlocation} count`)
            }
          }
          if (remaining > 0) {
            instructions.push(`!  Short by ${remaining} — check stock manually`)
          }
        }

      } else {
        // Mode 1 — bin not tracked
        if (pl.binlocation && pl.overflowlocations.length === 0) {
          instructions.push(`>> Take ${qty} from bin ${pl.binlocation}`)
        } else if (!pl.binlocation && pl.overflowlocations.length === 0) {
          instructions.push(`!  No stock locations found — check manually`)
        } else {
          const ovfLocation = pl.overflowlocations[0]
          const bagsize = ovfLocation.bagsize || 1
          const binRef = pl.binlocation || 'bin'

          instructions.push(`>> ${binRef} — take ${qty} if available`)
          if (bagsize === 1) {
            instructions.push(`>> Overflow — ${ovfLocation.locationcode}: take ${remaining} (${ovfLocation.quantityonhand} available)`)
            instructions.push(`+  Fill ${binRef} with as many as possible from ${ovfLocation.locationcode}`)
          } else {
            instructions.push(`>> Overflow — ${ovfLocation.locationcode}: take 1 bag (${bagsize} units)`)
            instructions.push(`+  Take what you need from the bag, put the remainder into bin (${binRef})`)
          }
          instructions.push(`*  Count quantity in ${binRef} and update the system`)

          if (pl.overflowlocations.length > 1) {
            instructions.push(`   Other overflow: ${pl.overflowlocations.slice(1).map(o => `${o.locationcode} (${o.quantityonhand})`).join(', ')}`)
          }
        }
      }

      return instructions
    }

    // Sort pick lines by bin location for logical warehouse picking sequence
    pickLines.sort((a, b) => {
      const locA = a.binlocation || 'ZZZ'
      const locB = b.binlocation || 'ZZZ'
      return locA.localeCompare(locB)
    })

    // Build single combined document — picking list + packing slip on separate pages

    // Load company details from app settings
    const { data: settingsData } = await supabase
      .from('tblappsettings')
      .select('settingkey, settingvalue')
      .in('settingkey', ['CompanyName', 'CompanyAddress', 'CompanyPhone', 'CompanyEmail'])

    const settings: Record<string, string> = {}
    for (const s of settingsData || []) {
      settings[s.settingkey] = s.settingvalue || ''
    }

    const companyName    = settings['CompanyName'] || 'JKs Bargains Ltd'
    const companyAddress = (settings['CompanyAddress'] || '').replace(/\n/g, '<br>')
    const companyPhone   = settings['CompanyPhone'] || ''
    const companyEmail   = settings['CompanyEmail'] || ''

    const deliveryName = [order.shiptoname].filter(Boolean).join('')

    const deliveryAddress = [
      order.shiptoname,
      order.shiptoaddress1,
      order.shiptoaddress2,
      order.shiptoaddress3,
      order.shiptotown,
      order.shiptocounty,
      order.shiptopostcode,
      order.shiptocountry,
    ].filter(Boolean).join('<br>')

    const packingRows = [...lines].sort((a, b) => a.sku.localeCompare(b.sku)).map((line) =>`
      <tr>
        <td>${line.sku}</td>
        <td>${line.productname}</td>
        <td style="text-align:center">${line.quantityordered}</td>
      </tr>
    `).join('')

    const companyBlock = order.isblindship ? '' : `
      <div style="font-size:9pt; margin-bottom:8pt">
        <strong>${companyName}</strong><br>
        ${companyAddress}${companyPhone ? `<br>${companyPhone}` : ''}${companyEmail ? `<br>${companyEmail}` : ''}
      </div>
    `

    const combinedHTML = `
      <!DOCTYPE html><html><head><title>Order ${order.ordernumber}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 10pt; margin: 20pt; color: #000; }
        h1 { font-size: 16pt; margin: 0 0 4pt 0; }
        .doc-header { display: flex; justify-content: space-between; border-bottom: 2pt solid #000; padding-bottom: 8pt; margin-bottom: 12pt; }
        .meta { font-size: 9pt; line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f0f0f0; border: 1pt solid #999; padding: 4pt 6pt; text-align: left; font-size: 8pt; text-transform: uppercase; }
        td { border: 1pt solid #ccc; padding: 5pt 6pt; font-size: 9pt; vertical-align: top; }
        tr:nth-child(even) td { background: #fafafa; }
        .page-break { page-break-after: always; margin-bottom: 20pt; }
        .thankyou { margin-top: 20pt; padding-top: 12pt; border-top: 1pt solid #ccc; font-size: 9pt; text-align: center; color: #555; }
        .pick-action { font-weight: bold; }
        .pick-fill { color: #333; }
        .pick-update { font-style: italic; color: #555; }
        .pick-warn { font-weight: bold; color: #cc0000; }
      </style></head><body>

      <!-- PICKING LIST -->
      <div class="doc-header">
        <div>
          <h1>Picking List</h1>
          <div class="meta">
            <strong>Order:</strong> ${order.ordernumber || '—'}${order.externalreference ? ` (SW: ${order.externalreference})` : ''}<br>
            <strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}<br>
            <strong>Source:</strong> ${order.ordersource}
          </div>
        </div>
        <div class="meta" style="text-align:right">
          <strong>Ship To:</strong><br>${deliveryName || '—'}
        </div>
      </div>
      <table>
        <thead><tr><th>Bin</th><th>SKU</th><th>Product</th><th>Qty</th><th>Pick Instructions</th></tr></thead>
        <tbody>${pickLines.map((pl) => {
          const instructions = buildPickInstructions(pl)
          return `
            <tr>
              <td style="font-weight:bold;white-space:nowrap">${pl.binlocation || '—'}</td>
              <td>${pl.sku}</td>
              <td>${pl.productname}</td>
              <td style="text-align:center"><strong>${pl.quantityordered}</strong></td>
              <td>${instructions.map((i) => {
                const cls = i.startsWith('>>') ? 'pick-action' : i.startsWith('!') ? 'pick-warn' : i.startsWith('+') ? 'pick-fill' : i.startsWith('*') ? 'pick-update' : ''
                return `<div class="${cls}" style="margin-bottom:3pt">${i}</div>`
              }).join('')}</td>
            </tr>
          `
        }).join('')}</tbody>
      </table>
      ${order.notes ? `<div style="margin-top:12pt;font-size:9pt"><strong>Order Notes:</strong> ${order.notes}</div>` : ''}

      <div class="page-break"></div>

      <!-- PACKING SLIP -->
      ${companyBlock}
      <div class="doc-header">
        <div>
          <h1>Packing Slip</h1>
          <div class="meta">
            <strong>Order:</strong> ${order.ordernumber || '—'}${order.externalreference ? ` (SW: ${order.externalreference})` : ''}<br>
            <strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}
          </div>
        </div>
        <div class="meta" style="text-align:right">
          <strong>Deliver To:</strong><br>${deliveryAddress}
        </div>
      </div>
      <table>
        <thead><tr><th>SKU</th><th>Product Description</th><th>Qty</th></tr></thead>
        <tbody>${packingRows}</tbody>
      </table>
      ${order.notes ? `<div style="margin-top:12pt;font-size:9pt"><strong>Notes:</strong> ${order.notes}</div>` : ''}
      <div class="thankyou">
        Thank you for your order. If you have any questions please don't hesitate to get in touch.
      </div>

      </body></html>
    `

    // Open single window with both documents
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (printWindow) {
      printWindow.document.write(combinedHTML)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => { try { printWindow.print() } catch(e) {} }, 600)
    }

    // Advance status to Printed
    const prevStatus = order?.status
    await supabase.from('tblorders').update({ status: 'Printed' }).eq('orderid', id)
    setOrder((prev) => prev ? { ...prev, status: 'Printed' } : prev)
    if (prevStatus !== 'Printed') {
      logActivity({
        action:      'update',
        entityType:  'order',
        entityId:    id as string,
        entityLabel: order?.ordernumber || `Order ${id}`,
        fieldName:   'status',
        oldValue:    prevStatus,
        newValue:    'Printed',
      })
    }
  }

  // ── Confirm Pick ───────────────────────────────────────────────
  const confirmPick = async () => {
    if (!order) return
    console.log(`[confirmPick] STARTED — orderid=${order.orderid} lines=${lines.length}`)
    setConfirmingPick(true)
    setPickError(null)

    // Helper to execute stock movements for a single product.
    // Returns the actual quantity picked (may be less than quantityordered if stock is short).
    const executePickMovements = async (
      productid: number,
      quantityordered: number,
      ordernumber: string
    ): Promise<number> => {
      const { data: product, error: productErr } = await supabase
        .from('tblproducts')
        .select('pickingbintracked, bagsizedefault, isbundle')
        .eq('productid', productid)
        .single()

      console.log(`[confirmPick] productid=${productid} qty=${quantityordered} tracked=${product?.pickingbintracked} bundle=${product?.isbundle} err=${productErr?.message}`)

      // If bundle — execute movements for each component.
      // Return quantityordered as bundles don't have their own stock level.
      if (product?.isbundle) {
        const { data: components } = await supabase
          .from('tblproductcomponents')
          .select('quantity, childproductid')
          .eq('parentproductid', productid)

        for (const comp of components || []) {
          await executePickMovements(comp.childproductid, quantityordered * comp.quantity, ordernumber)
        }
        return quantityordered
      }

      // Untracked — no automatic stock movements. Return the quantity as-is
      // (caller passes quantitypicked, which is assumed correct for untracked products).
      if (!product?.pickingbintracked) {
        console.log(`[confirmPick] productid=${productid} — UNTRACKED, returning ${quantityordered}`)
        return quantityordered
      }

      const productBagsize = product?.bagsizedefault || 1

      const { data: stockLevelsRaw, error: stockErr } = await supabase
        .from('tblstocklevels')
        .select('stocklevelid, quantityonhand, pickpriority, bagsize, locationid, tbllocations(locationtype, pickpriority)')
        .eq('productid', productid)
        .gt('quantityonhand', 0)

      console.log(`[confirmPick] productid=${productid} — stockLevels count=${stockLevelsRaw?.length ?? 'null'} err=${stockErr?.message}`)

      if (!stockLevelsRaw) return 0

      const stockLevels = stockLevelsRaw.sort((a: any, b: any) => (a.tbllocations?.pickpriority || 9999) - (b.tbllocations?.pickpriority || 9999))

      const binLevel = (stockLevels as any[]).find((s) => s.tbllocations?.locationtype === 'Picking Bin')
      const overflowLevels = (stockLevels as any[]).filter((s) => s.tbllocations?.locationtype !== 'Picking Bin')

      let remaining = quantityordered

      if (binLevel && remaining > 0) {
        const fromBin = Math.min(binLevel.quantityonhand, remaining)
        await supabase.from('tblstocklevels').update({ quantityonhand: binLevel.quantityonhand - fromBin }).eq('stocklevelid', binLevel.stocklevelid)
        await supabase.from('tblstockmovements').insert({
          movementdate: new Date().toISOString(), movementtype: 'PICK',
          productid, fromlocationid: binLevel.locationid,
          quantity: fromBin, reference: ordernumber, reason: 'Order pick', createdby: 'system',
        })
        remaining -= fromBin
      }

      for (const ovf of overflowLevels) {
        if (remaining <= 0) break
        const bagsize = ovf.bagsize > 0 ? ovf.bagsize : productBagsize
        const fullBags = Math.floor(remaining / bagsize)
        const partial = remaining % bagsize

        // Track running quantity so partial deduction uses the post-full-bags value
        let ovfQty = ovf.quantityonhand

        if (fullBags > 0) {
          const deduct = fullBags * bagsize
          ovfQty -= deduct
          await supabase.from('tblstocklevels').update({ quantityonhand: ovfQty }).eq('stocklevelid', ovf.stocklevelid)
          await supabase.from('tblstockmovements').insert({
            movementdate: new Date().toISOString(), movementtype: 'PICK',
            productid, fromlocationid: ovf.locationid,
            quantity: deduct, reference: ordernumber, reason: 'Order pick — full bags', createdby: 'system',
          })
          remaining -= deduct
        }

        if (partial > 0 && remaining > 0) {
          const toBin = bagsize - partial
          ovfQty -= bagsize
          await supabase.from('tblstocklevels').update({ quantityonhand: ovfQty }).eq('stocklevelid', ovf.stocklevelid)
          await supabase.from('tblstockmovements').insert({
            movementdate: new Date().toISOString(), movementtype: 'PICK',
            productid, fromlocationid: ovf.locationid,
            quantity: partial, reference: ordernumber, reason: 'Order pick — partial bag', createdby: 'system',
          })

          if (binLevel) {
            const { data: currentBin } = await supabase.from('tblstocklevels').select('quantityonhand').eq('stocklevelid', binLevel.stocklevelid).single()
            await supabase.from('tblstocklevels').update({ quantityonhand: (currentBin?.quantityonhand || 0) + toBin }).eq('stocklevelid', binLevel.stocklevelid)
            await supabase.from('tblstockmovements').insert({
              movementdate: new Date().toISOString(), movementtype: 'TRANSFER',
              productid, fromlocationid: ovf.locationid, tolocationid: binLevel.locationid,
              quantity: toBin, reference: ordernumber, reason: 'Partial bag remainder to bin', createdby: 'system',
            })
          }
          remaining -= partial
        }
      }

      // Return how many were actually picked
      return quantityordered - remaining
    }

    const pickedResults = new Map<number, number>()

    for (const line of lines) {
      if (!line.productid) continue

      // Use quantitypicked as set by the picker — seeded to quantityordered for untracked,
      // 0 for tracked (confirmPick calculates the real figure from stock).
      const pickedQty = line.quantitypicked ?? line.quantityordered
      console.log(`[confirmPick] line ${line.orderlineid} sku=${line.sku} quantityordered=${line.quantityordered} quantitypicked=${line.quantitypicked} → pickedQty=${pickedQty}`)
      const actualPicked = await executePickMovements(line.productid, pickedQty, order.ordernumber)

      await supabase
        .from('tblorderlines')
        .update({ quantitypicked: actualPicked, status: 'Picked' })
        .eq('orderlineid', line.orderlineid)

      pickedResults.set(line.orderlineid, actualPicked)
    }

    // Update React state so the display immediately shows actual picked quantities
    setLines((prev) => prev.map((l) =>
      pickedResults.has(l.orderlineid)
        ? { ...l, quantitypicked: pickedResults.get(l.orderlineid)!, status: 'Picked' }
        : l
    ))

    // Advance to Dispatched
    const prevStatusDisp = order.status
    const updates = { status: 'Dispatched', despatchdate: new Date().toISOString() }
    await supabase.from('tblorders').update(updates).eq('orderid', id)
    setOrder((prev) => prev ? { ...prev, ...updates } : prev)
    logActivity({
      action:      'update',
      entityType:  'order',
      entityId:    id as string,
      entityLabel: order.ordernumber || `Order ${id}`,
      fieldName:   'status',
      oldValue:    prevStatusDisp,
      newValue:    'Dispatched',
      notes:       'Confirm Pick',
    })
    setConfirmingPick(false)
  }

  // ── Tracking modal handler ──────────────────────────────────────
  // For wholesale orders, intercept Confirm Pick to prompt for tracking number.
  // Shopwired and eBay orders skip the modal — labels come from Shopwired directly.
  const handleConfirmPickClick = () => {
    if (!order) return
    console.log(`[confirmPick] button clicked — ordersource=${order.ordersource} status=${order.status}`)
    const isWholesale = order.ordersource !== 'Shopwired' && order.ordersource !== 'eBay'
    if (isWholesale) {
      setPendingTrackingNumber(order.trackingnumber || '')
      setShowTrackingModal(true)
    } else {
      confirmPick()
    }
  }

  const handleTrackingModalConfirm = async () => {
    if (!order) return
    setShowTrackingModal(false)
    // Save tracking number to order record before running confirmPick
    if (pendingTrackingNumber.trim()) {
      await supabase
        .from('tblorders')
        .update({ trackingnumber: pendingTrackingNumber.trim() })
        .eq('orderid', order.orderid)
      setOrder((prev) => prev ? { ...prev, trackingnumber: pendingTrackingNumber.trim() } : prev)
    }
    confirmPick()
  }

  // ── Advance status ─────────────────────────────────────────────
  const advanceStatus = async () => {
    if (!order) return
    const flow = statusFlow(order)
    const currentIndex = flow.indexOf(order.status)
    if (currentIndex === -1 || currentIndex >= flow.length - 1) return

    const nextStatus = flow[currentIndex + 1]
    const updates: any = { status: nextStatus }
    if (nextStatus === 'Dispatched') updates.despatchdate = new Date().toISOString()

    await supabase.from('tblorders').update(updates).eq('orderid', id)
    setOrder((prev) => prev ? { ...prev, ...updates } : prev)
    logActivity({
      action:      'update',
      entityType:  'order',
      entityId:    id as string,
      entityLabel: order.ordernumber || `Order ${id}`,
      fieldName:   'status',
      oldValue:    order.status,
      newValue:    nextStatus,
    })

    // When advancing to Picking, set quantitypicked for all lines:
    // - Untracked: assume full stock, set to quantityordered
    // - Tracked: check actual available stock, set to min(available, quantityordered)
    if (nextStatus === 'Picking') {
      const productIds = [...new Set(lines.map((l) => l.productid).filter(Boolean))]

      // Fetch tracking status for all products
      const { data: products } = await supabase
        .from('tblproducts')
        .select('productid, pickingbintracked')
        .in('productid', productIds)
      const trackedMap = new Map<number, boolean>((products || []).map((p: any) => [p.productid, p.pickingbintracked]))

      // Fetch total available stock for all tracked products
      const trackedProductIds = productIds.filter((pid) => trackedMap.get(pid as number))
      const stockMap = new Map<number, number>()
      if (trackedProductIds.length > 0) {
        const { data: stockLevels } = await supabase
          .from('tblstocklevels')
          .select('productid, quantityonhand')
          .in('productid', trackedProductIds)
        for (const s of stockLevels || []) {
          stockMap.set(s.productid, (stockMap.get(s.productid) || 0) + s.quantityonhand)
        }
      }

      const updatedLines: { orderlineid: number; quantitypicked: number }[] = []
      for (const line of lines) {
        if (!line.productid) continue
        let pickedQty: number
        if (trackedMap.get(line.productid)) {
          // Tracked — use available stock, capped at quantity ordered
          const available = stockMap.get(line.productid) || 0
          pickedQty = Math.min(available, line.quantityordered)
        } else {
          // Untracked — assume full stock
          pickedQty = line.quantityordered
        }
        updatedLines.push({ orderlineid: line.orderlineid, quantitypicked: pickedQty })
      }

      await Promise.all(updatedLines.map((u) =>
        supabase
          .from('tblorderlines')
          .update({ quantitypicked: u.quantitypicked })
          .eq('orderlineid', u.orderlineid)
      ))
      setLines((prev) => prev.map((l) => {
        const update = updatedLines.find((u) => u.orderlineid === l.orderlineid)
        return update ? { ...l, quantitypicked: update.quantitypicked } : l
      }))
    }
  }

  // ── Step back ──────────────────────────────────────────────────
  const stepBack = async () => {
    if (!order) return
    const flow = statusFlow(order)
    const currentIndex = flow.indexOf(order.status)
    if (currentIndex <= 0) return

    const prevStatus = flow[currentIndex - 1]
    const updates: any = { status: prevStatus }
    // Clear despatch date if stepping back from Dispatched
    if (order.status === 'Dispatched') updates.despatchdate = null

    await supabase.from('tblorders').update(updates).eq('orderid', id)
    setOrder((prev) => prev ? { ...prev, ...updates } : prev)
    logActivity({
      action:      'update',
      entityType:  'order',
      entityId:    id as string,
      entityLabel: order.ordernumber || `Order ${id}`,
      fieldName:   'status',
      oldValue:    order.status,
      newValue:    prevStatus,
      notes:       'Step back',
    })
  }


  const cancelOrder = async () => {
    const prevStatus = order?.status
    await supabase.from('tblorders').update({ status: 'Cancelled' }).eq('orderid', id)
    setOrder((prev) => prev ? { ...prev, status: 'Cancelled' } : prev)
    logActivity({
      action:      'update',
      entityType:  'order',
      entityId:    id as string,
      entityLabel: order?.ordernumber || `Order ${id}`,
      fieldName:   'status',
      oldValue:    prevStatus,
      newValue:    'Cancelled',
      notes:       'Order cancelled',
    })
  }

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setOrder((prev) => prev ? {
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    } : prev)
    setDirty(true)
    setSuccess(false)
  }

  if (loading) return <div className="pf-page"><div className="pf-loading">Loading…</div></div>
  if (!order) return <div className="pf-page"><div className="pf-empty">{error || 'Order not found.'}</div></div>

  const flow = statusFlow(order)
  const currentIndex = flow.indexOf(order.status)
  const nextStatus = currentIndex < flow.length - 1 ? flow[currentIndex + 1] : null
  const isCancelled = order.status === 'Cancelled'
  const isCompleted = order.status === 'Completed'

  return (
    <div className="pf-page">

      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => router.push('/orders')}>
            ← Orders
          </button>
          <h1 className="pf-page-title">{order.ordernumber || 'Order'}</h1>
          <p className="pf-page-subtitle">
            {order.ordersource} · {new Date(order.orderdate || '').toLocaleDateString('en-GB')}
          </p>
        </div>
        <div className="pf-header-actions">
          {success && <span className="pf-saved">Saved</span>}
          {error && <span className="pf-error-inline">{error}</span>}

          {/* Status badge */}
          <span className="pf-order-status-badge">{order.status}</span>

          {/* Step back */}
          {currentIndex > 0 && !isCancelled && !isCompleted && (
            <button className="pf-btn-secondary" onClick={stepBack}>
              ← Back to {flow[currentIndex - 1]}
            </button>
          )}

          {/* Confirm Pick — appears when status is Picking */}
          {order.status === 'Picking' && !isCancelled && (
            <button
              className="pf-btn-primary"
              onClick={handleConfirmPickClick}
              disabled={confirmingPick}
            >
              {confirmingPick ? 'Processing…' : '✓ Confirm Pick'}
            </button>
          )}

          {/* Advance status — Print Order when next is Printed, otherwise normal advance */}
          {nextStatus && !isCancelled && order.status !== 'Picking' && (
            <button className="pf-btn-primary" onClick={nextStatus === 'Printed' ? printOrder : advanceStatus}>
              {nextStatus === 'Printed' ? '🖨 Print Order' : `→ ${nextStatus}`}
            </button>
          )}

          {/* QuickFile Export — wholesale orders only, after despatch */}
          {(order.status === 'Dispatched' || order.status === 'Invoiced' || order.status === 'Completed') &&
           order.ordersource !== 'Shopwired' && order.ordersource !== 'eBay' && (
            <button
              className="pf-btn-secondary"
              onClick={exportToQuickFile}
            >
              ↓ QuickFile CSV
            </button>
          )}

          {/* Royal Mail CSV — wholesale Printed orders not yet exported */}
          {order.status === 'Printed' &&
           order.ordersource !== 'Shopwired' && order.ordersource !== 'eBay' && (
            <button
              className="pf-btn-secondary"
              onClick={exportToRoyalMail}
            >
              ↓ Royal Mail CSV
            </button>
          )}

          {/* Cancel */}
          {!isCancelled && !isCompleted && (
            <button className="pf-btn-deactivate" onClick={cancelOrder}>
              Cancel Order
            </button>
          )}

          {/* Save header changes */}
          {dirty && (
            <button className="pf-btn-secondary" onClick={saveHeader} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* Status flow indicator */}
      <div className="pf-status-flow">
        {flow.map((s, i) => (
          <div
            key={s}
            className={`pf-status-step ${
              i < currentIndex ? 'pf-step-done' :
              i === currentIndex ? 'pf-step-current' : 'pf-step-future'
            }`}
          >
            {s}
          </div>
        ))}
        {isCancelled && (
          <div className="pf-status-step pf-step-cancelled">Cancelled</div>
        )}
      </div>

      {/* Print placeholder note */}
      {order.status === 'New' && !isCancelled && (
        <div className="pf-print-note">
          🖨 Clicking <strong>Print Order</strong> will generate the picking list and packing slip, then advance the status to Printed.
        </div>
      )}

      {/* Pick error */}
      {pickError && (
        <div className="pf-shipping-invalid-warning">{pickError}</div>
      )}

      {/* Shipping invalidated warning */}
      {shippingInvalid && (
        <div className="pf-shipping-invalid-warning">
          ⚠️ <strong>Shipping method cleared.</strong> The order weight has changed and the previously selected shipping method is no longer valid for this weight. Please select a new shipping method below.
        </div>
      )}

      <div className="pf-order-grid">

        {/* LEFT — Order lines */}
        <div className="pf-order-lines-col">
          <div className="pf-card">
            <div className="pf-panel-header">
              <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
                Order Lines
              </h2>
              {!isCancelled && !isCompleted && (
                <button
                  className="pf-btn-edit"
                  onClick={() => setShowProductSearch(!showProductSearch)}
                >
                  + Add Product
                </button>
              )}
            </div>

            <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />

            {/* Product search */}
            {showProductSearch && (
              <div className="pf-product-search-wrap">
                <input
                  className="pf-input"
                  placeholder="Search by SKU or product name…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  autoFocus
                />
                {productResults.length > 0 && (
                  <div className="pf-client-dropdown">
                    {productResults.map((p) => (
                      <div
                        key={p.productid}
                        className="pf-client-dropdown-item"
                        onClick={() => addLine(p)}
                      >
                        <span className="pf-sku">{p.sku}</span>
                        <span className="pf-client-dropdown-name"> {p.productname}</span>
                        <span className="pf-client-dropdown-code">{formatPrice(p.salesprice)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {addingLine && <div className="pf-loading" style={{ padding: '0.5rem 0' }}>Adding…</div>}

            {lines.length === 0 ? (
              <div className="pf-empty" style={{ padding: '1.5rem 0' }}>No lines yet — add a product above.</div>
            ) : (
              <table className="pf-inner-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th className="pf-col-right">Ordered</th>
                    {(order.status === 'Picking' || ['Dispatched', 'Invoiced', 'Completed'].includes(order.status)) && (
                      <th className="pf-col-right">Picked</th>
                    )}
                    <th className="pf-col-right">Unit Price</th>
                    <th className="pf-col-right">Line Total</th>
                    <th className="pf-col-right">VAT</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const isDispatched = ['Dispatched', 'Invoiced', 'Completed'].includes(order.status)
                    const isPicking = order.status === 'Picking'
                    const hasShortfall = isDispatched && line.quantitypicked < line.quantityordered
                    const wasManuallyEdited = editedPickedLines.has(line.orderlineid)
                    return (
                      <tr
                        key={line.orderlineid}
                        style={wasManuallyEdited ? {
                          background: 'var(--row-edited, #fef2f2)',
                          outline: '1px solid var(--danger-border, #fca5a5)',
                        } : {}}
                      >
                        <td className="pf-sku">{line.sku}</td>
                        <td className="pf-productname">{line.productname}</td>
                        <td className="pf-col-right">
                          {!isCancelled && !isCompleted && !isPicking ? (
                            <input
                              className="pf-input pf-input-sm pf-input-num pf-qty-input"
                              type="number"
                              min="1"
                              value={qtyDraft[line.orderlineid] ?? line.quantityordered}
                              onFocus={(e) => {
                                setQtyDraft((prev) => ({ ...prev, [line.orderlineid]: String(line.quantityordered) }))
                                e.target.select()
                              }}
                              onChange={(e) => setQtyDraft((prev) => ({ ...prev, [line.orderlineid]: e.target.value }))}
                              onBlur={(e) => {
                                const qty = parseInt(e.target.value) || 1
                                setQtyDraft((prev) => { const n = { ...prev }; delete n[line.orderlineid]; return n })
                                updateLineQty(line.orderlineid, qty)
                              }}
                            />
                          ) : line.quantityordered}
                        </td>
                        {isPicking && (
                          <td className="pf-col-right">
                            <input
                              className="pf-input pf-input-sm pf-input-num pf-qty-input"
                              type="number"
                              min="0"
                              max={line.quantityordered}
                              value={pickedDraft[line.orderlineid] ?? line.quantitypicked}
                              onFocus={(e) => {
                                setPickedDraft((prev) => ({ ...prev, [line.orderlineid]: String(line.quantitypicked) }))
                                e.target.select()
                              }}
                              onChange={(e) => setPickedDraft((prev) => ({ ...prev, [line.orderlineid]: e.target.value }))}
                              onBlur={(e) => {
                                const qty = parseInt(e.target.value) ?? 0
                                setPickedDraft((prev) => { const n = { ...prev }; delete n[line.orderlineid]; return n })
                                updatePickedQty(line.orderlineid, qty)
                              }}
                              style={wasManuallyEdited ? { borderColor: 'var(--danger, #dc2626)' } : {}}
                            />
                          </td>
                        )}
                        {isDispatched && (
                          <td className="pf-col-right" style={hasShortfall ? {
                            color: 'var(--warning, #b45309)',
                            fontWeight: 600,
                          } : {}}>
                            {hasShortfall ? `${line.quantitypicked} ⚠` : line.quantitypicked}
                          </td>
                        )}
                        <td className="pf-col-right pf-price">{formatPrice(line.unitprice)}</td>
                        <td className="pf-col-right pf-price">{formatPrice(line.linetotal)}</td>
                        <td className="pf-col-right pf-category">
                          <span className={`pf-badge ${line.vatstatus === 'Standard' ? 'pf-badge-vat' : 'pf-badge-zero'}`}>
                            {line.vatstatus === 'Standard' ? '20%' : 'Zero'}
                          </span>
                        </td>
                        <td>
                          {!isCancelled && !isCompleted && !isPicking && (
                            <button
                              className="pf-btn-deactivate"
                              style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
                              onClick={() => removeLine(line.orderlineid)}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Totals */}
            {lines.length > 0 && (
              <div className="pf-order-totals">
                <div className="pf-order-total-row">
                  <span>Subtotal (ex VAT)</span>
                  <span>{formatPrice(order.subtotal)}</span>
                </div>
                <div className="pf-order-total-row">
                  <span>Product VAT</span>
                  <span>{formatPrice(order.productvat)}</span>
                </div>
                {order.shippingcost > 0 && (
                  <>
                    <div className="pf-order-total-row">
                      <span>Shipping ({order.shippingmethod})</span>
                      <span>{formatPrice(order.shippingcost)}</span>
                    </div>
                    <div className="pf-order-total-row">
                      <span>Shipping VAT</span>
                      <span>{formatPrice(order.shippingvat)}</span>
                    </div>
                  </>
                )}
                <div className="pf-order-total-row pf-order-total-final">
                  <span>Order Total (inc VAT)</span>
                  <span>{formatPrice(order.ordertotalincvat)}</span>
                </div>
                {order.totalweightg > 0 && (
                  <div className="pf-order-weight">
                    Order weight: {order.totalweightg}g
                    {order.totalweightg >= 1000 && ` (${(order.totalweightg / 1000).toFixed(2)}kg)`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Order details */}
        <div className="pf-order-details-col">

          {/* Customer */}
          <div className="pf-card">
            <h2 className="pf-card-title">Customer</h2>
            {order.clientid && (
              <ClientSummary clientid={order.clientid} router={router} />
            )}
          </div>

          {/* Delivery address */}
          <div className="pf-card">
            <h2 className="pf-card-title">Delivery Address</h2>

            <div className="pf-field">
              <label className="pf-label">Ship To</label>
              <input className="pf-input" name="shiptoname" value={order.shiptoname || ''} onChange={handleOrderChange} />
            </div>
            <div className="pf-field">
              <label className="pf-label">Address Line 1</label>
              <input className="pf-input" name="shiptoaddress1" value={order.shiptoaddress1 || ''} onChange={handleOrderChange} />
            </div>
            <div className="pf-field">
              <label className="pf-label">Address Line 2</label>
              <input className="pf-input" name="shiptoaddress2" value={order.shiptoaddress2 || ''} onChange={handleOrderChange} />
            </div>
            <div className="pf-field">
              <label className="pf-label">Address Line 3</label>
              <input className="pf-input" name="shiptoaddress3" value={order.shiptoaddress3 || ''} onChange={handleOrderChange} />
            </div>
            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Town</label>
                <input className="pf-input" name="shiptotown" value={order.shiptotown || ''} onChange={handleOrderChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">County</label>
                <input className="pf-input" name="shiptocounty" value={order.shiptocounty || ''} onChange={handleOrderChange} />
              </div>
            </div>
            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Postcode</label>
                <input className="pf-input pf-input-mono" name="shiptopostcode" value={order.shiptopostcode || ''} onChange={handleOrderChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Country</label>
                <input className="pf-input" name="shiptocountry" value={order.shiptocountry || ''} onChange={handleOrderChange} />
              </div>
            </div>

            <div className="pf-field" style={{ marginTop: '0.25rem' }}>
              <label className="pf-checkbox-row">
                <input type="checkbox" name="isblindship" checked={order.isblindship} onChange={handleOrderChange} />
                <span>
                  <strong>Blind Ship</strong>
                  <small>Use unbranded packing slip</small>
                </span>
              </label>
            </div>
          </div>

          {/* Shipping */}
          <div className="pf-card">
            <h2 className="pf-card-title">Shipping</h2>

            {shippingRates.length === 0 ? (
              <div className="pf-stock-empty">No shipping methods available for this weight.</div>
            ) : (
              <div className="pf-shipping-options">
                {shippingRates.map((rate) => (
                  <div
                    key={rate.shippingrateid}
                    className={`pf-shipping-option ${order.shippingmethod === rate.methodname ? 'pf-shipping-selected' : ''}`}
                    onClick={() => !isCancelled && !isCompleted && selectShipping(rate.methodname, rate.price)}
                  >
                    <span className="pf-shipping-name">{rate.methodname}</span>
                    <span className="pf-shipping-price">{formatPrice(rate.price)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pf-field" style={{ marginTop: '0.875rem' }}>
              <label className="pf-label">Tracking Number</label>
              <input
                className="pf-input pf-input-mono"
                name="trackingnumber"
                value={order.trackingnumber || ''}
                onChange={handleOrderChange}
                placeholder="Add after despatch…"
              />
            </div>
          </div>

          {/* Order info */}
          <div className="pf-card pf-card-meta">
            <h2 className="pf-card-title">Order Info</h2>
            <div className="pf-meta-row">
              <span>Order ID</span>
              <span>{order.orderid}</span>
            </div>
            <div className="pf-meta-row">
              <span>Order Date</span>
              <span>{order.orderdate ? new Date(order.orderdate).toLocaleDateString('en-GB') : '—'}</span>
            </div>
            <div className="pf-meta-row">
              <span>Source</span>
              <span>{order.ordersource || '—'}</span>
            </div>
            {order.despatchdate && (
              <div className="pf-meta-row">
                <span>Dispatched</span>
                <span>{new Date(order.despatchdate).toLocaleDateString('en-GB')}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="pf-card">
            <h2 className="pf-card-title">Notes</h2>
            <div className="pf-field">
              <textarea
                className="pf-input pf-textarea"
                name="notes"
                value={order.notes || ''}
                onChange={handleOrderChange}
                rows={3}
              />
            </div>
          </div>

        </div>
      </div>

      {/* Tracking number modal — wholesale orders only */}
      {showTrackingModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '28px 32px',
            width: '420px',
            maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text)' }}>
              Add Royal Mail Tracking Number
            </h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Enter the tracking number from Click &amp; Drop before dispatching. You can skip this and add it later from the order page.
            </p>
            <input
              type="text"
              className="pf-input pf-input-mono"
              placeholder="e.g. JD000000000GB"
              value={pendingTrackingNumber}
              onChange={(e) => setPendingTrackingNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTrackingModalConfirm() }}
              autoFocus
              style={{ width: '100%', marginBottom: '20px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="pf-btn-secondary"
                onClick={() => { setShowTrackingModal(false); confirmPick() }}
              >
                Skip for now
              </button>
              <button
                className="pf-btn-primary"
                onClick={handleTrackingModalConfirm}
              >
                {pendingTrackingNumber.trim() ? 'Save & Confirm Pick' : 'Confirm Pick'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
