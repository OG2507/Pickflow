'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Supplier = {
  supplierid: number
  suppliername: string
  leadtimedays: number | null
}

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [form, setForm] = useState({
    supplierid: '',
    expecteddate: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('tblsuppliers')
        .select('supplierid, suppliername, leadtimedays')
        .eq('isactive', true)
        .order('suppliername')
      if (data) setSuppliers(data)
    }
    fetch()
  }, [])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target

    // Auto-calculate expected date from supplier lead time
    if (name === 'supplierid' && value) {
      const supplier = suppliers.find((s) => s.supplierid === parseInt(value))
      if (supplier?.leadtimedays) {
        const expected = new Date()
        expected.setDate(expected.getDate() + supplier.leadtimedays)
        setForm((prev) => ({
          ...prev,
          supplierid: value,
          expecteddate: expected.toISOString().split('T')[0],
        }))
        return
      }
    }

    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const generatePONumber = async () => {
    const year = new Date().getFullYear()
    const { data } = await supabase
      .from('tblpurchaseorders')
      .select('ponumber')
      .ilike('ponumber', `PO-${year}-%`)
      .order('ponumber', { ascending: false })
      .limit(1)

    let nextNum = 1
    if (data && data.length > 0) {
      const last = data[0].ponumber?.split('-').pop()
      if (last) nextNum = parseInt(last) + 1
    }
    return `PO-${year}-${nextNum.toString().padStart(5, '0')}`
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.supplierid) errs.supplierid = 'Please select a supplier'
    return errs
  }

  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    const ponumber = await generatePONumber()

    const { data, error } = await supabase
      .from('tblpurchaseorders')
      .insert({
        ponumber,
        supplierid:   parseInt(form.supplierid),
        orderdate:    new Date().toISOString(),
        expecteddate: form.expecteddate || null,
        status:       'Draft',
        subtotal:     0,
        deliverycost: 0,
        pototal:      0,
        notes:        form.notes.trim() || null,
        createdby:    'system',
      })
      .select('poid')
      .single()

    if (error) {
      setErrors({ general: 'Failed to create PO: ' + error.message })
      setSaving(false)
      return
    }

    router.push(`/purchase-orders/${data.poid}`)
  }

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => router.push('/purchase-orders')}>
            ← Purchase Orders
          </button>
          <h1 className="pf-page-title">New Purchase Order</h1>
          <p className="pf-page-subtitle">A PO number will be generated automatically</p>
        </div>
        <div className="pf-header-actions">
          {errors.general && <span className="pf-error-inline">{errors.general}</span>}
          <button className="pf-btn-secondary" onClick={() => router.push('/purchase-orders')}>Cancel</button>
          <button className="pf-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Creating…' : 'Create PO'}
          </button>
        </div>
      </div>

      <div className="pf-new-grid">
        <div className="pf-card">
          <h2 className="pf-card-title">Supplier</h2>

          <div className="pf-field">
            <label className="pf-label">Supplier <span className="pf-required">*</span></label>
            <select
              className={`pf-input ${errors.supplierid ? 'pf-input-error' : ''}`}
              name="supplierid"
              value={form.supplierid}
              onChange={handleChange}
              autoFocus
            >
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => (
                <option key={s.supplierid} value={s.supplierid}>{s.suppliername}</option>
              ))}
            </select>
            {errors.supplierid && <span className="pf-field-error">{errors.supplierid}</span>}
          </div>

          <div className="pf-field">
            <label className="pf-label">Expected Delivery Date</label>
            <input
              className="pf-input"
              type="date"
              name="expecteddate"
              value={form.expecteddate}
              onChange={handleChange}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '0.2rem', display: 'block' }}>
              Auto-calculated from supplier lead time — adjust if needed
            </span>
          </div>
        </div>

        <div className="pf-card">
          <h2 className="pf-card-title">Notes</h2>
          <div className="pf-field">
            <textarea
              className="pf-input pf-textarea"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={5}
              placeholder="Any notes for this order…"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
