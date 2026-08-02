import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import {
  parseCommerce84StockSkus,
  resolveCommerce84StockLines,
  type Commerce84SkuMapping,
  type Commerce84StockLevel,
  type Commerce84StockProduct,
} from '@/lib/commerce84-stock'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function authorised(request: Request): boolean {
  const expected = process.env.COMMERCE84_STOCK_API_SECRET?.trim() ?? ''
  const supplied = request.headers.get('x-commerce84-api-key')?.trim() ?? ''
  if (!expected || !supplied) return false
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  )
}

function databaseFailure(message: string, error: unknown) {
  console.error(`Commerce84 stock feed — ${message}:`, error)
  return NextResponse.json(
    { error: 'Pickflow stock is temporarily unavailable' },
    { status: 503, headers: { 'cache-control': 'no-store' } }
  )
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'cache-control': 'no-store' } }
    )
  }

  let websiteSkus: string[]
  try {
    const body = await request.json()
    websiteSkus = parseCommerce84StockSkus(body?.skus)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid stock request' },
      { status: 400, headers: { 'cache-control': 'no-store' } }
    )
  }

  const { data: mappings, error: mappingError } = await supabase
    .from('tblskumapping')
    .select('websitesku, realsku')
    .in('websitesku', websiteSkus)
    .limit(10000)
  if (mappingError) return databaseFailure('SKU mapping query failed', mappingError)

  const mappedSkuByWebsiteSku = new Map(
    ((mappings ?? []) as Commerce84SkuMapping[]).map((mapping) => [
      mapping.websitesku.trim().toUpperCase(),
      mapping.realsku.trim().toUpperCase(),
    ])
  )
  const lookupSkus = [
    ...new Set(
      websiteSkus.map((websiteSku) => {
        const mappedSku = mappedSkuByWebsiteSku.get(websiteSku) ?? websiteSku
        return mappedSku.endsWith('-W') ? mappedSku.slice(0, -2) : mappedSku
      })
    ),
  ]

  const productColumns =
    'productid, sku, altsku, productname, packquantity, isdiscontinued'
  const [{ data: skuProducts, error: skuError }, { data: altProducts, error: altError }] =
    await Promise.all([
      supabase.from('tblproducts').select(productColumns).in('sku', lookupSkus).limit(10000),
      supabase.from('tblproducts').select(productColumns).in('altsku', lookupSkus).limit(10000),
    ])
  if (skuError) return databaseFailure('product SKU query failed', skuError)
  if (altError) return databaseFailure('alternative SKU query failed', altError)

  const products = [
    ...((skuProducts ?? []) as Commerce84StockProduct[]),
    ...((altProducts ?? []) as Commerce84StockProduct[]),
  ]
  const uniqueProducts = [
    ...new Map(products.map((product) => [product.productid, product])).values(),
  ]
  const productIds = uniqueProducts.map((product) => product.productid)
  let stockLevels: Commerce84StockLevel[] = []
  if (productIds.length > 0) {
    const { data, error } = await supabase
      .from('tblstocklevels')
      .select('productid, quantityonhand')
      .in('productid', productIds)
      .limit(10000)
    if (error) return databaseFailure('stock-level query failed', error)
    stockLevels = (data ?? []) as Commerce84StockLevel[]
  }

  return NextResponse.json(
    {
      source: 'pickflow',
      observedAt: new Date().toISOString(),
      lines: resolveCommerce84StockLines(
        websiteSkus,
        (mappings ?? []) as Commerce84SkuMapping[],
        uniqueProducts,
        stockLevels
      ),
    },
    { headers: { 'cache-control': 'no-store' } }
  )
}
