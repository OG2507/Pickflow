# PickFlow — Agent Instructions

Custom warehouse management system for Oceanus Group (JK's Bargains). Next.js 16 (App Router), React 19, Supabase (PostgreSQL), TypeScript. Built and run by Stephen Hackett, a solo operator with a business background and no formal dev training — he tests in the running app and catches logic errors through real-world use. Be direct, read the actual code before suggesting anything, and don't re-litigate decisions already made.

**Read this file before writing any code.** It is the source of truth — kept ahead of the `/docs` Word files and any external notes, which lag behind.

---

## Current status (June 2026)

- Runs locally on `localhost:3000`. **Going live is imminent.**
- **The database does not move.** Supabase is already cloud-hosted (project ref `svzrvgwqdeshqsagzlfc`). "Going online" means deploying the *app*; it points at the same Supabase via env vars.
- Current deployment plan: self-hosted server at `jks.pickflow.co.uk` (Vercel was previously considered). Outstanding go-live work: production env vars, Supabase **auth redirect URLs**, and an **RLS review for public internet exposure**.
- Two dev machines (PC primary at `C:\Git\pickflow`, plus a laptop), kept in sync via Git. Anything that must survive across machines and sessions belongs in the repo, not in app memory.

---

## Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Database**: Supabase (PostgreSQL), Row Level Security on all tables (authenticated users have full access)
- **Auth**: Supabase Auth (`@supabase/ssr`) — see `middleware.ts`
- **Styling**: Custom CSS with CSS variables, `pf-` prefix — **no Tailwind in active use, no component library**
- **Supabase client**: imported from `@/lib/supabase`
- **Types**: `lib/types.ts`
- **Dev server**: `npm run dev` (runs `next dev --turbopack`)

---

## Hard Constraints

### 1. Supabase FK join failures — critical
PostgREST does not recognise several FK relationships between `tbl` tables. Join syntax on these returns a **400 error every time**, however the query is written.

**Confirmed broken** (always use the Map pattern instead):
- `tblorderlines` → `tblproducts`
- `tblstockmovements` → `tbllocations` (both `fromlocationid` and `tolocationid`)
- `tblstockmovements` → `tblproducts`

**Map pattern (the established convention everywhere):** fetch related rows in a separate query (`.in('id', [...])`), build a `Map<id, value>`, resolve the join in JavaScript.

**Confirmed working join:** `tblorders` → `tblclients` is fine.

### 2. Styling
Custom CSS variables only — always `var(--colour-name)`, never hardcoded colours, no inline hardcoded styles, no Tailwind. Class convention: `pf-` prefix (`pf-page`, `pf-card`, `pf-btn-primary`, `pf-table`, `pf-badge`, `pf-input`, `pf-filters` etc.).

### 3. Client components
All pages are `'use client'` unless there is a specific reason for server rendering.

### 4. Data fetching
`useCallback` on all fetch functions. Never `select('*')` on list pages — fetch only the columns rendered. Use `Promise.all` for parallel fetches; server-side pagination with `.range()` and `{ count: 'exact' }` for large lists; load-once-then-filter-locally with `useMemo` for search-heavy pages.

### 5. Error handling
Always capture Supabase error objects and `console.error` them. Never silently swallow errors.

### 6. Supabase row limit
Max rows is set to 10000 in the dashboard. Do not reduce it — historical imports and large stock queries depend on it.

---

## Database

All live tables use the `tbl` prefix, lowercase. RLS enabled on all; authenticated full access.

**Schema-script warning:** the SQL files in `/database` (`PickFlow_Database_Creation_v3.1.sql` etc.) are a partial redesign and do **not** fully match the live database. They define `tblauditlog`, `tblroles`, `tblbundles`/`tblbundlecomponents`, `tblbackorders` and others that the running app does **not** use. The truth for live table/column names is the code's actual `.from()` calls, not these scripts. This matters for the future productisation migration script — build it from the live schema, not from v3.1.

### Live tables (confirmed from code queries)

| Table | Purpose |
|---|---|
| `tblorders` | All orders (Shopwired, eBay, manual wholesale) |
| `tblorderlines` | One row per product per order |
| `tblproducts` | Product catalogue |
| `tblclients` | Clients (wholesale and retail) |
| `tbllocations` | Warehouse locations |
| `tblstocklevels` | Stock quantity per product per location |
| `tblstockmovements` | Audit log of all stock movements |
| `tblpurchaseorders` | Purchase orders |
| `tblpurchaseorderlines` | PO lines |
| `tblsuppliers` | Suppliers |
| `tblproductsuppliers` | Product-to-supplier links |
| `tblproductcomponents` | Components of bundle products |
| `tblcategories` / `tblsubcategories` | Product categories |
| `tblpricingcodes` | QuickFile pricing codes |
| `tblclientpricing` | Client/price-band pricing |
| `tblshippingrates` | Royal Mail methods, weight bands, package sizes |
| `tblshippingmethodmap` | Maps Shopwired delivery names → RM service codes |
| `tblskumapping` | Website SKU → real SKU mapping |
| `tblappsettings` | App-level settings (company name, VAT, order prefix, QuickFile creds, `CompanyLogo` public URL) |
| `tblusers` | System users |
| `tblpermissions` | Master list of permission keys |
| `tbluserpermissions` | Per-user permission assignments (`userid`, `permissionkey`) |
| `tblactivitylog` | Application activity log (NOT `tblauditlog`) |
| `tblsessionlog` | Login/logout audit |

### Key column notes

**tblorders**
- `status`: **New → Printed → Picking → Dispatched → Invoiced → Completed** (plus **Cancelled**). Note the spelling is `Dispatched` with an `i` — an earlier `confirmPick` wrote `Despatched`, which broke the QuickFile button visibility; fixed and standardised on `Dispatched`.
- `ordersource`: Manual / Shopwired / eBay; `isebay`: boolean
- `externalorderref`: prevents duplicate Shopwired/eBay imports
- `isbackorder` / `parentorderid`: backorder child orders (see Business Logic)
- `cadorderid`: Click & Drop order id, written back after a successful API push
- `totalweightg`: total order weight (grams), for RM label generation
- `quickfileexportedat` / `royalmailexportedat`: export timestamps
- `despatchdate`: set on Confirm Pick

**tblproducts**
- `pickingbintracked`: if true, system auto-deducts stock on Confirm Pick
- `bagsizedefault`: default bag size for overflow calculations
- `isbundle`: components live in `tblproductcomponents`
- `altsku`: alternative SKU (PR-code) for search — wired into products list, order detail, PO detail, reports
- `isactive` / `isdiscontinued`; `costprice` (drives margin display; some products lack it — see AVCO on roadmap)
- `barcode`: present, largely unpopulated (for future barcode scanning)

**tblstocklevels**
- `pickpriority`: 0 = picking bin; higher = lower-priority overflow
- `bagsize`: per-location override (0 = use product default)
- `lastchecked`: stamped on stock checks / verified-correct counts (even when quantity unchanged)
- (`allocated` is **planned, not built** — see roadmap)

**tbllocations**
- `locationtype`: `Picking Bin` / `Overflow` / `Despatch` / `Other`
- **Bin identification uses `locationtype === 'Picking Bin'`, NOT `pickpriority === 0`** — the latter was a historical bug, fixed.

**tblshippingmethodmap**: `swmethodname` (Shopwired string) → `servicecode` (RM code, e.g. `TOLP48`).

---

## File Map

### Pages
| URL | File |
|---|---|
| `/` | `app/page.tsx` (dashboard) |
| `/orders` | `app/orders/page.tsx` |
| `/orders/new` | `app/orders/new/page.tsx` |
| `/orders/[id]` | `app/orders/[id]/page.tsx` (detail, picking list, confirm pick) |
| `/products` | `app/products/page.tsx` |
| `/products/new` | `app/products/new/page.tsx` |
| `/products/[id]` | `app/products/[id]/page.tsx` |
| `/clients` | `app/clients/page.tsx` |
| `/clients/new` | `app/clients/new/page.tsx` |
| `/clients/[id]` | `app/clients/[id]/page.tsx` |
| `/suppliers` | `app/suppliers/page.tsx` (+ `/new`, `/[id]`) |
| `/purchase-orders` | `app/purchase-orders/page.tsx` (+ `/new`, `/[id]`) |
| `/stock` | `app/stock/page.tsx` (tabbed: Stock/Move/Adjust/Movements) |
| `/stock/move` | `app/stock/move/page.tsx` |
| `/stock/adjustment` | `app/stock/adjustment/page.tsx` |
| `/stock/movements` | `app/stock/movements/page.tsx` |
| `/stock/reorder` | `app/stock/reorder/page.tsx` |
| `/stock/check` | `app/stock/check/page.tsx` |
| `/stock/bulkcheck` | `app/stock/bulkcheck/page.tsx` (location range + type filter, tab/Enter nav, `lastchecked` stamping) |
| `/stock/cyclecount` | `app/stock/cyclecount/page.tsx` |
| `/reports` | `app/reports/page.tsx` (all report tabs in one file) |
| `/tools` | `app/tools/page.tsx`; `/tools/order-converter` |
| `/admin` | `app/admin/page.tsx` |
| `/admin/settings` | `app/admin/settings/page.tsx` (incl. QuickFile section) |
| `/admin/locations` | `app/admin/locations/page.tsx` (server-side pagination, `.ilike()` 300ms debounce) |
| `/admin/categories`, `/admin/price-bands`, `/admin/shipping-rates`, `/admin/delivery-map`, `/admin/users`, `/admin/activity` | corresponding files under `app/admin/` |
| `/login` | `app/login/page.tsx` |

### API routes
| Route | File | Notes |
|---|---|---|
| `/api/sync-shopwired` | `app/api/sync-shopwired/route.ts` | |
| `/api/clickanddrop` | `app/api/clickanddrop/route.ts` | RM Click & Drop direct API (built) |
| `/api/quickfile-export` | `app/api/quickfile-export/route.ts` | CSV (single) |
| `/api/quickfile-bulk-export` | `app/api/quickfile-bulk-export/route.ts` | CSV (bulk) |
| `/api/royalmail-export` | `app/api/royalmail-export/route.ts` | CSV |
| `/api/admin/create-user` | `app/api/admin/create-user/route.ts` | |

> There is **no** `quickfile-push` route and **no** `royalmail-bulk-export` route in the repo, despite older notes. QuickFile direct API is on the roadmap, not built (see below).

### Components
| Component | Purpose |
|---|---|
| `Header.tsx` | Grouped nav (Orders / Catalogue / Products-Suppliers-POs / Stock / Sales-Quotes-Clients / More). CSS hover + `:focus-within` dropdowns, mobile hamburger at 1024px. |
| `Footer.tsx` | Footer |
| `StockTabs.tsx` | Tab strip on stock pages |
| `ProductStockPanel.tsx` | Stock levels panel on product detail; includes **Swap Bin** (swap picking-bin location ids between two products via UI) |
| `ProductSuppliersPanel.tsx` | Supplier links on product detail |
| `ProductComponentsPanel.tsx` | Components panel for bundles |
| `ProductOnOrderPanel.tsx` | Active PO lines (Draft/Sent/Partial, outstanding qty > 0) on product detail |
| `OrderUploadPanel.tsx` | xlsx/csv/paste order import: header auto-detect, case-insensitive SKU match, OK/unmatched/inactive/badqty/duplicate preview, reuses `getClientPrice`, bulk insert + activity log |

### lib
| File | Purpose |
|---|---|
| `supabase.ts` | Supabase client |
| `types.ts` | Shared types |
| `activity.ts` | `logActivity`, `logChanges` → `tblactivitylog` |
| `usePermissions.ts` | `usePermissions()` → `can(key)`, `isAdmin`; reads `tbluserpermissions`, module-cached per user |
| `useCategories.ts` / `usePriceBands.ts` | Lookup hooks |

---

## Key Business Logic

### Confirm Pick — stock movement
`app/orders/[id]/page.tsx`, `confirmPick`. For each **tracked** line:
1. Find picking bin via `locationtype === 'Picking Bin'`
2. Find overflow sorted by `tbllocations.pickpriority`
3. Take from bin up to bin quantity; if short, take from overflow in priority order
4. Full bags from overflow: deduct whole bags
5. Partial bags: deduct a full bag, put surplus back into the bin (partial deduction only fires when `remaining < bagsize` AND `ovfQtyRemaining >= bagsize`; otherwise continue to the next overflow location — historical loop bug, fixed)
6. Log each deduction/transfer to `tblstockmovements`

**Untracked** products: no automatic movements, return immediately. **Bundles**: expand to components and run per component.

**Double-click guard:** `confirmPick` uses a `useRef`-based in-flight lock (`pickInFlight`) with try/catch/finally, and disables modal buttons during processing. Use the ref-based guard (not just state) on any critical operation to prevent synchronous re-entry.

### Backorder system
Confirm Pick intercepts shortfalls with a modal and creates `[ordernumber]-BO1` child orders (`isbackorder`, `parentorderid` on `tblorders`). BO badge in the orders list; parent/child banners on detail. PO receipt flags open backorders for received products.

### Shopwired sync
`app/api/sync-shopwired/route.ts`: pagination via `count`/`offset` (not `limit`/`page`); status filter `status_id=231566` (Paid); `created_after` = 30 days ago; order numbers `JKS-${(orderid + 25746).padStart(5,'0')}` (uses `swOrder.reference` when present, falls back to `JKS`); duplicate check on `externalorderref` before insert.

### SKU mapping chain
Website SKU → `tblskumapping` → real SKU → `tblstocklevels` → location. `-W` suffix SKUs must have a `tblskumapping` entry or sync fails silently.

### QuickFile / Royal Mail CSV exports
`tblproducts` join removed (schema cache) — pricing codes fetched separately with an `IN` clause; same Map pattern for any new export work. Standard-rate VAT lines multiply `linetotal` by 1.2 for gross; shipping is a separate row; export timestamp written on completion. **QuickFile export requires the client to have a QuickFile account reference set.**

### Click & Drop API
`app/api/clickanddrop/route.ts`. POSTs to `https://api.parcel.royalmail.com/api/v1/Orders`. Auth header is the **bare key** (`Authorization: <key>`, no `Bearer`). Body is `{ "items": [...] }`; `recipient` requires a nested `address` with `fullName`; `serviceCode` inside `postageDetails`; `countryCode` ISO 3166-1 alpha-2; `packageFormatIdentifier` mapped from `tblshippingrates.packagesize`. Email + SMS notifications enabled. Writes `cadorderid` back on success; eBay orders are skipped. The API returns generic 400s — debug by logging full payload + response body and eliminating fields one at a time.

### Permissions & cost visibility
Order-detail cost/margin display is gated on the `orders.viewcost` permission. Margin summary bar is colour-coded (red <20%, amber 20–40%, green >40%). Cost data comes from a separate `tblproducts` query (Map pattern).

### Activity logging
`lib/activity.ts` (`logActivity`, `logChanges`) → `tblactivitylog`. Wired into product/new-product edits, clients, settings, price bands, and orders (status transitions, header edits, line add/update/remove, new order). Pass 3 (categories, locations, shipping rates, suppliers) still pending.

---

## Patterns & gotchas

- **Map pattern** for the broken FK joins above — non-negotiable.
- **Bin = `locationtype`**, never `pickpriority === 0`.
- **Turbopack cache:** unexplained 404s / broken routes in dev are usually stale cache — clear `.next` (`rd /s /q .next`) and restart before debugging code.
- **Quantity inputs:** save on `onBlur` (not `onChange`); `onFocus` auto-selects the value.
- **CSV downloads:** fetch-based with `appendChild`/`removeChild` around `.click()` — `<a href download>` gets intercepted by the Next.js router.
- **Supabase Storage RLS:** one `FOR ALL TO authenticated` policy. Separate INSERT/UPDATE policies fail on upload; no SELECT policy needed on public buckets.
- **Supabase SQL editor:** use single-statement CTE (`WITH`) blocks — `CREATE TEMP TABLE` does not persist between executions.

---

## Not yet built / roadmap

- **QuickFile direct API** *(next job; had problems previously)*: replace CSV with a `quickfile-push` route. Known design from prior work: MD5 auth = hash of account number + API key + submission reference; `Invoice_Create` endpoint; client lookup by account reference; draft invoices preferred for review. **Not in the repo currently.**
- **Stock allocation** *(do NOT build mid-week during live picking)*: `allocated` column on `tblstocklevels`; picking uses `quantityonhand - allocated`; print sets allocations, Confirm Pick consumes, Cancel clears. Solves simultaneous-print double-claiming.
- **eBay stock sync**: `ebaylistingid` / `ebaymaxquantity` / `ebayactive` on `tblproducts`; quantity push via eBay Inventory API on Confirm Pick / adjust / PO receipt.
- **Barcode scanning / offline picker** `/pick/[orderid]`: Code 128 bin labels, populate `tblproducts.barcode`, offline cache + sync, visual/audio feedback.
- **AVCO indicator** for products missing `costprice`.
- **Activity logging pass 3** + click-through and human-readable field names.
- **Going live**: production env vars, Supabase auth redirect URLs, RLS review for public exposure.
- **Productisation**: per-client subdomain + separate Supabase project. The enabling piece is a clean schema migration script — build it from the **live** schema, not `/database/*v3.1.sql`.

---

## Conventions & workflow

- **Editing files:** prefer Python inline scripts via the shell with an `assert content.count(old) == 1` guard (whitespace makes the plain string-replace tools unreliable here).
- **TypeScript check:** `npx tsc --noEmit --skipLibCheck`, grep-filtering known pre-existing errors (`TS2307`, `TS7026`, `TS2875`, `TS7031`, `TS7006`) to isolate new ones.
- **File delivery:** always provide modified files for download after a change, without being asked.
- **Git:** Stephen pushes from his own machine. Remind him to commit/push at session end with a suggested message.
- **Staff principle:** warehouse staff must never need direct DB access — every operation reachable through the UI.

## Acronyms
| Short | Meaning |
|---|---|
| SW | Shopwired | 
| JK | JK's Bargains |
| QF | QuickFile |
| RM / C&D | Royal Mail Click & Drop |
