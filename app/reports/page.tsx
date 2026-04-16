'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type DateRange = { from: string; to: string }
type Tab = 'bestsellers' | 'trends' | 'clients' | 'product' | 'slowsellers' | 'seasonal' | 'frequency' | 'reorder'

const PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Last 12 months', days: 365 },
  { label: 'All time', days: 0 },
]

const toDate = (d: Date) => d.toISOString().slice(0, 10)

function getPresetRange(days: number): DateRange {
  const to = new Date()
  const from = new Date()
  if (days === 0) {
    from.setFullYear(2000)
  } else {
    from.setDate(from.getDate() - days)
  }
  return { from: toDate(from), to: toDate(to) }
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('bestsellers')
  const [range, setRange] = useState<DateRange>(getPresetRange(365))
  const [activePreset, setActivePreset] = useState(2)

  const setPreset = (idx: number) => {
    setActivePreset(idx)
    setRange(getPresetRange(PRESETS[idx].days))
  }

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Reports</h1>
          <p className="pf-page-subtitle">Sales analysis and performance</p>
        </div>
      </div>

      {/* Date range controls */}
      <div className="pf-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span className="pf-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Period:</span>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {PRESETS.map((p, i) => (
              <button
                key={p.label}
                className={activePreset === i ? 'pf-btn-primary' : 'pf-btn-secondary'}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
                onClick={() => setPreset(i)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
            <input
              type="date"
              className="pf-input pf-input-mono"
              style={{ width: 140 }}
              value={range.from}
              onChange={(e) => { setRange(r => ({ ...r, from: e.target.value })); setActivePreset(-1) }}
            />
            <span className="pf-label" style={{ margin: 0 }}>to</span>
            <input
              type="date"
              className="pf-input pf-input-mono"
              style={{ width: 140 }}
              value={range.to}
              onChange={(e) => { setRange(r => ({ ...r, to: e.target.value })); setActivePreset(-1) }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: '1.5rem' }}>
        {[
          { key: 'bestsellers', label: 'Best Sellers' },
          { key: 'trends', label: 'Monthly Trends' },
          { key: 'clients', label: 'Client Sales' },
          { key: 'product', label: 'Product History' },
          { key: 'slowsellers', label: 'Slow Sellers' },
          { key: 'seasonal', label: 'Seasonal' },
          { key: 'frequency', label: 'Client Frequency' },
          { key: 'reorder', label: 'Reorder Levels' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            style={{
              padding: '0.6rem 1.25rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-2px',
              fontSize: '0.9rem',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'bestsellers' && <BestSellers range={range} />}
      {tab === 'trends' && <MonthlyTrends range={range} />}
      {tab === 'clients' && <ClientSales range={range} />}
      {tab === 'product' && <ProductHistory range={range} />}
      {tab === 'slowsellers' && <SlowSellers range={range} />}
      {tab === 'seasonal' && <SeasonalAnalysis range={range} />}
      {tab === 'frequency' && <ClientFrequency />}
      {tab === 'reorder' && <ReorderLevels />}
    </div>
  )
}

// ── Best Sellers ─────────────────────────────────────────────────
function BestSellers({ range }: { range: DateRange }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'units' | 'orders'>('units')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: lines } = await supabase
      .from('tblorderlines')
      .select(`sku, productname, quantityordered,
        tblorders!inner (orderdate, status)`)
      .gte('tblorders.orderdate', range.from)
      .lte('tblorders.orderdate', range.to + 'T23:59:59')
      .eq('tblorders.status', 'Completed')
      .limit(10000)

    const map = new Map<string, { sku: string; productname: string; units: number; orders: number }>()
    for (const line of lines || []) {
      const key = line.sku
      const ex = map.get(key) || { sku: line.sku, productname: line.productname, units: 0, orders: 0 }
      ex.units += line.quantityordered
      ex.orders += 1
      map.set(key, ex)
    }

    const sorted = Array.from(map.values())
      .sort((a, b) => sortBy === 'units' ? b.units - a.units : b.orders - a.orders)
      .slice(0, 50)

    setData(sorted)
    setLoading(false)
  }, [range, sortBy])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="pf-loading">Loading…</div>

  return (
    <div className="pf-card">
      <div className="pf-panel-header">
        <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          Top 50 Products
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={sortBy === 'units' ? 'pf-btn-primary' : 'pf-btn-secondary'}
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
            onClick={() => setSortBy('units')}>By Units</button>
          <button className={sortBy === 'orders' ? 'pf-btn-primary' : 'pf-btn-secondary'}
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
            onClick={() => setSortBy('orders')}>By Orders</button>
        </div>
      </div>
      <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />
      {data.length === 0 ? <div className="pf-empty">No data for this period.</div> : (
        <table className="pf-inner-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>SKU</th>
              <th>Product</th>
              <th className="pf-col-right">Units Sold</th>
              <th className="pf-col-right">Order Lines</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.sku} className="pf-row">
                <td className="pf-category" style={{ color: i < 3 ? 'var(--accent)' : undefined, fontWeight: i < 3 ? 700 : undefined }}>{i + 1}</td>
                <td className="pf-sku">{row.sku}</td>
                <td className="pf-productname">{row.productname}</td>
                <td className="pf-col-right"><strong>{row.units.toLocaleString()}</strong></td>
                <td className="pf-col-right pf-category">{row.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Monthly Trends ───────────────────────────────────────────────
function MonthlyTrends({ range }: { range: DateRange }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: lines } = await supabase
      .from('tblorderlines')
      .select(`quantityordered, tblorders!inner (orderdate, status)`)
      .gte('tblorders.orderdate', range.from)
      .lte('tblorders.orderdate', range.to + 'T23:59:59')
      .eq('tblorders.status', 'Completed')
      .limit(10000)

    const map = new Map<string, number>()
    for (const line of lines || []) {
      const order = (line as any).tblorders
      const month = order.orderdate.slice(0, 7)
      map.set(month, (map.get(month) || 0) + line.quantityordered)
    }

    const sorted = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, units]) => ({ month, units }))

    setData(sorted)
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="pf-loading">Loading…</div>

  const maxUnits = Math.max(...data.map(d => d.units), 1)

  return (
    <div className="pf-card">
      <h2 className="pf-card-title">Units Sold by Month</h2>
      {data.length === 0 ? <div className="pf-empty">No data for this period.</div> : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 180, marginBottom: '1.5rem', padding: '0 0.25rem' }}>
            {data.map((d) => {
              const height = Math.max((d.units / maxUnits) * 155, 4)
              const [year, month] = d.month.split('-')
              const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('en-GB', { month: 'short' })
              return (
                <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', lineHeight: 1 }}>{d.units.toLocaleString()}</span>
                  <div style={{ width: '100%', height, background: 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: 0.8 }} />
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)' }}>{year.slice(2)}</span>
                </div>
              )
            })}
          </div>
          <table className="pf-inner-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="pf-col-right">Units Sold</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => {
                const [year, month] = d.month.split('-')
                const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
                return (
                  <tr key={d.month} className="pf-row">
                    <td className="pf-productname">{label}</td>
                    <td className="pf-col-right"><strong>{d.units.toLocaleString()}</strong></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

// ── Client Sales ─────────────────────────────────────────────────
function ClientSales({ range }: { range: DateRange }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: orders } = await supabase
      .from('tblorders')
      .select(`orderid, clientid, shiptoname,
        tblclients (companyname, firstname, lastname),
        tblorderlines (quantityordered)`)
      .gte('orderdate', range.from)
      .lte('orderdate', range.to + 'T23:59:59')
      .eq('status', 'Completed')
      .limit(10000)

    const map = new Map<number, { clientid: number; name: string; orders: number; units: number }>()
    for (const order of orders || []) {
      const client = (order as any).tblclients
      const name = client?.companyname ||
        [client?.firstname, client?.lastname].filter(Boolean).join(' ') ||
        order.shiptoname || '—'
      const units = ((order as any).tblorderlines || []).reduce((s: number, l: any) => s + l.quantityordered, 0)
      const ex = map.get(order.clientid) || { clientid: order.clientid, name, orders: 0, units: 0 }
      ex.orders += 1
      ex.units += units
      map.set(order.clientid, ex)
    }

    setData(Array.from(map.values()).sort((a, b) => b.units - a.units))
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="pf-loading">Loading…</div>

  return (
    <div className="pf-card">
      <h2 className="pf-card-title">Sales by Client</h2>
      {data.length === 0 ? <div className="pf-empty">No data for this period.</div> : (
        <table className="pf-inner-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Client</th>
              <th className="pf-col-right">Orders</th>
              <th className="pf-col-right">Units</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.clientid} className="pf-row">
                <td className="pf-category">{i + 1}</td>
                <td className="pf-productname">{row.name}</td>
                <td className="pf-col-right pf-category">{row.orders}</td>
                <td className="pf-col-right"><strong>{row.units.toLocaleString()}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Product History ──────────────────────────────────────────────
function ProductHistory({ range }: { range: DateRange }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [selected, setSelected] = useState<{ sku: string; productname: string } | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const searchProducts = async (term: string) => {
    if (term.length < 2) { setResults([]); return }
    const { data } = await supabase
      .from('tblproducts')
      .select('sku, productname')
      .or(`sku.ilike.%${term}%,productname.ilike.%${term}%`)
      .eq('isactive', true)
      .limit(10)
    setResults(data || [])
  }

  const loadHistory = useCallback(async (sku: string) => {
    setLoading(true)
    const { data: lines } = await supabase
      .from('tblorderlines')
      .select(`quantityordered,
        tblorders!inner (orderdate, status, shiptoname,
          tblclients (companyname, firstname, lastname))`)
      .eq('sku', sku)
      .gte('tblorders.orderdate', range.from)
      .lte('tblorders.orderdate', range.to + 'T23:59:59')
      .eq('tblorders.status', 'Completed')
      .limit(10000)

    // Sort by date descending
    const sorted = (lines || []).sort((a: any, b: any) =>
      b.tblorders.orderdate.localeCompare(a.tblorders.orderdate))

    setHistory(sorted)
    setLoading(false)
  }, [range])

  useEffect(() => {
    if (selected) loadHistory(selected.sku)
  }, [selected, loadHistory])

  const totalUnits = history.reduce((s, l) => s + l.quantityordered, 0)

  return (
    <div>
      <div className="pf-card" style={{ marginBottom: '1rem' }}>
        <h2 className="pf-card-title">Search Product</h2>
        <div style={{ position: 'relative' }}>
          <input
            className="pf-input"
            placeholder="Search by SKU or product name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); searchProducts(e.target.value) }}
          />
          {results.length > 0 && (
            <div className="pf-client-dropdown">
              {results.map((p) => (
                <div key={p.sku} className="pf-client-dropdown-item"
                  onClick={() => { setSelected(p); setSearch(p.productname); setResults([]) }}>
                  <span className="pf-sku">{p.sku}</span>
                  <span className="pf-client-dropdown-name"> {p.productname}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="pf-card">
          <div className="pf-panel-header">
            <div>
              <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
                {selected.productname}
              </h2>
              <span className="pf-sku" style={{ fontSize: '0.85rem' }}>{selected.sku}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>{totalUnits.toLocaleString()}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>units sold in period</div>
            </div>
          </div>
          <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />
          {loading ? <div className="pf-loading">Loading…</div> : history.length === 0 ? (
            <div className="pf-empty">No sales for this product in the selected period.</div>
          ) : (
            <table className="pf-inner-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client</th>
                  <th className="pf-col-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {history.map((line: any, i) => {
                  const order = line.tblorders
                  const client = order?.tblclients
                  const clientName = client?.companyname ||
                    [client?.firstname, client?.lastname].filter(Boolean).join(' ') ||
                    order?.shiptoname || '—'
                  return (
                    <tr key={i} className="pf-row">
                      <td className="pf-category">
                        {order?.orderdate ? new Date(order.orderdate).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="pf-productname">{clientName}</td>
                      <td className="pf-col-right"><strong>{line.quantityordered}</strong></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ── Slow Sellers ─────────────────────────────────────────────────
function SlowSellers({ range }: { range: DateRange }) {
  const [view, setView] = useState<'lowest' | 'unsold'>('lowest')
  const [lowest, setLowest] = useState<any[]>([])
  const [unsold, setUnsold] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    // Fetch all active products
    const { data: products } = await supabase
      .from('tblproducts')
      .select('sku, productname')
      .eq('isactive', true)
      .eq('isdiscontinued', false)
      .limit(10000)

    // Fetch all sales in period
    const { data: lines } = await supabase
      .from('tblorderlines')
      .select(`sku, quantityordered, tblorders!inner (orderdate, status)`)
      .gte('tblorders.orderdate', range.from)
      .lte('tblorders.orderdate', range.to + 'T23:59:59')
      .eq('tblorders.status', 'Completed')
      .limit(10000)

    // Build sales map
    const salesMap = new Map<string, number>()
    for (const line of lines || []) {
      salesMap.set(line.sku, (salesMap.get(line.sku) || 0) + line.quantityordered)
    }

    // Fetch last sale date for each product
    const { data: allLines } = await supabase
      .from('tblorderlines')
      .select(`sku, tblorders!inner (orderdate, status)`)
      .eq('tblorders.status', 'Completed')
      .limit(10000)

    const lastSaleMap = new Map<string, string>()
    for (const line of allLines || []) {
      const order = (line as any).tblorders
      const existing = lastSaleMap.get(line.sku)
      if (!existing || order.orderdate > existing) {
        lastSaleMap.set(line.sku, order.orderdate)
      }
    }

    const productList = products || []

    // Lowest sellers — products with at least 1 sale, sorted ascending
    const withSales = productList
      .filter(p => salesMap.has(p.sku))
      .map(p => ({ ...p, units: salesMap.get(p.sku) || 0, lastSale: lastSaleMap.get(p.sku) || null }))
      .sort((a, b) => a.units - b.units)
      .slice(0, 50)

    // Unsold — active products with zero sales in period
    const noSales = productList
      .filter(p => !salesMap.has(p.sku))
      .map(p => ({ ...p, units: 0, lastSale: lastSaleMap.get(p.sku) || null }))
      .sort((a, b) => {
        // Sort by last sale date ascending (oldest first), nulls last
        if (!a.lastSale && !b.lastSale) return a.productname.localeCompare(b.productname)
        if (!a.lastSale) return 1
        if (!b.lastSale) return -1
        return a.lastSale.localeCompare(b.lastSale)
      })

    setLowest(withSales)
    setUnsold(noSales)
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  const formatLastSale = (date: string | null) => {
    if (!date) return 'Never'
    const d = new Date(date)
    const days = Math.floor((Date.now() - d.getTime()) / 86400000)
    if (days < 30) return `${days}d ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}yr ago`
  }

  if (loading) return <div className="pf-loading">Loading…</div>

  return (
    <div className="pf-card">
      <div className="pf-panel-header">
        <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          {view === 'lowest' ? `Lowest 50 Sellers in Period (${lowest.length})` : `Not Sold in Period (${unsold.length})`}
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={view === 'lowest' ? 'pf-btn-primary' : 'pf-btn-secondary'}
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
            onClick={() => setView('lowest')}>Lowest Sellers</button>
          <button className={view === 'unsold' ? 'pf-btn-primary' : 'pf-btn-secondary'}
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
            onClick={() => setView('unsold')}>Not Sold</button>
        </div>
      </div>
      <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />

      {view === 'lowest' && (
        lowest.length === 0 ? <div className="pf-empty">No sales data for this period.</div> : (
          <table className="pf-inner-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th className="pf-col-right">Units in Period</th>
                <th className="pf-col-right">Last Sale</th>
              </tr>
            </thead>
            <tbody>
              {lowest.map((row) => (
                <tr key={row.sku} className="pf-row">
                  <td className="pf-sku">{row.sku}</td>
                  <td className="pf-productname">{row.productname}</td>
                  <td className="pf-col-right pf-category">{row.units}</td>
                  <td className="pf-col-right pf-category">{formatLastSale(row.lastSale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {view === 'unsold' && (
        unsold.length === 0 ? <div className="pf-empty">All active products have sold in this period.</div> : (
          <table className="pf-inner-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th className="pf-col-right">Last Sale</th>
              </tr>
            </thead>
            <tbody>
              {unsold.map((row) => (
                <tr key={row.sku} className="pf-row">
                  <td className="pf-sku">{row.sku}</td>
                  <td className="pf-productname">{row.productname}</td>
                  <td className="pf-col-right pf-category" style={{ color: !row.lastSale ? 'var(--error)' : undefined }}>
                    {formatLastSale(row.lastSale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

// ── Seasonal Analysis ────────────────────────────────────────────
function SeasonalAnalysis({ range }: { range: DateRange }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [selected, setSelected] = useState<{ sku: string; productname: string } | null>(null)

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const load = useCallback(async () => {
    setLoading(true)
    const { data: lines } = await supabase
      .from('tblorderlines')
      .select(`sku, productname, quantityordered, tblorders!inner (orderdate, status)`)
      .gte('tblorders.orderdate', range.from)
      .lte('tblorders.orderdate', range.to + 'T23:59:59')
      .eq('tblorders.status', 'Completed')
      .limit(10000)

    // Group by SKU and month
    const map = new Map<string, { sku: string; productname: string; months: number[] }>()
    for (const line of lines || []) {
      const order = (line as any).tblorders
      const month = new Date(order.orderdate).getMonth() // 0-11
      const key = line.sku
      const ex = map.get(key) || { sku: line.sku, productname: line.productname, months: new Array(12).fill(0) }
      ex.months[month] += line.quantityordered
      map.set(key, ex)
    }

    const sorted = Array.from(map.values())
      .map(p => ({ ...p, total: p.months.reduce((s, v) => s + v, 0) }))
      .sort((a, b) => b.total - a.total)

    setData(sorted)
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  const searchProducts = (term: string) => {
    setSearch(term)
    if (term.length < 2) { setResults([]); return }
    const s = term.toLowerCase()
    setResults(data.filter(p => p.sku.toLowerCase().includes(s) || p.productname.toLowerCase().includes(s)).slice(0, 10))
  }

  const displayData = selected
    ? data.filter(p => p.sku === selected.sku)
    : data.slice(0, 30)

  const maxVal = Math.max(...displayData.flatMap(p => p.months), 1)

  if (loading) return <div className="pf-loading">Loading…</div>

  return (
    <div className="pf-card">
      <div className="pf-panel-header">
        <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          {selected ? `${selected.productname} — Monthly Breakdown` : 'Top 30 Products by Month'}
        </h2>
        {selected && (
          <button className="pf-btn-secondary" style={{ fontSize: '0.8rem' }}
            onClick={() => { setSelected(null); setSearch('') }}>
            Show All
          </button>
        )}
      </div>
      <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1rem', maxWidth: 300 }}>
        <input className="pf-input" placeholder="Search product…"
          value={search} onChange={(e) => searchProducts(e.target.value)} />
        {results.length > 0 && (
          <div className="pf-client-dropdown">
            {results.map(p => (
              <div key={p.sku} className="pf-client-dropdown-item"
                onClick={() => { setSelected(p); setSearch(p.productname); setResults([]) }}>
                <span className="pf-sku">{p.sku}</span>
                <span className="pf-client-dropdown-name"> {p.productname}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {displayData.length === 0 ? <div className="pf-empty">No data for this period.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="pf-inner-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 80 }}>SKU</th>
                <th>Product</th>
                {MONTHS.map(m => <th key={m} className="pf-col-right" style={{ minWidth: 40 }}>{m}</th>)}
                <th className="pf-col-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((row) => (
                <tr key={row.sku} className="pf-row">
                  <td className="pf-sku">{row.sku}</td>
                  <td className="pf-productname" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.productname}</td>
                  {row.months.map((v: number, i: number) => {
                    const intensity = maxVal > 0 ? v / maxVal : 0
                    return (
                      <td key={i} className="pf-col-right" style={{
                        background: v > 0 ? `rgba(var(--accent-rgb, 59,130,246), ${0.1 + intensity * 0.6})` : undefined,
                        fontWeight: v > 0 ? 600 : undefined,
                        color: v > 0 ? (intensity > 0.6 ? '#fff' : undefined) : 'var(--text-faint)',
                        fontSize: '0.8rem',
                      }}>
                        {v > 0 ? v : '—'}
                      </td>
                    )
                  })}
                  <td className="pf-col-right"><strong>{row.total}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Client Frequency ─────────────────────────────────────────────
function ClientFrequency() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'quiet' | 'silent'>('all')

  const load = useCallback(async () => {
    setLoading(true)

    const { data: orders } = await supabase
      .from('tblorders')
      .select(`clientid, orderdate, tblclients (companyname, firstname, lastname, iswholesale)`)
      .eq('status', 'Completed')
      .limit(10000)

    const map = new Map<number, {
      clientid: number
      name: string
      iswholesale: boolean
      orderCount: number
      lastOrder: string
      firstOrder: string
    }>()

    for (const order of orders || []) {
      const client = (order as any).tblclients
      const name = client?.companyname ||
        [client?.firstname, client?.lastname].filter(Boolean).join(' ') || '—'
      const ex = map.get(order.clientid) || {
        clientid: order.clientid, name, iswholesale: client?.iswholesale || false,
        orderCount: 0, lastOrder: order.orderdate, firstOrder: order.orderdate,
      }
      ex.orderCount += 1
      if (order.orderdate > ex.lastOrder) ex.lastOrder = order.orderdate
      if (order.orderdate < ex.firstOrder) ex.firstOrder = order.orderdate
      map.set(order.clientid, ex)
    }

    const now = Date.now()
    const result = Array.from(map.values()).map(c => ({
      ...c,
      daysSinceLastOrder: Math.floor((now - new Date(c.lastOrder).getTime()) / 86400000),
    })).sort((a, b) => a.daysSinceLastOrder - b.daysSinceLastOrder)

    setData(result)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const getStatus = (days: number) => {
    if (days <= 30) return { label: 'Active', colour: 'pf-badge-completed' }
    if (days <= 90) return { label: 'Recent', colour: 'pf-badge-printed' }
    if (days <= 180) return { label: 'Quiet', colour: 'pf-badge-invoiced' }
    return { label: 'Silent', colour: 'pf-badge-cancelled' }
  }

  const filtered = data.filter(c => {
    if (filter === 'all') return true
    if (filter === 'active') return c.daysSinceLastOrder <= 30
    if (filter === 'quiet') return c.daysSinceLastOrder > 90 && c.daysSinceLastOrder <= 180
    if (filter === 'silent') return c.daysSinceLastOrder > 180
    return true
  })

  const counts = {
    active: data.filter(c => c.daysSinceLastOrder <= 30).length,
    quiet: data.filter(c => c.daysSinceLastOrder > 90 && c.daysSinceLastOrder <= 180).length,
    silent: data.filter(c => c.daysSinceLastOrder > 180).length,
  }

  if (loading) return <div className="pf-loading">Loading…</div>

  return (
    <div className="pf-card">
      <div className="pf-panel-header">
        <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          Client Order Frequency
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { key: 'all', label: `All (${data.length})` },
            { key: 'active', label: `Active (${counts.active})` },
            { key: 'quiet', label: `Quiet (${counts.quiet})` },
            { key: 'silent', label: `Silent (${counts.silent})` },
          ].map(f => (
            <button key={f.key}
              className={filter === f.key ? 'pf-btn-primary' : 'pf-btn-secondary'}
              style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
              onClick={() => setFilter(f.key as any)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />
      <p className="pf-card-note" style={{ marginBottom: '1rem' }}>
        Active = ordered in last 30 days · Recent = 31–90 days · Quiet = 91–180 days · Silent = 180+ days
      </p>

      {filtered.length === 0 ? <div className="pf-empty">No clients in this category.</div> : (
        <table className="pf-inner-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Type</th>
              <th className="pf-col-right">Orders</th>
              <th className="pf-col-right">Last Order</th>
              <th className="pf-col-right">Days Ago</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const status = getStatus(c.daysSinceLastOrder)
              return (
                <tr key={c.clientid} className="pf-row">
                  <td className="pf-productname">{c.name}</td>
                  <td className="pf-category">{c.iswholesale ? 'Wholesale' : 'Website'}</td>
                  <td className="pf-col-right pf-category">{c.orderCount}</td>
                  <td className="pf-col-right pf-category">
                    {new Date(c.lastOrder).toLocaleDateString('en-GB')}
                  </td>
                  <td className="pf-col-right pf-category">{c.daysSinceLastOrder}</td>
                  <td><span className={`pf-badge ${status.colour}`}>{status.label}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Reorder Levels ───────────────────────────────────────────────
// Export: SKU, name, current stock, reorder level, reorder qty, sales at 1/3/6/12/24 months, avg monthly, suggestions, flag
// Upload: SKU + reorder level + reorder qty only. Preview before commit.

// Rounding helper — round up to sensible pack sizes
function roundUpToPack(n: number): number {
  if (n <= 0) return 0
  if (n < 5) return Math.max(5, Math.ceil(n))   // don't recommend tiny numbers
  if (n < 20) return Math.ceil(n / 5) * 5
  if (n < 100) return Math.ceil(n / 10) * 10
  return Math.ceil(n / 25) * 25
}

type ReorderRow = {
  productid: number
  sku: string
  productname: string
  currentstock: number
  reorderlevel: number
  reorderqty: number
  sales1m: number
  sales3m: number
  sales6m: number
  sales12m: number
  sales24m: number
  avgMonthly: number
  suggestedLevel: number
  suggestedQty: number
  flag: string      // '', 'New', 'Slow', 'Seasonal', 'Dead', 'Spiky'
}

type UploadRow = {
  sku: string
  reorderlevel: number | null
  reorderqty: number | null
  currentLevel: number | null
  currentQty: number | null
  productid: number | null
  status: 'ok' | 'no-change' | 'not-found' | 'invalid'
  error?: string
}

function ReorderLevels() {
  const [data, setData] = useState<ReorderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadPreview, setUploadPreview] = useState<UploadRow[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)

    // 1. All active products
    const { data: products, error: pErr } = await supabase
      .from('tblproducts')
      .select('productid, sku, productname, reorderlevel, reorderqty, isactive, isdiscontinued')
      .eq('isactive', true)
      .order('sku')
      .limit(10000)

    if (pErr) {
      console.error(pErr)
      setMessage('Failed to load products')
      setLoading(false)
      return
    }

    const productList = (products || []).filter((p: any) => !p.isdiscontinued)

    // 2. All stock levels — sum per product
    const { data: stockRows } = await supabase
      .from('tblstocklevels')
      .select('productid, quantityonhand')
      .limit(10000)

    const stockMap = new Map<number, number>()
    for (const r of stockRows || []) {
      stockMap.set(r.productid, (stockMap.get(r.productid) || 0) + (r.quantityonhand || 0))
    }

    // 3. All dispatched order lines in last 24 months
    //    Excluding cancelled orders. Using quantitypicked when present, fallback to quantityordered.
    const now = new Date()
    const from24 = new Date(now)
    from24.setMonth(from24.getMonth() - 24)
    const from12 = new Date(now); from12.setMonth(from12.getMonth() - 12)
    const from6  = new Date(now); from6.setMonth(from6.getMonth() - 6)
    const from3  = new Date(now); from3.setMonth(from3.getMonth() - 3)
    const from1  = new Date(now); from1.setMonth(from1.getMonth() - 1)

    // 3. Fetch in two steps to avoid pagination issues with joined filters.
    //    Step A: get all Completed order IDs in the last 24 months.
    //    Step B: fetch order lines for those order IDs.
    //    This matches the pattern used elsewhere in the codebase for FK workarounds.
    const PAGE_SIZE = 1000

    // Step A — paginate orders
    const orderDateMap = new Map<number, string>()
    {
      let page = 0
      while (true) {
        const { data: batch, error } = await supabase
          .from('tblorders')
          .select('orderid, orderdate')
          .eq('status', 'Completed')
          .gte('orderdate', from24.toISOString())
          .order('orderid', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (error) {
          console.error('[Reorder Report] Orders fetch error:', error)
          setMessage('Failed to load orders')
          setLoading(false)
          return
        }
        if (!batch || batch.length === 0) break
        for (const o of batch) orderDateMap.set(o.orderid, o.orderdate)
        if (batch.length < PAGE_SIZE) break
        page++
        if (orderDateMap.size >= 50000) break
      }
    }

    // Step B — fetch order lines in chunks of order IDs (avoid URL length limits)
    const orderIds = Array.from(orderDateMap.keys())
    const allLines: Array<{ sku: string; quantityordered: number; quantitypicked: number | null; orderid: number }> = []
    const CHUNK = 500
    for (let i = 0; i < orderIds.length; i += CHUNK) {
      const ids = orderIds.slice(i, i + CHUNK)
      let page = 0
      while (true) {
        const { data: batch, error } = await supabase
          .from('tblorderlines')
          .select('sku, quantityordered, quantitypicked, orderid')
          .in('orderid', ids)
          .order('orderlineid', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (error) {
          console.error('[Reorder Report] Lines fetch error:', error)
          setMessage('Failed to load order lines')
          setLoading(false)
          return
        }
        if (!batch || batch.length === 0) break
        allLines.push(...batch as any)
        if (batch.length < PAGE_SIZE) break
        page++
      }
    }

    // 4. Aggregate sales per SKU across the five windows
    //    Also track: monthly buckets for variance calculation, and earliest sale date for New detection.
    //    Match on SKU (not productid) because historical imports may lack productid.
    //    Matches the logic on the product detail page.
    type SalesAgg = {
      s1: number; s3: number; s6: number; s12: number; s24: number
      monthly: Map<string, number>   // 'YYYY-MM' -> qty (last 12 months only, for variance)
      earliest: number | null        // timestamp of earliest sale
    }
    const salesMap = new Map<string, SalesAgg>()

    for (const line of allLines) {
      const sku = (line.sku || '').trim()
      if (!sku) continue
      // Use quantitypicked only if > 0 (historical lines have quantitypicked = 0 meaning "not recorded")
      // Fall back to quantityordered for those lines.
      const picked = line.quantitypicked || 0
      const ordered = line.quantityordered || 0
      const qty = picked > 0 ? picked : ordered
      if (qty <= 0) continue
      const dateStr = orderDateMap.get(line.orderid)
      if (!dateStr) continue
      const d = new Date(dateStr)
      const ts = d.getTime()
      const key = sku.toUpperCase()
      const agg = salesMap.get(key) || {
        s1: 0, s3: 0, s6: 0, s12: 0, s24: 0,
        monthly: new Map<string, number>(),
        earliest: null,
      }
      if (d >= from24) agg.s24 += qty
      if (d >= from12) {
        agg.s12 += qty
        // Track monthly buckets for variance (12-month window)
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        agg.monthly.set(ym, (agg.monthly.get(ym) || 0) + qty)
      }
      if (d >= from6)  agg.s6  += qty
      if (d >= from3)  agg.s3  += qty
      if (d >= from1)  agg.s1  += qty
      if (agg.earliest === null || ts < agg.earliest) agg.earliest = ts
      salesMap.set(key, agg)
    }

    // 5. Build rows with recommendations
    //    Formula for wholesale business:
    //      Demand per week = blend of 3m and 12m averages (60/40 weighted to recent)
    //      Suggested Reorder Level = (6 weeks lead time demand) + safety stock for variance
    //      Suggested Reorder Qty   = 8 weeks of demand
    //    Safety stock scales with monthly peak vs monthly average ratio.
    //    Values rounded up to sensible pack sizes.
    const LEAD_TIME_WEEKS = 6
    const COVER_WEEKS = 8
    const emptyAgg = {
      s1: 0, s3: 0, s6: 0, s12: 0, s24: 0,
      monthly: new Map<string, number>(),
      earliest: null as number | null,
    }

    const rows: ReorderRow[] = productList.map((p: any) => {
      const agg = salesMap.get((p.sku || '').trim().toUpperCase()) || emptyAgg

      // Weekly demand — blend 3m and 12m, weighted towards recent
      const avg3mWeekly = agg.s3 / 13
      const avg12mWeekly = agg.s12 / 52
      const weeklyDemand = avg3mWeekly * 0.6 + avg12mWeekly * 0.4

      // Safety stock — based on how much the biggest month exceeds the average
      let safetyStock = 0
      if (agg.s12 > 0 && agg.monthly.size > 0) {
        const monthlyAvg = agg.s12 / 12
        let peakMonth = 0
        for (const v of agg.monthly.values()) if (v > peakMonth) peakMonth = v
        const variance = peakMonth - monthlyAvg
        // Safety = half the variance above average (cushion for a single big order)
        safetyStock = Math.max(0, variance * 0.5)
      }

      const rawLevel = (weeklyDemand * LEAD_TIME_WEEKS) + safetyStock
      const rawQty = weeklyDemand * COVER_WEEKS

      // Flags
      let flag = ''
      const hasSales12m = agg.s12 > 0
      const monthsSinceEarliest = agg.earliest
        ? (Date.now() - agg.earliest) / (30.44 * 24 * 60 * 60 * 1000)
        : 0

      if (!hasSales12m && agg.s24 === 0) {
        flag = 'Dead'
      } else if (!hasSales12m) {
        flag = 'Dead'          // no sales in last 12 months
      } else if (agg.earliest && monthsSinceEarliest < 6) {
        flag = 'New'           // first sale less than 6 months ago
      } else if (agg.s12 < 12) {
        flag = 'Slow'          // less than 1/month on average
      } else {
        // Seasonal check: 3m vs 12m rate diverges > 50%
        const rate3m = agg.s3 / 3
        const rate12m = agg.s12 / 12
        if (rate12m > 0) {
          const diff = Math.abs(rate3m - rate12m) / rate12m
          if (diff > 0.5) flag = 'Seasonal'
        }
        // Spiky: peak month > 3x average
        if (!flag && agg.monthly.size > 0) {
          const monthlyAvg = agg.s12 / 12
          let peakMonth = 0
          for (const v of agg.monthly.values()) if (v > peakMonth) peakMonth = v
          if (monthlyAvg > 0 && peakMonth / monthlyAvg > 3) flag = 'Spiky'
        }
      }

      return {
        productid: p.productid,
        sku: p.sku,
        productname: p.productname,
        currentstock: stockMap.get(p.productid) || 0,
        reorderlevel: p.reorderlevel || 0,
        reorderqty: p.reorderqty || 0,
        sales1m: agg.s1,
        sales3m: agg.s3,
        sales6m: agg.s6,
        sales12m: agg.s12,
        sales24m: agg.s24,
        avgMonthly: agg.s12 / 12,
        suggestedLevel: flag === 'Dead' ? 0 : roundUpToPack(rawLevel),
        suggestedQty: flag === 'Dead' ? 0 : roundUpToPack(rawQty),
        flag,
      }
    })

    setData(rows)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Export CSV ────────────────────────────────────────────────
  const downloadCSV = () => {
    const headers = [
      'SKU',
      'Product Name',
      'Current Stock',
      'Reorder Level',
      'Reorder Qty',
      'Sales 1m',
      'Sales 3m',
      'Sales 6m',
      'Sales 12m',
      'Sales 24m',
      'Avg Monthly',
      'Suggested Level',
      'Suggested Qty',
      'Flag',
    ]
    const escape = (v: any) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = data.map(r => [
      r.sku,
      r.productname,
      r.currentstock,
      r.reorderlevel,
      r.reorderqty,
      r.sales1m,
      r.sales3m,
      r.sales6m,
      r.sales12m,
      r.sales24m,
      r.avgMonthly.toFixed(1),
      r.suggestedLevel,
      r.suggestedQty,
      r.flag,
    ].map(escape).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reorder-levels-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Upload — parse and preview ────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMessage(null)

    try {
      const text = await file.text()
      const preview = parseUploadCSV(text, data)
      setUploadPreview(preview)
    } catch (err: any) {
      console.error(err)
      setMessage(`Failed to parse file: ${err?.message || 'unknown error'}`)
    } finally {
      setUploading(false)
      // Reset so same file can be re-uploaded
      e.target.value = ''
    }
  }

  // ── Commit preview ────────────────────────────────────────────
  const commitChanges = async () => {
    if (!uploadPreview) return
    const toUpdate = uploadPreview.filter(r => r.status === 'ok' && r.productid !== null)
    if (toUpdate.length === 0) {
      setMessage('Nothing to update')
      return
    }

    setCommitting(true)
    let success = 0
    let failed = 0

    for (const row of toUpdate) {
      const patch: any = {}
      if (row.reorderlevel !== null) patch.reorderlevel = row.reorderlevel
      if (row.reorderqty !== null) patch.reorderqty = row.reorderqty

      const { error } = await supabase
        .from('tblproducts')
        .update(patch)
        .eq('productid', row.productid)

      if (error) {
        console.error('Update failed for', row.sku, error)
        failed++
      } else {
        success++
      }
    }

    setCommitting(false)
    setUploadPreview(null)
    setMessage(`Updated ${success} product${success === 1 ? '' : 's'}${failed > 0 ? `, ${failed} failed — check console` : ''}`)
    load()
  }

  const cancelPreview = () => {
    setUploadPreview(null)
    setMessage(null)
  }

  if (loading) return <div className="pf-loading">Loading reorder data…</div>

  // ── Preview view ──────────────────────────────────────────────
  if (uploadPreview) {
    const okCount = uploadPreview.filter(r => r.status === 'ok').length
    const noChangeCount = uploadPreview.filter(r => r.status === 'no-change').length
    const notFoundCount = uploadPreview.filter(r => r.status === 'not-found').length
    const invalidCount = uploadPreview.filter(r => r.status === 'invalid').length

    return (
      <div className="pf-card">
        <div className="pf-panel-header">
          <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
            Preview Changes
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="pf-btn-secondary" onClick={cancelPreview} disabled={committing}>Cancel</button>
            <button className="pf-btn-primary" onClick={commitChanges} disabled={committing || okCount === 0}>
              {committing ? 'Applying…' : `Apply ${okCount} change${okCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
        <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <span><strong style={{ color: 'var(--accent)' }}>{okCount}</strong> to update</span>
          {noChangeCount > 0 && <span><strong>{noChangeCount}</strong> unchanged</span>}
          {notFoundCount > 0 && <span style={{ color: 'var(--danger, #c0392b)' }}><strong>{notFoundCount}</strong> SKU not found</span>}
          {invalidCount > 0 && <span style={{ color: 'var(--danger, #c0392b)' }}><strong>{invalidCount}</strong> invalid</span>}
        </div>

        <table className="pf-inner-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th className="pf-col-right">Current Level</th>
              <th className="pf-col-right">New Level</th>
              <th className="pf-col-right">Current Qty</th>
              <th className="pf-col-right">New Qty</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {uploadPreview.map((row, i) => {
              const badgeColour =
                row.status === 'ok' ? 'pf-badge-printed' :
                row.status === 'no-change' ? 'pf-badge' :
                'pf-badge-new'
              const label =
                row.status === 'ok' ? 'Update' :
                row.status === 'no-change' ? 'No change' :
                row.status === 'not-found' ? 'SKU not found' :
                row.error || 'Invalid'
              const levelChanged = row.status === 'ok' && row.reorderlevel !== null && row.reorderlevel !== row.currentLevel
              const qtyChanged = row.status === 'ok' && row.reorderqty !== null && row.reorderqty !== row.currentQty

              return (
                <tr key={i} className="pf-row">
                  <td className="pf-sku">{row.sku}</td>
                  <td className="pf-col-right pf-category">{row.currentLevel ?? '—'}</td>
                  <td className="pf-col-right" style={{ fontWeight: levelChanged ? 700 : 400, color: levelChanged ? 'var(--accent)' : undefined }}>
                    {row.reorderlevel ?? '—'}
                  </td>
                  <td className="pf-col-right pf-category">{row.currentQty ?? '—'}</td>
                  <td className="pf-col-right" style={{ fontWeight: qtyChanged ? 700 : 400, color: qtyChanged ? 'var(--accent)' : undefined }}>
                    {row.reorderqty ?? '—'}
                  </td>
                  <td><span className={`pf-badge ${badgeColour}`}>{label}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Default view ──────────────────────────────────────────────
  return (
    <div className="pf-card">
      <div className="pf-panel-header">
        <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          Reorder Levels
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="pf-btn-secondary" onClick={downloadCSV} disabled={data.length === 0}>
            Download CSV
          </button>
          <label className="pf-btn-primary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
            {uploading ? 'Reading…' : 'Upload CSV'}
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              style={{ display: 'none' }}
              disabled={uploading}
            />
          </label>
        </div>
      </div>
      <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />

      {message && (
        <div className="pf-error-inline" style={{ marginBottom: '1rem', background: 'var(--accent-soft, #eef)', color: 'var(--accent)', padding: '0.6rem 0.75rem', borderRadius: 6 }}>
          {message}
        </div>
      )}

      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
        Download to get each product's sales history, current reorder settings, and suggested values based on a 6-week lead time.
        Edit the <strong>Reorder Level</strong> and <strong>Reorder Qty</strong> columns in a spreadsheet, then upload
        the amended file. Only those two columns are written back — everything else is read-only.
        You'll see a preview of changes before anything is applied.
      </p>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        <strong>Flags:</strong>{' '}
        <span className="pf-badge pf-badge-printed" style={{ marginRight: 4 }}>New</span> first sold &lt; 6 months ago{'  '}
        <span className="pf-badge" style={{ marginRight: 4, marginLeft: 8 }}>Slow</span> under 1/month{'  '}
        <span className="pf-badge pf-badge-new" style={{ marginRight: 4, marginLeft: 8 }}>Seasonal</span> 3m rate differs &gt; 50% from 12m{'  '}
        <span className="pf-badge pf-badge-new" style={{ marginRight: 4, marginLeft: 8 }}>Spiky</span> peak month &gt; 3× average{'  '}
        <span className="pf-badge" style={{ marginLeft: 8 }}>Dead</span> no sales in 12 months (suggestions set to 0)
      </p>

      {data.length === 0 ? (
        <div className="pf-empty">No active products found.</div>
      ) : (
        <table className="pf-inner-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th className="pf-col-right">Stock</th>
              <th className="pf-col-right">R.Lvl</th>
              <th className="pf-col-right">R.Qty</th>
              <th className="pf-col-right">1m</th>
              <th className="pf-col-right">3m</th>
              <th className="pf-col-right">6m</th>
              <th className="pf-col-right">12m</th>
              <th className="pf-col-right">24m</th>
              <th className="pf-col-right">Avg/mo</th>
              <th className="pf-col-right">Sug.Lvl</th>
              <th className="pf-col-right">Sug.Qty</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => {
              const belowLevel = row.reorderlevel > 0 && row.currentstock <= row.reorderlevel
              const flagColour =
                row.flag === 'Dead' ? 'pf-badge' :
                row.flag === 'New' ? 'pf-badge-printed' :
                row.flag === 'Slow' ? 'pf-badge' :
                row.flag === 'Seasonal' ? 'pf-badge-new' :
                row.flag === 'Spiky' ? 'pf-badge-new' : ''
              return (
                <tr key={row.productid} className="pf-row">
                  <td className="pf-sku">{row.sku}</td>
                  <td className="pf-productname">{row.productname}</td>
                  <td className="pf-col-right" style={{ fontWeight: belowLevel ? 700 : 400, color: belowLevel ? 'var(--danger, #c0392b)' : undefined }}>
                    {row.currentstock}
                  </td>
                  <td className="pf-col-right pf-category">{row.reorderlevel}</td>
                  <td className="pf-col-right pf-category">{row.reorderqty}</td>
                  <td className="pf-col-right pf-category">{row.sales1m}</td>
                  <td className="pf-col-right pf-category">{row.sales3m}</td>
                  <td className="pf-col-right pf-category">{row.sales6m}</td>
                  <td className="pf-col-right pf-category">{row.sales12m}</td>
                  <td className="pf-col-right pf-category">{row.sales24m}</td>
                  <td className="pf-col-right"><strong>{row.avgMonthly.toFixed(1)}</strong></td>
                  <td className="pf-col-right" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    {row.suggestedLevel || '—'}
                  </td>
                  <td className="pf-col-right" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    {row.suggestedQty || '—'}
                  </td>
                  <td>
                    {row.flag ? <span className={`pf-badge ${flagColour}`}>{row.flag}</span> : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// Parse uploaded CSV and match against current data.
// Accepts any column order — looks up SKU, Reorder Level, Reorder Qty by header name.
function parseUploadCSV(text: string, current: ReorderRow[]): UploadRow[] {
  // Build SKU lookup
  const currentMap = new Map<string, ReorderRow>()
  for (const r of current) currentMap.set(r.sku.trim().toUpperCase(), r)

  // Split into lines — handle both \r\n and \n
  const allLines = text.split(/\r?\n/).filter(l => l.length > 0)
  if (allLines.length === 0) throw new Error('Empty file')

  // Parse header to find column indices
  const headerCells = parseCSVLine(allLines[0])
  const findCol = (names: string[]) => {
    for (const name of names) {
      const idx = headerCells.findIndex(c => c.trim().toLowerCase() === name.toLowerCase())
      if (idx >= 0) return idx
    }
    return -1
  }

  const skuCol = findCol(['SKU', 'sku'])
  const levelCol = findCol(['Reorder Level', 'reorderlevel', 'r.lvl'])
  const qtyCol = findCol(['Reorder Qty', 'reorderqty', 'r.qty'])

  if (skuCol < 0) throw new Error('SKU column not found in header')
  if (levelCol < 0 && qtyCol < 0) throw new Error('Neither Reorder Level nor Reorder Qty column found')

  const results: UploadRow[] = []

  for (let i = 1; i < allLines.length; i++) {
    const cells = parseCSVLine(allLines[i])
    const sku = (cells[skuCol] || '').trim()
    if (!sku) continue

    const rawLevel = levelCol >= 0 ? (cells[levelCol] || '').trim() : ''
    const rawQty = qtyCol >= 0 ? (cells[qtyCol] || '').trim() : ''

    const existing = currentMap.get(sku.toUpperCase())

    if (!existing) {
      results.push({
        sku, reorderlevel: null, reorderqty: null,
        currentLevel: null, currentQty: null, productid: null,
        status: 'not-found',
      })
      continue
    }

    // Parse numeric values — allow blanks (means "leave alone")
    let newLevel: number | null = null
    let newQty: number | null = null
    let invalid = false
    let errorMsg = ''

    if (rawLevel !== '') {
      const n = Number(rawLevel)
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        invalid = true
        errorMsg = 'Bad reorder level'
      } else {
        newLevel = n
      }
    }

    if (!invalid && rawQty !== '') {
      const n = Number(rawQty)
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        invalid = true
        errorMsg = 'Bad reorder qty'
      } else {
        newQty = n
      }
    }

    if (invalid) {
      results.push({
        sku, reorderlevel: null, reorderqty: null,
        currentLevel: existing.reorderlevel, currentQty: existing.reorderqty,
        productid: existing.productid,
        status: 'invalid', error: errorMsg,
      })
      continue
    }

    const levelChanged = newLevel !== null && newLevel !== existing.reorderlevel
    const qtyChanged = newQty !== null && newQty !== existing.reorderqty

    if (!levelChanged && !qtyChanged) {
      results.push({
        sku,
        reorderlevel: newLevel, reorderqty: newQty,
        currentLevel: existing.reorderlevel, currentQty: existing.reorderqty,
        productid: existing.productid,
        status: 'no-change',
      })
      continue
    }

    results.push({
      sku,
      reorderlevel: levelChanged ? newLevel : null,
      reorderqty: qtyChanged ? newQty : null,
      currentLevel: existing.reorderlevel, currentQty: existing.reorderqty,
      productid: existing.productid,
      status: 'ok',
    })
  }

  return results
}

// Minimal CSV line parser — handles quoted fields with commas and escaped quotes
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++ }
        else { inQuotes = false }
      } else {
        current += ch
      }
    } else {
      if (ch === ',') { result.push(current); current = '' }
      else if (ch === '"') { inQuotes = true }
      else { current += ch }
    }
  }
  result.push(current)
  return result
}
