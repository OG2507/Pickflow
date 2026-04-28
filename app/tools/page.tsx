'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import Link from 'next/link'

export default function ToolsPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
    })
  }, [router])

  return (
    <>
      <Header />
      <main className="pf-page">
        <div className="pf-page-header">
          <div>
            <h1 className="pf-page-title">Tools</h1>
            <p className="pf-page-subtitle">Utilities to help with day-to-day tasks</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <Link href="/tools/order-converter" style={{ textDecoration: 'none' }}>
            <div className="pf-card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔄</div>
              <div className="pf-card-title">Order List Converter</div>
              <p className="pf-card-note" style={{ marginTop: '0.4rem' }}>
                Paste a customer order list in any format and convert it to SKU / QTY pairs ready to import.
              </p>
            </div>
          </Link>
        </div>
      </main>
    </>
  )
}
