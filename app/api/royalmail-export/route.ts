import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bandWeightGrams, getBandWeights } from '@/lib/royalmailWeight'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WEBSITE_SOURCES = ['Shopwired', 'eBay']

// POST only. Body:
//   { action: 'export', orderid?: number }  → build the CSV and stamp
//                                              royalmailexportedat on the orders
//   anything else (the default)             → return the pending count only,
//                                              with no mutation
//
// The export path marks orders as exported, so it must never be reachable on a
// GET: a browser prefetch, crawler, or <img src> pointing at a GET URL would
// silently stamp orders and drop them out of the pending list (labels then
// never get printed). Keeping the mutation on POST closes that.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any))
    const action = body?.action
    const singleOrderId = body?.orderid ? String(body.orderid) : null

    // ── Count-only preview (no mutation) ─────────────────────────
    if (action !== 'export') {
      const { count } = await supabase
        .from('tblorders')
        .select('orderid', { count: 'exact', head: true })
        .eq('status', 'Printed')
        .not('ordersource', 'in', `("Shopwired","eBay")`)
        .is('royalmailexportedat', null)

      return NextResponse.json({ count: count || 0 })
    }

    // ── Export: build CSV, then stamp ────────────────────────────
    let query = supabase
      .from('tblorders')
      .select(`
        orderid, ordernumber, orderdate, totalweightg,
        isblindship,
        shiptoname, shiptoaddress1, shiptoaddress2, shiptoaddress3,
        shiptotown, shiptocounty, shiptopostcode, shiptocountry,
        shippingmethod,
        tblclients (companyname, firstname, lastname, email, phone)
      `)
      .not('ordersource', 'in', `(${WEBSITE_SOURCES.map(s => `"${s}"`).join(',')})`)
      .order('orderdate', { ascending: true })

    if (singleOrderId) {
      query = (query as any).eq('orderid', singleOrderId)
    } else {
      query = (query as any).eq('status', 'Printed').is('royalmailexportedat', null)
    }

    const { data: orders, error: ordersErr } = await query

    if (ordersErr) {
      return NextResponse.json({ error: ordersErr.message }, { status: 500 })
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: 'No orders pending Royal Mail export' }, { status: 404 })
    }

    // Fetch shipping rates for package size and service code
    const { data: rates } = await supabase
      .from('tblshippingrates')
      .select('methodname, servicecode, packagesize')

    const rateMap = new Map<string, { servicecode: string | null, packagesize: string | null }>()
    for (const r of rates || []) {
      rateMap.set(r.methodname, { servicecode: r.servicecode, packagesize: r.packagesize })
    }

    // Build CSV rows
    const rows: string[][] = []

    rows.push([
      'orderNumber', 'First Name', 'Last Name', 'Email', 'Phone',
      'Company Name', 'Address Line 1', 'Address Line 2', 'Address Line 3',
      'City', 'Postcode', 'County', 'Service code', 'Package Size', 'Weight'
    ])

    const exportedAt = new Date().toISOString()
    const orderIds: number[] = []

    // Admin-configured Royal Mail band weights (falls back to shipped defaults).
    const bandWeights = await getBandWeights(supabase)

    for (const order of orders) {
      const client = order.tblclients as any

      // For blind ship orders, the parcel goes to the delivery recipient — not the billing client.
      // Use shiptoname and shipto address fields only. For non-blind-ship, use client details.
      let companyName: string
      let firstName: string
      let lastName: string
      let email: string
      let phone: string

      if (order.isblindship) {
        // Split shiptoname into first/last as best we can
        const nameParts = (order.shiptoname || '').trim().split(' ')
        firstName   = nameParts[0] || ''
        lastName    = nameParts.slice(1).join(' ') || ''
        companyName = ''
        email       = ''
        phone       = ''
      } else {
        companyName = client?.companyname || ''
        firstName   = client?.firstname || order.shiptoname?.split(' ')[0] || ''
        lastName    = client?.lastname  || order.shiptoname?.split(' ').slice(1).join(' ') || ''
        email       = client?.email || ''
        phone       = client?.phone || ''
      }

      const rate        = order.shippingmethod ? rateMap.get(order.shippingmethod) : null
      const serviceCode = rate?.servicecode || ''
      const packageSize = rate?.packagesize || ''
      // Declare the top-of-band weight for capped formats so an under-declared
      // weight can't get the parcel rejected (same price across the band).
      const cappedGrams = bandWeightGrams(packageSize, bandWeights) ?? (order.totalweightg || 0)
      const weightKg    = (cappedGrams / 1000).toFixed(3)

      rows.push([
        order.ordernumber || String(order.orderid),
        firstName,
        lastName,
        email,
        phone,
        companyName,
        order.shiptoaddress1 || '',
        order.shiptoaddress2 || '',
        order.shiptoaddress3 || '',
        order.shiptotown || '',
        order.shiptopostcode || '',
        order.shiptocounty || '',
        serviceCode,
        packageSize,
        weightKg,
      ])

      orderIds.push(order.orderid)
    }

    const csv = rows.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\r\n')

    // Stamp exported orders
    await supabase
      .from('tblorders')
      .update({ royalmailexportedat: exportedAt })
      .in('orderid', orderIds)

    const now = new Date()
    const timestamp = now.toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '')
    const filename = `royalmail-${timestamp}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Order-Count': String(orders.length),
      },
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
