'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import StockTabs from '@/components/StockTabs'

type StockCheckRow = {
  locationcode: string
  locationname: string
  locationtype: string
  sku: string
  productname: string
  quantityonhand: number
}

type Mode = 'location' | 'sku'

export default function StockCheckPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('location')

  // Location range state
  const [fromCode, setFromCode] = useState('')
  const [toCode, setToCode] = useState('')

  // SKU list state
  const [skuInput, setSkuInput] = useState('')
  const [notFoundSkus, setNotFoundSkus] = useState<string[]>([])

  // Shared state
  const [rows, setRows] = useState<StockCheckRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState(false)

  const generateLocationReport = async () => {
    if (!fromCode.trim() || !toCode.trim()) {
      setError('Enter both a from and to location code')
      return
    }

    setLoading(true)
    setError(null)
    setRows([])
    setGenerated(false)
    setNotFoundSkus([])

    const { data: locs } = await supabase
      .from('tbllocations')
      .select('locationid, locationcode, locationname, locationtype')
      .gte('locationcode', fromCode.trim().toUpperCase())
      .lte('locationcode', toCode.trim().toUpperCase())
      .eq('isactive', true)
      .order('locationcode')

    if (!locs || locs.length === 0) {
      setError('No locations found in that range')
      setLoading(false)
      return
    }

    const locationIds = locs.map((l: any) => l.locationid)
    const locMap = new Map(locs.map((l: any) => [l.locationid, l]))

    const { data: stock } = await supabase
      .from('tblstocklevels')
      .select(`stocklevelid, locationid, quantityonhand,
        tblproducts (sku, productname)`)
      .in('locationid', locationIds)
      .order('locationid')

    const result: StockCheckRow[] = (stock || []).map((s: any) => {
      const loc = locMap.get(s.locationid)
      return {
        locationcode: loc?.locationcode || '',
        locationname: loc?.locationname || '',
        locationtype: loc?.locationtype || '',
        sku: s.tblproducts?.sku || '',
        productname: s.tblproducts?.productname || '',
        quantityonhand: s.quantityonhand,
      }
    })

    result.sort((a, b) => a.locationcode.localeCompare(b.locationcode) || a.sku.localeCompare(b.sku))

    setRows(result)
    setGenerated(true)
    setLoading(false)
  }

  const generateSkuReport = async () => {
    const skus = skuInput
      .split(/[\n,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)

    if (skus.length === 0) {
      setError('Enter at least one SKU')
      return
    }

    setLoading(true)
    setError(null)
    setRows([])
    setGenerated(false)
    setNotFoundSkus([])

    // Fetch products matching the SKUs (separate query — no FK join)
    const { data: products } = await supabase
      .from('tblproducts')
      .select('productid, sku, productname')
      .in('sku', skus)

    if (!products || products.length === 0) {
      setError('No products found for the SKUs entered')
      setLoading(false)
      return
    }

    const foundSkus = new Set(products.map((p: any) => p.sku))
    const missing = skus.filter((s) => !foundSkus.has(s))
    setNotFoundSkus(missing)

    const productIds = products.map((p: any) => p.productid)
    const productMap = new Map(products.map((p: any) => [p.productid, p]))

    // Fetch stock levels for those products
    const { data: stock } = await supabase
      .from('tblstocklevels')
      .select('locationid, productid, quantityonhand')
      .in('productid', productIds)

    if (!stock || stock.length === 0) {
      setError('Products found but no stock locations assigned')
      setLoading(false)
      return
    }

    // Fetch locations separately
    const locationIds = [...new Set(stock.map((s: any) => s.locationid))]
    const { data: locs } = await supabase
      .from('tbllocations')
      .select('locationid, locationcode, locationname, locationtype')
      .in('locationid', locationIds)
      .eq('isactive', true)

    const locMap = new Map((locs || []).map((l: any) => [l.locationid, l]))

    const result: StockCheckRow[] = stock
      .filter((s: any) => locMap.has(s.locationid))
      .map((s: any) => {
        const loc = locMap.get(s.locationid)
        const prod = productMap.get(s.productid)
        return {
          locationcode: loc?.locationcode || '',
          locationname: loc?.locationname || '',
          locationtype: loc?.locationtype || '',
          sku: prod?.sku || '',
          productname: prod?.productname || '',
          quantityonhand: s.quantityonhand,
        }
      })

    // Sort by SKU then location
    result.sort((a, b) => a.sku.localeCompare(b.sku) || a.locationcode.localeCompare(b.locationcode))

    setRows(result)
    setGenerated(true)
    setLoading(false)
  }

  const handleGenerate = () => {
    if (mode === 'location') generateLocationReport()
    else generateSkuReport()
  }

  const printTitle = mode === 'location'
    ? `Locations: ${fromCode.toUpperCase()} to ${toCode.toUpperCase()}`
    : `SKUs: ${skuInput.split(/[\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean).join(', ')}`

  // For location mode print: group by location. For SKU mode print: group by SKU.
  const buildPrintRows = () => {
    if (mode === 'location') {
      return rows.map((row, i) => {
        const prevKey = i > 0 ? rows[i - 1].locationcode : null
        const header = prevKey !== row.locationcode
          ? `<tr class="group-header"><td colspan="6">${row.locationcode}${row.locationname ? ' — ' + row.locationname : ''}</td></tr>`
          : ''
        return `${header}<tr>
          <td class="sku-col">${row.sku}</td>
          <td>${row.productname}</td>
          <td>${row.locationcode}</td>
          <td class="count-col">${row.quantityonhand}</td>
          <td class="actual-col">&nbsp;</td>
          <td>&nbsp;</td>
        </tr>`
      }).join('')
    } else {
      return rows.map((row, i) => {
        const prevKey = i > 0 ? rows[i - 1].sku : null
        const header = prevKey !== row.sku
          ? `<tr class="group-header"><td colspan="6">${row.sku} — ${row.productname}</td></tr>`
          : ''
        return `${header}<tr>
          <td class="sku-col">${row.sku}</td>
          <td>${row.productname}</td>
          <td>${row.locationcode}${row.locationname ? ' (' + row.locationname + ')' : ''}</td>
          <td class="count-col">${row.quantityonhand}</td>
          <td class="actual-col">&nbsp;</td>
          <td>&nbsp;</td>
        </tr>`
      }).join('')
    }
  }

  const printReport = () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Stock Check</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 9pt; margin: 15mm; }
          h1 { font-size: 14pt; margin-bottom: 4pt; }
          .meta { font-size: 8pt; color: #666; margin-bottom: 12pt; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #2E4057; color: white; padding: 5pt 6pt; text-align: left; font-size: 8pt; }
          td { padding: 4pt 6pt; border-bottom: 0.5pt solid #ddd; font-size: 8pt; }
          tr:nth-child(even) td { background: #fafafa; }
          .group-header td { background: #e8edf2; font-weight: bold; font-size: 9pt; }
          .count-col { width: 80pt; text-align: right; }
          .actual-col { width: 80pt; border: 1pt solid #999; min-height: 14pt; }
          .sku-col { width: 80pt; font-family: monospace; }
          @media print { body { margin: 10mm; } }
        </style>
      </head>
      <body>
        <h1>Stock Check Sheet</h1>
        <div class="meta">
          ${printTitle} &nbsp;·&nbsp;
          ${rows.length} item${rows.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
          Printed: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <table>
          <thead>
            <tr>
              <th class="sku-col">SKU</th>
              <th>Product</th>
              <th>Location</th>
              <th class="count-col">System Qty</th>
              <th class="actual-col">Actual Count</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${buildPrintRows()}
          </tbody>
        </table>
        <div style="margin-top:20pt;font-size:8pt;color:#999">
          Checked by: _________________________ &nbsp;&nbsp; Date: _____________
        </div>
      </body>
      </html>
    `
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
      win.print()
    }
  }

  const switchMode = (newMode: Mode) => {
    setMode(newMode)
    setRows([])
    setGenerated(false)
    setError(null)
    setNotFoundSkus([])
  }

  return (
    <div className="pf-page">
      <div className="pf-page-header">
        <div>
          <h1 className="pf-page-title">Stock</h1>
        </div>
        {generated && rows.length > 0 && (
          <div className="pf-header-actions">
            <button className="pf-btn-primary" onClick={printReport}>Print Sheet</button>
          </div>
        )}
      </div>

      <StockTabs />

      {error && (
        <div className="pf-error-banner" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12 }}>✕</button>
        </div>
      )}

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={mode === 'location' ? 'pf-btn-primary' : 'pf-btn-secondary'}
          onClick={() => switchMode('location')}
        >
          By Location Range
        </button>
        <button
          className={mode === 'sku' ? 'pf-btn-primary' : 'pf-btn-secondary'}
          onClick={() => switchMode('sku')}
        >
          By SKU List
        </button>
      </div>

      {mode === 'location' && (
        <div className="pf-card" style={{ maxWidth: 500, marginBottom: 24 }}>
          <h2 className="pf-card-title">Location Range</h2>
          <div className="pf-field-row">
            <div className="pf-field">
              <label className="pf-label">From</label>
              <input
                className="pf-input pf-input-mono"
                type="text"
                placeholder="e.g. OV01"
                value={fromCode}
                onChange={(e) => setFromCode(e.target.value.toUpperCase())}
                style={{ maxWidth: 160 }}
              />
            </div>
            <div className="pf-field">
              <label className="pf-label">To</label>
              <input
                className="pf-input pf-input-mono"
                type="text"
                placeholder="e.g. OV10"
                value={toCode}
                onChange={(e) => setToCode(e.target.value.toUpperCase())}
                style={{ maxWidth: 160 }}
              />
            </div>
            <div className="pf-field" style={{ alignSelf: 'flex-end' }}>
              <button className="pf-btn-primary" onClick={handleGenerate} disabled={loading}>
                {loading ? 'Loading…' : 'Generate'}
              </button>
            </div>
          </div>
          <p className="pf-card-note" style={{ marginTop: 8 }}>
            Location codes are matched alphabetically — e.g. OV01 to OV10 returns all OV locations between those codes.
          </p>
        </div>
      )}

      {mode === 'sku' && (
        <div className="pf-card" style={{ maxWidth: 500, marginBottom: 24 }}>
          <h2 className="pf-card-title">SKU List</h2>
          <div className="pf-field">
            <label className="pf-label">SKUs</label>
            <textarea
              className="pf-input pf-input-mono"
              rows={6}
              placeholder={'Enter one SKU per line, or separate with commas\ne.g.\nABC-001\nABC-002\nXYZ-010'}
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value.toUpperCase())}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace' }}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="pf-btn-primary" onClick={handleGenerate} disabled={loading}>
              {loading ? 'Loading…' : 'Generate'}
            </button>
          </div>
          <p className="pf-card-note" style={{ marginTop: 8 }}>
            Results are grouped by SKU and show all locations where each product has stock.
          </p>
        </div>
      )}

      {notFoundSkus.length > 0 && (
        <div className="pf-error-inline" style={{ marginBottom: 16 }}>
          SKU{notFoundSkus.length !== 1 ? 's' : ''} not found: {notFoundSkus.join(', ')}
        </div>
      )}

      {generated && rows.length === 0 && (
        <div className="pf-card">
          <p className="pf-empty">No stock found.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="pf-card">
          <h2 className="pf-card-title">
            {rows.length} item{rows.length !== 1 ? 's' : ''}
          </h2>
          <table className="pf-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Location</th>
                <th className="pf-col-right">System Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const prevKey = mode === 'location' ? rows[i - 1]?.locationcode : rows[i - 1]?.sku
                const currKey = mode === 'location' ? row.locationcode : row.sku
                const isNewGroup = i > 0 && prevKey !== currKey
                return (
                  <tr key={i} className="pf-row" style={isNewGroup ? { borderTop: '2px solid var(--border-color)' } : {}}>
                    <td className="pf-sku">{row.sku}</td>
                    <td>{row.productname}</td>
                    <td className="pf-sku">{row.locationcode}{row.locationname ? ` (${row.locationname})` : ''}</td>
                    <td className="pf-col-right"><strong>{row.quantityonhand}</strong></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
