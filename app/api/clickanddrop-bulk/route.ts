import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CAD_BASE = 'https://api.parcel.royalmail.com/api/v1'
const CAD_KEY  = process.env.CLICKANDDROP_API_KEY!

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

export async function POST(request: Request) {
  try {
    const { orderids } = await request.json()

    if (!Array.isArray(orderids) || orderids.length === 0) {
      return NextResponse.json({ success: false, error: 'No orderids provided' })
    }

    // ── Fetch all orders in one query ────────────────────────────
    const { data: orders, error: ordersErr } = await supabase
      .from('tblorders')
      .select(`
        orderid, ordernumber, orderdate, isebay, ordersource,
        shiptoname, shiptoaddress1, shiptoaddress2, shiptoaddress3,
        shiptotown, shiptocounty, shiptopostcode, shiptocountry,
        shippingmethod, totalweightg, subtotal, shippingcost, ordertotal,
        tblclients (companyname, firstname, lastname, email, phone)
      `)
      .in('orderid', orderids)

    if (ordersErr || !orders) {
      return NextResponse.json({ success: false, error: 'Failed to fetch orders' })
    }

    // ── Fetch shipping method map and rates once ─────────────────
    const { data: methodMaps } = await supabase
      .from('tblshippingmethodmap')
      .select('swmethodname, servicecode')

    const { data: shippingRates } = await supabase
      .from('tblshippingrates')
      .select('methodname, servicecode, packagesize')

    const methodMapLookup = new Map<string, string>(
      (methodMaps || []).map((m: any) => [m.swmethodname, m.servicecode])
    )
    const ratesLookup = new Map<string, any>(
      (shippingRates || []).map((r: any) => [r.methodname, r])
    )

    const results: { orderid: number; success: boolean; cadOrderId?: string; error?: string }[] = []
    const cadItems: any[] = []
    const validOrders: typeof orders = []

    for (const order of orders) {
      // Skip eBay
      if (order.isebay) {
        results.push({ orderid: order.orderid, success: false, error: 'eBay order — managed through Click and Drop directly' })
        continue
      }

      // ── Resolve service code + package format ────────────────
      let serviceCode   = 'TOLP48' // default Tracked 48
      let packageFormat = 'parcel'

      if (order.shippingmethod) {
        const mappedCode = methodMapLookup.get(order.shippingmethod)
        if (mappedCode) {
          serviceCode = mappedCode
          const rate = ratesLookup.get(order.shippingmethod)
          if (rate?.packagesize) packageFormat = mapPackageFormat(rate.packagesize)
        } else {
          const rate = ratesLookup.get(order.shippingmethod) as any
          if (rate?.servicecode) serviceCode = rate.servicecode
          if (rate?.packagesize) packageFormat = mapPackageFormat(rate.packagesize)
          if (rate && !rate.servicecode) {
            results.push({ orderid: order.orderid, success: false, error: 'No Royal Mail service code for this shipping method' })
            continue
          }
        }
      }

      const client = order.tblclients as any
      const fullName = (order.shiptoname || '').trim() ||
        [client?.companyname, client?.firstname, client?.lastname]
          .filter(Boolean).join(' ').trim() ||
        'Unknown'

      const countryCode = (order.shiptocountry && order.shiptocountry.length === 2)
        ? order.shiptocountry.toUpperCase()
        : 'GB'

      const cadItem: any = {
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

      cadItems.push(JSON.parse(JSON.stringify(cadItem)))
      validOrders.push(order)
    }

    if (cadItems.length === 0) {
      return NextResponse.json({ success: false, error: 'No eligible orders to send', results })
    }

    // ── Send all items in one API call ───────────────────────────
    console.log(`[C&D Bulk] Sending ${cadItems.length} orders`)

    const cadRes = await fetch(`${CAD_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': CAD_KEY,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({ items: cadItems }),
    })

    const responseText = await cadRes.text()

    if (!cadRes.ok) {
      // Only log the raw body on failure — it can echo recipient details.
      console.error(`[C&D Bulk] Error ${cadRes.status}:`, responseText)
      return NextResponse.json({
        success: false,
        error:   `Click and Drop error: ${cadRes.status} — ${responseText}`,
        results,
      })
    }

    let cadData: any
    try {
      cadData = JSON.parse(responseText)
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON from Click and Drop', results })
    }

    // ── Map responses back to orders ─────────────────────────────
    // C&D returns createdOrders array in the same order as items sent
    const createdOrders: any[] = cadData?.createdOrders || []

    for (let i = 0; i < validOrders.length; i++) {
      const order   = validOrders[i]
      const created = createdOrders[i]
      const cadOrderId = created?.orderIdentifier || null

      if (cadOrderId) {
        await supabase
          .from('tblorders')
          .update({ cadorderid: String(cadOrderId) })
          .eq('orderid', order.orderid)
      }

      results.push({
        orderid:    order.orderid,
        success:    true,
        cadOrderId: cadOrderId ? String(cadOrderId) : undefined,
      })
    }

    const successCount = results.filter(r => r.success).length
    const failCount    = results.filter(r => !r.success).length

    return NextResponse.json({ success: true, successCount, failCount, results })

  } catch (err: any) {
    console.error('[C&D Bulk] Unexpected error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
