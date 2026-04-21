'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type OnOrderRow = {
  polineid: number
  poid: number
  ponumber: string | null
  supplierName: string
  status: string
  orderdate: string | null
  expecteddate: string | null
  quantityordered: number
  quantityreceived: number
  outstanding: number
  unitcostusd: number | null
}

const STATUS_COLOURS: Record<string, string> = {
  'Draft':   'pf-badge-new',
  'Sent':    'pf-badge-printed',
  'Partial': 'pf-badge-picking',
}

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function ProductOnOrderPanel({ productid }: { productid: number }) {
  const router = useRouter()
  const [rows, setRows] = useState<OnOrderRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchOnOrder = useCallback(async () => {
    setLoading(true)

    // Get PO lines for this product
    const { data: lines, error: linesError } = await supabase
      .from('tblpurchaseorderlines')
      .select('polineid, poid, quantityordered, quantityreceived, unitcostusd')
      .eq('productid', productid)

    if (linesError || !lines || lines.length === 0) {
      setLoading(false)
      setRows([])
      return
    }

    // Fetch the POs for those lines — filter to active statuses only
    const poIds = [...new Set(lines.map((l: any) => l.poid))]
    const { data: pos, error: posError } = await supabase
      .from('tblpurchaseorders')
      .select('poid, ponumber, status, orderdate, expecteddate, supplierid')
      .in('poid', poIds)
      .in('status', ['Draft', 'Sent', 'Partial'])

    if (posError || !pos || pos.length === 0) {
      setLoading(false)
      setRows([])
      return
    }

    // Fetch supplier names
    const supplierIds = [...new Set(pos.map((p: any) => p.supplierid).filter(Boolean))]
    const { data: suppliers } = supplierIds.length
      ? await supabase.from('tblsuppliers').select('supplierid, suppliername').in('supplierid', supplierIds)
      : { data: [] }

    const supplierMap = new Map((suppliers || []).map((s: any) => [s.supplierid, s.suppliername]))
    const poMap = new Map(pos.map((p: any) => [p.poid, p]))

    const result: OnOrderRow[] = lines
      .filter((l: any) => poMap.has(l.poid))
      .map((l: any) => {
        const po = poMap.get(l.poid)!
        const outstanding = (l.quantityordered ?? 0) - (l.quantityreceived ?? 0)
        return {
          polineid:         l.polineid,
          poid:             l.poid,
          ponumber:         po.ponumber,
          supplierName:     supplierMap.get(po.supplierid) || 'Unknown supplier',
          status:           po.status,
          orderdate:        po.orderdate,
          expecteddate:     po.expecteddate,
          quantityordered:  l.quantityordered,
          quantityreceived: l.quantityreceived,
          outstanding:      outstanding,
          unitcostusd:      l.unitcostusd,
        }
      })
      .filter(r => r.outstanding > 0)
      .sort((a, b) => (a.orderdate || '').localeCompare(b.orderdate || ''))

    setRows(result)
    setLoading(false)
  }, [productid])

  useEffect(() => {
    fetchOnOrder()
  }, [fetchOnOrder])

  if (loading) return (
    <div className="pf-card">
      <div className="pf-panel-header"><h2 className="pf-card-title">On Order</h2></div>
      <p className="pf-loading">Loading…</p>
    </div>
  )

  if (rows.length === 0) return (
    <div className="pf-card">
      <div className="pf-panel-header"><h2 className="pf-card-title">On Order</h2></div>
      <p className="pf-empty">Nothing currently on order for this product.</p>
    </div>
  )

  const totalOutstanding = rows.reduce((sum, r) => sum + r.outstanding, 0)

  return (
    <div className="pf-card">
      <div className="pf-panel-header">
        <h2 className="pf-card-title">On Order</h2>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-faint)' }}>
          {totalOutstanding} unit{totalOutstanding !== 1 ? 's' : ''} outstanding
        </span>
      </div>

      <div className="pf-table-wrap">
        <table className="pf-table">
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Order Date</th>
              <th>Expected</th>
              <th className="pf-col-right">Ordered</th>
              <th className="pf-col-right">Received</th>
              <th className="pf-col-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.polineid}
                className="pf-row pf-row-link"
                onClick={() => router.push(`/purchase-orders/${row.poid}`)}
                title={`Open PO ${row.ponumber}`}
              >
                <td className="pf-input-mono">{row.ponumber || `PO-${row.poid}`}</td>
                <td>{row.supplierName}</td>
                <td><span className={`pf-badge ${STATUS_COLOURS[row.status] || 'pf-badge-new'}`}>{row.status}</span></td>
                <td>{formatDate(row.orderdate)}</td>
                <td>{formatDate(row.expecteddate)}</td>
                <td className="pf-col-right">{row.quantityordered}</td>
                <td className="pf-col-right">{row.quantityreceived}</td>
                <td className="pf-col-right"><strong>{row.outstanding}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
