'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

// ─────────────────────────────────────────────────────────────
// OrderUploadPanel
//
// Lets the user upload a SKU+Qty list (Excel/CSV) or paste from
// the clipboard, preview matches, resolve issues, and bulk-add
// lines to an order.
//
// Pricing uses the same getClientPrice logic as manual Add Product
// — passed in as a prop so there is a single source of truth.
// ─────────────────────────────────────────────────────────────

type Product = {
  productid: number
  sku: string
  productname: string
  category: string | null
  salesprice: number
  wholesaleprice: number
  reducedwholesaleprice: number
  pricingcode: string | null
  vatstatus: string
  weight: number | null
  isactive: boolean
}

// A single parsed row from the customer's file/paste
type ParsedRow = {
  rowNumber: number      // original row in the source
  rawSku: string         // SKU exactly as supplied
  rawQty: string         // Qty exactly as supplied
}

// After matching, each row is classified as one of these states.
type PreviewRow = {
  id: string                // unique render key
  rowNumber: number
  rawSku: string
  rawQty: string
  quantity: number          // parsed qty (0 if invalid)
  product: Product | null   // resolved product (null if unmatched)
  unitPrice: number         // resolved price
  duplicateWith: string[]   // ids of other rows with the same matched SKU
  status: 'ok' | 'unmatched' | 'inactive' | 'badqty' | 'duplicate'
  duplicateAction: 'sum' | 'separate' | 'skip'   // user choice for dupes
  include: boolean          // whether this row will be inserted
}

type Props = {
  orderId: number
  orderNumber: string
  onAdded: () => Promise<void> | void           // parent refreshes its lines/totals
  getClientPrice: (product: Product) => Promise<number>
  onClose: () => void
}

const VAT_RATE = 0.2

export default function OrderUploadPanel({
  orderId,
  orderNumber,
  onAdded,
  getClientPrice,
  onClose,
}: Props) {
  const [stage, setStage] = useState<'input' | 'preview' | 'inserting'>('input')
  const [pasteText, setPasteText] = useState('')
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [insertResult, setInsertResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Parsing ────────────────────────────────────────────────

  /**
   * Given an array of 2-element string arrays, turn it into ParsedRow[].
   * Drops header rows (row 1 where col 2 is not a number) and blank rows.
   */
  const rowsToParsed = (rows: string[][]): ParsedRow[] => {
    const out: ParsedRow[] = []
    rows.forEach((cells, idx) => {
      const sku = (cells[0] ?? '').toString().trim()
      const qty = (cells[1] ?? '').toString().trim()

      // Skip completely blank rows
      if (!sku && !qty) return

      // Skip header row: first non-blank row where qty isn't numeric
      if (idx === 0 && qty && isNaN(Number(qty.replace(/[,\s]/g, '')))) {
        return
      }

      out.push({
        rowNumber: idx + 1,
        rawSku: sku,
        rawQty: qty,
      })
    })
    return out
  }

  const parsePasted = (): ParsedRow[] => {
    const text = pasteText.trim()
    if (!text) return []

    // Split on line breaks, then on tab or comma
    const lines = text.split(/\r?\n/)
    const rows: string[][] = lines.map((line) => {
      // Prefer tab (Excel default) if present, else comma
      if (line.includes('\t')) return line.split('\t')
      return line.split(',')
    })
    return rowsToParsed(rows)
  }

  const parseFile = async (file: File): Promise<ParsedRow[]> => {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const firstSheet = wb.SheetNames[0]
    if (!firstSheet) throw new Error('No sheets found in file')
    const ws = wb.Sheets[firstSheet]
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      blankrows: false,
      raw: false,
      defval: '',
    })
    return rowsToParsed(rows)
  }

  // ── Match parsed rows against tblproducts ──────────────────

  /**
   * Normalise a SKU for matching: strip all whitespace, lowercase.
   * Hyphens and other punctuation preserved so genuinely different
   * SKUs (e.g. "AB-123" vs "AB123") don't collide.
   */
  const normaliseSku = (sku: string) => sku.replace(/\s+/g, '').toLowerCase()

  const buildPreview = async (parsed: ParsedRow[]) => {
    if (parsed.length === 0) {
      setParseError('No rows found. Check the file has SKU in column A and quantity in column B.')
      return
    }
    setParseError(null)

    // Normalised input SKUs we need to find
    const inputNormalised = Array.from(
      new Set(parsed.map((r) => normaliseSku(r.rawSku)).filter(Boolean))
    )

    // Fetch the full product catalogue in a lightweight pass so we can
    // match against whitespace-normalised DB SKUs client-side. Supabase's
    // ilike can't strip whitespace server-side, so we need the list in memory.
    // This is a single direct query — no FK joins, fast even for large catalogues.
    const { data: catalogue, error } = await supabase
      .from('tblproducts')
      .select('productid, sku, productname, category, salesprice, wholesaleprice, reducedwholesaleprice, pricingcode, vatstatus, weight, isactive')

    if (error) {
      console.error('Product lookup error:', error)
      setParseError('Could not look up products: ' + error.message)
      return
    }

    // Build a Map keyed on normalised DB SKU → product.
    // If two DB SKUs normalise to the same key (very unlikely but possible),
    // the first one wins — they'd both show up and need investigation anyway.
    const skuMap = new Map<string, Product>()
    ;(catalogue || []).forEach((p) => {
      const key = normaliseSku(p.sku)
      if (key && !skuMap.has(key)) {
        skuMap.set(key, p as Product)
      }
    })

    // Build preview rows and resolve prices for matched items
    const previews: PreviewRow[] = []

    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i]
      const lookupKey = normaliseSku(r.rawSku)
      const product = skuMap.get(lookupKey) || null

      // Parse quantity — strip commas, spaces
      const qtyNum = parseInt(r.rawQty.replace(/[,\s]/g, ''), 10)
      const qtyValid = !isNaN(qtyNum) && qtyNum > 0

      let unitPrice = 0
      if (product && qtyValid) {
        try {
          unitPrice = await getClientPrice(product)
        } catch (e) {
          console.error('Price lookup failed for', product.sku, e)
        }
      }

      let status: PreviewRow['status'] = 'ok'
      if (!product) status = 'unmatched'
      else if (!product.isactive) status = 'inactive'
      else if (!qtyValid) status = 'badqty'

      previews.push({
        id: `row-${i}`,
        rowNumber: r.rowNumber,
        rawSku: r.rawSku,
        rawQty: r.rawQty,
        quantity: qtyValid ? qtyNum : 0,
        product,
        unitPrice,
        duplicateWith: [],
        status,
        duplicateAction: 'sum',
        include: status === 'ok',
      })
    }

    // Detect duplicates: same resolved productid appearing more than once
    const byProduct = new Map<number, string[]>()
    previews.forEach((p) => {
      if (p.product) {
        const arr = byProduct.get(p.product.productid) || []
        arr.push(p.id)
        byProduct.set(p.product.productid, arr)
      }
    })

    byProduct.forEach((ids) => {
      if (ids.length > 1) {
        ids.forEach((id) => {
          const row = previews.find((p) => p.id === id)
          if (row && row.status === 'ok') {
            row.status = 'duplicate'
            row.duplicateWith = ids.filter((x) => x !== id)
          }
        })
      }
    })

    setPreviewRows(previews)
    setStage('preview')
  }

  // ── File / paste handlers ──────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const parsed = await parseFile(file)
      await buildPreview(parsed)
    } catch (err: any) {
      console.error('File parse error:', err)
      setParseError('Could not read file: ' + (err.message || 'unknown error'))
    }
    // Reset so selecting the same file again re-triggers
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePasteSubmit = async () => {
    const parsed = parsePasted()
    await buildPreview(parsed)
  }

  // ── Preview edits ──────────────────────────────────────────

  const updateRow = (id: string, patch: Partial<PreviewRow>) => {
    setPreviewRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    )
  }

  const updateQuantity = (id: string, qty: number) => {
    const row = previewRows.find((r) => r.id === id)
    if (!row) return
    const qtyValid = !isNaN(qty) && qty > 0
    updateRow(id, {
      quantity: qtyValid ? qty : 0,
      status: !row.product ? 'unmatched' :
              !row.product.isactive ? 'inactive' :
              !qtyValid ? 'badqty' :
              row.duplicateWith.length > 0 ? 'duplicate' :
              'ok',
      include: qtyValid && row.product != null && row.product.isactive,
    })
  }

  // ── Commit to database ─────────────────────────────────────

  const handleInsert = async () => {
    setStage('inserting')

    // Filter to rows that will actually be inserted
    const toInsert = previewRows.filter((r) => {
      if (!r.include) return false
      if (!r.product || !r.product.isactive) return false
      if (r.quantity <= 0) return false
      if (r.status === 'duplicate' && r.duplicateAction === 'skip') return false
      return true
    })

    // Handle duplicate-sum: consolidate rows where action is 'sum'
    // Group duplicates by productid
    const sumGroups = new Map<number, PreviewRow[]>()
    const finalRows: PreviewRow[] = []

    toInsert.forEach((row) => {
      if (!row.product) return
      if (row.status === 'duplicate' && row.duplicateAction === 'sum') {
        const arr = sumGroups.get(row.product.productid) || []
        arr.push(row)
        sumGroups.set(row.product.productid, arr)
      } else {
        finalRows.push(row)
      }
    })

    // For each sum group, take the first row and sum the quantities
    sumGroups.forEach((group) => {
      const first = group[0]
      const totalQty = group.reduce((sum, r) => sum + r.quantity, 0)
      finalRows.push({ ...first, quantity: totalQty })
    })

    if (finalRows.length === 0) {
      setInsertResult('Nothing to add — all rows were excluded.')
      setStage('preview')
      return
    }

    // Build insert payload
    const payload = finalRows.map((r) => {
      const lineTotal = r.unitPrice * r.quantity
      const vatRate = r.product!.vatstatus === 'Standard' ? VAT_RATE : 0
      const vatAmount = lineTotal * vatRate
      return {
        orderid:         orderId,
        productid:       r.product!.productid,
        sku:             r.product!.sku,
        productname:     r.product!.productname,
        quantityordered: r.quantity,
        quantitypicked:  0,
        unitprice:       r.unitPrice,
        linetotal:       lineTotal,
        vatstatus:       r.product!.vatstatus,
        vatrate:         vatRate,
        vatamount:       vatAmount,
        linetotalincvat: lineTotal + vatAmount,
        status:          'Pending',
      }
    })

    const { error } = await supabase.from('tblorderlines').insert(payload)

    if (error) {
      console.error('Bulk insert error:', error)
      setInsertResult('Insert failed: ' + error.message)
      setStage('preview')
      return
    }

    // Activity log — single entry summarising the upload, not one per line
    try {
      const { logActivity } = await import('@/lib/activity')
      await logActivity({
        action:      'create',
        entityType:  'order',
        entityId:    orderId,
        entityLabel: orderNumber,
        notes:       `Uploaded ${finalRows.length} line${finalRows.length === 1 ? '' : 's'} via SKU list`,
      })
    } catch (e) {
      console.error('Activity log failed:', e)
    }

    await onAdded()
    onClose()
  }

  // ── Reset ──────────────────────────────────────────────────

  const reset = () => {
    setStage('input')
    setPreviewRows([])
    setPasteText('')
    setParseError(null)
    setInsertResult(null)
  }

  // ── Render ─────────────────────────────────────────────────

  const includedCount = previewRows.filter((r) => {
    if (!r.include) return false
    if (!r.product || !r.product.isactive) return false
    if (r.quantity <= 0) return false
    if (r.status === 'duplicate' && r.duplicateAction === 'skip') return false
    return true
  }).length

  const issueCount = previewRows.filter(
    (r) => r.status === 'unmatched' || r.status === 'badqty' || r.status === 'inactive' || r.status === 'duplicate'
  ).length

  return (
    <div className="pf-upload-panel" style={{
      border: '1px solid var(--border)',
      borderRadius: '6px',
      padding: '1rem',
      marginBottom: '1rem',
      background: 'var(--panel-bg, var(--bg, #fff))',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>
          {stage === 'input' && 'Upload SKU List'}
          {stage === 'preview' && `Review ${previewRows.length} row${previewRows.length === 1 ? '' : 's'}`}
          {stage === 'inserting' && 'Adding lines…'}
        </h3>
        <button className="pf-btn-cancel-sm" onClick={onClose}>Close</button>
      </div>

      {stage === 'input' && (
        <>
          <p style={{ margin: '0 0 0.75rem', color: 'var(--muted, #666)', fontSize: '0.875rem' }}>
            Upload an Excel or CSV file with SKU in column A and quantity in column B — or paste the same below.
            A header row is fine. Pricing is applied using this client&apos;s price band, same as manual entry.
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="pf-upload-file-input"
              />
              <label htmlFor="pf-upload-file-input" className="pf-btn-primary" style={{ cursor: 'pointer' }}>
                Choose File…
              </label>
              <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: 'var(--muted, #666)' }}>
                .xlsx, .xls, .csv, .txt
              </span>
            </div>
          </div>

          <div>
            <label className="pf-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
              …or paste from Excel / email
            </label>
            <textarea
              className="pf-input pf-textarea"
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'SKU-ABC\t12\nSKU-DEF\t3\n...'}
              style={{ width: '100%', fontFamily: 'var(--mono, monospace)' }}
            />
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              <button
                className="pf-btn-primary"
                onClick={handlePasteSubmit}
                disabled={!pasteText.trim()}
              >
                Preview Pasted List
              </button>
            </div>
          </div>

          {parseError && (
            <div className="pf-error-inline" style={{ marginTop: '0.75rem' }}>{parseError}</div>
          )}
        </>
      )}

      {stage === 'preview' && (
        <>
          <div style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '0.75rem',
            fontSize: '0.875rem',
          }}>
            <span><strong>{includedCount}</strong> will be added</span>
            {issueCount > 0 && (
              <span style={{ color: 'var(--warning, #a06500)' }}>
                <strong>{issueCount}</strong> need attention
              </span>
            )}
          </div>

          <div className="pf-table-wrap" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            <table className="pf-inner-table">
              <thead>
                <tr>
                  <th style={{ width: '3rem' }}>Add</th>
                  <th>Row</th>
                  <th>SKU (from file)</th>
                  <th>Matched Product</th>
                  <th className="pf-col-right" style={{ width: '6rem' }}>Qty</th>
                  <th className="pf-col-right">Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r.id} style={{
                    background: r.status === 'ok' ? 'transparent' :
                                r.status === 'unmatched' ? 'var(--error-bg, #fde8e8)' :
                                r.status === 'duplicate' ? 'var(--warning-bg, #fff4e0)' :
                                'var(--warning-bg, #fff4e0)',
                  }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.include}
                        disabled={!r.product || !r.product.isactive || r.quantity <= 0}
                        onChange={(e) => updateRow(r.id, { include: e.target.checked })}
                      />
                    </td>
                    <td>{r.rowNumber}</td>
                    <td className="pf-sku">{r.rawSku || <em style={{ color: 'var(--muted)' }}>blank</em>}</td>
                    <td>
                      {r.product ? (
                        <>
                          <div>{r.product.productname}</div>
                          {r.rawSku.trim() !== r.product.sku && (
                            <small style={{ color: 'var(--muted)' }}>(actual SKU: {r.product.sku})</small>
                          )}
                        </>
                      ) : (
                        <em style={{ color: 'var(--error, #c00)' }}>No match</em>
                      )}
                    </td>
                    <td className="pf-col-right">
                      <input
                        className="pf-input pf-input-num"
                        type="number"
                        min={1}
                        value={r.quantity || ''}
                        onChange={(e) => updateQuantity(r.id, parseInt(e.target.value, 10))}
                        style={{ width: '5rem', textAlign: 'right' }}
                        disabled={!r.product}
                      />
                    </td>
                    <td className="pf-col-right">
                      {r.product && r.quantity > 0
                        ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(r.unitPrice)
                        : '—'}
                    </td>
                    <td>
                      {r.status === 'ok' && <span className="pf-badge" style={{ background: 'var(--ok-bg, #e6f4e6)', color: 'var(--ok, #060)' }}>OK</span>}
                      {r.status === 'unmatched' && <span className="pf-badge" style={{ background: 'var(--error-bg, #fde8e8)', color: 'var(--error, #c00)' }}>SKU not found</span>}
                      {r.status === 'inactive' && <span className="pf-badge" style={{ background: 'var(--warning-bg, #fff4e0)', color: 'var(--warning, #a06500)' }}>Inactive</span>}
                      {r.status === 'badqty' && <span className="pf-badge" style={{ background: 'var(--warning-bg, #fff4e0)', color: 'var(--warning, #a06500)' }}>Invalid qty</span>}
                      {r.status === 'duplicate' && (
                        <div>
                          <span className="pf-badge" style={{ background: 'var(--warning-bg, #fff4e0)', color: 'var(--warning, #a06500)' }}>Duplicate SKU</span>
                          <div style={{ marginTop: '0.25rem' }}>
                            <select
                              className="pf-select"
                              value={r.duplicateAction}
                              onChange={(e) => updateRow(r.id, {
                                duplicateAction: e.target.value as 'sum' | 'separate' | 'skip',
                                include: e.target.value !== 'skip',
                              })}
                              style={{ fontSize: '0.75rem' }}
                            >
                              <option value="sum">Sum with other(s)</option>
                              <option value="separate">Keep as separate line</option>
                              <option value="skip">Skip this row</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {insertResult && (
            <div className="pf-error-inline" style={{ marginTop: '0.75rem' }}>{insertResult}</div>
          )}

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="pf-btn-secondary" onClick={reset}>Back</button>
            <button
              className="pf-btn-primary"
              onClick={handleInsert}
              disabled={includedCount === 0}
            >
              Add {includedCount} Line{includedCount === 1 ? '' : 's'} to Order
            </button>
          </div>
        </>
      )}

      {stage === 'inserting' && (
        <div className="pf-loading">Inserting order lines…</div>
      )}
    </div>
  )
}
