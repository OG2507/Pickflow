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
    let errors: string[] = []

    // Fetch paid orders from Shopwired — page through results
    let page = 1
    let hasMore = true
    const allOrders: any[] = []

    while (hasMore) {
      const data = await swFetch(`/orders?status=paid&limit=50&page=${page}`)
      const orders = data.orders || data
      if (!Array.isArray(orders) || orders.length === 0) {
        hasMore = false
      } else {
        allOrders.push(...orders)
        hasMore = orders.length === 50
        page++
      }
    }

    // Load SKU mapping table
    const { data: mappingData } = await supabase
      .from('tblskumapping')
      .select('websitesku, realsku')

    const skuMap = new Map<string, string>()
    for (const m of mappingData || []) {
      skuMap.set(m.websitesku, m.realsku)
    }

    // Load products for pack quantity lookup
    const { data: productsData } = await supabase
      .from('tblproducts')
      .select('productid, sku, packquantity, pricingcode, pricingcodeid')

    const productBySku = new Map<string, any>()
    for (const p of productsData || []) {
      productBySku.set(p.sku, p)
    }

    for (const swOrder of allOrders) {
      const externalRef = String(swOrder.id || swOrder.order_id || '')

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

      const isEbay = (swOrder.payment_method || '').toLowerCase().includes('ebay')
      const deliveryAddress = swOrder.delivery_address || swOrder.shipping_address || {}
      const billingAddress = swOrder.billing_address || {}

      const shiptoname = deliveryAddress.name || billingAddress.name || ''
      const email = swOrder.customer_email || billingAddress.email || ''
      const phone = deliveryAddress.phone || billingAddress.phone || ''

      // Find or create client
      let clientid: number | null = null

      // Check by email first
      if (email) {
        const { data: existingClient } = await supabase
          .from('tblclients')
          .select('clientid')
          .eq('email', email)
          .single()

        if (existingClient) {
          clientid = existingClient.clientid
        } else {
          // Create new website/ebay client
          const nameParts = shiptoname.split(' ')
          const firstname = nameParts[0] || ''
          const lastname = nameParts.slice(1).join(' ') || ''
          const clienttype = isEbay ? 'eBay' : 'Website'

          const { data: newClient, error: clientErr } = await supabase
            .from('tblclients')
            .insert({
              companyname: '',
              firstname,
              lastname,
              email,
              phone,
              address1: deliveryAddress.address_line_1 || billingAddress.address_line_1 || '',
              address2: deliveryAddress.address_line_2 || billingAddress.address_line_2 || '',
              town:     deliveryAddress.town || billingAddress.town || '',
              county:   deliveryAddress.county || billingAddress.county || '',
              postcode: deliveryAddress.postcode || billingAddress.postcode || '',
              country:  deliveryAddress.country || billingAddress.country || 'United Kingdom',
              clienttype,
              iswholesale: false,
              isreducedwholesale: false,
              isactive: true,
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
        errors.push(`No client for order ${externalRef} — skipping`)
        continue
      }

      // Calculate order totals
      const subtotal   = parseFloat(swOrder.subtotal || swOrder.sub_total || '0') || 0
      const shipping   = parseFloat(swOrder.shipping_cost || swOrder.delivery_cost || '0') || 0
      const totalvat   = parseFloat(swOrder.vat || swOrder.tax || '0') || 0
      const grandtotal = parseFloat(swOrder.total || swOrder.grand_total || '0') || 0

      // Capture shipping method name from Shopwired
      const swShippingMethod = swOrder.shipping_method || swOrder.delivery_method || swOrder.shippingMethod || null

      // Create order header
      const { data: newOrder, error: orderErr } = await supabase
        .from('tblorders')
        .insert({
          clientid,
          orderdate:        swOrder.date || swOrder.created_at || new Date().toISOString(),
          ordersource:      isEbay ? 'eBay' : 'Shopwired',
          externalorderref: externalRef,
          status:           'New',
          isebay,
          isblindship:      false,
          shiptoname,
          shiptoaddress1:   deliveryAddress.address_line_1 || '',
          shiptoaddress2:   deliveryAddress.address_line_2 || '',
          shiptoaddress3:   deliveryAddress.address_line_3 || '',
          shiptotown:       deliveryAddress.town || '',
          shiptocounty:     deliveryAddress.county || '',
          shiptopostcode:   deliveryAddress.postcode || '',
          shiptocountry:    deliveryAddress.country || 'United Kingdom',
          subtotal,
          shippingcost:     isEbay ? 0 : shipping,
          shippingmethod:   swShippingMethod,
          totalvat,
          ordertotal:       grandtotal,
          notes:            swOrder.comments || swOrder.customer_comments || '',
        })
        .select('orderid, ordernumber')
        .single()

      if (orderErr || !newOrder) {
        errors.push(`Failed to create order ${externalRef}: ${orderErr?.message}`)
        continue
      }

      // Process order lines
      const items = swOrder.products || swOrder.items || swOrder.order_products || []
      let lineError = false

      for (const item of items) {
        const websiteSku = item.sku || item.product_sku || ''
        const itemName   = item.name || item.product_name || websiteSku
        let   qty        = parseInt(item.quantity || item.qty || '1') || 1
        const unitPrice  = parseFloat(item.price || item.unit_price || '0') || 0

        // Translate website SKU to real SKU
        const realSku = skuMap.get(websiteSku) || websiteSku

        // Handle W suffix — strip it and multiply qty by packquantity
        let lookupSku = realSku
        let packMultiplier = 1

        if (realSku.endsWith('-W')) {
          lookupSku = realSku.slice(0, -2)
          const product = productBySku.get(lookupSku)
          packMultiplier = product?.packquantity || 1
          qty = qty * packMultiplier
        }

        const product = productBySku.get(lookupSku)

        const { error: lineErr } = await supabase
          .from('tblorderlines')
          .insert({
            orderid:         newOrder.orderid,
            productid:       product?.productid || null,
            sku:             lookupSku,
            productname:     itemName,
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

      if (!lineError) {
        imported++
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    })

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
