import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { PricingCode } from '@/lib/types'

export function usePriceBands() {
  const [priceBands, setPriceBands] = useState<PricingCode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('tblpricingcodes')
        .select('*')
        .eq('isactive', true)
        .order('pricingcode')

      if (data) setPriceBands(data)
      setLoading(false)
    }
    fetch()
  }, [])

  return { priceBands, loading }
}
