'use client'

import { useRouter } from 'next/navigation'

const ADMIN_SECTIONS = [
  {
    title: 'Price Bands',
    description: 'Manage retail, wholesale, and reduced wholesale prices by band code.',
    href: '/admin/price-bands',
  },
  {
    title: 'Categories',
    description: 'Manage product categories and sub-categories.',
    href: '/admin/categories',
    comingSoon: true,
  },
  {
    title: 'Shipping Rates',
    description: 'Manage Royal Mail shipping methods, weight bands, and prices.',
    href: '/admin/shipping-rates',
    comingSoon: true,
  },
  {
    title: 'App Settings',
    description: 'Company name, VAT rate, order number prefix, and other system settings.',
    href: '/admin/settings',
    comingSoon: true,
  },
  {
    title: 'Users & Roles',
    description: 'Manage user accounts and role-based access.',
    href: '/admin/users',
    comingSoon: true,
  },
]

export default function AdminPage() {
  const router = useRouter()

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Admin</h1>
          <p className="pf-page-subtitle">System configuration and management</p>
        </div>
      </div>

      <div className="pf-admin-grid">
        {ADMIN_SECTIONS.map((section) => (
          <div
            key={section.href}
            className={`pf-admin-card ${section.comingSoon ? 'pf-admin-card-disabled' : ''}`}
            onClick={() => !section.comingSoon && router.push(section.href)}
          >
            <div className="pf-admin-card-title">
              {section.title}
              {section.comingSoon && <span className="pf-coming-soon">Coming soon</span>}
            </div>
            <div className="pf-admin-card-desc">{section.description}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
