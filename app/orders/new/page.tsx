'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Client = {
  clientid: number
  clientcode: string | null
  companyname: string | null
  firstname: string | null
  lastname: string | null
  address1: string | null
  address2: string | null
  address3: string | null
  town: string | null
  county: string | null
  postcode: string | null
  country: string
  defaultblindship: boolean
}

const ORDER_SOURCES = ['Email', 'Phone', 'Letter']

const generateOrderNumber = () => {
  // JKS-[days since 30 Dec 1899]-[sequence starting 100]
  const oleBase = new Date(1899, 11, 30)
  const today = new Date()
  const diffDays = Math.floor((today.getTime() - oleBase.getTime()) / (1000 * 60 * 60 * 24))
  // Sequence handled server-side — use 100 as default, orders screen will handle duplicates
  return `JKS-${diffDays}-100`
}

export default function NewOrderPage() {
  const router = useRouter()

  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showClientList, setShowClientList] = useState(false)

  const [form, setForm] = useState({
    ordersource: '',
    requireddate: '',
    isblindship: false,
    shiptoname: '',
    shiptoaddress1: '',
    shiptoaddress2: '',
    shiptoaddress3: '',
    shiptetown: '',
    shiptocounty: '',
    shiptopostcode: '',
    shiptocountry: 'United Kingdom',
    notes: '',
  })

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Fetch clients for search
  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await supabase
        .from('tblclients')
        .select('clientid, clientcode, companyname, firstname, lastname, address1, address2, address3, town, county, postcode, country, defaultblindship')
        .eq('isactive', true)
        .order('companyname')

      if (data) setClients(data)
    }
    fetchClients()
  }, [])

  const filteredClients = clients.filter((c) => {
    const name = `${c.companyname || ''} ${c.firstname || ''} ${c.lastname || ''} ${c.clientcode || ''}`.toLowerCase()
    return name.includes(clientSearch.toLowerCase())
  })

  const selectClient = (client: Client) => {
    setSelectedClient(client)
    setShowClientList(false)
    setClientSearch('')

    // Auto-populate ship-to from client address
    const displayName = client.companyname?.trim() ||
      `${client.firstname || ''} ${client.lastname || ''}`.trim()

    setForm((prev) => ({
      ...prev,
      isblindship: client.defaultblindship,
      shiptoname:      displayName,
      shiptoaddress1:  client.address1 || '',
      shiptoaddress2:  client.address2 || '',
      shiptoaddress3:  client.address3 || '',
      shiptetown:      client.town || '',
      shiptocounty:    client.county || '',
      shiptopostcode:  client.postcode || '',
      shiptocountry:   client.country || 'United Kingdom',
    }))

    if (errors.client) setErrors((prev) => ({ ...prev, client: '' }))
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!selectedClient) newErrors.client = 'Please select a client'
    if (!form.ordersource) newErrors.ordersource = 'Please select an order source'
    return newErrors
  }

  const handleSave = async () => {
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setSaving(true)

    // Generate order number — check for existing today and increment
    const oleBase = new Date(1899, 11, 30)
    const today = new Date()
    const diffDays = Math.floor((today.getTime() - oleBase.getTime()) / (1000 * 60 * 60 * 24))
    const pattern = `JKS-${diffDays}-%`

    const { data: existing } = await supabase
      .from('tblorders')
      .select('ordernumber')
      .like('ordernumber', pattern)
      .order('ordernumber', { ascending: false })

    let nextSeq = 100
    if (existing && existing.length > 0) {
      const lastNum = existing[0].ordernumber?.split('-').pop()
      if (lastNum) nextSeq = parseInt(lastNum) + 100
    }

    const ordernumber = `JKS-${diffDays}-${nextSeq}`

    const { data, error } = await supabase
      .from('tblorders')
      .insert({
        ordernumber,
        clientid:       selectedClient!.clientid,
        orderdate:      new Date().toISOString(),
        requireddate:   form.requireddate || null,
        ordersource:    form.ordersource,
        status:         'New',
        isblindship:    form.isblindship,
        shiptoname:     form.shiptoname.trim() || null,
        shiptoaddress1: form.shiptoaddress1.trim() || null,
        shiptoaddress2: form.shiptoaddress2.trim() || null,
        shiptoaddress3: form.shiptoaddress3.trim() || null,
        shiptetown:     form.shiptetown.trim() || null,
        shiptocounty:   form.shiptocounty.trim() || null,
        shiptopostcode: form.shiptopostcode.trim() || null,
        shiptocountry:  form.shiptocountry,
        notes:          form.notes.trim() || null,
        subtotal:       0,
        productvat:     0,
        shippingvat:    0,
        totalvat:       0,
        shippingcost:   0,
        ordertotal:     0,
        ordertotalincvat: 0,
        totalweightg:   0,
        createdby:      'system',
      })
      .select('orderid')
      .single()

    if (error) {
      setErrors({ general: 'Failed to create order: ' + error.message })
      setSaving(false)
      return
    }

    router.push(`/orders/${data.orderid}`)
  }

  const clientDisplayName = (c: Client) =>
    c.companyname?.trim() || `${c.firstname || ''} ${c.lastname || ''}`.trim()

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => router.push('/orders')}>
            ← Orders
          </button>
          <h1 className="pf-page-title">New Order</h1>
          <p className="pf-page-subtitle">Select a client and source to get started</p>
        </div>
        <div className="pf-header-actions">
          {errors.general && <span className="pf-error-inline">{errors.general}</span>}
          <button className="pf-btn-secondary" onClick={() => router.push('/orders')}>
            Cancel
          </button>
          <button className="pf-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Creating…' : 'Create Order'}
          </button>
        </div>
      </div>

      <div className="pf-new-grid">

        {/* Client selection */}
        <div className="pf-card">
          <h2 className="pf-card-title">Client</h2>

          {selectedClient ? (
            <div className="pf-selected-client">
              <div className="pf-selected-client-name">{clientDisplayName(selectedClient)}</div>
              {selectedClient.clientcode && (
                <div className="pf-selected-client-code">{selectedClient.clientcode}</div>
              )}
              <button
                className="pf-btn-cancel-sm"
                style={{ marginTop: '0.5rem' }}
                onClick={() => setSelectedClient(null)}
              >
                Change client
              </button>
            </div>
          ) : (
            <div className="pf-client-search">
              <div className="pf-field">
                <input
                  className={`pf-input ${errors.client ? 'pf-input-error' : ''}`}
                  placeholder="Search by name or client code…"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value)
                    setShowClientList(true)
                  }}
                  onFocus={() => setShowClientList(true)}
                  autoFocus
                />
                {errors.client && <span className="pf-field-error">{errors.client}</span>}
              </div>

              {showClientList && clientSearch.length > 0 && (
                <div className="pf-client-dropdown">
                  {filteredClients.length === 0 ? (
                    <div className="pf-client-dropdown-empty">No clients found</div>
                  ) : (
                    filteredClients.slice(0, 8).map((c) => (
                      <div
                        key={c.clientid}
                        className="pf-client-dropdown-item"
                        onClick={() => selectClient(c)}
                      >
                        <span className="pf-client-dropdown-name">{clientDisplayName(c)}</span>
                        {c.clientcode && (
                          <span className="pf-client-dropdown-code">{c.clientcode}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pf-field" style={{ marginTop: '1rem' }}>
            <label className="pf-label">Order Source <span className="pf-required">*</span></label>
            <select
              className={`pf-input ${errors.ordersource ? 'pf-input-error' : ''}`}
              name="ordersource"
              value={form.ordersource}
              onChange={handleChange}
            >
              <option value="">— Select source —</option>
              {ORDER_SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {errors.ordersource && <span className="pf-field-error">{errors.ordersource}</span>}
          </div>

          <div className="pf-field">
            <label className="pf-label">Required By</label>
            <input
              className="pf-input"
              type="date"
              name="requireddate"
              value={form.requireddate}
              onChange={handleChange}
            />
          </div>

          <div className="pf-field">
            <label className="pf-checkbox-row">
              <input
                type="checkbox"
                name="isblindship"
                checked={form.isblindship}
                onChange={handleChange}
              />
              <span>
                <strong>Blind Ship</strong>
                <small>Use unbranded packing slip</small>
              </span>
            </label>
          </div>
        </div>

        {/* Delivery address */}
        <div className="pf-card">
          <h2 className="pf-card-title">Delivery Address</h2>
          <p className="pf-card-note">Auto-populated from client — edit if delivering elsewhere.</p>

          <div className="pf-field">
            <label className="pf-label">Ship To Name</label>
            <input className="pf-input" name="shiptoname" value={form.shiptoname} onChange={handleChange} />
          </div>

          <div className="pf-field">
            <label className="pf-label">Address Line 1</label>
            <input className="pf-input" name="shiptoaddress1" value={form.shiptoaddress1} onChange={handleChange} />
          </div>

          <div className="pf-field">
            <label className="pf-label">Address Line 2</label>
            <input className="pf-input" name="shiptoaddress2" value={form.shiptoaddress2} onChange={handleChange} />
          </div>

          <div className="pf-field">
            <label className="pf-label">Address Line 3</label>
            <input className="pf-input" name="shiptoaddress3" value={form.shiptoaddress3} onChange={handleChange} />
          </div>

          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">Town / City</label>
              <input className="pf-input" name="shiptetown" value={form.shiptetown} onChange={handleChange} />
            </div>
            <div className="pf-field">
              <label className="pf-label">County</label>
              <input className="pf-input" name="shiptocounty" value={form.shiptocounty} onChange={handleChange} />
            </div>
          </div>

          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">Postcode</label>
              <input className="pf-input pf-input-mono" name="shiptopostcode" value={form.shiptopostcode} onChange={handleChange} />
            </div>
            <div className="pf-field">
              <label className="pf-label">Country</label>
              <input className="pf-input" name="shiptocountry" value={form.shiptocountry} onChange={handleChange} />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="pf-card">
          <h2 className="pf-card-title">Notes</h2>
          <div className="pf-field">
            <textarea
              className="pf-input pf-textarea"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={4}
              placeholder="Any notes about this order…"
            />
          </div>
        </div>

      </div>
    </div>
  )
}
