import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CAD_BASE = 'https://api.parcel.royalmail.com/api/v1'
const CAD_KEY  = process.env.CLICKANDDROP_API_KEY!

export async function POST(request: Request) {
  try {
    const { orderid } = await request.json()

    if (!orderid) {
      return NextResponse.json({ success: false, error: 'No orderid provided' })
    }

    // Fetch order
    const { data: order, error: orderErr } = await supabase
      .from('tblorders')
      .select(`
        orderid, ordernumber, orderdate, isebay, ordersource,
        shiptoname, shiptoaddress1, shiptoaddress2, shiptoaddress3,
        shiptotown, shiptocounty, shiptopostcode, shiptocountry,
        shippingmethod, totalweightg, subtotal, shippingcost, ordertotal,
        ordertotalincvat,
        tblclients (companyname, firstname, lastname, email, phone)
      `)
      .eq('orderid', orderid)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ success: false, error: 'Order not found' })
    }

    // Skip eBay orders — managed through C&D directly via eBay integration
    if (order.isebay) {
      return NextResponse.json({ success: false, error: 'eBay orders are managed directly through Click and Drop' })
    }

    // ── Service code lookup ──────────────────────────────────────
    // Check mapping table first (Shopwired method names), then shipping rates (manual orders)
    let serviceCode = 'TOLP48' // default — Tracked 48
    if (order.shippingmethod) {
      const { data: mapped } = await supabase
        .from('tblshippingmethodmap')
        .select('servicecode')
        .eq('swmethodname', order.shippingmethod)
        .maybeSingle()

      if (mapped?.servicecode) {
        serviceCode = mapped.servicecode
      } else {
        const { data: rate } = await supabase
          .from('tblshippingrates')
          .select('servicecode')
          .eq('methodname', order.shippingmethod)
          .maybeSingle()

        if (rate?.servicecode) {
          serviceCode = rate.servicecode
        } else if (rate && !rate.servicecode) {
          // Method exists but has no service code — collection or free delivery
          return NextResponse.json({
            success: false,
            error: 'No Royal Mail service code for this shipping method — label not required',
          })
        }
      }
    }

    // ── Build recipient name ─────────────────────────────────────
    const client = order.tblclients as any
    const recipientName = (order.shiptoname || '').trim() ||
      [client?.companyname, client?.firstname, client?.lastname]
        .filter(Boolean).join(' ').trim() ||
      'Unknown'

    // ── Build payload ────────────────────────────────────────────
    // Required fields per API spec: recipient, orderDate, subtotal, shippingCostCharged, total
    const cadPayload = {
      orderReference:      order.ordernumber || String(order.orderid),
      orderDate:           order.orderdate || new Date().toISOString(),
      subtotal:            order.subtotal || 0,
      shippingCostCharged: order.shippingcost || 0,
      total:               order.ordertotal || 0,
      recipient: {
        name:         recipientName,
        addressLine1: order.shiptoaddress1 || '',
        addressLine2: order.shiptoaddress2 || undefined,
        addressLine3: order.shiptoaddress3 || undefined,
        city:         order.shiptotown || '',
        countryCode:  order.shiptocountry || 'GB',
        postcode:     order.shiptopostcode || '',
        phoneNumber:  client?.phone || undefined,
        emailAddress: client?.email || undefined,
      },
      packages: [
        {
          weightInGrams:           Math.max(order.totalweightg || 100, 1),
          packageFormatIdentifier: 'Parcel',
        },
      ],
      serviceCode,
    }

    // Strip undefined values — the API rejects null/undefined on optional fields
    const cleanPayload = JSON.parse(JSON.stringify(cadPayload))

    console.log('[C&D] Sending payload:', JSON.stringify(cleanPayload, null, 2))

    // ── POST to Click & Drop ─────────────────────────────────────
    // Body must be a JSON array even for a single order
    const cadRes = await fetch(`${CAD_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Authorization':  CAD_KEY,
        'Content-Type':   'application/json',
        'Accept':         'application/json',
      },
      body: JSON.stringify([cleanPayload]),
    })

    const responseText = await cadRes.text()
    console.log(`[C&D] Response ${cadRes.status}:`, responseText)

    if (!cadRes.ok) {
      return NextResponse.json({
        success: false,
        error:   `Click and Drop error: ${cadRes.status} — ${responseText}`,
      })
    }

    let cadData: any
    try {
      cadData = JSON.parse(responseText)
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON response from Click and Drop' })
    }

    const cadOrderId = cadData?.createdOrders?.[0]?.orderIdentifier
      || cadData?.[0]?.orderIdentifier
      || null

    // Write C&D order reference back to PickFlow
    if (cadOrderId) {
      await supabase
        .from('tblorders')
        .update({ cadorderid: String(cadOrderId) })
        .eq('orderid', orderid)
    }

    return NextResponse.json({ success: true, cadOrderId })

  } catch (err: any) {
    console.error('[C&D] Unexpected error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
