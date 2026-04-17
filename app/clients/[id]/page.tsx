'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logActivity, logChanges } from '@/lib/activity'
import type { Client } from '@/lib/types'

const SOURCE_OPTIONS = ['', 'Phone', 'Website', 'Email', 'Referral', 'Trade Show', 'Other']
const COUNTRY_OPTIONS = ['United Kingdom', 'Ireland', 'France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'United States', 'Canada', 'Australia', 'Other']

const STATUS_COLOURS: Record<string, string> = {
  'New': 'pf-badge-new', 'Printed': 'pf-badge-printed', 'Picking': 'pf-badge-picking',
  'Dispatched': 'pf-badge-dispatched', 'Completed': 'pf-badge-completed',
  'Cancelled': 'pf-badge-cancelled', 'Invoiced': 'pf-badge-invoiced',
}

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

    const before = client ? { ...client } : null

    const { error } = await supabase
      .from('tblclients')
      .update({ ...form })
      .eq('clientid', id)

    if (error) {
      setError('Save failed: ' + error.message)
    } else {
      const label = form.companyname?.trim() || `${form.firstname || ''} ${form.lastname || ''}`.trim() || `Client ${id}`
      logChanges({
        entityType:  'client',
        entityId:    id as string,
        entityLabel: label,
        before:      before as any,
        after:       form as any,
      })
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
            <div className="pf-field" style={{ marginBottom: 16 }}>
              <label className="pf-label">QuickFile Account Reference</label>
              <input
                className="pf-input pf-input-mono"
                type="text"
                name="accountreference"
                value={form.accountreference || ''}
                onChange={handleChange}
                placeholder="e.g. A_E_Rice"
                style={{ maxWidth: 200 }}
              />
              <p className="pf-card-note" style={{ marginTop: 4 }}>Used when exporting invoices to QuickFile</p>
            </div>
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

      {/* Pricing rules panel */}
      <ClientPricingPanel clientid={id} />

      {/* Orders panel — full width below columns */}
      <ClientOrdersPanel clientid={id} router={router} />

    </div>
  )
}

function ClientOrdersPanel({ clientid, router }: { clientid: string; router: any }) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [totalUnits, setTotalUnits] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tblorders')
      .select(`orderid, ordernumber, orderdate, status, ordersource, ordertotal,
        tblorderlines (quantityordered)`)
      .eq('clientid', clientid)
      .order('orderdate', { ascending: false })
      .limit(200)

    const list = (data || []).map((o: any) => ({
      ...o,
      units: (o.tblorderlines || []).reduce((s: number, l: any) => s + l.quantityordered, 0),
    }))

    setOrders(list)
    setTotalUnits(list.reduce((s, o) => s + o.units, 0))
    setLoading(false)
  }, [clientid])

  useEffect(() => { load() }, [load])

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)

  return (
    <div className="pf-card" style={{ marginTop: '1.5rem' }}>
      <div className="pf-panel-header">
        <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          Order History
        </h2>
        <div style={{ display: 'flex', gap: '1.5rem', textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>{orders.length}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>orders</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>{totalUnits.toLocaleString()}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>units</div>
          </div>
        </div>
      </div>
      <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />
      {loading ? <div className="pf-loading">Loading…</div> : orders.length === 0 ? (
        <div className="pf-empty">No orders for this client.</div>
      ) : (
        <table className="pf-inner-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Source</th>
              <th>Status</th>
              <th className="pf-col-right">Units</th>
              <th className="pf-col-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.orderid} className="pf-row" style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/orders/${o.orderid}`)}>
                <td className="pf-sku">{o.ordernumber || '—'}</td>
                <td className="pf-category">{o.orderdate ? new Date(o.orderdate).toLocaleDateString('en-GB') : '—'}</td>
                <td className="pf-category">{o.ordersource || '—'}</td>
                <td>
                  <span className={`pf-badge ${STATUS_COLOURS[o.status] || ''}`}>{o.status}</span>
                </td>
                <td className="pf-col-right pf-category">{o.units}</td>
                <td className="pf-col-right pf-price">{o.ordertotal ? formatPrice(o.ordertotal) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ClientPricingPanel({ clientid }: { clientid: string }) {
  const [rules, setRules] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [newRule, setNewRule] = useState({
    pricingtype: 'Fixed Category',
    category: '',
    fixedprice: '',
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tblclientpricing')
      .select('clientpricingid, pricingtype, category, pricingcode, fixedprice, isactive, notes')
      .eq('clientid', clientid)
      .order('clientpricingid', { ascending: true })
    setRules(data || [])
    setLoading(false)
  }, [clientid])

  useEffect(() => {
    load()
    // Load categories for the dropdown
    supabase
      .from('tblcategories')
      .select('categoryname')
      .order('categoryname')
      .then(({ data }) => setCategories((data || []).map((c: any) => c.categoryname)))
  }, [load])

  const handleAdd = async () => {
    setFormError(null)
    if (!newRule.category.trim()) { setFormError('Select a category.'); return }
    const price = parseFloat(newRule.fixedprice)
    if (isNaN(price) || price <= 0) { setFormError('Enter a valid fixed price.'); return }

    setSaving(true)
    const { data: inserted, error } = await supabase
      .from('tblclientpricing')
      .insert({
        clientid: parseInt(clientid),
        pricingtype: 'Fixed Category',
        category: newRule.category.trim(),
        fixedprice: price,
        isactive: true,
        notes: newRule.notes.trim() || null,
      })
      .select('clientpricingid')
      .single()

    if (error) {
      setFormError('Save failed: ' + error.message)
    } else {
      logActivity({
        action:      'create',
        entityType:  'client_pricing',
        entityId:    inserted?.clientpricingid ?? 'new',
        entityLabel: `${newRule.category.trim()} — ${formatPrice(price)} — client ${clientid}`,
      })
      setAdding(false)
      setNewRule({ pricingtype: 'Fixed Category', category: '', fixedprice: '', notes: '' })
      await load()
    }
    setSaving(false)
  }

  const toggleActive = async (rule: any) => {
    const nextActive = !rule.isactive
    await supabase
      .from('tblclientpricing')
      .update({ isactive: nextActive })
      .eq('clientpricingid', rule.clientpricingid)
    logActivity({
      action:      'update',
      entityType:  'client_pricing',
      entityId:    rule.clientpricingid,
      entityLabel: `${rule.category} — client ${clientid}`,
      fieldName:   'isactive',
      oldValue:    rule.isactive,
      newValue:    nextActive,
    })
    await load()
  }

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)

  return (
    <div className="pf-card" style={{ marginTop: '1.5rem' }}>
      <div className="pf-panel-header">
        <h2 className="pf-card-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          Custom Pricing Rules
        </h2>
        {!adding && (
          <button className="pf-btn-secondary" onClick={() => { setAdding(true); setFormError(null) }}>
            + Add Rule
          </button>
        )}
      </div>
      <div style={{ borderBottom: '1px solid var(--border)', margin: '0.75rem 0' }} />

      {loading ? (
        <div className="pf-loading">Loading…</div>
      ) : (
        <>
          {rules.length === 0 && !adding && (
            <div className="pf-empty">No custom pricing rules for this client.</div>
          )}

          {rules.length > 0 && (
            <table className="pf-inner-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Applies To</th>
                  <th className="pf-col-right">Fixed Price</th>
                  <th>Notes</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.clientpricingid} className="pf-row">
                    <td className="pf-category">{r.pricingtype || '—'}</td>
                    <td>{r.category || r.pricingcode || '—'}</td>
                    <td className="pf-col-right pf-price">{r.fixedprice != null ? formatPrice(r.fixedprice) : '—'}</td>
                    <td className="pf-category" style={{ color: 'var(--text-secondary)' }}>{r.notes || '—'}</td>
                    <td>
                      <span className={`pf-badge ${r.isactive ? 'pf-badge-dispatched' : 'pf-badge-cancelled'}`}>
                        {r.isactive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="pf-btn-secondary"
                        style={{ padding: '2px 10px', fontSize: '0.8rem' }}
                        onClick={() => toggleActive(r)}
                      >
                        {r.isactive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {adding && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-alt, var(--surface))', borderRadius: 6, border: '1px solid var(--border)' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>New Pricing Rule</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div className="pf-field">
                  <label className="pf-label">Category</label>
                  <select
                    className="pf-input"
                    value={newRule.category}
                    onChange={(e) => setNewRule((p) => ({ ...p, category: e.target.value }))}
                  >
                    <option value="">— Select category —</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="pf-field">
                  <label className="pf-label">Fixed Price (ex VAT)</label>
                  <input
                    className="pf-input pf-input-num"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newRule.fixedprice}
                    onChange={(e) => setNewRule((p) => ({ ...p, fixedprice: e.target.value }))}
                  />
                </div>
                <div className="pf-field">
                  <label className="pf-label">Notes (optional)</label>
                  <input
                    className="pf-input"
                    placeholder="e.g. Agreed May 2026"
                    value={newRule.notes}
                    onChange={(e) => setNewRule((p) => ({ ...p, notes: e.target.value }))}
                  />
                </div>
              </div>
              {formError && <div className="pf-error-inline" style={{ marginBottom: '0.5rem' }}>{formError}</div>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="pf-btn-primary" onClick={handleAdd} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Rule'}
                </button>
                <button className="pf-btn-secondary" onClick={() => { setAdding(false); setFormError(null) }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
