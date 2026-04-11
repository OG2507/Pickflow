'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import StockTabs from '@/components/StockTabs'

type Movement = {
  movementid: number
  movementdate: string
  movementtype: string
  productid: number | null
  sku: string | null
  productname: string | null
  fromlocationid: number | null
  fromlocationcode: string | null
  tolocationid: number | null
  tolocationcode: string | null
  quantity: number
  reference: string | null
  reason: string | null
  createdby: string | null
}

const TYPE_COLOURS: Record<string, string> = {
  'PICK':       'pf-badge-dispatched',
  'TRANSFER':   'pf-badge-printed',
  'ADJUSTMENT': 'pf-badge-invoiced',
  'RECEIPT':    'pf-badge-completed',
}

export default function StockMovementsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const productidParam = searchParams.get('productid')

  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))

  const fetchMovements = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('tblstockmovements')
      .select(`movementid, movementdate, movementtype, productid, quantity, reference, reason, createdby, fromlocationid, tolocationid`)
      .gte('movementdate', dateFrom)
      .lte('movementdate', dateTo + 'T23:59:59')
      .order('movementdate', { ascending: false })
      .limit(500)

    if (typeFilter) query = query.eq('movementtype', typeFilter)
    if (productidParam) query = (query as any).eq('productid', productidParam)

    const { data } = await query

    // Fetch product details separately
    const productIds = [...new Set((data || []).map((r: any) => r.productid).filter(Boolean))]
    const productMap = new Map<number, { sku: string; productname: string }>()
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from('tblproducts')
        .select('productid, sku, productname')
        .in('productid', productIds)
      for (const p of prods || []) productMap.set(p.productid, { sku: p.sku, productname: p.productname })
    }

    // Fetch location codes separately
    const locationIds = new Set<number>()
    for (const r of data || []) {
      if (r.fromlocationid) locationIds.add(r.fromlocationid)
      if (r.tolocationid) locationIds.add(r.tolocationid)
    }
    const locationMap = new Map<number, string>()
    if (locationIds.size > 0) {
      const { data: locs } = await supabase
        .from('tbllocations')
        .select('locationid, locationcode')
        .in('locationid', Array.from(locationIds))
      for (const l of locs || []) locationMap.set(l.locationid, l.locationcode)
    }

    let results = (data || []).map((r: any) => ({
      movementid:       r.movementid,
      movementdate:     r.movementdate,
      movementtype:     r.movementtype,
      productid:        r.productid,
      sku:              r.productid ? productMap.get(r.productid)?.sku || null : null,
      productname:      r.productid ? productMap.get(r.productid)?.productname || null : null,
      fromlocationid:   r.fromlocationid,
      fromlocationcode: r.fromlocationid ? locationMap.get(r.fromlocationid) || null : null,
      tolocationid:     r.tolocationid,
      tolocationcode:   r.tolocationid ? locationMap.get(r.tolocationid) || null : null,
      quantity:         r.quantity,
      reference:        r.reference,
      reason:           r.reason,
      createdby:        r.createdby,
    }))

    if (search.trim()) {
      const s = search.trim().toLowerCase()
      results = results.filter(m =>
        m.sku?.toLowerCase().includes(s) ||
        m.productname?.toLowerCase().includes(s) ||
        m.reference?.toLowerCase().includes(s) ||
        m.fromlocationcode?.toLowerCase().includes(s) ||
        m.tolocationcode?.toLowerCase().includes(s)
      )
    }

    setMovements(results)
    setLoading(false)
  }, [dateFrom, dateTo, typeFilter, search])

  useEffect(() => { fetchMovements() }, [fetchMovements])

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Stock Movements</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${movements.length} movement${movements.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <StockTabs />

      <div className="pf-filters">
        <input
          type="text"
          className="pf-input pf-search"
          placeholder="Search SKU, product, reference, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="pf-input pf-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="PICK">Pick</option>
          <option value="TRANSFER">Transfer</option>
          <option value="ADJUSTMENT">Adjustment</option>
          <option value="RECEIPT">Receipt</option>
        </select>
        <input type="date" className="pf-input pf-input-mono" value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)} style={{ width: 140 }} />
        <input type="date" className="pf-input pf-input-mono" value={dateTo}
          onChange={(e) => setDateTo(e.target.value)} style={{ width: 140 }} />
      </div>

      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading…</div>
        ) : movements.length === 0 ? (
          <div className="pf-empty">No movements found.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>SKU</th>
                <th>Product</th>
                <th>From</th>
                <th>To</th>
                <th className="pf-col-right">Qty</th>
                <th>Reference</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.movementid} className="pf-row"
                  onClick={() => m.productid && router.push(`/products/${m.productid}`)}
                  style={{ cursor: m.productid ? 'pointer' : 'default' }}>
                  <td className="pf-category">
                    {new Date(m.movementdate).toLocaleDateString('en-GB')}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: 4 }}>
                      {new Date(m.movementdate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td>
                    <span className={`pf-badge ${TYPE_COLOURS[m.movementtype] || ''}`}>
                      {m.movementtype}
                    </span>
                  </td>
                  <td className="pf-sku">{m.sku || '—'}</td>
                  <td className="pf-productname">{m.productname || '—'}</td>
                  <td className="pf-category">{m.fromlocationcode || '—'}</td>
                  <td className="pf-category">{m.tolocationcode || '—'}</td>
                  <td className="pf-col-right"><strong>{m.quantity}</strong></td>
                  <td className="pf-category">{m.reference || '—'}</td>
                  <td className="pf-category" style={{ fontSize: '0.8rem' }}>{m.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
