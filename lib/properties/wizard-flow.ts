export type WizardStep =
  | 'basic'
  | 'details'
  | 'pg_room_types'
  | 'pg_room_details'
  | 'location'
  | 'pg_details'
  | 'pricing'
  | 'amenities'
  | 'uploads'
  | 'additional_info'
  | 'schedule'
  | 'review';

export type PropertyFlowKey =
  | 'residential_rent'
  | 'residential_resale'
  | 'pg_hostel'
  | 'flatmates'
  | 'commercial_rent'
  | 'commercial_sale'
  | 'land_plot';

export const STEP_DEFINITIONS: Record<PropertyFlowKey, readonly WizardStep[]> = {
  residential_rent: ['basic', 'details', 'location', 'pricing', 'amenities', 'uploads', 'schedule', 'review'],
  residential_resale: [
    'basic',
    'details',
    'location',
    'pricing',
    'amenities',
    'uploads',
    'additional_info',
    'schedule',
    'review',
  ],
  pg_hostel: ['basic', 'pg_room_types', 'pg_room_details', 'location', 'pg_details', 'amenities', 'uploads', 'schedule', 'review'],
  flatmates: ['basic', 'details', 'location', 'pricing', 'amenities', 'uploads', 'schedule', 'review'],
  commercial_rent: [
    'basic',
    'details',
    'location',
    'pricing',
    'amenities',
    'uploads',
    'additional_info',
    'schedule',
    'review',
  ],
  commercial_sale: [
    'basic',
    'details',
    'location',
    'pricing',
    'amenities',
    'uploads',
    'additional_info',
    'schedule',
    'review',
  ],
  land_plot: ['basic', 'details', 'location', 'pricing', 'amenities', 'uploads', 'additional_info', 'schedule', 'review'],
};

export const STEP_TITLES: Record<WizardStep, string> = {
  basic: 'Basic Information',
  details: 'Property Details',
  pg_room_types: 'Room Types',
  pg_room_details: 'Room Details',
  location: 'Location',
  pg_details: 'PG Details',
  pricing: 'Pricing',
  amenities: 'Amenities & Contact',
  uploads: 'Photos & Videos',
  additional_info: 'Additional Information',
  schedule: 'Schedule & Show Details',
  review: 'Review & Submit',
};

export function resolvePropertyFlowKey(
  propertyCategory: 'residential' | 'commercial' | 'land_plot',
  adType: 'rent' | 'resale' | 'pg_hostel' | 'flatmates' | 'sale'
): PropertyFlowKey {
  if (propertyCategory === 'residential') {
    if (adType === 'rent') return 'residential_rent';
    if (adType === 'resale') return 'residential_resale';
    if (adType === 'pg_hostel') return 'pg_hostel';
    if (adType === 'flatmates') return 'flatmates';
  }
  if (propertyCategory === 'commercial') {
    if (adType === 'rent') return 'commercial_rent';
    if (adType === 'sale') return 'commercial_sale';
  }
  if (propertyCategory === 'land_plot' && adType === 'resale') return 'land_plot';
  return 'residential_rent';
}

export function getFlowSteps(flowKey: PropertyFlowKey): readonly WizardStep[] {
  return STEP_DEFINITIONS[flowKey];
}

export function isStepInFlow(step: WizardStep, flowKey: PropertyFlowKey): boolean {
  return STEP_DEFINITIONS[flowKey].includes(step);
}

export function defaultPropertyTypeForCategory(
  category: 'residential' | 'commercial' | 'land_plot'
): string {
  if (category === 'commercial') return 'office_space';
  if (category === 'land_plot') return 'plot';
  return 'apartment';
}

export function flowLabelForKey(flowKey: PropertyFlowKey): string {
  switch (flowKey) {
    case 'residential_rent':
      return 'Residential Rent';
    case 'residential_resale':
      return 'Residential Resale';
    case 'pg_hostel':
      return 'PG/Hostel';
    case 'flatmates':
      return 'Flatmates';
    case 'commercial_rent':
      return 'Commercial Rent';
    case 'commercial_sale':
      return 'Commercial Sale';
    case 'land_plot':
      return 'Land/Plot';
    default:
      return '';
  }
}
