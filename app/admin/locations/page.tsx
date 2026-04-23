'use client'

import { useEffect, useState } from 'react'
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

const emptyLocation = {
  locationcode: '',
  locationname: '',
  locationtype: '',
  zone: '',
  isactive: true,
  pickpriority: '0',
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<Location>>({})
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ ...emptyLocation })
  const [newErrors, setNewErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')

  const fetchLocations = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tbllocations')
      .select('*')
      .order('locationcode')

    if (error) setError(error.message)
    else setLocations(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchLocations()
  }, [])

  // ── Edit existing ──────────────────────────────────────────────
  const startEdit = (loc: Location) => {
    setEditingId(loc.locationid)
    setEditForm({ ...loc })
    setShowNew(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setEditForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
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
      setEditingId(null)
      setEditForm({})
      await fetchLocations()
    }
    setSaving(false)
  }

  // ── New location ───────────────────────────────────────────────
  const handleNewChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setNewForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
    if (newErrors[name]) {
      setNewErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const validateNew = () => {
    const errors: Record<string, string> = {}
    if (!newForm.locationcode.trim()) errors.locationcode = 'Code is required'
    return errors
  }

  const saveNew = async () => {
    const errors = validateNew()
    if (Object.keys(errors).length > 0) {
      setNewErrors(errors)
      return
    }

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
      await fetchLocations()
    }
    setSaving(false)
  }

  const cancelNew = () => {
    setShowNew(false)
    setNewForm({ ...emptyLocation })
    setNewErrors({})
  }

  const toggleActive = async (loc: Location) => {
    const { error } = await supabase
      .from('tbllocations')
      .update({ isactive: !loc.isactive })
      .eq('locationid', loc.locationid)

    if (error) setError(error.message)
    else await fetchLocations()
  }

  const filteredLocations = locations.filter((loc) => {
    if (!showInactive && !loc.isactive) return false
    if (filterType && loc.locationtype !== filterType) return false
    if (search) {
      const s = search.toLowerCase()
      if (
        !loc.locationcode.toLowerCase().includes(s) &&
        !(loc.locationname || '').toLowerCase().includes(s) &&
        !(loc.zone || '').toLowerCase().includes(s)
      ) return false
    }
    return true
  })

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => window.history.back()}>
            ← Admin
          </button>
          <h1 className="pf-page-title">Locations</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${filteredLocations.length} of ${locations.filter(l => showInactive || l.isactive).length} location${locations.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="pf-header-actions">
          <input
            className="pf-search"
            type="search"
            placeholder="Search code, name, zone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="pf-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">All types</option>
            {LOCATION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <label className="pf-toggle-label">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <button
            className="pf-btn-primary"
            onClick={() => { setShowNew(true); setEditingId(null) }}
            disabled={showNew}
          >
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
                name="locationcode"
                value={newForm.locationcode}
                onChange={handleNewChange}
                placeholder="e.g. BIN-B01"
                autoFocus
              />
              {newErrors.locationcode && <span className="pf-field-error">{newErrors.locationcode}</span>}
            </div>
            <div className="pf-field">
              <label className="pf-label">Name</label>
              <input
                className="pf-input"
                name="locationname"
                value={newForm.locationname}
                onChange={handleNewChange}
                placeholder="e.g. Picking Bin B01"
              />
            </div>
            <div className="pf-field">
              <label className="pf-label">Type</label>
              <select className="pf-input" name="locationtype" value={newForm.locationtype} onChange={handleNewChange}>
                <option value="">— Select type —</option>
                {LOCATION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="pf-field">
              <label className="pf-label">Zone</label>
              <input
                className="pf-input"
                name="zone"
                value={newForm.zone}
                onChange={handleNewChange}
                placeholder="e.g. Main Warehouse"
              />
            </div>
            <div className="pf-field">
              <label className="pf-label">Pick Priority</label>
              <input
                className="pf-input pf-input-num"
                type="number"
                min="0"
                name="pickpriority"
                value={newForm.pickpriority}
                onChange={handleNewChange}
                placeholder="0 = pick first"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '0.2rem', display: 'block' }}>
                0 = picking bin (first), 1 = overflow, 99 = goods in (never picked)
              </span>
            </div>
          </div>
          <div className="pf-band-form-actions">
            <button className="pf-btn-secondary" onClick={cancelNew}>Cancel</button>
            <button className="pf-btn-primary" onClick={saveNew} disabled={saving}>
              {saving ? 'Saving…' : 'Save Location'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading locations…</div>
        ) : filteredLocations.length === 0 ? (
          <div className="pf-empty">{locations.length === 0 ? 'No locations found.' : 'No locations match your search.'}</div>
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
              {filteredLocations.map((loc) =>
                editingId === loc.locationid ? (
                  <tr key={loc.locationid} className="pf-row-editing">
                    <td>
                      <input
                        className="pf-input pf-input-sm pf-input-mono"
                        name="locationcode"
                        value={editForm.locationcode || ''}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        className="pf-input pf-input-sm"
                        name="locationname"
                        value={editForm.locationname || ''}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <select
                        className="pf-input pf-input-sm"
                        name="locationtype"
                        value={editForm.locationtype || ''}
                        onChange={handleEditChange}
                      >
                        <option value="">—</option>
                        {LOCATION_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="pf-input pf-input-sm"
                        name="zone"
                        value={editForm.zone || ''}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td className="pf-col-center">
                      <input
                        className="pf-input pf-input-sm pf-input-num"
                        style={{ width: '60px' }}
                        type="number"
                        min="0"
                        name="pickpriority"
                        value={editForm.pickpriority ?? 0}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td className="pf-col-center">
                      <input
                        type="checkbox"
                        name="isactive"
                        checked={editForm.isactive ?? true}
                        onChange={handleEditChange}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                    </td>
                    <td>
                      <div className="pf-row-actions">
                        <button className="pf-btn-save" onClick={saveEdit} disabled={saving}>
                          {saving ? '…' : 'Save'}
                        </button>
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
    </div>
  )
}
