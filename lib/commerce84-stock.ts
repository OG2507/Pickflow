export const COMMERCE84_STOCK_BATCH_LIMIT = 250

export type Commerce84StockProduct = {
  productid: number
  sku: string
  altsku: string | null
  productname: string
  packquantity: number | null
  isdiscontinued: boolean | null
}

export type Commerce84SkuMapping = {
  websitesku: string
  realsku: string
}

export type Commerce84StockLevel = {
  productid: number
  quantityonhand: number | null
}

export type Commerce84StockLine = {
  websiteSku: string
  realSku: string | null
  productId: number | null
  productName: string | null
  availableQuantity: number
  stockOnHandUnits: number
  packQuantity: number
  wholesale: boolean
  discontinued: boolean
  found: boolean
}

const SKU_PATTERN = /^[A-Z0-9._/-]+$/

export function parseCommerce84StockSkus(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error('At least one SKU is required')
  }
  if (value.length > COMMERCE84_STOCK_BATCH_LIMIT) {
    throw new Error(`A maximum of ${COMMERCE84_STOCK_BATCH_LIMIT} SKUs is allowed`)
  }

  const skus = value.map((candidate) =>
    typeof candidate === 'string' ? candidate.trim().toUpperCase() : ''
  )
  if (skus.some((sku) => !sku || sku.length > 100 || !SKU_PATTERN.test(sku))) {
    throw new Error('One or more SKUs are invalid')
  }
  if (new Set(skus).size !== skus.length) {
    throw new Error('Duplicate SKUs are not allowed')
  }
  return skus
}

export function resolveCommerce84StockLines(
  websiteSkus: readonly string[],
  mappings: readonly Commerce84SkuMapping[],
  products: readonly Commerce84StockProduct[],
  stockLevels: readonly Commerce84StockLevel[]
): Commerce84StockLine[] {
  const mappingByWebsiteSku = new Map(
    mappings.map((mapping) => [
      mapping.websitesku.trim().toUpperCase(),
      mapping.realsku.trim().toUpperCase(),
    ])
  )
  const productsBySku = new Map(
    products.map((product) => [product.sku.trim().toUpperCase(), product])
  )
  const productsByAltSku = new Map(
    products
      .filter((product) => product.altsku?.trim())
      .map((product) => [product.altsku!.trim().toUpperCase(), product])
  )
  const stockByProduct = new Map<number, number>()
  for (const level of stockLevels) {
    stockByProduct.set(
      level.productid,
      (stockByProduct.get(level.productid) ?? 0) +
        Math.max(0, Math.floor(Number(level.quantityonhand) || 0))
    )
  }

  return websiteSkus.map((websiteSku) => {
    const mappedSku = mappingByWebsiteSku.get(websiteSku) ?? websiteSku
    const wholesale = mappedSku.endsWith('-W')
    const lookupSku = wholesale ? mappedSku.slice(0, -2) : mappedSku
    const product = productsBySku.get(lookupSku) ?? productsByAltSku.get(lookupSku)

    if (!product) {
      return {
        websiteSku,
        realSku: null,
        productId: null,
        productName: null,
        availableQuantity: 0,
        stockOnHandUnits: 0,
        packQuantity: 1,
        wholesale,
        discontinued: false,
        found: false,
      }
    }

    const stockOnHandUnits = stockByProduct.get(product.productid) ?? 0
    const packQuantity = Math.max(1, Math.floor(Number(product.packquantity) || 1))
    return {
      websiteSku,
      realSku: product.sku,
      productId: product.productid,
      productName: product.productname,
      availableQuantity: wholesale
        ? Math.floor(stockOnHandUnits / packQuantity)
        : stockOnHandUnits,
      stockOnHandUnits,
      packQuantity,
      wholesale,
      discontinued: Boolean(product.isdiscontinued),
      found: true,
    }
  })
}
