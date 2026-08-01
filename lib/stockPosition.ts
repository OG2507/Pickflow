// Availability wording written to Shopwired's "stock_position" custom field.
//
// Retail listings count individual units; wholesale listings count whole packs
// (units ÷ pack size, floored). The `discontinued` branch never promises "more
// on the way" and never offers a back-order - a discontinued line is finite.
//
// All wording below is the agreed draft - this is the SINGLE place to edit it.
// Change a phrase here and the next export/upload updates the whole site.
//
// Bands (S = the channel's count):
//   S <= 0            out of stock
//   S == 1            last one / last pack
//   2..4              "less than 5"
//   5..9              "less than 10"
//   10..19  (retail)  "less than 20"
//   20..100 (retail)  "more than 20"
//   101+    (retail)  "more than 100"
//   10+    (wholesale)"more than 10 packs"

export function retailStockPosition(units: number, discontinued: boolean): string {
  if (units <= 0) {
    return discontinued
      ? 'Now sold out'
      : "Zero stock - order now and we'll back-order it for you"
  }
  if (discontinued) {
    if (units === 1)   return 'Just the last one'
    if (units <= 4)    return "Less than 5 left - once they're gone, they're gone"
    if (units <= 9)    return "Less than 10 left - once they're gone, they're gone"
    if (units <= 19)   return "Less than 20 left - once they're gone, they're gone"
    if (units <= 100)  return 'More than 20 available'
    return 'More than 100 available'
  }
  if (units === 1)     return 'Last one, but more on the way'
  if (units <= 4)      return 'Less than 5 available - more on the way'
  if (units <= 9)      return 'Less than 10 available - more on the way'
  if (units <= 19)     return 'Less than 20 available - more on the way'
  if (units <= 100)    return 'More than 20 available'
  return 'More than 100 available'
}

export function wholesaleStockPosition(packs: number, discontinued: boolean): string {
  if (packs <= 0) {
    return discontinued
      ? 'Now sold out'
      : "Out of stock - order now and we'll back-order it for you"
  }
  if (discontinued) {
    if (packs === 1)   return 'Just the last pack'
    if (packs <= 4)    return "Less than 5 packs - once they're gone, they're gone"
    if (packs <= 9)    return "Between 5 and 10 packs available - once they're gone, they're gone"
    return 'More than 10 packs available'
  }
  if (packs === 1)     return 'Last pack, but more on the way'
  if (packs <= 4)      return 'Less than 5 packs - more on the way'
  if (packs <= 9)      return 'Between 5 and 10 packs available - more on the way'
  return 'More than 10 packs available'
}
