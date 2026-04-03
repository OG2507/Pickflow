'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type SupplierLink = {
  productsupplierid: number
  supplierid: number
  suppliername: string
  suppliersku: string | null
  unitcost: number
  minorderqty: number
  leadtimedays: number | null
  ispreferred: boolean
}

type Supplier = {
  supplierid: number
  suppliername: string
}

const emptyLink = {
  supplierid: '',
  suppliersku: '',
  unitcost: '',
  minorderqty: '1',
  leadtimedays: '',
  ispreferred: false,
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price)

export default function ProductSuppliersPanel({ productid }: { productid: number }) {
  const [links, setLinks] = useState<SupplierLink[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ ...emptyLink })
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLinks = async () => {
    const { data, error } = await supabase
      .from('tblproductsuppliers')
      .select(`
        productsupplierid,
        supplierid,
        suppliersku,
        unitcost,
        minorderqty,
        leadtimedays,
        ispreferred,
        tblsuppliers (suppliername)
      `)
      .eq('productid', productid)
      .order('ispreferred', { ascending: false })

    if (!error && data) {
      setLinks(
        (data as any[]).map((r) => ({
          productsupplierid: r.productsupplierid,
          supplierid:        r.supplierid,
          suppliername:      r.tblsuppliers?.suppliername || '—',
          suppliersku:       r.suppliersku,
          unitcost:          r.unitcost,
          minorderqty:       r.minorderqty,
          leadtimedays:      r.leadtimedays,
          ispreferred:       r.ispreferred,
        }))
      )
    }
    setLoading(false)
  }

  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from('tblsuppliers')
      .select('supplierid, suppliername')
      .eq('isactive', true)
      .order('suppliername')

    if (data) setSuppliers(data)
  }

  useEffect(() => {
    fetchLinks()
    fetchSuppliers()
  }, [productid])

  const handleAddChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setAddForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
    if (addErrors[name]) setAddErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validateAdd = () => {
    const errors: Record<string, string> = {}
    if (!addForm.supplierid) errors.supplierid = 'Select a supplier'
    return errors
  }

  const saveLink = async () => {
    const errors = validateAdd()
    if (Object.keys(errors).length > 0) {
      setAddErrors(errors)
      return
    }

    setSaving(true)
    setError(null)

    // If marking as preferred, unset all others first
    if (addForm.ispreferred) {
      await supabase
        .from('tblproductsuppliers')
        .update({ ispreferred: false })
        .eq('productid', productid)
    }

    const { error } = await supabase
      .from('tblproductsuppliers')
      .insert({
        productid:    productid,
        supplierid:   parseInt(addForm.supplierid as string),
        suppliersku:  addForm.suppliersku.trim() || null,
        unitcost:     parseFloat(addForm.unitcost) || 0,
        minorderqty:  parseInt(addForm.minorderqty) || 1,
        leadtimedays: addForm.leadtimedays ? parseInt(addForm.leadtimedays) : null,
        ispreferred:  addForm.ispreferred,
      })

    if (error) {
      setError('Failed to add supplier: ' + error.message)
    } else {
      setShowAdd(false)
      setAddForm({ ...emptyLink })
      await fetchLinks()
    }
    setSaving(false)
  }

  const removeLink = async (id: number) => {
    const { error } = await supabase
      .from('tblproductsuppliers')
      .delete()
      .eq('productsupplierid', id)

    if (error) setError('Failed to remove supplier: ' + error.message)
    else await fetchLinks()
  }

  const setPreferred = async (id: number) => {
    // Unset all, then set this one
    await supabase
      .from('tblproductsuppliers')
      .update({ ispreferred: false })
      .eq('productid', productid)

    await supabase
      .from('tblproductsuppliers')
      .update({ ispreferred: true })
      .eq('productsupplierid', id)

    await fetchLinks()
  }

  return (
    <div className="pf-card">
      <div className="pf-panel-header">
        <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          Suppliers
        </h2>
        {!showAdd && (
          <button className="pf-btn-edit" onClick={() => setShowAdd(true)}>
            + Add
          </button>
        )}
      </div>

      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '0.875rem', marginTop: '0.75rem' }} />

      {error && <div className="pf-alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

      {/* Add form */}
      {showAdd && (
        <div className="pf-supplier-add-form">
          <div className="pf-field">
            <label className="pf-label">Supplier <span className="pf-required">*</span></label>
            <select
              className={`pf-input ${addErrors.supplierid ? 'pf-input-error' : ''}`}
              name="supplierid"
              value={addForm.supplierid}
              onChange={handleAddChange}
            >
              <option value="">— Select supplier —</option>
              {suppliers
                .filter((s) => !links.find((l) => l.supplierid === s.supplierid))
                .map((s) => (
                  <option key={s.supplierid} value={s.supplierid}>{s.suppliername}</option>
                ))}
            </select>
            {addErrors.supplierid && <span className="pf-field-error">{addErrors.supplierid}</span>}
          </div>

          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">Supplier SKU</label>
              <input className="pf-input pf-input-mono" name="suppliersku" value={addForm.suppliersku} onChange={handleAddChange} placeholder="Their ref" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Unit Cost (£)</label>
              <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="unitcost" value={addForm.unitcost} onChange={handleAddChange} placeholder="0.00" />
            </div>
          </div>

          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">Min Order Qty</label>
              <input className="pf-input pf-input-num" type="number" min="1" name="minorderqty" value={addForm.minorderqty} onChange={handleAddChange} />
            </div>
            <div className="pf-field">
              <label className="pf-label">Lead Time (days)</label>
              <input className="pf-input pf-input-num" type="number" min="0" name="leadtimedays" value={addForm.leadtimedays} onChange={handleAddChange} />
            </div>
          </div>

          <label className="pf-checkbox-row" style={{ marginBottom: '0.75rem' }}>
            <input type="checkbox" name="ispreferred" checked={addForm.ispreferred} onChange={handleAddChange} />
            <span>
              <strong>Preferred supplier</strong>
            </span>
          </label>

          <div className="pf-supplier-form-actions">
            <button className="pf-btn-cancel-sm" onClick={() => { setShowAdd(false); setAddForm({ ...emptyLink }) }}>Cancel</button>
            <button className="pf-btn-save" onClick={saveLink} disabled={saving}>
              {saving ? '…' : 'Add Supplier'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="pf-stock-loading">Loading…</div>
      ) : links.length === 0 && !showAdd ? (
        <div className="pf-stock-empty">No suppliers linked.</div>
      ) : links.length > 0 ? (
        <div className="pf-supplier-list">
          {links.map((link) => (
            <div key={link.productsupplierid} className={`pf-supplier-row ${link.ispreferred ? 'pf-supplier-preferred' : ''}`}>
              <div className="pf-supplier-row-top">
                <span className="pf-supplier-name">{link.suppliername}</span>
                {link.ispreferred && <span className="pf-badge pf-badge-preferred">Preferred</span>}
              </div>
              <div className="pf-supplier-row-detail">
                {link.suppliersku && <span>SKU: <code>{link.suppliersku}</code></span>}
                <span>Cost: {formatPrice(link.unitcost)}</span>
                <span>Min qty: {link.minorderqty}</span>
                {link.leadtimedays != null && <span>Lead: {link.leadtimedays}d</span>}
              </div>
              <div className="pf-supplier-row-actions">
                {!link.ispreferred && (
                  <button className="pf-btn-activate" onClick={() => setPreferred(link.productsupplierid)}>
                    Set preferred
                  </button>
                )}
                <button className="pf-btn-deactivate" onClick={() => removeLink(link.productsupplierid)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
