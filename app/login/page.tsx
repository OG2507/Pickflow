'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    // Update last login
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('tblusers')
        .update({ lastlogin: new Date().toISOString() })
        .eq('userid', user.id)
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="pf-login-page">
      <div className="pf-login-box">
        <div className="pf-login-logo">
          <span className="pf-logo-fallback">PickFlow</span>
        </div>

        <h1 className="pf-login-title">Sign in</h1>
        <p className="pf-login-subtitle">Oceanus Group · Warehouse Management</p>

        <form onSubmit={handleLogin} className="pf-login-form">
          <div className="pf-field">
            <label className="pf-label">Email address</label>
            <input
              className="pf-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="pf-field">
            <label className="pf-label">Password</label>
            <input
              className="pf-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="pf-login-error">{error}</div>
          )}

          <button
            type="submit"
            className="pf-btn-primary pf-btn-full"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="pf-login-footer">
          Forgotten your password? Contact your administrator.
        </p>
      </div>
    </div>
  )
}
