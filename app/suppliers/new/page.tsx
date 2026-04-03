'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PAYMENT_TERMS = [
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

export default function NewSupplierPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    suppliername: '',
    contactname: '',
    email: '',
    phone: '',
    accountref: '',
    address1: '',
    address2: '',
    town: '',
    county: '',
    postcode: '',
    country: 'United Kingdom',
    paymentterms: '',
    leadtimedays: '',
    isactive: true,
  })

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!form.suppliername.trim()) newErrors.suppliername = 'Supplier name is required'
    return newErrors
  }

  const handleSave = async () => {
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('tblsuppliers')
      .insert({
        suppliername:  form.suppliername.trim(),
        contactname:   form.contactname.trim() || null,
        email:         form.email.trim() || null,
        phone:         form.phone.trim() || null,
        accountref:    form.accountref.trim() || null,
        address1:      form.address1.trim() || null,
        address2:      form.address2.trim() || null,
        town:          form.town.trim() || null,
        county:        form.county.trim() || null,
        postcode:      form.postcode.trim() || null,
        country:       form.country,
        paymentterms:  form.paymentterms || null,
        leadtimedays:  parseInt(form.leadtimedays) || null,
        isactive:      form.isactive,
      })
      .select('supplierid')
      .single()

    if (error) {
      setErrors({ general: 'Save failed: ' + error.message })
      setSaving(false)
      return
    }

    router.push(`/suppliers/${data.supplierid}`)
  }

  return (
    <div className="pf-page">

      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => router.push('/suppliers')}>
            ← Suppliers
          </button>
          <h1 className="pf-page-title">New Supplier</h1>
          <p className="pf-page-subtitle">Fill in the essentials — you can add the rest on the next screen</p>
        </div>
        <div className="pf-header-actions">
          {errors.general && <span className="pf-error-inline">{errors.general}</span>}
          <button className="pf-btn-secondary" onClick={() => router.push('/suppliers')}>
            Cancel
          </button>
          <button className="pf-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Creating…' : 'Create Supplier'}
          </button>
        </div>
      </div>

      <div className="pf-new-grid">

        {/* Details */}
        <div className="pf-card">
          <h2 className="pf-card-title">Supplier Details</h2>

          <div className="pf-field">
            <label className="pf-label">Supplier Name <span className="pf-required">*</span></label>
            <input
              className={`pf-input ${errors.suppliername ? 'pf-input-error' : ''}`}
              name="suppliername"
              value={form.suppliername}
              onChange={handleChange}
              placeholder="e.g. Boxes Direct Ltd"
              autoFocus
            />
            {errors.suppliername && <span className="pf-field-error">{errors.suppliername}</span>}
          </div>

          <div className="pf-field">
            <label className="pf-label">Contact Name</label>
            <input className="pf-input" name="contactname" value={form.contactname} onChange={handleChange} />
          </div>

          <div className="pf-field">
            <label className="pf-label">Email</label>
            <input className="pf-input" type="email" name="email" value={form.email} onChange={handleChange} />
          </div>

          <div className="pf-field">
            <label className="pf-label">Phone</label>
            <input className="pf-input" type="tel" name="phone" value={form.phone} onChange={handleChange} />
          </div>

          <div className="pf-field">
            <label className="pf-label">Account Reference</label>
            <input className="pf-input pf-input-mono" name="accountref" value={form.accountref} onChange={handleChange} placeholder="e.g. BDL-001" />
          </div>
        </div>

        {/* Address */}
        <div className="pf-card">
          <h2 className="pf-card-title">Address</h2>

          <div className="pf-field">
            <label className="pf-label">Address Line 1</label>
            <input className="pf-input" name="address1" value={form.address1} onChange={handleChange} />
          </div>

          <div className="pf-field">
            <label className="pf-label">Address Line 2</label>
            <input className="pf-input" name="address2" value={form.address2} onChange={handleChange} />
          </div>

          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">Town / City</label>
              <input className="pf-input" name="town" value={form.town} onChange={handleChange} />
            </div>
            <div className="pf-field">
              <label className="pf-label">County</label>
              <input className="pf-input" name="county" value={form.county} onChange={handleChange} />
            </div>
          </div>

          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">Postcode</label>
              <input className="pf-input pf-input-mono" name="postcode" value={form.postcode} onChange={handleChange} />
            </div>
            <div className="pf-field">
              <label className="pf-label">Country</label>
              <select className="pf-input" name="country" value={form.country} onChange={handleChange}>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Terms */}
        <div className="pf-card">
          <h2 className="pf-card-title">Trading Terms</h2>

          <div className="pf-field">
            <label className="pf-label">Payment Terms</label>
            <select className="pf-input" name="paymentterms" value={form.paymentterms} onChange={handleChange}>
              <option value="">— Select terms —</option>
              {PAYMENT_TERMS.map((t) => (
                <option key={t} value={t}>{t}</option>
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
              value={form.leadtimedays}
              onChange={handleChange}
              placeholder="e.g. 5"
            />
          </div>

          <div className="pf-field" style={{ marginTop: '0.5rem' }}>
            <label className="pf-checkbox-row">
              <input type="checkbox" name="isactive" checked={form.isactive} onChange={handleChange} />
              <span>
                <strong>Active</strong>
                <small>Supplier is available for purchase orders</small>
              </span>
            </label>
          </div>
        </div>

      </div>
    </div>
  )
}
