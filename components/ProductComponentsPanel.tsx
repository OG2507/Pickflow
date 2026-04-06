'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Component = {
  componentid: number
  quantity: number
  childproductid: number
  sku: string
  productname: string
  isactive: boolean
}

export default function ProductComponentsPanel({ productid }: { productid: number }) {
  const router = useRouter()
  const [components, setComponents] = useState<Component[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('tblproductcomponents')
        .select(`
          componentid,
          quantity,
          childproductid,
          tblproducts!childproductid (productid, sku, productname, isactive)
        `)
        .eq('parentproductid', productid)
        .order('componentid')

      setComponents(
        (data || []).map((r: any) => ({
          componentid:    r.componentid,
          quantity:       r.quantity,
          childproductid: r.childproductid,
          sku:            r.tblproducts?.sku || '—',
          productname:    r.tblproducts?.productname || '—',
          isactive:       r.tblproducts?.isactive ?? true,
        }))
      )
      setLoading(false)
    }
    fetch()
  }, [productid])

  return (
    <div className="pf-card">
      <h2 className="pf-card-title">Bundle Components</h2>
      {loading ? (
        <p className="pf-card-note">Loading…</p>
      ) : components.length === 0 ? (
        <p className="pf-card-note">No components defined for this bundle.</p>
      ) : (
        <table className="pf-table pf-table-compact" style={{ marginTop: '8px' }}>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Component</th>
              <th className="pf-col-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {components.map((c) => (
              <tr
                key={c.componentid}
                className="pf-row"
                onClick={() => router.push(`/products/${c.childproductid}`)}
                style={{ opacity: c.isactive ? 1 : 0.5 }}
              >
                <td className="pf-sku">{c.sku}</td>
                <td>{c.productname}{!c.isactive && <span className="pf-badge pf-badge-cancelled" style={{ marginLeft: 8 }}>Inactive</span>}</td>
                <td className="pf-col-right">{c.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="pf-card-note" style={{ marginTop: '8px' }}>
        Click a component to view its product record. To change components, update via the database import.
      </p>
    </div>
  )
}
