// Royal Mail label weight capping.
//
// Royal Mail rejects a parcel whose ACTUAL weight exceeds the weight declared on
// the label — even though the price is identical right across a format's weight
// band. To avoid being caught out by an under-declared weight, we declare the
// weight at the TOP of the parcel-format band instead of the real weight. Cost
// is unchanged; the label just can never sit under a heavier-than-expected parcel.
//
// Accepts either the raw tblshippingrates.packagesize string ('large letter') or
// the Click & Drop format identifier ('largeLetter'). Returns the capped weight
// in grams, or null for formats we don't cap (caller then uses the real weight).
export function bandWeightGrams(format: string | null | undefined): number | null {
  switch ((format || '').toLowerCase().replace(/\s+/g, '')) {
    case 'largeletter':  return 749
    case 'smallparcel':  return 1950
    case 'mediumparcel': return 19500
    default:             return null
  }
}
