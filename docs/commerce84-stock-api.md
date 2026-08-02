# Commerce84 stock feed

This private endpoint gives Commerce84 a current, read-only Pickflow quantity
for each website SKU:

`POST /api/commerce84/stock`

It is server-to-server only. Set a separate, randomly generated
`COMMERCE84_STOCK_API_SECRET` in Pickflow and send it as:

`x-commerce84-api-key: <secret>`

Request:

```json
{
  "skus": ["11950123", "BADGE-W"]
}
```

Up to 250 unique SKUs may be requested. Pickflow applies `tblskumapping`,
supports alternative SKUs, totals non-negative stock across every location and
converts `-W` lines from units to whole packs.

Response:

```json
{
  "source": "pickflow",
  "observedAt": "2026-08-02T12:00:00.000Z",
  "lines": [
    {
      "websiteSku": "11950123",
      "realSku": "11950123",
      "productId": 42,
      "productName": "Example badge",
      "availableQuantity": 12,
      "stockOnHandUnits": 12,
      "packQuantity": 1,
      "wholesale": false,
      "discontinued": false,
      "found": true
    }
  ]
}
```

Responses are never cached. Unknown SKUs fail closed with `found: false` and an
available quantity of zero.

## Launch boundary

This endpoint supplies live quantities but does not allocate stock. Commerce84
must keep live Stripe disabled until Pickflow has an atomic, expiring
reservation operation that every selling channel respects. A quantity snapshot
alone cannot stop two channels selling the final unit.
