'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
}

type Location = {
  locationid: number
  locationcode: string
  locationname: string
  locationtype: string
}

export default function StockMovementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [sourceCode, setSourceCode] = useState('')
  const [sourceLocation, setSourceLocation] = useState<Location | null>(null)
  const [stockRows, setStockRows] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [moves, setMoves] = useState<Record<number, { destCode: string; qty: string }>>({})
  const [saving, setSaving] = useState<number | null>(null)

  // Auto-load location from URL parameter
  useEffect(() => {
    const loc = searchParams.get('location')
    if (loc) {
      setSourceCode(loc.toUpperCase())
    }
  }, [searchParams])

  // Auto-trigger lookup when sourceCode populated from URL
  useEffect(() => {
    const loc = searchParams.get('location')
    if (loc && sourceCode === loc.toUpperCase()) {
      lookupSource()
    }
  }, [sourceCode])

  const lookupSource = async () => {
    if (!sourceCode.trim()) return
    setLoading(true)
    setError(null)
    setStockRows([])
    setMoves({})

    const { data: loc } = await supabase
      .from('tbllocations')
      .select('locationid, locationcode, locationname, locationtype')
      .eq('locationcode', sourceCode.trim().toUpperCase())
      .single()

    if (!loc) {
      setError(`Location ${sourceCode} not found`)
      setLoading(false)
      return
    }

    setSourceLocation(loc)

    const { data: stock } = await supabase
      .from('tblstocklevels')
      .select(`stocklevelid, productid, quantityonhand, locationid,
        tblproducts (sku, productname)`)
      .eq('locationid', loc.locationid)
      .gt('quantityonhand', 0)
      .order('productid')

    const rows: StockRow[] = (stock || []).map((s: any) => ({
      stocklevelid: s.stocklevelid,
      productid: s.productid,
      sku: s.tblproducts?.sku || '',
      productname: s.tblproducts?.productname || '',
      quantityonhand: s.quantityonhand,
      locationcode: loc.locationcode,
      locationid: loc.locationid,
    }))

    setStockRows(rows)

    // Initialise move state for each row
    const initMoves: Record<number, { destCode: string; qty: string }> = {}
    rows.forEach(r => { initMoves[r.stocklevelid] = { destCode: '', qty: String(r.quantityonhand) } })
    setMoves(initMoves)

    setLoading(false)
  }

  const moveStock = async (row: StockRow) => {
    const move = moves[row.stocklevelid]
    if (!move?.destCode.trim()) { setError('Enter a destination location'); return }

    const qty = parseInt(move.qty)
    if (isNaN(qty) || qty <= 0) { setError('Enter a valid quantity'); return }
    if (qty > row.quantityonhand) { setError(`Cannot move more than ${row.quantityonhand} available`); return }

    setSaving(row.stocklevelid)
    setError(null)
    setSuccess(null)

    // Look up destination location
    const { data: destLoc } = await supabase
      .from('tbllocations')
      .select('locationid, locationcode')
      .eq('locationcode', move.destCode.trim().toUpperCase())
      .single()

    if (!destLoc) {
      setError(`Destination location ${move.destCode} not found`)
      setSaving(null)
      return
    }

    // Check if destination already has this product
    const { data: existingDest } = await supabase
      .from('tblstocklevels')
      .select('stocklevelid, quantityonhand')
      .eq('productid', row.productid)
      .eq('locationid', destLoc.locationid)
      .single()

    if (existingDest) {
      // Update existing destination row
      await supabase
        .from('tblstocklevels')
        .update({ quantityonhand: existingDest.quantityonhand + qty })
        .eq('stocklevelid', existingDest.stocklevelid)
    } else {
      // Insert new destination row
      await supabase
        .from('tblstocklevels')
        .insert({
          productid: row.productid,
          locationid: destLoc.locationid,
          quantityonhand: qty,
          bagsize: 0,
          pickpriority: 0,
        })
    }

    // Deduct from source
    const newSourceQty = row.quantityonhand - qty
    await supabase
      .from('tblstocklevels')
      .update({ quantityonhand: newSourceQty })
      .eq('stocklevelid', row.stocklevelid)

    // Log stock movement
    await supabase.from('tblstockmovements').insert({
      movementdate: new Date().toISOString(),
      movementtype: 'TRANSFER',
      productid: row.productid,
      fromlocationid: row.locationid,
      tolocationid: destLoc.locationid,
      quantity: qty,
      reference: `Move from ${row.locationcode} to ${destLoc.locationcode}`,
      reason: 'Manual stock move',
    })

    setSuccess(`Moved ${qty} × ${row.sku} to ${destLoc.locationcode}`)
    setSaving(null)

    // Refresh stock rows
    const updatedRows = stockRows.map(r =>
      r.stocklevelid === row.stocklevelid
        ? { ...r, quantityonhand: newSourceQty }
        : r
    ).filter(r => r.quantityonhand > 0)

    setStockRows(updatedRows)
  }

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Move Stock</h1>
          <p className="pf-page-subtitle">Move stock from one location to another</p>
        </div>
      </div>

      <StockTabs />

      {error && (
        <div className="pf-error-banner" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12 }}>✕</button>
        </div>
      )}
      {success && (
        <div className="pf-success-banner" style={{ marginBottom: 16 }}>
          {success}
          <button onClick={() => setSuccess(null)} style={{ marginLeft: 12 }}>✕</button>
        </div>
      )}

      {/* Source location lookup */}
      <div className="pf-card" style={{ marginBottom: 24, maxWidth: 500 }}>
        <h2 className="pf-card-title">Source Location</h2>
        <div className="pf-field-row">
          <input
            className="pf-input pf-input-mono"
            type="text"
            placeholder="e.g. D03"
            value={sourceCode}
            onChange={(e) => setSourceCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && lookupSource()}
            style={{ maxWidth: 200 }}
          />
          <button className="pf-btn-primary" onClick={lookupSource} disabled={loading}>
            {loading ? 'Loading…' : 'Load Location'}
          </button>
        </div>
        {sourceLocation && (
          <p className="pf-card-note" style={{ marginTop: 8 }}>
            {sourceLocation.locationname} · {sourceLocation.locationtype} · {stockRows.length} SKU{stockRows.length !== 1 ? 's' : ''} with stock
          </p>
        )}
      </div>

      {/* Stock rows */}
      {stockRows.length > 0 && (
        <div className="pf-card">
          <h2 className="pf-card-title">Stock in {sourceLocation?.locationcode}</h2>
          <table className="pf-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th className="pf-col-right">In Location</th>
                <th>Move Qty</th>
                <th>Destination</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stockRows.map((row) => (
                <tr key={row.stocklevelid} className="pf-row">
                  <td className="pf-sku">{row.sku}</td>
                  <td>{row.productname}</td>
                  <td className="pf-col-right"><strong>{row.quantityonhand}</strong></td>
                  <td>
                    <input
                      className="pf-input pf-input-sm pf-input-num"
                      type="number"
                      min="1"
                      max={row.quantityonhand}
                      value={moves[row.stocklevelid]?.qty || ''}
                      onChange={(e) => setMoves(prev => ({
                        ...prev,
                        [row.stocklevelid]: { ...prev[row.stocklevelid], qty: e.target.value }
                      }))}
                      style={{ maxWidth: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      className="pf-input pf-input-mono pf-input-sm"
                      type="text"
                      placeholder="e.g. OV15"
                      value={moves[row.stocklevelid]?.destCode || ''}
                      onChange={(e) => setMoves(prev => ({
                        ...prev,
                        [row.stocklevelid]: { ...prev[row.stocklevelid], destCode: e.target.value.toUpperCase() }
                      }))}
                      onKeyDown={(e) => e.key === 'Enter' && moveStock(row)}
                      style={{ maxWidth: 120 }}
                    />
                  </td>
                  <td>
                    <button
                      className="pf-btn-xs pf-btn-primary"
                      onClick={() => moveStock(row)}
                      disabled={saving === row.stocklevelid}
                    >
                      {saving === row.stocklevelid ? '…' : 'Move'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sourceLocation && stockRows.length === 0 && !loading && (
        <div className="pf-card">
          <p className="pf-empty">No stock in {sourceLocation.locationcode}.</p>
        </div>
      )}
    </div>
  )
}
