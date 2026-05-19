import type { SupabaseClient } from '@supabase/supabase-js';

/** Loads an owned property + media URLs for the post wizard edit flow. */
export async function loadPropertyForEdit(
  supabase: SupabaseClient,
  propertyId: string,
  ownerUserId: string
): Promise<{ row: Record<string, unknown>; photoUrls: string[]; videoUrls: string[] } | null> {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();

  if (error || !data) return null;

  const { data: uploads } = await supabase
    .from('property_uploads')
    .select('file_url,file_type')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: true });

  const photoUrls: string[] = [];
  const videoUrls: string[] = [];

  for (const u of (uploads as any[]) ?? []) {
    const url = String(u?.file_url ?? '').trim();
    if (!url) continue;
    const type = String(u?.file_type ?? '').toLowerCase();
    if (type.includes('video') || type.includes('mp4')) videoUrls.push(url);
    else photoUrls.push(url);
  }

  return { row: data as Record<string, unknown>, photoUrls, videoUrls };
}

export type PropertyFormHydration = {
  propertyCategory: 'residential' | 'commercial' | 'land_plot';
  adType: 'rent' | 'resale' | 'pg_hostel' | 'flatmates' | 'sale';
  listingType: 'rent' | 'buy' | 'commercial';
  propertyType: string;
  title: string;
  description: string;
  price: string;
  deposit: string;
  maintenance: string;
  bedrooms: string;
  bathrooms: string;
  balconies: number;
  areaSqft: string;
  carpetAreaSqft: string;
  furnishing: string;
  parking: string;
  stateValue: string;
  cityValue: string;
  localityValue: string;
  address1: string;
  address2: string;
  pincode: string;
  mapPickerCoord: { lat: number; lng: number } | null;
  contactName: string;
  contactPhone: string;
  whoWillShowProperty: string;
  currentPropertyCondition: string;
  directionTip: string;
  waterSupply: string;
  monthlyMaintenanceType: '' | 'included' | 'extra';
  rentNegotiable: boolean;
  depositNegotiable: boolean;
  petAllowed: 0 | 1 | null;
  gym: 0 | 1 | null;
  nonVegAllowed: 0 | 1 | null;
  gatedSecurity: 0 | 1 | null;
  moreSimilarUnitsAvailable: 0 | 1 | null;
  amenityLift: 0 | 1 | null;
  amenityInternetServices: 0 | 1 | null;
  amenityAirConditioner: 0 | 1 | null;
  amenityClubHouse: 0 | 1 | null;
  amenityIntercom: 0 | 1 | null;
  amenitySwimmingPool: 0 | 1 | null;
  amenityChildrenPlayArea: 0 | 1 | null;
  amenityFireSafety: 0 | 1 | null;
  amenityServantRoom: 0 | 1 | null;
  amenityShoppingCenter: 0 | 1 | null;
  amenityGasPipeline: 0 | 1 | null;
  amenityPark: 0 | 1 | null;
  amenityRainWaterHarvesting: 0 | 1 | null;
  amenitySewageTreatmentPlant: 0 | 1 | null;
  amenityHouseKeeping: 0 | 1 | null;
  amenityPowerBackup: 0 | 1 | null;
  amenityVisitorParking: 0 | 1 | null;
};

function str(v: unknown) {
  return String(v ?? '').trim();
}

function numStr(v: unknown) {
  const n = v === null || v === undefined || v === '' ? '' : String(v);
  return n;
}

function yn(v: unknown): 0 | 1 | null {
  if (v === 0 || v === 1) return v;
  if (v === true) return 1;
  if (v === false) return 0;
  return null;
}

export function hydratePropertyForm(row: Record<string, unknown>): PropertyFormHydration {
  const cat = str(row.property_category) as PropertyFormHydration['propertyCategory'];
  const propertyCategory =
    cat === 'commercial' || cat === 'land_plot' ? cat : 'residential';

  const ad = str(row.ad_type) as PropertyFormHydration['adType'];
  const adType =
    ad === 'resale' || ad === 'pg_hostel' || ad === 'flatmates' || ad === 'sale' ? ad : 'rent';

  const lt = str(row.listing_type) as PropertyFormHydration['listingType'];
  const listingType = lt === 'buy' || lt === 'commercial' ? lt : 'rent';

  const lat = row.latitude;
  const lng = row.longitude;
  const mapPickerCoord =
    typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : null;

  return {
    propertyCategory,
    adType,
    listingType,
    propertyType: str(row.property_type) || 'apartment',
    title: str(row.title),
    description: str(row.description),
    price: numStr(row.price),
    deposit: numStr(row.deposit),
    maintenance: numStr(row.maintenance),
    bedrooms: numStr(row.bedrooms),
    bathrooms: numStr(row.bathrooms),
    balconies: typeof row.balconies === 'number' ? row.balconies : 0,
    areaSqft: numStr(row.area_sqft),
    carpetAreaSqft: numStr(row.carpet_area_sqft),
    furnishing: str(row.furnishing) || 'semi_furnished',
    parking: str(row.parking) || 'none',
    stateValue: str(row.state) || 'Gujarat',
    cityValue: str(row.city) || 'Ahmedabad',
    localityValue: str(row.locality),
    address1: str(row.address_line1),
    address2: str(row.address_line2),
    pincode: str(row.pincode),
    mapPickerCoord,
    contactName: str(row.contact_name),
    contactPhone: str(row.contact_phone),
    whoWillShowProperty: str(row.who_will_show_property),
    currentPropertyCondition: str(row.current_property_condition),
    directionTip: str(row.direction_tip),
    waterSupply: str(row.water_supply) as PropertyFormHydration['waterSupply'],
    monthlyMaintenanceType: row.maintenance_extra === true ? 'extra' : row.maintenance_extra === false ? 'included' : '',
    rentNegotiable: row.rent_negotiable === true,
    depositNegotiable: row.deposit_negotiable === true,
    petAllowed: yn(row.pet_allowed),
    gym: yn(row.gym),
    nonVegAllowed: yn(row.non_veg_allowed),
    gatedSecurity: yn(row.gated_security),
    moreSimilarUnitsAvailable: yn(row.more_similar_units_available),
    amenityLift: yn(row.amenity_lift),
    amenityInternetServices: yn(row.amenity_internet_services),
    amenityAirConditioner: yn(row.amenity_air_conditioner),
    amenityClubHouse: yn(row.amenity_club_house),
    amenityIntercom: yn(row.amenity_intercom),
    amenitySwimmingPool: yn(row.amenity_swimming_pool),
    amenityChildrenPlayArea: yn(row.amenity_children_play_area),
    amenityFireSafety: yn(row.amenity_fire_safety),
    amenityServantRoom: yn(row.amenity_servant_room),
    amenityShoppingCenter: yn(row.amenity_shopping_center),
    amenityGasPipeline: yn(row.amenity_gas_pipeline),
    amenityPark: yn(row.amenity_park),
    amenityRainWaterHarvesting: yn(row.amenity_rain_water_harvesting),
    amenitySewageTreatmentPlant: yn(row.amenity_sewage_treatment_plant),
    amenityHouseKeeping: yn(row.amenity_house_keeping),
    amenityPowerBackup: yn(row.amenity_power_backup),
    amenityVisitorParking: yn(row.amenity_visitor_parking),
  };
}
