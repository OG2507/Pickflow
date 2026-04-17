'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'

const SOURCE_OPTIONS = ['Phone', 'Website', 'Email', 'Referral', 'Trade Show', 'Other']
const COUNTRY_OPTIONS = ['United Kingdom', 'Ireland', 'France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'United States', 'Canada', 'Australia', 'Other']

export default function NewClientPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    companyname: '',
    firstname: '',
    lastname: '',
    email: '',
    phone: '',
    address1: '',
    address2: '',
    address3: '',
    town: '',
    county: '',
    postcode: '',
    country: 'United Kingdom',
    source: '',
    isreducedwholesale: false,
    defaultblindship: false,
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
    if (!form.companyname.trim() && !form.firstname.trim() && !form.lastname.trim()) {
      newErrors.companyname = 'Enter a company name or contact name'
    }
    if (!form.email.trim()) {
      newErrors.email = 'Email is required'
    }
    return newErrors
  }

  const generateClientCode = async () => {
    // Get the ClientCodePrefix from app settings
    const { data } = await supabase
      .from('tblappsettings')
      .select('settingvalue')
      .eq('settingkey', 'ClientCodePrefix')
      .single()

    const prefix = data?.settingvalue || 'CLI'

    // Get count of existing clients to generate next number
    const { count } = await supabase
      .from('tblclients')
      .select('*', { count: 'exact', head: true })

    const nextNum = ((count || 0) + 1).toString().padStart(3, '0')
    return `${prefix}-${nextNum}`
  }

  const handleSave = async () => {
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setSaving(true)

    const clientcode = await generateClientCode()

    const { data, error } = await supabase
      .from('tblclients')
      .insert({
        clientcode,
        companyname:        form.companyname.trim() || null,
        firstname:          form.firstname.trim() || null,
        lastname:           form.lastname.trim() || null,
        email:              form.email.trim(),
        phone:              form.phone.trim() || null,
        address1:           form.address1.trim() || null,
        address2:           form.address2.trim() || null,
        address3:           form.address3.trim() || null,
        town:               form.town.trim() || null,
        county:             form.county.trim() || null,
        postcode:           form.postcode.trim() || null,
        country:            form.country,
        source:             form.source || null,
        isreducedwholesale: form.isreducedwholesale,
        defaultblindship:   form.defaultblindship,
        isactive:           form.isactive,
        dateadded:          new Date().toISOString(),
      })
      .select('clientid')
      .single()

    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        setErrors({ email: 'A client with this email already exists' })
      } else {
        setErrors({ general: 'Save failed: ' + error.message })
      }
      setSaving(false)
      return
    }

    logActivity({
      action:      'create',
      entityType:  'client',
      entityId:    data.clientid,
      entityLabel: form.companyname?.trim() || `${form.firstname || ''} ${form.lastname || ''}`.trim() || clientcode,
    })

    router.push(`/clients/${data.clientid}`)
  }

  return (
    <div className="pf-page">

      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => router.push('/clients')}>
            ← Clients
          </button>
          <h1 className="pf-page-title">New Client</h1>
          <p className="pf-page-subtitle">A client code will be generated automatically</p>
        </div>
        <div className="pf-header-actions">
          {errors.general && <span className="pf-error-inline">{errors.general}</span>}
          <button className="pf-btn-secondary" onClick={() => router.push('/clients')}>
            Cancel
          </button>
          <button className="pf-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Creating…' : 'Create Client'}
          </button>
        </div>
      </div>

      <div className="pf-new-grid">

        {/* Contact */}
        <div className="pf-card">
          <h2 className="pf-card-title">Contact Details</h2>

          <div className="pf-field">
            <label className="pf-label">
              Company Name <span className="pf-label-hint">(or enter a contact name below)</span>
            </label>
            <input
              className={`pf-input ${errors.companyname ? 'pf-input-error' : ''}`}
              name="companyname"
              value={form.companyname}
              onChange={handleChange}
              placeholder="e.g. Acme Trade Supplies"
              autoFocus
            />
            {errors.companyname && <span className="pf-field-error">{errors.companyname}</span>}
          </div>

          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">First Name</label>
              <input className="pf-input" name="firstname" value={form.firstname} onChange={handleChange} />
            </div>
            <div className="pf-field">
              <label className="pf-label">Last Name</label>
              <input className="pf-input" name="lastname" value={form.lastname} onChange={handleChange} />
            </div>
          </div>

          <div className="pf-field">
            <label className="pf-label">Email <span className="pf-required">*</span></label>
            <input
              className={`pf-input ${errors.email ? 'pf-input-error' : ''}`}
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="e.g. david@acmetrade.co.uk"
            />
            {errors.email && <span className="pf-field-error">{errors.email}</span>}
          </div>

          <div className="pf-field">
            <label className="pf-label">Phone</label>
            <input className="pf-input" type="tel" name="phone" value={form.phone} onChange={handleChange} />
          </div>

          <div className="pf-field">
            <label className="pf-label">Source</label>
            <select className="pf-input" name="source" value={form.source} onChange={handleChange}>
              <option value="">— How did they find you? —</option>
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
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

          <div className="pf-field">
            <label className="pf-label">Address Line 3</label>
            <input className="pf-input" name="address3" value={form.address3} onChange={handleChange} />
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

        {/* Flags */}
        <div className="pf-card">
          <h2 className="pf-card-title">Pricing & Shipping</h2>
          <div className="pf-checkbox-list">
            <label className="pf-checkbox-row">
              <input type="checkbox" name="isreducedwholesale" checked={form.isreducedwholesale} onChange={handleChange} />
              <span>
                <strong>Reduced Wholesale Pricing</strong>
                <small>Client receives the reduced wholesale price on all products</small>
              </span>
            </label>
            <label className="pf-checkbox-row">
              <input type="checkbox" name="defaultblindship" checked={form.defaultblindship} onChange={handleChange} />
              <span>
                <strong>Default Blind Ship</strong>
                <small>Orders use unbranded packing slips by default</small>
              </span>
            </label>
            <label className="pf-checkbox-row">
              <input type="checkbox" name="isactive" checked={form.isactive} onChange={handleChange} />
              <span>
                <strong>Active</strong>
                <small>Client is available for new orders</small>
              </span>
            </label>
          </div>
        </div>

      </div>
    </div>
  )
}
