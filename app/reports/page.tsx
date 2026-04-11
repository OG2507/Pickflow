'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type DateRange = { from: string; to: string }
type Tab = 'bestsellers' | 'trends' | 'clients' | 'product' | 'slowsellers' | 'seasonal' | 'frequency'

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
