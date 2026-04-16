'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type StockRow = {
  stocklevelid: number
  quantityonhand: number
  pickpriority: number
  bagsize: number
  locationid: number
  locationcode: string
  locationname: string | null
  locationtype: string | null
  lastchecked: string | null
}

export default function ProductStockPanel({ productid }: { productid: number }) {
  const router = useRouter()
  const [stock, setStock] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addCode, setAddCode] = useState('')
  const [addQty, setAddQty] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const [marking, setMarking] = useState<number | null>(null)

  const fetchStock = async () => {
    const { data, error } = await supabase
      .from('tblstocklevels')
      .select(`
        stocklevelid, quantityonhand, pickpriority, bagsize, locationid, lastchecked,
        tbllocations (locationid, locationcode, locationname, locationtype, isactive)
      `)
      .eq('productid', productid)
      .order('pickpriority')

    if (!error && data) {
      setStock(
        (data as any[])
          .filter((r) => r.tbllocations?.isactive)
          .map((r) => ({
            stocklevelid:   r.stocklevelid,
            quantityonhand: r.quantityonhand,
            pickpriority:   r.pickpriority,
            bagsize:        r.bagsize,
            locationid:     r.tbllocations.locationid,
            locationcode:   r.tbllocations.locationcode,
            locationname:   r.tbllocations.locationname,
            locationtype:   r.tbllocations.locationtype,
            lastchecked:    r.lastchecked,
          }))
      )
    }
    setLoading(false)
  }

  useEffect(() => { fetchStock() }, [productid])

  const addLocation = async () => {
    if (!addCode.trim()) { setAddError('Enter a location code'); return }
    setAdding(true)
    setAddError(null)

    // Look up location
    const { data: loc } = await supabase
      .from('tbllocations')
      .select('locationid, locationcode, isactive')
      .eq('locationcode', addCode.trim().toUpperCase())
      .single()

    if (!loc) { setAddError('Location not found'); setAdding(false); return }
    if (!loc.isactive) { setAddError('Location is inactive'); setAdding(false); return }

    // Check not already assigned
    const already = stock.find(s => s.locationid === loc.locationid)
    if (already) { setAddError('This location is already assigned to this product'); setAdding(false); return }

    // Determine pick priority — bin locations get 0, overflow gets next available
    const { data: locDetails } = await supabase
      .from('tbllocations')
      .select('locationtype, pickpriority')
      .eq('locationid', loc.locationid)
      .single()

    const priority = locDetails?.locationtype === 'Picking Bin' ? 0 : (locDetails?.pickpriority || 9999)
    const qty = parseInt(addQty) || 0

    const { error: insertErr } = await supabase
      .from('tblstocklevels')
      .insert({
        productid,
        locationid: loc.locationid,
        quantityonhand: qty,
        pickpriority: priority,
        bagsize: 0,
      })

    if (insertErr) {
      setAddError('Failed to add location: ' + insertErr.message)
      setAdding(false)
      return
    }

    // Log stock movement if opening qty > 0
    if (qty > 0) {
      await supabase.from('tblstockmovements').insert({
        movementdate: new Date().toISOString(),
        movementtype: 'ADJUSTMENT',
        productid,
        tolocationid: loc.locationid,
        quantity: qty,
        reason: 'Opening stock — new location added',
        createdby: 'system',
      })
    }

    setAddCode('')
    setAddQty('')
    setShowAdd(false)
    setAdding(false)
    await fetchStock()
  }

  const markChecked = async (row: StockRow) => {
    setMarking(row.stocklevelid)
    const now = new Date().toISOString()
    await supabase
      .from('tblstocklevels')
      .update({ lastchecked: now, lastcheckedby: 'Product page' })
      .eq('stocklevelid', row.stocklevelid)
    // Update local state — no full reload needed
    setStock((prev) =>
      prev.map((r) => r.stocklevelid === row.stocklevelid ? { ...r, lastchecked: now } : r)
    )
    setMarking(null)
  }

  const removeLocation = async (stocklevelid: number) => {
    setRemoving(stocklevelid)
    await supabase.from('tblstocklevels').delete().eq('stocklevelid', stocklevelid)
    setRemoving(null)
    await fetchStock()
  }

  const totalStock = stock.reduce((sum, r) => sum + r.quantityonhand, 0)

  return (
    <div className="pf-card">
      <div className="pf-panel-header">
        <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          Stock Levels
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="pf-btn-edit" onClick={() => { setShowAdd(!showAdd); setAddError(null) }}>
            {showAdd ? 'Cancel' : '+ Add Location'}
          </button>
          <button className="pf-btn-edit" onClick={() => router.push(`/stock?product=${productid}`)}>
            Go to Stock →
          </button>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '0.875rem', marginTop: '0.75rem' }} />

      {showAdd && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div className="pf-field" style={{ margin: 0 }}>
            <label className="pf-label">Location Code</label>
            <input
              className="pf-input pf-input-mono"
              style={{ width: 120 }}
              placeholder="e.g. D1205"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && addLocation()}
            />
          </div>
          <div className="pf-field" style={{ margin: 0 }}>
            <label className="pf-label">Opening Qty</label>
            <input
              className="pf-input pf-input-num"
              style={{ width: 80 }}
              type="number"
              min="0"
              placeholder="0"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLocation()}
            />
          </div>
          <div className="pf-field" style={{ margin: 0 }}>
            <label className="pf-label" style={{ opacity: 0 }}>.</label>
            <button className="pf-btn-primary" onClick={addLocation} disabled={adding}>
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          {addError && <span className="pf-error-inline" style={{ alignSelf: 'flex-end', paddingBottom: '0.25rem' }}>{addError}</span>}
        </div>
      )}

      {loading ? (
        <div className="pf-stock-loading">Loading…</div>
      ) : stock.length === 0 ? (
        <div className="pf-stock-empty">No stock locations assigned.</div>
      ) : (
        <>
          <table className="pf-inner-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Type</th>
                <th className="pf-col-right">Qty</th>
                <th className="pf-col-right">Bags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => (
                <tr key={row.stocklevelid}>
                  <td className="pf-sku">
                    <span
                      style={{ cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline' }}
                      onClick={() => router.push(`/stock/move?location=${row.locationcode}`)}
                      title="Move stock from this location"
                    >
                      {row.locationcode}
                    </span>
                    {row.locationname && (
                      <span className="pf-location-name"> {row.locationname}</span>
                    )}
                  </td>
                  <td className="pf-category">{row.locationtype || '—'}</td>
                  <td className="pf-col-right">
                    {row.quantityonhand === 0
                      ? <span className="pf-category" style={{ color: 'var(--text-faint)' }}>0</span>
                      : row.quantityonhand
                    }
                  </td>
                  <td className="pf-col-right pf-category">
                    {row.bagsize > 0
                      ? Math.floor(row.quantityonhand / row.bagsize)
                      : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                      {row.lastchecked ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          ✓ {new Date(row.lastchecked).toLocaleDateString('en-GB')}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--danger, #c0392b)' }}>Never checked</span>
                      )}
                      <button
                        className="pf-btn-secondary"
                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', whiteSpace: 'nowrap' }}
                        disabled={marking === row.stocklevelid}
                        onClick={() => markChecked(row)}
                      >
                        {marking === row.stocklevelid ? '…' : 'Mark Checked'}
                      </button>
                      {row.quantityonhand === 0 && (
                        <button
                          className="pf-btn-deactivate"
                          style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
                          disabled={removing === row.stocklevelid}
                          onClick={() => removeLocation(row.stocklevelid)}
                        >
                          {removing === row.stocklevelid ? '…' : '✕'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pf-stock-total">
            <span>Total stock</span>
            <span>{totalStock} units across {stock.filter(r => r.quantityonhand > 0).length} location{stock.filter(r => r.quantityonhand > 0).length !== 1 ? 's' : ''}</span>
          </div>
        </>
      )}
    </div>
  )
}
