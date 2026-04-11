'use client'

import { usePathname, useRouter } from 'next/navigation'

const TABS = [
  { label: 'Stock',      href: '/stock' },
  { label: 'Move',       href: '/stock/move' },
  { label: 'Adjust',     href: '/stock/adjustment' },
  { label: 'Movements',  href: '/stock/movements' },
]

export default function StockTabs() {
  const pathname = usePathname()
  const router = useRouter()

  const isActive = (href: string) => {
    if (href === '/stock') return pathname === '/stock'
    return pathname.startsWith(href)
  }

  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: '1.5rem' }}>
      {TABS.map((t) => (
        <button
          key={t.href}
          onClick={() => router.push(t.href)}
          style={{
            padding: '0.6rem 1.25rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: isActive(t.href) ? 600 : 400,
            color: isActive(t.href) ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: isActive(t.href) ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: '-2px',
            fontSize: '0.9rem',
            transition: 'all 0.15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
