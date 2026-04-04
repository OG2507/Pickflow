'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type StockByProduct = {
  productid: number
  sku: string
  productname: string
  category: string | null
  reorderlevel: number
  totalstock: number
  locations: {
    locationid: number
    locationcode: string
    locationname: string | null
    quantityonhand: number
    pickpriority: number
  }[]
}

type StockByLocation = {
  locationid: number
  locationcode: string
  locationname: string | null
  locationtype: string | null
  zone: string | null
  products: {
    productid: number
    sku: string
    productname: string
    quantityonhand: number
    pickpriority: number
  }[]
}

type AdjustTarget = {
  productid: number
  locationid: number
  sku: string
  productname: string
  locationcode: string
  currentqty: number
}

const MOVEMENT_REASONS = [
  'Stock count correction',
  'Damaged goods',
  'Write off',
  'Found stock',
  'Transfer in',
  'Transfer out',
  'Other',
]

export default function StockPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const productParam = searchParams.get('product')

  const [view, setView] = useState<'product' | 'location'>('product')
  const [byProduct, setByProduct] = useState<StockByProduct[]>([])
  const [byLocation, setByLocation] = useState<StockByLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Adjustment modal
  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget | null>(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)
  const [adjustError, setAdjustError] = useState<string | null>(null)

  // Transfer modal
  const [transferTarget, setTransferTarget] = useState<AdjustTarget | null>(null)
  const [transferQty, setTransferQty] = useState('')
  const [transferDestId, setTransferDestId] = useState('')
  const [allLocations, setAllLocations] = useState<{ locationid: number; locationcode: string; locationname: string | null }[]>([])
  const [transferSaving, setTransferSaving] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)

  const fetchStock = useCallback(async () => {
    setLoading(true)

    // Fetch all stock levels with product and location data
    const { data, error } = await supabase
      .from('tblstocklevels')
      .select(`
        stocklevelid,
        quantityonhand,
        pickpriority,
        productid,
        locationid,
        tblproducts (productid, sku, productname, category, reorderlevel, isactive),
        tbllocations (locationid, locationcode, locationname, locationtype, zone, isactive)
      `)
      .order('productid')

    if (error) {
      console.error('Error fetching stock:', error)
      setLoading(false)
      return
    }

    const rows = (data || []).filter(
      (r: any) => r.tblproducts?.isactive && r.tbllocations?.isactive && r.quantityonhand > 0
    )

    // Build by-product view
    const productMap = new Map<number, StockByProduct>()
    for (const row of rows as any[]) {
      const p = row.tblproducts
      const l = row.tbllocations
      if (!p || !l) continue

      if (!productMap.has(p.productid)) {
        productMap.set(p.productid, {
          productid:    p.productid,
          sku:          p.sku,
          productname:  p.productname,
          category:     p.category,
          reorderlevel: p.reorderlevel,
          totalstock:   0,
          locations:    [],
        })
      }

      const entry = productMap.get(p.productid)!
      entry.totalstock += row.quantityonhand
      entry.locations.push({
        locationid:    l.locationid,
        locationcode:  l.locationcode,
        locationname:  l.locationname,
        quantityonhand: row.quantityonhand,
        pickpriority:  row.pickpriority,
      })
    }

    // Build by-location view
    const locationMap = new Map<number, StockByLocation>()
    for (const row of rows as any[]) {
      const p = row.tblproducts
      const l = row.tbllocations
      if (!p || !l) continue

      if (!locationMap.has(l.locationid)) {
        locationMap.set(l.locationid, {
          locationid:   l.locationid,
          locationcode: l.locationcode,
          locationname: l.locationname,
          locationtype: l.locationtype,
          zone:         l.zone,
          products:     [],
        })
      }

      const entry = locationMap.get(l.locationid)!
      entry.products.push({
        productid:     p.productid,
        sku:           p.sku,
        productname:   p.productname,
        quantityonhand: row.quantityonhand,
        pickpriority:  row.pickpriority,
      })
    }

    let productList = Array.from(productMap.values()).sort((a, b) =>
      a.sku.localeCompare(b.sku)
    )
    let locationList = Array.from(locationMap.values()).sort((a, b) =>
      a.locationcode.localeCompare(b.locationcode)
    )

    // Apply search
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      productList = productList.filter(
        (p) => p.sku.toLowerCase().includes(s) || p.productname.toLowerCase().includes(s)
      )
      locationList = locationList.filter(
        (l) =>
          l.locationcode.toLowerCase().includes(s) ||
          (l.locationname || '').toLowerCase().includes(s) ||
          l.products.some(
            (p) => p.sku.toLowerCase().includes(s) || p.productname.toLowerCase().includes(s)
          )
      )
    }

    // Apply low stock filter
    if (lowStockOnly) {
      productList = productList.filter((p) => p.totalstock <= p.reorderlevel)
    }

    setByProduct(productList)
    setByLocation(locationList)
    setLoading(false)
  }, [search, lowStockOnly])

  useEffect(() => {
    fetchStock()
  }, [fetchStock])

  // Auto-expand product if arriving from product page
  useEffect(() => {
    if (productParam && byProduct.length > 0) {
      const pid = parseInt(productParam)
      const match = byProduct.find((p) => p.productid === pid)
      if (match) {
        setExpandedId(pid)
        setSearch(match.sku)
      }
    }
  }, [productParam, byProduct])

  // ── Stock adjustment ───────────────────────────────────────────
  const openAdjust = (target: AdjustTarget) => {
    setAdjustTarget(target)
    setAdjustQty(String(target.currentqty))
    setAdjustReason('')
    setAdjustNotes('')
    setAdjustError(null)
  }

  const closeAdjust = () => {
    setAdjustTarget(null)
    setAdjustQty('')
    setAdjustReason('')
    setAdjustNotes('')
    setAdjustError(null)
  }

  const saveAdjustment = async () => {
    if (!adjustTarget) return
    const newQty = parseInt(adjustQty)
    if (isNaN(newQty) || newQty < 0) {
      setAdjustError('Enter a valid quantity (0 or more)')
      return
    }
    if (!adjustReason) {
      setAdjustError('Please select a reason')
      return
    }

    setAdjustSaving(true)
    setAdjustError(null)

    const diff = newQty - adjustTarget.currentqty
    const movementType = diff >= 0 ? 'ADJUSTMENT IN' : 'ADJUSTMENT OUT'

    // Update stock level
    const { error: stockError } = await supabase
      .from('tblstocklevels')
      .update({ quantityonhand: newQty })
      .eq('productid', adjustTarget.productid)
      .eq('locationid', adjustTarget.locationid)

    if (stockError) {
      setAdjustError('Failed to update stock: ' + stockError.message)
      setAdjustSaving(false)
      return
    }

    // Log the movement
    const { error: movError } = await supabase
      .from('tblstockmovements')
      .insert({
        movementdate:   new Date().toISOString(),
        movementtype:   movementType,
        productid:      adjustTarget.productid,
        fromlocationid: diff < 0 ? adjustTarget.locationid : null,
        tolocationid:   diff >= 0 ? adjustTarget.locationid : null,
        quantity:       Math.abs(diff),
        reference:      `ADJ-${adjustTarget.locationcode}`,
        reason:         adjustReason,
        createdby:      'system',
        notes:          adjustNotes || null,
      })

    if (movError) {
      setAdjustError('Stock updated but movement log failed: ' + movError.message)
      setAdjustSaving(false)
      return
    }

    closeAdjust()
    await fetchStock()
    setAdjustSaving(false)
  }

  // ── Stock transfer ─────────────────────────────────────────────
  const openTransfer = async (target: AdjustTarget) => {
    setTransferTarget(target)
    setTransferQty('')
    setTransferDestId('')
    setTransferError(null)

    // Fetch all active locations except the source
    const { data } = await supabase
      .from('tbllocations')
      .select('locationid, locationcode, locationname')
      .eq('isactive', true)
      .neq('locationid', target.locationid)
      .order('locationcode')

    setAllLocations(data || [])
  }

  const closeTransfer = () => {
    setTransferTarget(null)
    setTransferQty('')
    setTransferDestId('')
    setTransferError(null)
  }

  const saveTransfer = async () => {
    if (!transferTarget) return
    const qty = parseInt(transferQty)
    if (isNaN(qty) || qty <= 0) {
      setTransferError('Enter a valid quantity')
      return
    }
    if (qty > transferTarget.currentqty) {
      setTransferError(`Cannot transfer more than current stock (${transferTarget.currentqty})`)
      return
    }
    if (!transferDestId) {
      setTransferError('Select a destination location')
      return
    }

    setTransferSaving(true)
    setTransferError(null)

    const destId = parseInt(transferDestId)

    // Decrease source
    await supabase
      .from('tblstocklevels')
      .update({ quantityonhand: transferTarget.currentqty - qty })
      .eq('productid', transferTarget.productid)
      .eq('locationid', transferTarget.locationid)

    // Increase or create destination
    const { data: existing } = await supabase
      .from('tblstocklevels')
      .select('stocklevelid, quantityonhand')
      .eq('productid', transferTarget.productid)
      .eq('locationid', destId)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('tblstocklevels')
        .update({ quantityonhand: existing.quantityonhand + qty })
        .eq('stocklevelid', existing.stocklevelid)
    } else {
      await supabase
        .from('tblstocklevels')
        .insert({
          productid:      transferTarget.productid,
          locationid:     destId,
          quantityonhand: qty,
          bagsize:        0,
          pickpriority:   0,
        })
    }

    // Log the movement
    const destLoc = allLocations.find((l) => l.locationid === destId)
    await supabase
      .from('tblstockmovements')
      .insert({
        movementdate:   new Date().toISOString(),
        movementtype:   'TRANSFER',
        productid:      transferTarget.productid,
        fromlocationid: transferTarget.locationid,
        tolocationid:   destId,
        quantity:       qty,
        reference:      `XFER-${transferTarget.locationcode}-${destLoc?.locationcode}`,
        reason:         'Stock transfer',
        createdby:      'system',
      })

    setTransferSaving(false)
    closeTransfer()
    await fetchStock()
  }

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          {productParam && (
            <button className="pf-back" onClick={() => router.back()}>
              ← Back to Product
            </button>
          )}
          <h1 className="pf-page-title">Stock</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : view === 'product'
              ? `${byProduct.length} product${byProduct.length !== 1 ? 's' : ''}`
              : `${byLocation.length} location${byLocation.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>
        <div className="pf-header-actions">
          <button
            className="pf-btn-secondary"
            onClick={() => router.push('/stock/reorder')}
          >
            Reorder
          </button>
          <div className="pf-toggle-group">
          <button
            className={`pf-toggle ${view === 'product' ? 'pf-toggle-on' : ''}`}
            onClick={() => { setView('product'); setExpandedId(null) }}
          >
            By Product
          </button>
          <button
            className={`pf-toggle ${view === 'location' ? 'pf-toggle-on' : ''}`}
            onClick={() => { setView('location'); setExpandedId(null) }}
          >
            By Location
          </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="pf-filters">
        <input
          type="text"
          placeholder={view === 'product' ? 'Search SKU or product name…' : 'Search location or product…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pf-input pf-search"
        />
        {view === 'product' && (
          <label className="pf-toggle-label">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => setLowStockOnly(e.target.checked)}
            />
            Low stock only
          </label>
        )}
      </div>

      {/* By Product View */}
      {view === 'product' && (
        <div className="pf-table-wrap">
          {loading ? (
            <div className="pf-loading">Loading stock…</div>
          ) : byProduct.length === 0 ? (
            <div className="pf-empty">No stock records found.</div>
          ) : (
            <table className="pf-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th className="pf-col-right">Total Stock</th>
                  <th className="pf-col-right">Reorder Level</th>
                  <th className="pf-col-center">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map((p) => (
                  <React.Fragment key={p.productid}>
                    <tr
                      className="pf-row"
                      onClick={() => toggleExpand(p.productid)}
                    >
                      <td className="pf-sku">{p.sku}</td>
                      <td className="pf-productname">{p.productname}</td>
                      <td className="pf-category">{p.category || '—'}</td>
                      <td className="pf-col-right pf-price">{p.totalstock}</td>
                      <td className="pf-col-right pf-category">{p.reorderlevel}</td>
                      <td className="pf-col-center">
                        {p.totalstock === 0 ? (
                          <span className="pf-badge pf-badge-out">Out</span>
                        ) : p.totalstock <= p.reorderlevel ? (
                          <span className="pf-badge pf-badge-low">Low</span>
                        ) : (
                          <span className="pf-badge pf-badge-ok">OK</span>
                        )}
                      </td>
                      <td className="pf-col-center">
                        <span className="pf-expand-icon">
                          {expandedId === p.productid ? '▲' : '▼'}
                        </span>
                      </td>
                    </tr>
                    {expandedId === p.productid && (
                      <tr key={`${p.productid}-detail`} className="pf-expand-row">
                        <td colSpan={7}>
                          <div className="pf-location-breakdown">
                            <table className="pf-inner-table">
                              <thead>
                                <tr>
                                  <th>Location</th>
                                  <th className="pf-col-right">Qty on Hand</th>
                                  <th className="pf-col-right">Pick Priority</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.locations
                                  .sort((a, b) => a.pickpriority - b.pickpriority)
                                  .map((loc) => (
                                    <tr key={loc.locationid}>
                                      <td className="pf-sku">{loc.locationcode}
                                        {loc.locationname && (
                                          <span className="pf-location-name"> {loc.locationname}</span>
                                        )}
                                      </td>
                                      <td className="pf-col-right">{loc.quantityonhand}</td>
                                      <td className="pf-col-right pf-category">{loc.pickpriority}</td>
                                      <td className="pf-col-right">
                                        <div className="pf-row-actions">
                                          <button
                                            className="pf-btn-edit"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              openAdjust({
                                                productid:    p.productid,
                                                locationid:   loc.locationid,
                                                sku:          p.sku,
                                                productname:  p.productname,
                                                locationcode: loc.locationcode,
                                                currentqty:   loc.quantityonhand,
                                              })
                                            }}
                                          >
                                            Adjust
                                          </button>
                                          <button
                                            className="pf-btn-activate"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              openTransfer({
                                                productid:    p.productid,
                                                locationid:   loc.locationid,
                                                sku:          p.sku,
                                                productname:  p.productname,
                                                locationcode: loc.locationcode,
                                                currentqty:   loc.quantityonhand,
                                              })
                                            }}
                                          >
                                            Transfer
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* By Location View */}
      {view === 'location' && (
        <div className="pf-table-wrap">
          {loading ? (
            <div className="pf-loading">Loading stock…</div>
          ) : byLocation.length === 0 ? (
            <div className="pf-empty">No stock records found.</div>
          ) : (
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Zone</th>
                  <th>Type</th>
                  <th className="pf-col-right">Products</th>
                  <th className="pf-col-right">Total Units</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byLocation.map((loc) => (
                  <React.Fragment key={loc.locationid}>
                    <tr
                      className="pf-row"
                      onClick={() => toggleExpand(loc.locationid)}
                    >
                      <td className="pf-sku">{loc.locationcode}
                        {loc.locationname && (
                          <span className="pf-location-name"> {loc.locationname}</span>
                        )}
                      </td>
                      <td className="pf-category">{loc.zone || '—'}</td>
                      <td className="pf-category">{loc.locationtype || '—'}</td>
                      <td className="pf-col-right pf-category">{loc.products.length}</td>
                      <td className="pf-col-right pf-price">
                        {loc.products.reduce((sum, p) => sum + p.quantityonhand, 0)}
                      </td>
                      <td className="pf-col-center">
                        <span className="pf-expand-icon">
                          {expandedId === loc.locationid ? '▲' : '▼'}
                        </span>
                      </td>
                    </tr>
                    {expandedId === loc.locationid && (
                      <tr key={`${loc.locationid}-detail`} className="pf-expand-row">
                        <td colSpan={6}>
                          <div className="pf-location-breakdown">
                            <table className="pf-inner-table">
                              <thead>
                                <tr>
                                  <th>SKU</th>
                                  <th>Product Name</th>
                                  <th className="pf-col-right">Qty on Hand</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {loc.products
                                  .sort((a, b) => a.sku.localeCompare(b.sku))
                                  .map((p) => (
                                    <tr key={p.productid}>
                                      <td className="pf-sku">{p.sku}</td>
                                      <td className="pf-productname">{p.productname}</td>
                                      <td className="pf-col-right">{p.quantityonhand}</td>
                                      <td className="pf-col-right">
                                        <div className="pf-row-actions">
                                          <button
                                            className="pf-btn-edit"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              openAdjust({
                                                productid:    p.productid,
                                                locationid:   loc.locationid,
                                                sku:          p.sku,
                                                productname:  p.productname,
                                                locationcode: loc.locationcode,
                                                currentqty:   p.quantityonhand,
                                              })
                                            }}
                                          >
                                            Adjust
                                          </button>
                                          <button
                                            className="pf-btn-activate"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              openTransfer({
                                                productid:    p.productid,
                                                locationid:   loc.locationid,
                                                sku:          p.sku,
                                                productname:  p.productname,
                                                locationcode: loc.locationcode,
                                                currentqty:   p.quantityonhand,
                                              })
                                            }}
                                          >
                                            Transfer
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Adjustment Modal */}
      {adjustTarget && (
        <div className="pf-modal-overlay" onClick={closeAdjust}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h2 className="pf-modal-title">Adjust Stock</h2>
              <button className="pf-modal-close" onClick={closeAdjust}>✕</button>
            </div>

            <div className="pf-modal-body">
              <div className="pf-modal-info">
                <div className="pf-modal-info-row">
                  <span>Product</span>
                  <span>{adjustTarget.sku} — {adjustTarget.productname}</span>
                </div>
                <div className="pf-modal-info-row">
                  <span>Location</span>
                  <span>{adjustTarget.locationcode}</span>
                </div>
                <div className="pf-modal-info-row">
                  <span>Current Qty</span>
                  <span className="pf-modal-current-qty">{adjustTarget.currentqty}</span>
                </div>
              </div>

              <div className="pf-field">
                <label className="pf-label">New Quantity <span className="pf-required">*</span></label>
                <input
                  className="pf-input pf-input-num pf-input-lg"
                  type="number"
                  min="0"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  autoFocus
                />
                {adjustQty !== '' && !isNaN(parseInt(adjustQty)) && (
                  <span className={`pf-adjust-diff ${parseInt(adjustQty) - adjustTarget.currentqty >= 0 ? 'pf-diff-pos' : 'pf-diff-neg'}`}>
                    {parseInt(adjustQty) - adjustTarget.currentqty >= 0 ? '+' : ''}
                    {parseInt(adjustQty) - adjustTarget.currentqty} from current
                  </span>
                )}
              </div>

              <div className="pf-field">
                <label className="pf-label">Reason <span className="pf-required">*</span></label>
                <select
                  className="pf-input"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                >
                  <option value="">— Select reason —</option>
                  {MOVEMENT_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="pf-field">
                <label className="pf-label">Notes</label>
                <input
                  className="pf-input"
                  type="text"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Optional additional detail…"
                />
              </div>

              {adjustError && <div className="pf-alert-error">{adjustError}</div>}
            </div>

            <div className="pf-modal-footer">
              <button className="pf-btn-secondary" onClick={closeAdjust}>Cancel</button>
              <button
                className="pf-btn-primary"
                onClick={saveAdjustment}
                disabled={adjustSaving}
              >
                {adjustSaving ? 'Saving…' : 'Save Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {transferTarget && (
        <div className="pf-modal-overlay" onClick={closeTransfer}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h2 className="pf-modal-title">Transfer Stock</h2>
              <button className="pf-modal-close" onClick={closeTransfer}>✕</button>
            </div>

            <div className="pf-modal-body">
              <div className="pf-modal-info">
                <div className="pf-modal-info-row">
                  <span>Product</span>
                  <span>{transferTarget.sku} — {transferTarget.productname}</span>
                </div>
                <div className="pf-modal-info-row">
                  <span>From</span>
                  <span>{transferTarget.locationcode}</span>
                </div>
                <div className="pf-modal-info-row">
                  <span>Available</span>
                  <span className="pf-modal-current-qty">{transferTarget.currentqty}</span>
                </div>
              </div>

              <div className="pf-field">
                <label className="pf-label">Destination Location <span className="pf-required">*</span></label>
                <select
                  className="pf-input"
                  value={transferDestId}
                  onChange={(e) => setTransferDestId(e.target.value)}
                >
                  <option value="">— Select destination —</option>
                  {allLocations.map((loc) => (
                    <option key={loc.locationid} value={loc.locationid}>
                      {loc.locationcode}{loc.locationname ? ` — ${loc.locationname}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pf-field">
                <label className="pf-label">Quantity to Transfer <span className="pf-required">*</span></label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <input
                    className="pf-input pf-input-num pf-input-lg"
                    type="number"
                    min="1"
                    max={transferTarget.currentqty}
                    value={transferQty}
                    onChange={(e) => setTransferQty(e.target.value)}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button
                    className="pf-btn-secondary"
                    style={{ whiteSpace: 'nowrap', marginTop: '0.1rem' }}
                    onClick={() => setTransferQty(String(transferTarget.currentqty))}
                  >
                    Move All
                  </button>
                </div>
              </div>

              {transferError && <div className="pf-alert-error">{transferError}</div>}
            </div>

            <div className="pf-modal-footer">
              <button className="pf-btn-secondary" onClick={closeTransfer}>Cancel</button>
              <button
                className="pf-btn-primary"
                onClick={saveTransfer}
                disabled={transferSaving}
              >
                {transferSaving ? 'Transferring…' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
