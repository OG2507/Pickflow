'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logActivity, logChanges } from '@/lib/activity'
import { usePermissions } from '@/lib/usePermissions'
import OrderUploadPanel from '@/components/OrderUploadPanel'

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
  isbackorder: boolean
  parentorderid: number | null
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

  const { can } = usePermissions()
  const canViewCost = can('orders.viewcost')

  const [order, setOrder] = useState<Order | null>(null)
  const [originalOrder, setOriginalOrder] = useState<Order | null>(null)
  const [lines, setLines] = useState<OrderLine[]>([])
  const [costPriceMap, setCostPriceMap] = useState<Map<number, number | null>>(new Map())
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
  const [showUpload, setShowUpload] = useState(false)
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

    // Fetch cost prices for margin display — separate query (FK join workaround)
    const productIds = (linesData || [])
      .map((l: OrderLine) => l.productid)
      .filter((id): id is number => id !== null)

    if (productIds.length > 0) {
      const { data: costData } = await supabase
        .from('tblproducts')
        .select('productid, costprice')
        .in('productid', productIds)

      const map = new Map<number, number | null>()
      for (const p of costData || []) {
        map.set(p.productid, p.costprice)
      }
      setCostPriceMap(map)
    }

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
        .or(`sku.ilike.%${term}%,productname.ilike.%${term}%,altsku.ilike.%${term}%`)
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
  // Synchronous re-entry lock. State updates are async, so a genuine
  // double-click (two events in the same tick) can slip past the
  // confirmingPick state guard. A ref flips immediately and blocks it.
  const pickInFlight = useRef(false)
  // Guards the pre-pick phase (availability check + modal open) so a
  // rapid double-click on the main button can't run the check twice.
  const confirmClickBusy = useRef(false)
  const [pickError, setPickError] = useState<string | null>(null)
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const [pendingTrackingNumber, setPendingTrackingNumber] = useState('')

  // Backorder modal state
  type ShortfallLine = {
    orderlineid: number
    productid: number
    sku: string | null
    productname: string | null
    quantityordered: number
    quantityAvailable: number
    shortfall: number
    decision: 'backorder' | 'cancel'
  }
  const [showBackorderModal, setShowBackorderModal] = useState(false)
  const [shortfallLines, setShortfallLines] = useState<ShortfallLine[]>([])
  const [createdBackorderNumber, setCreatedBackorderNumber] = useState<string | null>(null)
  const [pendingTrackingForBackorder, setPendingTrackingForBackorder] = useState('')
  const [sendingToCAD, setSendingToCAD] = useState(false)
  const [cadSuccess, setCADSuccess] = useState<string | null>(null)

  // ── Click & Drop API ───────────────────────────────────────────
  const sendToClickAndDrop = async () => {
    if (!order) return
    setSendingToCAD(true)
    setCADSuccess(null)
    setError(null)
    try {
      const res = await fetch('/api/clickanddrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderid: order.orderid }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(`Click & Drop: ${data.error}`)
      } else {
        setCADSuccess(data.cadOrderId ? `Sent — C&D ref: ${data.cadOrderId}` : 'Sent to Click & Drop')
        await fetchOrder()
      }
    } catch (err: any) {
      setError(`Click & Drop: ${err.message}`)
    } finally {
      setSendingToCAD(false)
    }
  }

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

        let ovfUsedCount = 0
        for (const ovf of pl.overflowlocations) {
          if (remaining <= 0) break
          ovfUsedCount++
          const bagsize = ovf.bagsize || 1

          if (bagsize === 1) {
            const takeFromOvf = Math.min(ovf.quantityonhand, remaining)
            instructions.push(`>> Also take ${takeFromOvf} from ${ovf.locationcode}`)
            remaining -= takeFromOvf
            if (remaining <= 0) {
              instructions.push(`+  Top up bin ${pl.binlocation} from ${ovf.locationcode} if possible`)
              instructions.push(`*  Update bin ${pl.binlocation} count after topping up`)
            }
          } else {
            // How many full bags can this location supply?
            const fullBagsAvailable = Math.floor(ovf.quantityonhand / bagsize)
            const fullBagsNeeded = Math.floor(remaining / bagsize)
            const fullBags = Math.min(fullBagsNeeded, fullBagsAvailable)
            let ovfQtyRemaining = ovf.quantityonhand

            if (fullBags > 0) {
              instructions.push(`>> Take ${fullBags} bag${fullBags > 1 ? 's' : ''} (${fullBags * bagsize}) from ${ovf.locationcode}`)
              remaining -= fullBags * bagsize
              ovfQtyRemaining -= fullBags * bagsize
            }
            // Only open a partial bag from this location if:
            // - we still need less than a full bag
            // - this location still has at least one full bag to open
            const partial = remaining % bagsize
            if (partial > 0 && remaining > 0 && remaining < bagsize && ovfQtyRemaining >= bagsize) {
              const toBin = bagsize - partial
              instructions.push(`>> Open 1 bag from ${ovf.locationcode} — take ${partial} for order`)
              instructions.push(`+  Put remaining ${toBin} into bin ${pl.binlocation}`)
              instructions.push(`*  Update bin ${pl.binlocation} count`)
              remaining -= partial
            }
            // If remaining is still >= bagsize, the loop will continue to the next overflow location
          }
        }

        if (remaining > 0) {
          instructions.push(`!  Short by ${remaining} — check stock manually`)
        }

        const unusedOvf2a = pl.overflowlocations.slice(ovfUsedCount)
        if (unusedOvf2a.length > 0) {
          instructions.push(`   Other overflow: ${unusedOvf2a.map(o => `${o.locationcode} (${o.quantityonhand})`).join(', ')}`)
        }

      } else if (pl.pickingbintracked && pl.binqty === 0) {
        // Mode 2b — tracked, bin is empty
        if (pl.overflowlocations.length === 0) {
          instructions.push(`!  Bin ${pl.binlocation} is empty — no overflow found`)
          instructions.push(`!  Check stock manually`)
        } else {
          let remaining = qty
          let ovfUsedCount2b = 0
          for (const ovf of pl.overflowlocations) {
            if (remaining <= 0) break
            ovfUsedCount2b++
            const bagsize = ovf.bagsize || 1

            if (bagsize === 1) {
              const takeFromOvf = Math.min(ovf.quantityonhand, remaining)
              instructions.push(`!  Bin ${pl.binlocation} is empty`)
              instructions.push(`>> Take ${takeFromOvf} from ${ovf.locationcode}`)
              remaining -= takeFromOvf
              if (remaining <= 0) {
                instructions.push(`+  Top up bin ${pl.binlocation} from ${ovf.locationcode} if possible`)
                instructions.push(`*  Update both bin ${pl.binlocation} and ${ovf.locationcode} counts`)
              }
            } else {
              // How many full bags can this location supply?
              const fullBagsAvailable = Math.floor(ovf.quantityonhand / bagsize)
              const fullBagsNeeded = Math.floor(remaining / bagsize)
              const fullBags = Math.min(fullBagsNeeded, fullBagsAvailable)
              let ovfQtyRemaining = ovf.quantityonhand

              instructions.push(`!  Bin ${pl.binlocation} is empty`)
              if (fullBags > 0) {
                instructions.push(`>> Take ${fullBags} bag${fullBags > 1 ? 's' : ''} (${fullBags * bagsize}) from ${ovf.locationcode}`)
                remaining -= fullBags * bagsize
                ovfQtyRemaining -= fullBags * bagsize
              }
              // Only open a partial bag from this location if:
              // - we still need less than a full bag
              // - this location still has at least one full bag to open
              const partial = remaining % bagsize
              if (partial > 0 && remaining > 0 && remaining < bagsize && ovfQtyRemaining >= bagsize) {
                const toBin = bagsize - partial
                instructions.push(`>> Open 1 bag from ${ovf.locationcode} — take ${partial} for order`)
                instructions.push(`+  Put remaining ${toBin} into bin ${pl.binlocation}`)
                remaining -= partial
              }
              instructions.push(`*  Update bin ${pl.binlocation} count`)
              // If remaining is still >= bagsize, the loop will continue to the next overflow location
            }
          }
          if (remaining > 0) {
            instructions.push(`!  Short by ${remaining} — check stock manually`)
          }
          const unusedOvf2b = pl.overflowlocations.slice(ovfUsedCount2b)
          if (unusedOvf2b.length > 0) {
            instructions.push(`   Other overflow: ${unusedOvf2b.map(o => `${o.locationcode} (${o.quantityonhand})`).join(', ')}`)
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
            instructions.push(`>> Overflow — ${ovfLocation.locationcode}: take ${qty} (${ovfLocation.quantityonhand} available)`)
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
      .in('settingkey', ['CompanyName', 'CompanyAddress', 'CompanyPhone', 'CompanyEmail', 'CompanyLogo'])

    const settings: Record<string, string> = {}
    for (const s of settingsData || []) {
      settings[s.settingkey] = s.settingvalue || ''
    }

    const companyName    = settings['CompanyName'] || 'JKs Bargains Ltd'
    const companyAddress = (settings['CompanyAddress'] || '').replace(/\n/g, '<br>')
    const companyPhone   = settings['CompanyPhone'] || ''
    const companyEmail   = settings['CompanyEmail'] || ''
    const companyLogo    = settings['CompanyLogo'] || ''

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
      <div style="margin-bottom:8pt">
        ${companyLogo ? `<img src="${companyLogo}" alt="" style="height:72pt;width:auto;display:block;margin-bottom:6pt">` : ''}
        <div style="font-size:9pt">
          <strong>${companyName}</strong><br>
          ${companyAddress}${companyPhone ? `<br>${companyPhone}` : ''}${companyEmail ? `<br>${companyEmail}` : ''}
        </div>
      </div>
    `

    const combinedHTML = `
      <!DOCTYPE html><html><head><title>Order ${order.ordernumber}</title>
      <base href="${window.location.origin}">
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
        ${!order.isblindship ? '<div style="margin-top:6pt; font-size:11pt; font-weight:bold;">JKS-BARGAINS.CO.UK</div>' : ''}
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
  // ── Stock availability check (pre-pick) ───────────────────────
  // Checks available stock for all tracked lines without moving anything.
  // Returns a map of productid -> available quantity.
  const checkStockAvailability = async (
    productid: number,
    quantityNeeded: number
  ): Promise<number> => {
    const { data: product } = await supabase
      .from('tblproducts')
      .select('pickingbintracked, bagsizedefault, isbundle')
      .eq('productid', productid)
      .single()

    if (!product?.pickingbintracked || product?.isbundle) {
      // Untracked and bundles are always treated as fully available
      return quantityNeeded
    }

    const { data: stockLevelsRaw } = await supabase
      .from('tblstocklevels')
      .select('quantityonhand, tbllocations(locationtype)')
      .eq('productid', productid)
      .gt('quantityonhand', 0)

    if (!stockLevelsRaw) return 0

    const total = (stockLevelsRaw as any[]).reduce((sum: number, s: any) => sum + s.quantityonhand, 0)
    return Math.min(total, quantityNeeded)
  }

  // ── Confirm Pick ───────────────────────────────────────────────
  // confirmPick is called with resolved decisions for backorder/cancel lines.
  // shortfallDecisions: map of orderlineid -> { backorder: qty, cancel: qty }
  const confirmPick = async (
    shortfallDecisions?: Map<number, { backorder: number; cancel: number }>
  ) => {
    if (!order) return

    // ── Re-entry guard ────────────────────────────────────────────
    // Block a second concurrent run (double-click, modal button mashing).
    // The ref flips synchronously so it catches clicks in the same tick;
    // confirmingPick state alone updates too late to stop them.
    if (pickInFlight.current) {
      console.warn('[confirmPick] BLOCKED — already in flight, ignoring duplicate call')
      return
    }
    pickInFlight.current = true

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

        let ovfQty = ovf.quantityonhand

        const fullBagsAvailable = Math.floor(ovfQty / bagsize)
        const fullBagsNeeded = Math.floor(remaining / bagsize)
        const fullBags = Math.min(fullBagsNeeded, fullBagsAvailable)

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

        const partial = remaining % bagsize
        if (partial > 0 && remaining > 0 && remaining < bagsize && ovfQty >= bagsize) {
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

      return quantityordered - remaining
    }

    try {
      const pickedResults = new Map<number, number>()

      for (const line of lines) {
      if (!line.productid) continue

      // Work out how many to attempt picking. If a shortfall decision exists for this line,
      // only pick the available quantity (the backorder/cancel qty is handled separately).
      const decision = shortfallDecisions?.get(line.orderlineid)
      const qtyToPick = decision
        ? line.quantityordered - decision.backorder - decision.cancel
        : (line.quantitypicked ?? line.quantityordered)

      console.log(`[confirmPick] line ${line.orderlineid} sku=${line.sku} ordered=${line.quantityordered} toPick=${qtyToPick}`)
      const actualPicked = await executePickMovements(line.productid, qtyToPick, order.ordernumber ?? '')

      // Determine line status
      const lineStatus = decision && (decision.backorder > 0 || decision.cancel > 0)
        ? 'Picked' // partial — picked what we could
        : 'Picked'

      await supabase
        .from('tblorderlines')
        .update({ quantitypicked: actualPicked, status: lineStatus })
        .eq('orderlineid', line.orderlineid)

      pickedResults.set(line.orderlineid, actualPicked)
    }

    // Handle cancelled lines (update their status and zero their qty to match what shipped)
    if (shortfallDecisions) {
      for (const [orderlineid, decision] of shortfallDecisions) {
        if (decision.cancel > 0 && decision.backorder === 0) {
          // Fully cancelled shortfall — mark the portion as cancelled
          // The line qty has already been picked at available qty, status stays Picked
          // (we don't split lines; the picked qty reflects what shipped)
        }
      }
    }

    // Update React state so the display immediately shows actual picked quantities
    setLines((prev) => prev.map((l) =>
      pickedResults.has(l.orderlineid)
        ? { ...l, quantitypicked: pickedResults.get(l.orderlineid)!, status: 'Picked' }
        : l
    ))

    // ── Create backorder order if any lines were backordered ──────
    let backorderOrderNumber: string | null = null

    if (shortfallDecisions) {
      const backorderLines = lines.filter((l) => {
        const d = shortfallDecisions.get(l.orderlineid)
        return d && d.backorder > 0
      })

      if (backorderLines.length > 0) {
        // Generate backorder order number: original + -BO1
        const boNumber = `${order.ordernumber}-BO1`

        const { data: newOrder, error: boOrderErr } = await supabase
          .from('tblorders')
          .insert({
            ordernumber:      boNumber,
            clientid:         order.clientid,
            orderdate:        new Date().toISOString(),
            ordersource:      order.ordersource,
            status:           'New',
            isblindship:      order.isblindship,
            shiptoname:       order.shiptoname,
            shiptoaddress1:   order.shiptoaddress1,
            shiptoaddress2:   order.shiptoaddress2,
            shiptoaddress3:   order.shiptoaddress3,
            shiptotown:       order.shiptotown,
            shiptocounty:     order.shiptocounty,
            shiptopostcode:   order.shiptopostcode,
            shiptocountry:    order.shiptocountry,
            shippingmethod:   'Tracked 48',
            shippingcost:     0,
            subtotal:         0,
            productvat:       0,
            shippingvat:      0,
            totalvat:         0,
            ordertotal:       0,
            ordertotalincvat: 0,
            totalweightg:     0,
            notes:            `Backorder from ${order.ordernumber}`,
            isbackorder:      true,
            parentorderid:    order.orderid,
            createdby:        'system',
          })
          .select('orderid')
          .single()

        if (boOrderErr || !newOrder) {
          console.error('[confirmPick] Failed to create backorder order:', boOrderErr)
          setPickError('Despatch completed but backorder order could not be created. Please create it manually.')
        } else {
          const boOrderId = newOrder.orderid
          backorderOrderNumber = boNumber

          // Create backorder lines
          let boSubtotal = 0
          let boVat = 0

          for (const line of backorderLines) {
            const d = shortfallDecisions.get(line.orderlineid)!
            const boQty = d.backorder
            const lineTotal = line.unitprice * boQty
            const vatAmount = line.vatstatus === 'Standard' ? lineTotal * 0.2 : 0

            boSubtotal += lineTotal
            boVat += vatAmount

            await supabase.from('tblorderlines').insert({
              orderid:        boOrderId,
              productid:      line.productid,
              sku:            line.sku,
              productname:    line.productname,
              quantityordered: boQty,
              quantitypicked: 0,
              unitprice:      line.unitprice,
              linetotal:      lineTotal,
              vatstatus:      line.vatstatus,
              vatrate:        line.vatstatus === 'Standard' ? 0.2 : 0,
              vatamount:      vatAmount,
              linetotalincvat: lineTotal + vatAmount,
              status:         'Pending',
              backorderid:    order.orderid,
            })

            // Update the original line to record which backorder it spawned
            await supabase.from('tblorderlines')
              .update({ backorderid: boOrderId })
              .eq('orderlineid', line.orderlineid)
          }

          // Update backorder order totals
          await supabase.from('tblorders').update({
            subtotal:         boSubtotal,
            productvat:       boVat,
            totalvat:         boVat,
            ordertotal:       boSubtotal,
            ordertotalincvat: boSubtotal + boVat,
          }).eq('orderid', boOrderId)

          console.log(`[confirmPick] Backorder order created: ${boNumber} (orderid=${boOrderId})`)
        }
      }
    }

    // Advance original order to Dispatched
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
      notes:       backorderOrderNumber
        ? `Confirm Pick — backorder created: ${backorderOrderNumber}`
        : 'Confirm Pick',
    })

    if (backorderOrderNumber) {
      setCreatedBackorderNumber(backorderOrderNumber)
    }

      setConfirmingPick(false)
    } catch (err: any) {
      console.error('[confirmPick] FAILED:', err)
      setPickError(err?.message || 'Confirm Pick failed. No status change was saved — please retry.')
      setConfirmingPick(false)
    } finally {
      // Always release the re-entry lock, success or failure, so the
      // button never gets stuck disabled after an error.
      pickInFlight.current = false
    }
  }

  // ── Backorder modal confirm ────────────────────────────────────
  const handleBackorderModalConfirm = async () => {
    if (confirmingPick || pickInFlight.current) return
    setConfirmingPick(true)
    setShowBackorderModal(false)
    const decisions = new Map<number, { backorder: number; cancel: number }>()
    for (const s of shortfallLines) {
      decisions.set(s.orderlineid, {
        backorder: s.decision === 'backorder' ? s.shortfall : 0,
        cancel:    s.decision === 'cancel'    ? s.shortfall : 0,
      })
    }

    // For wholesale orders, still prompt for tracking number first
    const isWholesale = order?.ordersource !== 'Shopwired' && order?.ordersource !== 'eBay'
    if (isWholesale) {
      setPendingTrackingForBackorder(order?.trackingnumber || '')
      // Store decisions temporarily and show tracking modal
      setShortfallLines(shortfallLines) // already set
      // We'll pass decisions through the tracking flow
      setShowTrackingModal(true)
      // stash decisions so tracking confirm can use them
      ;(window as any).__pendingBackorderDecisions = decisions
    } else {
      await confirmPick(decisions)
    }
  }

  // ── Tracking modal handler ──────────────────────────────────────
  // For wholesale orders, intercept Confirm Pick to prompt for tracking number.
  // Shopwired and eBay orders skip the modal — labels come from Shopwired directly.
  const handleConfirmPickClick = async () => {
    if (!order) return
    if (confirmClickBusy.current || pickInFlight.current) {
      console.warn('[confirmPick] click ignored — already processing')
      return
    }
    confirmClickBusy.current = true
    console.log(`[confirmPick] button clicked — ordersource=${order.ordersource} status=${order.status}`)

    // ── Step 1: Check for stock shortfalls ────────────────────────
    const shortfalls: typeof shortfallLines = []

    for (const line of lines) {
      if (!line.productid) continue
      const available = await checkStockAvailability(line.productid, line.quantityordered)
      if (available < line.quantityordered) {
        shortfalls.push({
          orderlineid:       line.orderlineid,
          productid:         line.productid,
          sku:               line.sku,
          productname:       line.productname,
          quantityordered:   line.quantityordered,
          quantityAvailable: available,
          shortfall:         line.quantityordered - available,
          decision:          'backorder', // default to backorder
        })
      }
    }

    if (shortfalls.length > 0) {
      // Show backorder decision modal — release the click guard; the
      // modal's own handler takes over the lock from here.
      setShortfallLines(shortfalls)
      setShowBackorderModal(true)
      confirmClickBusy.current = false
      return
    }

    // ── Step 2: No shortfalls — normal flow ───────────────────────
    const isWholesale = order.ordersource !== 'Shopwired' && order.ordersource !== 'eBay'
    if (isWholesale) {
      // Tracking modal takes over — release the click guard; the modal's
      // own handler re-acquires the lock before any stock moves.
      setPendingTrackingNumber(order.trackingnumber || '')
      setShowTrackingModal(true)
      confirmClickBusy.current = false
    } else {
      // Shopwired/eBay: go straight to confirmPick. confirmPick's own
      // pickInFlight lock prevents re-entry; release the click guard once
      // it resolves.
      try {
        await confirmPick()
      } finally {
        confirmClickBusy.current = false
      }
    }
  }

  const handleTrackingModalConfirm = async () => {
    if (!order) return
    if (confirmingPick || pickInFlight.current) return
    setConfirmingPick(true)
    setShowTrackingModal(false)
    if (pendingTrackingNumber.trim()) {
      await supabase
        .from('tblorders')
        .update({ trackingnumber: pendingTrackingNumber.trim() })
        .eq('orderid', order.orderid)
      setOrder((prev) => prev ? { ...prev, trackingnumber: pendingTrackingNumber.trim() } : prev)
    }
    // Check if we have stashed backorder decisions (came via backorder modal → tracking modal)
    const pendingDecisions: Map<number, { backorder: number; cancel: number }> | undefined =
      (window as any).__pendingBackorderDecisions
    if (pendingDecisions) {
      delete (window as any).__pendingBackorderDecisions
      await confirmPick(pendingDecisions)
    } else {
      await confirmPick()
    }
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
          <h1 className="pf-page-title">
            {order.ordernumber || 'Order'}
            {order.isbackorder && (
              <span style={{
                marginLeft: '10px', fontSize: '0.7rem', fontWeight: 600,
                background: 'var(--pf-warning, #f59e0b)', color: '#fff',
                padding: '2px 8px', borderRadius: '4px', verticalAlign: 'middle',
              }}>BACKORDER</span>
            )}
          </h1>
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

          {/* Send to Click & Drop — all non-eBay orders from Printed onwards */}
          {['Printed', 'Post Printed', 'Picking', 'Dispatched'].includes(order.status) &&
           !order.isebay && (
            <button
              className="pf-btn-secondary"
              onClick={sendToClickAndDrop}
              disabled={sendingToCAD}
              title={order.cadorderid ? `Already sent — C&D ref: ${order.cadorderid}. Click to resend.` : 'Send to Click & Drop'}
            >
              {sendingToCAD ? 'Sending…' : order.cadorderid ? '✓ Resend to C&D' : '→ Send to C&D'}
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

      {/* Click & Drop success */}
      {cadSuccess && (
        <div style={{
          background: 'var(--pf-success-bg, #f0fdf4)',
          border: '1px solid var(--pf-success, #22c55e)',
          borderRadius: '6px',
          padding: '10px 16px',
          marginBottom: '12px',
          fontSize: '0.875rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ color: 'var(--pf-success, #16a34a)', fontWeight: 600 }}>✓ {cadSuccess}</span>
          <button
            onClick={() => setCADSuccess(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem' }}
          >✕</button>
        </div>
      )}

      {/* Pick error */}
      {pickError && (
        <div className="pf-shipping-invalid-warning">{pickError}</div>
      )}

      {/* Backorder created notification */}
      {createdBackorderNumber && (
        <div style={{
          background: 'var(--pf-success-bg, #f0fdf4)',
          border: '1px solid var(--pf-success, #22c55e)',
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '0.9rem',
        }}>
          <span style={{ color: 'var(--pf-success, #16a34a)', fontWeight: 600 }}>✓ Backorder created:</span>
          <span
            style={{ color: 'var(--pf-brand)', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => router.push(`/orders?search=${createdBackorderNumber}`)}
          >
            {createdBackorderNumber}
          </span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontSize: '0.8rem' }}>
            Tracked 48 · £0.00 shipping
          </span>
        </div>
      )}

      {/* Parent order link — shown on backorder orders */}
      {order.isbackorder && order.parentorderid && (
        <div style={{
          background: 'var(--pf-warning-bg, #fffbeb)',
          border: '1px solid var(--pf-warning, #f59e0b)',
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '16px',
          fontSize: '0.9rem',
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Backorder from original order: </span>
          <span
            style={{ color: 'var(--pf-brand)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
            onClick={() => router.push(`/orders/${order.parentorderid}`)}
          >
            View original order →
          </span>
        </div>
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
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="pf-btn-edit"
                    onClick={() => setShowProductSearch(!showProductSearch)}
                  >
                    + Add Product
                  </button>
                  <button
                    className="pf-btn-edit"
                    onClick={() => setShowUpload(!showUpload)}
                  >
                    + Upload List
                  </button>
                </div>
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

            {showUpload && order && (
              <OrderUploadPanel
                orderId={order.orderid}
                orderNumber={order.ordernumber || ''}
                onAdded={async () => { await fetchOrder(); }}
                getClientPrice={getClientPrice}
                onClose={() => setShowUpload(false)}
              />
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
                    {canViewCost && <th className="pf-col-right">Cost</th>}
                    {canViewCost && <th className="pf-col-right">Margin</th>}
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
                        {canViewCost && (() => {
                          const cost = line.productid ? costPriceMap.get(line.productid) : null
                          const margin = (cost != null && cost > 0 && line.unitprice > 0)
                            ? ((line.unitprice - cost) / line.unitprice) * 100
                            : null
                          return (
                            <>
                              <td className="pf-col-right pf-price" style={{ color: 'var(--pf-muted, #6b7280)' }}>
                                {cost != null ? formatPrice(cost) : <span style={{ color: 'var(--warning, #b45309)' }}>—</span>}
                              </td>
                              <td className="pf-col-right" style={{
                                fontWeight: 600,
                                color: margin == null
                                  ? 'var(--warning, #b45309)'
                                  : margin < 20
                                    ? 'var(--danger, #dc2626)'
                                    : margin < 40
                                      ? 'var(--warning, #b45309)'
                                      : 'var(--success, #16a34a)',
                              }}>
                                {margin != null ? `${margin.toFixed(1)}%` : '—'}
                              </td>
                            </>
                          )
                        })()}
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

            {/* Margin summary — visible to permitted users only */}
            {canViewCost && lines.length > 0 && (() => {
              const linesWithCost = lines.filter(l => l.productid && costPriceMap.get(l.productid) != null)
              const linesNoCost = lines.filter(l => !l.productid || costPriceMap.get(l.productid) == null)
              const totalCost = linesWithCost.reduce((sum, l) => {
                const cost = costPriceMap.get(l.productid!)!
                return sum + cost * l.quantityordered
              }, 0)
              const totalRevenue = linesWithCost.reduce((sum, l) => sum + l.linetotal, 0)
              const overallMargin = totalRevenue > 0
                ? ((totalRevenue - totalCost) / totalRevenue) * 100
                : null

              return (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  background: 'var(--pf-surface-alt, #f9fafb)',
                  border: '1px solid var(--pf-border, #e5e7eb)',
                  borderRadius: 6,
                  fontSize: '0.85rem',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: 'var(--pf-text, #111)' }}>
                    Margin Summary
                  </div>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ color: 'var(--pf-muted, #6b7280)' }}>Total Cost: </span>
                      <span style={{ fontWeight: 600 }}>{formatPrice(totalCost)}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--pf-muted, #6b7280)' }}>Gross Profit: </span>
                      <span style={{ fontWeight: 600 }}>{formatPrice(totalRevenue - totalCost)}</span>
                    </div>
                    {overallMargin != null && (
                      <div>
                        <span style={{ color: 'var(--pf-muted, #6b7280)' }}>Margin: </span>
                        <span style={{
                          fontWeight: 600,
                          color: overallMargin < 20
                            ? 'var(--danger, #dc2626)'
                            : overallMargin < 40
                              ? 'var(--warning, #b45309)'
                              : 'var(--success, #16a34a)',
                        }}>
                          {overallMargin.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {linesNoCost.length > 0 && (
                      <div style={{ color: 'var(--warning, #b45309)' }}>
                        ⚠ {linesNoCost.length} line{linesNoCost.length > 1 ? 's' : ''} excluded — no cost price set
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
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

      {/* Backorder decision modal */}
      {showBackorderModal && (
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
            width: '620px',
            maxWidth: '95vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', color: 'var(--text)' }}>
              Stock Shortfall — Backorder Decision
            </h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              The following lines have insufficient stock. Choose what to do with each shortfall.
              What you can despatch today will ship now. Backorders will be created as a separate order on Tracked 48.
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>SKU</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Product</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)' }}>Ordered</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)' }}>Available</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)' }}>Short</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-muted)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {shortfallLines.map((s) => (
                  <tr key={s.orderlineid} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.sku || '—'}</td>
                    <td style={{ padding: '8px' }}>{s.productname || '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{s.quantityordered}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--pf-success, #16a34a)' }}>{s.quantityAvailable}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--pf-danger, #dc2626)', fontWeight: 600 }}>{s.shortfall}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.875rem' }}>
                          <input
                            type="radio"
                            name={`bo-decision-${s.orderlineid}`}
                            checked={s.decision === 'backorder'}
                            onChange={() => setShortfallLines((prev) =>
                              prev.map((x) => x.orderlineid === s.orderlineid ? { ...x, decision: 'backorder' } : x)
                            )}
                          />
                          Backorder
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.875rem' }}>
                          <input
                            type="radio"
                            name={`bo-decision-${s.orderlineid}`}
                            checked={s.decision === 'cancel'}
                            onChange={() => setShortfallLines((prev) =>
                              prev.map((x) => x.orderlineid === s.orderlineid ? { ...x, decision: 'cancel' } : x)
                            )}
                          />
                          Cancel shortfall
                        </label>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="pf-btn-secondary"
                onClick={() => { setShowBackorderModal(false); setConfirmingPick(false) }}
              >
                Cancel
              </button>
              <button
                className="pf-btn-primary"
                onClick={handleBackorderModalConfirm}
                disabled={confirmingPick}
              >
                Confirm &amp; Despatch
              </button>
            </div>
          </div>
        </div>
      )}

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
                disabled={confirmingPick}
              >
                Skip for now
              </button>
              <button
                className="pf-btn-primary"
                onClick={handleTrackingModalConfirm}
                disabled={confirmingPick}
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
