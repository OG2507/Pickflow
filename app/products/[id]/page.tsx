'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCategories } from '@/lib/useCategories'
import { usePriceBands } from '@/lib/usePriceBands'
import ProductStockPanel from '@/components/ProductStockPanel'
import ProductSuppliersPanel from '@/components/ProductSuppliersPanel'
import ProductComponentsPanel from '@/components/ProductComponentsPanel'
import type { Product, PricingCode } from '@/lib/types'

const VAT_OPTIONS = ['Standard', 'Zero', 'Exempt']

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price)

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const { categories, getSubcategories } = useCategories()
  const { priceBands } = usePriceBands()

  const [product, setProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<Partial<Product>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const subcategories = getSubcategories(form.category || '')

  const selectedBand: PricingCode | undefined = priceBands.find(
    (b) => b.pricingcodeid === form.pricingcodeid
  )

  useEffect(() => {
    const fetchProduct = async () => {
      const { data, error } = await supabase
        .from('tblproducts')
        .select('*')
        .eq('productid', id)
        .single()

      if (error || !data) {
        setError('Product not found.')
      } else {
        setProduct(data)
        setForm(data)
      }
      setLoading(false)
    }
    fetchProduct()
  }, [id])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    if (name === 'category') {
      setForm((prev) => ({ ...prev, category: value, subcategory: null }))
    } else if (name === 'pricingcode') {
      setForm((prev) => ({ ...prev, pricingcodeid: value ? Number(value) : null }))
    } else {
      setForm((prev) => ({
        ...prev,
        [name]: type === 'checkbox' ? checked
               : type === 'number'  ? (value === '' ? null : Number(value))
               : value,
      }))
    }

    setDirty(true)
    setSuccess(false)
  }

  const handleSave = async () => {
    if (!dirty) return
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('tblproducts')
      .update({ ...form, lastmodified: new Date().toISOString() })
      .eq('productid', id)

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
  if (error && !product) return <div className="pf-page"><div className="pf-empty">{error}</div></div>

  return (
    <div className="pf-page">

      <div className="pf-page-header">
        <div>
          <button className="pf-back" onClick={() => router.push('/products')}>
            ← Products
          </button>
          <h1 className="pf-page-title">{form.productname || 'Product'}</h1>
          <p className="pf-page-subtitle">{form.sku}</p>
        </div>
        <div className="pf-header-actions">
          {success && <span className="pf-saved">Saved</span>}
          {error && <span className="pf-error-inline">{error}</span>}
          <button className="pf-btn-secondary" onClick={() => router.push('/products')}>
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
            <h2 className="pf-card-title">Identity</h2>

            <div className="pf-field">
              <label className="pf-label">SKU</label>
              <input className="pf-input" name="sku" value={form.sku || ''} onChange={handleChange} />
            </div>

            <div className="pf-field">
              <label className="pf-label">Product Name</label>
              <input className="pf-input" name="productname" value={form.productname || ''} onChange={handleChange} />
            </div>

            <div className="pf-field">
              <label className="pf-label">Brand</label>
              <input className="pf-input" name="brand" value={form.brand || ''} onChange={handleChange} />
            </div>

            <div className="pf-field">
              <label className="pf-label">Category</label>
              <select className="pf-input" name="category" value={form.category || ''} onChange={handleChange}>
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
                value={form.subcategory || ''}
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

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Unit of Measure</label>
                <input className="pf-input" name="unitofmeasure" value={form.unitofmeasure || ''} onChange={handleChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Barcode</label>
                <input className="pf-input" name="barcode" value={form.barcode || ''} onChange={handleChange} />
              </div>
            </div>

            <div className="pf-field">
              <label className="pf-label">Description</label>
              <textarea className="pf-input pf-textarea" name="description" value={form.description || ''} onChange={handleChange} rows={3} />
            </div>

            <div className="pf-field">
              <label className="pf-label">Product Notes</label>
              <textarea className="pf-input pf-textarea" name="productnotes" value={form.productnotes || ''} onChange={handleChange} rows={2} />
            </div>
          </div>

          <div className="pf-card">
            <h2 className="pf-card-title">Pricing & VAT</h2>

            <div className="pf-field">
              <label className="pf-label">Price Band</label>
              <select
                className="pf-input"
                name="pricingcodeid"
                value={form.pricingcodeid ?? ''}
                onChange={handleChange}
              >
                <option value="">— No price band / use manual prices —</option>
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
                : 'Enter prices manually or select a price band above.'}
            </p>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Retail Price (£) ex VAT</label>
                <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="salesprice" value={form.salesprice ?? ''} onChange={handleChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Wholesale Price (£) ex VAT</label>
                <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="wholesaleprice" value={form.wholesaleprice ?? ''} onChange={handleChange} />
              </div>
            </div>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Reduced Wholesale (£) ex VAT</label>
                <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="reducedwholesaleprice" value={form.reducedwholesaleprice ?? ''} onChange={handleChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Cost Price (£) ex VAT</label>
                <input className="pf-input pf-input-num" type="number" step="0.01" min="0" name="costprice" value={form.costprice ?? ''} onChange={handleChange} />
              </div>
            </div>

            <div className="pf-field">
              <label className="pf-label">VAT Status</label>
              <select className="pf-input" name="vatstatus" value={form.vatstatus || 'Standard'} onChange={handleChange}>
                {VAT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="pf-card">
            <h2 className="pf-card-title">Dimensions & Weight</h2>
            <p className="pf-card-note">Weight in grams. Dimensions in mm.</p>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Weight (g)</label>
                <input className="pf-input pf-input-num" type="number" min="0" name="weight" value={form.weight ?? ''} onChange={handleChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Width (mm)</label>
                <input className="pf-input pf-input-num" type="number" min="0" name="width" value={form.width ?? ''} onChange={handleChange} />
              </div>
            </div>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Height (mm)</label>
                <input className="pf-input pf-input-num" type="number" min="0" name="height" value={form.height ?? ''} onChange={handleChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Depth (mm)</label>
                <input className="pf-input pf-input-num" type="number" min="0" name="depth" value={form.depth ?? ''} onChange={handleChange} />
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className="pf-detail-col">

          <div className="pf-card">
            <h2 className="pf-card-title">Stock & Reorder</h2>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Reorder Level</label>
                <input className="pf-input pf-input-num" type="number" min="0" name="reorderlevel" value={form.reorderlevel ?? ''} onChange={handleChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Reorder Qty</label>
                <input className="pf-input pf-input-num" type="number" min="0" name="reorderqty" value={form.reorderqty ?? ''} onChange={handleChange} />
              </div>
            </div>

            <div className="pf-field-row">
              <div className="pf-field">
                <label className="pf-label">Lead Time (days)</label>
                <input className="pf-input pf-input-num" type="number" min="0" name="leadtimedays" value={form.leadtimedays ?? ''} onChange={handleChange} />
              </div>
              <div className="pf-field">
                <label className="pf-label">Default Bag Size</label>
                <input className="pf-input pf-input-num" type="number" min="0" name="bagsizedefault" value={form.bagsizedefault ?? ''} onChange={handleChange} />
              </div>
            </div>
          </div>

          <div className="pf-card">
            <h2 className="pf-card-title">Flags</h2>
            <div className="pf-checkbox-list">
              <label className="pf-checkbox-row">
                <input type="checkbox" name="isactive" checked={form.isactive ?? true} onChange={handleChange} />
                <span>
                  <strong>Active</strong>
                  <small>Product is available for orders</small>
                </span>
              </label>
              <label className="pf-checkbox-row">
                <input type="checkbox" name="isdiscontinued" checked={form.isdiscontinued ?? false} onChange={handleChange} />
                <span>
                  <strong>Discontinued</strong>
                  <small>Excluded from reorder suggestions</small>
                </span>
              </label>
              <label className="pf-checkbox-row">
                <input type="checkbox" name="isdropship" checked={form.isdropship ?? false} onChange={handleChange} />
                <span>
                  <strong>Dropship</strong>
                  <small>Fulfilled directly by supplier</small>
                </span>
              </label>
              <label className="pf-checkbox-row">
                <input type="checkbox" name="isbundle" checked={form.isbundle ?? false} onChange={handleChange} />
                <span>
                  <strong>Bundle</strong>
                  <small>Assembled from component SKUs on picking</small>
                </span>
              </label>
              <label className="pf-checkbox-row">
                <input type="checkbox" name="pickingbintracked" checked={form.pickingbintracked ?? false} onChange={handleChange} />
                <span>
                  <strong>Picking Bin Tracked</strong>
                  <small>Uses Mode 2 picking with bag calculation</small>
                </span>
              </label>
            </div>
          </div>

          {/* Stock levels panel — not shown for bundles */}
          {product && !product.isbundle && <ProductStockPanel productid={product.productid} />}

          {/* Components panel — only shown for bundles */}
          {product?.isbundle && <ProductComponentsPanel productid={product.productid} />}

          {/* Supplier links panel — not shown for bundles */}
          {product && !product.isbundle && <ProductSuppliersPanel productid={product.productid} />}

          <div className="pf-card pf-card-meta">
            <h2 className="pf-card-title">Record Info</h2>
            <div className="pf-meta-row">
              <span>Product ID</span>
              <span>{product?.productid}</span>
            </div>
            <div className="pf-meta-row">
              <span>Date Added</span>
              <span>{product?.dateadded ? new Date(product.dateadded).toLocaleDateString('en-GB') : '—'}</span>
            </div>
            <div className="pf-meta-row">
              <span>Last Modified</span>
              <span>{product?.lastmodified ? new Date(product.lastmodified).toLocaleDateString('en-GB') : '—'}</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
