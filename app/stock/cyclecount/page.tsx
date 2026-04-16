'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import StockTabs from '@/components/StockTabs'

type CycleRow = {
  stocklevelid: number
  productid: number
  locationid: number
  locationcode: string
  locationtype: string
  sku: string
  productname: string
  quantityonhand: number
  lastchecked: string | null
  manualpriority: boolean
  daysSinceCheck: number
}

type CountState = {
  stocklevelid: number
  value: string
  saving: boolean
  error: string | null
}

const formatDate = (iso: string | null) => {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB')
}

const daysSince = (iso: string | null): number => {
  if (!iso) return 9999
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

export default function CycleCountPage() {
  const [allRows, setAllRows]         = useState<CycleRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [countState, setCountState]   = useState<CountState | null>(null)

  // Filters — all client-side, no reloads
  const [checkedFilter, setCheckedFilter] = useState<'all' | 'never' | 'older'>('never')
  const [olderThanDays, setOlderThanDays] = useState('30')
  const [qtyFilter, setQtyFilter]         = useState<'all' | 'positive' | 'zero'>('positive')
  const [typeFilter, setTypeFilter]       = useState<'all' | 'Picking Bin' | 'Overflow'>('Picking Bin')
  const [priorityFilter, setPriorityFilter] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Fetch picking bin + overflow locations
    const { data: locs } = await supabase
      .from('tbllocations')
      .select('locationid, locationcode, locationtype')
      .in('locationtype', ['Picking Bin', 'Overflow'])
      .eq('isactive', true)

    if (!locs || locs.length === 0) {
      setAllRows([])
      setLoading(false)
      return
    }

    const locMap      = new Map(locs.map((l: any) => [l.locationid, l]))
    const locationIds = locs.map((l: any) => l.locationid)

    // Fetch stock levels for those locations only — much smaller than fetching all
    const { data: levels, error: slErr } = await supabase
      .from('tblstocklevels')
      .select('stocklevelid, productid, locationid, quantityonhand, lastchecked, manualpriority')
      .in('locationid', locationIds)

    if (slErr || !levels) {
      setError('Failed to load stock levels.')
      setLoading(false)
      return
    }

    // Fetch products — separate query (FK join cache issue)
    const productIds = [...new Set(levels.map((l: any) => l.productid))]
    const { data: products } = await supabase
      .from('tblproducts')
      .select('productid, sku, productname')
      .in('productid', productIds)

    const productMap = new Map((products || []).map((p: any) => [p.productid, p]))

    const result: CycleRow[] = levels.map((l: any) => {
      const loc     = locMap.get(l.locationid)
      const product = productMap.get(l.productid)
      return {
        stocklevelid:   l.stocklevelid,
        productid:      l.productid,
        locationid:     l.locationid,
        locationcode:   loc?.locationcode || '—',
        locationtype:   loc?.locationtype || '—',
        sku:            product?.sku || '—',
        productname:    product?.productname || '—',
        quantityonhand: l.quantityonhand,
        lastchecked:    l.lastchecked,
        manualpriority: l.manualpriority ?? false,
        daysSinceCheck: daysSince(l.lastchecked),
      }
    })

    result.sort((a, b) => {
      if (a.manualpriority !== b.manualpriority) return a.manualpriority ? -1 : 1
      return b.daysSinceCheck - a.daysSinceCheck
    })

    setAllRows(result)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Client-side filtering — instant, no database calls
  const displayRows = allRows.filter((r) => {
    if (typeFilter !== 'all' && r.locationtype !== typeFilter) return false
    if (priorityFilter && !r.manualpriority) return false

    if (checkedFilter === 'never' && r.lastchecked !== null) return false
    if (checkedFilter === 'older') {
      const days = parseInt(olderThanDays) || 30
      if (r.lastchecked !== null && r.daysSinceCheck <= days) return false
    }

    if (qtyFilter === 'positive' && r.quantityonhand <= 0) return false
    if (qtyFilter === 'zero' && r.quantityonhand !== 0) return false

    return true
  })

  const togglePriority = async (row: CycleRow) => {
    const newVal = !row.manualpriority
    setAllRows((prev) => prev.map((r) =>
      r.stocklevelid === row.stocklevelid ? { ...r, manualpriority: newVal } : r
    ))
    await supabase
      .from('tblstocklevels')
      .update({ manualpriority: newVal })
      .eq('stocklevelid', row.stocklevelid)
  }

  const startCount = (row: CycleRow) => {
    setCountState({ stocklevelid: row.stocklevelid, value: String(row.quantityonhand), saving: false, error: null })
  }

  const confirmCount = async (row: CycleRow) => {
    if (!countState) return
    const actual = parseInt(countState.value)
    if (isNaN(actual) || actual < 0) {
      setCountState((p) => p ? { ...p, error: 'Enter a valid quantity.' } : p)
      return
    }

    const now  = new Date().toISOString()
    const diff = actual - row.quantityonhand

    // Update UI immediately — don't wait for database
    setAllRows((prev) => prev.map((r) =>
      r.stocklevelid === row.stocklevelid
        ? { ...r, quantityonhand: actual, lastchecked: now, daysSinceCheck: 0 }
        : r
    ))
    setCountState(null)

    // Fire all database writes in parallel in the background
    const writes: Promise<any>[] = [
      supabase
        .from('tblstocklevels')
        .update({ lastchecked: now, lastcheckedby: 'Cycle count' })
        .eq('stocklevelid', row.stocklevelid),
    ]

    if (diff !== 0) {
      writes.push(
        supabase.from('tblstockmovements').insert({
          movementdate:   now,
          movementtype:   'ADJUSTMENT',
          productid:      row.productid,
          fromlocationid: diff < 0 ? row.locationid : null,
          tolocationid:   diff > 0 ? row.locationid : null,
          quantity:       Math.abs(diff),
          reference:      'Cycle count',
          reason:         'Stock count correction',
          createdby:      'Cycle count',
        }),
        supabase
          .from('tblstocklevels')
          .update({ quantityonhand: actual })
          .eq('stocklevelid', row.stocklevelid),
      )
    }

    Promise.all(writes).catch((err) => console.error('Cycle count save error:', err))
  }

  const printSheet = () => {
    const html = `<!DOCTYPE html><html>
      <head><title>Cycle Count Sheet</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:9pt;margin:15mm}
        h1{font-size:14pt;margin-bottom:4pt}
        .meta{font-size:8pt;color:#666;margin-bottom:12pt}
        table{width:100%;border-collapse:collapse}
        th{background:#2E4057;color:white;padding:5pt 6pt;text-align:left;font-size:8pt}
        td{padding:4pt 6pt;border-bottom:.5pt solid #ddd;font-size:8pt}
        tr:nth-child(even) td{background:#fafafa}
        .pri td{background:#fff8e1}
        .r{text-align:right}.m{font-family:monospace}
        .actual{width:80pt;border:1pt solid #999;min-height:14pt}
        @media print{body{margin:10mm}}
      </style></head>
      <body>
        <h1>Cycle Count Sheet</h1>
        <div class="meta">
          ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
          &nbsp;·&nbsp; ${displayRows.length} locations
        </div>
        <table>
          <thead><tr>
            <th class="m">Location</th><th>Type</th><th class="m">SKU</th>
            <th>Product</th><th class="r">System Qty</th>
            <th class="actual">Actual Count</th><th>Notes</th>
          </tr></thead>
          <tbody>
            ${displayRows.map((r) => `<tr class="${r.manualpriority?'pri':''}">
              <td class="m">${r.locationcode}</td><td>${r.locationtype}</td>
              <td class="m">${r.sku}</td><td>${r.productname}</td>
              <td class="r">${r.quantityonhand}</td>
              <td class="actual">&nbsp;</td><td>&nbsp;</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:20pt;font-size:8pt;color:#999">
          Checked by: _________________________ &nbsp;&nbsp; Date: _____________
        </div>
      </body></html>`
    const win = window.open('','_blank')
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  const totalRows    = allRows.length
  const neverChecked = allRows.filter((r) => !r.lastchecked).length
  const manualCount  = allRows.filter((r) => r.manualpriority).length

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div><h1 className="pf-page-title">Stock</h1></div>
        <div className="pf-header-actions">
          {displayRows.length > 0 && (
            <button className="pf-btn-secondary" onClick={printSheet}>Print Sheet</button>
          )}
        </div>
      </div>

      <StockTabs />

      {error && (
        <div className="pf-error-banner" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12 }}>✕</button>
        </div>
      )}

      {/* Filter bar */}
      <div className="pf-card" style={{ marginBottom: 24 }}>
        <div className="pf-field-row" style={{ flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>

          <div className="pf-field" style={{ margin: 0 }}>
            <label className="pf-label">Checked Status</label>
            <select className="pf-input pf-select" value={checkedFilter}
              onChange={(e) => setCheckedFilter(e.target.value as any)} style={{ maxWidth: 200 }}>
              <option value="all">All</option>
              <option value="never">Never checked</option>
              <option value="older">Not checked in last…</option>
            </select>
          </div>

          {checkedFilter === 'older' && (
            <div className="pf-field" style={{ margin: 0 }}>
              <label className="pf-label">Days</label>
              <input className="pf-input pf-input-num" type="number" min="1"
                value={olderThanDays}
                onChange={(e) => setOlderThanDays(e.target.value)}
                style={{ maxWidth: 80 }} />
            </div>
          )}

          <div className="pf-field" style={{ margin: 0 }}>
            <label className="pf-label">Quantity</label>
            <select className="pf-input pf-select" value={qtyFilter}
              onChange={(e) => setQtyFilter(e.target.value as any)} style={{ maxWidth: 160 }}>
              <option value="all">All quantities</option>
              <option value="positive">Greater than zero</option>
              <option value="zero">Zero only</option>
            </select>
          </div>

          <div className="pf-field" style={{ margin: 0 }}>
            <label className="pf-label">Type</label>
            <select className="pf-input pf-select" value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)} style={{ maxWidth: 180 }}>
              <option value="all">All (Bin + Overflow)</option>
              <option value="Picking Bin">Picking Bin only</option>
              <option value="Overflow">Overflow only</option>
            </select>
          </div>

          <div className="pf-field" style={{ margin: 0 }}>
            <label className="pf-checkbox-row" style={{ marginBottom: 0 }}>
              <input type="checkbox" checked={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.checked)} />
              <span style={{ fontSize: '0.875rem' }}>★ Priority only</span>
            </label>
          </div>

        </div>
      </div>

      {loading ? (
        <div className="pf-loading">Loading…</div>
      ) : (
        <>
          {/* Summary strip */}
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>{totalRows} total locations</span>
            {neverChecked > 0 && (
              <span style={{ color: 'var(--danger, #c0392b)', fontWeight: 600 }}>{neverChecked} never checked</span>
            )}
            {manualCount > 0 && (
              <span style={{ color: 'var(--warning, #f39c12)', fontWeight: 600 }}>★ {manualCount} priority</span>
            )}
            <span style={{ marginLeft: 'auto' }}>
              <strong>{displayRows.length}</strong> showing
            </span>
          </div>

          {displayRows.length === 0 ? (
            <div className="pf-card"><div className="pf-empty">No locations match the current filters.</div></div>
          ) : (
            <div className="pf-card">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Location</th><th>Type</th><th>SKU</th><th>Product</th>
                    <th className="pf-col-right">Qty</th><th>Last Checked</th>
                    <th></th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => {
                    const isCounting = countState?.stocklevelid === row.stocklevelid
                    return (
                      <tr key={row.stocklevelid} className="pf-row"
                        style={row.manualpriority ? { background: 'var(--warning-bg, #fff8e1)' } : undefined}>
                        <td className="pf-sku">{row.locationcode}</td>
                        <td className="pf-category">{row.locationtype}</td>
                        <td className="pf-sku">{row.sku}</td>
                        <td className="pf-productname">{row.productname}</td>
                        <td className="pf-col-right"><strong>{row.quantityonhand}</strong></td>
                        <td className="pf-category">
                          {row.lastchecked ? (
                            <>
                              {formatDate(row.lastchecked)}
                              {row.daysSinceCheck < 9999 && (
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: 4 }}>
                                  ({row.daysSinceCheck}d ago)
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: 'var(--danger, #c0392b)', fontWeight: 600 }}>Never</span>
                          )}
                        </td>
                        <td>
                          {isCounting ? (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <input className="pf-input pf-input-num" type="number" min="0"
                                value={countState!.value} style={{ width: 70 }} autoFocus
                                onChange={(e) => setCountState((p) => p ? { ...p, value: e.target.value } : p)} />
                              <button className="pf-btn-primary"
                                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                onClick={() => confirmCount(row)} disabled={countState!.saving}>
                                {countState!.saving ? '…' : 'Confirm'}
                              </button>
                              <button className="pf-btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                onClick={() => setCountState(null)}>Cancel</button>
                              {countState!.error && (
                                <span className="pf-error-inline" style={{ fontSize: '0.8rem' }}>{countState!.error}</span>
                              )}
                            </div>
                          ) : (
                            <button className="pf-btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              onClick={() => startCount(row)}>Count</button>
                          )}
                        </td>
                        <td>
                          <button
                            title={row.manualpriority ? 'Remove manual priority' : 'Flag as manual priority'}
                            onClick={() => togglePriority(row)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: '1.1rem', padding: '2px 6px',
                              color: row.manualpriority ? 'var(--warning, #f39c12)' : 'var(--text-secondary)' }}>
                            ★
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
