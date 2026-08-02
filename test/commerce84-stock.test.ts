import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseCommerce84StockSkus,
  resolveCommerce84StockLines,
} from '../lib/commerce84-stock.ts'

test('normalises valid website SKUs and rejects unsafe batches', () => {
  assert.deepEqual(parseCommerce84StockSkus([' 11950123 ', 'abc-W']), [
    '11950123',
    'ABC-W',
  ])
  assert.throws(() => parseCommerce84StockSkus([]), /At least one SKU/)
  assert.throws(() => parseCommerce84StockSkus(['ABC', 'abc']), /Duplicate/)
  assert.throws(() => parseCommerce84StockSkus(['not a sku']), /invalid/)
})

test('returns retail units and wholesale packs from mapped Pickflow stock', () => {
  const lines = resolveCommerce84StockLines(
    ['BADGE-RETAIL', 'BADGE-W'],
    [
      { websitesku: 'BADGE-RETAIL', realsku: 'REAL-BADGE' },
      { websitesku: 'BADGE-W', realsku: 'REAL-BADGE-W' },
    ],
    [
      {
        productid: 42,
        sku: 'REAL-BADGE',
        altsku: null,
        productname: 'Test badge',
        packquantity: 20,
        isdiscontinued: false,
      },
    ],
    [
      { productid: 42, quantityonhand: 19 },
      { productid: 42, quantityonhand: 26 },
    ]
  )

  assert.equal(lines[0].availableQuantity, 45)
  assert.equal(lines[0].wholesale, false)
  assert.equal(lines[1].availableQuantity, 2)
  assert.equal(lines[1].wholesale, true)
  assert.equal(lines[1].stockOnHandUnits, 45)
})

test('uses alternative SKUs and fails closed for unknown products', () => {
  const lines = resolveCommerce84StockLines(
    ['ALT-1', 'UNKNOWN'],
    [],
    [
      {
        productid: 7,
        sku: 'REAL-1',
        altsku: 'ALT-1',
        productname: 'Alternative SKU badge',
        packquantity: null,
        isdiscontinued: true,
      },
    ],
    [{ productid: 7, quantityonhand: 3 }]
  )

  assert.equal(lines[0].found, true)
  assert.equal(lines[0].availableQuantity, 3)
  assert.equal(lines[0].discontinued, true)
  assert.equal(lines[1].found, false)
  assert.equal(lines[1].availableQuantity, 0)
})
