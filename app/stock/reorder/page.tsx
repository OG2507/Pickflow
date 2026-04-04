'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type ReorderLine = {
  productid: number
  sku: string
  productname: string
  category: string | null
  reorderlevel: number
  reorderqty: number
  currentstock: number
  onorderqty: number
  effectivestock: number
  preferredsupplierid: number | null
  preferredsuppliername: string | null
  alreadyonpo: boolean
  selected: boolean
  orderqty: number
  supplierid: number | null  // for this order
}

type Supplier = {
  supplierid: number
  suppliername: string
}

export default function ReorderPage() {
  const router = useRouter()
  const [lines, setLines] = useState<ReorderLine[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showCovered, setShowCovered] = useState(false)

  const fetchReorderData = useCallback(async () => {
    setLoading(true)
    setError(null)

    // 1. Get all active products with reorder levels
    const { data: products } = await supabase
      .from('tblproducts')
      .select('productid, sku, productname, category, reorderlevel, reorderqty, isactive')
      .eq('isactive', true)
      .gt('reorderlevel', 0)
      .order('sku')

    if (!products) { setLoading(false); return }

    // 2. Get total stock per product across all locations
    const { data: stockData } = await supabase
      .from('tblstocklevels')
      .select('productid, quantityonhand')

    const stockMap = new Map<number, number>()
    for (const row of (stockData || [])) {
      stockMap.set(row.productid, (stockMap.get(row.productid) || 0) + row.quantityonhand)
    }

    // 3. Get quantities currently on open POs (Draft or Sent)
    const { data: poLines } = await supabase
      .from('tblpurchaseorderlines')
      .select(`
        productid,
        quantityordered,
        quantityreceived,
        tblpurchaseorders!inner (status)
      `)
      .in('tblpurchaseorders.status', ['Draft', 'Sent'])

    const onOrderMap = new Map<number, number>()
    for (const row of (poLines || []) as any[]) {
      const outstanding = row.quantityordered - row.quantityreceived
      if (outstanding > 0) {
        onOrderMap.set(row.productid, (onOrderMap.get(row.productid) || 0) + outstanding)
      }
    }

    // 4. Get preferred supplier per product
    const { data: supplierLinks } = await supabase
      .from('tblproductsuppliers')
      .select('productid, supplierid, tblsuppliers (suppliername)')
      .eq('ispreferred', true)

    const supplierMap = new Map<number, { supplierid: number; suppliername: string }>()
    for (const row of (supplierLinks || []) as any[]) {
      supplierMap.set(row.productid, {
        supplierid:   row.supplierid,
        suppliername: row.tblsuppliers?.suppliername || '—',
      })
    }

    // 5. Build reorder lines
    const reorderLines: ReorderLine[] = products.map((p) => {
      const currentstock  = stockMap.get(p.productid) || 0
      const onorderqty    = onOrderMap.get(p.productid) || 0
      const effectivestock = currentstock + onorderqty
      const supplier      = supplierMap.get(p.productid)
      const alreadyonpo   = onorderqty > 0

      return {
        productid:              p.productid,
        sku:                    p.sku,
        productname:            p.productname,
        category:               p.category,
        reorderlevel:           p.reorderlevel,
        reorderqty:             p.reorderqty,
        currentstock,
        onorderqty,
        effectivestock,
        preferredsupplierid:   supplier?.supplierid || null,
        preferredsuppliername: supplier?.suppliername || null,
        alreadyonpo,
        selected:               false,
        orderqty:               p.reorderqty,
        supplierid:             supplier?.supplierid || null,
      }
    })

    // Filter to at/below reorder level
    const filtered = reorderLines.filter(
      (l) => l.currentstock <= l.reorderlevel
    )

    setLines(filtered)
    setLoading(false)
  }, [])

  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from('tblsuppliers')
      .select('supplierid, suppliername')
      .eq('isactive', true)
      .order('suppliername')
    setSuppliers(data || [])
  }

  useEffect(() => {
    fetchReorderData()
    fetchSuppliers()
  }, [fetchReorderData])

  const toggleSelect = (productid: number) => {
    setLines((prev) =>
      prev.map((l) => l.productid === productid ? { ...l, selected: !l.selected } : l)
    )
  }

  const toggleAll = () => {
    const visibleLines = lines.filter((l) => showCovered || l.effectivestock <= l.reorderlevel)
    const allSelected = visibleLines.every((l) => l.selected)
    const visibleIds = new Set(visibleLines.map((l) => l.productid))
    setLines((prev) =>
      prev.map((l) => visibleIds.has(l.productid) ? { ...l, selected: !allSelected } : l)
    )
  }

  const updateQty = (productid: number, qty: number) => {
    setLines((prev) =>
      prev.map((l) => l.productid === productid ? { ...l, orderqty: qty } : l)
    )
  }

  const updateSupplier = (productid: number, supplierid: number) => {
    setLines((prev) =>
      prev.map((l) => l.productid === productid ? { ...l, supplierid } : l)
    )
  }

  const createPOs = async () => {
    const selected = lines.filter((l) => l.selected && l.orderqty > 0)

    if (selected.length === 0) {
      setError('No lines selected. Tick the products you want to order.')
      return
    }

    const missingSupplier = selected.filter((l) => !l.supplierid)
    if (missingSupplier.length > 0) {
      setError(`Please select a supplier for: ${missingSupplier.map((l) => l.sku).join(', ')}`)
      return
    }

    setCreating(true)
    setError(null)

    // Group selected lines by supplier
    const bySupplier = new Map<number, ReorderLine[]>()
    for (const line of selected) {
      const sid = line.supplierid!
      if (!bySupplier.has(sid)) bySupplier.set(sid, [])
      bySupplier.get(sid)!.push(line)
    }

    const createdPOs: string[] = []

    for (const [supplierid, poLines] of bySupplier) {
      // Generate PO number
      const year = new Date().getFullYear()
      const { data: existing } = await supabase
        .from('tblpurchaseorders')
        .select('ponumber')
        .ilike('ponumber', `PO-${year}-%`)
        .order('ponumber', { ascending: false })
        .limit(1)

      let nextNum = 1
      if (existing && existing.length > 0) {
        const last = existing[0].ponumber?.split('-').pop()
        if (last) nextNum = parseInt(last) + 1
      }
      const ponumber = `PO-${year}-${nextNum.toString().padStart(5, '0')}`

      // Create PO header
      const { data: po, error: poError } = await supabase
        .from('tblpurchaseorders')
        .insert({
          ponumber,
          supplierid,
          orderdate: new Date().toISOString(),
          status:    'Draft',
          subtotal:  0,
          deliverycost: 0,
          pototal:   0,
          createdby: 'system',
        })
        .select('poid')
        .single()

      if (poError || !po) {
        setError('Failed to create PO: ' + poError?.message)
        setCreating(false)
        return
      }

      // Create PO lines
      const lineInserts = poLines.map((l) => ({
        poid:             po.poid,
        productid:        l.productid,
        quantityordered:  l.orderqty,
        quantityreceived: 0,
        unitcostusd:      0,
        unitcost:         0,
        landedcostgbp:    0,
        landedcostcalculated: false,
        linetotal:        0,
        status:           'Pending',
      }))

      await supabase.from('tblpurchaseorderlines').insert(lineInserts)
      createdPOs.push(ponumber)
    }

    setSuccess(
      `Created ${createdPOs.length} PO${createdPOs.length > 1 ? 's' : ''}: ${createdPOs.join(', ')}`
    )
    setCreating(false)
    await fetchReorderData()
  }

  const visibleLines = showCovered
    ? lines
    : lines.filter((l) => l.effectivestock <= l.reorderlevel)

  const selectedCount = lines.filter((l) => l.selected).length

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => router.push('/stock')}>
            ← Stock
          </button>
          <h1 className="pf-page-title">Reorder</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${visibleLines.length} product${visibleLines.length !== 1 ? 's' : ''} need attention`}
          </p>
        </div>
        <div className="pf-header-actions">
          {selectedCount > 0 && (
            <span className="pf-selected-count">{selectedCount} selected</span>
          )}
          <button
            className="pf-btn-primary"
            onClick={createPOs}
            disabled={creating || selectedCount === 0}
          >
            {creating ? 'Creating POs…' : `Create PO${selectedCount > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {error && <div className="pf-alert-error">{error}</div>}

      {success && (
        <div className="pf-alert-success">
          {success} —{' '}
          <button
            className="pf-link-btn"
            onClick={() => router.push('/purchase-orders')}
          >
            View Purchase Orders →
          </button>
        </div>
      )}

      <div className="pf-filters">
        <label className="pf-toggle-label">
          <input
            type="checkbox"
            checked={showCovered}
            onChange={(e) => setShowCovered(e.target.checked)}
          />
          Show covered items (on order quantity covers reorder level)
        </label>
      </div>

      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Checking stock levels…</div>
        ) : visibleLines.length === 0 ? (
          <div className="pf-empty">
            {lines.length === 0
              ? 'All products are above their reorder levels.'
              : 'All items needing attention are covered by existing purchase orders.'}
          </div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    onChange={toggleAll}
                    checked={visibleLines.length > 0 && visibleLines.every((l) => l.selected)}
                    style={{ accentColor: 'white', cursor: 'pointer' }}
                  />
                </th>
                <th>SKU</th>
                <th>Product</th>
                <th className="pf-col-right">Reorder Level</th>
                <th className="pf-col-right">In Stock</th>
                <th className="pf-col-right">On Order</th>
                <th className="pf-col-right">Effective</th>
                <th className="pf-col-right">Order Qty</th>
                <th>Supplier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleLines.map((line) => {
                const isCovered = line.effectivestock > line.reorderlevel
                return (
                  <tr
                    key={line.productid}
                    className={`pf-row ${isCovered ? 'pf-row-covered' : ''}`}
                    onClick={() => toggleSelect(line.productid)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={line.selected}
                        onChange={() => toggleSelect(line.productid)}
                        style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                    </td>
                    <td className="pf-sku">{line.sku}</td>
                    <td className="pf-productname">{line.productname}</td>
                    <td className="pf-col-right pf-category">{line.reorderlevel}</td>
                    <td className="pf-col-right">
                      <span className={line.currentstock === 0 ? 'pf-diff-neg' : ''}>
                        {line.currentstock}
                      </span>
                    </td>
                    <td className="pf-col-right">
                      {line.onorderqty > 0
                        ? <span className="pf-on-order">+{line.onorderqty}</span>
                        : <span className="pf-category">—</span>
                      }
                    </td>
                    <td className="pf-col-right">
                      <span className={line.effectivestock <= line.reorderlevel ? 'pf-diff-neg' : 'pf-diff-pos'}>
                        {line.effectivestock}
                      </span>
                    </td>
                    <td className="pf-col-right" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="pf-input pf-input-sm pf-input-num pf-qty-input"
                        type="number"
                        min="1"
                        value={line.orderqty}
                        onChange={(e) => updateQty(line.productid, parseInt(e.target.value) || 1)}
                      />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="pf-input pf-input-sm"
                        style={{ minWidth: '140px' }}
                        value={line.supplierid || ''}
                        onChange={(e) => updateSupplier(line.productid, parseInt(e.target.value))}
                      >
                        <option value="">— Select —</option>
                        {suppliers.map((s) => (
                          <option key={s.supplierid} value={s.supplierid}>
                            {s.suppliername}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {line.alreadyonpo
                        ? <span className="pf-badge pf-badge-on-order">On Order</span>
                        : <span className="pf-badge pf-badge-low">Needed</span>
                      }
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
