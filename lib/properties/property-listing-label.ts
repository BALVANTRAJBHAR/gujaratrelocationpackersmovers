import { flowLabelForKey, resolvePropertyFlowKey, type PropertyFlowKey } from '@/lib/properties/wizard-flow';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartment',
  independent_house_villa: 'Independent House/Villa',
  gated_community_villa: 'Gated Community Villa',
  standalone_building: 'Standalone Building',
  plot: 'Plot',
  office_space: 'Office Space',
  co_working: 'Co-working',
  shop: 'Shop',
  showroom: 'Showroom',
  warehouse_godown: 'Godown / Warehouse',
  industrial_shed: 'Industrial Shed',
  industrial_building: 'Industrial Building',
  restaurant_cafe: 'Restaurant / Cafe',
  other_business: 'Other Business',
};

export type PropertyListingLabelInput = {
  title?: string | null;
  property_category?: string | null;
  ad_type?: string | null;
  property_type?: string | null;
  bedrooms?: number | null;
  area_sqft?: number | null;
};

export function bedroomsToBhkLabel(bedrooms: number | null | undefined): string {
  if (bedrooms === null || bedrooms === undefined || !Number.isFinite(Number(bedrooms))) return '';
  const n = Number(bedrooms);
  if (n <= 0) return '1 RK';
  return `${n} BHK`;
}

function formatPropertyTypeLabel(value?: string | null): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (PROPERTY_TYPE_LABELS[v]) return PROPERTY_TYPE_LABELS[v];
  return v
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function resolveFlowKeyFromRow(row: PropertyListingLabelInput): PropertyFlowKey {
  const cat = String(row.property_category ?? 'residential').trim().toLowerCase();
  const propertyCategory =
    cat === 'commercial' || cat === 'land_plot' ? (cat as 'commercial' | 'land_plot') : 'residential';

  const ad = String(row.ad_type ?? 'rent').trim().toLowerCase();
  const adType =
    ad === 'resale' || ad === 'pg_hostel' || ad === 'flatmates' || ad === 'sale'
      ? (ad as 'resale' | 'pg_hostel' | 'flatmates' | 'sale')
      : 'rent';

  return resolvePropertyFlowKey(propertyCategory, adType);
}

/** e.g. "Residential Rent · 1 BHK", "Commercial Rent · Office Space", "Land/Plot · Plot · 1200 sqft" */
export function formatPropertyListingTitle(row: PropertyListingLabelInput): string {
  const flowKey = resolveFlowKeyFromRow(row);
  const flowLabel = flowLabelForKey(flowKey);
  const parts: string[] = [flowLabel];

  if (flowKey === 'land_plot') {
    const typeLabel = formatPropertyTypeLabel(row.property_type);
    if (typeLabel) parts.push(typeLabel);
    const area = row.area_sqft;
    if (area != null && Number.isFinite(Number(area))) {
      parts.push(`${Number(area)} sqft`);
    }
  } else if (flowKey === 'commercial_rent' || flowKey === 'commercial_sale') {
    const typeLabel = formatPropertyTypeLabel(row.property_type);
    if (typeLabel) parts.push(typeLabel);
  } else if (flowKey !== 'pg_hostel') {
    const bhk = bedroomsToBhkLabel(row.bedrooms ?? null);
    if (bhk) parts.push(bhk);
  }

  const built = parts.filter(Boolean).join(' · ');
  const customTitle = String(row.title ?? '').trim();
  if (built) return built;
  if (customTitle && customTitle.toLowerCase() !== 'property') return customTitle;
  return 'Property';
}
