import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type PermissionState = {
  permissions: Set<string>
  loading: boolean
  can: (key: string) => boolean
  isAdmin: boolean
}

let cachedPermissions: Set<string> | null = null
let cachedUserId: string | null = null

export function usePermissions(): PermissionState {
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // Use cache if same user
      if (cachedUserId === user.id && cachedPermissions) {
        setPermissions(cachedPermissions)
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('tbluserpermissions')
        .select('permissionkey')
        .eq('userid', user.id)

      const perms = new Set<string>((data || []).map((p: any) => p.permissionkey))
      cachedPermissions = perms
      cachedUserId = user.id
      setPermissions(perms)
      setLoading(false)
    }
    load()
  }, [])

  const can = (key: string) => permissions.has(key)
  const isAdmin = permissions.has('admin.users')

  return { permissions, loading, can, isAdmin }
}

// Call this to clear cache on logout
export function clearPermissionCache() {
  cachedPermissions = null
  cachedUserId = null
}
