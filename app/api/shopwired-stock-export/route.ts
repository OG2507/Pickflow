import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { retailStockPosition, wholesaleStockPosition } from '@/lib/stockPosition'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Builds a Shopwired product-import CSV that updates ONLY the
// "Custom Field - stock_position" column, keyed by "Item ID".
// One row per Shopwired listing: retail (Item ID = shopwiredretailid, wording in
// units) and wholesale (Item ID = shopwiredwholesaleid, wording in whole packs).
//
// POST body: { sample?: boolean } — sample returns just the first few listings,
// for a safe test upload that confirms only stock_position changes.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any))
    const sample = body?.sample === true

    // Active products that have at least one Shopwired listing id.
    const { data: products, error: prodErr } = await supabase
      .from('tblproducts')
      .select('productid, packquantity, isdiscontinued, shopwiredretailid, shopwiredwholesaleid')
      .eq('isactive', true)
      .range(0, 9999)

    if (prodErr) {
      console.error('[shopwired-stock-export] products error:', prodErr)
      return NextResponse.json({ error: prodErr.message }, { status: 500 })
    }
    if (!products) {
      return NextResponse.json({ error: 'No products found' }, { status: 404 })
    }

    // Sum stock on hand per product in one query (Map pattern — no per-product round trips).
    const { data: stock, error: stockErr } = await supabase
      .from('tblstocklevels')
      .select('productid, quantityonhand')
      .range(0, 9999)

    if (stockErr) {
      console.error('[shopwired-stock-export] stock error:', stockErr)
      return NextResponse.json({ error: stockErr.message }, { status: 500 })
    }

    const onHand = new Map<number, number>()
    for (const s of stock || []) {
      onHand.set(s.productid, (onHand.get(s.productid) || 0) + (s.quantityonhand || 0))
    }

    // Only products with a listing id can be pushed; sample takes the first few.
    const listed = products.filter(
      (p: any) => (p.shopwiredretailid || '').trim() || (p.shopwiredwholesaleid || '').trim()
    )
    const list = sample ? listed.slice(0, 3) : listed

    const rows: string[][] = [['Item ID', 'Custom Field - stock_position']]

    for (const p of list as any[]) {
      const units = onHand.get(p.productid) || 0
      const discontinued = !!p.isdiscontinued

      const retailId = (p.shopwiredretailid || '').trim()
      if (retailId) {
        rows.push([retailId, retailStockPosition(units, discontinued)])
      }

      const wholesaleId = (p.shopwiredwholesaleid || '').trim()
      if (wholesaleId) {
        const packSize = p.packquantity && p.packquantity > 1 ? p.packquantity : 1
        const packs = Math.floor(units / packSize)
        rows.push([wholesaleId, wholesaleStockPosition(packs, discontinued)])
      }
    }

    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')

    const filename = sample ? 'stock-position-sample.csv' : 'stock-position.csv'
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Row-Count': String(rows.length - 1),
      },
    })
  } catch (err: any) {
    console.error('[shopwired-stock-export] unexpected error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
