// Royal Mail label weight declaration.
//
// Royal Mail rejects a parcel whose ACTUAL weight exceeds the weight declared on
// the label — even though the price is identical right across a rate's weight
// band. To avoid being caught out by an under-declared weight, we declare the
// weight at the TOP of that rate's band (its tblshippingrates.maxweightg) instead
// of the real weight. The cost is unchanged; the label just can never sit under a
// heavier-than-expected parcel.
//
// The band maximum is per shipping rate — a single format like "Medium Parcel" is
// split into several rate rows (e.g. up to 2000g / 10000g / 20000g), each with its
// own maxweightg. Those figures are edited in Admin → Shipping Rates ("Max Weight
// (g)"), so this reads straight from the rate on the order — no separate setting.
//
// Returns the weight (grams) to declare: the rate's maxweightg when set, otherwise
// the order's actual weight (rates with no maximum, e.g. Collection / Over 20kg).
export function declaredWeightGrams(
  maxWeightG: number | null | undefined,
  actualWeightG: number | null | undefined
): number {
  const cap =
    typeof maxWeightG === 'number' && Number.isFinite(maxWeightG) && maxWeightG > 0
      ? maxWeightG
      : null
  const actual =
    typeof actualWeightG === 'number' && Number.isFinite(actualWeightG) && actualWeightG > 0
      ? actualWeightG
      : 0
  return cap ?? actual
}
