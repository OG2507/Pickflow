'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type OrderRow = {
  orderid: number
  ordernumber: string | null
  orderdate: string | null
  ordersource: string | null
  status: string
  shiptoname: string | null
  shiptopostcode: string | null
  subtotal: number
  shippingcost: number
  totalweightg: number
  clientid: number
  companyname: string | null
  firstname: string | null
  lastname: string | null
}

const STATUS_COLOURS: Record<string, string> = {
  'New':          'pf-badge-new',
  'Printed':      'pf-badge-printed',
  'Post Printed': 'pf-badge-postprinted',
  'Picking':      'pf-badge-picking',
  'Dispatched':   'pf-badge-dispatched',
  'Invoiced':     'pf-badge-invoiced',
  'Completed':    'pf-badge-completed',
  'Cancelled':    'pf-badge-cancelled',
}

const ALL_STATUSES = ['New', 'Printed', 'Post Printed', 'Picking', 'Dispatched', 'Invoiced', 'Completed', 'Cancelled']
const ORDER_SOURCES = ['Shopwired', 'Email', 'Phone', 'Letter']

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price)

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  const fetchOrders = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('tblorders')
      .select(`
        orderid,
        ordernumber,
        orderdate,
        ordersource,
        status,
        shiptoname,
        shiptopostcode,
        subtotal,
        shippingcost,
        totalweightg,
        clientid,
        tblclients (companyname, firstname, lastname)
      `)
      .order('orderdate', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)
    if (sourceFilter) query = query.eq('ordersource', sourceFilter)

    if (search.trim()) {
      query = query.or(
        `ordernumber.ilike.%${search.trim()}%,shiptoname.ilike.%${search.trim()}%,shiptopostcode.ilike.%${search.trim()}%`
      )
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching orders:', error)
    } else {
      setOrders(
        (data || []).map((r: any) => ({
          orderid:       r.orderid,
          ordernumber:   r.ordernumber,
          orderdate:     r.orderdate,
          ordersource:   r.ordersource,
          status:        r.status,
          shiptoname:    r.shiptoname,
          shiptopostcode: r.shiptopostcode,
          subtotal:      r.subtotal,
          shippingcost:  r.shippingcost,
          totalweightg:  r.totalweightg,
          clientid:      r.clientid,
          companyname:   r.tblclients?.companyname,
          firstname:     r.tblclients?.firstname,
          lastname:      r.tblclients?.lastname,
        }))
      )
    }
    setLoading(false)
  }, [search, statusFilter, sourceFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const clientName = (o: OrderRow) =>
    o.companyname?.trim() || `${o.firstname || ''} ${o.lastname || ''}`.trim() || '—'

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Orders</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${orders.length} order${orders.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          className="pf-btn-primary"
          onClick={() => router.push('/orders/new')}
        >
          + New Order
        </button>
      </div>

      {/* Filters */}
      <div className="pf-filters">
        <input
          type="text"
          placeholder="Search order number, name, or postcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pf-input pf-search"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="pf-input pf-select"
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="pf-input pf-select"
        >
          <option value="">All sources</option>
          {ORDER_SOURCES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="pf-empty">No orders found.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>Order No.</th>
                <th>Date</th>
                <th>Client</th>
                <th>Ship To</th>
                <th>Source</th>
                <th className="pf-col-right">Weight</th>
                <th className="pf-col-right">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.orderid}
                  className="pf-row"
                  onClick={() => router.push(`/orders/${o.orderid}`)}
                >
                  <td className="pf-sku">{o.ordernumber || '—'}</td>
                  <td className="pf-category">
                    {o.orderdate ? new Date(o.orderdate).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="pf-productname">{clientName(o)}</td>
                  <td className="pf-category">
                    {o.shiptoname || '—'}
                    {o.shiptopostcode && <span className="pf-postcode"> {o.shiptopostcode}</span>}
                  </td>
                  <td className="pf-category">{o.ordersource || '—'}</td>
                  <td className="pf-col-right pf-category">
                    {o.totalweightg ? `${o.totalweightg}g` : '—'}
                  </td>
                  <td className="pf-col-right pf-price">
                    {formatPrice((o.subtotal || 0) + (o.shippingcost || 0))}
                  </td>
                  <td>
                    <span className={`pf-badge ${STATUS_COLOURS[o.status] || ''}`}>
                      {o.status}
                    </span>
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
