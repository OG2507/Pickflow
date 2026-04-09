'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/lib/usePermissions'

type AppUser = {
  userid: string
  email: string
  displayname: string
  isactive: boolean
  lastlogin: string | null
  permissions: string[]
}

type Permission = {
  permissionkey: string
  description: string
  area: string
}

export default function UsersPage() {
  const router = useRouter()
  const { can, loading: permLoading } = usePermissions()

  const [users, setUsers] = useState<AppUser[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // New user form
  const [showNewUser, setShowNewUser] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creatingUser, setCreatingUser] = useState(false)

  const fetchData = async () => {
    const [usersRes, permsRes, userPermsRes] = await Promise.all([
      supabase.from('tblusers').select('*').order('displayname'),
      supabase.from('tblpermissions').select('*').order('area, description'),
      supabase.from('tbluserpermissions').select('userid, permissionkey'),
    ])

    const userPermMap = new Map<string, string[]>()
    for (const up of userPermsRes.data || []) {
      if (!userPermMap.has(up.userid)) userPermMap.set(up.userid, [])
      userPermMap.get(up.userid)!.push(up.permissionkey)
    }

    const usersWithPerms = (usersRes.data || []).map((u: any) => ({
      ...u,
      permissions: userPermMap.get(u.userid) || [],
    }))

    setUsers(usersWithPerms)
    setPermissions(permsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const selectUser = (user: AppUser) => {
    setSelectedUser({ ...user, permissions: [...user.permissions] })
    setSuccess(false)
    setError(null)
  }

  const togglePermission = (key: string) => {
    if (!selectedUser) return
    const perms = selectedUser.permissions.includes(key)
      ? selectedUser.permissions.filter((p) => p !== key)
      : [...selectedUser.permissions, key]
    setSelectedUser({ ...selectedUser, permissions: perms })
  }

  const savePermissions = async () => {
    if (!selectedUser) return
    setSaving(true)
    setError(null)

    // Delete all existing permissions for this user
    await supabase.from('tbluserpermissions').delete().eq('userid', selectedUser.userid)

    // Insert new permissions
    if (selectedUser.permissions.length > 0) {
      const { error: insertErr } = await supabase.from('tbluserpermissions').insert(
        selectedUser.permissions.map((key) => ({ userid: selectedUser.userid, permissionkey: key }))
      )
      if (insertErr) { setError(insertErr.message); setSaving(false); return }
    }

    // Update active status
    await supabase.from('tblusers').update({ isactive: selectedUser.isactive }).eq('userid', selectedUser.userid)

    setSaving(false)
    setSuccess(true)
    fetchData()
  }

  const createUser = async () => {
    if (!newEmail || !newName || !newPassword) return
    setCreatingUser(true)
    setError(null)

    // Create auth user via API route
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPassword, displayname: newName }),
    })

    const data = await res.json()
    if (!data.success) {
      setError(data.error)
      setCreatingUser(false)
      return
    }

    setNewEmail('')
    setNewName('')
    setNewPassword('')
    setShowNewUser(false)
    setCreatingUser(false)
    fetchData()
  }

  // Group permissions by area
  const permsByArea = permissions.reduce((acc, p) => {
    if (!acc[p.area]) acc[p.area] = []
    acc[p.area].push(p)
    return acc
  }, {} as Record<string, Permission[]>)

  if (permLoading || loading) return <div className="pf-page"><div className="pf-loading">Loading…</div></div>
  if (!can('admin.users')) return <div className="pf-page"><div className="pf-empty">Access denied.</div></div>

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <button className="pf-btn-ghost" onClick={() => router.push('/admin')}>← Admin</button>
          <h1 className="pf-page-title">Users & Permissions</h1>
          <p className="pf-page-subtitle">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="pf-header-actions">
          <button className="pf-btn-primary" onClick={() => setShowNewUser(!showNewUser)}>
            + New User
          </button>
        </div>
      </div>

      {error && (
        <div className="pf-error-banner" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12 }}>✕</button>
        </div>
      )}

      {/* New user form */}
      {showNewUser && (
        <div className="pf-card" style={{ marginBottom: 24 }}>
          <h2 className="pf-card-title">Create New User</h2>
          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">Display Name</label>
              <input className="pf-input" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Email Address</label>
              <input className="pf-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" />
            </div>
            <div className="pf-field">
              <label className="pf-label">Temporary Password</label>
              <input className="pf-input" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="They can change this" />
            </div>
          </div>
          <p className="pf-card-note">The user will be able to log in immediately. Assign permissions after creating.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="pf-btn-primary" onClick={createUser} disabled={creatingUser || !newEmail || !newName || !newPassword}>
              {creatingUser ? 'Creating…' : 'Create User'}
            </button>
            <button className="pf-btn-ghost" onClick={() => setShowNewUser(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="pf-detail-layout">
        {/* LEFT — User list */}
        <div className="pf-detail-col" style={{ maxWidth: 340 }}>
          <div className="pf-card">
            <h2 className="pf-card-title">Users</h2>
            {users.map((user) => (
              <div
                key={user.userid}
                className={`pf-user-row ${selectedUser?.userid === user.userid ? 'pf-user-row-selected' : ''}`}
                onClick={() => selectUser(user)}
              >
                <div className="pf-user-name">{user.displayname}</div>
                <div className="pf-user-email">{user.email}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span className={`pf-badge ${user.isactive ? 'pf-badge-dispatched' : 'pf-badge-cancelled'}`}>
                    {user.isactive ? 'Active' : 'Inactive'}
                  </span>
                  <span className="pf-badge pf-badge-new">{user.permissions.length} permissions</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Permissions */}
        <div className="pf-detail-col">
          {!selectedUser ? (
            <div className="pf-card">
              <p className="pf-empty">Select a user to manage their permissions.</p>
            </div>
          ) : (
            <div className="pf-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 className="pf-card-title" style={{ margin: 0 }}>{selectedUser.displayname}</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {success && <span className="pf-success-msg">Saved</span>}
                  <label className="pf-checkbox-row" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={selectedUser.isactive}
                      onChange={(e) => setSelectedUser({ ...selectedUser, isactive: e.target.checked })}
                    />
                    <span><strong>Active</strong></span>
                  </label>
                  <button className="pf-btn-primary" onClick={savePermissions} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Permissions'}
                  </button>
                </div>
              </div>

              <p className="pf-card-note" style={{ marginBottom: 16 }}>
                Last login: {selectedUser.lastlogin ? new Date(selectedUser.lastlogin).toLocaleDateString('en-GB') : 'Never'}
              </p>

              {/* Quick select buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <button className="pf-btn-xs pf-btn-ghost" onClick={() => setSelectedUser({ ...selectedUser, permissions: permissions.map(p => p.permissionkey) })}>
                  Select All
                </button>
                <button className="pf-btn-xs pf-btn-ghost" onClick={() => setSelectedUser({ ...selectedUser, permissions: [] })}>
                  Clear All
                </button>
                <button className="pf-btn-xs pf-btn-ghost" onClick={() => setSelectedUser({ ...selectedUser, permissions: permissions.filter(p => p.permissionkey.endsWith('.view')).map(p => p.permissionkey) })}>
                  View Only
                </button>
              </div>

              {/* Permissions by area */}
              {Object.entries(permsByArea).map(([area, areaPerms]) => (
                <div key={area} style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{area}</h3>
                  <div className="pf-checkbox-list">
                    {areaPerms.map((p) => (
                      <label key={p.permissionkey} className="pf-checkbox-row">
                        <input
                          type="checkbox"
                          checked={selectedUser.permissions.includes(p.permissionkey)}
                          onChange={() => togglePermission(p.permissionkey)}
                        />
                        <span>
                          <strong>{p.description}</strong>
                          <small>{p.permissionkey}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
