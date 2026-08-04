'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'

type Setting = {
  settingid: number
  settingkey: string
  settingvalue: string | null
  description: string | null
  iseditable: boolean
  lastmodified: string | null
  modifiedby: string | null
}

const LABELS: Record<string, string> = {
  CompanyName:           'Company Name',
  CompanyAddress:        'Company Address',
  CompanyPhone:          'Company Phone',
  CompanyEmail:          'Company Email',
  CompanyLogo:           'Company Logo',
  VATRate:               'VAT Rate (%)',
  DefaultShippingMethod: 'Default Shipping Method',
  OrderNumberPrefix:     'Order Number Prefix',
  PONumberPrefix:        'PO Number Prefix',
  ClientCodePrefix:      'Client Code Prefix',
  OrderSources:          'Order Sources',
}

const MULTILINE_KEYS = ['CompanyAddress']
const READONLY_KEYS: string[] = []

export default function AppSettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<Setting[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('tblappsettings')
        .select('*')
        .order('settingid')

      if (data) {
        setSettings(data)
        const vals: Record<string, string> = {}
        data.forEach((s: Setting) => { vals[s.settingkey] = s.settingvalue || '' })
        setValues(vals)
      }
      setLoading(false)
    }
    fetch()
  }, [])

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
    setSuccess(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    // Build a map of original values so we only log what actually changed
    const originals: Record<string, string> = {}
    for (const s of settings) originals[s.settingkey] = s.settingvalue || ''

    for (const key of Object.keys(values)) {
      const oldVal = originals[key] ?? ''
      const newVal = values[key] ?? ''
      if (oldVal === newVal) continue   // unchanged — skip

      const { error: err } = await supabase
        .from('tblappsettings')
        .update({
          settingvalue: newVal,
          lastmodified: new Date().toISOString(),
          modifiedby: 'admin',
        })
        .eq('settingkey', key)

      if (err) {
        setError(`Failed to save ${key}: ${err.message}`)
        setSaving(false)
        return
      }

      logActivity({
        action:      'update',
        entityType:  'setting',
        entityId:    key,
        entityLabel: LABELS[key] || key,
        fieldName:   'settingvalue',
        oldValue:    oldVal,
        newValue:    newVal,
      })
    }

    // Refresh settings in memory so the "originals" for a subsequent save are correct
    setSettings((prev) => prev.map(s => ({ ...s, settingvalue: values[s.settingkey] ?? s.settingvalue })))

    setSaving(false)
    setDirty(false)
    setSuccess(true)
  }

  if (loading) return <div className="pf-page"><div className="pf-loading">Loading settings...</div></div>

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-btn-ghost" onClick={() => router.push('/admin')}>← Admin</button>
          <h1 className="pf-page-title">App Settings</h1>
          <p className="pf-page-subtitle">System-wide configuration</p>
        </div>
        <div className="pf-header-actions">
          {success && <span className="pf-success-msg">Saved</span>}
          {error && <span className="pf-error-msg">{error}</span>}
          <button
            className="pf-btn-primary"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="pf-detail-layout" style={{ maxWidth: 700 }}>
        <div className="pf-card">
          <h2 className="pf-card-title">Company Details</h2>
          {settings
            .filter((s) => ['CompanyName', 'CompanyAddress', 'CompanyPhone', 'CompanyEmail'].includes(s.settingkey))
            .map((s) => (
              <div className="pf-field" key={s.settingkey} style={{ marginBottom: 16 }}>
                <label className="pf-label">{LABELS[s.settingkey] || s.settingkey}</label>
                {s.description && <p className="pf-card-note" style={{ marginBottom: 4 }}>{s.description}</p>}
                {MULTILINE_KEYS.includes(s.settingkey) ? (
                  <textarea
                    className="pf-input"
                    rows={3}
                    value={values[s.settingkey] || ''}
                    onChange={(e) => handleChange(s.settingkey, e.target.value)}
                    disabled={!s.iseditable}
                  />
                ) : (
                  <input
                    className="pf-input"
                    type="text"
                    value={values[s.settingkey] || ''}
                    onChange={(e) => handleChange(s.settingkey, e.target.value)}
                    disabled={!s.iseditable}
                  />
                )}
              </div>
            ))}
        </div>

        <div className="pf-card">
          <h2 className="pf-card-title">Packing Slip Logo</h2>
          <p className="pf-card-note" style={{ marginBottom: 16 }}>
            Upload your logo to Supabase Storage (Storage &rarr; company-assets), then paste the public URL here.
          </p>
          <div className="pf-field" style={{ marginBottom: 16 }}>
            <label className="pf-label">Logo URL</label>
            <input
              className="pf-input"
              type="text"
              placeholder="https://your-project.supabase.co/storage/v1/object/public/company-assets/logo.png"
              value={values['CompanyLogo'] || ''}
              onChange={(e) => handleChange('CompanyLogo', e.target.value)}
            />
          </div>
          {values['CompanyLogo'] && (
            <img
              src={values['CompanyLogo']}
              alt="Logo preview"
              style={{ maxHeight: 80, maxWidth: 300, display: 'block', border: '1px solid var(--border)', borderRadius: 4, padding: 4 }}
            />
          )}
        </div>

        <div className="pf-card">
          <h2 className="pf-card-title">Financial</h2>
          {settings
            .filter((s) => ['VATRate', 'DefaultShippingMethod'].includes(s.settingkey))
            .map((s) => (
              <div className="pf-field" key={s.settingkey} style={{ marginBottom: 16 }}>
                <label className="pf-label">{LABELS[s.settingkey] || s.settingkey}</label>
                {s.description && <p className="pf-card-note" style={{ marginBottom: 4 }}>{s.description}</p>}
                <input
                  className="pf-input pf-input-num"
                  type={s.settingkey === 'VATRate' ? 'number' : 'text'}
                  step={s.settingkey === 'VATRate' ? '0.01' : undefined}
                  value={values[s.settingkey] || ''}
                  onChange={(e) => handleChange(s.settingkey, e.target.value)}
                  disabled={!s.iseditable}
                  style={{ maxWidth: 200 }}
                />
              </div>
            ))}
        </div>

        <div className="pf-card">
          <h2 className="pf-card-title">Reference Prefixes</h2>
          {settings
            .filter((s) => ['OrderNumberPrefix', 'PONumberPrefix', 'ClientCodePrefix'].includes(s.settingkey))
            .map((s) => (
              <div className="pf-field" key={s.settingkey} style={{ marginBottom: 16 }}>
                <label className="pf-label">{LABELS[s.settingkey] || s.settingkey}</label>
                {s.description && <p className="pf-card-note" style={{ marginBottom: 4 }}>{s.description}</p>}
                <input
                  className="pf-input"
                  type="text"
                  value={values[s.settingkey] || ''}
                  onChange={(e) => handleChange(s.settingkey, e.target.value)}
                  disabled={!s.iseditable}
                  style={{ maxWidth: 200 }}
                />
              </div>
            ))}
        </div>

        <div className="pf-card">
          <h2 className="pf-card-title">Order Sources</h2>
          <p className="pf-card-note" style={{ marginBottom: 16 }}>
            These are the options shown in the Order Source dropdown when creating a new manual order.
            Add or remove sources to match your business — one per line.
          </p>
          <div className="pf-field">
            <label className="pf-label">Sources (one per line)</label>
            <textarea
              className="pf-input"
              rows={6}
              placeholder={"Email\nPhone\nLetter"}
              value={(values['OrderSources'] || '').split(',').map(s => s.trim()).join('\n')}
              onChange={(e) => {
                // Convert line breaks back to comma-separated for storage
                const csv = e.target.value
                  .split('\n')
                  .map(s => s.trim())
                  .filter(s => s.length > 0)
                  .join(', ')
                handleChange('OrderSources', csv)
              }}
            />
            <p className="pf-card-note" style={{ marginTop: 6 }}>
              Currently stored as: <span style={{ fontFamily: 'monospace' }}>{values['OrderSources'] || '—'}</span>
            </p>
          </div>
        </div>

        <div className="pf-card pf-card-meta">
          <h2 className="pf-card-title">Last Modified</h2>
          {settings.map((s) => (
            <div className="pf-meta-row" key={s.settingkey}>
              <span>{LABELS[s.settingkey] || s.settingkey}</span>
              <span>
                {s.lastmodified
                  ? `${new Date(s.lastmodified).toLocaleDateString('en-GB')} by ${s.modifiedby || '—'}`
                  : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
