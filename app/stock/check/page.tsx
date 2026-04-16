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

export default function StockCheckPage() {
  const router = useRouter()
  const [fromCode, setFromCode] = useState('')
  const [toCode, setToCode] = useState('')
  const [rows, setRows] = useState<StockCheckRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState(false)

  const generateReport = async () => {
    if (!fromCode.trim() || !toCode.trim()) {
      setError('Enter both a from and to location code')
      return
    }

    setLoading(true)
    setError(null)
    setRows([])
    setGenerated(false)

    // Fetch all locations in the range alphabetically
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

    // Fetch stock for those locations
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

    // Sort by location code then SKU
    result.sort((a, b) => a.locationcode.localeCompare(b.locationcode) || a.sku.localeCompare(b.sku))

    setRows(result)
    setGenerated(true)
    setLoading(false)
  }

  const printReport = () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Stock Check — ${fromCode} to ${toCode}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 9pt; margin: 15mm; }
          h1 { font-size: 14pt; margin-bottom: 4pt; }
          .meta { font-size: 8pt; color: #666; margin-bottom: 12pt; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #2E4057; color: white; padding: 5pt 6pt; text-align: left; font-size: 8pt; }
          td { padding: 4pt 6pt; border-bottom: 0.5pt solid #ddd; font-size: 8pt; }
          tr:nth-child(even) td { background: #fafafa; }
          .loc-header td { background: #e8edf2; font-weight: bold; font-size: 9pt; }
          .count-col { width: 80pt; text-align: right; }
          .actual-col { width: 80pt; border: 1pt solid #999; min-height: 14pt; }
          .sku-col { width: 80pt; font-family: monospace; }
          @media print { body { margin: 10mm; } }
        </style>
      </head>
      <body>
        <h1>Stock Check Sheet</h1>
        <div class="meta">
          Locations: ${fromCode.toUpperCase()} to ${toCode.toUpperCase()} &nbsp;·&nbsp;
          ${rows.length} items &nbsp;·&nbsp;
          Printed: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th class="sku-col">SKU</th>
              <th>Product</th>
              <th class="count-col">System Qty</th>
              <th class="actual-col">Actual Count</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, i) => {
              const prevLoc = i > 0 ? rows[i - 1].locationcode : null
              const locHeader = prevLoc !== row.locationcode
                ? `<tr class="loc-header"><td colspan="6">${row.locationcode} — ${row.locationname}</td></tr>`
                : ''
              return `${locHeader}
              <tr>
                <td>${row.locationcode}</td>
                <td class="sku-col">${row.sku}</td>
                <td>${row.productname}</td>
                <td class="count-col">${row.quantityonhand}</td>
                <td class="actual-col">&nbsp;</td>
                <td>&nbsp;</td>
              </tr>`
            }).join('')}
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
            <button className="pf-btn-primary" onClick={generateReport} disabled={loading}>
              {loading ? 'Loading…' : 'Generate'}
            </button>
          </div>
        </div>
        <p className="pf-card-note" style={{ marginTop: 8 }}>
          Location codes are matched alphabetically — e.g. OV01 to OV10 returns all OV locations between those codes.
        </p>
      </div>

      {generated && rows.length === 0 && (
        <div className="pf-card">
          <p className="pf-empty">No stock found in that location range.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="pf-card">
          <h2 className="pf-card-title">
            {fromCode} to {toCode} — {rows.length} item{rows.length !== 1 ? 's' : ''}
          </h2>
          <table className="pf-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>SKU</th>
                <th>Product</th>
                <th className="pf-col-right">System Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="pf-row">
                  <td className="pf-sku">{row.locationcode}</td>
                  <td className="pf-sku">{row.sku}</td>
                  <td>{row.productname}</td>
                  <td className="pf-col-right"><strong>{row.quantityonhand}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
