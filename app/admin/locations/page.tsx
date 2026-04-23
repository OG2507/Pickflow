'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Location = {
  locationid: number
  locationcode: string
  locationname: string | null
  locationtype: string | null
  zone: string | null
  isactive: boolean
  pickpriority: number
}

const LOCATION_TYPES = ['Picking Bin', 'Overflow', 'Despatch', 'Returns', 'Other']
const PAGE_SIZE = 50

const emptyLocation = {
  locationcode: '',
  locationname: '',
  locationtype: '',
  zone: '',
  isactive: true,
  pickpriority: '0',
}

export default function LocationsPage() {
  const [locations, setLocations]   = useState<Location[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage]             = useState(0)
  const [loading, setLoading]       = useState(true)
  const [editingId, setEditingId]   = useState<number | null>(null)
  const [editForm, setEditForm]     = useState<Partial<Location>>({})
  const [saving, setSaving]         = useState(false)
  const [showNew, setShowNew]       = useState(false)
  const [newForm, setNewForm]       = useState({ ...emptyLocation })
  const [newErrors, setNewErrors]   = useState<Record<string, string>>({})
  const [error, setError]           = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [search, setSearch]         = useState('')
  const [filterType, setFilterType] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = (val: string) => {
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(val)
      setPage(0)
    }, 300)
  }

  // ── Server-side fetch ──────────────────────────────────────────
  const fetchLocations = useCallback(async (pageNum: number) => {
    setLoading(true)
    setError(null)

    const from = pageNum * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let query = supabase
      .from('tbllocations')
      .select('*', { count: 'exact' })
      .order('locationcode')
      .range(from, to)

    if (!showInactive) query = query.eq('isactive', true)
    if (filterType)    query = query.eq('locationtype', filterType)
    if (debouncedSearch.trim()) {
      const s = debouncedSearch.trim()
      query = query.or(
        `locationcode.ilike.%${s}%,locationname.ilike.%${s}%,zone.ilike.%${s}%`
      )
    }

    const { data, error, count } = await query

    if (error) {
      setError(error.message)
    } else {
      setLocations(data || [])
      setTotalCount(count || 0)
    }
    setLoading(false)
  }, [showInactive, filterType, debouncedSearch])

  useEffect(() => {
    fetchLocations(page)
  }, [fetchLocations, page])

  useEffect(() => { setPage(0) }, [showInactive, filterType])

  // ── Edit existing ──────────────────────────────────────────────
  const startEdit = (loc: Location) => {
    setEditingId(loc.locationid)
    setEditForm({ ...loc })
    setShowNew(false)
  }

  const cancelEdit = () => { setEditingId(null); setEditForm({}) }

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setEditForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('tbllocations')
      .update({
        locationcode: editForm.locationcode,
        locationname: editForm.locationname || null,
        locationtype: editForm.locationtype || null,
        zone:         editForm.zone || null,
        isactive:     editForm.isactive,
        pickpriority: parseInt(String(editForm.pickpriority)) || 0,
      })
      .eq('locationid', editingId)

    if (error) {
      setError('Save failed: ' + error.message)
    } else {
      const updated: Location = {
        locationid:   editingId,
        locationcode: editForm.locationcode!,
        locationname: editForm.locationname || null,
        locationtype: editForm.locationtype || null,
        zone:         editForm.zone || null,
        isactive:     editForm.isactive ?? true,
        pickpriority: parseInt(String(editForm.pickpriority)) || 0,
      }
      setLocations((prev) => prev.map((l) => l.locationid === editingId ? updated : l))
      setEditingId(null)
      setEditForm({})
    }
    setSaving(false)
  }

  // ── New location ───────────────────────────────────────────────
  const handleNewChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setNewForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    if (newErrors[name]) setNewErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const saveNew = async () => {
    if (!newForm.locationcode.trim()) { setNewErrors({ locationcode: 'Code is required' }); return }
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('tbllocations')
      .insert({
        locationcode: newForm.locationcode.trim().toUpperCase(),
        locationname: newForm.locationname.trim() || null,
        locationtype: newForm.locationtype || null,
        zone:         newForm.zone.trim() || null,
        isactive:     newForm.isactive,
        pickpriority: parseInt(newForm.pickpriority) || 0,
      })

    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        setNewErrors({ locationcode: 'This location code already exists' })
      } else {
        setError('Save failed: ' + error.message)
      }
    } else {
      setShowNew(false)
      setNewForm({ ...emptyLocation })
      await fetchLocations(page)
    }
    setSaving(false)
  }

  const cancelNew = () => { setShowNew(false); setNewForm({ ...emptyLocation }); setNewErrors({}) }

  const toggleActive = async (loc: Location) => {
    const { error } = await supabase
      .from('tbllocations')
      .update({ isactive: !loc.isactive })
      .eq('locationid', loc.locationid)

    if (error) {
      setError(error.message)
    } else if (!showInactive && loc.isactive) {
      // Deactivated while hiding inactive — remove from current page
      setLocations((prev) => prev.filter((l) => l.locationid !== loc.locationid))
      setTotalCount((c) => c - 1)
    } else {
      setLocations((prev) => prev.map((l) => l.locationid === loc.locationid ? { ...l, isactive: !l.isactive } : l))
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const pageStart  = totalCount === 0 ? 0 : page * PAGE_SIZE + 1
  const pageEnd    = Math.min((page + 1) * PAGE_SIZE, totalCount)

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => window.history.back()}>← Admin</button>
          <h1 className="pf-page-title">Locations</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : totalCount === 0 ? 'No locations' : `${pageStart}–${pageEnd} of ${totalCount}`}
          </p>
        </div>
        <div className="pf-header-actions">
          <input
            className="pf-search"
            type="search"
            placeholder="Search code, name, zone…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <select className="pf-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All types</option>
            {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="pf-toggle-label">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          <button className="pf-btn-primary" onClick={() => { setShowNew(true); setEditingId(null) }} disabled={showNew}>
            + New Location
          </button>
        </div>
      </div>

      {error && <div className="pf-alert-error">{error}</div>}

      {/* New location form */}
      {showNew && (
        <div className="pf-card pf-new-band-form">
          <h2 className="pf-card-title">New Location</h2>
          <div className="pf-band-form-grid">
            <div className="pf-field">
              <label className="pf-label">Code <span className="pf-required">*</span></label>
              <input
                className={`pf-input pf-input-mono ${newErrors.locationcode ? 'pf-input-error' : ''}`}
                name="locationcode" value={newForm.locationcode} onChange={handleNewChange}
                placeholder="e.g. BIN-B01" autoFocus
              />
              {newErrors.locationcode && <span className="pf-field-error">{newErrors.locationcode}</span>}
            </div>
            <div className="pf-field">
              <label className="pf-label">Name</label>
              <input className="pf-input" name="locationname" value={newForm.locationname} onChange={handleNewChange} placeholder="e.g. Picking Bin B01" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Type</label>
              <select className="pf-input" name="locationtype" value={newForm.locationtype} onChange={handleNewChange}>
                <option value="">— Select type —</option>
                {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="pf-field">
              <label className="pf-label">Zone</label>
              <input className="pf-input" name="zone" value={newForm.zone} onChange={handleNewChange} placeholder="e.g. Main Warehouse" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Pick Priority</label>
              <input className="pf-input pf-input-num" type="number" min="0" name="pickpriority" value={newForm.pickpriority} onChange={handleNewChange} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '0.2rem', display: 'block' }}>
                0 = picking bin (first), 1 = overflow, 99 = goods in (never picked)
              </span>
            </div>
          </div>
          <div className="pf-band-form-actions">
            <button className="pf-btn-secondary" onClick={cancelNew}>Cancel</button>
            <button className="pf-btn-primary" onClick={saveNew} disabled={saving}>{saving ? 'Saving…' : 'Save Location'}</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading locations…</div>
        ) : locations.length === 0 ? (
          <div className="pf-empty">No locations match your search.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Zone</th>
                <th className="pf-col-center">Priority</th>
                <th className="pf-col-center">Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) =>
                editingId === loc.locationid ? (
                  <tr key={loc.locationid} className="pf-row-editing">
                    <td><input className="pf-input pf-input-sm pf-input-mono" name="locationcode" value={editForm.locationcode || ''} onChange={handleEditChange} /></td>
                    <td><input className="pf-input pf-input-sm" name="locationname" value={editForm.locationname || ''} onChange={handleEditChange} /></td>
                    <td>
                      <select className="pf-input pf-input-sm" name="locationtype" value={editForm.locationtype || ''} onChange={handleEditChange}>
                        <option value="">—</option>
                        {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td><input className="pf-input pf-input-sm" name="zone" value={editForm.zone || ''} onChange={handleEditChange} /></td>
                    <td className="pf-col-center">
                      <input className="pf-input pf-input-sm pf-input-num" style={{ width: '60px' }} type="number" min="0" name="pickpriority" value={editForm.pickpriority ?? 0} onChange={handleEditChange} />
                    </td>
                    <td className="pf-col-center">
                      <input type="checkbox" name="isactive" checked={editForm.isactive ?? true} onChange={handleEditChange} style={{ accentColor: 'var(--accent)' }} />
                    </td>
                    <td>
                      <div className="pf-row-actions">
                        <button className="pf-btn-save" onClick={saveEdit} disabled={saving}>{saving ? '…' : 'Save'}</button>
                        <button className="pf-btn-cancel-sm" onClick={cancelEdit}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={loc.locationid} className="pf-row">
                    <td className="pf-sku">{loc.locationcode}</td>
                    <td className="pf-productname">{loc.locationname || '—'}</td>
                    <td className="pf-category">{loc.locationtype || '—'}</td>
                    <td className="pf-category">{loc.zone || '—'}</td>
                    <td className="pf-col-center pf-category">{loc.pickpriority}</td>
                    <td className="pf-col-center">
                      <span className={`pf-dot ${loc.isactive ? 'pf-dot-on' : 'pf-dot-off'}`} />
                    </td>
                    <td>
                      <div className="pf-row-actions">
                        <button className="pf-btn-edit" onClick={() => startEdit(loc)}>Edit</button>
                        <button
                          className={loc.isactive ? 'pf-btn-deactivate' : 'pf-btn-activate'}
                          onClick={() => toggleActive(loc)}
                        >
                          {loc.isactive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pf-pagination">
          <button className="pf-btn-secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>
            ← Prev
          </button>
          <span className="pf-pagination-info">Page {page + 1} of {totalPages}</span>
          <button className="pf-btn-secondary" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1 || loading}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
