'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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

const VAT_RATE = 0.20 // pulled from AppSettings in a real implementation

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
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
        .select('productid, sku, productname, salesprice, wholesaleprice, reducedwholesaleprice, pricingcode, vatstatus, weight, isactive')
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
    // Check for fixed client pricing first
    const { data: fixedPrice } = await supabase
      .from('tblclientpricing')
      .select('fixedprice, pricingcode')
      .eq('clientid', order!.clientid)
      .eq('isactive', true)
      .not('fixedprice', 'is', null)
      .limit(1)
      .maybeSingle()

    if (fixedPrice?.fixedprice && fixedPrice.pricingcode === product.pricingcode) {
      return fixedPrice.fixedprice
    }

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
    await supabase.from('tblorderlines').delete().eq('orderlineid', lineId)
    const newLines = lines.filter((l) => l.orderlineid !== lineId)
    setLines(newLines)
    await recalculateTotals(newLines, order?.shippingcost || 0)
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

    const { error } = await supabase
      .from('tblorders')
      .update({
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
      })
      .eq('orderid', id)

    if (error) {
      setError('Save failed: ' + error.message)
    } else {
      setDirty(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
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
  }


  const cancelOrder = async () => {
    await supabase.from('tblorders').update({ status: 'Cancelled' }).eq('orderid', id)
    setOrder((prev) => prev ? { ...prev, status: 'Cancelled' } : prev)
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

          {/* Advance status — Print Order when next is Printed, otherwise normal advance */}
          {nextStatus && !isCancelled && (
            <button className="pf-btn-primary" onClick={advanceStatus}>
              {nextStatus === 'Printed' ? '🖨 Print Order' : `→ ${nextStatus}`}
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
          🖨 Clicking <strong>Print Order</strong> will advance the status to Printed.
          Picking list and packing slip generation will be added in a future update.
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
                    <th className="pf-col-right">Qty</th>
                    <th className="pf-col-right">Unit Price</th>
                    <th className="pf-col-right">Line Total</th>
                    <th className="pf-col-right">VAT</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.orderlineid}>
                      <td className="pf-sku">{line.sku}</td>
                      <td className="pf-productname">{line.productname}</td>
                      <td className="pf-col-right">
                        {!isCancelled && !isCompleted ? (
                          <input
                            className="pf-input pf-input-sm pf-input-num pf-qty-input"
                            type="number"
                            min="1"
                            value={line.quantityordered}
                            onChange={(e) => updateLineQty(line.orderlineid, parseInt(e.target.value) || 1)}
                          />
                        ) : line.quantityordered}
                      </td>
                      <td className="pf-col-right pf-price">{formatPrice(line.unitprice)}</td>
                      <td className="pf-col-right pf-price">{formatPrice(line.linetotal)}</td>
                      <td className="pf-col-right pf-category">
                        <span className={`pf-badge ${line.vatstatus === 'Standard' ? 'pf-badge-vat' : 'pf-badge-zero'}`}>
                          {line.vatstatus === 'Standard' ? '20%' : 'Zero'}
                        </span>
                      </td>
                      <td>
                        {!isCancelled && !isCompleted && (
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
                  ))}
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
    </div>
  )
}
