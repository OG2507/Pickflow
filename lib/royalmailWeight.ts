// Royal Mail label weight capping.
//
// Royal Mail rejects a parcel whose ACTUAL weight exceeds the weight declared on
// the label — even though the price is identical right across a format's weight
// band. To avoid being caught out by an under-declared weight, we declare the
// weight at the TOP of the parcel-format band instead of the real weight. Cost
// is unchanged; the label just can never sit under a heavier-than-expected parcel.
//
// The three band weights are editable in Admin → Settings ("Royal Mail Label
// Weights") and stored in tblappsettings. The values below are the fallback
// defaults, used when a setting is missing or blank.

export type BandWeights = {
  largeLetter: number
  smallParcel: number
  mediumParcel: number
}

// Fallback defaults — the values PickFlow shipped with before they became editable.
export const DEFAULT_BAND_WEIGHTS: BandWeights = {
  largeLetter: 749,
  smallParcel: 1950,
  mediumParcel: 19500,
}

// tblappsettings keys that hold the editable band weights (grams).
export const BAND_WEIGHT_KEYS = {
  largeLetter: 'RMWeightLargeLetter',
  smallParcel: 'RMWeightSmallParcel',
  mediumParcel: 'RMWeightMediumParcel',
} as const

// Accepts either the raw tblshippingrates.packagesize string ('large letter') or
// the Click & Drop format identifier ('largeLetter'). Returns the capped weight
// in grams, or null for formats we don't cap (caller then uses the real weight).
//
// Pass `overrides` (from getBandWeights) to use the admin-configured values; omit
// it and the shipped DEFAULT_BAND_WEIGHTS apply.
export function bandWeightGrams(
  format: string | null | undefined,
  overrides?: Partial<BandWeights> | null
): number | null {
  const w = { ...DEFAULT_BAND_WEIGHTS, ...(overrides || {}) }
  switch ((format || '').toLowerCase().replace(/\s+/g, '')) {
    case 'largeletter':  return w.largeLetter
    case 'smallparcel':  return w.smallParcel
    case 'mediumparcel': return w.mediumParcel
    default:             return null
  }
}

// Loads the admin-configured band weights from tblappsettings. Any key that is
// missing, blank, non-numeric or <= 0 falls back to the shipped default, so a
// bad/empty setting can never produce a zero-weight label. `client` is any
// Supabase client (service-role in the label routes).
export async function getBandWeights(client: {
  from: (t: string) => any
}): Promise<BandWeights> {
  const result: BandWeights = { ...DEFAULT_BAND_WEIGHTS }
  try {
    const { data, error } = await client
      .from('tblappsettings')
      .select('settingkey, settingvalue')
      .in('settingkey', [
        BAND_WEIGHT_KEYS.largeLetter,
        BAND_WEIGHT_KEYS.smallParcel,
        BAND_WEIGHT_KEYS.mediumParcel,
      ])

    if (error) {
      console.error('[getBandWeights] settings error:', error)
      return result
    }

    for (const row of data || []) {
      const grams = parseInt(String(row.settingvalue ?? '').trim(), 10)
      if (!Number.isFinite(grams) || grams <= 0) continue
      if (row.settingkey === BAND_WEIGHT_KEYS.largeLetter) result.largeLetter = grams
      else if (row.settingkey === BAND_WEIGHT_KEYS.smallParcel) result.smallParcel = grams
      else if (row.settingkey === BAND_WEIGHT_KEYS.mediumParcel) result.mediumParcel = grams
    }
  } catch (err) {
    console.error('[getBandWeights] unexpected error:', err)
  }
  return result
}
