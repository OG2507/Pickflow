import { useEffect, useState } from 'react'
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

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<SubCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const [catResult, subResult] = await Promise.all([
        supabase
          .from('tblcategories')
          .select('categoryid, categoryname')
          .order('categoryname'),
        supabase
          .from('tblsubcategories')
          .select('subcategoryid, categoryid, subcategoryname')
          .order('subcategoryname'),
      ])

      if (catResult.data) setCategories(catResult.data)
      if (subResult.data) setSubcategories(subResult.data)
      setLoading(false)
    }
    fetch()
  }, [])

  const getSubcategories = (categoryName: string) => {
    const cat = categories.find((c) => c.categoryname === categoryName)
    if (!cat) return []
    return subcategories.filter((s) => s.categoryid === cat.categoryid)
  }

  return { categories, getSubcategories, loading }
}
