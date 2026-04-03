'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Supplier } from '@/lib/types'

export default function SuppliersPage() {
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active')

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('tblsuppliers')
      .select('*')
      .order('suppliername', { ascending: true })

    if (activeFilter === 'active') query = query.eq('isactive', true)
    if (activeFilter === 'inactive') query = query.eq('isactive', false)

    if (search.trim()) {
      query = query.or(
        `suppliername.ilike.%${search.trim()}%,contactname.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%,accountref.ilike.%${search.trim()}%`
      )
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching suppliers:', error)
    } else {
      setSuppliers(data || [])
    }

    setLoading(false)
  }, [search, activeFilter])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Suppliers</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${suppliers.length} supplier${suppliers.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          className="pf-btn-primary"
          onClick={() => router.push('/suppliers/new')}
        >
          + New Supplier
        </button>
      </div>

      {/* Filters */}
      <div className="pf-filters">
        <input
          type="text"
          placeholder="Search name, contact, email, or account ref…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pf-input pf-search"
        />

        <div className="pf-toggle-group">
          {(['active', 'all', 'inactive'] as const).map((val) => (
            <button
              key={val}
              onClick={() => setActiveFilter(val)}
              className={`pf-toggle ${activeFilter === val ? 'pf-toggle-on' : ''}`}
            >
              {val.charAt(0).toUpperCase() + val.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading suppliers…</div>
        ) : suppliers.length === 0 ? (
          <div className="pf-empty">No suppliers found.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>Supplier Name</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Account Ref</th>
                <th className="pf-col-right">Lead Time</th>
                <th className="pf-col-center">Active</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr
                  key={s.supplierid}
                  className="pf-row"
                  onClick={() => router.push(`/suppliers/${s.supplierid}`)}
                >
                  <td className="pf-productname">{s.suppliername}</td>
                  <td className="pf-category">{s.contactname || '—'}</td>
                  <td className="pf-category">{s.email || '—'}</td>
                  <td className="pf-category">{s.phone || '—'}</td>
                  <td className="pf-sku">{s.accountref || '—'}</td>
                  <td className="pf-col-right pf-category">
                    {s.leadtimedays != null ? `${s.leadtimedays}d` : '—'}
                  </td>
                  <td className="pf-col-center">
                    <span className={`pf-dot ${s.isactive ? 'pf-dot-on' : 'pf-dot-off'}`} />
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
