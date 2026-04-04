'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PORow = {
  poid: number
  ponumber: string | null
  orderdate: string | null
  expecteddate: string | null
  status: string
  subtotal: number
  pototal: number
  suppliername: string
}

const STATUS_COLOURS: Record<string, string> = {
  'Draft':     'pf-badge-new',
  'Sent':      'pf-badge-printed',
  'Partial':   'pf-badge-picking',
  'Received':  'pf-badge-completed',
  'Cancelled': 'pf-badge-cancelled',
}

const ALL_STATUSES = ['Draft', 'Sent', 'Partial', 'Received', 'Cancelled']

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD' }).format(price)

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const [pos, setPOs] = useState<PORow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Draft')

  const fetchPOs = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('tblpurchaseorders')
      .select(`
        poid,
        ponumber,
        orderdate,
        expecteddate,
        status,
        subtotal,
        pototal,
        tblsuppliers (suppliername)
      `)
      .order('orderdate', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)

    if (search.trim()) {
      query = query.ilike('ponumber', `%${search.trim()}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching POs:', error)
    } else {
      setPOs(
        (data || []).map((r: any) => ({
          poid:         r.poid,
          ponumber:     r.ponumber,
          orderdate:    r.orderdate,
          expecteddate: r.expecteddate,
          status:       r.status,
          subtotal:     r.subtotal,
          pototal:      r.pototal,
          suppliername: r.tblsuppliers?.suppliername || '—',
        }))
      )
    }
    setLoading(false)
  }, [search, statusFilter])

  useEffect(() => {
    fetchPOs()
  }, [fetchPOs])

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Purchase Orders</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${pos.length} order${pos.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          className="pf-btn-primary"
          onClick={() => router.push('/purchase-orders/new')}
        >
          + New PO
        </button>
      </div>

      <div className="pf-filters">
        <input
          type="text"
          placeholder="Search PO number…"
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
      </div>

      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading purchase orders…</div>
        ) : pos.length === 0 ? (
          <div className="pf-empty">No purchase orders found.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Supplier</th>
                <th>Order Date</th>
                <th>Expected</th>
                <th className="pf-col-right">Total (USD)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr
                  key={po.poid}
                  className="pf-row"
                  onClick={() => router.push(`/purchase-orders/${po.poid}`)}
                >
                  <td className="pf-sku">{po.ponumber || '—'}</td>
                  <td className="pf-productname">{po.suppliername}</td>
                  <td className="pf-category">
                    {po.orderdate ? new Date(po.orderdate).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="pf-category">
                    {po.expecteddate ? new Date(po.expecteddate).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="pf-col-right pf-price">{formatPrice(po.pototal)}</td>
                  <td>
                    <span className={`pf-badge ${STATUS_COLOURS[po.status] || ''}`}>
                      {po.status}
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
