'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type OrderRow = {
  orderid: number
  ordernumber: string | null
  orderdate: string | null
  ordersource: string | null
  status: string
  shiptoname: string | null
  shiptopostcode: string | null
  subtotal: number
  shippingcost: number
  totalweightg: number
  clientid: number
  companyname: string | null
  firstname: string | null
  lastname: string | null
  selected: boolean
}

const STATUS_COLOURS: Record<string, string> = {
  'New':          'pf-badge-new',
  'Printed':      'pf-badge-printed',
  'Post Printed': 'pf-badge-postprinted',
  'Picking':      'pf-badge-picking',
  'Dispatched':   'pf-badge-dispatched',
  'Invoiced':     'pf-badge-invoiced',
  'Completed':    'pf-badge-completed',
  'Cancelled':    'pf-badge-cancelled',
}

const ALL_STATUSES = ['New', 'Printed', 'Post Printed', 'Picking', 'Dispatched', 'Invoiced', 'Completed', 'Cancelled']
const ORDER_SOURCES = ['Shopwired', 'Email', 'Phone', 'Letter']
const PRINTABLE_STATUSES = ['New']

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price)

async function buildOrderDocuments(orderid: number): Promise<string> {
  const { data: order } = await supabase
    .from('tblorders').select('*').eq('orderid', orderid).single()
  if (!order) return ''

  const { data: linesData } = await supabase
    .from('tblorderlines').select('*').eq('orderid', orderid).order('orderlineid')
  const lines = linesData || []

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

    if (product?.isbundle) {
      const { data: components } = await supabase
        .from('tblproductcomponents')
        .select(`quantity, tblproducts!childproductid (productid, sku, productname)`)
        .eq('parentproductid', productid)
      for (const comp of components || []) {
        const child = (comp as any).tblproducts
        if (!child) continue
        await buildPickLinesForProduct(child.productid, child.sku, `${child.productname} [part of ${sku}]`, quantityordered * comp.quantity)
      }
      return
    }

    const productBagsize = product?.bagsizedefault || 1
    const { data: stockLevels } = await supabase
      .from('tblstocklevels')
      .select(`stocklevelid, quantityonhand, pickpriority, bagsize, locationid,
        tbllocations (locationid, locationcode, locationname, locationtype, isactive)`)
      .eq('productid', productid).order('pickpriority')
    const levels = (stockLevels || []).filter((s: any) => s.tbllocations?.isactive)
    const binLevel = levels.find((s: any) => s.pickpriority === 0)
    const overflowLevels = levels.filter((s: any) => s.pickpriority > 0 && s.quantityonhand > 0)
    pickLines.push({
      sku, productname, quantityordered, productid,
      pickingbintracked: product?.pickingbintracked || false,
      binlocation: (binLevel as any)?.tbllocations?.locationcode || null,
      binqty: binLevel?.quantityonhand || 0,
      overflowlocations: overflowLevels.map((s: any) => ({
        locationcode: s.tbllocations?.locationcode || '',
        locationname: s.tbllocations?.locationname || null,
        quantityonhand: s.quantityonhand,
        bagsize: s.bagsize > 0 ? s.bagsize : productBagsize,
      })),
    })
  }

  for (const line of lines) {
    if (!line.productid) continue
    await buildPickLinesForProduct(line.productid, line.sku || '', line.productname || '', line.quantityordered)
  }

  pickLines.sort((a, b) => (a.binlocation || 'ZZZ').localeCompare(b.binlocation || 'ZZZ'))

  const buildPickInstructions = (pl: PickLine): string[] => {
    const instructions: string[] = []
    const qty = pl.quantityordered
    if (pl.pickingbintracked && pl.binqty > 0) {
      let remaining = qty
      const fromBin = Math.min(pl.binqty, remaining)
      if (fromBin > 0) { instructions.push(`Pick ${fromBin} from bin: ${pl.binlocation}`); remaining -= fromBin }
      for (const ovf of pl.overflowlocations) {
        if (remaining <= 0) break
        const bagsize = ovf.bagsize || 1
        const fullBags = Math.floor(remaining / bagsize)
        const partial = remaining % bagsize
        if (fullBags > 0) { instructions.push(`Take ${fullBags} full bag${fullBags > 1 ? 's' : ''} (${fullBags * bagsize} units) from ${ovf.locationcode}`); remaining -= fullBags * bagsize }
        if (partial > 0 && remaining > 0) { instructions.push(`Open 1 bag from ${ovf.locationcode}: take ${partial} for order, put ${bagsize - partial} into ${pl.binlocation}`); remaining -= partial }
      }
    } else if (pl.pickingbintracked && pl.binqty === 0) {
      if (pl.overflowlocations.length === 0) {
        instructions.push(`⚠ Bin (${pl.binlocation}) is empty and no overflow stock found — check manually`)
      } else {
        let remaining = qty
        for (const ovf of pl.overflowlocations) {
          if (remaining <= 0) break
          const bagsize = ovf.bagsize || 1
          const fullBags = Math.floor(remaining / bagsize)
          const partial = remaining % bagsize
          if (fullBags > 0) { instructions.push(`Bin (${pl.binlocation}) is empty — take ${fullBags} full bag${fullBags > 1 ? 's' : ''} (${fullBags * bagsize} units) from ${ovf.locationcode}`); remaining -= fullBags * bagsize }
          if (partial > 0 && remaining > 0) { instructions.push(`Open 1 bag from ${ovf.locationcode}: take ${partial} for order, put ${bagsize - partial} into bin (${pl.binlocation})`); remaining -= partial }
        }
      }
    } else {
      if (pl.overflowlocations.length === 0) {
        instructions.push(`⚠ No stock locations found — check manually`)
      } else {
        const bagsize = pl.overflowlocations[0]?.bagsize || 1
        const ovfLocation = pl.overflowlocations[0]
        const binRef = pl.binlocation ? ` (${pl.binlocation})` : ''
        instructions.push(`1. Check picking bin${binRef} — take up to ${qty} if available`)
        instructions.push(`2. If bin doesn't have enough, go to ${ovfLocation.locationcode}: take 1 bag (${bagsize} units)`)
        instructions.push(`3. Take what you need from the bag, put the remainder into bin${binRef}`)
        instructions.push(`4. Count what is now in bin${binRef} and update the system`)
        instructions.push(`   ↳ Once updated, this product will be tracked automatically`)
        if (pl.overflowlocations.length > 1) {
          for (const ovf of pl.overflowlocations.slice(1)) {
            instructions.push(`  ${ovf.locationcode}: ${ovf.quantityonhand} units`)
          }
        }
      }
    }
    return instructions
  }

  const deliveryName = order.shiptoname || '—'
  const deliveryAddress = [order.shiptoname, order.shiptoaddress1, order.shiptoaddress2,
    order.shiptoaddress3, order.shiptotown, order.shiptocounty,
    order.shiptopostcode, order.shiptocountry].filter(Boolean).join('<br>')
  const companyBlock = order.isblindship ? '' :
    `<div style="font-size:9pt;margin-bottom:8pt"><strong>Oceanus Group Ltd</strong><br>[Your address here]</div>`
  const packingRows = lines.map((line: any) =>
    `<tr><td>${line.sku}</td><td>${line.productname}</td><td style="text-align:center">${line.quantityordered}</td></tr>`
  ).join('')

  return `
    <div style="margin:20pt">
      <div class="doc-header">
        <div><h1>Picking List</h1>
          <div class="meta"><strong>Order:</strong> ${order.ordernumber}<br>
            <strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}<br>
            <strong>Source:</strong> ${order.ordersource}</div>
        </div>
        <div class="meta" style="text-align:right"><strong>Ship To:</strong><br>${deliveryName}</div>
      </div>
      <table>
        <thead><tr><th>Bin</th><th>SKU</th><th>Product</th><th>Qty</th><th>Pick Instructions</th></tr></thead>
        <tbody>${pickLines.map((pl) => {
          const inst = buildPickInstructions(pl)
          return `<tr>
            <td style="font-weight:bold;white-space:nowrap">${pl.binlocation || '—'}</td>
            <td>${pl.sku}</td><td>${pl.productname}</td>
            <td style="text-align:center"><strong>${pl.quantityordered}</strong></td>
            <td>${inst.map((i) => `<div style="margin-bottom:3pt">${i}</div>`).join('')}</td>
          </tr>`
        }).join('')}</tbody>
      </table>
      ${order.notes ? `<div style="margin-top:12pt;font-size:9pt"><strong>Notes:</strong> ${order.notes}</div>` : ''}
    </div>
    <div style="page-break-after:always"></div>
    <div style="margin:20pt">
      ${companyBlock}
      <div class="doc-header">
        <div><h1>Packing Slip</h1>
          <div class="meta"><strong>Order:</strong> ${order.ordernumber}<br>
            <strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}</div>
        </div>
        <div class="meta" style="text-align:right"><strong>Deliver To:</strong><br>${deliveryAddress}</div>
      </div>
      <table>
        <thead><tr><th>SKU</th><th>Product Description</th><th>Qty</th></tr></thead>
        <tbody>${packingRows}</tbody>
      </table>
      ${order.notes ? `<div style="margin-top:12pt;font-size:9pt"><strong>Notes:</strong> ${order.notes}</div>` : ''}
      <div class="thankyou">Thank you for your order. If you have any questions please don't hesitate to get in touch.</div>
    </div>
  `
}

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  const syncShopwired = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync-shopwired', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setSyncResult(`Imported ${data.imported} order${data.imported !== 1 ? 's' : ''}${data.skipped ? `, ${data.skipped} already existed` : ''}${data.errors?.length ? ` — ${data.errors.length} error(s)` : ''}`)
        await fetchOrders()
      } else {
        setSyncResult(`Sync failed: ${data.error}`)
      }
    } catch (err: any) {
      setSyncResult(`Sync failed: ${err.message}`)
    }
    setSyncing(false)
  }

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('tblorders')
      .select(`orderid, ordernumber, orderdate, ordersource, status,
        shiptoname, shiptopostcode, subtotal, shippingcost, totalweightg,
        clientid, tblclients (companyname, firstname, lastname)`)
      .order('orderdate', { ascending: false })
    if (statusFilter) query = query.eq('status', statusFilter)
    if (sourceFilter) query = query.eq('ordersource', sourceFilter)
    if (search.trim()) {
      query = query.or(`ordernumber.ilike.%${search.trim()}%,shiptoname.ilike.%${search.trim()}%,shiptopostcode.ilike.%${search.trim()}%`)
    }
    const { data } = await query
    setOrders((data || []).map((r: any) => ({
      orderid: r.orderid, ordernumber: r.ordernumber, orderdate: r.orderdate,
      ordersource: r.ordersource, status: r.status, shiptoname: r.shiptoname,
      shiptopostcode: r.shiptopostcode, subtotal: r.subtotal, shippingcost: r.shippingcost,
      totalweightg: r.totalweightg, clientid: r.clientid,
      companyname: r.tblclients?.companyname, firstname: r.tblclients?.firstname,
      lastname: r.tblclients?.lastname, selected: false,
    })))
    setLoading(false)
  }, [search, statusFilter, sourceFilter])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const clientName = (o: OrderRow) =>
    o.companyname?.trim() || `${o.firstname || ''} ${o.lastname || ''}`.trim() || '—'

  const toggleSelect = (orderid: number) => {
    setOrders((prev) => prev.map((o) => o.orderid === orderid ? { ...o, selected: !o.selected } : o))
  }

  const toggleAll = () => {
    const printable = orders.filter((o) => PRINTABLE_STATUSES.includes(o.status))
    const allSelected = printable.every((o) => o.selected)
    const ids = new Set(printable.map((o) => o.orderid))
    setOrders((prev) => prev.map((o) => ids.has(o.orderid) ? { ...o, selected: !allSelected } : o))
  }

  const selectedOrders = orders.filter((o) => o.selected)

  const bulkPrint = async () => {
    if (selectedOrders.length === 0) return
    setPrinting(true)

    const parts: string[] = []
    for (const order of selectedOrders) {
      const html = await buildOrderDocuments(order.orderid)
      if (html) parts.push(html)
    }

    for (const order of selectedOrders) {
      await supabase.from('tblorders').update({ status: 'Printed' }).eq('orderid', order.orderid)
    }

    setPrinting(false)

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html><html><head><title>Bulk Print — ${selectedOrders.length} orders</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; }
          h1 { font-size: 16pt; margin: 0 0 4pt 0; }
          .doc-header { display: flex; justify-content: space-between; border-bottom: 2pt solid #000; padding-bottom: 8pt; margin-bottom: 12pt; }
          .meta { font-size: 9pt; line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f0f0f0; border: 1pt solid #999; padding: 4pt 6pt; text-align: left; font-size: 8pt; text-transform: uppercase; }
          td { border: 1pt solid #ccc; padding: 5pt 6pt; font-size: 9pt; vertical-align: top; }
          tr:nth-child(even) td { background: #fafafa; }
          .thankyou { margin-top: 20pt; padding-top: 12pt; border-top: 1pt solid #ccc; font-size: 9pt; text-align: center; color: #555; }
        </style>
        </head><body>
        ${parts.join('<div style="page-break-after:always"></div>')}
        </body></html>
      `)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => { try { printWindow.print() } catch(e) {} }, 800)
    }

    await fetchOrders()
  }

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Orders</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${orders.length} order${orders.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="pf-header-actions">
          {syncResult && <span className="pf-selected-count">{syncResult}</span>}
          <button className="pf-btn-secondary" onClick={syncShopwired} disabled={syncing}>
            {syncing ? 'Syncing…' : '↓ Sync Shopwired'}
          </button>
          {selectedOrders.length > 0 && (
            <>
              <span className="pf-selected-count">{selectedOrders.length} selected</span>
              <button className="pf-btn-secondary" onClick={bulkPrint} disabled={printing}>
                {printing ? 'Building…' : `🖨 Print ${selectedOrders.length} Order${selectedOrders.length > 1 ? 's' : ''}`}
              </button>
            </>
          )}
          <button className="pf-btn-primary" onClick={() => router.push('/orders/new')}>
            + New Order
          </button>
        </div>
      </div>

      <div className="pf-filters">
        <input type="text" placeholder="Search order number, name, or postcode…"
          value={search} onChange={(e) => setSearch(e.target.value)} className="pf-input pf-search" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="pf-input pf-select">
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="pf-input pf-select">
          <option value="">All sources</option>
          {ORDER_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="pf-empty">No orders found.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" onChange={toggleAll}
                    checked={orders.filter((o) => PRINTABLE_STATUSES.includes(o.status)).length > 0 &&
                      orders.filter((o) => PRINTABLE_STATUSES.includes(o.status)).every((o) => o.selected)}
                    style={{ accentColor: 'white', cursor: 'pointer' }} />
                </th>
                <th>Order No.</th>
                <th>Date</th>
                <th>Client</th>
                <th>Ship To</th>
                <th>Source</th>
                <th className="pf-col-right">Weight</th>
                <th className="pf-col-right">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const canPrint = PRINTABLE_STATUSES.includes(o.status)
                return (
                  <tr key={o.orderid} className="pf-row" onClick={() => router.push(`/orders/${o.orderid}`)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      {canPrint && (
                        <input type="checkbox" checked={o.selected}
                          onChange={() => toggleSelect(o.orderid)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                      )}
                    </td>
                    <td className="pf-sku">{o.ordernumber || '—'}</td>
                    <td className="pf-category">
                      {o.orderdate ? new Date(o.orderdate).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="pf-productname">{clientName(o)}</td>
                    <td className="pf-category">
                      {o.shiptoname || '—'}
                      {o.shiptopostcode && <span className="pf-postcode"> {o.shiptopostcode}</span>}
                    </td>
                    <td className="pf-category">{o.ordersource || '—'}</td>
                    <td className="pf-col-right pf-category">{o.totalweightg ? `${o.totalweightg}g` : '—'}</td>
                    <td className="pf-col-right pf-price">
                      {formatPrice((o.subtotal || 0) + (o.shippingcost || 0))}
                    </td>
                    <td>
                      <span className={`pf-badge ${STATUS_COLOURS[o.status] || ''}`}>{o.status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
