import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CAD_BASE = 'https://api.parcel.royalmail.com/api/v1'
const CAD_KEY  = process.env.CLICKANDDROP_API_KEY!
const TRADING_NAME = "JK's Bargains Ltd"

export async function POST(request: Request) {
  try {
    const { orderid } = await request.json()

    if (!orderid) {
      return NextResponse.json({ success: false, error: 'No orderid provided' })
    }

    // Fetch order with all required data
    const { data: order, error: orderErr } = await supabase
      .from('tblorders')
      .select(`
        orderid, ordernumber, orderdate, isebay, ordersource,
        shiptoname, shiptoaddress1, shiptoaddress2, shiptoaddress3,
        shiptotown, shiptocounty, shiptopostcode, shiptocountry,
        shippingmethod, totalweightg, subtotal, shippingcost, ordertotal,
        tblclients (companyname, firstname, lastname, email, phone)
      `)
      .eq('orderid', orderid)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ success: false, error: 'Order not found' })
    }

    // Skip eBay orders
    if (order.isebay) {
      return NextResponse.json({ success: false, error: 'eBay orders are managed directly through Click and Drop' })
    }

    // Get service code — check mapping table first, then fall back to shipping rates
    let serviceCode = 'TOLP48' // default — 48 hour tracked
    if (order.shippingmethod) {
      // Try mapping table first (catches Shopwired method names)
      const { data: mapped } = await supabase
        .from('tblshippingmethodmap')
        .select('servicecode')
        .eq('swmethodname', order.shippingmethod)
        .single()

      if (mapped?.servicecode) {
        serviceCode = mapped.servicecode
      } else {
        // Fall back to shipping rates table (catches manual wholesale orders)
        const { data: rate } = await supabase
          .from('tblshippingrates')
          .select('servicecode')
          .eq('methodname', order.shippingmethod)
          .single()
        if (rate?.servicecode) {
          serviceCode = rate.servicecode
        } else if (rate && !rate.servicecode) {
          // Method exists but has no service code — collection or free delivery, skip C&D
          return NextResponse.json({ success: false, error: 'No Royal Mail service code for this shipping method — label not required' })
        }
      }
    }

    // Build recipient name
    const client = order.tblclients as any
    const recipientName = order.shiptoname ||
      [client?.companyname || '', client?.firstname || '', client?.lastname || ''].filter(Boolean).join(' ').trim() ||
      'Unknown'

    // Weight — minimum 1g
    const weightGrams = Math.max(order.totalweightg || 1, 1)

    // Build Click & Drop order payload
    const cadPayload = {
      orderReference:       order.ordernumber,
      recipient: {
        name:             recipientName,
        addressLine1:     order.shiptoaddress1 || '',
        addressLine2:     order.shiptoaddress2 || '',
        addressLine3:     order.shiptoaddress3 || '',
        city:             order.shiptotown || '',
        county:           order.shiptocounty || '',
        postcode:         order.shiptopostcode || '',
        countryCode:      order.shiptocountry === 'United Kingdom' ? 'GB' : order.shiptocountry || 'GB',
        phoneNumber:      client?.phone || '',
        emailAddress:     client?.email || '',
      },
      sender: {
        tradingName:      TRADING_NAME,
      },
      orderDate:            order.orderdate || new Date().toISOString(),
      subtotal:             order.subtotal || 0,
      shippingCostCharged:  order.shippingcost || 0,
      total:                order.ordertotal || 0,
      weightInGrams:        weightGrams,
      serviceCode,
    }

    // Push to Click & Drop
    const cadRes = await fetch(`${CAD_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CAD_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify([cadPayload]),
    })

    if (!cadRes.ok) {
      const errText = await cadRes.text()
      return NextResponse.json({ success: false, error: `Click and Drop error: ${cadRes.status} — ${errText}` })
    }

    const cadData = await cadRes.json()
    const cadOrderId = cadData?.[0]?.orderIdentifier || null

    // Store C&D order reference on the PickFlow order
    if (cadOrderId) {
      await supabase
        .from('tblorders')
        .update({ cadorderid: cadOrderId })
        .eq('orderid', orderid)
    }

    return NextResponse.json({ success: true, cadOrderId })

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
