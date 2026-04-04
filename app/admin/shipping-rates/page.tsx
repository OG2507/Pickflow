'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type ShippingRate = {
  shippingrateid: number
  methodname: string
  carrier: string | null
  price: number
  isactive: boolean
  displayorder: number
  minweightg: number | null
  maxweightg: number | null
  servicecode: string | null
  notes: string | null
}

const emptyRate = {
  methodname:   '',
  carrier:      'Royal Mail',
  price:        '',
  isactive:     true,
  displayorder: '',
  minweightg:   '',
  maxweightg:   '',
  servicecode:  '',
  notes:        '',
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price)

export default function ShippingRatesPage() {
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<ShippingRate>>({})
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ ...emptyRate })
  const [newErrors, setNewErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const fetchRates = async () => {
    setLoading(true)
    let query = supabase
      .from('tblshippingrates')
      .select('*')
      .order('displayorder')

    if (!showInactive) query = query.eq('isactive', true)

    const { data, error } = await query
    if (error) setError(error.message)
    else setRates(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchRates()
  }, [showInactive])

  // ── Edit existing ──────────────────────────────────────────────
  const startEdit = (rate: ShippingRate) => {
    setEditingId(rate.shippingrateid)
    setEditForm({ ...rate })
    setShowNew(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value, type, checked } = e.target
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
      .from('tblshippingrates')
      .update({
        methodname:   editForm.methodname,
        carrier:      editForm.carrier || null,
        price:        parseFloat(String(editForm.price)) || 0,
        isactive:     editForm.isactive,
        displayorder: parseInt(String(editForm.displayorder)) || 99,
        minweightg:   editForm.minweightg ? parseInt(String(editForm.minweightg)) : null,
        maxweightg:   editForm.maxweightg ? parseInt(String(editForm.maxweightg)) : null,
        servicecode:  editForm.servicecode || null,
        notes:        editForm.notes || null,
      })
      .eq('shippingrateid', editingId)

    if (error) {
      setError('Save failed: ' + error.message)
    } else {
      setEditingId(null)
      setEditForm({})
      await fetchRates()
    }
    setSaving(false)
  }

  // ── New rate ───────────────────────────────────────────────────
  const handleNewChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value, type, checked } = e.target
    setNewForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
    if (newErrors[name]) setNewErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validateNew = () => {
    const errors: Record<string, string> = {}
    if (!newForm.methodname.trim()) errors.methodname = 'Method name is required'
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
      .from('tblshippingrates')
      .insert({
        methodname:   newForm.methodname.trim(),
        carrier:      newForm.carrier.trim() || null,
        price:        parseFloat(newForm.price) || 0,
        isactive:     newForm.isactive,
        displayorder: parseInt(newForm.displayorder) || 99,
        minweightg:   newForm.minweightg ? parseInt(newForm.minweightg) : null,
        maxweightg:   newForm.maxweightg ? parseInt(newForm.maxweightg) : null,
        servicecode:  newForm.servicecode.trim() || null,
        notes:        newForm.notes.trim() || null,
      })

    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        setNewErrors({ methodname: 'This method name already exists' })
      } else {
        setError('Save failed: ' + error.message)
      }
    } else {
      setShowNew(false)
      setNewForm({ ...emptyRate })
      await fetchRates()
    }
    setSaving(false)
  }

  const cancelNew = () => {
    setShowNew(false)
    setNewForm({ ...emptyRate })
    setNewErrors({})
  }

  const toggleActive = async (rate: ShippingRate) => {
    const { error } = await supabase
      .from('tblshippingrates')
      .update({ isactive: !rate.isactive })
      .eq('shippingrateid', rate.shippingrateid)

    if (error) setError(error.message)
    else await fetchRates()
  }

  const formatWeight = (min: number | null, max: number | null) => {
    if (!min && !max) return 'Any weight'
    if (!min) return `Up to ${max}g`
    if (!max) return `${min}g+`
    return `${min}g – ${max}g`
  }

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => window.history.back()}>
            ← Admin
          </button>
          <h1 className="pf-page-title">Shipping Rates</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${rates.length} method${rates.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="pf-header-actions">
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
            + New Rate
          </button>
        </div>
      </div>

      {error && <div className="pf-alert-error">{error}</div>}

      {/* New rate form */}
      {showNew && (
        <div className="pf-card pf-new-band-form">
          <h2 className="pf-card-title">New Shipping Rate</h2>
          <div className="pf-shipping-form-grid">
            <div className="pf-field">
              <label className="pf-label">Method Name <span className="pf-required">*</span></label>
              <input
                className={`pf-input ${newErrors.methodname ? 'pf-input-error' : ''}`}
                name="methodname"
                value={newForm.methodname}
                onChange={handleNewChange}
                placeholder="e.g. RM 1st Class Small Parcel"
                autoFocus
              />
              {newErrors.methodname && <span className="pf-field-error">{newErrors.methodname}</span>}
            </div>
            <div className="pf-field">
              <label className="pf-label">Carrier</label>
              <input
                className="pf-input"
                name="carrier"
                value={newForm.carrier}
                onChange={handleNewChange}
                placeholder="e.g. Royal Mail"
              />
            </div>
            <div className="pf-field">
              <label className="pf-label">Price (£)</label>
              <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="price" value={newForm.price} onChange={handleNewChange} placeholder="0.00" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Min Weight (g)</label>
              <input className="pf-input pf-input-num" type="number" min="0" name="minweightg" value={newForm.minweightg} onChange={handleNewChange} placeholder="Leave blank for no minimum" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Max Weight (g)</label>
              <input className="pf-input pf-input-num" type="number" min="0" name="maxweightg" value={newForm.maxweightg} onChange={handleNewChange} placeholder="Leave blank for no maximum" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Service Code</label>
              <input className="pf-input pf-input-mono" name="servicecode" value={newForm.servicecode} onChange={handleNewChange} placeholder="e.g. CRL24" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Display Order</label>
              <input className="pf-input pf-input-num" type="number" min="1" name="displayorder" value={newForm.displayorder} onChange={handleNewChange} placeholder="99" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Notes</label>
              <input className="pf-input" name="notes" value={newForm.notes} onChange={handleNewChange} />
            </div>
          </div>
          <div className="pf-band-form-actions">
            <button className="pf-btn-secondary" onClick={cancelNew}>Cancel</button>
            <button className="pf-btn-primary" onClick={saveNew} disabled={saving}>
              {saving ? 'Saving…' : 'Save Rate'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading shipping rates…</div>
        ) : rates.length === 0 ? (
          <div className="pf-empty">No shipping rates found.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Carrier</th>
                <th>Weight Band</th>
                <th>Service Code</th>
                <th className="pf-col-right">Price</th>
                <th className="pf-col-center">Order</th>
                <th className="pf-col-center">Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) =>
                editingId === rate.shippingrateid ? (
                  <tr key={rate.shippingrateid} className="pf-row-editing">
                    <td>
                      <input
                        className="pf-input pf-input-sm"
                        name="methodname"
                        value={editForm.methodname || ''}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        className="pf-input pf-input-sm"
                        name="carrier"
                        value={editForm.carrier || ''}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <input
                          className="pf-input pf-input-sm pf-input-num"
                          style={{ width: '80px' }}
                          type="number" min="0"
                          name="minweightg"
                          value={editForm.minweightg ?? ''}
                          onChange={handleEditChange}
                          placeholder="Min g"
                        />
                        <span className="pf-category">–</span>
                        <input
                          className="pf-input pf-input-sm pf-input-num"
                          style={{ width: '80px' }}
                          type="number" min="0"
                          name="maxweightg"
                          value={editForm.maxweightg ?? ''}
                          onChange={handleEditChange}
                          placeholder="Max g"
                        />
                      </div>
                    </td>
                    <td>
                      <input
                        className="pf-input pf-input-sm pf-input-mono"
                        name="servicecode"
                        value={editForm.servicecode || ''}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        className="pf-input pf-input-sm pf-input-num"
                        style={{ width: '80px' }}
                        type="number" step="0.01" min="0"
                        name="price"
                        value={editForm.price ?? ''}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        className="pf-input pf-input-sm pf-input-num"
                        style={{ width: '60px' }}
                        type="number" min="1"
                        name="displayorder"
                        value={editForm.displayorder ?? ''}
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
                  <tr key={rate.shippingrateid} className="pf-row">
                    <td className="pf-productname">{rate.methodname}</td>
                    <td className="pf-category">{rate.carrier || '—'}</td>
                    <td className="pf-category">{formatWeight(rate.minweightg, rate.maxweightg)}</td>
                    <td className="pf-sku">{rate.servicecode || '—'}</td>
                    <td className="pf-col-right pf-price">{formatPrice(rate.price)}</td>
                    <td className="pf-col-center pf-category">{rate.displayorder}</td>
                    <td className="pf-col-center">
                      <span className={`pf-dot ${rate.isactive ? 'pf-dot-on' : 'pf-dot-off'}`} />
                    </td>
                    <td>
                      <div className="pf-row-actions">
                        <button className="pf-btn-edit" onClick={() => startEdit(rate)}>Edit</button>
                        <button
                          className={rate.isactive ? 'pf-btn-deactivate' : 'pf-btn-activate'}
                          onClick={() => toggleActive(rate)}
                        >
                          {rate.isactive ? 'Deactivate' : 'Activate'}
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

      <div className="pf-shipping-rates-note">
        <strong>Weight bands:</strong> Min and max weights are in grams. Leave both blank for a rate that applies at any weight (e.g. Collection / Free). The order screen will only show rates where the order weight falls within the band.
      </div>
    </div>
  )
}
