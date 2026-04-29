'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type ConvertedLine = {
  sku: string
  qty: number
}

type ConversionResult = {
  lines: ConvertedLine[]
  notes: string[]
}

function formatBoard(n: number): string {
  return `B${String(n).padStart(2, '0')}`
}

function formatProduct(n: number): string {
  return String(n).padStart(2, '0')
}

function isBoardHeading(line: string): boolean {
  return /^b[o0][a-z]{0,4}r?s?d?\s*\d+/i.test(line.trim())
}

function parseBoardNumber(raw: string): number | null {
  const match = raw.replace(/[^0-9]/g, '')
  const n = parseInt(match, 10)
  return isNaN(n) ? null : n
}

function parseOrders(input: string): ConversionResult {
  const lines = input.split('\n').map(l => l.trim()).filter(Boolean)
  const result: ConvertedLine[] = []
  const notes: string[] = []

  let currentBoard: number | null = null
  let blanketQty: number | null = null

  const blanketMatch = input.match(/(\d+)\s*(?:of\s*each|each)/i)
  if (blanketMatch) {
    blanketQty = parseInt(blanketMatch[1], 10)
    notes.push(`Blanket quantity of ${blanketQty} applied to all lines without an individual quantity`)
  }

  for (const line of lines) {
    if (line.length < 2) continue

    if (isBoardHeading(line)) {
      const boardNum = parseBoardNumber(line)
      if (boardNum !== null) {
        const expected = `BOARD ${boardNum}`
        const normalised = line.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
        if (normalised !== expected) {
          notes.push(`Interpreted "${line.trim()}" as Board ${boardNum}`)
        }
        currentBoard = boardNum
      }
      continue
    }

    if (currentBoard === null) continue

    // Format B — inline QTYxNUMBER: "5X8, 10X9"
    const inlineMatches = [...line.matchAll(/(\d+)\s*[xX]\s*(\d+)/g)]
    if (inlineMatches.length > 0) {
      for (const m of inlineMatches) {
        const qty = parseInt(m[1], 10)
        const prod = parseInt(m[2], 10)
        result.push({ sku: `${formatBoard(currentBoard)}-${formatProduct(prod)}`, qty })
      }
      continue
    }

    // Format A — product numbers only: "No 24, 43" or just "24, 43"
    const stripped = line.replace(/^(no\.?t?|#)\s*/i, '')
    const numMatches = stripped.match(/\d+/g)
    if (numMatches) {
      for (const n of numMatches) {
        const prod = parseInt(n, 10)
        if (prod > 99) continue
        result.push({ sku: `${formatBoard(currentBoard)}-${formatProduct(prod)}`, qty: blanketQty ?? 1 })
      }
    }
  }

  // Deduplicate — sum quantities for duplicate SKUs
  const deduped = new Map<string, number>()
  for (const line of result) {
    deduped.set(line.sku, (deduped.get(line.sku) ?? 0) + line.qty)
  }

  if (deduped.size < result.length) {
    notes.push('Duplicate SKUs detected — quantities have been combined')
  }

  if (blanketQty === null && result.some(l => l.qty === 1)) {
    notes.push('No quantity found for some lines — defaulted to 1')
  }

  return {
    lines: Array.from(deduped.entries()).map(([sku, qty]) => ({ sku, qty })),
    notes,
  }
}

export default function OrderConverterPage() {
  const router = useRouter()
  const [rawInput, setRawInput] = useState('')
  const [result, setResult] = useState<ConversionResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
    })
  }, [router])

  const handleConvert = useCallback(() => {
    if (!rawInput.trim()) return
    setError('')
    setResult(null)
    setCopied(false)
    try {
      const parsed = parseOrders(rawInput)
      if (parsed.lines.length === 0) {
        setError('No order lines could be extracted. Check the format and try again.')
        return
      }
      setResult(parsed)
    } catch {
      setError('Something went wrong. Check the format and try again.')
    }
  }, [rawInput])

  const handleCopy = useCallback(() => {
    if (!result) return
    const header = 'SKU\tQTY'
    const rows = result.lines.map(l => `${l.sku}\t${l.qty}`)
    navigator.clipboard.writeText([header, ...rows].join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }, [result])

  const handleClear = useCallback(() => {
    setRawInput('')
    setResult(null)
    setError('')
    setCopied(false)
  }, [])

  return (
    <>
      <main className="pf-page">
        <div className="pf-page-header">
          <div>
            <h1 className="pf-page-title">Order List Converter</h1>
            <p className="pf-page-subtitle">Paste a customer order in any format and convert it to SKU / QTY pairs ready to import</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>

          <div className="pf-card">
            <div className="pf-card-title" style={{ marginBottom: '0.75rem' }}>Customer Order Text</div>
            <textarea
              className="pf-input"
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              placeholder={'Paste the customer order here — e.g.\n\nPlease can I order 10 of each of the following:\nBoard 1\nNo 24\nBoard 2\nNo 43, 50\n...\n\nOr:\n\nBOARD 1\n5X8, 5X9, 5X15\nBOARD 4\n5X61, 5X62'}
              style={{ width: '100%', minHeight: '320px', fontFamily: 'monospace', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
              <button className="pf-btn-primary" onClick={handleConvert} disabled={!rawInput.trim()}>
                Convert
              </button>
              {rawInput && (
                <button className="pf-btn-secondary" onClick={handleClear}>Clear</button>
              )}
            </div>
            {error && <p className="pf-error-inline" style={{ marginTop: '0.75rem' }}>{error}</p>}
          </div>

          {result && (
            <div className="pf-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div className="pf-card-title">{result.lines.length} line{result.lines.length !== 1 ? 's' : ''} extracted</div>
                <button
                  className={copied ? 'pf-btn-secondary' : 'pf-btn-primary'}
                  onClick={handleCopy}
                  style={{ minWidth: '120px' }}
                >
                  {copied ? '✓ Copied' : 'Copy to Clipboard'}
                </button>
              </div>

              <div className="pf-table-wrap" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                <table className="pf-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th className="pf-col-right">QTY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lines.map((line, i) => (
                      <tr key={i}>
                        <td className="pf-sku">{line.sku}</td>
                        <td className="pf-col-right">{line.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result.notes.length > 0 && (
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  background: 'var(--colour-warning-bg, #fffbeb)',
                  border: '1px solid var(--colour-warning-border, #fbbf24)',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  color: 'var(--colour-text-secondary)'
                }}>
                  <strong>Notes:</strong>
                  <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                    {result.notes.map((note, i) => <li key={i}>{note}</li>)}
                  </ul>
                </div>
              )}

              <p className="pf-card-note" style={{ marginTop: '0.75rem' }}>
                Copy and paste into the order upload panel for a sanity check before importing.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
