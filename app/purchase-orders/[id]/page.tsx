'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PO = {
  poid: number
  ponumber: string | null
  supplierid: number
  orderdate: string | null
  expecteddate: string | null
  receiveddate: string | null
  status: string
  subtotal: number
  deliverycost: number
  pototal: number
  notes: string | null
  createdby: string | null
  suppliername: string
  exchangerate: number | null
  freightusd: number | null
  bankchargeusd: number | null
}

type POLine = {
  polineid: number
  productid: number
  sku: string
  productname: string
  quantityordered: number
  quantityreceived: number
  unitcostusd: number
  unitcost: number
  landedcostgbp: number
  landedcostcalculated: boolean
  linetotal: number
  delivertolocationid: number | null
  delivertolocationcode: string | null
  status: string
  reorderqty: number
}

type Product = {
  productid: number
  sku: string
  productname: string
  costprice: number
}

type Location = {
  locationid: number
  locationcode: string
  locationname: string | null
}

const STATUS_FLOW = ['Draft', 'Sent', 'Partial', 'Received']

const formatUSD = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)

const formatGBP = (v: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(v)

export default function PurchaseOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [po, setPO] = useState<PO | null>(null)
  const [lines, setLines] = useState<POLine[]>([])
  const [goodsInLocations, setGoodsInLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Product search
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [showProductSearch, setShowProductSearch] = useState(false)

  // Landed cost fields
  const [exchangeRate, setExchangeRate] = useState('')
  const [freightUSD, setFreightUSD] = useState('')
  const [bankChargeUSD, setBankChargeUSD] = useState('')
  const [calculatingLanded, setCalculatingLanded] = useState(false)
  const [landedSuccess, setLandedSuccess] = useState(false)

  // Goods receipt modal
  type ReceiptRow = { id: number; qty: string; locationId: string }
  const [receiptLine, setReceiptLine]     = useState<POLine | null>(null)
  const [receiptRows, setReceiptRows]     = useState<ReceiptRow[]>([])
  const [receiptSaving, setReceiptSaving] = useState(false)
  const [receiptError, setReceiptError]   = useState<string | null>(null)

  // Putaway list modal
  const [showPutaway, setShowPutaway] = useState(false)

  const fetchPO = useCallback(async () => {
    const { data, error } = await supabase
      .from('tblpurchaseorders')
      .select(`*, tblsuppliers (suppliername)`)
      .eq('poid', id)
      .single()

    if (error || !data) { setError('PO not found.'); setLoading(false); return }

    setPO({ ...data, suppliername: data.tblsuppliers?.suppliername || '—' })
    if (data.exchangerate) setExchangeRate(String(data.exchangerate))
    if (data.freightusd) setFreightUSD(String(data.freightusd))
    if (data.bankchargeusd) setBankChargeUSD(String(data.bankchargeusd))

    // Fetch lines with location info
    const { data: linesData } = await supabase
      .from('tblpurchaseorderlines')
      .select(`
        polineid, productid, quantityordered, quantityreceived,
        unitcostusd, unitcost, landedcostgbp, landedcostcalculated,
        linetotal, delivertolocationid, status,
        tblproducts (sku, productname, reorderqty),
        tbllocations (locationcode)
      `)
      .eq('poid', id)
      .order('polineid')

    setLines(
      (linesData || []).map((r: any) => ({
        polineid:             r.polineid,
        productid:            r.productid,
        sku:                  r.tblproducts?.sku || '',
        productname:          r.tblproducts?.productname || '',
        reorderqty:           r.tblproducts?.reorderqty || 0,
        quantityordered:      r.quantityordered,
        quantityreceived:     r.quantityreceived,
        unitcostusd:          r.unitcostusd,
        unitcost:             r.unitcost,
        landedcostgbp:        r.landedcostgbp,
        landedcostcalculated: r.landedcostcalculated,
        linetotal:            r.linetotal,
        delivertolocationid:  r.delivertolocationid,
        delivertolocationcode: r.tbllocations?.locationcode || null,
        status:               r.status,
      }))
    )

    setLoading(false)
  }, [id])

  const fetchGoodsInLocations = async () => {
    const { data } = await supabase
      .from('tbllocations')
      .select('locationid, locationcode, locationname')
      .in('locationtype', ['Goods In', 'Overflow'])
      .eq('isactive', true)
      .order('locationcode')
    setGoodsInLocations(data || [])
  }

  useEffect(() => {
    fetchPO()
    fetchGoodsInLocations()
  }, [fetchPO])

  // ── Foreign key for PO ─────────────────────────────────────────
  // Add in Supabase: ALTER TABLE tblpurchaseorders ADD CONSTRAINT fk_po_supplier FOREIGN KEY (supplierid) REFERENCES tblsuppliers(supplierid);
  // ALTER TABLE tblpurchaseorderlines ADD CONSTRAINT fk_pol_po FOREIGN KEY (poid) REFERENCES tblpurchaseorders(poid);
  // ALTER TABLE tblpurchaseorderlines ADD CONSTRAINT fk_pol_product FOREIGN KEY (productid) REFERENCES tblproducts(productid);
  // ALTER TABLE tblpurchaseorderlines ADD CONSTRAINT fk_pol_location FOREIGN KEY (delivertolocationid) REFERENCES tbllocations(locationid);

  // ── Product search ─────────────────────────────────────────────
  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return }
    const search = async () => {
      const term = productSearch.trim()
      const { data } = await supabase
        .from('tblproducts')
        .select('productid, sku, productname, costprice')
        .eq('isactive', true)
        .or(`sku.ilike.%${term}%,productname.ilike.%${term}%`)
        .limit(8)
      setProductResults(data || [])
    }
    const t = setTimeout(search, 200)
    return () => clearTimeout(t)
  }, [productSearch])

  // ── Add line ───────────────────────────────────────────────────
  const addLine = async (product: Product) => {
    setShowProductSearch(false)
    setProductSearch('')

    const { error } = await supabase
      .from('tblpurchaseorderlines')
      .insert({
        poid:            parseInt(id),
        productid:       product.productid,
        quantityordered: 1,
        quantityreceived: 0,
        unitcostusd:     0,
        unitcost:        0,
        landedcostgbp:   0,
        landedcostcalculated: false,
        linetotal:       0,
        status:          'Pending',
      })

    if (!error) {
      await fetchPO()
      await recalculatePOTotals()
    }
  }

  // ── Update line ────────────────────────────────────────────────
  const updateLine = async (lineId: number, field: string, value: number) => {
    const line = lines.find((l) => l.polineid === lineId)
    if (!line) return

    const updates: any = { [field]: value }

    // Recalculate line total when qty or unit cost changes
    const qty = field === 'quantityordered' ? value : line.quantityordered
    const cost = field === 'unitcostusd' ? value : line.unitcostusd
    updates.linetotal = qty * cost

    await supabase.from('tblpurchaseorderlines').update(updates).eq('polineid', lineId)

    setLines((prev) =>
      prev.map((l) => l.polineid === lineId ? { ...l, ...updates } : l)
    )
    await recalculatePOTotals()
  }

  const updateLineLocation = async (lineId: number, locationId: number | null) => {
    await supabase
      .from('tblpurchaseorderlines')
      .update({ delivertolocationid: locationId })
      .eq('polineid', lineId)

    const loc = goodsInLocations.find((l) => l.locationid === locationId)
    setLines((prev) =>
      prev.map((l) =>
        l.polineid === lineId
          ? { ...l, delivertolocationid: locationId, delivertolocationcode: loc?.locationcode || null }
          : l
      )
    )
  }

  const removeLine = async (lineId: number) => {
    await supabase.from('tblpurchaseorderlines').delete().eq('polineid', lineId)
    setLines((prev) => prev.filter((l) => l.polineid !== lineId))
    await recalculatePOTotals()
  }

  // ── Recalculate PO totals ──────────────────────────────────────
  const recalculatePOTotals = async () => {
    const { data } = await supabase
      .from('tblpurchaseorderlines')
      .select('linetotal')
      .eq('poid', id)

    const subtotal = (data || []).reduce((sum: number, l: any) => sum + (l.linetotal || 0), 0)
    const pototal = subtotal + (po?.deliverycost || 0)

    await supabase.from('tblpurchaseorders').update({ subtotal, pototal }).eq('poid', id)
    setPO((prev) => prev ? { ...prev, subtotal, pototal } : prev)
  }

  // ── Save PO header ─────────────────────────────────────────────
  const savePO = async () => {
    if (!po) return
    setSaving(true)
    const { error } = await supabase
      .from('tblpurchaseorders')
      .update({
        expecteddate:  po.expecteddate,
        notes:         po.notes,
        exchangerate:  exchangeRate  ? parseFloat(exchangeRate)  : null,
        freightusd:    freightUSD    ? parseFloat(freightUSD)    : null,
        bankchargeusd: bankChargeUSD ? parseFloat(bankChargeUSD) : null,
      })
      .eq('poid', id)

    if (error) setError('Save failed: ' + error.message)
    else { setDirty(false); setSuccess(true); setTimeout(() => setSuccess(false), 3000) }
    setSaving(false)
  }

  // ── Status advance ─────────────────────────────────────────────
  const advanceStatus = async () => {
    if (!po) return
    const idx = STATUS_FLOW.indexOf(po.status)
    if (idx === -1 || idx >= STATUS_FLOW.length - 1) return
    const next = STATUS_FLOW[idx + 1]
    const updates: any = { status: next }
    if (next === 'Received') updates.receiveddate = new Date().toISOString()
    await supabase.from('tblpurchaseorders').update(updates).eq('poid', id)
    setPO((prev) => prev ? { ...prev, ...updates } : prev)
  }

  const stepBack = async () => {
    if (!po) return
    const idx = STATUS_FLOW.indexOf(po.status)
    if (idx <= 0) return
    const prev = STATUS_FLOW[idx - 1]
    await supabase.from('tblpurchaseorders').update({ status: prev }).eq('poid', id)
    setPO((p) => p ? { ...p, status: prev } : p)
  }

  const cancelPO = async () => {
    await supabase.from('tblpurchaseorders').update({ status: 'Cancelled' }).eq('poid', id)
    setPO((prev) => prev ? { ...prev, status: 'Cancelled' } : prev)
  }

  // ── Goods receipt ──────────────────────────────────────────────
  const openReceipt = (line: POLine) => {
    const outstanding = line.quantityordered - line.quantityreceived
    setReceiptLine(line)
    setReceiptRows([{
      id: 1,
      qty: outstanding > 0 ? String(outstanding) : '',
      locationId: line.delivertolocationid ? String(line.delivertolocationid) : '',
    }])
    setReceiptError(null)
  }

  const closeReceipt = () => {
    setReceiptLine(null)
    setReceiptRows([])
    setReceiptError(null)
  }

  const addReceiptRow = () => {
    setReceiptRows((prev) => [...prev, { id: Date.now(), qty: '', locationId: '' }])
  }

  const updateReceiptRow = (id: number, field: 'qty' | 'locationId', value: string) => {
    setReceiptRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r))
  }

  const removeReceiptRow = (id: number) => {
    setReceiptRows((prev) => prev.filter((r) => r.id !== id))
  }

  const saveReceipt = async () => {
    if (!receiptLine || !po) return
    if (receiptRows.length === 0) { setReceiptError('Add at least one receipt row'); return }
    for (const row of receiptRows) {
      const qty = parseInt(row.qty)
      if (isNaN(qty) || qty <= 0) { setReceiptError('All rows must have a valid quantity greater than zero'); return }
      if (!row.locationId) { setReceiptError('All rows must have a location selected'); return }
    }

    setReceiptSaving(true)
    setReceiptError(null)

    const totalQtyThisReceipt = receiptRows.reduce((sum, r) => sum + (parseInt(r.qty) || 0), 0)
    const newReceived = receiptLine.quantityreceived + totalQtyThisReceipt
    const lineStatus = newReceived > receiptLine.quantityordered ? 'Over-received'
                     : newReceived >= receiptLine.quantityordered ? 'Received'
                     : 'Partial'

    await supabase
      .from('tblpurchaseorderlines')
      .update({
        quantityreceived:    newReceived,
        delivertolocationid: parseInt(receiptRows[0].locationId),
        status:              lineStatus,
      })
      .eq('polineid', receiptLine.polineid)

    for (const row of receiptRows) {
      const qty = parseInt(row.qty)
      const locationId = parseInt(row.locationId)

      const { data: existing } = await supabase
        .from('tblstocklevels')
        .select('stocklevelid, quantityonhand')
        .eq('productid', receiptLine.productid)
        .eq('locationid', locationId)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('tblstocklevels')
          .update({ quantityonhand: existing.quantityonhand + qty })
          .eq('stocklevelid', existing.stocklevelid)
      } else {
        const { data: locData } = await supabase
          .from('tbllocations')
          .select('pickpriority')
          .eq('locationid', locationId)
          .single()

        await supabase
          .from('tblstocklevels')
          .insert({
            productid:      receiptLine.productid,
            locationid:     locationId,
            quantityonhand: qty,
            bagsize:        0,
            pickpriority:   locData?.pickpriority ?? 0,
          })
      }

      await supabase
        .from('tblstockmovements')
        .insert({
          movementdate:  new Date().toISOString(),
          movementtype:  'GOODS IN',
          productid:     receiptLine.productid,
          tolocationid:  locationId,
          quantity:      qty,
          reference:     po.ponumber,
          reason:        'Goods received',
          createdby:     'system',
        })
    }

    const allLines = await supabase
      .from('tblpurchaseorderlines')
      .select('status')
      .eq('poid', id)

    const updatedLines = (allLines.data || []).map((l: any) =>
      l.polineid === receiptLine.polineid ? { status: lineStatus } : l
    )
    const allReceived = updatedLines.every((l: any) => l.status === 'Received' || l.status === 'Over-received')
    const anyReceived = updatedLines.some((l: any) =>
      l.status === 'Received' || l.status === 'Partial' || l.status === 'Over-received'
    )

    const newPOStatus = allReceived ? 'Received' :
                        anyReceived ? 'Partial' : po.status

    if (newPOStatus !== po.status) {
      const updates: any = { status: newPOStatus }
      if (newPOStatus === 'Received') updates.receiveddate = new Date().toISOString()
      await supabase.from('tblpurchaseorders').update(updates).eq('poid', id)
      setPO((p) => p ? { ...p, ...updates } : p)
    }

    setReceiptSaving(false)
    closeReceipt()
    await fetchPO()
  }

  // ── Landed cost calculation ────────────────────────────────────
  const calculateLandedCosts = async () => {
    const rate = parseFloat(exchangeRate)
    const freight = parseFloat(freightUSD) || 0
    const bank = parseFloat(bankChargeUSD) || 0

    if (!rate || rate <= 0) {
      setError('Please enter a valid exchange rate')
      return
    }

    const eligibleLines = lines.filter((l) => l.unitcostusd > 0)

    if (eligibleLines.length === 0) {
      setError('Please enter unit costs (USD) on the lines before calculating')
      return
    }

    setCalculatingLanded(true)
    setError(null)

    // Total product cost USD across all priced lines, weighted by quantity ordered
    const totalProductUSD = eligibleLines.reduce(
      (sum, l) => sum + l.unitcostusd * l.quantityordered, 0
    )

    // Calculate landed cost per unit for each eligible line
    for (const line of eligibleLines) {
      const lineProdUSD = line.unitcostusd * line.quantityordered
      const proportion = lineProdUSD / totalProductUSD

      const lineFreightUSD = freight * proportion
      const lineBankUSD = bank * proportion
      const totalLineUSD = lineProdUSD + lineFreightUSD + lineBankUSD
      const landedPerUnitGBP = (totalLineUSD / line.quantityordered) * rate

      await supabase
        .from('tblpurchaseorderlines')
        .update({
          unitcost:             line.unitcostusd * rate,
          landedcostgbp:        landedPerUnitGBP,
          landedcostcalculated: true,
        })
        .eq('polineid', line.polineid)

      // Update product cost price
      await supabase
        .from('tblproducts')
        .update({ costprice: landedPerUnitGBP })
        .eq('productid', line.productid)
    }

    // Update PO with freight and bank charge
    const totalFreightGBP = (freight + bank) * rate
    await supabase
      .from('tblpurchaseorders')
      .update({
        deliverycost:  totalFreightGBP,
        exchangerate:  rate,
        freightusd:    freight || null,
        bankchargeusd: bank    || null,
      })
      .eq('poid', id)

    setLandedSuccess(true)
    setTimeout(() => setLandedSuccess(false), 4000)
    setCalculatingLanded(false)
    await fetchPO()
  }

  if (loading) return <div className="pf-page"><div className="pf-loading">Loading…</div></div>
  if (!po) return <div className="pf-page"><div className="pf-empty">{error || 'PO not found.'}</div></div>

  const isDraft = po.status === 'Draft'
  const isCancelled = po.status === 'Cancelled'
  const isReceived = po.status === 'Received'
  const currentIdx = STATUS_FLOW.indexOf(po.status)
  const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null
  const canEditLines = isDraft
  const canReceive = po.status === 'Sent' || po.status === 'Partial'

  // Received lines for putaway list
  const receivedLines = lines.filter((l) => l.quantityreceived > 0)

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => router.push('/purchase-orders')}>
            ← Purchase Orders
          </button>
          <h1 className="pf-page-title">{po.ponumber}</h1>
          <p className="pf-page-subtitle">{po.suppliername}</p>
        </div>
        <div className="pf-header-actions">
          {success && <span className="pf-saved">Saved</span>}
          {error && <span className="pf-error-inline">{error}</span>}

          <span className="pf-order-status-badge">{po.status}</span>

          {/* Step back */}
          {currentIdx > 0 && !isCancelled && !isReceived && (
            <button className="pf-btn-secondary" onClick={stepBack}>
              ← {STATUS_FLOW[currentIdx - 1]}
            </button>
          )}

          {/* Advance */}
          {nextStatus && !isCancelled && (
            <button className="pf-btn-primary" onClick={advanceStatus}>
              → {nextStatus}
            </button>
          )}

          {/* Goods Receipt — printable sheet for checking order in */}
          {lines.length > 0 && !isCancelled && (
            <button
              className="pf-btn-secondary"
              onClick={() => {
                const rows = [...lines]
                  .sort((a, b) => a.sku.localeCompare(b.sku))
                  .map((line) => `
                    <tr>
                      <td>${line.sku}</td>
                      <td>${line.productname}</td>
                      <td style="text-align:center"><strong>${line.quantityordered}</strong></td>
                      <td style="text-align:center">&nbsp;</td>
                      <td>&nbsp;</td>
                      <td style="text-align:center">☐</td>
                      <td>&nbsp;</td>
                    </tr>
                  `).join('')

                const html = `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <title>Goods Receipt — ${po.ponumber}</title>
                    <style>
                      body { font-family: Arial, sans-serif; font-size: 10pt; margin: 20pt; color: #000; }
                      h1 { font-size: 16pt; margin: 0 0 4pt 0; }
                      .doc-header { display: flex; justify-content: space-between; border-bottom: 2pt solid #000; padding-bottom: 8pt; margin-bottom: 12pt; }
                      .meta { font-size: 9pt; line-height: 1.6; }
                      table { width: 100%; border-collapse: collapse; }
                      th { background: #f0f0f0; border: 1pt solid #999; padding: 4pt 6pt; text-align: left; font-size: 8pt; text-transform: uppercase; }
                      td { border: 1pt solid #ccc; padding: 7pt 6pt; font-size: 9pt; vertical-align: top; }
                      tr:nth-child(even) td { background: #fafafa; }
                      .footer { margin-top: 16pt; padding-top: 10pt; border-top: 1pt solid #ccc; font-size: 9pt; color: #555; }
                      .sign-row { margin-top: 20pt; display: flex; gap: 40pt; font-size: 9pt; }
                      .sign-row div { flex: 1; border-top: 1pt solid #000; padding-top: 4pt; }
                    </style>
                  </head>
                  <body>
                    <div class="doc-header">
                      <div>
                        <h1>Goods Receipt</h1>
                        <div class="meta">
                          <strong>PO:</strong> ${po.ponumber || '—'}<br>
                          <strong>Supplier:</strong> ${po.suppliername}<br>
                          <strong>Order Date:</strong> ${po.orderdate ? new Date(po.orderdate).toLocaleDateString('en-GB') : '—'}
                          ${po.expecteddate ? `<br><strong>Expected:</strong> ${new Date(po.expecteddate).toLocaleDateString('en-GB')}` : ''}
                        </div>
                      </div>
                      <div class="meta" style="text-align:right">
                        <strong>Printed:</strong> ${new Date().toLocaleDateString('en-GB')}<br>
                        <strong>Lines:</strong> ${lines.length}<br>
                        <strong>Total Units Ordered:</strong> ${lines.reduce((s, l) => s + (l.quantityordered || 0), 0)}
                      </div>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th style="width:14%">SKU</th>
                          <th>Product</th>
                          <th style="width:8%;text-align:center">Ordered</th>
                          <th style="width:10%;text-align:center">Received</th>
                          <th style="width:12%">Location</th>
                          <th style="width:6%;text-align:center">✓</th>
                          <th style="width:20%">Notes</th>
                        </tr>
                      </thead>
                      <tbody>${rows}</tbody>
                    </table>
                    ${po.notes ? `<div style="margin-top:12pt;font-size:9pt"><strong>PO Notes:</strong> ${po.notes}</div>` : ''}
                    <div class="sign-row">
                      <div>Checked by (print name)</div>
                      <div>Signature</div>
                      <div>Date</div>
                    </div>
                    <div class="footer">
                      Tick each line as it is checked off the delivery. Record the received quantity and the location the stock was put away to. Note any shortages, damage, or substitutions in the Notes column.
                    </div>
                  </body>
                  </html>
                `

                const win = window.open('', '_blank', 'width=900,height=700')
                if (win) {
                  win.document.write(html)
                  win.document.close()
                  win.focus()
                  setTimeout(() => { try { win.print() } catch(e) {} }, 500)
                }
              }}
            >
              Print Goods Receipt
            </button>
          )}

          {/* Putaway list */}
          {receivedLines.length > 0 && (
            <button className="pf-btn-secondary" onClick={() => setShowPutaway(true)}>
              Putaway List
            </button>
          )}

          {/* Cancel */}
          {!isCancelled && !isReceived && (
            <button className="pf-btn-deactivate" onClick={cancelPO}>Cancel PO</button>
          )}

          {dirty && (
            <button className="pf-btn-secondary" onClick={savePO} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* Status flow */}
      <div className="pf-status-flow">
        {STATUS_FLOW.map((s, i) => (
          <div key={s} className={`pf-status-step ${
            i < currentIdx ? 'pf-step-done' :
            i === currentIdx ? 'pf-step-current' : 'pf-step-future'
          }`}>{s}</div>
        ))}
        {isCancelled && <div className="pf-status-step pf-step-cancelled">Cancelled</div>}
      </div>

      <div className="pf-order-grid">

        {/* LEFT — Lines */}
        <div className="pf-order-lines-col">
          <div className="pf-card">
            <div className="pf-panel-header">
              <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
                Order Lines
              </h2>
              {canEditLines && (
                <button className="pf-btn-edit" onClick={() => setShowProductSearch(!showProductSearch)}>
                  + Add Product
                </button>
              )}
            </div>

            <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />

            {showProductSearch && (
              <div className="pf-product-search-wrap">
                <input
                  className="pf-input"
                  placeholder="Search SKU or product name…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  autoFocus
                />
                {productResults.length > 0 && (
                  <div className="pf-client-dropdown">
                    {productResults.map((p) => (
                      <div key={p.productid} className="pf-client-dropdown-item" onClick={() => addLine(p)}>
                        <span className="pf-sku">{p.sku}</span>
                        <span className="pf-client-dropdown-name"> {p.productname}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {lines.length === 0 ? (
              <div className="pf-empty" style={{ padding: '1.5rem 0' }}>No lines yet.</div>
            ) : (
              <table className="pf-inner-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th className="pf-col-right">Ordered</th>
                    <th className="pf-col-right">Received</th>
                    <th className="pf-col-right">Unit Cost (USD)</th>
                    <th className="pf-col-right">Line Total (USD)</th>
                    <th className="pf-col-right">Landed (GBP)</th>
                    <th>Deliver To</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.polineid}>
                      <td className="pf-sku">{line.sku}</td>
                      <td className="pf-productname">{line.productname}</td>
                      <td className="pf-col-right">
                        {canEditLines ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                            <input
                              className="pf-input pf-input-sm pf-input-num pf-qty-input"
                              type="number" min="1"
                              value={line.quantityordered}
                              onChange={(e) => updateLine(line.polineid, 'quantityordered', parseInt(e.target.value) || 1)}
                            />
                            {line.reorderqty > 0 && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                                Usual: {line.reorderqty}
                              </span>
                            )}
                          </div>
                        ) : line.quantityordered}
                      </td>
                      <td className="pf-col-right">
                        {line.quantityreceived > line.quantityordered ? (
                          <span style={{ color: 'var(--warning, #b45309)', fontWeight: 600 }}>
                            {line.quantityreceived}
                            <span style={{ fontSize: '0.75rem', marginLeft: '0.3rem' }}>
                              (+{line.quantityreceived - line.quantityordered})
                            </span>
                          </span>
                        ) : (
                          <span className={line.quantityreceived >= line.quantityordered && line.quantityreceived > 0 ? 'pf-diff-pos' : ''}>
                            {line.quantityreceived}
                          </span>
                        )}
                      </td>
                      <td className="pf-col-right">
                        {canEditLines ? (
                          <input
                            className="pf-input pf-input-sm pf-input-num"
                            style={{ width: '90px' }}
                            type="number" step="0.01" min="0"
                            value={line.unitcostusd || ''}
                            onChange={(e) => updateLine(line.polineid, 'unitcostusd', parseFloat(e.target.value) || 0)}
                          />
                        ) : formatUSD(line.unitcostusd)}
                      </td>
                      <td className="pf-col-right pf-price">{formatUSD(line.linetotal)}</td>
                      <td className="pf-col-right pf-price">
                        {line.landedcostcalculated
                          ? <span className="pf-diff-pos">{formatGBP(line.landedcostgbp)}</span>
                          : <span className="pf-text-faint">—</span>
                        }
                      </td>
                      <td>
                        <select
                          className="pf-input pf-input-sm"
                          style={{ minWidth: '100px' }}
                          value={line.delivertolocationid || ''}
                          onChange={(e) => updateLineLocation(line.polineid, e.target.value ? parseInt(e.target.value) : null)}
                        >
                          <option value="">— Select —</option>
                          {goodsInLocations.map((loc) => (
                            <option key={loc.locationid} value={loc.locationid}>{loc.locationcode}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="pf-row-actions">
                          {canReceive && line.status !== 'Received' && line.status !== 'Over-received' && (
                            <button className="pf-btn-edit" onClick={() => openReceipt(line)}>
                              Receive
                            </button>
                          )}
                          {canEditLines && (
                            <button className="pf-btn-deactivate" onClick={() => removeLine(line.polineid)}>✕</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* PO Totals */}
            {lines.length > 0 && (
              <div className="pf-order-totals">
                <div className="pf-order-total-row">
                  <span>Product Subtotal (USD)</span>
                  <span>{formatUSD(po.subtotal)}</span>
                </div>
                {po.deliverycost > 0 && (
                  <div className="pf-order-total-row">
                    <span>Freight & Charges (GBP)</span>
                    <span>{formatGBP(po.deliverycost)}</span>
                  </div>
                )}
                <div className="pf-order-total-row pf-order-total-final">
                  <span>PO Total (USD)</span>
                  <span>{formatUSD(po.pototal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Landed cost calculator */}
          <div className="pf-card">
            <h2 className="pf-card-title">Landed Cost Calculator</h2>
            <p className="pf-card-note">
              Enter the exchange rate and any additional charges, then calculate at any time — as soon as you have unit costs, or again if anything changes.
              Costs are proportioned across all lines by value. Product cost prices are updated on each calculation.
            </p>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Exchange Rate (USD → GBP)</label>
                <input
                  className="pf-input pf-input-num"
                  type="number" step="0.0001" min="0"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  placeholder="e.g. 0.7850"
                />
              </div>
              <div className="pf-field">
                <label className="pf-label">Freight Cost (USD)</label>
                <input
                  className="pf-input pf-input-num"
                  type="number" step="0.01" min="0"
                  value={freightUSD}
                  onChange={(e) => setFreightUSD(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Bank / Handling Charge (USD)</label>
                <input
                  className="pf-input pf-input-num"
                  type="number" step="0.01" min="0"
                  value={bankChargeUSD}
                  onChange={(e) => setBankChargeUSD(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="pf-field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  className="pf-btn-primary"
                  style={{ width: '100%' }}
                  onClick={calculateLandedCosts}
                  disabled={calculatingLanded}
                >
                  {calculatingLanded ? 'Calculating…' : 'Calculate Landed Costs'}
                </button>
              </div>
            </div>

            {landedSuccess && (
              <div className="pf-alert-success">
                Landed costs calculated and product cost prices updated.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — PO details */}
        <div className="pf-order-details-col">

          <div className="pf-card">
            <h2 className="pf-card-title">PO Details</h2>

            <div className="pf-field">
              <label className="pf-label">Expected Delivery</label>
              <input
                className="pf-input"
                type="date"
                value={po.expecteddate ? po.expecteddate.split('T')[0] : ''}
                onChange={(e) => { setPO((p) => p ? { ...p, expecteddate: e.target.value } : p); setDirty(true) }}
              />
            </div>

            {po.receiveddate && (
              <div className="pf-meta-row" style={{ marginTop: '0.5rem' }}>
                <span>Received</span>
                <span>{new Date(po.receiveddate).toLocaleDateString('en-GB')}</span>
              </div>
            )}
          </div>

          <div className="pf-card">
            <h2 className="pf-card-title">Notes</h2>
            <div className="pf-field">
              <textarea
                className="pf-input pf-textarea"
                value={po.notes || ''}
                onChange={(e) => { setPO((p) => p ? { ...p, notes: e.target.value } : p); setDirty(true) }}
                rows={4}
              />
            </div>
          </div>

          <div className="pf-card pf-card-meta">
            <h2 className="pf-card-title">Record Info</h2>
            <div className="pf-meta-row">
              <span>PO Number</span>
              <span>{po.ponumber}</span>
            </div>
            <div className="pf-meta-row">
              <span>Supplier</span>
              <span>{po.suppliername}</span>
            </div>
            <div className="pf-meta-row">
              <span>Created</span>
              <span>{po.orderdate ? new Date(po.orderdate).toLocaleDateString('en-GB') : '—'}</span>
            </div>
          </div>

        </div>
      </div>

      {/* Goods Receipt Modal */}
      {receiptLine && (
        <div className="pf-modal-overlay" onClick={closeReceipt}>
          <div className="pf-modal pf-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h2 className="pf-modal-title">Receive Stock</h2>
              <button className="pf-modal-close" onClick={closeReceipt}>✕</button>
            </div>
            <div className="pf-modal-body">
              <div className="pf-modal-info">
                <div className="pf-modal-info-row">
                  <span>Product</span>
                  <span>{receiptLine.sku} — {receiptLine.productname}</span>
                </div>
                <div className="pf-modal-info-row">
                  <span>Ordered</span>
                  <span>{receiptLine.quantityordered}</span>
                </div>
                <div className="pf-modal-info-row">
                  <span>Already Received</span>
                  <span>{receiptLine.quantityreceived}</span>
                </div>
                <div className="pf-modal-info-row">
                  <span>Outstanding</span>
                  <span>{Math.max(0, receiptLine.quantityordered - receiptLine.quantityreceived)}</span>
                </div>
              </div>

              {/* Receipt rows */}
              <table className="pf-inner-table" style={{ marginTop: '1rem' }}>
                <thead>
                  <tr>
                    <th>Quantity</th>
                    <th>Location</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {receiptRows.map((row) => {
                    const qty = parseInt(row.qty) || 0
                    const total = receiptLine.quantityreceived + receiptRows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0)
                    return (
                      <tr key={row.id}>
                        <td style={{ width: '120px' }}>
                          <input
                            className="pf-input pf-input-num pf-input-sm"
                            type="number" min="1"
                            value={row.qty}
                            onChange={(e) => updateReceiptRow(row.id, 'qty', e.target.value)}
                            autoFocus={row.id === receiptRows[0]?.id}
                          />
                        </td>
                        <td>
                          <select
                            className="pf-input pf-input-sm"
                            value={row.locationId}
                            onChange={(e) => updateReceiptRow(row.id, 'locationId', e.target.value)}
                          >
                            <option value="">— Select location —</option>
                            {goodsInLocations.map((loc) => (
                              <option key={loc.locationid} value={loc.locationid}>
                                {loc.locationcode}{loc.locationname ? ` — ${loc.locationname}` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ width: '40px' }}>
                          {receiptRows.length > 1 && (
                            <button
                              className="pf-btn-deactivate"
                              style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
                              onClick={() => removeReceiptRow(row.id)}
                            >✕</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <button
                className="pf-btn-secondary"
                style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}
                onClick={addReceiptRow}
              >
                + Add Location
              </button>

              {/* Running total and over-received warning */}
              {(() => {
                const thisReceipt = receiptRows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0)
                const newTotal = receiptLine.quantityreceived + thisReceipt
                const over = newTotal - receiptLine.quantityordered
                return (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Receiving now: <strong>{thisReceipt}</strong> &nbsp;·&nbsp;
                    New total: <strong>{newTotal}</strong> of {receiptLine.quantityordered}
                    {over > 0 && (
                      <span style={{ color: 'var(--warning, #b45309)', marginLeft: '0.5rem' }}>
                        ⚠ {over} unit{over !== 1 ? 's' : ''} over ordered
                      </span>
                    )}
                  </div>
                )
              })()}

              {receiptError && <div className="pf-alert-error" style={{ marginTop: '0.75rem' }}>{receiptError}</div>}
            </div>
            <div className="pf-modal-footer">
              <button className="pf-btn-secondary" onClick={closeReceipt}>Cancel</button>
              <button className="pf-btn-primary" onClick={saveReceipt} disabled={receiptSaving}>
                {receiptSaving ? 'Saving…' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Putaway List Modal — screen view */}
      {showPutaway && (
        <div className="pf-modal-overlay" onClick={() => setShowPutaway(false)}>
          <div className="pf-modal pf-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h2 className="pf-modal-title">Putaway List — {po.ponumber}</h2>
              <button className="pf-modal-close" onClick={() => setShowPutaway(false)}>✕</button>
            </div>
            <div className="pf-modal-body">
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Stock received into goods-in locations. Move to shelf locations when ready.
              </p>
              <table className="pf-inner-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th className="pf-col-right">Qty Received</th>
                    <th>Goods In Location</th>
                    <th>Move To</th>
                  </tr>
                </thead>
                <tbody>
                  {receivedLines.map((line) => (
                    <tr key={line.polineid}>
                      <td className="pf-sku">{line.sku}</td>
                      <td className="pf-productname">{line.productname}</td>
                      <td className="pf-col-right">{line.quantityreceived}</td>
                      <td className="pf-sku">{line.delivertolocationcode || '—'}</td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pf-modal-footer">
              <button className="pf-btn-secondary" onClick={() => setShowPutaway(false)}>Close</button>
              <button
                className="pf-btn-primary"
                onClick={() => {
                  const rows = receivedLines.map((line) => `
                    <tr>
                      <td>${line.sku}</td>
                      <td>${line.productname}</td>
                      <td style="text-align:center">${line.quantityreceived}</td>
                      <td style="text-align:center">${line.delivertolocationcode || '—'}</td>
                      <td></td>
                      <td></td>
                    </tr>
                  `).join('')

                  const html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <title>Putaway List — ${po.ponumber}</title>
                      <style>
                        body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; margin: 20pt; }
                        h1 { font-size: 18pt; margin: 0 0 6pt 0; }
                        .meta { display: flex; gap: 24pt; font-size: 10pt; margin-bottom: 16pt; padding-bottom: 8pt; border-bottom: 2pt solid #000; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; }
                        th { background: #f0f0f0; border: 1pt solid #999; padding: 5pt 7pt; text-align: left; font-size: 9pt; font-weight: bold; text-transform: uppercase; }
                        td { border: 1pt solid #ccc; padding: 6pt 7pt; font-size: 10pt; }
                        tr:nth-child(even) td { background: #fafafa; }
                        .footer { font-size: 9pt; color: #666; margin-top: 8pt; }
                      </style>
                    </head>
                    <body>
                      <h1>Putaway List</h1>
                      <div class="meta">
                        <span><strong>PO:</strong> ${po.ponumber}</span>
                        <span><strong>Supplier:</strong> ${po.suppliername}</span>
                        <span><strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}</span>
                      </div>
                      <table>
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Product Description</th>
                            <th>Qty Received</th>
                            <th>Goods In Location</th>
                            <th>Move To</th>
                            <th>Done ✓</th>
                          </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                      </table>
                      <div class="footer">Move stock from goods-in locations to shelf locations and tick when done.</div>
                    </body>
                    </html>
                  `

                  const win = window.open('', '_blank', 'width=900,height=700')
                  if (win) {
                    win.document.write(html)
                    win.document.close()
                    win.focus()
                    setTimeout(() => { win.print(); win.close() }, 500)
                  }
                }}
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
