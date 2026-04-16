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
  lastcheckedby: string | null
  manualpriority: boolean
  pickcount: number
  daysSinceCheck: number
  priorityScore: number
}

type CountState = {
  stocklevelid: number
  value: string
  saving: boolean
  error: string | null
}

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB')
}

const daysSince = (iso: string | null): number => {
  if (!iso) return 9999
  const diff = Date.now() - new Date(iso).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export default function CycleCountPage() {
  const [rows, setRows] = useState<CycleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'recommended' | 'manual'>('recommended')
  const [countState, setCountState] = useState<CountState | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    // 1. Fetch all stock levels
    const { data: levels, error: lvlErr } = await supabase
      .from('tblstocklevels')
      .select('stocklevelid, productid, locationid, quantityonhand, lastchecked, lastcheckedby, manualpriority')

    if (lvlErr || !levels) {
      setError('Failed to load stock levels.')
      setLoading(false)
      return
    }

    // 2. Fetch picking bin and overflow locations only
    const { data: locs } = await supabase
      .from('tbllocations')
      .select('locationid, locationcode, locationtype')
      .in('locationtype', ['Picking Bin', 'Overflow'])
      .eq('isactive', true)

    const locMap = new Map((locs || []).map((l: any) => [l.locationid, l]))

    // Filter levels to picking bin / overflow only
    const filtered = levels.filter((l: any) => locMap.has(l.locationid))

    if (filtered.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    // 3. Fetch products — separate query to avoid FK join cache issue
    const productIds = [...new Set(filtered.map((l: any) => l.productid))]
    const { data: products } = await supabase
      .from('tblproducts')
      .select('productid, sku, productname')
      .in('productid', productIds)

    const productMap = new Map((products || []).map((p: any) => [p.productid, p]))

    // 4. Fetch pick counts per location from tblstockmovements (last 90 days)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const locationIds = filtered.map((l: any) => l.locationid)

    const { data: movements } = await supabase
      .from('tblstockmovements')
      .select('fromlocationid')
      .eq('movementtype', 'PICK')
      .in('fromlocationid', locationIds)
      .gte('movementdate', since)

    const pickCounts = new Map<number, number>()
    ;(movements || []).forEach((m: any) => {
      if (m.fromlocationid) {
        pickCounts.set(m.fromlocationid, (pickCounts.get(m.fromlocationid) || 0) + 1)
      }
    })

    // 5. Build rows with priority score
    const result: CycleRow[] = filtered.map((l: any) => {
      const loc = locMap.get(l.locationid)
      const product = productMap.get(l.productid)
      const days = daysSince(l.lastchecked)
      const picks = pickCounts.get(l.locationid) || 0
      const score = days + (picks * 2)

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
        lastcheckedby:  l.lastcheckedby,
        manualpriority: l.manualpriority ?? false,
        pickcount:      picks,
        daysSinceCheck: days,
        priorityScore:  score,
      }
    })

    // Sort: manual priority first, then priority score descending
    result.sort((a, b) => {
      if (a.manualpriority !== b.manualpriority) return a.manualpriority ? -1 : 1
      return b.priorityScore - a.priorityScore
    })

    setRows(result)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const togglePriority = async (row: CycleRow) => {
    await supabase
      .from('tblstocklevels')
      .update({ manualpriority: !row.manualpriority })
      .eq('stocklevelid', row.stocklevelid)
    await load()
  }

  const startCount = (row: CycleRow) => {
    setCountState({
      stocklevelid: row.stocklevelid,
      value: String(row.quantityonhand),
      saving: false,
      error: null,
    })
  }

  const confirmCount = async (row: CycleRow) => {
    if (!countState) return
    const actual = parseInt(countState.value)
    if (isNaN(actual) || actual < 0) {
      setCountState((p) => p ? { ...p, error: 'Enter a valid quantity.' } : p)
      return
    }

    setCountState((p) => p ? { ...p, saving: true, error: null } : p)
    const now = new Date().toISOString()
    const diff = actual - row.quantityonhand

    if (diff !== 0) {
      await supabase.from('tblstockmovements').insert({
        movementdate:    now,
        movementtype:    'ADJUSTMENT',
        productid:       row.productid,
        fromlocationid:  diff < 0 ? row.locationid : null,
        tolocationid:    diff > 0 ? row.locationid : null,
        quantity:        Math.abs(diff),
        reference:       'Cycle count',
        reason:          'Stock count correction',
        createdby:       'Cycle count',
      })

      await supabase
        .from('tblstocklevels')
        .update({ quantityonhand: actual })
        .eq('stocklevelid', row.stocklevelid)
    }

    // Always stamp lastchecked regardless of whether quantity changed
    await supabase
      .from('tblstocklevels')
      .update({ lastchecked: now, lastcheckedby: 'Cycle count' })
      .eq('stocklevelid', row.stocklevelid)

    setCountState(null)
    await load()
  }

  const printSheet = (printRows: CycleRow[]) => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cycle Count Sheet — ${new Date().toLocaleDateString('en-GB')}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 9pt; margin: 15mm; }
          h1 { font-size: 14pt; margin-bottom: 4pt; }
          .meta { font-size: 8pt; color: #666; margin-bottom: 12pt; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #2E4057; color: white; padding: 5pt 6pt; text-align: left; font-size: 8pt; }
          td { padding: 4pt 6pt; border-bottom: 0.5pt solid #ddd; font-size: 8pt; }
          tr:nth-child(even) td { background: #fafafa; }
          .priority-row td { background: #fff8e1; }
          .count-col { width: 70pt; text-align: right; }
          .actual-col { width: 80pt; border: 1pt solid #999; min-height: 14pt; }
          .sku-col { width: 80pt; font-family: monospace; }
          .loc-col { width: 70pt; font-family: monospace; }
          @media print { body { margin: 10mm; } }
        </style>
      </head>
      <body>
        <h1>Cycle Count Sheet</h1>
        <div class="meta">
          Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          &nbsp;·&nbsp; ${printRows.length} location${printRows.length !== 1 ? 's' : ''}
        </div>
        <table>
          <thead>
            <tr>
              <th class="loc-col">Location</th>
              <th>Type</th>
              <th class="sku-col">SKU</th>
              <th>Product</th>
              <th class="count-col">System Qty</th>
              <th class="actual-col">Actual Count</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${printRows.map((row) => `
              <tr class="${row.manualpriority ? 'priority-row' : ''}">
                <td class="loc-col">${row.locationcode}</td>
                <td>${row.locationtype}</td>
                <td class="sku-col">${row.sku}</td>
                <td>${row.productname}</td>
                <td class="count-col">${row.quantityonhand}</td>
                <td class="actual-col">&nbsp;</td>
                <td>&nbsp;</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:20pt;font-size:8pt;color:#999">
          Checked by: _________________________ &nbsp;&nbsp; Date: _____________
        </div>
      </body>
      </html>
    `
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
      win.print()
    }
  }

  const displayRows = rows.filter((r) => {
    if (activeTab === 'manual' && !r.manualpriority) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      return r.locationcode.toLowerCase().includes(s) ||
             r.sku.toLowerCase().includes(s) ||
             r.productname.toLowerCase().includes(s)
    }
    return true
  })

  const manualCount = rows.filter((r) => r.manualpriority).length

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Stock</h1>
        </div>
        <div className="pf-header-actions">
          {displayRows.length > 0 && (
            <button className="pf-btn-secondary" onClick={() => printSheet(displayRows)}>
              Print Sheet
            </button>
          )}
        </div>
      </div>

      <StockTabs />

      {/* Cycle count inner tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
        {[
          { key: 'recommended', label: 'Recommended' },
          { key: 'manual',      label: `Manual Priority${manualCount > 0 ? ` (${manualCount})` : ''}` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as 'recommended' | 'manual')}
            style={{
              padding: '0.5rem 1.1rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === t.key ? 600 : 400,
              color: activeTab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: activeTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
              fontSize: '0.875rem',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="pf-error-banner" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12 }}>✕</button>
        </div>
      )}

      <div className="pf-filters" style={{ marginBottom: '1rem' }}>
        <input
          className="pf-search"
          type="text"
          placeholder="Search location, SKU or product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: 12 }}>
          {displayRows.length} location{displayRows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="pf-loading">Loading…</div>
      ) : displayRows.length === 0 ? (
        <div className="pf-card">
          <div className="pf-empty">
            {activeTab === 'manual'
              ? 'No locations flagged as manual priority. Use the ★ button on the Recommended tab to flag locations.'
              : 'No locations found.'}
          </div>
        </div>
      ) : (
        <div className="pf-card">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Type</th>
                <th>SKU</th>
                <th>Product</th>
                <th className="pf-col-right">System Qty</th>
                <th>Last Checked</th>
                <th className="pf-col-right">Picks (90d)</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                const isCounting = countState?.stocklevelid === row.stocklevelid

                return (
                  <tr
                    key={row.stocklevelid}
                    className="pf-row"
                    style={row.manualpriority ? { background: 'var(--warning-bg, #fff8e1)' } : undefined}
                  >
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
                    <td className="pf-col-right pf-category">{row.pickcount}</td>
                    <td>
                      {isCounting ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            className="pf-input pf-input-num"
                            type="number"
                            min="0"
                            value={countState!.value}
                            onChange={(e) => setCountState((p) => p ? { ...p, value: e.target.value } : p)}
                            style={{ width: 70 }}
                            autoFocus
                          />
                          <button
                            className="pf-btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            onClick={() => confirmCount(row)}
                            disabled={countState!.saving}
                          >
                            {countState!.saving ? '…' : 'Confirm'}
                          </button>
                          <button
                            className="pf-btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            onClick={() => setCountState(null)}
                          >
                            Cancel
                          </button>
                          {countState!.error && (
                            <span className="pf-error-inline" style={{ fontSize: '0.8rem' }}>{countState!.error}</span>
                          )}
                        </div>
                      ) : (
                        <button
                          className="pf-btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                          onClick={() => startCount(row)}
                        >
                          Count
                        </button>
                      )}
                    </td>
                    <td>
                      <button
                        title={row.manualpriority ? 'Remove manual priority' : 'Flag as manual priority'}
                        onClick={() => togglePriority(row)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '1.1rem',
                          color: row.manualpriority ? 'var(--warning, #f39c12)' : 'var(--text-secondary)',
                          padding: '2px 6px',
                        }}
                      >
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
    </div>
  )
}
