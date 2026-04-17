'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logActivity, logChanges } from '@/lib/activity'
import type { PricingCode } from '@/lib/types'

const emptyBand = {
  pricingcode: '',
  description: '',
  salesprice: '',
  wholesaleprice: '',
  reducedwholesaleprice: '',
  isactive: true,
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price)

export default function PriceBandsPage() {
  const [bands, setBands] = useState<PricingCode[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<PricingCode>>({})
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ ...emptyBand })
  const [newErrors, setNewErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const fetchBands = async () => {
    setLoading(true)
    let query = supabase
      .from('tblpricingcodes')
      .select('*')
      .order('pricingcode')

    if (!showInactive) query = query.eq('isactive', true)

    const { data, error } = await query
    if (error) setError(error.message)
    else setBands(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchBands()
  }, [showInactive])

  // ── Edit existing ──────────────────────────────────────────────
  const startEdit = (band: PricingCode) => {
    setEditingId(band.pricingcodeid)
    setEditForm({ ...band })
    setShowNew(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    const before = bands.find(b => b.pricingcodeid === editingId)
    const after = {
      pricingcode:           editForm.pricingcode,
      description:           editForm.description || null,
      salesprice:            parseFloat(String(editForm.salesprice)) || 0,
      wholesaleprice:        parseFloat(String(editForm.wholesaleprice)) || 0,
      reducedwholesaleprice: parseFloat(String(editForm.reducedwholesaleprice)) || 0,
      isactive:              editForm.isactive,
    }

    const { error } = await supabase
      .from('tblpricingcodes')
      .update(after)
      .eq('pricingcodeid', editingId)

    if (error) {
      setError('Save failed: ' + error.message)
    } else {
      logChanges({
        entityType:  'price_band',
        entityId:    editingId,
        entityLabel: after.pricingcode || before?.pricingcode || `Band ${editingId}`,
        before:      before as any,
        after:       after as any,
      })
      setEditingId(null)
      setEditForm({})
      await fetchBands()
    }
    setSaving(false)
  }

  // ── New band ───────────────────────────────────────────────────
  const handleNewChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
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
    if (!newForm.pricingcode.trim()) errors.pricingcode = 'Code is required'
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

    const code = newForm.pricingcode.trim().toUpperCase()
    const { data: inserted, error } = await supabase
      .from('tblpricingcodes')
      .insert({
        pricingcode:           code,
        description:           newForm.description.trim() || null,
        salesprice:            parseFloat(newForm.salesprice) || 0,
        wholesaleprice:        parseFloat(newForm.wholesaleprice) || 0,
        reducedwholesaleprice: parseFloat(newForm.reducedwholesaleprice) || 0,
        isactive:              newForm.isactive,
      })
      .select('pricingcodeid')
      .single()

    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        setNewErrors({ pricingcode: 'This code already exists' })
      } else {
        setError('Save failed: ' + error.message)
      }
    } else {
      logActivity({
        action:      'create',
        entityType:  'price_band',
        entityId:    inserted?.pricingcodeid ?? 'new',
        entityLabel: code,
      })
      setShowNew(false)
      setNewForm({ ...emptyBand })
      await fetchBands()
    }
    setSaving(false)
  }

  const cancelNew = () => {
    setShowNew(false)
    setNewForm({ ...emptyBand })
    setNewErrors({})
  }

  // ── Toggle active ──────────────────────────────────────────────
  const toggleActive = async (band: PricingCode) => {
    const nextActive = !band.isactive
    const { error } = await supabase
      .from('tblpricingcodes')
      .update({ isactive: nextActive })
      .eq('pricingcodeid', band.pricingcodeid)

    if (error) setError(error.message)
    else {
      logActivity({
        action:      'update',
        entityType:  'price_band',
        entityId:    band.pricingcodeid,
        entityLabel: band.pricingcode,
        fieldName:   'isactive',
        oldValue:    band.isactive,
        newValue:    nextActive,
      })
      await fetchBands()
    }
  }

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => window.history.back()}>
            ← Admin
          </button>
          <h1 className="pf-page-title">Price Bands</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${bands.length} band${bands.length !== 1 ? 's' : ''}`}
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
            + New Price Band
          </button>
        </div>
      </div>

      {error && <div className="pf-alert-error">{error}</div>}

      {/* New band form */}
      {showNew && (
        <div className="pf-card pf-new-band-form">
          <h2 className="pf-card-title">New Price Band</h2>
          <div className="pf-band-form-grid">
            <div className="pf-field">
              <label className="pf-label">Code <span className="pf-required">*</span></label>
              <input
                className={`pf-input pf-input-mono ${newErrors.pricingcode ? 'pf-input-error' : ''}`}
                name="pricingcode"
                value={newForm.pricingcode}
                onChange={handleNewChange}
                placeholder="e.g. PKG-C"
                autoFocus
              />
              {newErrors.pricingcode && <span className="pf-field-error">{newErrors.pricingcode}</span>}
            </div>
            <div className="pf-field">
              <label className="pf-label">Description</label>
              <input
                className="pf-input"
                name="description"
                value={newForm.description}
                onChange={handleNewChange}
                placeholder="e.g. Budget Packaging"
              />
            </div>
            <div className="pf-field">
              <label className="pf-label">Retail (£) ex VAT</label>
              <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="salesprice" value={newForm.salesprice} onChange={handleNewChange} placeholder="0.00" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Wholesale (£) ex VAT</label>
              <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="wholesaleprice" value={newForm.wholesaleprice} onChange={handleNewChange} placeholder="0.00" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Reduced Wholesale (£) ex VAT</label>
              <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="reducedwholesaleprice" value={newForm.reducedwholesaleprice} onChange={handleNewChange} placeholder="0.00" />
            </div>
          </div>
          <div className="pf-band-form-actions">
            <button className="pf-btn-secondary" onClick={cancelNew}>Cancel</button>
            <button className="pf-btn-primary" onClick={saveNew} disabled={saving}>
              {saving ? 'Saving…' : 'Save Price Band'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading price bands…</div>
        ) : bands.length === 0 ? (
          <div className="pf-empty">No price bands found.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th className="pf-col-right">Retail</th>
                <th className="pf-col-right">Wholesale</th>
                <th className="pf-col-right">Reduced Wholesale</th>
                <th className="pf-col-center">Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bands.map((band) =>
                editingId === band.pricingcodeid ? (
                  <tr key={band.pricingcodeid} className="pf-row-editing">
                    <td>
                      <input
                        className="pf-input pf-input-sm pf-input-mono"
                        name="pricingcode"
                        value={editForm.pricingcode || ''}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        className="pf-input pf-input-sm"
                        name="description"
                        value={editForm.description || ''}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        className="pf-input pf-input-sm pf-input-num"
                        type="number" step="0.01" min="0"
                        name="salesprice"
                        value={editForm.salesprice ?? ''}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        className="pf-input pf-input-sm pf-input-num"
                        type="number" step="0.01" min="0"
                        name="wholesaleprice"
                        value={editForm.wholesaleprice ?? ''}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        className="pf-input pf-input-sm pf-input-num"
                        type="number" step="0.01" min="0"
                        name="reducedwholesaleprice"
                        value={editForm.reducedwholesaleprice ?? ''}
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
                  <tr key={band.pricingcodeid} className="pf-row">
                    <td className="pf-sku">{band.pricingcode}</td>
                    <td className="pf-category">{band.description || '—'}</td>
                    <td className="pf-col-right pf-price">{formatPrice(band.salesprice)}</td>
                    <td className="pf-col-right pf-price">{formatPrice(band.wholesaleprice)}</td>
                    <td className="pf-col-right pf-price">{formatPrice(band.reducedwholesaleprice)}</td>
                    <td className="pf-col-center">
                      <span className={`pf-dot ${band.isactive ? 'pf-dot-on' : 'pf-dot-off'}`} />
                    </td>
                    <td>
                      <div className="pf-row-actions">
                        <button className="pf-btn-edit" onClick={() => startEdit(band)}>Edit</button>
                        <button
                          className={band.isactive ? 'pf-btn-deactivate' : 'pf-btn-activate'}
                          onClick={() => toggleActive(band)}
                        >
                          {band.isactive ? 'Deactivate' : 'Activate'}
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
