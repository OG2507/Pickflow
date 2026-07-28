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

    // ── Package format mapping ──────────────────────────────────
    const mapPackageFormat = (size: string): string => {
      const map: Record<string, string> = {
        'letter':        'letter',
        'large letter':  'largeLetter',
        'small parcel':  'smallParcel',
        'medium parcel': 'mediumParcel',
        'parcel':        'parcel',
      }
      return map[size.toLowerCase()] || 'parcel'
    }
    let packageFormat = 'parcel' // default

    // ── Service code lookup ──────────────────────────────────────
    let serviceCode = 'TOLP48' // default — Tracked 48
    if (order.shippingmethod) {
      const { data: mapped } = await supabase
        .from('tblshippingmethodmap')
        .select('servicecode')
        .eq('swmethodname', order.shippingmethod)
        .maybeSingle()

      if (mapped?.servicecode) {
        serviceCode = mapped.servicecode
        // Also fetch packagesize from tblshippingrates for this method name
        const { data: rateForFormat } = await supabase
          .from('tblshippingrates')
          .select('packagesize')
          .eq('methodname', order.shippingmethod)
          .maybeSingle()
        if (rateForFormat?.packagesize) {
          packageFormat = mapPackageFormat(rateForFormat.packagesize)
        }
      } else {
        const { data: rate } = await supabase
          .from('tblshippingrates')
          .select('servicecode, packagesize')
          .eq('methodname', order.shippingmethod)
          .maybeSingle()

        if (rate?.servicecode) {
          serviceCode = rate.servicecode
        }
        if (rate?.packagesize) {
          packageFormat = mapPackageFormat(rate.packagesize)
        }
        if (rate && !rate.servicecode) {
          return NextResponse.json({
            success: false,
            error: 'No Royal Mail service code for this shipping method — label not required',
          })
        }
      }
    }

    // ── Build recipient name ─────────────────────────────────────
    const client = order.tblclients as any
    const fullName = (order.shiptoname || '').trim() ||
      [client?.companyname, client?.firstname, client?.lastname]
        .filter(Boolean).join(' ').trim() ||
      'Unknown'

    // ── countryCode — must be ISO 2-letter ──────────────────────
    const countryCode = (order.shiptocountry && order.shiptocountry.length === 2)
      ? order.shiptocountry.toUpperCase()
      : 'GB'

    // ── Build payload per API spec ───────────────────────────────
    // recipient.address is a nested object; phoneNumber/emailAddress are on recipient directly
    // serviceCode belongs inside postageDetails, not at order level
    const cadPayload: any = {
      orderReference:      order.ordernumber || String(order.orderid),
      orderDate:           (order.orderdate || new Date().toISOString()).replace('+00:00', 'Z'),
      subtotal:            order.subtotal || 0,
      shippingCostCharged: order.shippingcost || 0,
      total:               order.ordertotal || 0,
      recipient: {
        address: {
          fullName,
          addressLine1: order.shiptoaddress1 || '',
          addressLine2: order.shiptoaddress2 || undefined,
          addressLine3: order.shiptoaddress3 || undefined,
          city:         order.shiptotown || '',
          county:       order.shiptocounty || undefined,
          postcode:     order.shiptopostcode || '',
          countryCode,
        },
        phoneNumber:  client?.phone || undefined,
        emailAddress: client?.email || undefined,
      },
      packages: [
        {
          weightInGrams:           Math.max(order.totalweightg || 100, 1),
          packageFormatIdentifier: packageFormat,
        },
      ],
      postageDetails: {
        serviceCode,
        receiveEmailNotification: true,
        receiveSmsNotification:   true,
      },
    }

    // Strip undefined values — API rejects undefined on optional fields
    const cleanPayload = JSON.parse(JSON.stringify(cadPayload))

    // Log a non-PII summary only — never the recipient name/address/phone/email.
    console.log('[C&D] Sending order:', {
      orderReference: cleanPayload.orderReference,
      serviceCode,
      countryCode,
      weightInGrams: cleanPayload.packages?.[0]?.weightInGrams,
    })

    const cadRes = await fetch(`${CAD_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': CAD_KEY,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({ items: [cleanPayload] }),
    })

    const responseText = await cadRes.text()

    if (!cadRes.ok) {
      // Only log the raw body on failure — it's what you need to debug a 400,
      // and it keeps success responses (which echo recipient details) out of logs.
      console.error(`[C&D] Error ${cadRes.status}:`, responseText)
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
