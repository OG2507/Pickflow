# PickFlow — Agent Instructions

Custom warehouse management system for Oceanus Group. Next.js 15 (App Router), Supabase (PostgreSQL), TypeScript. Currently runs locally on localhost:3000. Cloud deployment to Vercel is in progress — do not assume local-only constraints when making architectural decisions.

Read this file before writing any code.

---

## Stack

- **Frontend**: Next.js 15 App Router, React, TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security on all tables
- **Auth**: Supabase Auth
- **Styling**: Custom CSS with CSS variables — **no Tailwind, no component library**
- **Supabase client**: imported from `@/lib/supabase`
- **Types**: defined in `lib/types.ts`

---

## Hard Constraints

### 1. Supabase FK Join Failures — Critical

Supabase's PostgREST layer does not recognise several FK relationships between `tbl` tables. Using join syntax on these will return a **400 error every time**, regardless of how the query is written.

**Confirmed broken relationships:**
- `tblorderlines` → `tblproducts`
- `tblstockmovements` → `tbllocations` (both `fromlocationid` and `tolocationid`)
- `tblstockmovements` → `tblproducts`

**Workaround (always apply):** Fetch related records in separate queries, build a `Map`, resolve in JavaScript. This pattern is used consistently throughout the codebase — follow it.

**Do not attempt to use Supabase join syntax for these relationships.**

**Confirmed working join:** `tblorders` → `tblclients` (used in the Click & Drop route and elsewhere — this one is fine).

### 2. Styling

- Custom CSS variables throughout — always use `var(--colour-name)`, never hardcoded colours
- No inline styles with hardcoded values
- No Tailwind
- CSS class naming convention: `pf-` prefix (e.g. `pf-page`, `pf-card`, `pf-btn-primary`, `pf-table`, `pf-badge`)

### 3. Client Components

All pages are `'use client'` unless there is a specific reason for server rendering.

### 4. Data Fetching

Use `useCallback` on all data fetch functions for proper dependency tracking.

### 5. Error Handling

Always capture Supabase error objects and `console.error` them. Never silently swallow errors.

### 6. Supabase Row Limit

Max rows is set to 10000 in the Supabase dashboard. Do not reduce this.

---

## Database

All tables use the `tbl` prefix. RLS enabled on all tables. Authenticated users have full access.

### Key Tables

| Table | Purpose |
|---|---|
| `tblorders` | All orders (Shopwired and manual wholesale) |
| `tblorderlines` | One row per product per order |
| `tblproducts` | Product catalogue |
| `tblclients` | Clients (wholesale and retail) |
| `tbllocations` | Warehouse locations |
| `tblstocklevels` | Stock quantity per product per location |
| `tblstockmovements` | Audit log of all stock movements |
| `tblpricingcodes` | QuickFile pricing codes |
| `tblcategories` | Product categories |
| `tblshippingrates` | Royal Mail shipping methods and rates |
| `tblshippingmethodmap` | Maps Shopwired delivery method names to Royal Mail service codes |
| `tblsuppliers` | Supplier records |
| `tblproductsuppliers` | Product-to-supplier links |
| `tblproductcomponents` | Components of bundle products |
| `tblsettings` | App-level settings |

### Key Column Notes

**tblorders**
- `status`: New / Picking / Packed / Despatched / Cancelled
- `ordersource`: Manual / Shopwired / eBay
- `externalorderref`: used to prevent duplicate Shopwired imports
- `cadorderid`: Click & Drop order identifier, written back after a successful API push
- `totalweightg`: total order weight in grams, used for Royal Mail label generation

**tblproducts**
- `pickingbintracked`: if true, system auto-deducts stock on Confirm Pick
- `bagsizedefault`: default bag size for overflow stock calculations
- `isbundle`: if true, product has components in `tblproductcomponents`

**tblstocklevels**
- `pickpriority`: 0 = picking bin; higher = lower priority overflow
- `bagsize`: per-location override (0 = use product default)

**tbllocations**
- `locationtype`: `Picking Bin` / `Overflow` / `Despatch` / `Other`
- Bin identification uses `locationtype`, not `pickpriority` — earlier versions used `pickpriority === 0` which was a bug, since fixed

**tblshippingmethodmap**
- `swmethodname`: Shopwired delivery method name (the string Shopwired sends)
- `servicecode`: Royal Mail service code (e.g. `TOLP48`, `TPN24`)

---

## File Map

### Pages

| URL | File |
|---|---|
| `/` | `app/page.tsx` |
| `/orders` | `app/orders/page.tsx` |
| `/orders/[id]` | `app/orders/[id]/page.tsx` |
| `/products` | `app/products/page.tsx` |
| `/products/[id]` | `app/products/[id]/page.tsx` |
| `/clients` | `app/clients/page.tsx` |
| `/clients/[id]` | `app/clients/[id]/page.tsx` |
| `/stock` | `app/stock/page.tsx` |
| `/suppliers` | `app/suppliers/page.tsx` |
| `/suppliers/[id]` | `app/suppliers/[id]/page.tsx` |
| `/purchase-orders` | `app/purchase-orders/page.tsx` |
| `/purchase-orders/[id]` | `app/purchase-orders/[id]/page.tsx` |
| `/reports` | `app/reports/page.tsx` |
| `/admin` | `app/admin/page.tsx` |
| `/login` | `app/login/page.tsx` |

### API Routes

| Route | File |
|---|---|
| `/api/sync-shopwired` | `app/api/sync-shopwired/route.ts` |
| `/api/clickanddrop` | `app/api/clickanddrop/route.ts` |
| `/api/quickfile-export` | `app/api/quickfile-export/route.ts` |
| `/api/quickfile-bulk-export` | `app/api/quickfile-bulk-export/route.ts` |
| `/api/royalmail-export` | `app/api/royalmail-export/route.ts` |
| `/api/royalmail-bulk-export` | `app/api/royalmail-bulk-export/route.ts` |

### Components

| Component | Purpose |
|---|---|
| `Header.tsx` | Navigation bar |
| `StockTabs.tsx` | Tab strip for stock pages |
| `ProductStockPanel.tsx` | Stock levels panel on product detail |
| `ProductSuppliersPanel.tsx` | Supplier links on product detail |
| `ProductComponentsPanel.tsx` | Components panel for bundle products |

---

## Key Business Logic

### Confirm Pick — Stock Movement

Location: `app/orders/[id]/page.tsx`, function `confirmPick`

For each **tracked** order line:
1. Find picking bin using `locationtype === 'Picking Bin'`
2. Find overflow sorted by `tbllocations.pickpriority`
3. Take from bin first up to bin quantity
4. If short, take from overflow in priority order
5. Full bags from overflow: deduct whole bags
6. Partial bags from overflow: deduct full bag, put surplus back into bin
7. Log each deduction/transfer to `tblstockmovements`

For **untracked** products: no automatic movements — return immediately.

For **bundles**: expand to components and run per component.

### Shopwired Sync

File: `app/api/sync-shopwired/route.ts`
- Pagination uses `count` and `offset` (not `limit`/`page`)
- Status filter: `status_id=231566` (Paid only)
- Date filter: `created_after` = 30 days ago
- Order numbers: `JKS-${(orderid + 25746).padStart(5, '0')}`
- Duplicate check on `externalorderref` before inserting

### Products List — Pagination and Filtering

File: `app/products/page.tsx`

- Server-side pagination: 50 rows per page using Supabase `.range()` with `{ count: 'exact' }` for total count
- Filters (search, category, active) are pushed to the Supabase query — not done in memory
- Search uses `.or('sku.ilike.%term%,productname.ilike.%term%')`
- Category dropdown is populated from a separate `tblcategories` query on mount — not derived from the product result set
- `select('*')` must not be used here — only the 8 rendered columns are fetched: `productid, sku, productname, category, salesprice, costprice, vatstatus, isactive`
- Any filter change resets `page` to 0 before the next fetch

### QuickFile and Royal Mail CSV Exports

`tblproducts` join removed from both export routes — schema cache issue. Pricing codes fetched in a separate query using `IN` clause. Apply the same pattern to any new export work.

### Royal Mail Click & Drop API — History and Current State

File: `app/api/clickanddrop/route.ts`

The Click & Drop API integration was previously attempted and abandoned due to persistent 400 errors — root cause was not resolved at that time. The fallback was CSV export (`/api/royalmail-export` and `/api/royalmail-bulk-export`), which downloads a file the user manually imports into Click & Drop.

The API integration is being revisited. The route exists and has a working structure — it builds a payload and POSTs to `https://api.parcel.royalmail.com/api/v1/Orders`.

**Key implementation details:**
- Auth header: `Authorization: <api_key>` (bare key, no Bearer prefix)
- Payload: array of order objects, even for single orders — `JSON.stringify([cadPayload])`
- Service code lookup: checks `tblshippingmethodmap` first (Shopwired method names), falls back to `tblshippingrates` (manual order method names), defaults to `TOLP48` if neither matches
- On success: writes `cadorderid` back to `tblorders`
- eBay orders are skipped — they are managed through Click & Drop directly via the eBay integration

**When debugging 400 errors from the API:**
- Log the full request payload and the full response body — the C&D API returns descriptive error messages
- Check the `Authorization` header format — Royal Mail's API does not use `Bearer`
- Check the `packageFormatIdentifier` value — must be an exact string Royal Mail recognises (e.g. `LargeLetter`, `Parcel`, `SmallParcel`)
- Check `countryCode` is a valid ISO 3166-1 alpha-2 code
- Verify the API key is active in the Click & Drop account settings

---

## Acronyms

| Short | Meaning |
|---|---|
| SW | Shopwired |
| JK | JK's Bargains |
| QF | QuickFile |
| RM | Royal Mail Click and Drop |
| C&D | Click & Drop |
