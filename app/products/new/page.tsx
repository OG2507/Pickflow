'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCategories } from '@/lib/useCategories'
import { usePriceBands } from '@/lib/usePriceBands'
import type { PricingCode } from '@/lib/types'

const VAT_OPTIONS = ['Standard', 'Zero', 'Exempt']

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price)

export default function NewProductPage() {
  const router = useRouter()
  const { categories, getSubcategories } = useCategories()
  const { priceBands } = usePriceBands()

  const [form, setForm] = useState({
    sku: '',
    productname: '',
    category: '',
    subcategory: '',
    unitofmeasure: '',
    pricingcodeid: '' as string | number,
    salesprice: '',
    wholesaleprice: '',
    reducedwholesaleprice: '',
    costprice: '',
    vatstatus: 'Standard',
    weight: '',
    isactive: true,
    isdropship: false,
    pickingbintracked: false,
    bagsizedefault: '0',
    reorderlevel: '0',
    reorderqty: '0',
    leadtimedays: '0',
  })

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const subcategories = getSubcategories(form.category)

  const selectedBand: PricingCode | undefined = priceBands.find(
    (b) => b.pricingcodeid === Number(form.pricingcodeid)
  )

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    if (name === 'category') {
      setForm((prev) => ({ ...prev, category: value, subcategory: '' }))
    } else {
      setForm((prev) => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      }))
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!form.sku.trim()) newErrors.sku = 'SKU is required'
    if (!form.productname.trim()) newErrors.productname = 'Product name is required'
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
      .from('tblproducts')
      .insert({
        sku:                   form.sku.trim(),
        productname:           form.productname.trim(),
        category:              form.category || null,
        subcategory:           form.subcategory || null,
        unitofmeasure:         form.unitofmeasure.trim() || null,
        pricingcodeid:         form.pricingcodeid ? Number(form.pricingcodeid) : null,
        salesprice:            parseFloat(form.salesprice) || 0,
        wholesaleprice:        parseFloat(form.wholesaleprice) || 0,
        reducedwholesaleprice: parseFloat(form.reducedwholesaleprice) || 0,
        costprice:             parseFloat(form.costprice) || 0,
        vatstatus:             form.vatstatus,
        weight:                parseFloat(form.weight) || null,
        isactive:              form.isactive,
        isdropship:            form.isdropship,
        pickingbintracked:     form.pickingbintracked,
        bagsizedefault:        parseInt(form.bagsizedefault) || 0,
        reorderlevel:          parseInt(form.reorderlevel) || 0,
        reorderqty:            parseInt(form.reorderqty) || 0,
        leadtimedays:          parseInt(form.leadtimedays) || 0,
        dateadded:             new Date().toISOString(),
        lastmodified:          new Date().toISOString(),
      })
      .select('productid')
      .single()

    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        setErrors({ sku: 'This SKU already exists' })
      } else {
        setErrors({ general: 'Save failed: ' + error.message })
      }
      setSaving(false)
      return
    }

    router.push(`/products/${data.productid}`)
  }

  return (
    <div className="pf-page">

      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => router.push('/products')}>
            ← Products
          </button>
          <h1 className="pf-page-title">New Product</h1>
          <p className="pf-page-subtitle">Fill in the essentials — you can add the rest on the next screen</p>
        </div>
        <div className="pf-header-actions">
          {errors.general && <span className="pf-error-inline">{errors.general}</span>}
          <button className="pf-btn-secondary" onClick={() => router.push('/products')}>
            Cancel
          </button>
          <button className="pf-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Creating…' : 'Create Product'}
          </button>
        </div>
      </div>

      <div className="pf-new-grid">

        {/* Identity */}
        <div className="pf-card">
          <h2 className="pf-card-title">Identity</h2>

          <div className="pf-field">
            <label className="pf-label">SKU <span className="pf-required">*</span></label>
            <input
              className={`pf-input ${errors.sku ? 'pf-input-error' : ''}`}
              name="sku"
              value={form.sku}
              onChange={handleChange}
              placeholder="e.g. PKG-BOX-XL"
              autoFocus
            />
            {errors.sku && <span className="pf-field-error">{errors.sku}</span>}
          </div>

          <div className="pf-field">
            <label className="pf-label">Product Name <span className="pf-required">*</span></label>
            <input
              className={`pf-input ${errors.productname ? 'pf-input-error' : ''}`}
              name="productname"
              value={form.productname}
              onChange={handleChange}
              placeholder="e.g. Extra Large Brown Box"
            />
            {errors.productname && <span className="pf-field-error">{errors.productname}</span>}
          </div>

          <div className="pf-field">
            <label className="pf-label">Category</label>
            <select className="pf-input" name="category" value={form.category} onChange={handleChange}>
              <option value="">— Select category —</option>
              {categories.map((c) => (
                <option key={c.categoryid} value={c.categoryname}>{c.categoryname}</option>
              ))}
            </select>
          </div>

          <div className="pf-field">
            <label className="pf-label">Sub-category</label>
            <select
              className="pf-input"
              name="subcategory"
              value={form.subcategory}
              onChange={handleChange}
              disabled={!form.category || subcategories.length === 0}
            >
              <option value="">
                {!form.category ? '— Select a category first —' : '— Select sub-category —'}
              </option>
              {subcategories.map((s) => (
                <option key={s.subcategoryid} value={s.subcategoryname}>{s.subcategoryname}</option>
              ))}
            </select>
          </div>

          <div className="pf-field">
            <label className="pf-label">Unit of Measure</label>
            <input
              className="pf-input"
              name="unitofmeasure"
              value={form.unitofmeasure}
              onChange={handleChange}
              placeholder="e.g. Each"
            />
          </div>
        </div>

        {/* Pricing */}
        <div className="pf-card">
          <h2 className="pf-card-title">Pricing & VAT</h2>

          <div className="pf-field">
            <label className="pf-label">Price Band</label>
            <select
              className="pf-input"
              name="pricingcodeid"
              value={form.pricingcodeid}
              onChange={handleChange}
            >
              <option value="">— No price band / enter manually —</option>
              {priceBands.map((b) => (
                <option key={b.pricingcodeid} value={b.pricingcodeid}>
                  {b.pricingcode}{b.description ? ` — ${b.description}` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedBand && (
            <div className="pf-price-band-preview">
              <span className="pf-price-band-label">Prices from band:</span>
              <div className="pf-price-band-row">
                <span>Retail</span>
                <span>{formatPrice(selectedBand.salesprice)}</span>
              </div>
              <div className="pf-price-band-row">
                <span>Wholesale</span>
                <span>{formatPrice(selectedBand.wholesaleprice)}</span>
              </div>
              <div className="pf-price-band-row">
                <span>Reduced Wholesale</span>
                <span>{formatPrice(selectedBand.reducedwholesaleprice)}</span>
              </div>
            </div>
          )}

          <p className="pf-card-note" style={{ marginTop: selectedBand ? '1rem' : '0' }}>
            {selectedBand
              ? 'Override individual prices below — leave at 0 to use band price.'
              : 'Select a price band or enter prices manually.'}
          </p>

          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">Retail Price (£) ex VAT</label>
              <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="salesprice" value={form.salesprice} onChange={handleChange} placeholder="0.00" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Wholesale Price (£) ex VAT</label>
              <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="wholesaleprice" value={form.wholesaleprice} onChange={handleChange} placeholder="0.00" />
            </div>
          </div>

          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">Reduced Wholesale (£) ex VAT</label>
              <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="reducedwholesaleprice" value={form.reducedwholesaleprice} onChange={handleChange} placeholder="0.00" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Cost Price (£) ex VAT</label>
              <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="costprice" value={form.costprice} onChange={handleChange} placeholder="0.00" />
            </div>
          </div>

          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">Weight (g)</label>
              <input className="pf-input pf-input-num" type="number" min="0" name="weight" value={form.weight} onChange={handleChange} placeholder="0" />
            </div>
            <div className="pf-field">
              <label className="pf-label">VAT Status</label>
              <select className="pf-input" name="vatstatus" value={form.vatstatus} onChange={handleChange}>
                {VAT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Flags */}
        <div className="pf-card">
          <h2 className="pf-card-title">Flags</h2>
          <div className="pf-checkbox-list">
            <label className="pf-checkbox-row">
              <input type="checkbox" name="isactive" checked={form.isactive} onChange={handleChange} />
              <span>
                <strong>Active</strong>
                <small>Product is available for orders</small>
              </span>
            </label>
            <label className="pf-checkbox-row">
              <input type="checkbox" name="isdropship" checked={form.isdropship} onChange={handleChange} />
              <span>
                <strong>Dropship</strong>
                <small>Fulfilled directly by supplier</small>
              </span>
            </label>
            <label className="pf-checkbox-row">
              <input type="checkbox" name="pickingbintracked" checked={form.pickingbintracked} onChange={handleChange} />
              <span>
                <strong>Picking Bin Tracked</strong>
                <small>Uses Mode 2 picking with bag calculation</small>
              </span>
            </label>
          </div>
        </div>

      </div>
    </div>
  )
}
