'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

function capitalise(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

type ActivityItem = {
  id: string
  timestamp: string
  category: 'login' | 'order' | 'stock' | 'edit'
  action: string
  detail: string
  reference: string | null
}

export default function ActivityLogPage() {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'login' | 'order' | 'stock' | 'edit'>('all')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))

  const load = useCallback(async () => {
    setLoading(true)
    const activity: ActivityItem[] = []

    // Logins from tblsessionlog
    const { data: sessions } = await supabase
      .from('tblsessionlog')
      .select('sessionid, username, logintime, logouttime, machinename, sessiondurationmins')
      .gte('logintime', dateFrom)
      .lte('logintime', dateTo + 'T23:59:59')
      .order('logintime', { ascending: false })
      .limit(200)

    for (const s of sessions || []) {
      activity.push({
        id: `session-${s.sessionid}`,
        timestamp: s.logintime,
        category: 'login',
        action: 'Login',
        detail: s.username || 'Unknown user',
        reference: s.sessiondurationmins ? `${s.sessiondurationmins} mins` : null,
      })
      if (s.logouttime) {
        activity.push({
          id: `session-out-${s.sessionid}`,
          timestamp: s.logouttime,
          category: 'login',
          action: 'Logout',
          detail: s.username || 'Unknown user',
          reference: null,
        })
      }
    }

    // Order status changes — look at recent orders with despatch dates and creation
    const { data: orders } = await supabase
      .from('tblorders')
      .select('orderid, ordernumber, status, orderdate, despatchdate, ordersource, shiptoname')
      .gte('orderdate', dateFrom)
      .lte('orderdate', dateTo + 'T23:59:59')
      .order('orderdate', { ascending: false })
      .limit(200)

    for (const o of orders || []) {
      activity.push({
        id: `order-created-${o.orderid}`,
        timestamp: o.orderdate,
        category: 'order',
        action: 'Order Created',
        detail: `${o.ordernumber || o.orderid} — ${o.shiptoname || ''}`,
        reference: o.ordersource,
      })
      if (o.despatchdate) {
        activity.push({
          id: `order-despatched-${o.orderid}`,
          timestamp: o.despatchdate,
          category: 'order',
          action: 'Order Despatched',
          detail: `${o.ordernumber || o.orderid} — ${o.shiptoname || ''}`,
          reference: o.status,
        })
      }
    }

    // Stock movements
    const { data: movements } = await supabase
      .from('tblstockmovements')
      .select('movementid, movementdate, movementtype, productid, quantity, reference, reason, fromlocationid, tolocationid')
      .gte('movementdate', dateFrom)
      .lte('movementdate', dateTo + 'T23:59:59')
      .order('movementdate', { ascending: false })
      .limit(200)

    // Fetch product SKUs
    const productIds = [...new Set((movements || []).map((m: any) => m.productid).filter(Boolean))]
    const skuMap = new Map<number, string>()
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from('tblproducts')
        .select('productid, sku')
        .in('productid', productIds)
      for (const p of prods || []) skuMap.set(p.productid, p.sku)
    }

    // Fetch location codes
    const locationIds = new Set<number>()
    for (const m of movements || []) {
      if ((m as any).fromlocationid) locationIds.add((m as any).fromlocationid)
      if ((m as any).tolocationid) locationIds.add((m as any).tolocationid)
    }
    const locationMap = new Map<number, string>()
    if (locationIds.size > 0) {
      const { data: locs } = await supabase
        .from('tbllocations')
        .select('locationid, locationcode')
        .in('locationid', Array.from(locationIds))
      for (const l of locs || []) locationMap.set(l.locationid, l.locationcode)
    }

    for (const m of movements || []) {
      const mv = m as any
      const sku = mv.productid ? skuMap.get(mv.productid) || `Product ${mv.productid}` : 'Unknown'
      const from = mv.fromlocationid ? locationMap.get(mv.fromlocationid) : null
      const to = mv.tolocationid ? locationMap.get(mv.tolocationid) : null
      const locations = [from && `from ${from}`, to && `to ${to}`].filter(Boolean).join(', ')

      activity.push({
        id: `movement-${mv.movementid}`,
        timestamp: mv.movementdate,
        category: 'stock',
        action: `Stock ${mv.movementtype}`,
        detail: `${sku} — qty ${mv.quantity}${locations ? ` ${locations}` : ''}`,
        reference: mv.reference || mv.reason || null,
      })
    }

    // Activity log — field-level edits from tblactivitylog
    const { data: edits } = await supabase
      .from('tblactivitylog')
      .select('activityid, activityat, username, action, entitytype, entitylabel, fieldname, oldvalue, newvalue, notes')
      .gte('activityat', dateFrom)
      .lte('activityat', dateTo + 'T23:59:59')
      .order('activityat', { ascending: false })
      .limit(500)

    for (const e of edits || []) {
      const ev = e as any
      const actionLabel =
        ev.action === 'create' ? `${capitalise(ev.entitytype)} created` :
        ev.action === 'delete' ? `${capitalise(ev.entitytype)} deleted` :
        `${capitalise(ev.entitytype)} edited`

      const label = ev.entitylabel ? ` — ${ev.entitylabel}` : ''

      let detail = `${ev.username || 'Unknown'}${label}`
      if (ev.action === 'update' && ev.fieldname) {
        const oldV = ev.oldvalue ?? '—'
        const newV = ev.newvalue ?? '—'
        detail += ` · ${ev.fieldname}: "${oldV}" → "${newV}"`
      }

      activity.push({
        id: `edit-${ev.activityid}`,
        timestamp: ev.activityat,
        category: 'edit',
        action: actionLabel,
        detail,
        reference: ev.notes || null,
      })
    }

    // Sort all by timestamp descending
    activity.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    setItems(activity)
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'all' ? items : items.filter(i => i.category === filter)

  const CATEGORY_COLOURS = {
    login: 'pf-badge-printed',
    order: 'pf-badge-dispatched',
    stock: 'pf-badge-invoiced',
    edit:  'pf-badge-new',
  }

  const counts = {
    login: items.filter(i => i.category === 'login').length,
    order: items.filter(i => i.category === 'order').length,
    stock: items.filter(i => i.category === 'stock').length,
    edit:  items.filter(i => i.category === 'edit').length,
  }

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Activity Log</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${filtered.length} event${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="pf-header-actions">
          <input type="date" className="pf-input pf-input-mono" style={{ width: 140 }}
            value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" className="pf-input pf-input-mono" style={{ width: 140 }}
            value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* Filter buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `All (${items.length})` },
          { key: 'login', label: `Logins (${counts.login})` },
          { key: 'order', label: `Orders (${counts.order})` },
          { key: 'stock', label: `Stock (${counts.stock})` },
          { key: 'edit',  label: `Edits (${counts.edit})` },
        ].map(f => (
          <button key={f.key}
            className={filter === f.key ? 'pf-btn-primary' : 'pf-btn-secondary'}
            style={{ fontSize: '0.85rem' }}
            onClick={() => setFilter(f.key as any)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="pf-empty">No activity for this period.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Category</th>
                <th>Action</th>
                <th>Detail</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="pf-row">
                  <td className="pf-category" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(item.timestamp).toLocaleDateString('en-GB')}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: 4 }}>
                      {new Date(item.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td>
                    <span className={`pf-badge ${CATEGORY_COLOURS[item.category]}`}>
                      {item.category}
                    </span>
                  </td>
                  <td className="pf-productname">{item.action}</td>
                  <td className="pf-category">{item.detail}</td>
                  <td className="pf-category" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {item.reference || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
