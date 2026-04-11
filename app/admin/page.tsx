'use client'

import { useRouter } from 'next/navigation'

const ADMIN_SECTIONS = [
  {
    title: 'Price Bands',
    description: 'Manage retail, wholesale, and reduced wholesale prices by band code.',
    href: '/admin/price-bands',
  },
  {
    title: 'Locations',
    description: 'Manage warehouse locations — picking bins, overflow bays, despatch areas.',
    href: '/admin/locations',
  },
  {
    title: 'Shipping Rates',
    description: 'Manage Royal Mail shipping methods, weight bands, and prices.',
    href: '/admin/shipping-rates',
  },
  {
    title: 'Categories',
    description: 'Manage product categories and sub-categories.',
    href: '/admin/categories',
  },
  {
    title: 'App Settings',
    description: 'Company name, VAT rate, order number prefix, and other system settings.',
    href: '/admin/settings',
  },
  {
    title: 'Delivery Method Map',
    description: 'Map Shopwired delivery names to Royal Mail service codes for Click and Drop.',
    href: '/admin/delivery-map',
  },
  {
    title: 'Users & Roles',
    description: 'Manage user accounts and role-based access.',
    href: '/admin/users',
  },
  {
    title: 'Activity Log',
    description: 'View system activity — logins, order changes, and stock movements.',
    href: '/admin/activity',
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
