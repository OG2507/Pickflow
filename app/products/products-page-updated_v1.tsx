'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/lib/types'

export default function ProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [categories, setCategories] = useState<string[]>([])

  const fetchProducts = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('tblproducts')
      .select('*')
      .order('sku', { ascending: true })

    if (activeFilter === 'active') query = query.eq('isactive', true)
    if (activeFilter === 'inactive') query = query.eq('isactive', false)
    if (categoryFilter) query = query.eq('category', categoryFilter)

    if (search.trim()) {
      query = query.or(
        `sku.ilike.%${search.trim()}%,productname.ilike.%${search.trim()}%`
      )
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching products:', error)
    } else {
      setProducts(data || [])
    }

    setLoading(false)
  }, [search, categoryFilter, activeFilter])

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from('tblproducts')
        .select('category')
        .not('category', 'is', null)
        .order('category')

      if (data) {
        const unique = [...new Set(data.map((r) => r.category).filter(Boolean))] as string[]
        setCategories(unique)
      }
    }
    fetchCategories()
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price)

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Products</h1>
          <p className="pf-page-subtitle">
            {loading ? '—' : `${products.length} product${products.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          className="pf-btn-primary"
          onClick={() => router.push('/products/new')}
        >
          + New Product
        </button>
      </div>

      {/* Filters */}
      <div className="pf-filters">
        <input
          type="text"
          placeholder="Search SKU or product name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pf-input pf-search"
        />

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="pf-input pf-select"
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <div className="pf-toggle-group">
          {(['active', 'all', 'inactive'] as const).map((val) => (
            <button
              key={val}
              onClick={() => setActiveFilter(val)}
              className={`pf-toggle ${activeFilter === val ? 'pf-toggle-on' : ''}`}
            >
              {val.charAt(0).toUpperCase() + val.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="pf-table-wrap">
        {loading ? (
          <div className="pf-loading">Loading products…</div>
        ) : products.length === 0 ? (
          <div className="pf-empty">No products found.</div>
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Category</th>
                <th className="pf-col-right">Sales Price</th>
                <th className="pf-col-right">Cost Price</th>
                <th>VAT</th>
                <th className="pf-col-center">Active</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr
                  key={p.productid}
                  className="pf-row"
                  onClick={() => router.push(`/products/${p.productid}`)}
                >
                  <td className="pf-sku">{p.sku}</td>
                  <td className="pf-productname">{p.productname}</td>
                  <td className="pf-category">{p.category ?? '—'}</td>
                  <td className="pf-col-right pf-price">{formatPrice(p.salesprice)}</td>
                  <td className="pf-col-right pf-price pf-muted">{formatPrice(p.costprice)}</td>
                  <td>
                    <span className={`pf-badge ${p.vatstatus === 'Standard' ? 'pf-badge-vat' : 'pf-badge-zero'}`}>
                      {p.vatstatus}
                    </span>
                  </td>
                  <td className="pf-col-center">
                    <span className={`pf-dot ${p.isactive ? 'pf-dot-on' : 'pf-dot-off'}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
