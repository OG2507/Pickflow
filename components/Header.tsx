'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

type NavItem = {
  label: string
  href: string
  children?: { label: string; href: string }[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Products',        href: '/products' },
  { label: 'Clients',         href: '/clients' },
  { label: 'Suppliers',       href: '/suppliers' },
  {
    label: 'Stock',
    href: '/stock',
    children: [
      { label: 'Stock',   href: '/stock' },
      { label: 'Reorder', href: '/stock/reorder' },
    ],
  },
  { label: 'Orders',          href: '/orders' },
  { label: 'Purchase Orders', href: '/purchase-orders' },
  { label: 'Quotes',          href: '/quotes' },
  { label: 'Reports',         href: '/reports' },
]

export default function Header() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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

        <nav className="pf-nav" ref={dropdownRef}>
          {NAV_ITEMS.map((item) =>
            item.children ? (
              <div
                key={item.href}
                className="pf-nav-dropdown-wrap"
                onMouseEnter={() => setOpenDropdown(item.href)}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <button
                  className={`pf-nav-link pf-nav-dropdown-trigger ${isActive(item.href) ? 'pf-nav-active' : ''}`}
                  onClick={() => setOpenDropdown(openDropdown === item.href ? null : item.href)}
                >
                  {item.label}
                  <span className="pf-nav-chevron">▾</span>
                </button>
                {openDropdown === item.href && (
                  <div className="pf-nav-dropdown">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`pf-nav-dropdown-item ${pathname === child.href ? 'pf-nav-dropdown-active' : ''}`}
                        onClick={() => setOpenDropdown(null)}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`pf-nav-link ${isActive(item.href) ? 'pf-nav-active' : ''}`}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>

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

      {menuOpen && (
        <nav className="pf-mobile-nav">
          {NAV_ITEMS.map((item) =>
            item.children ? (
              <div key={item.href}>
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
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`pf-mobile-nav-link ${isActive(item.href) ? 'pf-nav-active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
      )}
    </header>
  )
}
