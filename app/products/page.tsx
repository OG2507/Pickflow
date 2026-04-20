'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 50

type ProductRow = {
  productid: number
  sku: string
  productname: string
  category: string | null
  salesprice: number
  costprice: number | null
  vatstatus: 'Standard' | 'Zero' | 'Exempt'
  isactive: boolean
}

export default function ProductsPage() {
  const router = useRouter()

  const [products, setProducts] = useState<ProductRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [categories, setCategories] = useState<string[]>([])

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('tblcategories')
      .select('categoryname')
      .order('categoryname', { ascending: true })
    if (error) {
      console.error('Error fetching categories:', error)
    } else {
      setCategories((data || []).map((c) => c.categoryname).filter(Boolean))
    }
  }, [])

  const fetchProducts = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('tblproducts')
      .select('productid, sku, productname, category, salesprice, costprice, vatstatus, isactive', { count: 'exact' })
      .order('sku', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (activeFilter === 'active') query = query.eq('isactive', true)
    if (activeFilter === 'inactive') query = query.eq('isactive', false)
    if (categoryFilter) query = query.eq('category', categoryFilter)
    if (search.trim()) query = query.or(`sku.ilike.%${search.trim()}%,productname.ilike.%${search.trim()}%`)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching products:', error)
    } else {
      setProducts(data || [])
      setTotalCount(count ?? 0)
    }

    setLoading(false)
  }, [activeFilter, categoryFilter, search, page])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const handleSearchChange = (val: string) => {
    setSearch(val)
    setPage(0)
  }

  const handleCategoryChange = (val: string) => {
    setCategoryFilter(val)
    setPage(0)
  }

  const handleActiveFilterChange = (val: 'all' | 'active' | 'inactive') => {
    setActiveFilter(val)
    setPage(0)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price)

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Products</h1>
          <p className="pf-page-subtitle">
            {loading
              ? '—'
              : `${totalCount} product${totalCount !== 1 ? 's' : ''}${search || categoryFilter ? ' matching filters' : ''}`}
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
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pf-input pf-search"
        />

        <select
          value={categoryFilter}
          onChange={(e) => handleCategoryChange(e.target.value)}
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
              onClick={() => handleActiveFilterChange(val)}
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
                  <td className="pf-col-right pf-price pf-muted">{formatPrice(p.costprice ?? 0)}</td>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pf-pagination">
          <button
            className="pf-btn-secondary"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </button>
          <span className="pf-pagination-info">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="pf-btn-secondary"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
