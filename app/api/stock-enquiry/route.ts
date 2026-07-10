import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Stock Enquiry endpoint
// -----------------------------------------------------------------
// Called by n8n only (server-to-server, shared-secret header).
// Never called directly from the browser — the ShopWired form posts
// to n8n, and n8n calls this. Keeps this endpoint at the same trust
// level as everything else in PickFlow rather than being the first
// public-facing route in the app.
//
// For each line: works out whether stock on hand covers the request,
// then falls back to outstanding purchase orders, then to a lead-time
// estimate, in that order. Every enquiry and its verdicts are logged
// to tblstockenquiries / tblstockenquirylines regardless of outcome.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type EnquiryLineInput = { sku: string; quantity: number }

type LineVerdict = {
  enquirylineid: number | null
  sku: string
  productname: string | null
  productid: number | null
  quantityrequested: number
  verdict: 'InStock' | 'Backorder' | 'CannotFulfil'
  expecteddate: string | null
  needsreview: boolean
  draftmessage: string
}

async function resolveProduct(websiteSku: string, requestedQty: number) {
  const columns = 'productid, productname, sku, altsku, leadtimedays, packquantity'

  // Translate the website SKU to the real SKU, same table the order sync
  // already relies on. Most products need no translation at all - the
  // mapping table only holds the exceptions - so falling back to the
  // website SKU as-is (unchanged) covers the normal case.
  const { data: mapping } = await supabase
    .from('tblskumapping')
    .select('realsku')
    .eq('websitesku', websiteSku)
    .maybeSingle()

  let realSku = mapping?.realsku || websiteSku
  let quantity = requestedQty

  // A "-W" suffix means this is a wholesale pack line - the underlying
  // product is the same without the suffix, but the quantity requested
  // represents packs, not individual units, so scale it up accordingly.
  if (realSku.endsWith('-W')) {
    realSku = realSku.slice(0, -2)
    const { data: packProduct } = await supabase
      .from('tblproducts')
      .select(columns)
      .eq('sku', realSku)
      .maybeSingle()
    quantity = requestedQty * (packProduct?.packquantity || 1)
    if (packProduct) return { product: packProduct, quantity }
  }

  const { data: bySku } = await supabase
    .from('tblproducts')
    .select(columns)
    .eq('sku', realSku)
    .maybeSingle()

  if (bySku) return { product: bySku, quantity }

  const { data: byAltSku } = await supabase
    .from('tblproducts')
    .select(columns)
    .eq('altsku', realSku)
    .maybeSingle()

  return { product: byAltSku || null, quantity }
}

export async function POST(request: Request) {
  try {
    const apiKey = request.headers.get('x-stock-api-key')
    if (!apiKey || apiKey !== process.env.STOCK_ENQUIRY_API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const customeremail = (body?.customeremail || '').trim()
    const customername = (body?.customername || '').trim() || null
    const greeting = customername ? `Hi ${customername}, thanks` : 'Thanks'
    const lines: EnquiryLineInput[] = Array.isArray(body?.lines) ? body.lines : []

    if (!customeremail || !customeremail.includes('@')) {
      return NextResponse.json({ error: 'A valid customeremail is required' }, { status: 400 })
    }
    if (lines.length === 0) {
      return NextResponse.json({ error: 'At least one line is required' }, { status: 400 })
    }
    if (lines.length > 3) {
      return NextResponse.json({ error: 'Maximum 3 lines per enquiry' }, { status: 400 })
    }

    const results: LineVerdict[] = []

    for (const line of lines) {
      const sku = (line?.sku || '').trim()
      const quantityrequested = Math.floor(Number(line?.quantity))

      if (!sku || !Number.isFinite(quantityrequested) || quantityrequested <= 0) {
        results.push({
        enquirylineid: null, // filled in after insert below
          sku: sku || '(missing)',
          productname: null,
          productid: null,
          quantityrequested: Number.isFinite(quantityrequested) ? quantityrequested : 0,
          verdict: 'CannotFulfil',
          expecteddate: null,
          needsreview: true,
          draftmessage: 'Invalid enquiry line — no product code or quantity. Needs a manual look.',
        })
        continue
      }

      const { product, quantity: checkquantity } = await resolveProduct(sku, quantityrequested)

      if (!product) {
        results.push({
        enquirylineid: null, // filled in after insert below
          sku,
          productname: null,
          productid: null,
          quantityrequested,
          verdict: 'CannotFulfil',
          expecteddate: null,
          needsreview: true,
          draftmessage: `Couldn't match "${sku}" to a product on file — needs a manual look.`,
        })
        continue
      }

      // Total stock on hand across every location for this product
      const { data: stockRows } = await supabase
        .from('tblstocklevels')
        .select('quantityonhand')
        .eq('productid', product.productid)

      const totalonhand = (stockRows || []).reduce(
        (sum: number, r: any) => sum + (r.quantityonhand || 0), 0
      )

      if (totalonhand >= checkquantity) {
        results.push({
        enquirylineid: null, // filled in after insert below
          sku: product.sku,
          productname: product.productname,
          productid: product.productid,
          quantityrequested,
          verdict: 'InStock',
          expecteddate: null,
          needsreview: false,
          draftmessage: `${greeting} for checking. We've got plenty of ${product.productname} in stock right now, so please go ahead and place your order.\n\nThanks,\nJKs Bargains`,
        })
        continue
      }

      // Short — check outstanding purchase order lines for this product
      const shortfall = checkquantity - totalonhand

      const { data: poLines } = await supabase
        .from('tblpurchaseorderlines')
        .select('poid, quantityordered, quantityreceived, status')
        .eq('productid', product.productid)
        .neq('status', 'Cancelled')

      const outstanding = (poLines || [])
        .map((l: any) => ({ ...l, outstandingqty: (l.quantityordered || 0) - (l.quantityreceived || 0) }))
        .filter((l: any) => l.outstandingqty > 0)

      let expecteddate: string | null = null

      if (outstanding.length > 0) {
        const poIds = [...new Set(outstanding.map((l: any) => l.poid))]
        const { data: poHeaders } = await supabase
          .from('tblpurchaseorders')
          .select('poid, expecteddate')
          .in('poid', poIds)

        const expectedMap = new Map<number, string | null>()
        for (const po of poHeaders || []) expectedMap.set(po.poid, po.expecteddate)

        const dated = outstanding
          .map((l: any) => ({ ...l, expecteddate: expectedMap.get(l.poid) || null }))
          .filter((l: any) => l.expecteddate)
          .sort((a: any, b: any) => (a.expecteddate > b.expecteddate ? 1 : -1))

        let running = 0
        for (const l of dated) {
          running += l.outstandingqty
          if (running >= shortfall) { expecteddate = l.expecteddate; break }
        }
      }

      // No PO covers it — fall back to a lead-time estimate.
      // Preferred supplier's lead time first, then the product's own default.
      if (!expecteddate) {
        let leadtimedays: number | null = null

        const { data: preferredSupplier } = await supabase
          .from('tblproductsuppliers')
          .select('leadtimedays')
          .eq('productid', product.productid)
          .eq('ispreferred', true)
          .maybeSingle()

        if (preferredSupplier?.leadtimedays) {
          leadtimedays = preferredSupplier.leadtimedays
        } else if (product.leadtimedays) {
          leadtimedays = product.leadtimedays
        }

        if (leadtimedays) {
          const d = new Date()
          d.setDate(d.getDate() + leadtimedays)
          expecteddate = d.toISOString().split('T')[0]
        }
      }

      const availableNow = totalonhand > 0 ? totalonhand : 0
      const situation = `We've currently got ${availableNow} of ${product.productname} in stock. If you'd like to order now, we can supply ${availableNow} straight away — anything beyond that would go on backorder once you place your order.`

      if (expecteddate) {
        results.push({
        enquirylineid: null, // filled in after insert below
          sku: product.sku,
          productname: product.productname,
          productid: product.productid,
          quantityrequested,
          verdict: 'Backorder',
          expecteddate,
          needsreview: true,
          draftmessage: `${greeting} for checking. ${situation}\n\nThanks,\nJKs Bargains`,
        })
      } else {
        results.push({
        enquirylineid: null, // filled in after insert below
          sku: product.sku,
          productname: product.productname,
          productid: product.productid,
          quantityrequested,
          verdict: 'CannotFulfil',
          expecteddate: null,
          needsreview: true,
          draftmessage: `${greeting} for checking. ${situation}\n\nThanks,\nJKs Bargains`,
        })
      }
    }

    // Log the enquiry header
    const { data: enquiry, error: enquiryErr } = await supabase
      .from('tblstockenquiries')
      .insert({ customeremail, customername })
      .select('enquiryid')
      .single()

    if (enquiryErr || !enquiry) {
      console.error('Stock enquiry — failed to log enquiry header:', enquiryErr)
      return NextResponse.json({ error: 'Failed to log enquiry' }, { status: 500 })
    }

    const lineInserts = results.map((r) => ({
      enquiryid: enquiry.enquiryid,
      productid: r.productid,
      skurequested: r.sku,
      quantityrequested: r.quantityrequested,
      verdict: r.verdict,
      expecteddate: r.expecteddate,
      draftmessage: r.draftmessage,
      reviewstatus: r.verdict === 'InStock' ? 'PendingSend' : 'PendingReview',
    }))

    const { data: insertedLines, error: linesErr } = await supabase
      .from('tblstockenquirylines')
      .insert(lineInserts)
      .select('enquirylineid')

    if (linesErr) {
      console.error('Stock enquiry — failed to log lines:', linesErr)
    } else if (insertedLines) {
      // Insert preserves array order, so map position-for-position
      insertedLines.forEach((row, i) => {
        if (results[i]) results[i].enquirylineid = row.enquirylineid
      })
    }

    return NextResponse.json({
      enquiryid: enquiry.enquiryid,
      customeremail,
      lines: results,
    })
  } catch (err: any) {
    console.error('Stock enquiry — unexpected error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
