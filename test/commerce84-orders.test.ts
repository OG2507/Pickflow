import assert from 'node:assert/strict'
import test from 'node:test'

import {
  inspectCommerce84SyncConfiguration,
  resolveCommerce84OrderLines,
} from '../lib/commerce84-orders.ts'

test('requires HTTPS and a separate strong Commerce84 order secret', () => {
  const missing = inspectCommerce84SyncConfiguration({
    COMMERCE84_ORDER_ENDPOINT: 'http://thebadgeroom.test/api/pickflow/orders',
  })
  assert.equal(missing.configured, false)
  assert.match(missing.problems.join(' '), /must use HTTPS/)
  assert.match(missing.problems.join(' '), /missing or too short/)

  const ready = inspectCommerce84SyncConfiguration({
    COMMERCE84_ORDER_ENDPOINT: 'https://thebadgeroom.test/api/pickflow/orders/',
    COMMERCE84_ORDER_API_SECRET: 'pickflow-commerce84-orders-secret-123456789',
    COMMERCE84_ORDER_SYNC_LIMIT: '25',
  })
  assert.equal(ready.configured, true)
  assert.equal(
    ready.configuration?.endpoint,
    'https://thebadgeroom.test/api/pickflow/orders'
  )
  assert.equal(ready.configuration?.syncLimit, 25)
})

test('maps Commerce84 board codes to active Pickflow products', () => {
  const lines = resolveCommerce84OrderLines(
    [
      {
        orderLineId: 'line-1',
        sku: 'B04-11',
        productName: 'Test badge',
        quantity: 2,
        unitPriceMinor: 249,
        lineTotalMinor: 498,
        vatStatus: 'Standard',
      },
      {
        orderLineId: 'line-2',
        sku: 'WEB-W',
        productName: 'Wholesale badges',
        quantity: 2,
        unitPriceMinor: 1000,
        lineTotalMinor: 2000,
        vatStatus: 'Standard',
      },
    ],
    [{ websitesku: 'WEB-W', realsku: 'B04-11-W' }],
    [
      {
        productid: 42,
        sku: 'B04-11',
        altsku: null,
        productname: 'OH SHIT! Black Pin Badge',
        packquantity: 20,
        weight: 5,
        isactive: true,
      },
    ]
  )

  assert.equal(lines[0].productid, 42)
  assert.equal(lines[0].quantityordered, 2)
  assert.equal(lines[0].unitprice, 2.49)
  assert.equal(lines[1].quantityordered, 40)
  assert.equal(lines[1].sku, 'B04-11')
  assert.equal(lines[1].linetotal, 20)
})

test('rejects unknown and inactive Pickflow products before creating an order', () => {
  const line = {
    orderLineId: 'line-1',
    sku: 'UNKNOWN',
    productName: 'Unknown badge',
    quantity: 1,
    unitPriceMinor: 249,
    lineTotalMinor: 249,
    vatStatus: 'Standard' as const,
  }
  assert.throws(
    () => resolveCommerce84OrderLines([line], [], []),
    /not an active Pickflow product/
  )
  assert.throws(
    () =>
      resolveCommerce84OrderLines([line], [], [
        {
          productid: 1,
          sku: 'UNKNOWN',
          altsku: null,
          productname: 'Inactive',
          packquantity: 1,
          weight: 5,
          isactive: false,
        },
      ]),
    /not an active Pickflow product/
  )
})
