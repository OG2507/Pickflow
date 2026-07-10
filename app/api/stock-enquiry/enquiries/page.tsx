'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import StockTabs from '@/components/StockTabs'

type EnquiryLine = {
  enquirylineid: number
  enquiryid: number
  createdat: string
  customeremail: string
  customername: string | null
  productid: number | null
  sku: string | null
  productname: string | null
  quantityrequested: number
  verdict: string | null
  draftmessage: string | null
  finalmessage: string | null
  sentat: string | null
}

const VERDICT_BADGE: Record<string, string> = {
  'InStock':      'pf-badge-completed',
  'Backorder':    'pf-badge-printed',
  'CannotFulfil': 'pf-badge-invoiced',
}

export default function StockEnquiriesPage() {
  const router = useRouter()

  const [lines, setLines] = useState<EnquiryLine[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))

  const fetchEnquiries = useCallback(async () => {
    setLoading(true)

    const { data: enquiryLines } = await supabase
      .from('tblstockenquirylines')
      .select('enquirylineid, enquiryid, productid, skurequested, quantityrequested, verdict, draftmessage, finalmessage, sentat')
      .order('enquirylineid', { ascending: false })
      .limit(500)

    const enquiryIds = [...new Set((enquiryLines || []).map((l: any) => l.enquiryid))]
    const enquiryMap = new Map<number, { createdat: string; customeremail: string; customername: string | null }>()
    if (enquiryIds.length > 0) {
      const { data: enquiries } = await supabase
        .from('tblstockenquiries')
        .select('enquiryid, createdat, customeremail, customername')
        .in('enquiryid', enquiryIds)
        .gte('createdat', dateFrom)
        .lte('createdat', dateTo + 'T23:59:59')
      for (const e of enquiries || []) {
        enquiryMap.set(e.enquiryid, { createdat: e.createdat, customeremail: e.customeremail, customername: e.customername })
      }
    }

    const productIds = [...new Set((enquiryLines || []).map((l: any) => l.productid).filter(Boolean))]
    const productMap = new Map<number, string>()
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from('tblproducts')
        .select('productid, productname')
        .in('productid', productIds)
      for (const p of prods || []) productMap.set(p.productid, p.productname)
    }

    let results: EnquiryLine[] = (enquiryLines || [])
      .filter((l: any) => enquiryMap.has(l.enquiryid))
      .map((l: any) => {
        const enquiry = enquiryMap.get(l.enquiryid)!
        return {
          enquirylineid: l.enquirylineid,
          enquiryid: l.enquiryid,
          createdat: enquiry.createdat,
          customeremail: enquiry.customeremail,
          customername: enquiry.customername,
          productid: l.productid,
          sku: l.skurequested,
          productname: l.productid ? productMap.get(l.productid) || null : null,
          quantityrequested: l.quantityrequested,
          verdict: l.verdict,
          draftmessage: l.draftmessage,
          finalmessage: l.finalmessage,
          sentat: l.sentat,
        }
      })

    if (search.trim()) {
      const s = search.trim().toLowerCase()
      results = results.filter(l =>
        l.customeremail?.toLowerCase().includes(s) ||
        l.customername?.toLowerCase().includes(s) ||
        l.sku?.toLowerCase().includes(s) ||
        l.productname?.toLowerCase().includes(s)
      )
    }

    results.sort((a, b) => new Date(b.createdat).getTime() - new Date(a.createdat).getTime())

    setLines(results)
    setLoading(false)
  }, [dateFrom, dateTo, search])

  useEffect(() => { fetchEnquiries() }, [fetchEnquiries])

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Stock Enquiries</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${lines.length} enquir${lines.length !== 1 ? 'ies' : 'y'}`}
          </p>
        </div>
      </div>

      <StockTabs />

      <div className="pf-filters">
        <input
          type="text"
          className="pf-input pf-search"
          placeholder="Search customer, SKU, product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input type="date" className="pf-input pf-input-mono" value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)} style={{ width: 140 }} />
        <input type="date" className="pf-input pf-input-mono" value={dateTo}
          onChange={(e) => setDateTo(e.target.value)} style={{ width: 140 }} />
      </div>

      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading…</div>
        ) : lines.length === 0 ? (
          <div className="pf-empty">No enquiries found.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Email</th>
                <th>SKU</th>
                <th>Product</th>
                <th className="pf-col-right">Qty</th>
                <th>Verdict</th>
                <th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.enquirylineid} className="pf-row"
                  onClick={() => l.productid && router.push(`/products/${l.productid}`)}
                  style={{ cursor: l.productid ? 'pointer' : 'default' }}>
                  <td className="pf-category">
                    {new Date(l.createdat).toLocaleDateString('en-GB')}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: 4 }}>
                      {new Date(l.createdat).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td className="pf-category">{l.customername || '—'}</td>
                  <td className="pf-category">{l.customeremail}</td>
                  <td className="pf-sku">{l.sku || '—'}</td>
                  <td className="pf-productname">{l.productname || '—'}</td>
                  <td className="pf-col-right"><strong>{l.quantityrequested}</strong></td>
                  <td>
                    {l.verdict ? (
                      <span className={`pf-badge ${VERDICT_BADGE[l.verdict] || ''}`}>{l.verdict}</span>
                    ) : '—'}
                  </td>
                  <td className="pf-category" style={{ fontSize: '0.8rem' }}>
                    {l.sentat ? new Date(l.sentat).toLocaleString('en-GB') : 'Not yet'}
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
