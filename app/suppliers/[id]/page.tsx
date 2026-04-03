'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Supplier } from '@/lib/types'

const PAYMENT_TERMS = [
  '',
  '7 days net',
  '14 days net',
  '30 days net',
  '60 days net',
  'Pro forma',
  'Credit card',
  'Other',
]

const COUNTRY_OPTIONS = [
  'United Kingdom',
  'Ireland',
  'France',
  'Germany',
  'Spain',
  'Italy',
  'Netherlands',
  'Belgium',
  'China',
  'United States',
  'Canada',
  'Australia',
  'Other',
]

export default function SupplierDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [form, setForm] = useState<Partial<Supplier>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const fetchSupplier = async () => {
      const { data, error } = await supabase
        .from('tblsuppliers')
        .select('*')
        .eq('supplierid', id)
        .single()

      if (error || !data) {
        setError('Supplier not found.')
      } else {
        setSupplier(data)
        setForm(data)
      }
      setLoading(false)
    }
    fetchSupplier()
  }, [id])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked
             : type === 'number'  ? (value === '' ? null : Number(value))
             : value,
    }))
    setDirty(true)
    setSuccess(false)
  }

  const handleSave = async () => {
    if (!dirty) return
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('tblsuppliers')
      .update({ ...form })
      .eq('supplierid', id)

    if (error) {
      setError('Save failed: ' + error.message)
    } else {
      setDirty(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  if (loading) return <div className="pf-page"><div className="pf-loading">Loading…</div></div>
  if (error && !supplier) return <div className="pf-page"><div className="pf-empty">{error}</div></div>

  return (
    <div className="pf-page">

      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => router.push('/suppliers')}>
            ← Suppliers
          </button>
          <h1 className="pf-page-title">{form.suppliername || 'Supplier'}</h1>
          <p className="pf-page-subtitle">{form.accountref || 'No account ref'}</p>
        </div>
        <div className="pf-header-actions">
          {success && <span className="pf-saved">Saved</span>}
          {error && <span className="pf-error-inline">{error}</span>}
          <button className="pf-btn-secondary" onClick={() => router.push('/suppliers')}>
            Cancel
          </button>
          <button
            className={`pf-btn-primary ${!dirty ? 'pf-btn-disabled' : ''}`}
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="pf-detail-grid">

        {/* LEFT COLUMN */}
        <div className="pf-detail-col">

          <div className="pf-card">
            <h2 className="pf-card-title">Supplier Details</h2>

            <div className="pf-field">
              <label className="pf-label">Supplier Name</label>
              <input className="pf-input" name="suppliername" value={form.suppliername || ''} onChange={handleChange} />
            </div>

            <div className="pf-field">
              <label className="pf-label">Contact Name</label>
              <input className="pf-input" name="contactname" value={form.contactname || ''} onChange={handleChange} />
            </div>

            <div className="pf-field">
              <label className="pf-label">Email</label>
              <input className="pf-input" type="email" name="email" value={form.email || ''} onChange={handleChange} />
            </div>

            <div className="pf-field">
              <label className="pf-label">Phone</label>
              <input className="pf-input" type="tel" name="phone" value={form.phone || ''} onChange={handleChange} />
            </div>

            <div className="pf-field">
              <label className="pf-label">Account Reference</label>
              <input className="pf-input pf-input-mono" name="accountref" value={form.accountref || ''} onChange={handleChange} />
            </div>
          </div>

          <div className="pf-card">
            <h2 className="pf-card-title">Address</h2>

            <div className="pf-field">
              <label className="pf-label">Address Line 1</label>
              <input className="pf-input" name="address1" value={form.address1 || ''} onChange={handleChange} />
            </div>

            <div className="pf-field">
              <label className="pf-label">Address Line 2</label>
              <input className="pf-input" name="address2" value={form.address2 || ''} onChange={handleChange} />
            </div>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Town / City</label>
                <input className="pf-input" name="town" value={form.town || ''} onChange={handleChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">County</label>
                <input className="pf-input" name="county" value={form.county || ''} onChange={handleChange} />
              </div>
            </div>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Postcode</label>
                <input className="pf-input pf-input-mono" name="postcode" value={form.postcode || ''} onChange={handleChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Country</label>
                <select className="pf-input" name="country" value={form.country || 'United Kingdom'} onChange={handleChange}>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="pf-card">
            <h2 className="pf-card-title">Notes</h2>
            <div className="pf-field">
              <textarea
                className="pf-input pf-textarea"
                name="notes"
                value={form.notes || ''}
                onChange={handleChange}
                rows={4}
                placeholder="Any notes about this supplier…"
              />
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className="pf-detail-col">

          <div className="pf-card">
            <h2 className="pf-card-title">Trading Terms</h2>

            <div className="pf-field">
              <label className="pf-label">Payment Terms</label>
              <select className="pf-input" name="paymentterms" value={form.paymentterms || ''} onChange={handleChange}>
                {PAYMENT_TERMS.map((t) => (
                  <option key={t} value={t}>{t || '— Select terms —'}</option>
                ))}
              </select>
            </div>

            <div className="pf-field">
              <label className="pf-label">Lead Time (days)</label>
              <input
                className="pf-input pf-input-num"
                type="number"
                min="0"
                name="leadtimedays"
                value={form.leadtimedays ?? ''}
                onChange={handleChange}
              />
            </div>

            <div className="pf-field" style={{ marginTop: '0.5rem' }}>
              <label className="pf-checkbox-row">
                <input
                  type="checkbox"
                  name="isactive"
                  checked={form.isactive ?? true}
                  onChange={handleChange}
                />
                <span>
                  <strong>Active</strong>
                  <small>Supplier is available for purchase orders</small>
                </span>
              </label>
            </div>
          </div>

          <div className="pf-card pf-card-meta">
            <h2 className="pf-card-title">Record Info</h2>
            <div className="pf-meta-row">
              <span>Supplier ID</span>
              <span>{supplier?.supplierid}</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
