'use client'

import React, { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import StockTabs from '@/components/StockTabs'

type BulkRow = {
  stocklevelid: number
  productid: number
  sku: string
  productname: string
  quantityonhand: number
  locationcode: string
  locationid: number
  locationtype: string
  pickingbintracked: boolean
  binmaxqty: number
}

type RowState = {
  newQty: string
  tracked: boolean
  binMax: string
  saved: boolean
  saving: boolean
  changed: boolean
}

export default function BulkCheckPage() {
  const [fromCode, setFromCode] = useState('')
  const [toCode, setToCode] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'Picking Bin' | 'Overflow'>('Picking Bin')

  const [rows, setRows] = useState<BulkRow[]>([])
  const [rowState, setRowState] = useState<Record<number, RowState>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<{ saved: number; unchanged: number } | null>(null)

  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const load = async () => {
    if (!fromCode.trim() || !toCode.trim()) {
      setError('Enter both a From and To location code')
      return
    }
    setLoading(true)
    setError(null)
    setRows([])
    setRowState({})
    setSaveResult(null)

    // Fetch locations in range
    let locQuery = supabase
      .from('tbllocations')
      .select('locationid, locationcode, locationtype')
      .gte('locationcode', fromCode.trim().toUpperCase())
      .lte('locationcode', toCode.trim().toUpperCase())
      .eq('isactive', true)
      .order('locationcode')

    if (filterType !== 'all') {
      locQuery = locQuery.eq('locationtype', filterType)
    }

    const { data: locs, error: locErr } = await locQuery
    if (locErr) { console.error(locErr); setError('Error loading locations'); setLoading(false); return }
    if (!locs || locs.length === 0) { setError('No locations found in that range'); setLoading(false); return }

    const locationIds = locs.map((l: any) => l.locationid)
    const locMap = new Map<number, { locationcode: string; locationtype: string }>((locs || []).map((l: any) => [l.locationid, l]))

    // Fetch stock levels for those locations
    const { data: stock, error: stockErr } = await supabase
      .from('tblstocklevels')
      .select('stocklevelid, productid, locationid, quantityonhand')
      .in('locationid', locationIds)
      .order('locationid')

    if (stockErr) { console.error(stockErr); setError('Error loading stock levels'); setLoading(false); return }
    if (!stock || stock.length === 0) { setError('No stock records found in that location range'); setLoading(false); return }

    // Fetch products separately — tblstocklevels → tblproducts FK not in schema cache
    const productIds = [...new Set((stock || []).map((s: any) => s.productid))]
    const { data: prods, error: prodErr } = await supabase
      .from('tblproducts')
      .select('productid, sku, productname, pickingbintracked, binmaxqty')
      .in('productid', productIds)

    if (prodErr) { console.error(prodErr); setError('Error loading products'); setLoading(false); return }

    const prodMap = new Map<number, { sku: string; productname: string; pickingbintracked: boolean; binmaxqty: number }>((prods || []).map((p: any) => [p.productid, p]))

    const result: BulkRow[] = (stock || [])
      .filter((s: any) => locMap.has(s.locationid) && prodMap.has(s.productid))
      .map((s: any) => {
        const loc = locMap.get(s.locationid)
        const prod = prodMap.get(s.productid)
        return {
          stocklevelid:      s.stocklevelid,
          productid:         s.productid,
          sku:               prod?.sku || '',
          productname:       prod?.productname || '',
          quantityonhand:    s.quantityonhand,
          locationcode:      loc?.locationcode || '',
          locationid:        s.locationid,
          locationtype:      loc?.locationtype || '',
          pickingbintracked: prod?.pickingbintracked ?? false,
          binmaxqty:         prod?.binmaxqty ?? 0,
        }
      })
      .sort((a: BulkRow, b: BulkRow) =>
        a.locationcode.localeCompare(b.locationcode) || a.sku.localeCompare(b.sku)
      )

    setRows(result)

    const initState: Record<number, RowState> = {}
    result.forEach((r: BulkRow) => {
      initState[r.stocklevelid] = {
        newQty:  String(r.quantityonhand),
        tracked: r.pickingbintracked,
        binMax:  String(r.binmaxqty),
        saved:   false,
        saving:  false,
        changed: false,
      }
    })
    setRowState(initState)
    setLoading(false)
  }

  const handleQtyChange = (stocklevelid: number, value: string) => {
    setRowState(prev => ({
      ...prev,
      [stocklevelid]: { ...prev[stocklevelid], newQty: value, changed: true },
    }))
  }

  const handleTrackedChange = (stocklevelid: number, value: boolean) => {
    setRowState(prev => ({
      ...prev,
      [stocklevelid]: { ...prev[stocklevelid], tracked: value, changed: true },
    }))
  }

  const handleBinMaxChange = (stocklevelid: number, value: string) => {
    setRowState(prev => ({
      ...prev,
      [stocklevelid]: { ...prev[stocklevelid], binMax: value, changed: true },
    }))
  }

  // Bin Max only applies to picking bin rows.
  const binMaxChanged = (row: BulkRow, s: RowState | undefined) => {
    if (!s || row.locationtype !== 'Picking Bin') return false
    const v = s.binMax.trim() === '' ? 0 : parseInt(s.binMax)
    return !isNaN(v) && v >= 0 && v !== row.binmaxqty
  }

  // Tab key navigation between qty inputs
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, stocklevelid: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      const ids = rows.map(r => r.stocklevelid)
      const idx = ids.indexOf(stocklevelid)
      if (idx < ids.length - 1) {
        e.preventDefault()
        inputRefs.current[ids[idx + 1]]?.focus()
        inputRefs.current[ids[idx + 1]]?.select()
      }
    }
  }

  const saveAll = async () => {
    const toSave = rows.filter(r => {
      const s = rowState[r.stocklevelid]
      if (!s || s.saved) return false
      const newQty = parseInt(s.newQty)
      if (isNaN(newQty) || newQty < 0) return false
      const qtyChanged = newQty !== r.quantityonhand
      const trackedChanged = s.tracked !== r.pickingbintracked
      const bmChanged = binMaxChanged(r, s)
      return qtyChanged || trackedChanged || bmChanged
    })

    if (toSave.length === 0) {
      // Still stamp lastchecked for all picking bin rows even if nothing changed
      await stampAllChecked()
      setSaveResult({ saved: 0, unchanged: rows.length })
      return
    }

    setSaving(true)
    setError(null)

    // Mark all as saving
    setRowState(prev => {
      const next = { ...prev }
      toSave.forEach(r => { next[r.stocklevelid] = { ...next[r.stocklevelid], saving: true } })
      return next
    })

    let savedCount = 0

    for (const row of toSave) {
      const s = rowState[row.stocklevelid]
      const newQty = parseInt(s.newQty)
      const qtyChanged = newQty !== row.quantityonhand
      const trackedChanged = s.tracked !== row.pickingbintracked

      if (qtyChanged) {
        const { error: updErr } = await supabase
          .from('tblstocklevels')
          .update({ quantityonhand: newQty })
          .eq('stocklevelid', row.stocklevelid)
        if (updErr) { console.error('Stock update error:', updErr.message); continue }

        const diff = newQty - row.quantityonhand
        const { error: movErr } = await supabase.from('tblstockmovements').insert({
          movementdate:    new Date().toISOString(),
          movementtype:    'ADJUSTMENT',
          productid:       row.productid,
          fromlocationid:  diff < 0 ? row.locationid : null,
          tolocationid:    diff > 0 ? row.locationid : null,
          quantity:        Math.abs(diff),
          reference:       `Bulk check at ${row.locationcode}`,
          reason:          'Stock check',
        })
        if (movErr) console.error('Movement insert error:', movErr.message)
      }

      if (trackedChanged) {
        const { error: trackErr } = await supabase
          .from('tblproducts')
          .update({ pickingbintracked: s.tracked })
          .eq('productid', row.productid)
        if (trackErr) console.error('Tracked update error:', trackErr.message)
      }

      if (binMaxChanged(row, s)) {
        const bmVal = s.binMax.trim() === '' ? 0 : parseInt(s.binMax)
        const { error: bmErr } = await supabase
          .from('tblproducts')
          .update({ binmaxqty: bmVal })
          .eq('productid', row.productid)
        if (bmErr) console.error('Bin max update error:', bmErr.message)
      }

      savedCount++
    }

    // Stamp lastchecked on all picking bin / overflow rows
    await stampAllChecked()

    // Update local row state to reflect saved values
    setRows(prev => prev.map(r => {
      const s = rowState[r.stocklevelid]
      if (!s) return r
      const newQty = parseInt(s.newQty)
      return {
        ...r,
        quantityonhand: isNaN(newQty) ? r.quantityonhand : newQty,
        pickingbintracked: s.tracked,
        binmaxqty: s.binMax.trim() === '' ? 0 : (isNaN(parseInt(s.binMax)) ? r.binmaxqty : parseInt(s.binMax)),
      }
    }))

    setRowState(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => {
        next[Number(id)] = { ...next[Number(id)], saved: true, saving: false, changed: false }
      })
      return next
    })

    setSaveResult({ saved: savedCount, unchanged: rows.length - savedCount })
    setSaving(false)
  }

  const stampAllChecked = async () => {
    const pickingBinIds = rows
      .filter(r => r.locationtype === 'Picking Bin' || r.locationtype === 'Overflow')
      .map(r => r.stocklevelid)

    if (pickingBinIds.length === 0) return

    // Stamp in batches of 50 to avoid query length limits
    for (let i = 0; i < pickingBinIds.length; i += 50) {
      const batch = pickingBinIds.slice(i, i + 50)
      await supabase
        .from('tblstocklevels')
        .update({ lastchecked: new Date().toISOString(), lastcheckedby: 'Bulk stock check' })
        .in('stocklevelid', batch)
    }
  }

  const hasPickingBins = rows.some(r => r.locationtype === 'Picking Bin')
  const pendingChanges = rows.filter(r => {
    const s = rowState[r.stocklevelid]
    if (!s || s.saved) return false
    const newQty = parseInt(s.newQty)
    if (isNaN(newQty)) return false
    return newQty !== r.quantityonhand || s.tracked !== r.pickingbintracked || binMaxChanged(r, s)
  }).length

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Bulk Stock Check</h1>
          <p className="pf-page-subtitle">Count a range of locations and save all corrections at once</p>
        </div>
        {rows.length > 0 && (
          <div className="pf-header-actions">
            <button
              className="pf-btn-primary"
              onClick={saveAll}
              disabled={saving}
            >
              {saving ? 'Saving…' : `Save All${pendingChanges > 0 ? ` (${pendingChanges} change${pendingChanges !== 1 ? 's' : ''})` : ''}`}
            </button>
          </div>
        )}
      </div>

      <StockTabs />

      {error && (
        <div className="pf-error-banner" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12 }}>✕</button>
        </div>
      )}

      {saveResult && (
        <div className="pf-success-banner" style={{ marginBottom: 16 }}>
          {saveResult.saved > 0
            ? `${saveResult.saved} record${saveResult.saved !== 1 ? 's' : ''} updated.`
            : 'No quantity changes to save.'
          }{' '}
          All {rows.filter(r => r.locationtype === 'Picking Bin' || r.locationtype === 'Overflow').length} picking bin / overflow locations stamped as checked.
          <button onClick={() => setSaveResult(null)} style={{ marginLeft: 12 }}>✕</button>
        </div>
      )}

      <div className="pf-card" style={{ maxWidth: 640, marginBottom: 24 }}>
        <h2 className="pf-card-title">Location Range</h2>
        <div className="pf-field-row">
          <div className="pf-field">
            <label className="pf-label">From</label>
            <input
              className="pf-input pf-input-mono"
              type="text"
              placeholder="e.g. A0101"
              value={fromCode}
              onChange={(e) => setFromCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              style={{ maxWidth: 160 }}
            />
          </div>
          <div className="pf-field">
            <label className="pf-label">To</label>
            <input
              className="pf-input pf-input-mono"
              type="text"
              placeholder="e.g. Z9999"
              value={toCode}
              onChange={(e) => setToCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              style={{ maxWidth: 160 }}
            />
          </div>
          <div className="pf-field">
            <label className="pf-label">Location Type</label>
            <select
              className="pf-input pf-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'Picking Bin' | 'Overflow')}
              style={{ maxWidth: 160 }}
            >
              <option value="Picking Bin">Picking Bins only</option>
              <option value="Overflow">Overflow only</option>
              <option value="all">All types</option>
            </select>
          </div>
          <div className="pf-field" style={{ alignSelf: 'flex-end' }}>
            <button className="pf-btn-primary" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>
        </div>
        <p style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Leave the range wide (e.g. A0101 to Z9999) to load all locations of the selected type.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="pf-card">
          <h2 className="pf-card-title">
            {rows.length} record{rows.length !== 1 ? 's' : ''} loaded
            {pendingChanges > 0 && (
              <span className="pf-badge pf-badge-new" style={{ marginLeft: 12 }}>
                {pendingChanges} unsaved change{pendingChanges !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
            Enter your actual counts. Tab or Enter to move to the next row.
            {hasPickingBins && ' Tick Tracked to enable automatic stock deduction on picking. Set Bin Max for bins that cannot hold a full bag.'}
          </p>
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>SKU</th>
                  <th>Product</th>
                  <th className="pf-col-right">System Qty</th>
                  <th>Actual Count</th>
                  {hasPickingBins && <th style={{ textAlign: 'center' }}>Tracked</th>}
                  {hasPickingBins && <th style={{ textAlign: 'center' }}>Bin Max</th>}
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const s = rowState[row.stocklevelid]
                  if (!s) return null
                  const newQty = parseInt(s.newQty)
                  const qtyChanged = !isNaN(newQty) && newQty !== row.quantityonhand
                  const trackedChanged = s.tracked !== row.pickingbintracked
                  const bmChanged = binMaxChanged(row, s)
                  const isChanged = qtyChanged || trackedChanged || bmChanged
                  const prevLocation = i > 0 ? rows[i - 1].locationcode : null
                  const isNewLocation = prevLocation !== row.locationcode

                  return (
                    <tr
                      key={row.stocklevelid}
                      className="pf-row"
                      style={{
                        borderTop: isNewLocation && i > 0 ? '2px solid var(--border)' : undefined,
                        background: s.saved
                          ? 'var(--success-bg, #f0fdf4)'
                          : isChanged
                            ? 'var(--warning-bg, #fffbeb)'
                            : undefined,
                      }}
                    >
                      <td className="pf-sku">{row.locationcode}</td>
                      <td className="pf-sku">{row.sku}</td>
                      <td>{row.productname}</td>
                      <td className="pf-col-right">
                        <strong style={{ color: qtyChanged ? 'var(--text-secondary)' : undefined }}>
                          {row.quantityonhand}
                        </strong>
                      </td>
                      <td>
                        <input
                          ref={(el) => { inputRefs.current[row.stocklevelid] = el }}
                          className="pf-input pf-input-sm pf-input-num"
                          type="number"
                          min="0"
                          value={s.newQty}
                          onChange={(e) => handleQtyChange(row.stocklevelid, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => handleKeyDown(e, row.stocklevelid)}
                          disabled={s.saved}
                          style={{
                            maxWidth: 80,
                            fontWeight: qtyChanged ? 600 : undefined,
                            borderColor: qtyChanged ? 'var(--accent)' : undefined,
                          }}
                        />
                        {qtyChanged && (
                          <span style={{ marginLeft: 6, fontSize: '0.75rem', color: 'var(--accent)' }}>
                            {newQty > row.quantityonhand ? `+${newQty - row.quantityonhand}` : `${newQty - row.quantityonhand}`}
                          </span>
                        )}
                      </td>
                      {hasPickingBins && (
                        <td style={{ textAlign: 'center' }}>
                          {row.locationtype === 'Picking Bin' ? (
                            <input
                              type="checkbox"
                              checked={s.tracked}
                              onChange={(e) => handleTrackedChange(row.stocklevelid, e.target.checked)}
                              disabled={s.saved}
                              title="Picking Bin Tracked — system will deduct stock automatically on picking"
                            />
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                      )}
                      {hasPickingBins && (
                        <td style={{ textAlign: 'center' }}>
                          {row.locationtype === 'Picking Bin' ? (
                            <input
                              className="pf-input pf-input-sm pf-input-num"
                              type="number"
                              min="0"
                              value={s.binMax}
                              onChange={(e) => handleBinMaxChange(row.stocklevelid, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              disabled={s.saved}
                              title="Picking bin maximum — the most units that physically fit in this bin. When a bag is opened, the bin tops up to this number and the rest stays in overflow. 0 = no limit."
                              style={{
                                maxWidth: 70,
                                borderColor: bmChanged ? 'var(--accent)' : undefined,
                              }}
                            />
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                      )}
                      <td style={{ textAlign: 'center' }}>
                        {s.saved ? (
                          <span className="pf-success-msg">✓</span>
                        ) : isChanged ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>Pending</span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="pf-btn-primary"
              onClick={saveAll}
              disabled={saving}
            >
              {saving ? 'Saving…' : `Save All${pendingChanges > 0 ? ` (${pendingChanges} change${pendingChanges !== 1 ? 's' : ''})` : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
