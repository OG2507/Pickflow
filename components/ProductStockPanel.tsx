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
}

export default function ProductStockPanel({ productid }: { productid: number }) {
  const router = useRouter()
  const [stock, setStock] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from('tblstocklevels')
        .select(`
          stocklevelid,
          quantityonhand,
          pickpriority,
          bagsize,
          locationid,
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
            }))
        )
      }
      setLoading(false)
    }
    fetch()
  }, [productid])

  const totalStock = stock.reduce((sum, r) => sum + r.quantityonhand, 0)

  return (
    <div className="pf-card">
      <div className="pf-panel-header">
        <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          Stock Levels
        </h2>
        <button
          className="pf-btn-edit"
          onClick={() => router.push(`/stock?product=${productid}`)}
        >
          Go to Stock →
        </button>
      </div>

      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '0.875rem', marginTop: '0.75rem' }} />

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
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => (
                <tr key={row.stocklevelid}>
                  <td className="pf-sku">
                    {row.locationcode}
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
