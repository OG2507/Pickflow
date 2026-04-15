'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Client } from '@/lib/types'

export default function ClientsPage() {
  const router = useRouter()
  const [allClients, setAllClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active')

  // Fetch from Supabase only when activeFilter changes — not on every keystroke
  const fetchClients = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('tblclients')
      .select('*')
      .order('companyname', { ascending: true })

    if (activeFilter === 'active') query = query.eq('isactive', true)
    if (activeFilter === 'inactive') query = query.eq('isactive', false)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching clients:', error)
    } else {
      setAllClients(data || [])
    }

    setLoading(false)
  }, [activeFilter])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  // Search filtered in memory — no round trips
  const filteredClients = useMemo(() => {
    if (!search.trim()) return allClients
    const term = search.trim().toLowerCase()
    return allClients.filter((c) =>
      (c.companyname || '').toLowerCase().includes(term) ||
      (c.firstname || '').toLowerCase().includes(term) ||
      (c.lastname || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term) ||
      (c.clientcode || '').toLowerCase().includes(term)
    )
  }, [allClients, search])

  const displayName = (c: Client) =>
    c.companyname?.trim() || `${c.firstname || ''} ${c.lastname || ''}`.trim() || '—'

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Clients</h1>
          <p className="pf-page-subtitle">
            {loading
              ? '—'
              : `${filteredClients.length} client${filteredClients.length !== 1 ? 's' : ''}${search ? ` of ${allClients.length}` : ''}`}
          </p>
        </div>
        <button
          className="pf-btn-primary"
          onClick={() => router.push('/clients/new')}
        >
          + New Client
        </button>
      </div>

      {/* Filters */}
      <div className="pf-filters">
        <input
          type="text"
          placeholder="Search name, email, or client code…"
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
          <div className="pf-loading">Loading clients…</div>
        ) : filteredClients.length === 0 ? (
          <div className="pf-empty">No clients found.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Town</th>
                <th className="pf-col-center">Wholesale</th>
                <th className="pf-col-center">Blind Ship</th>
                <th className="pf-col-center">Active</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c) => (
                <tr
                  key={c.clientid}
                  className="pf-row"
                  onClick={() => router.push(`/clients/${c.clientid}`)}
                >
                  <td className="pf-sku">{c.clientcode || '—'}</td>
                  <td className="pf-productname">{displayName(c)}</td>
                  <td className="pf-category">{c.email || '—'}</td>
                  <td className="pf-category">{c.phone || '—'}</td>
                  <td className="pf-category">{c.town || '—'}</td>
                  <td className="pf-col-center">
                    <span className={`pf-dot ${c.isreducedwholesale ? 'pf-dot-on' : 'pf-dot-off'}`} />
                  </td>
                  <td className="pf-col-center">
                    <span className={`pf-dot ${c.defaultblindship ? 'pf-dot-on' : 'pf-dot-off'}`} />
                  </td>
                  <td className="pf-col-center">
                    <span className={`pf-dot ${c.isactive ? 'pf-dot-on' : 'pf-dot-off'}`} />
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
