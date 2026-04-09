'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type MethodMap = {
  mappingid: number
  swmethodname: string
  servicecode: string
}

export default function ShippingMethodMapPage() {
  const router = useRouter()
  const [mappings, setMappings] = useState<MethodMap[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New mapping form
  const [newSW, setNewSW] = useState('')
  const [newCode, setNewCode] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingSW, setEditingSW] = useState('')
  const [editingCode, setEditingCode] = useState('')

  const fetchMappings = async () => {
    const { data } = await supabase
      .from('tblshippingmethodmap')
      .select('*')
      .order('swmethodname')
    if (data) setMappings(data)
    setLoading(false)
  }

  useEffect(() => { fetchMappings() }, [])

  const addMapping = async () => {
    if (!newSW.trim() || !newCode.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('tblshippingmethodmap')
      .insert({ swmethodname: newSW.trim(), servicecode: newCode.trim().toUpperCase() })
    if (err) { setError(err.message); setSaving(false); return }
    setNewSW('')
    setNewCode('')
    setSaving(false)
    fetchMappings()
  }

  const saveEdit = async (id: number) => {
    if (!editingSW.trim() || !editingCode.trim()) return
    const { error: err } = await supabase
      .from('tblshippingmethodmap')
      .update({ swmethodname: editingSW.trim(), servicecode: editingCode.trim().toUpperCase() })
      .eq('mappingid', id)
    if (err) { setError(err.message); return }
    setEditingId(null)
    fetchMappings()
  }

  const deleteMapping = async (id: number) => {
    const { error: err } = await supabase
      .from('tblshippingmethodmap')
      .delete()
      .eq('mappingid', id)
    if (err) { setError(err.message); return }
    fetchMappings()
  }

  if (loading) return <div className="pf-page"><div className="pf-loading">Loading…</div></div>

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-btn-ghost" onClick={() => router.push('/admin')}>← Admin</button>
          <h1 className="pf-page-title">Delivery Method Map</h1>
          <p className="pf-page-subtitle">
            Maps Shopwired delivery names to Royal Mail service codes for Click &amp; Drop
          </p>
        </div>
      </div>

      {error && (
        <div className="pf-error-banner" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12 }}>✕</button>
        </div>
      )}

      <div className="pf-card" style={{ maxWidth: 800 }}>

        {/* Add new */}
        <h2 className="pf-card-title">Add New Mapping</h2>
        <div className="pf-field-row" style={{ marginBottom: 20 }}>
          <div className="pf-field">
            <label className="pf-label">Shopwired Delivery Method Name</label>
            <input
              className="pf-input"
              type="text"
              placeholder="e.g. 24 Hour Tracked Less Than 2kg"
              value={newSW}
              onChange={(e) => setNewSW(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMapping()}
            />
          </div>
          <div className="pf-field" style={{ maxWidth: 180 }}>
            <label className="pf-label">Royal Mail Service Code</label>
            <input
              className="pf-input pf-input-mono"
              type="text"
              placeholder="e.g. TOLP24"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMapping()}
            />
          </div>
          <div className="pf-field" style={{ maxWidth: 100, alignSelf: 'flex-end' }}>
            <button
              className="pf-btn-primary"
              onClick={addMapping}
              disabled={saving || !newSW.trim() || !newCode.trim()}
            >
              Add
            </button>
          </div>
        </div>

        <p className="pf-card-note" style={{ marginBottom: 20 }}>
          The Shopwired name must match exactly — copy it from your Shopwired delivery rate settings.
          Service codes can be found in your Click &amp; Drop account under Settings → Services.
        </p>

        {/* Existing mappings */}
        <h2 className="pf-card-title">Current Mappings</h2>
        {mappings.length === 0 ? (
          <p className="pf-empty">No mappings yet.</p>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>Shopwired Delivery Method</th>
                <th>Service Code</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.mappingid} className="pf-row">
                  <td>
                    {editingId === m.mappingid ? (
                      <input
                        className="pf-input pf-input-inline"
                        value={editingSW}
                        onChange={(e) => setEditingSW(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(m.mappingid)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        autoFocus
                      />
                    ) : (
                      m.swmethodname
                    )}
                  </td>
                  <td className="pf-sku">
                    {editingId === m.mappingid ? (
                      <input
                        className="pf-input pf-input-inline pf-input-mono"
                        value={editingCode}
                        onChange={(e) => setEditingCode(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(m.mappingid)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        style={{ maxWidth: 140 }}
                      />
                    ) : (
                      m.servicecode
                    )}
                  </td>
                  <td className="pf-col-actions">
                    {editingId === m.mappingid ? (
                      <>
                        <button className="pf-btn-xs pf-btn-primary" onClick={() => saveEdit(m.mappingid)}>Save</button>
                        <button className="pf-btn-xs pf-btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="pf-btn-xs pf-btn-ghost" onClick={() => { setEditingId(m.mappingid); setEditingSW(m.swmethodname); setEditingCode(m.servicecode) }}>Edit</button>
                        <button className="pf-btn-xs pf-btn-danger" onClick={() => deleteMapping(m.mappingid)}>Delete</button>
                      </>
                    )}
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
