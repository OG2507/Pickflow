'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Category = {
  categoryid: number
  categoryname: string
}

type SubCategory = {
  subcategoryid: number
  categoryid: number
  subcategoryname: string
}

export default function CategoriesPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<SubCategory[]>([])
  const [loading, setLoading] = useState(true)

  // New category form
  const [newCat, setNewCat] = useState('')
  const [savingCat, setSavingCat] = useState(false)

  // New subcategory form
  const [newSubCat, setNewSubCat] = useState('')
  const [newSubCatParent, setNewSubCatParent] = useState<number | ''>('')
  const [savingSubCat, setSavingSubCat] = useState(false)

  // Edit state
  const [editingCatId, setEditingCatId] = useState<number | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [editingSubCatId, setEditingSubCatId] = useState<number | null>(null)
  const [editingSubCatName, setEditingSubCatName] = useState('')

  const [error, setError] = useState<string | null>(null)

  const fetchAll = async () => {
    const [catRes, subRes] = await Promise.all([
      supabase.from('tblcategories').select('*').order('categoryname'),
      supabase.from('tblsubcategories').select('*').order('subcategoryname'),
    ])
    if (catRes.data) setCategories(catRes.data)
    if (subRes.data) setSubcategories(subRes.data)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  // Add category
  const addCategory = async () => {
    if (!newCat.trim()) return
    setSavingCat(true)
    setError(null)
    const { error: err } = await supabase.from('tblcategories').insert({ categoryname: newCat.trim() })
    if (err) { setError(err.message); setSavingCat(false); return }
    setNewCat('')
    setSavingCat(false)
    fetchAll()
  }

  // Save category edit
  const saveCategoryEdit = async (id: number) => {
    if (!editingCatName.trim()) return
    const { error: err } = await supabase.from('tblcategories').update({ categoryname: editingCatName.trim() }).eq('categoryid', id)
    if (err) { setError(err.message); return }
    setEditingCatId(null)
    fetchAll()
  }

  // Delete category
  const deleteCategory = async (id: number) => {
    const inUse = subcategories.some((s) => s.categoryid === id)
    if (inUse) { setError('Cannot delete — subcategories exist for this category. Remove them first.'); return }
    const { error: err } = await supabase.from('tblcategories').delete().eq('categoryid', id)
    if (err) { setError(err.message); return }
    fetchAll()
  }

  // Add subcategory
  const addSubCategory = async () => {
    if (!newSubCat.trim() || !newSubCatParent) return
    setSavingSubCat(true)
    setError(null)
    const { error: err } = await supabase.from('tblsubcategories').insert({ subcategoryname: newSubCat.trim(), categoryid: newSubCatParent })
    if (err) { setError(err.message); setSavingSubCat(false); return }
    setNewSubCat('')
    setSavingSubCat(false)
    fetchAll()
  }

  // Save subcategory edit
  const saveSubCategoryEdit = async (id: number) => {
    if (!editingSubCatName.trim()) return
    const { error: err } = await supabase.from('tblsubcategories').update({ subcategoryname: editingSubCatName.trim() }).eq('subcategoryid', id)
    if (err) { setError(err.message); return }
    setEditingSubCatId(null)
    fetchAll()
  }

  // Delete subcategory
  const deleteSubCategory = async (id: number) => {
    const { error: err } = await supabase.from('tblsubcategories').delete().eq('subcategoryid', id)
    if (err) { setError(err.message); return }
    fetchAll()
  }

  if (loading) return <div className="pf-page"><div className="pf-loading">Loading categories…</div></div>

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-btn-ghost" onClick={() => router.push('/admin')}>← Admin</button>
          <h1 className="pf-page-title">Categories</h1>
          <p className="pf-page-subtitle">
            {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} · {subcategories.length} sub-categor{subcategories.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
      </div>

      {error && (
        <div className="pf-error-banner" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12 }}>✕</button>
        </div>
      )}

      <div className="pf-detail-layout">
        {/* LEFT — Categories */}
        <div className="pf-detail-col">
          <div className="pf-card">
            <h2 className="pf-card-title">Categories</h2>

            {/* Add new */}
            <div className="pf-field-row" style={{ marginBottom: 16 }}>
              <input
                className="pf-input"
                type="text"
                placeholder="New category name…"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCategory()}
              />
              <button className="pf-btn-primary" onClick={addCategory} disabled={savingCat || !newCat.trim()}>
                Add
              </button>
            </div>

            {categories.length === 0 ? (
              <p className="pf-empty">No categories yet.</p>
            ) : (
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="pf-col-right">Subs</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.categoryid} className="pf-row">
                      <td>
                        {editingCatId === c.categoryid ? (
                          <input
                            className="pf-input pf-input-inline"
                            value={editingCatName}
                            onChange={(e) => setEditingCatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveCategoryEdit(c.categoryid)
                              if (e.key === 'Escape') setEditingCatId(null)
                            }}
                            autoFocus
                          />
                        ) : (
                          c.categoryname
                        )}
                      </td>
                      <td className="pf-col-right pf-category">
                        {subcategories.filter((s) => s.categoryid === c.categoryid).length}
                      </td>
                      <td className="pf-col-actions">
                        {editingCatId === c.categoryid ? (
                          <>
                            <button className="pf-btn-xs pf-btn-primary" onClick={() => saveCategoryEdit(c.categoryid)}>Save</button>
                            <button className="pf-btn-xs pf-btn-ghost" onClick={() => setEditingCatId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="pf-btn-xs pf-btn-ghost" onClick={() => { setEditingCatId(c.categoryid); setEditingCatName(c.categoryname) }}>Edit</button>
                            <button className="pf-btn-xs pf-btn-danger" onClick={() => deleteCategory(c.categoryid)}>Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT — Subcategories */}
        <div className="pf-detail-col">
          <div className="pf-card">
            <h2 className="pf-card-title">Sub-categories</h2>

            {/* Add new */}
            <div className="pf-field-row" style={{ marginBottom: 16 }}>
              <select
                className="pf-input pf-select"
                value={newSubCatParent}
                onChange={(e) => setNewSubCatParent(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">— Category —</option>
                {categories.map((c) => (
                  <option key={c.categoryid} value={c.categoryid}>{c.categoryname}</option>
                ))}
              </select>
              <input
                className="pf-input"
                type="text"
                placeholder="New sub-category…"
                value={newSubCat}
                onChange={(e) => setNewSubCat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubCategory()}
              />
              <button className="pf-btn-primary" onClick={addSubCategory} disabled={savingSubCat || !newSubCat.trim() || !newSubCatParent}>
                Add
              </button>
            </div>

            {subcategories.length === 0 ? (
              <p className="pf-empty">No sub-categories yet.</p>
            ) : (
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Sub-category</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {subcategories.map((s) => {
                    const parent = categories.find((c) => c.categoryid === s.categoryid)
                    return (
                      <tr key={s.subcategoryid} className="pf-row">
                        <td className="pf-category">{parent?.categoryname || '—'}</td>
                        <td>
                          {editingSubCatId === s.subcategoryid ? (
                            <input
                              className="pf-input pf-input-inline"
                              value={editingSubCatName}
                              onChange={(e) => setEditingSubCatName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveSubCategoryEdit(s.subcategoryid)
                                if (e.key === 'Escape') setEditingSubCatId(null)
                              }}
                              autoFocus
                            />
                          ) : (
                            s.subcategoryname
                          )}
                        </td>
                        <td className="pf-col-actions">
                          {editingSubCatId === s.subcategoryid ? (
                            <>
                              <button className="pf-btn-xs pf-btn-primary" onClick={() => saveSubCategoryEdit(s.subcategoryid)}>Save</button>
                              <button className="pf-btn-xs pf-btn-ghost" onClick={() => setEditingSubCatId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button className="pf-btn-xs pf-btn-ghost" onClick={() => { setEditingSubCatId(s.subcategoryid); setEditingSubCatName(s.subcategoryname) }}>Edit</button>
                              <button className="pf-btn-xs pf-btn-danger" onClick={() => deleteSubCategory(s.subcategoryid)}>Delete</button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
