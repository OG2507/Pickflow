'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { clearPermissionCache } from '@/lib/usePermissions'

const NAV_ITEMS = [
  { label: 'Products',        href: '/products' },
  { label: 'Clients',         href: '/clients' },
  { label: 'Suppliers',       href: '/suppliers' },
  { label: 'Stock',           href: '/stock' },
  { label: 'Reorder',         href: '/stock/reorder' },
  { label: 'Orders',          href: '/orders' },
  { label: 'Purchase Orders', href: '/purchase-orders' },
  { label: 'Quotes',          href: '/quotes' },
  { label: 'Reports',         href: '/reports' },
  { label: 'Admin',           href: '/admin' },
]

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('tblusers')
          .select('displayname')
          .eq('userid', user.id)
          .single()
        if (data) setDisplayName(data.displayname)
      }
    }
    loadUser()
  }, [])

  const handleLogout = async () => {
    clearPermissionCache()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <header className="pf-header">
      <div className="pf-header-inner">

        <Link href="/" className="pf-logo">
          <Image
            src="/logo.png"
            alt="PickFlow"
            width={200}
            height={48}
            priority
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              const fallback = target.nextSibling as HTMLElement
              if (fallback) fallback.style.display = 'block'
            }}
          />
          <span className="pf-logo-fallback">PickFlow</span>
        </Link>

        <nav className="pf-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`pf-nav-link ${isActive(item.href) ? 'pf-nav-active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="pf-header-right">
          {displayName && (
            <div className="pf-user-menu-wrap">
              <button
                className="pf-user-btn"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <span className="pf-user-avatar">{displayName.charAt(0).toUpperCase()}</span>
                <span className="pf-user-name">{displayName}</span>
                <span className="pf-user-caret">▾</span>
              </button>
              {userMenuOpen && (
                <div className="pf-user-dropdown">
                  <div className="pf-user-dropdown-name">{displayName}</div>
                  <button className="pf-user-dropdown-item" onClick={handleLogout}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            className="pf-hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span className={`pf-ham-line ${menuOpen ? 'pf-ham-open-1' : ''}`} />
            <span className={`pf-ham-line ${menuOpen ? 'pf-ham-open-2' : ''}`} />
            <span className={`pf-ham-line ${menuOpen ? 'pf-ham-open-3' : ''}`} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="pf-mobile-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`pf-mobile-nav-link ${isActive(item.href) ? 'pf-nav-active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <button className="pf-mobile-nav-link" onClick={handleLogout}>
            Sign out
          </button>
        </nav>
      )}
    </header>
  )
}
