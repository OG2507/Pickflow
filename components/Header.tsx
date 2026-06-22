'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { clearPermissionCache } from '@/lib/usePermissions'

// Navigation structure.
// A 'link' is a flat top-level item. A 'group' is a dropdown with children.
type NavLink = { label: string; href: string }
type NavItem =
  | { type: 'link'; label: string; href: string }
  | { type: 'group'; label: string; children: NavLink[] }

const NAV: NavItem[] = [
  { type: 'link', label: 'Orders', href: '/orders' },
  {
    type: 'group',
    label: 'Catalogue',
    children: [
      { label: 'Products',        href: '/products' },
      { label: 'Suppliers',       href: '/suppliers' },
      { label: 'Purchase Orders', href: '/purchase-orders' },
    ],
  },
  {
    type: 'group',
    label: 'Stock',
    children: [
      { label: 'Stock',   href: '/stock' },
      { label: 'Reorder', href: '/stock/reorder' },
    ],
  },
  {
    type: 'group',
    label: 'Sales',
    children: [
      { label: 'Quotes',  href: '/quotes' },
      { label: 'Clients', href: '/clients' },
    ],
  },
  {
    type: 'group',
    label: 'More',
    children: [
      { label: 'Reports', href: '/reports' },
      { label: 'Tools',   href: '/tools' },
      { label: 'Admin',   href: '/admin' },
    ],
  },
]

export default function Header() {
  const pathname = usePathname()
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
    setDisplayName(null)
    setUserMenuOpen(false)
    window.location.href = '/login'
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  // A group is highlighted when any of its children is the current page.
  const isGroupActive = (children: NavLink[]) =>
    children.some((c) => isActive(c.href))

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
          {NAV.map((item) =>
            item.type === 'link' ? (
              <Link
                key={item.href}
                href={item.href}
                className={`pf-nav-link ${isActive(item.href) ? 'pf-nav-active' : ''}`}
              >
                {item.label}
              </Link>
            ) : (
              <div key={item.label} className="pf-nav-dropdown-wrap">
                <button
                  type="button"
                  className={`pf-nav-dropdown-trigger ${isGroupActive(item.children) ? 'pf-nav-active' : ''}`}
                >
                  {item.label}
                  <span className="pf-nav-chevron">▾</span>
                </button>
                <div className="pf-nav-dropdown">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`pf-nav-dropdown-item ${isActive(child.href) ? 'pf-nav-dropdown-active' : ''}`}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              </div>
            )
          )}
        </nav>

        <div className="pf-header-right">
          {displayName && (
            <div className="pf-user-menu-wrap">
              <button
                className="pf-user-btn"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
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
          {NAV.map((item) =>
            item.type === 'link' ? (
              <Link
                key={item.href}
                href={item.href}
                className={`pf-mobile-nav-link ${isActive(item.href) ? 'pf-nav-active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ) : (
              <div key={item.label}>
                <div className="pf-mobile-nav-group-label">{item.label}</div>
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={`pf-mobile-nav-link pf-mobile-nav-child ${isActive(child.href) ? 'pf-nav-active' : ''}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            )
          )}
          <button className="pf-mobile-nav-link" onClick={handleLogout}>
            Sign out
          </button>
        </nav>
      )}
    </header>
  )
}
