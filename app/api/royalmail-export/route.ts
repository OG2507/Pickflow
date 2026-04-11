import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WEBSITE_SOURCES = ['Shopwired', 'eBay']

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const singleOrderId = searchParams.get('orderid')

    let query = supabase
      .from('tblorders')
      .select(`
        orderid, ordernumber, orderdate, totalweightg,
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

    for (const order of orders) {
      const client = order.tblclients as any
      const companyName = client?.companyname || ''
      const firstName   = client?.firstname || order.shiptoname?.split(' ')[0] || ''
      const lastName    = client?.lastname || order.shiptoname?.split(' ').slice(1).join(' ') || ''
      const email       = client?.email || ''
      const phone       = client?.phone || ''

      const rate        = order.shippingmethod ? rateMap.get(order.shippingmethod) : null
      const serviceCode = rate?.servicecode || ''
      const packageSize = rate?.packagesize || ''
      const weightKg    = ((order.totalweightg || 0) / 1000).toFixed(3)

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

// Returns count of pending orders
export async function POST() {
  try {
    const { count } = await supabase
      .from('tblorders')
      .select('orderid', { count: 'exact', head: true })
      .eq('status', 'Printed')
      .not('ordersource', 'in', `("Shopwired","eBay")`)
      .is('royalmailexportedat', null)

    return NextResponse.json({ count: count || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
