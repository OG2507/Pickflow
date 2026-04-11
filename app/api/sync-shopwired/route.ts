import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SW_BASE = 'https://api.ecommerceapi.uk/v1'
const SW_AUTH = Buffer.from(
  `${process.env.SHOPWIRED_API_KEY}:${process.env.SHOPWIRED_API_SECRET}`
).toString('base64')

async function swFetch(path: string) {
  const res = await fetch(`${SW_BASE}${path}`, {
    headers: {
      Authorization: `Basic ${SW_AUTH}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Shopwired API error: ${res.status} ${path}`)
  return res.json()
}

export async function POST() {
  try {
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    // Fetch paid orders from last 30 days
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const sinceStr = since.toISOString().slice(0, 10)

    const allOrders: any[] = []
    let offset = 0
    const limit = 50
    let hasMore = true

    while (hasMore) {
      console.log(`Fetching offset ${offset}...`)
      if (offset >= 200) { hasMore = false; break }
      const data = await swFetch(`/orders?count=${limit}&offset=${offset}&status_id=231566&created_after=${sinceStr}`)
      const orders = Array.isArray(data) ? data : (data.orders || [])
      console.log(`Got ${orders.length} orders at offset ${offset}`)

      if (!Array.isArray(orders) || orders.length === 0) {
        hasMore = false
        break
      }

      // Filter to Paid orders only
      const paidOrders = orders.filter((o: any) =>
        o.status?.type === 'paid' || o.status?.name === 'Paid'
      )
      allOrders.push(...paidOrders)

      if (orders.length < limit) {
        hasMore = false
      } else {
        offset += limit
      }
    }

    // Load SKU mapping table — fetch all rows (override 1000 row default limit)
    const { data: mappingData } = await supabase
      .from('tblskumapping')
      .select('websitesku, realsku')
      .range(0, 9999)

    const skuMap = new Map<string, string>()
    for (const m of mappingData || []) {
      skuMap.set(m.websitesku, m.realsku)
    }

    // Load products for pack quantity lookup — fetch all rows
    const { data: productsData } = await supabase
      .from('tblproducts')
      .select('productid, sku, productname, packquantity, pricingcode, pricingcodeid')
      .range(0, 9999)

    const productBySku = new Map<string, any>()
    for (const p of productsData || []) {
      productBySku.set(p.sku, p)
    }
    console.log(`SKU map size: ${skuMap.size}, Product map size: ${productBySku.size}`)

    for (const swOrder of allOrders) {
      const externalRef = String(swOrder.id || '')

      // Skip if already imported
      const { data: existing } = await supabase
        .from('tblorders')
        .select('orderid')
        .eq('externalorderref', externalRef)
        .single()

      if (existing) {
        skipped++
        continue
      }

      // Shopwired API field names (from actual response)
      const billingAddr  = swOrder.billingAddress || {}
      const shippingAddr = swOrder.shippingAddress || {}

      const isEbay     = (swOrder.paymentMethod || '').toLowerCase().includes('ebay')
      const email      = billingAddr.emailAddress || shippingAddr.emailAddress || ''
      const shiptoname = shippingAddr.name || billingAddr.name || ''
      const phone      = shippingAddr.telephone || billingAddr.telephone || ''

      // Shipping method from shipping array
      const shippingEntry  = Array.isArray(swOrder.shipping) ? swOrder.shipping[0] : null
      const swShippingMethod = shippingEntry?.name || null

      // Totals
      const subtotal   = parseFloat(swOrder.subTotal || '0') || 0
      const shipping   = parseFloat(swOrder.shippingTotal || '0') || 0
      const totalvat   = parseFloat(swOrder.tax?.value || '0') || 0
      const grandtotal = parseFloat(swOrder.total || '0') || 0

      // Find or create client
      let clientid: number | null = null

      if (email) {
        const { data: existingClient } = await supabase
          .from('tblclients')
          .select('clientid')
          .eq('email', email)
          .single()

        if (existingClient) {
          clientid = existingClient.clientid
        } else {
          const nameParts = shiptoname.split(' ')
          const firstname  = nameParts[0] || ''
          const lastname   = nameParts.slice(1).join(' ') || ''
          const clienttype = isEbay ? 'eBay' : 'Website'

          const { data: newClient, error: clientErr } = await supabase
            .from('tblclients')
            .insert({
              companyname:        billingAddr.companyName || '',
              firstname,
              lastname,
              email,
              phone,
              address1:           shippingAddr.addressLine1 || billingAddr.addressLine1 || '',
              address2:           shippingAddr.addressLine2 || billingAddr.addressLine2 || '',
              address3:           shippingAddr.addressLine3 || billingAddr.addressLine3 || '',
              town:               shippingAddr.city || billingAddr.city || '',
              county:             shippingAddr.province || billingAddr.province || '',
              postcode:           shippingAddr.postcode || billingAddr.postcode || '',
              country:            shippingAddr.country || billingAddr.country || 'United Kingdom',
              clienttype,
              iswholesale:        false,
              isreducedwholesale: false,
              isactive:           true,
            })
            .select('clientid')
            .single()

          if (clientErr || !newClient) {
            errors.push(`Failed to create client for order ${externalRef}: ${clientErr?.message}`)
            continue
          }
          clientid = newClient.clientid
        }
      }

      if (!clientid) {
        errors.push(`No email/client for order ${externalRef} — skipping`)
        continue
      }

      // Create order header
      const { data: newOrder, error: orderErr } = await supabase
        .from('tblorders')
        .insert({
          clientid,
          orderdate:        swOrder.created || new Date().toISOString(),
          ordersource:      isEbay ? 'eBay' : 'Shopwired',
          externalorderref: externalRef,
          status:           'New',
          isebay:           isEbay,
          isblindship:      false,
          shiptoname,
          shiptoaddress1:   shippingAddr.addressLine1 || '',
          shiptoaddress2:   shippingAddr.addressLine2 || '',
          shiptoaddress3:   shippingAddr.addressLine3 || '',
          shiptotown:       shippingAddr.city || '',
          shiptocounty:     shippingAddr.province || '',
          shiptopostcode:   shippingAddr.postcode || '',
          shiptocountry:    shippingAddr.country || 'United Kingdom',
          subtotal,
          shippingcost:     isEbay ? 0 : shipping,
          shippingmethod:   swShippingMethod,
          totalvat,
          ordertotal:       grandtotal,
          notes:            swOrder.comments || '',
        })
        .select('orderid, ordernumber')
        .single()

      if (orderErr || !newOrder) {
        errors.push(`Failed to create order ${externalRef}: ${orderErr?.message}`)
        continue
      }

      // Generate JKS order number
      const orderNum = `JKS-${String(newOrder.orderid).padStart(5, '25769')}-${isEbay ? '400' : '100'}`
      await supabase
        .from('tblorders')
        .update({ 
          ordernumber: orderNum,
          externalreference: String(swOrder.reference || ''),
        })
        .eq('orderid', newOrder.orderid)

      // Process order lines
      const items = swOrder.products || []
      let lineError = false

      for (const item of items) {
        const websiteSku = item.sku || ''
        const itemName   = item.name || websiteSku
        let   qty        = parseInt(item.quantity || '1') || 1
        const unitPrice  = parseFloat(item.price || '0') || 0

        // Translate website SKU to real SKU
        const realSku = skuMap.get(websiteSku) || websiteSku
        console.log(`Item: websiteSku=${websiteSku} → realSku=${realSku}`)

        // Handle W suffix
        let lookupSku = realSku
        if (realSku.endsWith('-W')) {
          lookupSku = realSku.slice(0, -2)
          const product = productBySku.get(lookupSku)
          qty = qty * (product?.packquantity || 1)
        }

        const product = productBySku.get(lookupSku)
        console.log(`  lookupSku=${lookupSku} → productid=${product?.productid} name=${product?.productname}`)

        const { error: lineErr } = await supabase
          .from('tblorderlines')
          .insert({
            orderid:         newOrder.orderid,
            productid:       product?.productid || null,
            sku:             lookupSku,
            productname:     product?.productname || itemName,
            quantityordered: qty,
            unitprice:       unitPrice,
            linetotal:       unitPrice * qty,
            status:          'Pending',
          })

        if (lineErr) {
          errors.push(`Failed to create line for order ${externalRef} SKU ${websiteSku}: ${lineErr.message}`)
          lineError = true
        }
      }

      if (!lineError) imported++
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: allOrders.length,
      errors: errors.length > 0 ? errors : undefined,
    })

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
