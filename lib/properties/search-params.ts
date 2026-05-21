/** Empty string must stay empty — `Number('')` is 0 and breaks price/area filters. */
export function parseOptionalFilterNumber(value: string): number | null {
  const raw = String(value ?? '').trim().replace(/,/g, '');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function routeParam(value: string | string[] | undefined): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return String(value).trim();
}

/** Maps UI/search URL ad_type values to DB `properties.ad_type` values. */
export function normalizeAdTypeForSearch(
  rawAdType: string,
  listingType: 'rent' | 'buy' | 'commercial'
): string {
  const ad = String(rawAdType ?? '').trim().toLowerCase();
  if (!ad) return '';

  if (ad === 'full_house') {
    return listingType === 'buy' ? 'resale' : 'rent';
  }

  if (ad === 'pg_hostel' || ad === 'flatmates' || ad === 'rent' || ad === 'resale' || ad === 'sale') {
    return ad;
  }

  return ad;
}

export type AdTypeQuery =
  | { type: 'none' }
  | { type: 'eq'; value: string }
  | { type: 'in'; values: string[] };

/**
 * House Property (Buy/Rent) => residential + DB ad_type rent/resale.
 * PG/Flatmates keep their own ad_type.
 */
export function resolveAdTypeQuery(
  propertyCategory: string,
  listingType: 'rent' | 'buy' | 'commercial',
  rawAdType: string
): AdTypeQuery {
  const category = String(propertyCategory ?? '').trim().toLowerCase();
  const ad = String(rawAdType ?? '').trim().toLowerCase();
  const normalized = normalizeAdTypeForSearch(rawAdType, listingType);

  if (category === 'land_plot') {
    if (listingType === 'buy') return { type: 'eq', value: 'resale' };
    if (normalized) return { type: 'eq', value: normalized };
    return { type: 'none' };
  }

  if (category === 'commercial') {
    if (listingType === 'buy') return { type: 'in', values: ['sale'] };
    if (listingType === 'rent') return { type: 'in', values: ['rent'] };
    if (normalized) return { type: 'eq', value: normalized };
    return { type: 'none' };
  }

  if (category !== 'residential') {
    if (normalized) return { type: 'eq', value: normalized };
    return { type: 'none' };
  }

  if (ad === 'pg_hostel' || ad === 'flatmates') {
    return { type: 'eq', value: ad };
  }

  if (listingType === 'buy') return { type: 'in', values: ['resale'] };
  if (listingType === 'rent') return { type: 'in', values: ['rent'] };

  if (normalized) return { type: 'eq', value: normalized };
  return { type: 'none' };
}

/** Parse BHK CSV like "1 BHK,2 BHK" into bedroom counts for DB filter. */
export function parseBhkBedrooms(bhkCsv: string): number[] {
  const out: number[] = [];
  for (const part of String(bhkCsv ?? '').split(',')) {
    const token = part.trim();
    if (!token) continue;
    const upper = token.toUpperCase();
    if (upper.includes('RK')) {
      out.push(0);
      continue;
    }
    const n = Number(token.split(/\s+/)[0]);
    if (Number.isFinite(n)) out.push(n);
  }
  return Array.from(new Set(out));
}

export function escapePostgrestValue(value: string): string {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/,/g, '\\,');
}

export function collectLocalityTokens(localityValue: string, selectedLocalities: string[]): string[] {
  const fromChips = selectedLocalities.map((x) => String(x ?? '').trim()).filter(Boolean);
  const typed = String(localityValue ?? '').trim();
  if (fromChips.length) return Array.from(new Set(fromChips));
  if (typed) return [typed];
  return [];
}
