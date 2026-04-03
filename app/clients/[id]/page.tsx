'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Client } from '@/lib/types'

const SOURCE_OPTIONS = ['', 'Phone', 'Website', 'Email', 'Referral', 'Trade Show', 'Other']
const COUNTRY_OPTIONS = ['United Kingdom', 'Ireland', 'France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'United States', 'Canada', 'Australia', 'Other']

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [form, setForm] = useState<Partial<Client>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const fetchClient = async () => {
      const { data, error } = await supabase
        .from('tblclients')
        .select('*')
        .eq('clientid', id)
        .single()

      if (error || !data) {
        setError('Client not found.')
      } else {
        setClient(data)
        setForm(data)
      }
      setLoading(false)
    }
    fetchClient()
  }, [id])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setDirty(true)
    setSuccess(false)
  }

  const handleSave = async () => {
    if (!dirty) return
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('tblclients')
      .update({ ...form })
      .eq('clientid', id)

    if (error) {
      setError('Save failed: ' + error.message)
    } else {
      setDirty(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  const displayName = () =>
    form.companyname?.trim() || `${form.firstname || ''} ${form.lastname || ''}`.trim() || 'Client'

  if (loading) return <div className="pf-page"><div className="pf-loading">Loading…</div></div>
  if (error && !client) return <div className="pf-page"><div className="pf-empty">{error}</div></div>

  return (
    <div className="pf-page">

      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => router.push('/clients')}>
            ← Clients
          </button>
          <h1 className="pf-page-title">{displayName()}</h1>
          <p className="pf-page-subtitle">{form.clientcode || 'No client code'}</p>
        </div>
        <div className="pf-header-actions">
          {success && <span className="pf-saved">Saved</span>}
          {error && <span className="pf-error-inline">{error}</span>}
          <button className="pf-btn-secondary" onClick={() => router.push('/clients')}>
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
            <h2 className="pf-card-title">Company & Contact</h2>

            <div className="pf-field">
              <label className="pf-label">Company Name</label>
              <input className="pf-input" name="companyname" value={form.companyname || ''} onChange={handleChange} />
            </div>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">First Name</label>
                <input className="pf-input" name="firstname" value={form.firstname || ''} onChange={handleChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Last Name</label>
                <input className="pf-input" name="lastname" value={form.lastname || ''} onChange={handleChange} />
              </div>
            </div>

            <div className="pf-field">
              <label className="pf-label">Email</label>
              <input className="pf-input" type="email" name="email" value={form.email || ''} onChange={handleChange} />
            </div>

            <div className="pf-field">
              <label className="pf-label">Phone</label>
              <input className="pf-input" type="tel" name="phone" value={form.phone || ''} onChange={handleChange} />
            </div>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Client Code</label>
                <input className="pf-input pf-input-mono" name="clientcode" value={form.clientcode || ''} onChange={handleChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Source</label>
                <select className="pf-input" name="source" value={form.source || ''} onChange={handleChange}>
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s || '— Select source —'}</option>
                  ))}
                </select>
              </div>
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

            <div className="pf-field">
              <label className="pf-label">Address Line 3</label>
              <input className="pf-input" name="address3" value={form.address3 || ''} onChange={handleChange} />
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
                placeholder="Any notes about this client…"
              />
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className="pf-detail-col">

          <div className="pf-card">
            <h2 className="pf-card-title">Pricing & Shipping</h2>
            <div className="pf-checkbox-list">
              <label className="pf-checkbox-row">
                <input type="checkbox" name="isreducedwholesale" checked={form.isreducedwholesale ?? false} onChange={handleChange} />
                <span>
                  <strong>Reduced Wholesale Pricing</strong>
                  <small>Client receives the reduced wholesale price on all products</small>
                </span>
              </label>
              <label className="pf-checkbox-row">
                <input type="checkbox" name="defaultblindship" checked={form.defaultblindship ?? false} onChange={handleChange} />
                <span>
                  <strong>Default Blind Ship</strong>
                  <small>Orders for this client use unbranded packing slips by default</small>
                </span>
              </label>
              <label className="pf-checkbox-row">
                <input type="checkbox" name="isactive" checked={form.isactive ?? true} onChange={handleChange} />
                <span>
                  <strong>Active</strong>
                  <small>Client is available for new orders</small>
                </span>
              </label>
            </div>
          </div>

          <div className="pf-card pf-card-meta">
            <h2 className="pf-card-title">Record Info</h2>
            <div className="pf-meta-row">
              <span>Client ID</span>
              <span>{client?.clientid}</span>
            </div>
            <div className="pf-meta-row">
              <span>Date Added</span>
              <span>{client?.dateadded ? new Date(client.dateadded).toLocaleDateString('en-GB') : '—'}</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
