'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Stats = {
  ordersNew: number
  ordersPrinted: number
  ordersDispatched: number
  productsLowStock: number
  clientsTotal: number
}

export default function HomePage() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: userData } = await supabase
          .from('tblusers')
          .select('displayname')
          .eq('userid', user.id)
          .single()
        if (userData) setDisplayName(userData.displayname)
      }

      const [newOrders, printedOrders, dispatchedOrders, clients] = await Promise.all([
        supabase.from('tblorders').select('orderid', { count: 'exact', head: true }).eq('status', 'New'),
        supabase.from('tblorders').select('orderid', { count: 'exact', head: true }).eq('status', 'Printed'),
        supabase.from('tblorders').select('orderid', { count: 'exact', head: true }).eq('status', 'Dispatched').gte('despatchdate', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('tblclients').select('clientid', { count: 'exact', head: true }).eq('isactive', true),
      ])

      // Low stock — products below reorder level
      const { data: stockData } = await supabase
        .from('tblstocklevels')
        .select('productid, quantityonhand, tblproducts!inner(reorderlevel, isbundle, isdiscontinued, isactive)')
        .eq('tblproducts.isactive', true)
        .eq('tblproducts.isbundle', false)
        .eq('tblproducts.isdiscontinued', false)
        .gt('tblproducts.reorderlevel', 0)

      let lowStock = 0
      if (stockData) {
        const byProduct = new Map<number, number>()
        for (const row of stockData as any[]) {
          const current = byProduct.get(row.productid) || 0
          byProduct.set(row.productid, current + row.quantityonhand)
        }
        for (const [pid, qty] of byProduct.entries()) {
          const product = (stockData as any[]).find(r => r.productid === pid)?.tblproducts
          if (product && qty < product.reorderlevel) lowStock++
        }
      }

      setStats({
        ordersNew:        newOrders.count || 0,
        ordersPrinted:    printedOrders.count || 0,
        ordersDispatched: dispatchedOrders.count || 0,
        productsLowStock: lowStock,
        clientsTotal:     clients.count || 0,
      })
      setLoading(false)
    }
    load()
  }, [])

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">
            {greeting()}{displayName ? `, ${displayName.split(' ')[0]}` : ''}
          </h1>
          <p className="pf-page-subtitle">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="pf-loading">Loading…</div>
      ) : (
        <>
          {/* Order status cards */}
          <div className="pf-dashboard-grid">
            <div
              className="pf-dashboard-card pf-dashboard-card-alert"
              onClick={() => router.push('/orders?status=New')}
            >
              <div className="pf-dashboard-value">{stats?.ordersNew}</div>
              <div className="pf-dashboard-label">New Orders</div>
              <div className="pf-dashboard-sub">Awaiting picking</div>
            </div>

            <div
              className="pf-dashboard-card pf-dashboard-card-warning"
              onClick={() => router.push('/orders?status=Printed')}
            >
              <div className="pf-dashboard-value">{stats?.ordersPrinted}</div>
              <div className="pf-dashboard-label">Printed</div>
              <div className="pf-dashboard-sub">In progress</div>
            </div>

            <div
              className="pf-dashboard-card pf-dashboard-card-success"
              onClick={() => router.push('/orders?status=Dispatched')}
            >
              <div className="pf-dashboard-value">{stats?.ordersDispatched}</div>
              <div className="pf-dashboard-label">Dispatched</div>
              <div className="pf-dashboard-sub">Last 7 days</div>
            </div>

            <div
              className="pf-dashboard-card pf-dashboard-card-neutral"
              onClick={() => router.push('/stock/reorder')}
            >
              <div className="pf-dashboard-value">{stats?.productsLowStock}</div>
              <div className="pf-dashboard-label">Low Stock</div>
              <div className="pf-dashboard-sub">Below reorder level</div>
            </div>
          </div>

          {/* Quick links */}
          <div className="pf-card" style={{ marginTop: 24 }}>
            <h2 className="pf-card-title">Quick Actions</h2>
            <div className="pf-dashboard-actions">
              <button className="pf-dashboard-action" onClick={() => router.push('/orders')}>
                View Orders
              </button>
              <button className="pf-dashboard-action" onClick={() => router.push('/orders/new')}>
                New Order
              </button>
              <button className="pf-dashboard-action" onClick={() => router.push('/stock/reorder')}>
                Reorder Screen
              </button>
              <button className="pf-dashboard-action" onClick={() => router.push('/purchase-orders')}>
                Purchase Orders
              </button>
              <button className="pf-dashboard-action" onClick={() => router.push('/products')}>
                Products
              </button>
              <button className="pf-dashboard-action" onClick={() => router.push('/clients')}>
                Clients
              </button>
            </div>
          </div>
          {/* Cycle count recommendations */}
          <CycleCountPanel router={router} />
        </>
      )}
    </div>
  )
}

type CycleItem = {
  stocklevelid: number
  locationcode: string
  locationtype: string
  sku: string
  productname: string
  quantityonhand: number
  lastchecked: string | null
  manualpriority: boolean
  daysSinceCheck: number
}

const daysSince = (iso: string | null): number => {
  if (!iso) return 9999
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

function CycleCountPanel({ router }: { router: any }) {
  const [items, setItems] = useState<CycleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [neverChecked, setNeverChecked] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)

    const { data: levels } = await supabase
      .from('tblstocklevels')
      .select('stocklevelid, productid, locationid, quantityonhand, lastchecked, manualpriority')
      .limit(10000)

    if (!levels) { setLoading(false); return }

    const { data: locs } = await supabase
      .from('tbllocations')
      .select('locationid, locationcode, locationtype')
      .in('locationtype', ['Picking Bin', 'Overflow'])
      .eq('isactive', true)

    const locMap = new Map((locs || []).map((l: any) => [l.locationid, l]))
    const filtered = levels.filter((l: any) => locMap.has(l.locationid))

    if (filtered.length === 0) { setItems([]); setLoading(false); return }

    const productIds = [...new Set(filtered.map((l: any) => l.productid))]
    const { data: products } = await supabase
      .from('tblproducts')
      .select('productid, sku, productname')
      .in('productid', productIds)

    const productMap = new Map((products || []).map((p: any) => [p.productid, p]))

    const result: CycleItem[] = filtered.map((l: any) => {
      const loc = locMap.get(l.locationid)
      const product = productMap.get(l.productid)
      const days = daysSince(l.lastchecked)
      return {
        stocklevelid:   l.stocklevelid,
        locationcode:   loc?.locationcode || '—',
        locationtype:   loc?.locationtype || '—',
        sku:            product?.sku || '—',
        productname:    product?.productname || '—',
        quantityonhand: l.quantityonhand,
        lastchecked:    l.lastchecked,
        manualpriority: l.manualpriority ?? false,
        daysSinceCheck: days,
      }
    })

    result.sort((a, b) => {
      if (a.manualpriority !== b.manualpriority) return a.manualpriority ? -1 : 1
      return b.daysSinceCheck - a.daysSinceCheck
    })

    setNeverChecked(result.filter((r) => !r.lastchecked).length)
    setItems(result.slice(0, 10))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-GB') : null

  return (
    <div className="pf-card" style={{ marginTop: 24 }}>
      <div className="pf-panel-header">
        <div>
          <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
            Cycle Count — Top 10 Recommendations
          </h2>
          {!loading && neverChecked > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--danger, #c0392b)' }}>
              {neverChecked} location{neverChecked !== 1 ? 's' : ''} never checked
            </p>
          )}
        </div>
        <button className="pf-btn-secondary" onClick={() => router.push('/stock/cyclecount')}>
          View All
        </button>
      </div>
      <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />

      {loading ? (
        <div className="pf-loading">Loading…</div>
      ) : items.length === 0 ? (
        <div className="pf-empty">No locations to show.</div>
      ) : (
        <table className="pf-inner-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Type</th>
              <th>SKU</th>
              <th>Product</th>
              <th className="pf-col-right">Qty</th>
              <th>Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.stocklevelid}
                className="pf-row"
                style={item.manualpriority ? { background: 'var(--warning-bg, #fff8e1)' } : undefined}
                onClick={() => router.push('/stock/cyclecount')}
              >
                <td className="pf-sku">{item.locationcode}</td>
                <td className="pf-category">{item.locationtype}</td>
                <td className="pf-sku">{item.sku}</td>
                <td className="pf-productname">{item.productname}</td>
                <td className="pf-col-right"><strong>{item.quantityonhand}</strong></td>
                <td className="pf-category">
                  {item.lastchecked ? (
                    <>
                      {formatDate(item.lastchecked)}
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: 4 }}>
                        ({item.daysSinceCheck}d ago)
                      </span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--danger, #c0392b)', fontWeight: 600 }}>Never</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
