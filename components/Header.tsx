'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Products',        href: '/products' },
  { label: 'Clients',         href: '/clients' },
  { label: 'Suppliers',       href: '/suppliers' },
  { label: 'Stock',           href: '/stock' },
  { label: 'Orders',          href: '/orders' },
  { label: 'Purchase Orders', href: '/purchase-orders' },
  { label: 'Quotes',          href: '/quotes' },
  { label: 'Reports',         href: '/reports' },
]

export default function Header() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <header className="pf-header">
      <div className="pf-header-inner">

        {/* Logo */}
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

        {/* Desktop nav */}
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

        {/* Admin link — right side */}
        <Link
          href="/admin"
          className={`pf-nav-admin ${isActive('/admin') ? 'pf-nav-active' : ''}`}
        >
          Admin
        </Link>

        {/* Mobile hamburger */}
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

      {/* Mobile nav dropdown */}
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
          <Link
            href="/admin"
            className={`pf-mobile-nav-link ${isActive('/admin') ? 'pf-nav-active' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            Admin
          </Link>
        </nav>
      )}
    </header>
  )
}
