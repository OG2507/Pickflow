'use client'

import { useRouter } from 'next/navigation'

export default function QuotesPage() {
  const router = useRouter()
  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Quotes</h1>
          <p className="pf-page-subtitle">Coming soon</p>
        </div>
      </div>
      <div className="pf-card" style={{ maxWidth: 500 }}>
        <p className="pf-empty">The quotes module is not yet available.</p>
      </div>
    </div>
  )
}
