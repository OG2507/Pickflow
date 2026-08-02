# Commerce84 order import

Pickflow pulls only server-verified, paid Badge Room orders from Commerce84.
Commerce84 does not write directly to Pickflow's Supabase database.

## Runtime configuration

Set these only in the Pickflow server environment:

```text
COMMERCE84_ORDER_ENDPOINT=https://thebadgeroom.com/api/pickflow/orders
COMMERCE84_ORDER_API_SECRET=<shared machine secret, at least 32 characters>
COMMERCE84_AUTOMATIC_ORDER_SYNC=true
COMMERCE84_ORDER_SYNC_INTERVAL_MS=60000
COMMERCE84_ORDER_SYNC_LIMIT=20
```

The same machine secret is configured on the Commerce84 server as
`PICKFLOW_ORDER_API_SECRET`. It must never be committed or entered in a browser.

## Behaviour

The self-hosted Next.js server starts one poller per server instance. Every
minute it:

1. claims the oldest available paid fulfilment;
2. resolves every website SKU through `tblskumapping` and `tblproducts`;
3. stops before creating an order if any SKU is unknown or inactive;
4. finds or creates the retail client by email;
5. creates one `The Badge Room` order and its lines;
6. reports the Pickflow order ID and number back to Commerce84; and
7. reports later picking, packed, dispatched or cancelled states.

`tblorders.externalorderref` stores the Commerce84 fulfilment ID. Retries first
look up that value, so a lost response cannot create a second Pickflow order.

## Manual run

The protected route below runs the same synchronisation immediately:

```text
POST /api/commerce84/orders/sync
x-commerce84-api-key: <machine secret>
```

Do not expose the response or machine secret in browser-side code.
