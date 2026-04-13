import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const orderid = searchParams.get('orderid')

    if (!orderid) {
      return NextResponse.json({ error: 'No orderid provided' }, { status: 400 })
    }

    // Fetch order with client details
    const { data: order, error: orderErr } = await supabase
      .from('tblorders')
      .select(`
        orderid, ordernumber, orderdate, trackingnumber,
        shippingmethod, shippingcost, notes,
        tblclients (
          companyname, firstname, lastname, email,
          accountreference, address1, address2, town, county, postcode, country
        )
      `)
      .eq('orderid', orderid)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Fetch order lines — include quantitypicked so we invoice what was actually despatched
    const { data: lines, error: linesErr } = await supabase
      .from('tblorderlines')
      .select(`orderlineid, sku, productname, quantityordered, quantitypicked, unitprice, linetotal, vatstatus, productid`)
      .eq('orderid', orderid)
      .order('orderlineid')

    console.log('QuickFile export — orderid:', orderid, 'lines:', lines?.length, 'error:', linesErr?.message)

    // Fetch pricing codes for the products on this order
    const productIds = (lines || []).map((l: any) => l.productid).filter(Boolean)
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

    const client = order.tblclients as any
    const clientName = client?.companyname ||
      [client?.firstname, client?.lastname].filter(Boolean).join(' ') || ''
    const contactFirst = client?.firstname || ''
    const contactLast  = client?.lastname || ''
    const email        = client?.email || ''
    const accountRef   = client?.accountreference || ''
    const companyName  = client?.companyname || ''

    const issueDate = order.orderdate
      ? new Date(order.orderdate).toLocaleString('en-GB', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false,
        }).replace(',', '')
      : ''

    // Build out-of-stock note covering zero and partial lines
    const outOfStockParts: string[] = []
    for (const l of lines || []) {
      const picked = l.quantitypicked ?? l.quantityordered
      const ordered = l.quantityordered
      if (picked === 0) {
        outOfStockParts.push(`${l.sku} ordered ${ordered} picked 0`)
      } else if (picked < ordered) {
        outOfStockParts.push(`${l.sku} ordered ${ordered} picked ${picked}`)
      }
    }
    const outOfStockNote = outOfStockParts.length > 0
      ? `OUT OF STOCK: ${outOfStockParts.join(', ')}`
      : ''

    const trackingNote = [
      order.shippingmethod || '',
      order.trackingnumber ? `- ${order.trackingnumber}` : '',
      clientName ? `- ${clientName}` : '',
      outOfStockNote || '',
    ].filter(Boolean).join(' ')

    const clientBilling = companyName || clientName
    const clientDelivery = companyName || clientName

    // Build CSV rows
    const rows: string[][] = []

    // Header
    rows.push([
      'Issue Date', 'Client name', 'Description', 'Total gross amount',
      'Invoice number', 'VAT rate', 'Item Name', 'Item Quantity',
      'Client contact first name', 'Client contact surname', 'Client contact email',
      'Notes', 'Company Name', 'ClientDelivery', 'ClientBilling',
      'Account Reference', 'First Name', 'notes2', 'out of stock',
    ])

    // Product lines — skip zero-picked lines (QuickFile rejects zero qty rows)
    for (const line of lines || []) {
      const l = line as any
      const picked = l.quantitypicked ?? l.quantityordered
      if (picked === 0) continue

      const pricingCode = l.productid && pricingMap.has(l.productid)
        ? `Price Code ${pricingMap.get(l.productid)}`
        : ''
      const vatRate = l.vatstatus === 'Standard' ? '20' : '0'
      const description = `${l.sku} / ${l.productname}`
      // Recalculate line total based on actual picked quantity
      const netAmount = picked * l.unitprice
      const grossAmount = (netAmount * (l.vatstatus === 'Standard' ? 1.2 : 1)).toFixed(2)

      rows.push([
        issueDate,
        clientName,
        description,
        grossAmount,
        order.ordernumber || '',
        vatRate,
        pricingCode,
        String(picked),
        contactFirst,
        contactLast,
        email,
        trackingNote,
        companyName,
        clientDelivery,
        clientBilling,
        accountRef,
        contactFirst,
        '',
        outOfStockNote,
      ])
    }

    // Shipping line (if there is a shipping cost)
    if (order.shippingcost && order.shippingcost > 0 && order.shippingmethod) {
      const shippingCode = order.shippingmethod
      const shippingGross = (order.shippingcost * 1.2).toFixed(2)

      rows.push([
        issueDate,
        clientName,
        shippingCode,
        shippingGross,
        order.ordernumber || '',
        '20',
        `Price Code ${shippingCode}`,
        '1',
        contactFirst,
        contactLast,
        email,
        trackingNote,
        companyName,
        clientDelivery,
        clientBilling,
        accountRef,
        contactFirst,
        '',
        outOfStockNote,
      ])
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

    const filename = `quickfile-${order.ordernumber || orderid}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
