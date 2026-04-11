import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WEBSITE_SOURCES = ['Shopwired', 'eBay']

export async function GET() {
  try {
    // Fetch all unexported dispatched/invoiced/completed wholesale orders
    const { data: orders, error: ordersErr } = await supabase
      .from('tblorders')
      .select(`
        orderid, ordernumber, orderdate, trackingnumber,
        shippingmethod, shippingcost, notes, ordersource,
        tblclients (
          companyname, firstname, lastname, email,
          accountreference
        )
      `)
      .in('status', ['Dispatched', 'Invoiced', 'Completed'])
      .not('ordersource', 'in', `(${WEBSITE_SOURCES.map(s => `"${s}"`).join(',')})`)
      .is('quickfileexportedat', null)
      .order('orderdate', { ascending: true })

    if (ordersErr) {
      return NextResponse.json({ error: ordersErr.message }, { status: 500 })
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: 'No orders pending export' }, { status: 404 })
    }

    // Fetch all order lines for these orders
    const orderIds = orders.map((o: any) => o.orderid)
    const { data: allLines } = await supabase
      .from('tblorderlines')
      .select(`orderid, orderlineid, sku, productname, productid,
        quantityordered, unitprice, linetotal, vatstatus`)
      .in('orderid', orderIds)
      .order('orderid')
      .order('orderlineid')

    // Fetch pricing codes separately
    const productIds = (allLines || []).map((l: any) => l.productid).filter(Boolean)
    const pricingMap = new Map<number, string>()
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('tblproducts')
        .select('productid, pricingcode')
        .in('productid', productIds)
      for (const p of products || []) {
        if (p.pricingcode) pricingMap.set(p.productid, p.pricingcode)
      }
    }

    const linesByOrder = new Map<number, any[]>()
    for (const line of allLines || []) {
      if (!linesByOrder.has(line.orderid)) linesByOrder.set(line.orderid, [])
      linesByOrder.get(line.orderid)!.push(line)
    }

    // Build CSV
    const rows: string[][] = []

    // Header
    rows.push([
      'Issue Date', 'Client name', 'Description', 'Total gross amount',
      'Invoice number', 'VAT rate', 'Item Name', 'Item Quantity',
      'Client contact first name', 'Client contact surname', 'Client contact email',
      'Notes', 'Company Name', 'ClientDelivery', 'ClientBilling',
      'Account Reference', 'First Name', 'notes2', 'out of stock',
    ])

    const exportedAt = new Date().toISOString()

    for (const order of orders) {
      const client = order.tblclients as any
      const clientName = client?.companyname ||
        [client?.firstname, client?.lastname].filter(Boolean).join(' ') || ''
      const contactFirst = client?.firstname || ''
      const contactLast  = client?.lastname || ''
      const email        = client?.email || ''
      const accountRef   = client?.accountreference || ''
      const companyName  = client?.companyname || ''
      const clientBilling  = companyName || clientName
      const clientDelivery = companyName || clientName

      const issueDate = order.orderdate
        ? new Date(order.orderdate).toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
          }).replace(',', '')
        : ''

      const trackingNote = [
        order.shippingmethod || '',
        order.trackingnumber ? `- ${order.trackingnumber}` : '',
        clientName ? `- ${clientName}` : '',
      ].filter(Boolean).join(' ')

      const lines = linesByOrder.get(order.orderid) || []

      // Product lines
      for (const line of lines) {
        const pricingCode = line.productid && pricingMap.has(line.productid)
          ? `Price Code ${pricingMap.get(line.productid)}`
          : ''
        const vatRate    = line.vatstatus === 'Standard' ? '20' : '0'
        const description = `${line.sku} / ${line.productname}`
        const grossAmount = (line.linetotal * (line.vatstatus === 'Standard' ? 1.2 : 1)).toFixed(2)

        rows.push([
          issueDate, clientName, description, grossAmount,
          order.ordernumber || '', vatRate, pricingCode,
          String(line.quantityordered), contactFirst, contactLast, email,
          trackingNote, companyName, clientDelivery, clientBilling,
          accountRef, contactFirst, '', '',
        ])
      }

      // Shipping line
      if (order.shippingcost && order.shippingcost > 0 && order.shippingmethod) {
        const shippingGross = (order.shippingcost * 1.2).toFixed(2)
        rows.push([
          issueDate, clientName, order.shippingmethod, shippingGross,
          order.ordernumber || '', '20', `Price Code ${order.shippingmethod}`,
          '1', contactFirst, contactLast, email,
          trackingNote, companyName, clientDelivery, clientBilling,
          accountRef, contactFirst, '', '',
        ])
      }
    }

    // Convert to CSV
    const csv = rows.map(row =>
      row.map(cell => {
        const str = String(cell)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(',')
    ).join('\n')

    // Stamp all exported orders
    await supabase
      .from('tblorders')
      .update({ quickfileexportedat: exportedAt })
      .in('orderid', orderIds)

    const filename = `quickfile-${new Date().toISOString().slice(0, 10)}.csv`

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

// Returns count of pending orders without triggering export
export async function POST() {
  try {
    const { count } = await supabase
      .from('tblorders')
      .select('orderid', { count: 'exact', head: true })
      .in('status', ['Dispatched', 'Invoiced', 'Completed'])
      .not('ordersource', 'in', `("Shopwired","eBay")`)
      .is('quickfileexportedat', null)

    return NextResponse.json({ count: count || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
