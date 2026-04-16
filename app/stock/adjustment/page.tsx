'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import StockTabs from '@/components/StockTabs'

type StockRow = {
  stocklevelid: number
  productid: number
  sku: string
  productname: string
  quantityonhand: number
  locationcode: string
  locationid: number
  locationtype: string | null
}

const REASONS = [
  'Stock check',
  'Damaged',
  'Found',
  'Lost',
  'Count correction',
  'Other',
]

export default function StockAdjustmentPage() {
  const router = useRouter()
  const [searchCode, setSearchCode] = useState('')
  const [searchType, setSearchType] = useState<'location' | 'sku'>('location')
  const [rows, setRows] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Per-row adjustment state
  const [adjustments, setAdjustments] = useState<Record<number, { newQty: string; reason: string }>>({})
  const [saving, setSaving] = useState<number | null>(null)
  const [savedRows, setSavedRows] = useState<Set<number>>(new Set())

  const search = async () => {
    if (!searchCode.trim()) return
    setLoading(true)
    setError(null)
    setRows([])
    setAdjustments({})
    setSavedRows(new Set())

    let stock: any[] = []

    if (searchType === 'location') {
      const { data: loc } = await supabase
        .from('tbllocations')
        .select('locationid, locationcode, locationtype')
        .eq('locationcode', searchCode.trim().toUpperCase())
        .single()

      if (!loc) { setError(`Location ${searchCode} not found`); setLoading(false); return }

      const { data } = await supabase
        .from('tblstocklevels')
        .select(`stocklevelid, productid, quantityonhand, locationid,
          tblproducts (sku, productname)`)
        .eq('locationid', loc.locationid)
        .order('productid')

      stock = (data || []).map((s: any) => ({
        ...s,
        locationcode: loc.locationcode,
        locationtype: loc.locationtype || null,
      }))

    } else {
      const { data: prod } = await supabase
        .from('tblproducts')
        .select('productid, sku, productname')
        .eq('sku', searchCode.trim().toUpperCase())
        .single()

      if (!prod) { setError(`SKU ${searchCode} not found`); setLoading(false); return }

      const { data } = await supabase
        .from('tblstocklevels')
        .select(`stocklevelid, productid, quantityonhand, locationid,
          tbllocations (locationcode, locationtype)`)
        .eq('productid', prod.productid)
        .order('locationid')

      stock = (data || []).map((s: any) => ({
        stocklevelid: s.stocklevelid,
        productid: prod.productid,
        quantityonhand: s.quantityonhand,
        locationid: s.locationid,
        locationcode: s.tbllocations?.locationcode || '',
        locationtype: s.tbllocations?.locationtype || null,
        tblproducts: { sku: prod.sku, productname: prod.productname },
      }))
    }

    const result: StockRow[] = stock.map((s: any) => ({
      stocklevelid:  s.stocklevelid,
      productid:     s.productid,
      sku:           s.tblproducts?.sku || '',
      productname:   s.tblproducts?.productname || '',
      quantityonhand: s.quantityonhand,
      locationcode:  s.locationcode,
      locationid:    s.locationid,
      locationtype:  s.locationtype || null,
    }))

    setRows(result)

    const initAdj: Record<number, { newQty: string; reason: string }> = {}
    result.forEach(r => { initAdj[r.stocklevelid] = { newQty: String(r.quantityonhand), reason: 'Stock check' } })
    setAdjustments(initAdj)

    setLoading(false)
  }

  const saveAdjustment = async (row: StockRow) => {
    const adj = adjustments[row.stocklevelid]
    const newQty = parseInt(adj?.newQty)
    if (isNaN(newQty) || newQty < 0) { setError('Enter a valid quantity (0 or more)'); return }
    if (newQty === row.quantityonhand) { setError('Quantity unchanged — no adjustment needed'); return }
    if (!adj.reason) { setError('Select a reason'); return }

    setSaving(row.stocklevelid)
    setError(null)

    const diff = newQty - row.quantityonhand

    // Update stock level
    await supabase
      .from('tblstocklevels')
      .update({ quantityonhand: newQty })
      .eq('stocklevelid', row.stocklevelid)

    // Log movement
    const { error: movErr } = await supabase.from('tblstockmovements').insert({
      movementdate: new Date().toISOString(),
      movementtype: 'ADJUSTMENT',
      productid: row.productid,
      fromlocationid: diff < 0 ? row.locationid : null,
      tolocationid: diff > 0 ? row.locationid : null,
      quantity: Math.abs(diff),
      reference: `Adjustment at ${row.locationcode}`,
      reason: adj.reason,
    })
    if (movErr) console.error('Movement insert error:', movErr.message)

    // Stamp lastchecked for Picking Bin locations — adjustment implies a count was done
    if (row.locationtype === 'Picking Bin') {
      await supabase
        .from('tblstocklevels')
        .update({ lastchecked: new Date().toISOString(), lastcheckedby: 'Stock adjustment' })
        .eq('stocklevelid', row.stocklevelid)
    }

    // Update local state
    setRows(prev => prev.map(r =>
      r.stocklevelid === row.stocklevelid ? { ...r, quantityonhand: newQty } : r
    ))
    setSavedRows(prev => new Set([...prev, row.stocklevelid]))
    setSaving(null)
  }

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Stock Adjustment</h1>
          <p className="pf-page-subtitle">Correct stock quantities after a count</p>
        </div>
      </div>

      <StockTabs />

      {error && (
        <div className="pf-error-banner" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12 }}>✕</button>
        </div>
      )}

      <div className="pf-card" style={{ maxWidth: 560, marginBottom: 24 }}>
        <h2 className="pf-card-title">Search</h2>
        <div className="pf-field-row">
          <div className="pf-field">
            <label className="pf-label">Search by</label>
            <select
              className="pf-input pf-select"
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as 'location' | 'sku')}
              style={{ maxWidth: 160 }}
            >
              <option value="location">Location</option>
              <option value="sku">SKU</option>
            </select>
          </div>
          <div className="pf-field">
            <label className="pf-label">{searchType === 'location' ? 'Location Code' : 'SKU'}</label>
            <input
              className="pf-input pf-input-mono"
              type="text"
              placeholder={searchType === 'location' ? 'e.g. OV01' : 'e.g. C1508'}
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              style={{ maxWidth: 200 }}
            />
          </div>
          <div className="pf-field" style={{ alignSelf: 'flex-end' }}>
            <button className="pf-btn-primary" onClick={search} disabled={loading}>
              {loading ? 'Loading…' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="pf-card">
          <h2 className="pf-card-title">{rows.length} stock record{rows.length !== 1 ? 's' : ''} found</h2>
          <table className="pf-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>SKU</th>
                <th>Product</th>
                <th className="pf-col-right">Current Qty</th>
                <th>New Qty</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.stocklevelid} className={`pf-row ${savedRows.has(row.stocklevelid) ? 'pf-row-saved' : ''}`}>
                  <td className="pf-sku">{row.locationcode}</td>
                  <td className="pf-sku">{row.sku}</td>
                  <td>{row.productname}</td>
                  <td className="pf-col-right"><strong>{row.quantityonhand}</strong></td>
                  <td>
                    <input
                      className="pf-input pf-input-sm pf-input-num"
                      type="number"
                      min="0"
                      value={adjustments[row.stocklevelid]?.newQty || ''}
                      onChange={(e) => setAdjustments(prev => ({
                        ...prev,
                        [row.stocklevelid]: { ...prev[row.stocklevelid], newQty: e.target.value }
                      }))}
                      style={{ maxWidth: 80 }}
                    />
                  </td>
                  <td>
                    <select
                      className="pf-input pf-select pf-input-sm"
                      value={adjustments[row.stocklevelid]?.reason || 'Stock check'}
                      onChange={(e) => setAdjustments(prev => ({
                        ...prev,
                        [row.stocklevelid]: { ...prev[row.stocklevelid], reason: e.target.value }
                      }))}
                      style={{ maxWidth: 160 }}
                    >
                      {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    {savedRows.has(row.stocklevelid) ? (
                      <span className="pf-success-msg">Saved</span>
                    ) : (
                      <button
                        className="pf-btn-xs pf-btn-primary"
                        onClick={() => saveAdjustment(row)}
                        disabled={saving === row.stocklevelid}
                      >
                        {saving === row.stocklevelid ? '…' : 'Save'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
