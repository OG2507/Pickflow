'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'

type ConvertedLine = {
  sku: string
  qty: number
}

type ConversionResult = {
  lines: ConvertedLine[]
  notes: string[]
}

export default function OrderConverterPage() {
  const router = useRouter()
  const [rawInput, setRawInput] = useState('')
  const [result, setResult] = useState<ConversionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
    })
  }, [router])

  const handleConvert = useCallback(async () => {
    if (!rawInput.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    setCopied(false)

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are a data extraction assistant for a wholesale business. 
Your job is to extract product orders from customer messages and return structured JSON.

SKU FORMAT RULES (strictly follow these):
- SKUs are always 6 characters: B + 2-digit board number + hyphen + 2-digit product number
- Board 1 = B01, Board 10 = B10, Board 13 = B13 etc (always 2 digits)
- Product number 2 = 02, product number 24 = 24 (always 2 digits)
- Examples: Board 1 No 24 = B01-24, Board 10 No 5 = B10-05, Board 3 No 42 = B03-42

QUANTITY RULES:
- If one quantity applies to the whole order (e.g. "10 of each", "please order 5 of each"), use that for all lines
- If quantities vary per line, extract each one individually
- If no quantity is stated, default to 1
- Typos in board/number labels (e.g. "Not" instead of "No") should be treated as "No"

Return ONLY valid JSON in this exact format, no other text:
{
  "lines": [
    { "sku": "B01-24", "qty": 10 },
    { "sku": "B02-43", "qty": 10 }
  ],
  "notes": ["Any ambiguities or assumptions made, one per item"]
}`,
          messages: [
            {
              role: 'user',
              content: rawInput
            }
          ]
        })
      })

      const data = await response.json()
      const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text || ''

      const clean = text.replace(/```json|```/g, '').trim()
      const parsed: ConversionResult = JSON.parse(clean)
      setResult(parsed)
    } catch {
      setError('Something went wrong during conversion. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [rawInput])

  const handleCopy = useCallback(() => {
    if (!result) return
    const header = 'SKU\tQTY'
    const rows = result.lines.map(l => `${l.sku}\t${l.qty}`)
    const text = [header, ...rows].join('\n')
    navigator.clipboard.writeText(text).then(() => {
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
      <Header />
      <main className="pf-page">
        <div className="pf-page-header">
          <div>
            <h1 className="pf-page-title">Order List Converter</h1>
            <p className="pf-page-subtitle">Paste a customer order in any format — AI will extract the SKUs and quantities</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>

          {/* Input panel */}
          <div className="pf-card">
            <div className="pf-card-title" style={{ marginBottom: '0.75rem' }}>Customer Order Text</div>
            <textarea
              className="pf-input"
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              placeholder={'Paste the customer order here — e.g.\n\nPlease can I order 10 of each of the following:\nBoard 1\nNo 24\nBoard 2\nNo 43, 50\n...'}
              style={{
                width: '100%',
                minHeight: '320px',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
              <button
                className="pf-btn-primary"
                onClick={handleConvert}
                disabled={loading || !rawInput.trim()}
              >
                {loading ? 'Converting…' : 'Convert'}
              </button>
              {rawInput && (
                <button className="pf-btn-secondary" onClick={handleClear}>
                  Clear
                </button>
              )}
            </div>
            {error && <p className="pf-error-inline" style={{ marginTop: '0.75rem' }}>{error}</p>}
          </div>

          {/* Result panel */}
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

              {result.notes && result.notes.length > 0 && (
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
                    {result.notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="pf-card-note" style={{ marginTop: '0.75rem' }}>
                Paste into the order upload panel for a sanity check before importing.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
