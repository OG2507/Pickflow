'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  VATRate:               'VAT Rate (%)',
  DefaultShippingMethod: 'Default Shipping Method',
  OrderNumberPrefix:     'Order Number Prefix',
  PONumberPrefix:        'PO Number Prefix',
  ClientCodePrefix:      'Client Code Prefix',
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

    for (const key of Object.keys(values)) {
      const { error: err } = await supabase
        .from('tblappsettings')
        .update({
          settingvalue: values[key],
          lastmodified: new Date().toISOString(),
          modifiedby: 'admin',
        })
        .eq('settingkey', key)

      if (err) {
        setError(`Failed to save ${key}: ${err.message}`)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setDirty(false)
    setSuccess(true)
  }

  if (loading) return <div className="pf-page"><div className="pf-loading">Loading settings…</div></div>

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
