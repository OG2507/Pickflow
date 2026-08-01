# Stock Availability Messaging — Agreed Spec

Replaces the broken stock-enquiry email form with automatic, approximate availability
wording on the Shopwired site. Never shows exact stock numbers (except deliberate
"Last one/pack" urgency). Retail shows units; wholesale shows whole packs. Discontinued
lines never promise restock or back-order.

## How it flows
- PickFlow computes an availability **message** per website SKU and writes it into a
  Shopwired product **custom field**.
- Delivery: PickFlow generates a CSV → Stephen uploads it to Shopwired (product import).
  (Shopwired's API can't set custom-field values, and imports can't be triggered
  automatically, so the upload is manual/periodic.)
- Shopwired **theme** prints the custom field on the product page — one-time change:
  `{{ product.custom_fields.<name> }}`.
- **Back-orders** (allowing purchase when out of stock) are handled by Shopwired's
  Back Order app — ON for normal lines, OFF for discontinued.

## Inputs (all already in PickFlow)
- Stock on hand (units) per product — from stock levels.
- Pack size — `tblproducts.packquantity` (set on 99.6% of active products).
- Discontinued — `tblproducts.isdiscontinued` (297 active discontinued, 286 on site).
- Retail vs wholesale SKU — `-W` suffix in `tblskumapping` (1,553 wholesale).
- Reorder level is **not** used — messaging uses fixed count blocks.

## The rule
`S` = the channel's count. Retail: units on hand. Wholesale: `floor(units ÷ pack size)`.
Evaluate top-down, first match wins. The "more on the way / back-order" line rides only
on the low bands, and only when **not** discontinued.

### Retail (S = units)
| Units (S) | Not discontinued | Discontinued |
|---|---|---|
| 0 | Zero stock — order now and we'll back-order it for you | Now sold out |
| 1 | Last one — more on the way (need more? we'll back-order it) | Just the last one |
| 2–4 | Less than 5 available — more on the way (need more? we'll back-order) | Less than 5 — once they're gone, they're gone |
| 5–9 | Less than 10 available — more on the way… | Less than 10 — once gone, gone |
| 10–19 | Less than 20 available — more on the way… | Less than 20 — once gone, gone |
| 20–100 | More than 20 available | More than 20 available |
| 101+ | More than 100 available | More than 100 available |

### Wholesale (S = whole packs = floor(units ÷ pack size))
| Packs (S) | Not discontinued | Discontinued |
|---|---|---|
| 0 (less than a full pack) | Out of stock — order now and we'll back-order it for you | Now sold out |
| 1 | Last pack — more on the way (need more? we'll back-order) | Just the last pack |
| 2–4 | Less than 5 packs — more on the way (need more? we'll back-order) | Less than 5 packs — once gone, gone |
| 5–9 | Less than 10 packs — more on the way… | Less than 10 packs — once gone, gone |
| 10+ | More than 10 packs available | More than 10 packs available |

Note: **wholesale hits out-of-stock before retail** — e.g. 15 badges with a pack of 20 =
0 packs (wholesale out of stock / back-order) while retail still shows "Less than 20 available".

## Wording
All message text above is draft — Stephen to finalise in the shop's own voice. Changing
wording later is a PickFlow config change, not a Shopwired one.

## Data cleanup before go-live
- 16 SKU mappings point at a product that no longer exists.
- 8 wholesale SKUs have no pack size set.

## Still to do
1. Shopwired (their side): create the custom field + add one line to the product theme.
2. Confirm the exact Shopwired import CSV column header for that custom field.
3. Build the PickFlow export.
4. Once live, retire the stock-enquiry email form.
