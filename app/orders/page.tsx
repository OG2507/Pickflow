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
  isebay: boolean
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
const PRINTABLE_STATUSES = ['New', 'Printed', 'Picking']

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price)

// ── Bulk data loader ──────────────────────────────────────────────────────────
// Fetches everything needed to print multiple orders in a fixed number of
// queries (6 total regardless of order count), then returns a lookup map so
// renderOrderDocuments() can build HTML purely from in-memory data.

async function loadBulkPrintData(orderids: number[]) {
  const ids = orderids

  // 1. App settings (company details for packing slip header)
  const { data: settingsData } = await supabase
    .from('tblappsettings')
    .select('settingkey, settingvalue')
    .in('settingkey', ['CompanyName', 'CompanyAddress', 'CompanyPhone', 'CompanyEmail'])
  const settings: Record<string, string> = {}
  for (const s of settingsData || []) settings[s.settingkey] = s.settingvalue || ''

  // 2. Orders
  const { data: orders } = await supabase
    .from('tblorders').select('*').in('orderid', ids)
  const orderMap = new Map<number, any>((orders || []).map((o: any) => [o.orderid, o]))

  // 2. Order lines
  const { data: linesData } = await supabase
    .from('tblorderlines').select('*').in('orderid', ids).order('orderlineid')
  const linesByOrder = new Map<number, any[]>()
  for (const l of linesData || []) {
    if (!linesByOrder.has(l.orderid)) linesByOrder.set(l.orderid, [])
    linesByOrder.get(l.orderid)!.push(l)
  }

  // Collect all product IDs referenced across all orders
  const allProductIds = [...new Set((linesData || []).map((l: any) => l.productid).filter(Boolean))]

  // 3. Products
  const { data: productsData } = await supabase
    .from('tblproducts')
    .select('productid, sku, productname, pickingbintracked, bagsizedefault, isbundle')
    .in('productid', allProductIds)
  const productMap = new Map<number, any>((productsData || []).map((p: any) => [p.productid, p]))

  // 4. Bundle components (only for bundle products)
  const bundleIds = (productsData || []).filter((p: any) => p.isbundle).map((p: any) => p.productid)
  let componentMap = new Map<number, any[]>() // parentproductid → components
  if (bundleIds.length > 0) {
    const { data: compsData } = await supabase
      .from('tblproductcomponents')
      .select(`quantity, parentproductid, tblproducts!childproductid (productid, sku, productname)`)
      .in('parentproductid', bundleIds)
    for (const c of compsData || []) {
      if (!componentMap.has(c.parentproductid)) componentMap.set(c.parentproductid, [])
      componentMap.get(c.parentproductid)!.push(c)
    }
    // Add component product IDs to the product map if not already there
    const compProductIds = (compsData || [])
      .map((c: any) => (c as any).tblproducts?.productid)
      .filter(Boolean)
    const missingIds = compProductIds.filter((id: number) => !productMap.has(id))
    if (missingIds.length > 0) {
      const { data: extraProducts } = await supabase
        .from('tblproducts')
        .select('productid, sku, productname, pickingbintracked, bagsizedefault, isbundle')
        .in('productid', missingIds)
      for (const p of extraProducts || []) productMap.set(p.productid, p)
    }
  }

  // Collect full set of product IDs including component children
  const allProductIdsIncComponents = [...productMap.keys()]

  // 5. Stock levels for all products
  const { data: stockData } = await supabase
    .from('tblstocklevels')
    .select('productid, quantityonhand, pickpriority, bagsize, locationid')
    .in('productid', allProductIdsIncComponents)
  const stockByProduct = new Map<number, any[]>()
  for (const s of stockData || []) {
    if (!stockByProduct.has(s.productid)) stockByProduct.set(s.productid, [])
    stockByProduct.get(s.productid)!.push(s)
  }

  // 6. Locations for all location IDs referenced in stock levels
  const allLocationIds = [...new Set((stockData || []).map((s: any) => s.locationid).filter(Boolean))]
  const locationMap = new Map<number, any>()
  if (allLocationIds.length > 0) {
    const { data: locsData } = await supabase
      .from('tbllocations')
      .select('locationid, locationcode, locationname, locationtype, pickpriority, isactive')
      .in('locationid', allLocationIds)
    for (const l of locsData || []) locationMap.set(l.locationid, l)
  }

  return { settings, orderMap, linesByOrder, productMap, componentMap, stockByProduct, locationMap }
}

// ── Single-order HTML renderer (uses pre-loaded data, no DB calls) ─────────────

function renderOrderDocuments(
  orderid: number,
  data: Awaited<ReturnType<typeof loadBulkPrintData>>
): string {
  const { settings, orderMap, linesByOrder, productMap, componentMap, stockByProduct, locationMap } = data
  const order = orderMap.get(orderid)
  if (!order) return ''
  const lines = linesByOrder.get(orderid) || []

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

  const buildPickLinesForProduct = (
    productid: number,
    sku: string,
    productname: string,
    quantityordered: number
  ) => {
    const product = productMap.get(productid)
    if (!product) {
      pickLines.push({ sku, productname, quantityordered, productid, pickingbintracked: false,
        binlocation: null, binqty: 0, overflowlocations: [] })
      return
    }

    if (product.isbundle) {
      const components = componentMap.get(productid) || []
      for (const comp of components) {
        const child = (comp as any).tblproducts
        if (!child) continue
        buildPickLinesForProduct(child.productid, child.sku, `${child.productname} [part of ${sku}]`, quantityordered * comp.quantity)
      }
      return
    }

    const productBagsize = product.bagsizedefault || 1
    const stockLevels = (stockByProduct.get(productid) || [])
      .map((s: any) => ({ ...s, loc: locationMap.get(s.locationid) }))
      .filter((s: any) => s.loc?.isactive)

    const binLevel = stockLevels.find((s: any) => s.loc?.locationtype === 'Picking Bin')
    const overflowLevels = stockLevels
      .filter((s: any) => s.loc?.locationtype !== 'Picking Bin' && s.quantityonhand > 0)
      .sort((a: any, b: any) => (a.loc?.pickpriority || 9999) - (b.loc?.pickpriority || 9999))

    pickLines.push({
      sku, productname, quantityordered, productid,
      pickingbintracked: product.pickingbintracked || false,
      binlocation: binLevel?.loc?.locationcode || null,
      binqty: binLevel?.quantityonhand || 0,
      overflowlocations: overflowLevels.map((s: any) => ({
        locationcode: s.loc?.locationcode || '',
        locationname: s.loc?.locationname || null,
        quantityonhand: s.quantityonhand,
        bagsize: s.bagsize > 0 ? s.bagsize : productBagsize,
      })),
    })
  }

  for (const line of lines) {
    if (!line.productid) continue
    buildPickLinesForProduct(line.productid, line.sku || '', line.productname || '', line.quantityordered)
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
      if (pl.binlocation && pl.overflowlocations.length === 0) {
        instructions.push(`>> Take ${qty} from bin ${pl.binlocation}`)
      } else if (!pl.binlocation && pl.overflowlocations.length === 0) {
        instructions.push(`⚠ No stock locations found — check manually`)
      } else {
        const bagsize = pl.overflowlocations[0]?.bagsize || 1
        const ovfLocation = pl.overflowlocations[0]
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

  const deliveryName = order.shiptoname || '—'
  const deliveryAddress = [order.shiptoname, order.shiptoaddress1, order.shiptoaddress2,
    order.shiptoaddress3, order.shiptotown, order.shiptocounty,
    order.shiptopostcode, order.shiptocountry].filter(Boolean).join('<br>')
  const companyName    = settings['CompanyName'] || ''
  const companyAddress = (settings['CompanyAddress'] || '').replace(/\n/g, '<br>')
  const companyPhone   = settings['CompanyPhone'] || ''
  const companyEmail   = settings['CompanyEmail'] || ''
  const companyBlock = order.isblindship ? '' : `
    <div style="font-size:9pt;margin-bottom:8pt">
      <strong>${companyName}</strong><br>
      ${companyAddress}${companyPhone ? `<br>${companyPhone}` : ''}${companyEmail ? `<br>${companyEmail}` : ''}
    </div>
  `
  const packingRows = [...lines]
    .sort((a: any, b: any) => (a.sku || '').localeCompare(b.sku || ''))
    .map((line: any) =>
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
  const [pendingQFCount, setPendingQFCount] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [pendingRMCount, setPendingRMCount] = useState<number | null>(null)
  const [exportingRM, setExportingRM] = useState(false)

  const checkPendingExports = async () => {
    const res = await fetch('/api/quickfile-bulk-export', { method: 'POST' })
    const data = await res.json()
    setPendingQFCount(data.count || 0)
  }

  const checkPendingRM = async () => {
    const res = await fetch('/api/royalmail-export', { method: 'POST' })
    const data = await res.json()
    setPendingRMCount(data.count || 0)
  }

  const exportToRoyalMail = async () => {
    if (!pendingRMCount) return
    setExportingRM(true)
    try {
      const res = await fetch('/api/royalmail-export')
      if (!res.ok) {
        const data = await res.json()
        setSyncResult(`Royal Mail export failed: ${data.error}`)
        setExportingRM(false)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `royalmail-${new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setSyncResult(`Exported ${pendingRMCount} order${pendingRMCount !== 1 ? 's' : ''} to Royal Mail CSV`)
      setPendingRMCount(0)
      await fetchOrders()
    } catch (err: any) {
      setSyncResult(`Royal Mail export failed: ${err.message}`)
    }
    setExportingRM(false)
  }

  const exportToQuickFile = async () => {
    if (!pendingQFCount) return
    setExporting(true)
    try {
      const res = await fetch('/api/quickfile-bulk-export')
      if (!res.ok) {
        const data = await res.json()
        setSyncResult(`QuickFile export failed: ${data.error}`)
        setExporting(false)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `quickfile-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setSyncResult(`Exported ${pendingQFCount} order${pendingQFCount !== 1 ? 's' : ''} to QuickFile`)
      setPendingQFCount(0)
      await fetchOrders()
    } catch (err: any) {
      setSyncResult(`QuickFile export failed: ${err.message}`)
    }
    setExporting(false)
  }

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
      .select(`orderid, ordernumber, orderdate, ordersource, status, isebay,
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
      ordersource: r.ordersource, status: r.status, isebay: r.isebay || false,
      shiptoname: r.shiptoname,
      shiptopostcode: r.shiptopostcode, subtotal: r.subtotal, shippingcost: r.shippingcost,
      totalweightg: r.totalweightg, clientid: r.clientid,
      companyname: r.tblclients?.companyname, firstname: r.tblclients?.firstname,
      lastname: r.tblclients?.lastname, selected: false,
    })))
    setLoading(false)
  }, [search, statusFilter, sourceFilter])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { checkPendingExports() }, [])
  useEffect(() => { checkPendingRM() }, [])

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

    // Load all data in one batch (6 queries total regardless of order count)
    const orderids = selectedOrders.map((o) => o.orderid)
    const bulkData = await loadBulkPrintData(orderids)

    // Render HTML for each order from pre-loaded data (no further DB calls)
    const parts: string[] = []
    for (const order of selectedOrders) {
      const html = renderOrderDocuments(order.orderid, bulkData)
      if (html) parts.push(html)
    }

    // Update statuses in parallel
    await Promise.all(
      selectedOrders.map((order) =>
        supabase.from('tblorders').update({ status: 'Printed' }).eq('orderid', order.orderid)
      )
    )

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

  const bulkMoveToPicking = async () => {
    const printedOrders = selectedOrders.filter(o => o.status === 'Printed')
    if (printedOrders.length === 0) return
    for (const order of printedOrders) {
      await supabase.from('tblorders').update({ status: 'Picking' }).eq('orderid', order.orderid)
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
          {pendingQFCount !== null && pendingQFCount > 0 && (
            <button className="pf-btn-secondary" onClick={exportToQuickFile} disabled={exporting}>
              {exporting ? 'Exporting…' : `↓ QuickFile CSV (${pendingQFCount})`}
            </button>
          )}
          {pendingRMCount !== null && pendingRMCount > 0 && (
            <button className="pf-btn-secondary" onClick={exportToRoyalMail} disabled={exportingRM}>
              {exportingRM ? 'Exporting…' : `↓ Royal Mail CSV (${pendingRMCount})`}
            </button>
          )}
          {selectedOrders.length > 0 && (
            <>
              <span className="pf-selected-count">{selectedOrders.length} selected</span>
              <button className="pf-btn-secondary" onClick={bulkPrint} disabled={printing}>
                {printing ? 'Building…' : `🖨 Print ${selectedOrders.length} Order${selectedOrders.length > 1 ? 's' : ''}`}
              </button>
              {selectedOrders.some(o => o.status === 'Printed') && (
                <button className="pf-btn-secondary" onClick={bulkMoveToPicking}>
                  → Move to Picking
                </button>
              )}
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
