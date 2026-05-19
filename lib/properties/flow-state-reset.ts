import type { PropertyFlowKey } from '@/lib/properties/wizard-flow';

/** Clears form slices that do not belong to the active flow (prevents review/UI mismatch). */
export type FlowStateResetApi = {
  setPropertyType: (v: string) => void;
  setCommercialBuildingType: (v: string) => void;
  setCommercialOnMainRoad: (v: boolean) => void;
  setCommercialCornerProperty: (v: boolean) => void;
  setPgRoomSingle: (v: boolean) => void;
  setPgRoomDouble: (v: boolean) => void;
  setPgRoomThree: (v: boolean) => void;
  setPgRoomFour: (v: boolean) => void;
  setPgActiveRoom: (v: 'single' | 'double' | 'three' | 'four') => void;
  setPgSingleRent: (v: string) => void;
  setPgSingleDeposit: (v: string) => void;
  setPgDoubleRent: (v: string) => void;
  setPgDoubleDeposit: (v: string) => void;
  setPgThreeRent: (v: string) => void;
  setPgThreeDeposit: (v: string) => void;
  setPgFourRent: (v: string) => void;
  setPgFourDeposit: (v: string) => void;
  setPgSingleAmenityCupboard: (v: boolean) => void;
  setPgSingleAmenityTv: (v: boolean) => void;
  setPgSingleAmenityBedding: (v: boolean) => void;
  setPgSingleAmenityGeyser: (v: boolean) => void;
  setPgSingleAmenityAc: (v: boolean) => void;
  setPgSingleAmenityAttachedBathroom: (v: boolean) => void;
  setPgDoubleAmenityCupboard: (v: boolean) => void;
  setPgDoubleAmenityTv: (v: boolean) => void;
  setPgDoubleAmenityBedding: (v: boolean) => void;
  setPgDoubleAmenityGeyser: (v: boolean) => void;
  setPgDoubleAmenityAc: (v: boolean) => void;
  setPgDoubleAmenityAttachedBathroom: (v: boolean) => void;
  setPgThreeAmenityCupboard: (v: boolean) => void;
  setPgThreeAmenityTv: (v: boolean) => void;
  setPgThreeAmenityBedding: (v: boolean) => void;
  setPgThreeAmenityGeyser: (v: boolean) => void;
  setPgThreeAmenityAc: (v: boolean) => void;
  setPgThreeAmenityAttachedBathroom: (v: boolean) => void;
  setPgFourAmenityCupboard: (v: boolean) => void;
  setPgFourAmenityTv: (v: boolean) => void;
  setPgFourAmenityBedding: (v: boolean) => void;
  setPgFourAmenityGeyser: (v: boolean) => void;
  setPgFourAmenityAc: (v: boolean) => void;
  setPgFourAmenityAttachedBathroom: (v: boolean) => void;
  setPgPlaceAvailableFor: (v: 'male' | 'female' | 'anyone' | '') => void;
  setPgPreferredGuests: (v: 'working_professional' | 'student' | 'both' | '') => void;
  setPgAvailableFromDate: (v: Date | null) => void;
  setPgAvailableFromText: (v: string) => void;
  setPgFoodIncluded: (v: 'yes' | 'no' | '') => void;
  setPgMealBreakfast: (v: boolean) => void;
  setPgMealLunch: (v: boolean) => void;
  setPgMealDinner: (v: boolean) => void;
  setPgRuleNoSmoking: (v: boolean) => void;
  setPgRuleNoGuardianStay: (v: boolean) => void;
  setPgRuleNoOppositeEntry: (v: boolean) => void;
  setPgRuleNoDrinking: (v: boolean) => void;
  setPgRuleNoNonVeg: (v: boolean) => void;
  setPgGateClosingTime: (v: Date | null) => void;
  setPgDescription: (v: string) => void;
  setPgLaundryAvailable: (v: 0 | 1 | null) => void;
  setPgRoomCleaningAvailable: (v: 0 | 1 | null) => void;
  setPgWardenFacilityAvailable: (v: 0 | 1 | null) => void;
  setPgAmenityCommonTv: (v: boolean) => void;
  setPgAmenityLift: (v: boolean) => void;
  setPgAmenityWifi: (v: boolean) => void;
  setPgAmenityPowerBackup: (v: boolean) => void;
  setPgAmenityMess: (v: boolean) => void;
  setPgAmenityRefrigerator: (v: boolean) => void;
  setPgAmenityCookingAllowed: (v: boolean) => void;
  setFlatmatesRoomType: (v: 'single_room' | 'shared_room' | '') => void;
  setFlatmatesTenantType: (v: 'male' | 'female' | '') => void;
  setFlatmatesAttachedBathroom: (v: 0 | 1 | null) => void;
  setFlatmatesBathroomType: (v: 'private' | 'shared' | '') => void;
  setFlatmatesAcRoom: (v: 0 | 1 | null) => void;
  setFlatmatesBalcony: (v: 0 | 1 | null) => void;
  setFlatmatesSmokingAllowed: (v: 0 | 1 | null) => void;
  setFlatmatesDrinkingAllowed: (v: 0 | 1 | null) => void;
  setApartmentType: (
    v: 'apartment' | 'independent_house_villa' | 'gated_community_villa' | 'standalone_building'
  ) => void;
  setApartmentName: (v: string) => void;
  setBhkType: (v: string) => void;
  setOwnershipType: (v: 'on_lease' | 'self_owned' | '') => void;
  setLeaseYears: (v: string) => void;
  setFloor: (v: string) => void;
  setTotalFloors: (v: string) => void;
  setPropertyAge: (v: string) => void;
  setFacing: (v: string) => void;
  setPrice: (v: string) => void;
  setDeposit: (v: string) => void;
  setMaintenance: (v: string) => void;
  setDepositNegotiable: (v: boolean) => void;
  setCommercialLeaseDurationYears: (v: string) => void;
  setCommercialLockinPeriodYears: (v: string) => void;
  setCommercialIdealForTags: (v: string[]) => void;
  setCommercialIdealForInput: (v: string) => void;
  setPropertyAvailableFor: (v: 'only_rent' | 'only_lease') => void;
  setRentNegotiable: (v: boolean) => void;
  setCurrentlyUnderLoan: (v: boolean) => void;
  setKitchenType: (v: 'modular' | 'cupboard_shelf' | 'open_shelf' | '') => void;
  setMonthlyMaintenanceType: (v: 'included' | 'extra' | '') => void;
  setMaintenanceAmount: (v: string) => void;
  setAvailableFromDate: (v: Date | null) => void;
  setAvailableFromText: (v: string) => void;
  setPreferredAnyone: (v: boolean) => void;
  setPreferredFamily: (v: boolean) => void;
  setPreferredBachelorFemale: (v: boolean) => void;
  setPreferredBachelorMale: (v: boolean) => void;
  setPreferredCompany: (v: boolean) => void;
  setBedrooms: (v: string) => void;
  setBathrooms: (v: string) => void;
  setAreaSqft: (v: string) => void;
  setCarpetAreaSqft: (v: string) => void;
  setPlotAreaSqft: (v: string) => void;
  setPlotLengthFt: (v: string) => void;
  setPlotWidthFt: (v: string) => void;
  setBoundaryWall: (v: 0 | 1 | null) => void;
  setFloorsAllowed: (v: string) => void;
  setCornerPlot: (v: 0 | 1 | null) => void;
  setInsideGatedProject: (v: 0 | 1 | null) => void;
  setGatedProjectName: (v: string) => void;
  setFloorType: (v: 'verified_tiles' | 'mosaic' | 'marble_granite' | 'wooden' | 'cement' | '') => void;
  setFurnishing: (v: string) => void;
  setParking: (v: string) => void;
  setBalconies: (v: number) => void;
  setWaterSupply: (v: 'corporation' | 'borewell' | 'both' | '') => void;
  setLandWaterSupply: (v: 'corporation' | 'borewell' | 'both' | 'none' | '') => void;
  setLandElectricityConnection: (v: 'electricity' | 'solar' | 'none' | '') => void;
  setLandSewageConnection: (v: 'open' | 'underground' | 'none' | '') => void;
  setLandFacingRoadWidthFt: (v: string) => void;
  setLandAddDirectionTip: (v: boolean) => void;
  setPetAllowed: (v: 0 | 1 | null) => void;
  setGym: (v: 0 | 1 | null) => void;
  setNonVegAllowed: (v: 0 | 1 | null) => void;
  setGatedSecurity: (v: 0 | 1 | null) => void;
  setWhoWillShowProperty: (v: string) => void;
  setPowerBackupType: (v: 'full' | 'partial' | 'none' | '') => void;
  setCurrentPropertyCondition: (v: string) => void;
  setMoreSimilarUnitsAvailable: (v: 0 | 1 | null) => void;
  setDirectionTip: (v: string) => void;
  setCommercialPreviousOccupancy: (v: 'first_time_rental' | 'currently_rented' | 'previously_rented' | '') => void;
  setCommercialWantPainted: (v: 0 | 1 | null) => void;
  setCommercialWantCleaned: (v: 0 | 1 | null) => void;
  setCommercialPowerBackupType: (v: 'full' | 'dg_backup' | 'need_to_arrange' | '') => void;
  setCommercialLiftType: (v: 'none' | 'personal' | 'common' | '') => void;
  setCommercialParkingType: (v: 'none' | 'public_and_reserved' | 'public' | 'reserved' | '') => void;
  setCommercialParkingSlots: (v: string) => void;
  setCommercialWashroomType: (v: 'shared' | 'no_washroom' | 'private' | '') => void;
  setCommercialWaterStorageFacility: (v: 0 | 1 | null) => void;
  setCommercialSecurity: (v: 0 | 1 | null) => void;
  setCommercialBusinessRunning: (v: string) => void;
  setAmenityLift: (v: 0 | 1 | null) => void;
  setAmenityPowerBackup: (v: 0 | 1 | null) => void;
  setAmenityGasPipeline: (v: 0 | 1 | null) => void;
  setAmenityIntercom: (v: 0 | 1 | null) => void;
  setAmenityInternetServices: (v: 0 | 1 | null) => void;
  setAmenityAirConditioner: (v: 0 | 1 | null) => void;
  setAmenityClubHouse: (v: 0 | 1 | null) => void;
  setAmenitySwimmingPool: (v: 0 | 1 | null) => void;
  setAmenityChildrenPlayArea: (v: 0 | 1 | null) => void;
  setAmenityFireSafety: (v: 0 | 1 | null) => void;
  setAmenityServantRoom: (v: 0 | 1 | null) => void;
  setAmenityShoppingCenter: (v: 0 | 1 | null) => void;
  setAmenityPark: (v: 0 | 1 | null) => void;
  setAmenityRainWaterHarvesting: (v: 0 | 1 | null) => void;
  setAmenitySewageTreatmentPlant: (v: 0 | 1 | null) => void;
  setAmenityHouseKeeping: (v: 0 | 1 | null) => void;
  setAmenityVisitorParking: (v: 0 | 1 | null) => void;
  setLandOwnership: (v: 'freehold' | 'leasehold' | 'cooperative_society' | 'power_of_attorney' | '') => void;
  setLandLeaseTermYears: (v: string) => void;
  setLandSaleDeedCertificate: (v: 'yes' | 'no' | 'dont_know' | '') => void;
  setLandEncumbranceCertificate: (v: 'yes' | 'no' | 'dont_know' | '') => void;
  setLandConversionCertificate: (v: 'yes' | 'no' | 'not_needed' | 'dont_know' | '') => void;
  setLandReraApproved: (v: 'yes' | 'no' | '') => void;
  setLandKhataCertificate: (v: 'yes_a_khata' | 'yes_b_khata' | 'no' | 'dont_know' | '') => void;
  setKhataCertificate: (v: 'yes_a_khata' | 'yes_b_khata' | 'no' | 'dont_know' | '') => void;
  setSaleDeedCertificate: (v: 'yes' | 'no' | 'dont_know' | '') => void;
  setSaleAgreement: (v: 'yes' | 'no' | 'dont_know' | '') => void;
  setPropertyTaxPaid: (v: 'yes' | 'no' | 'dont_know' | '') => void;
  setOccupancyCertificate: (v: 'yes' | 'no' | 'dont_know' | '') => void;
};

function resetPgState(api: FlowStateResetApi) {
  api.setPgRoomSingle(false);
  api.setPgRoomDouble(false);
  api.setPgRoomThree(false);
  api.setPgRoomFour(false);
  api.setPgActiveRoom('single');
  api.setPgSingleRent('');
  api.setPgSingleDeposit('');
  api.setPgDoubleRent('');
  api.setPgDoubleDeposit('');
  api.setPgThreeRent('');
  api.setPgThreeDeposit('');
  api.setPgFourRent('');
  api.setPgFourDeposit('');
  api.setPgSingleAmenityCupboard(false);
  api.setPgSingleAmenityTv(false);
  api.setPgSingleAmenityBedding(false);
  api.setPgSingleAmenityGeyser(false);
  api.setPgSingleAmenityAc(false);
  api.setPgSingleAmenityAttachedBathroom(false);
  api.setPgDoubleAmenityCupboard(false);
  api.setPgDoubleAmenityTv(false);
  api.setPgDoubleAmenityBedding(false);
  api.setPgDoubleAmenityGeyser(false);
  api.setPgDoubleAmenityAc(false);
  api.setPgDoubleAmenityAttachedBathroom(false);
  api.setPgThreeAmenityCupboard(false);
  api.setPgThreeAmenityTv(false);
  api.setPgThreeAmenityBedding(false);
  api.setPgThreeAmenityGeyser(false);
  api.setPgThreeAmenityAc(false);
  api.setPgThreeAmenityAttachedBathroom(false);
  api.setPgFourAmenityCupboard(false);
  api.setPgFourAmenityTv(false);
  api.setPgFourAmenityBedding(false);
  api.setPgFourAmenityGeyser(false);
  api.setPgFourAmenityAc(false);
  api.setPgFourAmenityAttachedBathroom(false);
  api.setPgPlaceAvailableFor('');
  api.setPgPreferredGuests('');
  api.setPgAvailableFromDate(null);
  api.setPgAvailableFromText('');
  api.setPgFoodIncluded('');
  api.setPgMealBreakfast(false);
  api.setPgMealLunch(false);
  api.setPgMealDinner(false);
  api.setPgRuleNoSmoking(false);
  api.setPgRuleNoGuardianStay(false);
  api.setPgRuleNoOppositeEntry(false);
  api.setPgRuleNoDrinking(false);
  api.setPgRuleNoNonVeg(false);
  api.setPgGateClosingTime(null);
  api.setPgDescription('');
  api.setPgLaundryAvailable(null);
  api.setPgRoomCleaningAvailable(null);
  api.setPgWardenFacilityAvailable(null);
  api.setPgAmenityCommonTv(false);
  api.setPgAmenityLift(false);
  api.setPgAmenityWifi(false);
  api.setPgAmenityPowerBackup(false);
  api.setPgAmenityMess(false);
  api.setPgAmenityRefrigerator(false);
  api.setPgAmenityCookingAllowed(false);
}

function resetFlatmatesState(api: FlowStateResetApi) {
  api.setFlatmatesRoomType('');
  api.setFlatmatesTenantType('');
  api.setFlatmatesAttachedBathroom(null);
  api.setFlatmatesBathroomType('');
  api.setFlatmatesAcRoom(null);
  api.setFlatmatesBalcony(null);
  api.setFlatmatesSmokingAllowed(null);
  api.setFlatmatesDrinkingAllowed(null);
}

function resetCommercialState(api: FlowStateResetApi) {
  api.setCommercialBuildingType('');
  api.setCommercialOnMainRoad(false);
  api.setCommercialCornerProperty(false);
  api.setCommercialLeaseDurationYears('');
  api.setCommercialLockinPeriodYears('');
  api.setCommercialIdealForTags([]);
  api.setCommercialIdealForInput('');
  api.setCommercialPreviousOccupancy('');
  api.setCommercialWantPainted(null);
  api.setCommercialWantCleaned(null);
  api.setCommercialPowerBackupType('');
  api.setCommercialLiftType('');
  api.setCommercialParkingType('');
  api.setCommercialParkingSlots('');
  api.setCommercialWashroomType('');
  api.setCommercialWaterStorageFacility(null);
  api.setCommercialSecurity(null);
  api.setCommercialBusinessRunning('');
}

function resetLandState(api: FlowStateResetApi) {
  api.setPlotLengthFt('');
  api.setPlotWidthFt('');
  api.setBoundaryWall(null);
  api.setFloorsAllowed('');
  api.setCornerPlot(null);
  api.setInsideGatedProject(null);
  api.setGatedProjectName('');
  api.setLandWaterSupply('');
  api.setLandElectricityConnection('');
  api.setLandSewageConnection('');
  api.setLandFacingRoadWidthFt('');
  api.setLandAddDirectionTip(false);
  api.setLandOwnership('');
  api.setLandLeaseTermYears('');
  api.setLandSaleDeedCertificate('');
  api.setLandEncumbranceCertificate('');
  api.setLandConversionCertificate('');
  api.setLandReraApproved('');
  api.setLandKhataCertificate('');
}

function resetPricingState(api: FlowStateResetApi) {
  api.setPrice('');
  api.setDeposit('');
  api.setMaintenance('');
  api.setDepositNegotiable(false);
  api.setPropertyAvailableFor('only_rent');
  api.setRentNegotiable(false);
  api.setCurrentlyUnderLoan(false);
  api.setKitchenType('');
  api.setMonthlyMaintenanceType('');
  api.setMaintenanceAmount('');
  api.setAvailableFromDate(null);
  api.setAvailableFromText('');
  api.setPreferredAnyone(false);
  api.setPreferredFamily(false);
  api.setPreferredBachelorFemale(false);
  api.setPreferredBachelorMale(false);
  api.setPreferredCompany(false);
}

function resetResidentialDetailsState(api: FlowStateResetApi) {
  api.setApartmentType('apartment');
  api.setApartmentName('');
  api.setBhkType('');
  api.setOwnershipType('');
  api.setLeaseYears('');
  api.setFloor('');
  api.setTotalFloors('');
  api.setPropertyAge('');
  api.setFacing('');
  api.setBedrooms('');
  api.setBathrooms('');
  api.setAreaSqft('');
  api.setCarpetAreaSqft('');
  api.setPlotAreaSqft('');
  api.setFloorType('');
  api.setFurnishing('semi_furnished');
  api.setParking('none');
  api.setBalconies(0);
  api.setWaterSupply('');
  api.setPetAllowed(null);
  api.setGym(null);
  api.setNonVegAllowed(null);
  api.setGatedSecurity(null);
  api.setWhoWillShowProperty('');
  api.setPowerBackupType('');
  api.setCurrentPropertyCondition('');
  api.setMoreSimilarUnitsAvailable(null);
  api.setDirectionTip('');
}

function resetResaleLegalState(api: FlowStateResetApi) {
  api.setKhataCertificate('');
  api.setSaleDeedCertificate('');
  api.setSaleAgreement('');
  api.setPropertyTaxPaid('');
  api.setOccupancyCertificate('');
}

function resetSharedAmenitiesState(api: FlowStateResetApi) {
  api.setAmenityLift(null);
  api.setAmenityPowerBackup(null);
  api.setAmenityGasPipeline(null);
  api.setAmenityIntercom(null);
  api.setAmenityInternetServices(null);
  api.setAmenityAirConditioner(null);
  api.setAmenityClubHouse(null);
  api.setAmenitySwimmingPool(null);
  api.setAmenityChildrenPlayArea(null);
  api.setAmenityFireSafety(null);
  api.setAmenityServantRoom(null);
  api.setAmenityShoppingCenter(null);
  api.setAmenityPark(null);
  api.setAmenityRainWaterHarvesting(null);
  api.setAmenitySewageTreatmentPlant(null);
  api.setAmenityHouseKeeping(null);
  api.setAmenityVisitorParking(null);
}

const PG_FLOWS: PropertyFlowKey[] = ['pg_hostel'];
const FLATMATES_FLOWS: PropertyFlowKey[] = ['flatmates'];
const COMMERCIAL_FLOWS: PropertyFlowKey[] = ['commercial_rent', 'commercial_sale'];
const LAND_FLOWS: PropertyFlowKey[] = ['land_plot'];
const PRICING_FLOWS: PropertyFlowKey[] = [
  'residential_rent',
  'residential_resale',
  'flatmates',
  'commercial_rent',
  'commercial_sale',
  'land_plot',
];
const RESALE_LEGAL_FLOWS: PropertyFlowKey[] = ['residential_resale', 'commercial_sale', 'land_plot'];
const RESIDENTIAL_DETAILS_FLOWS: PropertyFlowKey[] = [
  'residential_rent',
  'residential_resale',
  'flatmates',
  'commercial_rent',
  'commercial_sale',
  'land_plot',
];

function includesFlow(list: PropertyFlowKey[], flowKey: PropertyFlowKey) {
  return list.includes(flowKey);
}

/** Reset every field group that the target flow does not use. */
export function resetFieldsNotInFlow(flowKey: PropertyFlowKey, api: FlowStateResetApi) {
  if (!includesFlow(PG_FLOWS, flowKey)) resetPgState(api);
  if (!includesFlow(FLATMATES_FLOWS, flowKey)) resetFlatmatesState(api);
  if (!includesFlow(COMMERCIAL_FLOWS, flowKey)) resetCommercialState(api);
  if (!includesFlow(LAND_FLOWS, flowKey)) resetLandState(api);
  if (!includesFlow(PRICING_FLOWS, flowKey)) resetPricingState(api);
  if (!includesFlow(RESALE_LEGAL_FLOWS, flowKey)) resetResaleLegalState(api);
  if (!includesFlow(RESIDENTIAL_DETAILS_FLOWS, flowKey)) resetResidentialDetailsState(api);

  // PG has its own amenity set; clear shared residential amenity toggles when not applicable.
  if (flowKey === 'pg_hostel') {
    resetSharedAmenitiesState(api);
    resetPricingState(api);
    resetResidentialDetailsState(api);
    resetFlatmatesState(api);
    resetCommercialState(api);
    resetLandState(api);
    resetResaleLegalState(api);
  }
}
