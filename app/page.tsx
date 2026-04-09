'use client'

import { useEffect, useState } from 'react'
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
        </>
      )}
    </div>
  )
}
