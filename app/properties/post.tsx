import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { getLocalFileSizeBytes } from '@/lib/get-local-file-size';
import { isAllowedPhotoUri, isAllowedVideoUri } from '@/lib/media-upload-validation';
import { processPropertyMediaUpload } from '@/lib/property-media-process';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Button, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import AppDateTimePicker from '@/components/AppDateTimePicker';
import BookingMapPicker from '@/components/booking-map-picker';
import { PropertyMediaGrid, type PropertyMediaItem } from '@/components/property-media-grid';
import { usePropertyWizardFlowSync } from '@/hooks/use-property-wizard-flow-sync';
import type { FlowStateResetApi } from '@/lib/properties/flow-state-reset';
import {
  defaultPropertyTypeForCategory,
  flowLabelForKey,
  resolvePropertyFlowKey,
  type WizardStep,
} from '@/lib/properties/wizard-flow';
import { reverseGeocode, reverseGeocodeDetails, reverseGeocodeFeatures, searchPlaces } from '@/lib/mapbox';
import { getMapboxToken } from '@/lib/public-config';
import { hydratePropertyForm, loadPropertyForEdit } from '@/lib/load-property-for-edit';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { useLocalSearchParams, useRouter } from 'expo-router';

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_DURATION_SEC = 120;

const TARGET_IMAGE_BYTES = 1 * 1024 * 1024;

type UploadItem = {
  uri: string;
  kind: 'photo' | 'video';
};

type StateRow = { id: string; name: string };
type CityRow = { id: string; state_id: string; name: string };
type LocalityRow = { id: string; city_id: string; name: string };

function isRemoteMediaUri(uri: string) {
  const u = String(uri ?? '').trim().toLowerCase();
  return u.startsWith('https://') || u.startsWith('http://');
}

export default function PostPropertyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string }>();
  const editId = String(params.editId ?? '').trim();
  const isEditMode = Boolean(editId);

  const { session, profile } = useSession();

  const [step, setStep] = useState<WizardStep>('basic');
  const [saving, setSaving] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [listingType, setListingType] = useState<'rent' | 'buy' | 'commercial'>('rent');
  const [propertyCategory, setPropertyCategory] = useState<'residential' | 'commercial' | 'land_plot'>('residential');
  const [adType, setAdType] = useState<'rent' | 'resale' | 'pg_hostel' | 'flatmates' | 'sale'>('rent');
  const [propertyType, setPropertyType] = useState('apartment');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [commercialBuildingType, setCommercialBuildingType] = useState('');
  const [commercialOnMainRoad, setCommercialOnMainRoad] = useState(false);
  const [commercialCornerProperty, setCommercialCornerProperty] = useState(false);

  const [pgRoomSingle, setPgRoomSingle] = useState(false);
  const [pgRoomDouble, setPgRoomDouble] = useState(false);
  const [pgRoomThree, setPgRoomThree] = useState(false);
  const [pgRoomFour, setPgRoomFour] = useState(false);
  const [pgActiveRoom, setPgActiveRoom] = useState<'single' | 'double' | 'three' | 'four'>('single');

  const [pgSingleRent, setPgSingleRent] = useState('');
  const [pgSingleDeposit, setPgSingleDeposit] = useState('');
  const [pgDoubleRent, setPgDoubleRent] = useState('');
  const [pgDoubleDeposit, setPgDoubleDeposit] = useState('');
  const [pgThreeRent, setPgThreeRent] = useState('');
  const [pgThreeDeposit, setPgThreeDeposit] = useState('');
  const [pgFourRent, setPgFourRent] = useState('');
  const [pgFourDeposit, setPgFourDeposit] = useState('');

  const [pgSingleAmenityCupboard, setPgSingleAmenityCupboard] = useState(false);
  const [pgSingleAmenityTv, setPgSingleAmenityTv] = useState(false);
  const [pgSingleAmenityBedding, setPgSingleAmenityBedding] = useState(false);
  const [pgSingleAmenityGeyser, setPgSingleAmenityGeyser] = useState(false);
  const [pgSingleAmenityAc, setPgSingleAmenityAc] = useState(false);
  const [pgSingleAmenityAttachedBathroom, setPgSingleAmenityAttachedBathroom] = useState(false);

  const [pgDoubleAmenityCupboard, setPgDoubleAmenityCupboard] = useState(false);
  const [pgDoubleAmenityTv, setPgDoubleAmenityTv] = useState(false);
  const [pgDoubleAmenityBedding, setPgDoubleAmenityBedding] = useState(false);
  const [pgDoubleAmenityGeyser, setPgDoubleAmenityGeyser] = useState(false);
  const [pgDoubleAmenityAc, setPgDoubleAmenityAc] = useState(false);
  const [pgDoubleAmenityAttachedBathroom, setPgDoubleAmenityAttachedBathroom] = useState(false);

  const [pgThreeAmenityCupboard, setPgThreeAmenityCupboard] = useState(false);
  const [pgThreeAmenityTv, setPgThreeAmenityTv] = useState(false);
  const [pgThreeAmenityBedding, setPgThreeAmenityBedding] = useState(false);
  const [pgThreeAmenityGeyser, setPgThreeAmenityGeyser] = useState(false);
  const [pgThreeAmenityAc, setPgThreeAmenityAc] = useState(false);
  const [pgThreeAmenityAttachedBathroom, setPgThreeAmenityAttachedBathroom] = useState(false);

  const [pgFourAmenityCupboard, setPgFourAmenityCupboard] = useState(false);
  const [pgFourAmenityTv, setPgFourAmenityTv] = useState(false);
  const [pgFourAmenityBedding, setPgFourAmenityBedding] = useState(false);
  const [pgFourAmenityGeyser, setPgFourAmenityGeyser] = useState(false);
  const [pgFourAmenityAc, setPgFourAmenityAc] = useState(false);
  const [pgFourAmenityAttachedBathroom, setPgFourAmenityAttachedBathroom] = useState(false);

  const [pgPlaceAvailableFor, setPgPlaceAvailableFor] = useState<'male' | 'female' | 'anyone' | ''>('');
  const [pgPreferredGuests, setPgPreferredGuests] = useState<'working_professional' | 'student' | 'both' | ''>('');
  const [pgAvailableFromDate, setPgAvailableFromDate] = useState<Date | null>(null);
  const [pgAvailableFromText, setPgAvailableFromText] = useState('');

  const [pgFoodIncluded, setPgFoodIncluded] = useState<'yes' | 'no' | ''>('');
  const [pgMealBreakfast, setPgMealBreakfast] = useState(false);
  const [pgMealLunch, setPgMealLunch] = useState(false);
  const [pgMealDinner, setPgMealDinner] = useState(false);

  const [pgRuleNoSmoking, setPgRuleNoSmoking] = useState(false);
  const [pgRuleNoGuardianStay, setPgRuleNoGuardianStay] = useState(false);
  const [pgRuleNoOppositeEntry, setPgRuleNoOppositeEntry] = useState(false);
  const [pgRuleNoDrinking, setPgRuleNoDrinking] = useState(false);
  const [pgRuleNoNonVeg, setPgRuleNoNonVeg] = useState(false);

  const [pgGateClosingTime, setPgGateClosingTime] = useState<Date | null>(null);
  const [pgDescription, setPgDescription] = useState('');

  const [apartmentType, setApartmentType] = useState<
    'apartment' | 'independent_house_villa' | 'gated_community_villa' | 'standalone_building'
  >('apartment');
  const [apartmentName, setApartmentName] = useState('');

  const [flatmatesRoomType, setFlatmatesRoomType] = useState<'single_room' | 'shared_room' | ''>('');
  const [flatmatesTenantType, setFlatmatesTenantType] = useState<'male' | 'female' | ''>('');
  const [bhkType, setBhkType] = useState('');
  const [ownershipType, setOwnershipType] = useState<'on_lease' | 'self_owned' | ''>('');
  const [leaseYears, setLeaseYears] = useState('');
  const [floor, setFloor] = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [propertyAge, setPropertyAge] = useState('');
  const [facing, setFacing] = useState('');
  const [areaUnit, setAreaUnit] = useState<'sqft'>('sqft');

  const [stateValue, setStateValue] = useState('Gujarat');
  const [cityValue, setCityValue] = useState('Ahmedabad');
  const [localityValue, setLocalityValue] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [pincode, setPincode] = useState('');

  const [localityTyped, setLocalityTyped] = useState(false);
  const [localityLoading, setLocalityLoading] = useState(false);
  const [localitySuggestions, setLocalitySuggestions] = useState<Array<{ id: string; label: string; full: string }>>([]);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapPickerBusy, setMapPickerBusy] = useState(false);
  const [mapPickerCoord, setMapPickerCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [mapboxToken, setMapboxToken] = useState('');

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  const [previewKind, setPreviewKind] = useState<'photo' | 'video'>('photo');

  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [maintenance, setMaintenance] = useState('');
  const [depositNegotiable, setDepositNegotiable] = useState(false);
  const [commercialLeaseDurationYears, setCommercialLeaseDurationYears] = useState('');
  const [commercialLockinPeriodYears, setCommercialLockinPeriodYears] = useState('');
  const [commercialIdealForTags, setCommercialIdealForTags] = useState<string[]>([]);
  const [commercialIdealForInput, setCommercialIdealForInput] = useState('');

  const [propertyAvailableFor, setPropertyAvailableFor] = useState<'only_rent' | 'only_lease'>('only_rent');
  const [rentNegotiable, setRentNegotiable] = useState(false);
  const [currentlyUnderLoan, setCurrentlyUnderLoan] = useState(false);
  const [kitchenType, setKitchenType] = useState<'modular' | 'cupboard_shelf' | 'open_shelf' | ''>('');
  const [monthlyMaintenanceType, setMonthlyMaintenanceType] = useState<'included' | 'extra' | ''>('');
  const [maintenanceAmount, setMaintenanceAmount] = useState('');
  const [availableFromDate, setAvailableFromDate] = useState<Date | null>(null);
  const [availableFromText, setAvailableFromText] = useState('');
  const [preferredAnyone, setPreferredAnyone] = useState(false);
  const [preferredFamily, setPreferredFamily] = useState(false);
  const [preferredBachelorFemale, setPreferredBachelorFemale] = useState(false);
  const [preferredBachelorMale, setPreferredBachelorMale] = useState(false);
  const [preferredCompany, setPreferredCompany] = useState(false);

  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [areaSqft, setAreaSqft] = useState('');
  const [carpetAreaSqft, setCarpetAreaSqft] = useState('');
  const [plotAreaSqft, setPlotAreaSqft] = useState('');
  const [plotLengthFt, setPlotLengthFt] = useState('');
  const [plotWidthFt, setPlotWidthFt] = useState('');
  const [boundaryWall, setBoundaryWall] = useState<0 | 1 | null>(null);
  const [floorsAllowed, setFloorsAllowed] = useState('');
  const [cornerPlot, setCornerPlot] = useState<0 | 1 | null>(null);
  const [insideGatedProject, setInsideGatedProject] = useState<0 | 1 | null>(null);
  const [gatedProjectName, setGatedProjectName] = useState('');
  const [floorType, setFloorType] = useState<'verified_tiles' | 'mosaic' | 'marble_granite' | 'wooden' | 'cement' | ''>('');
  const [furnishing, setFurnishing] = useState('semi_furnished');
  const [parking, setParking] = useState('none');

  const [balconies, setBalconies] = useState(0);
  const [waterSupply, setWaterSupply] = useState<'corporation' | 'borewell' | 'both' | ''>('');
  const [landWaterSupply, setLandWaterSupply] = useState<'corporation' | 'borewell' | 'both' | 'none' | ''>('');
  const [landElectricityConnection, setLandElectricityConnection] = useState<'electricity' | 'solar' | 'none' | ''>('');
  const [landSewageConnection, setLandSewageConnection] = useState<'open' | 'underground' | 'none' | ''>('');
  const [landFacingRoadWidthFt, setLandFacingRoadWidthFt] = useState('');
  const [landAddDirectionTip, setLandAddDirectionTip] = useState(false);
  const [flatmatesAttachedBathroom, setFlatmatesAttachedBathroom] = useState<0 | 1 | null>(null);
  const [flatmatesBathroomType, setFlatmatesBathroomType] = useState<'private' | 'shared' | ''>('');
  const [flatmatesAcRoom, setFlatmatesAcRoom] = useState<0 | 1 | null>(null);
  const [flatmatesBalcony, setFlatmatesBalcony] = useState<0 | 1 | null>(null);
  const [flatmatesSmokingAllowed, setFlatmatesSmokingAllowed] = useState<0 | 1 | null>(null);
  const [flatmatesDrinkingAllowed, setFlatmatesDrinkingAllowed] = useState<0 | 1 | null>(null);
  const [petAllowed, setPetAllowed] = useState<0 | 1 | null>(null);
  const [gym, setGym] = useState<0 | 1 | null>(null);
  const [nonVegAllowed, setNonVegAllowed] = useState<0 | 1 | null>(null);
  const [gatedSecurity, setGatedSecurity] = useState<0 | 1 | null>(null);
  const [whoWillShowProperty, setWhoWillShowProperty] = useState('');
  const [powerBackupType, setPowerBackupType] = useState<'full' | 'partial' | 'none' | ''>('');
  const [currentPropertyCondition, setCurrentPropertyCondition] = useState('');
  const [secondaryCountryCode, setSecondaryCountryCode] = useState('+91');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [moreSimilarUnitsAvailable, setMoreSimilarUnitsAvailable] = useState<0 | 1 | null>(null);
  const [directionTip, setDirectionTip] = useState('');

  const [commercialPreviousOccupancy, setCommercialPreviousOccupancy] = useState<'first_time_rental' | 'currently_rented' | 'previously_rented' | ''>('');
  const [commercialWantPainted, setCommercialWantPainted] = useState<0 | 1 | null>(null);
  const [commercialWantCleaned, setCommercialWantCleaned] = useState<0 | 1 | null>(null);

  const [commercialPowerBackupType, setCommercialPowerBackupType] = useState<'full' | 'dg_backup' | 'need_to_arrange' | ''>('');
  const [commercialLiftType, setCommercialLiftType] = useState<'none' | 'personal' | 'common' | ''>('');
  const [commercialParkingType, setCommercialParkingType] = useState<'none' | 'public_and_reserved' | 'public' | 'reserved' | ''>('');
  const [commercialParkingSlots, setCommercialParkingSlots] = useState('');
  const [commercialWashroomType, setCommercialWashroomType] = useState<'shared' | 'no_washroom' | 'private' | ''>('');
  const [commercialWaterStorageFacility, setCommercialWaterStorageFacility] = useState<0 | 1 | null>(null);
  const [commercialSecurity, setCommercialSecurity] = useState<0 | 1 | null>(null);
  const [commercialBusinessRunning, setCommercialBusinessRunning] = useState('');

  const [pgLaundryAvailable, setPgLaundryAvailable] = useState<0 | 1 | null>(null);
  const [pgRoomCleaningAvailable, setPgRoomCleaningAvailable] = useState<0 | 1 | null>(null);
  const [pgWardenFacilityAvailable, setPgWardenFacilityAvailable] = useState<0 | 1 | null>(null);

  const [pgAmenityCommonTv, setPgAmenityCommonTv] = useState(false);
  const [pgAmenityLift, setPgAmenityLift] = useState(false);
  const [pgAmenityWifi, setPgAmenityWifi] = useState(false);
  const [pgAmenityPowerBackup, setPgAmenityPowerBackup] = useState(false);
  const [pgAmenityMess, setPgAmenityMess] = useState(false);
  const [pgAmenityRefrigerator, setPgAmenityRefrigerator] = useState(false);
  const [pgAmenityCookingAllowed, setPgAmenityCookingAllowed] = useState(false);

  const [amenityLift, setAmenityLift] = useState<0 | 1 | null>(null);
  const [amenityPowerBackup, setAmenityPowerBackup] = useState<0 | 1 | null>(null);
  const [amenityGasPipeline, setAmenityGasPipeline] = useState<0 | 1 | null>(null);
  const [amenityIntercom, setAmenityIntercom] = useState<0 | 1 | null>(null);
  const [amenityInternetServices, setAmenityInternetServices] = useState<0 | 1 | null>(null);
  const [amenityAirConditioner, setAmenityAirConditioner] = useState<0 | 1 | null>(null);
  const [amenityClubHouse, setAmenityClubHouse] = useState<0 | 1 | null>(null);
  const [amenitySwimmingPool, setAmenitySwimmingPool] = useState<0 | 1 | null>(null);
  const [amenityChildrenPlayArea, setAmenityChildrenPlayArea] = useState<0 | 1 | null>(null);
  const [amenityFireSafety, setAmenityFireSafety] = useState<0 | 1 | null>(null);
  const [amenityServantRoom, setAmenityServantRoom] = useState<0 | 1 | null>(null);
  const [amenityShoppingCenter, setAmenityShoppingCenter] = useState<0 | 1 | null>(null);
  const [amenityPark, setAmenityPark] = useState<0 | 1 | null>(null);
  const [amenityRainWaterHarvesting, setAmenityRainWaterHarvesting] = useState<0 | 1 | null>(null);
  const [amenitySewageTreatmentPlant, setAmenitySewageTreatmentPlant] = useState<0 | 1 | null>(null);
  const [amenityHouseKeeping, setAmenityHouseKeeping] = useState<0 | 1 | null>(null);
  const [amenityVisitorParking, setAmenityVisitorParking] = useState<0 | 1 | null>(null);

  const [landOwnership, setLandOwnership] = useState<'freehold' | 'leasehold' | 'cooperative_society' | 'power_of_attorney' | ''>('');
  const [landLeaseTermYears, setLandLeaseTermYears] = useState('');
  const [landSaleDeedCertificate, setLandSaleDeedCertificate] = useState<'yes' | 'no' | 'dont_know' | ''>('');
  const [landEncumbranceCertificate, setLandEncumbranceCertificate] = useState<'yes' | 'no' | 'dont_know' | ''>('');
  const [landConversionCertificate, setLandConversionCertificate] = useState<'yes' | 'no' | 'not_needed' | 'dont_know' | ''>('');
  const [landReraApproved, setLandReraApproved] = useState<'yes' | 'no' | ''>('');
  const [landKhataCertificate, setLandKhataCertificate] = useState<'yes_a_khata' | 'yes_b_khata' | 'no' | 'dont_know' | ''>('');

  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'apartmentType'
    | 'commercialPropertyType'
    | 'commercialBuildingType'
    | 'bhkType'
    | 'ownershipType'
    | 'floorType'
    | 'floor'
    | 'totalFloors'
    | 'propertyAge'
    | 'facing'
    | 'areaUnit'
    | 'kitchenType'
    | 'maintenanceType'
    | 'furnishing'
    | 'parking'
    | 'state'
    | 'city'
    | 'waterSupply'
    | 'landWaterSupply'
    | 'landElectricityConnection'
    | 'landSewageConnection'
    | 'landOwnership'
    | 'landSaleDeedCertificate'
    | 'landEncumbranceCertificate'
    | 'landConversionCertificate'
    | 'landReraApproved'
    | 'landKhataCertificate'
    | 'whoWillShow'
    | 'powerBackupType'
    | 'propertyCondition'
    | 'commercialPreviousOccupancy'
    | 'secondaryCountryCode'
    | 'commercialPowerBackupType'
    | 'commercialLiftType'
    | 'commercialParkingType'
    | 'commercialWashroomType'
    | 'commercialBusinessRunning'
    | 'commercialLeaseDurationYears'
    | 'commercialLockinPeriodYears'
    | 'khataCertificate'
    | 'saleDeedCertificate'
    | 'saleAgreement'
    | 'propertyTaxPaid'
    | 'occupancyCertificate'
    | 'pgPreferredGuests'
  >(null);

  const commercialIdealForBaseTags = useMemo(() => {
    return ['Bank', 'Service Center', 'Show Room', 'ATM', 'Retail'] as const;
  }, []);

  const toggleCommercialIdealTag = useCallback((tag: string) => {
    const t = String(tag ?? '').trim();
    if (!t) return;
    setCommercialIdealForTags((prev) => {
      const has = prev.includes(t);
      return has ? prev.filter((x) => x !== t) : [...prev, t];
    });
  }, []);

  const addCommercialIdealTag = useCallback(() => {
    const raw = String(commercialIdealForInput ?? '').trim();
    if (!raw) return;
    setCommercialIdealForTags((prev) => {
      if (prev.includes(raw)) return prev;
      return [...prev, raw];
    });
    setCommercialIdealForInput('');
  }, [commercialIdealForInput]);

  const removeCommercialIdealTag = useCallback((tag: string) => {
    const t = String(tag ?? '').trim();
    if (!t) return;
    setCommercialIdealForTags((prev) => prev.filter((x) => x !== t));
  }, []);

  const [contactName, setContactName] = useState(String(profile?.name ?? '').trim());
  const [contactPhone, setContactPhone] = useState('');

  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);

  const isLandPlot = propertyCategory === 'land_plot';

  const [scheduleAvailability, setScheduleAvailability] = useState<'everyday' | 'weekday' | 'weekend'>('everyday');
  const [scheduleAllDay, setScheduleAllDay] = useState(false);
  const [scheduleStart, setScheduleStart] = useState<Date | null>(null);
  const [scheduleEnd, setScheduleEnd] = useState<Date | null>(null);

  const [khataCertificate, setKhataCertificate] = useState<'yes_a_khata' | 'yes_b_khata' | 'no' | 'dont_know' | ''>('');
  const [saleDeedCertificate, setSaleDeedCertificate] = useState<'yes' | 'no' | 'dont_know' | ''>('');
  const [saleAgreement, setSaleAgreement] = useState<'yes' | 'no' | 'dont_know' | ''>('');
  const [propertyTaxPaid, setPropertyTaxPaid] = useState<'yes' | 'no' | 'dont_know' | ''>('');
  const [occupancyCertificate, setOccupancyCertificate] = useState<'yes' | 'no' | 'dont_know' | ''>('');

  const createdPropertyIdRef = useRef<string | null>(null);
  const mediaMimeByUriRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!editId || !session?.user?.id) return;
    let active = true;

    const run = async () => {
      setEditLoading(true);
      setError(null);
      try {
        const loaded = await loadPropertyForEdit(supabase, editId, session.user.id);
        if (!active) return;
        if (!loaded) {
          setError('Property not found or you do not have access.');
          return;
        }

        const { row, photoUrls, videoUrls } = loaded;
        createdPropertyIdRef.current = editId;
        const h = hydratePropertyForm(row);

        setPropertyCategory(h.propertyCategory);
        setAdType(h.adType);
        setListingType(h.listingType);
        setPropertyType(h.propertyType);
        setTitle(h.title);
        setDescription(h.description);
        setPrice(h.price);
        setDeposit(h.deposit);
        setBedrooms(h.bedrooms);
        setBathrooms(h.bathrooms);
        setBalconies(h.balconies);
        setAreaSqft(h.areaSqft);
        setCarpetAreaSqft(h.carpetAreaSqft);
        setFurnishing(h.furnishing);
        setParking(h.parking);
        setStateValue(h.stateValue);
        setCityValue(h.cityValue);
        setLocalityValue(h.localityValue);
        setAddress1(h.address1);
        setAddress2(h.address2);
        setPincode(h.pincode);
        setMapPickerCoord(h.mapPickerCoord);
        setContactName(h.contactName);
        setContactPhone(h.contactPhone);
        setWhoWillShowProperty(h.whoWillShowProperty);
        setCurrentPropertyCondition(h.currentPropertyCondition);
        setDirectionTip(h.directionTip);
        if (h.waterSupply === 'corporation' || h.waterSupply === 'borewell' || h.waterSupply === 'both') {
          setWaterSupply(h.waterSupply);
        }
        setMonthlyMaintenanceType(h.monthlyMaintenanceType);
        setRentNegotiable(h.rentNegotiable);
        setDepositNegotiable(h.depositNegotiable);
        setPetAllowed(h.petAllowed);
        setGym(h.gym);
        setNonVegAllowed(h.nonVegAllowed);
        setGatedSecurity(h.gatedSecurity);
        setMoreSimilarUnitsAvailable(h.moreSimilarUnitsAvailable);
        setAmenityLift(h.amenityLift);
        setAmenityInternetServices(h.amenityInternetServices);
        setAmenityAirConditioner(h.amenityAirConditioner);
        setAmenityClubHouse(h.amenityClubHouse);
        setAmenityIntercom(h.amenityIntercom);
        setAmenitySwimmingPool(h.amenitySwimmingPool);
        setAmenityChildrenPlayArea(h.amenityChildrenPlayArea);
        setAmenityFireSafety(h.amenityFireSafety);
        setAmenityServantRoom(h.amenityServantRoom);
        setAmenityShoppingCenter(h.amenityShoppingCenter);
        setAmenityGasPipeline(h.amenityGasPipeline);
        setAmenityPark(h.amenityPark);
        setAmenityRainWaterHarvesting(h.amenityRainWaterHarvesting);
        setAmenitySewageTreatmentPlant(h.amenitySewageTreatmentPlant);
        setAmenityHouseKeeping(h.amenityHouseKeeping);
        setAmenityPowerBackup(h.amenityPowerBackup);
        setAmenityVisitorParking(h.amenityVisitorParking);

        if (h.monthlyMaintenanceType === 'extra') {
          setMaintenanceAmount(h.maintenance);
          setMaintenance('');
        } else {
          setMaintenance(h.maintenance);
          setMaintenanceAmount('');
        }

        const sec = String(row.secondary_phone ?? '').trim();
        if (sec.startsWith('+91')) {
          setSecondaryCountryCode('+91');
          setSecondaryPhone(sec.replace(/^\+91/, ''));
        } else if (sec.startsWith('+')) {
          setSecondaryCountryCode('+91');
          setSecondaryPhone(sec.replace(/^\+\d{1,4}/, ''));
        } else {
          setSecondaryPhone(sec);
        }

        const ownership = String(row.ownership_type ?? '').trim();
        if (ownership === 'on_lease' || ownership === 'self_owned') {
          setOwnershipType(ownership);
        }

        const availableFrom = String(row.available_from ?? '').trim();
        if (availableFrom) {
          const d = new Date(availableFrom);
          if (!Number.isNaN(d.getTime())) {
            setAvailableFromDate(d);
          }
        }

        setPhotos(photoUrls);
        setVideos(videoUrls);
        setStep('basic');
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Failed to load property for editing.');
      } finally {
        if (active) setEditLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [editId, session?.user?.id]);

  const requireSession = () => {
    if (session?.user?.id) return true;
    router.push({ pathname: '/auth/login', params: { redirectTo: '/properties/post' } } as any);
    return false;
  };

  const isCommercialRent = propertyCategory === 'commercial' && adType === 'rent';
  const isCommercialSale = propertyCategory === 'commercial' && adType === 'sale';
  const isCommercialAny = propertyCategory === 'commercial' && (adType === 'rent' || adType === 'sale');

  const commercialPropertyTypeOptions = useMemo(() => {
    return [
      { label: 'Office Space', value: 'office_space' },
      { label: 'Co-working', value: 'co_working' },
      { label: 'Shop', value: 'shop' },
      { label: 'Showroom', value: 'showroom' },
      { label: 'Godown / Warehouse', value: 'warehouse_godown' },
      { label: 'Industrial Shed', value: 'industrial_shed' },
      { label: 'Industrial Building', value: 'industrial_building' },
      { label: 'Restaurant / Cafe', value: 'restaurant_cafe' },
      { label: 'Other Business', value: 'other_business' },
    ] as const;
  }, []);

  const commercialBuildingTypeOptions = useMemo(() => {
    return [
      { label: 'Independent House', value: 'independent_house' },
      { label: 'Business Park', value: 'business_park' },
      { label: 'Mall', value: 'mall' },
      { label: 'Standalone Building', value: 'standalone_building' },
      { label: 'Independent Shop', value: 'independent_shop' },
    ] as const;
  }, []);

  const allowedCommercialBuildingTypes = useMemo(() => {
    const all = commercialBuildingTypeOptions.map((x) => x.value);
    const onlyStandalone = ['standalone_building'] as const;
    const restaurantCafe = all.filter((v) => v !== 'independent_house');
    const allFive = all;

    const key = String(propertyType ?? '');
    if (key === 'restaurant_cafe') return restaurantCafe;
    if (key === 'warehouse_godown' || key === 'industrial_shed' || key === 'industrial_building') return [...onlyStandalone];
    return allFive;
  }, [commercialBuildingTypeOptions, propertyType]);

  useEffect(() => {
    if (!isCommercialAny) return;
    if (!commercialBuildingType) return;
    if (!allowedCommercialBuildingTypes.includes(commercialBuildingType as any)) {
      setCommercialBuildingType('');
    }
  }, [allowedCommercialBuildingTypes, commercialBuildingType, isCommercialAny]);

  const flowKey = useMemo(
    () => resolvePropertyFlowKey(propertyCategory, adType),
    [propertyCategory, adType]
  );

  const flowResetApi = useMemo<FlowStateResetApi>(
    () => ({
      setPropertyType,
      setCommercialBuildingType,
      setCommercialOnMainRoad,
      setCommercialCornerProperty,
      setPgRoomSingle,
      setPgRoomDouble,
      setPgRoomThree,
      setPgRoomFour,
      setPgActiveRoom,
      setPgSingleRent,
      setPgSingleDeposit,
      setPgDoubleRent,
      setPgDoubleDeposit,
      setPgThreeRent,
      setPgThreeDeposit,
      setPgFourRent,
      setPgFourDeposit,
      setPgSingleAmenityCupboard,
      setPgSingleAmenityTv,
      setPgSingleAmenityBedding,
      setPgSingleAmenityGeyser,
      setPgSingleAmenityAc,
      setPgSingleAmenityAttachedBathroom,
      setPgDoubleAmenityCupboard,
      setPgDoubleAmenityTv,
      setPgDoubleAmenityBedding,
      setPgDoubleAmenityGeyser,
      setPgDoubleAmenityAc,
      setPgDoubleAmenityAttachedBathroom,
      setPgThreeAmenityCupboard,
      setPgThreeAmenityTv,
      setPgThreeAmenityBedding,
      setPgThreeAmenityGeyser,
      setPgThreeAmenityAc,
      setPgThreeAmenityAttachedBathroom,
      setPgFourAmenityCupboard,
      setPgFourAmenityTv,
      setPgFourAmenityBedding,
      setPgFourAmenityGeyser,
      setPgFourAmenityAc,
      setPgFourAmenityAttachedBathroom,
      setPgPlaceAvailableFor,
      setPgPreferredGuests,
      setPgAvailableFromDate,
      setPgAvailableFromText,
      setPgFoodIncluded,
      setPgMealBreakfast,
      setPgMealLunch,
      setPgMealDinner,
      setPgRuleNoSmoking,
      setPgRuleNoGuardianStay,
      setPgRuleNoOppositeEntry,
      setPgRuleNoDrinking,
      setPgRuleNoNonVeg,
      setPgGateClosingTime,
      setPgDescription,
      setPgLaundryAvailable,
      setPgRoomCleaningAvailable,
      setPgWardenFacilityAvailable,
      setPgAmenityCommonTv,
      setPgAmenityLift,
      setPgAmenityWifi,
      setPgAmenityPowerBackup,
      setPgAmenityMess,
      setPgAmenityRefrigerator,
      setPgAmenityCookingAllowed,
      setFlatmatesRoomType,
      setFlatmatesTenantType,
      setFlatmatesAttachedBathroom,
      setFlatmatesBathroomType,
      setFlatmatesAcRoom,
      setFlatmatesBalcony,
      setFlatmatesSmokingAllowed,
      setFlatmatesDrinkingAllowed,
      setApartmentType,
      setApartmentName,
      setBhkType,
      setOwnershipType,
      setLeaseYears,
      setFloor,
      setTotalFloors,
      setPropertyAge,
      setFacing,
      setPrice,
      setDeposit,
      setMaintenance,
      setDepositNegotiable,
      setCommercialLeaseDurationYears,
      setCommercialLockinPeriodYears,
      setCommercialIdealForTags,
      setCommercialIdealForInput,
      setPropertyAvailableFor,
      setRentNegotiable,
      setCurrentlyUnderLoan,
      setKitchenType,
      setMonthlyMaintenanceType,
      setMaintenanceAmount,
      setAvailableFromDate,
      setAvailableFromText,
      setPreferredAnyone,
      setPreferredFamily,
      setPreferredBachelorFemale,
      setPreferredBachelorMale,
      setPreferredCompany,
      setBedrooms,
      setBathrooms,
      setAreaSqft,
      setCarpetAreaSqft,
      setPlotAreaSqft,
      setPlotLengthFt,
      setPlotWidthFt,
      setBoundaryWall,
      setFloorsAllowed,
      setCornerPlot,
      setInsideGatedProject,
      setGatedProjectName,
      setFloorType,
      setFurnishing,
      setParking,
      setBalconies,
      setWaterSupply,
      setLandWaterSupply,
      setLandElectricityConnection,
      setLandSewageConnection,
      setLandFacingRoadWidthFt,
      setLandAddDirectionTip,
      setPetAllowed,
      setGym,
      setNonVegAllowed,
      setGatedSecurity,
      setWhoWillShowProperty,
      setPowerBackupType,
      setCurrentPropertyCondition,
      setMoreSimilarUnitsAvailable,
      setDirectionTip,
      setCommercialPreviousOccupancy,
      setCommercialWantPainted,
      setCommercialWantCleaned,
      setCommercialPowerBackupType,
      setCommercialLiftType,
      setCommercialParkingType,
      setCommercialParkingSlots,
      setCommercialWashroomType,
      setCommercialWaterStorageFacility,
      setCommercialSecurity,
      setCommercialBusinessRunning,
      setAmenityLift,
      setAmenityPowerBackup,
      setAmenityGasPipeline,
      setAmenityIntercom,
      setAmenityInternetServices,
      setAmenityAirConditioner,
      setAmenityClubHouse,
      setAmenitySwimmingPool,
      setAmenityChildrenPlayArea,
      setAmenityFireSafety,
      setAmenityServantRoom,
      setAmenityShoppingCenter,
      setAmenityPark,
      setAmenityRainWaterHarvesting,
      setAmenitySewageTreatmentPlant,
      setAmenityHouseKeeping,
      setAmenityVisitorParking,
      setLandOwnership,
      setLandLeaseTermYears,
      setLandSaleDeedCertificate,
      setLandEncumbranceCertificate,
      setLandConversionCertificate,
      setLandReraApproved,
      setLandKhataCertificate,
      setKhataCertificate,
      setSaleDeedCertificate,
      setSaleAgreement,
      setPropertyTaxPaid,
      setOccupancyCertificate,
    }),
    []
  );

  const { currentFlowSteps, getCurrentStepIndex, canGoNext, canGoBack, getNextStep, getPreviousStep } =
    usePropertyWizardFlowSync({
      flowKey,
      step,
      setStep,
      setPickerOpen: () => setPickerOpen(null),
      setError,
      resetApi: flowResetApi,
    });

  const flowLabel = useMemo(() => flowLabelForKey(flowKey), [flowKey]);

  const secondaryPhoneDigits = useMemo(() => {
    return String(secondaryPhone ?? '').replace(/[^0-9]/g, '');
  }, [secondaryPhone]);

  const secondaryPhoneToSave = useMemo(() => {
    const digits = secondaryPhoneDigits.trim();
    if (!digits) return null;
    const cc = String(secondaryCountryCode ?? '').trim() || '+91';
    return `${cc}${digits}`;
  }, [secondaryCountryCode, secondaryPhoneDigits]);

  const pgPreferredGuestText = (v: typeof pgPreferredGuests) => {
    if (v === 'working_professional') return 'Working Professional';
    if (v === 'student') return 'Student';
    if (v === 'both') return 'Both';
    return 'Select';
  };

  const pgOppositeEntryLabel = useMemo(() => {
    if (pgPlaceAvailableFor === 'male') return "No Girl's Entry";
    if (pgPlaceAvailableFor === 'female') return "No Boy's Entry";
    return '';
  }, [pgPlaceAvailableFor]);

  const fallbackCityByState = useMemo(() => {
    return {
      Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
      Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
      Rajasthan: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota'],
      'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior'],
    } as Record<string, string[]>;
  }, []);

  const [states, setStates] = useState<StateRow[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [localities, setLocalities] = useState<LocalityRow[]>([]);
  const selectedStateId = useMemo(() => {
    const s = states.find((x) => x.name.toLowerCase() === stateValue.trim().toLowerCase());
    return s?.id ?? null;
  }, [stateValue, states]);

  const selectedCityId = useMemo(() => {
    const c = cities.find((x) => x.name.toLowerCase() === cityValue.trim().toLowerCase());
    return c?.id ?? null;
  }, [cities, cityValue]);

  const selectedStateName = useMemo(() => {
    const s = states.find((x) => x.name.toLowerCase() === stateValue.trim().toLowerCase());
    return s?.name ?? (stateValue.trim() || '');
  }, [stateValue, states]);

  const selectedCityName = useMemo(() => {
    const c = cities.find((x) => x.name.toLowerCase() === cityValue.trim().toLowerCase());
    return c?.name ?? (cityValue.trim() || '');
  }, [cities, cityValue]);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data, error: fetchError } = await supabase.from('states').select('id,name').order('name');
        if (!active) return;
        if (fetchError) throw new Error(fetchError.message);
        setStates(((data as any) ?? []) as StateRow[]);
      } catch {
        if (!active) return;
        setStates([]);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      if (!selectedStateId) {
        setCities([]);
        setLocalities([]);
        return;
      }
      try {
        const { data, error: fetchError } = await supabase
          .from('cities')
          .select('id,state_id,name')
          .eq('state_id', selectedStateId)
          .order('name');
        if (!active) return;
        if (fetchError) throw new Error(fetchError.message);
        setCities(((data as any) ?? []) as CityRow[]);
      } catch {
        if (!active) return;
        setCities([]);
        setLocalities([]);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [selectedStateId]);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      if (!selectedCityId) {
        setLocalities([]);
        return;
      }
      try {
        const { data, error: fetchError } = await supabase
          .from('localities')
          .select('id,city_id,name')
          .eq('city_id', selectedCityId)
          .order('name');
        if (!active) return;
        if (fetchError) throw new Error(fetchError.message);
        setLocalities(((data as any) ?? []) as LocalityRow[]);
      } catch {
        if (!active) return;
        setLocalities([]);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [selectedCityId]);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const token = await getMapboxToken();
        if (!active) return;
        setMapboxToken(String(token ?? '').trim());
      } catch {
        if (!active) return;
        setMapboxToken('');
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const stateOptions = useMemo(() => {
    if (states.length) return states.map((s) => s.name);
    return Object.keys(fallbackCityByState);
  }, [fallbackCityByState, states]);

  const cityOptions = useMemo(() => {
    if (cities.length) return cities.map((c) => c.name);
    return fallbackCityByState[stateValue] ?? [];
  }, [cities, fallbackCityByState, stateValue]);

  const localityOptions = useMemo(() => {
    if (localities.length) return localities.map((l) => l.name);
    return [] as string[];
  }, [localities]);

  React.useEffect(() => {
    let active = true;
    const q = localityValue.trim();
    if (!localityTyped) {
      setLocalitySuggestions([]);
      return;
    }

    if (!q || q.length < 2) {
      setLocalitySuggestions([]);
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        try {
          setLocalityLoading(true);
          const suffix = `${selectedCityName || ''} ${selectedStateName || ''}`.trim();
          const results = await searchPlaces(`${q}, ${suffix}`.trim());
          if (!active) return;

          const filtered = results
            .filter((x) => {
              const name = String((x as any)?.place_name ?? '').toLowerCase();
              if (selectedStateName && !name.includes(selectedStateName.trim().toLowerCase())) return false;
              if (selectedCityName && !name.includes(selectedCityName.trim().toLowerCase())) return false;
              return true;
            })
            .map((x) => {
              const place = String((x as any)?.place_name ?? '').trim();
              const label = place.split(',')[0]?.trim() || place;
              return { id: String((x as any)?.id ?? place), label, full: place };
            })
            .slice(0, 6);

          setLocalitySuggestions(filtered);
        } catch {
          if (!active) return;
          setLocalitySuggestions([]);
        } finally {
          if (!active) return;
          setLocalityLoading(false);
        }
      })();
    }, 350);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [localityValue, localityTyped, selectedCityName, selectedStateName]);

  const next = () => {
    // Use centralized flow navigation
    if (!canGoNext) return;
    
    // Special validation for specific steps
    if (step === 'basic') {
      setError(null);
      setStep(getNextStep!);
      return;
    }
    
    if (step === 'pg_room_types') {
      const anySelected = pgRoomSingle || pgRoomDouble || pgRoomThree || pgRoomFour;
      if (!anySelected) {
        setError('Please select at least one room type.');
        return;
      }
      setError(null);
      setStep(getNextStep!);
      return;
    }
    
    if (step === 'pg_room_details') {
      const checks: Array<{ label: string; rent: string; deposit: string; enabled: boolean }> = [
        { label: 'Single', rent: pgSingleRent, deposit: pgSingleDeposit, enabled: pgRoomSingle },
        { label: 'Double', rent: pgDoubleRent, deposit: pgDoubleDeposit, enabled: pgRoomDouble },
        { label: 'Three', rent: pgThreeRent, deposit: pgThreeDeposit, enabled: pgRoomThree },
        { label: 'Four', rent: pgFourRent, deposit: pgFourDeposit, enabled: pgRoomFour },
      ];
      for (const check of checks) {
        if (check.enabled) {
          if (!check.rent.trim()) {
            setError(`${check.label} Room Rent is required.`);
            return;
          }
          if (!isValidSingleDecimalNumber(check.rent)) {
            setError(`${check.label} Room Rent me sirf number (single decimal allowed) enter kare.`);
            return;
          }
          if (!check.deposit.trim()) {
            setError(`${check.label} Room Deposit is required.`);
            return;
          }
          if (!isValidSingleDecimalNumber(check.deposit)) {
            setError(`${check.label} Room Deposit me sirf number (single decimal allowed) enter kare.`);
            return;
          }
        }
      }
      setError(null);
      setStep(getNextStep!);
      return;
    }
    if (step === 'details') {
      const isCommercialAny = propertyCategory === 'commercial' && (adType === 'rent' || adType === 'sale');
      const isLandPlot = propertyCategory === 'land_plot' && (adType === 'sale' || adType === 'resale');
      const floorN = floorToNumber(floor);
      const resale = adType === 'resale';
      const isFlatmates = adType === 'flatmates';
      const isResidentialRent = propertyCategory === 'residential' && adType === 'rent';
      const needsTotalFloors = isFlatmates
        ? true
        : resale
          ? apartmentType === 'apartment' || apartmentType === 'standalone_building'
          : apartmentType !== 'independent_house_villa';
      const totalN = needsTotalFloors ? floorToNumber(totalFloors) : null;

      if (isLandPlot) {
        const cleanedPlotArea = String(plotAreaSqft ?? '').trim();
        if (!cleanedPlotArea || !isValidSingleDecimalNumber(cleanedPlotArea)) {
          setError('Plot Area me sirf number (single decimal allowed) enter kare.');
          return;
        }
        if (Number(cleanedPlotArea) < 100) {
          setError('Plot Area must be at least 100 sq.ft.');
          return;
        }

        const cleanedLength = String(plotLengthFt ?? '').trim();
        if (!cleanedLength || !isValidSingleDecimalNumber(cleanedLength) || Number(cleanedLength) <= 0) {
          setError('Please enter Length (ft.).');
          return;
        }

        if (boundaryWall === null) {
          setError('Please select Boundary Wall.');
          return;
        }
        if (!floorsAllowed.trim()) {
          setError('Please enter Floors Allowed.');
          return;
        }
        if (Number(floorsAllowed.trim()) < 0) {
          setError('Floors Allowed must be 0 or more.');
          return;
        }
        if (cornerPlot === null) {
          setError('Please select Corner Plot.');
          return;
        }
        if (insideGatedProject === null) {
          setError('Please select Inside Gated Project.');
          return;
        }
        if (insideGatedProject === 1 && !gatedProjectName.trim()) {
          setError('Please enter Project Name.');
          return;
        }
        if (!facing.trim()) {
          setError('Please select Facing.');
          return;
        }

        setError(null);
        setStep(getNextStep!);
        return;
      }

      if (isCommercialAny) {
        if (!propertyType.trim()) {
          setError('Please select Property Type.');
          return;
        }
        if (!commercialBuildingType.trim()) {
          setError('Please select Building Type.');
          return;
        }
        if (!propertyAge.trim()) {
          setError('Please select Property Age.');
          return;
        }
        if (!floor.trim()) {
          setError('Please select Floor.');
          return;
        }
        if (!totalFloors.trim()) {
          setError('Please select Total Floor.');
          return;
        }

        const cleanedArea = String(areaSqft ?? '').trim();
        if (!cleanedArea || !isValidSingleDecimalNumber(cleanedArea)) {
          setError('Built Up Area me sirf number (single decimal allowed) enter kare.');
          return;
        }

        if (adType === 'sale') {
          const cleanedCarpet = String(carpetAreaSqft ?? '').trim();
          if (cleanedCarpet && !isValidSingleDecimalNumber(cleanedCarpet)) {
            setError('Carpet Area me sirf number (single decimal allowed) enter kare.');
            return;
          }
        }

        if (!furnishing) {
          setError('Please select Furnishing.');
          return;
        }

        setError(null);
        setStep(getNextStep!);
        return;
      }

      if (!bhkType.trim()) {
        setError('Please select BHK Type.');
        return;
      }

      if (floorN === null) {
        setError('Please select No. of Floor(s).');
        return;
      }

      if (isResidentialRent) {
        const cleanedArea = String(areaSqft ?? '').trim();
        if (!cleanedArea || !isValidSingleDecimalNumber(cleanedArea)) {
          setError('Built Up Area me sirf number (single decimal allowed) enter kare.');
          return;
        }
        if (!propertyAge.trim()) {
          setError('Please select Property Age.');
          return;
        }
        if (!facing.trim()) {
          setError('Please select Facing.');
          return;
        }
      }

      if (isFlatmates) {
        const needsApartmentName = apartmentType === 'apartment' || apartmentType === 'gated_community_villa';
        if (needsApartmentName && !apartmentName.trim()) {
          setError('Please enter Apartment Name.');
          return;
        }
        if (!flatmatesRoomType) {
          setError('Please select Room Type.');
          return;
        }
        if (!flatmatesTenantType) {
          setError('Please select Tenant Type.');
          return;
        }
        if (!propertyAge.trim()) {
          setError('Please select Property Age.');
          return;
        }
      }

      if (resale) {
        if (!isLandPlot) {
          if (!ownershipType) {
            setError('Please select Ownership Type.');
            return;
          }
          if (ownershipType === 'on_lease') {
            const ly = Number(String(leaseYears ?? '').trim() || 0);
            if (!ly || ly < 1) {
              setError('Please enter Lease Years.');
              return;
            }
          }
          if (!floorType) {
            setError('Please select Floor Type.');
            return;
          }
          if (apartmentType === 'independent_house_villa') {
            const cleanedPlot = String(plotAreaSqft ?? '').trim();
            if (!cleanedPlot || !isValidSingleDecimalNumber(cleanedPlot)) {
              setError('Plot Area me sirf number (single decimal allowed) enter kare.');
              return;
            }
          }
          if (carpetAreaSqft.trim() && !isValidSingleDecimalNumber(carpetAreaSqft)) {
            setError('Carpet Area me sirf number (single decimal allowed) enter kare.');
            return;
          }
        }
      }

      if (needsTotalFloors) {
        if (totalN === null) {
          setError('Please select Total Floor(s).');
          return;
        }
        if (floorN > totalN) {
          setError('No. of floors Total Floor(s) se bada nahi ho sakta.');
          return;
        }
      }

      const cleanedArea = String(areaSqft ?? '').trim();
      if (!cleanedArea || !isValidSingleDecimalNumber(cleanedArea)) {
        setError('Built Up Area me sirf number (single decimal allowed) enter kare.');
        return;
      }

      setError(null);
      setStep(getNextStep!);
      return;
    }
    if (step === 'location') {
      const pin = String(pincode ?? '').replace(/[^0-9]/g, '').slice(0, 6);
      if (pin.length !== 6) {
        setError('Pincode must be 6 digits.');
        return;
      }
      setError(null);
      setStep(getNextStep!);
      return;
    }
    if (step === 'pg_details') {
      if (!pgPlaceAvailableFor) {
        setError('Please select Place is available for.');
        return;
      }
      if (!pgPreferredGuests) {
        setError('Please select Preferred Guests.');
        return;
      }
      if (!pgAvailableFromDate && !parseDateDdMmYyyy(pgAvailableFromText)) {
        setError('Please select Available From date.');
        return;
      }
      if (!pgFoodIncluded) {
        setError('Please select Food Included.');
        return;
      }
      if (pgFoodIncluded === 'yes') {
        const anyMeal = pgMealBreakfast || pgMealLunch || pgMealDinner;
        if (!anyMeal) {
          setError('Please select at least one meal (Breakfast/Lunch/Dinner).');
          return;
        }
      }
      if (!pgGateClosingTime) {
        setError('Please select Gate Closing Time.');
        return;
      }

      setError(null);
      setStep(getNextStep!);
      return;
    }
    if (step === 'pricing') {
      if (adType === 'resale') {
        if (!isValidSingleDecimalNumber(price)) {
          setError('Expected Price me sirf number (single decimal allowed) enter kare.');
          return;
        }
        if (!availableFromDate && !parseDateDdMmYyyy(availableFromText)) {
          setError('Please select Available From date.');
          return;
        }
        if (!isLandPlot && !kitchenType) {
          setError('Please select Kitchen Type.');
          return;
        }
      } else if (isCommercialSale) {
        if (!isValidSingleDecimalNumber(price)) {
          setError('Expected Price me sirf number (single decimal allowed) enter kare.');
          return;
        }
        if (!ownershipType) {
          setError('Please select Ownership Type.');
          return;
        }
        if (!availableFromDate && !parseDateDdMmYyyy(availableFromText)) {
          setError('Please select Available From date.');
          return;
        }
      } else if (isCommercialRent) {
        if (!isValidSingleDecimalNumber(price)) {
          setError('Expected Rent me sirf number (single decimal allowed) enter kare.');
          return;
        }
        if (!isValidSingleDecimalNumber(deposit)) {
          setError('Deposit me sirf number (single decimal allowed) enter kare.');
          return;
        }
        if (monthlyMaintenanceType === 'extra' && !isValidSingleDecimalNumber(maintenanceAmount)) {
          setError('Monthly Maintenance me sirf number (single decimal allowed) enter kare.');
          return;
        }
        const leaseY = Number(String(commercialLeaseDurationYears ?? '').trim() || 0);
        if (!leaseY || leaseY < 1 || leaseY > 99) {
          setError('Please select Lease Duration (Years).');
          return;
        }
        const lockY = Number(String(commercialLockinPeriodYears ?? '').trim() || 0);
        if (!lockY || lockY < 1 || lockY > 99) {
          setError('Please select Lockin Period (Years).');
          return;
        }
        if (!availableFromDate && !parseDateDdMmYyyy(availableFromText)) {
          setError('Please select Available From date.');
          return;
        }
      } else {
        if (!isValidSingleDecimalNumber(price)) {
          setError('Expected Rent/Lease Amount me sirf number (single decimal allowed) enter kare.');
          return;
        }
        if (propertyAvailableFor === 'only_rent' && !isValidSingleDecimalNumber(deposit)) {
          setError('Expected Deposit me sirf number (single decimal allowed) enter kare.');
          return;
        }
        if (monthlyMaintenanceType === 'extra' && !isValidSingleDecimalNumber(maintenanceAmount)) {
          setError('Maintenance Amount me sirf number (single decimal allowed) enter kare.');
          return;
        }
        if (!availableFromDate && !parseDateDdMmYyyy(availableFromText)) {
          setError('Please select Available From date.');
          return;
        }
      }

      if (isLandPlot) {
        if (!isValidSingleDecimalNumber(price)) {
          setError('Please enter Expected Price.');
          return;
        }
        if (!availableFromDate && !parseDateDdMmYyyy(availableFromText)) {
          setError('Please select Available From date.');
          return;
        }
      }
      setError(null);
      setStep(getNextStep!);
      return;
    }
    if (step === 'amenities') {
      if (secondaryPhoneDigits.length) {
        if (secondaryCountryCode === '+91' && secondaryPhoneDigits.length !== 10) {
          setError('Secondary phone must be 10 digits for +91.');
          return;
        }
        if (secondaryCountryCode !== '+91' && (secondaryPhoneDigits.length < 6 || secondaryPhoneDigits.length > 15)) {
          setError('Secondary phone must be between 6 and 15 digits.');
          return;
        }
      }

      if (isCommercialAny) {
        if (!commercialPowerBackupType) {
          setError('Please select Power Backup.');
          return;
        }
        if (!commercialLiftType) {
          setError('Please select Lift.');
          return;
        }
        if (!commercialParkingType) {
          setError('Please select Parking.');
          return;
        }
        if ((commercialParkingType === 'public_and_reserved' || commercialParkingType === 'reserved') && !commercialParkingSlots.trim()) {
          setError('Please enter No of Available Slots.');
          return;
        }
        if ((commercialParkingType === 'public_and_reserved' || commercialParkingType === 'reserved') && (!Number(commercialParkingSlots.trim()) || Number(commercialParkingSlots.trim()) < 1)) {
          setError('No of Available Slots must be at least 1.');
          return;
        }
        if (!commercialWashroomType) {
          setError('Please select Washroom(s).');
          return;
        }
        if (commercialWaterStorageFacility === null) {
          setError('Please select Water Storage Facility.');
          return;
        }
        if (commercialSecurity === null) {
          setError('Please select Security.');
          return;
        }
        if (!currentPropertyCondition.trim()) {
          setError('Please select Current Property Condition.');
          return;
        }
        if (!commercialBusinessRunning.trim()) {
          setError('Please select what business is currently running.');
          return;
        }
        if (moreSimilarUnitsAvailable === null) {
          setError('Please select More similar units/properties available.');
          return;
        }
      }

      if (isLandPlot) {
        if (!landWaterSupply) {
          setError('Please select Water Supply.');
          return;
        }
        if (!landElectricityConnection) {
          setError('Please select Electricity Connection.');
          return;
        }
        if (!landSewageConnection) {
          setError('Please select Sewage Connection.');
          return;
        }
        if (!landFacingRoadWidthFt.trim() || !Number(landFacingRoadWidthFt.trim())) {
          setError('Please enter Width of Facing Road (ft.).');
          return;
        }
        if (moreSimilarUnitsAvailable === null) {
          setError('Please select Do you have more similar units/properties available?.');
          return;
        }
        if (gatedSecurity === null) {
          setError('Please select Gated Security.');
          return;
        }
        if (landAddDirectionTip && !directionTip.trim()) {
          setError('Please enter Directions Tip.');
          return;
        }
      }

      if (adType === 'flatmates') {
        if (flatmatesAttachedBathroom === null) {
          setError('Please select Attached Bathroom.');
          return;
        }
        if (flatmatesAttachedBathroom === 0 && !flatmatesBathroomType) {
          setError('Please select Private Bathroom or Shared Bathroom.');
          return;
        }
        if (flatmatesAcRoom === null) {
          setError('Please select AC Room.');
          return;
        }
        if (flatmatesBalcony === null) {
          setError('Please select Balcony.');
          return;
        }
        if (nonVegAllowed === null) {
          setError('Please select Non-Veg Allowed.');
          return;
        }
        if (flatmatesSmokingAllowed === null) {
          setError('Please select Smoking Allowed.');
          return;
        }
        if (flatmatesDrinkingAllowed === null) {
          setError('Please select Drinking Allowed.');
          return;
        }
        if (gym === null) {
          setError('Please select Gym.');
          return;
        }
        if (gatedSecurity === null) {
          setError('Please select Gated Security.');
          return;
        }
        if (!whoWillShowProperty.trim()) {
          setError('Please select Who will show the property.');
          return;
        }
        if (!waterSupply) {
          setError('Please select Water Supply.');
          return;
        }
      }

      setError(null);
      setStep(getNextStep!);
      return;
    }
    if (step === 'uploads') {
      setError(null);
      setStep(getNextStep!);
      return;
    }
    if (step === 'additional_info') {
      if (isCommercialAny) {
        if (!description.trim()) {
          setError('Please enter Property Description.');
          return;
        }
        if (!commercialPreviousOccupancy) {
          setError('Please select Previous Occupancy.');
          return;
        }
        if (!whoWillShowProperty.trim()) {
          setError('Please select Who will show the property.');
          return;
        }
        if (commercialWantPainted === null) {
          setError('Please select I want to get my property painted.');
          return;
        }
        if (commercialWantCleaned === null) {
          setError('Please select I want to get my property cleaned.');
          return;
        }

        if (secondaryPhoneDigits.length && secondaryPhoneDigits.length !== 10) {
          setError('Secondary phone must be 10 digits.');
          return;
        }

        setError(null);
        setStep(getNextStep!);
        return;
      }

      if (isLandPlot) {
        if (!landOwnership) {
          setError('Please select Ownership.');
          return;
        }
        if (landOwnership === 'leasehold' && (!landLeaseTermYears.trim() || !Number(landLeaseTermYears.trim()))) {
          setError('Please enter Lease Term.');
          return;
        }
        if (!landSaleDeedCertificate) {
          setError('Please select Sale Deed Certificate.');
          return;
        }
        if (!landEncumbranceCertificate) {
          setError('Please select Encumbrance certificate.');
          return;
        }
        if (!landConversionCertificate) {
          setError('Please select Conversion certificate.');
          return;
        }
        if (!landReraApproved) {
          setError('Please select Is the property RERA Approved?.');
          return;
        }
        if (!landKhataCertificate) {
          setError('Please select Khata certificate.');
          return;
        }

        setError(null);
        setStep(getNextStep!);
        return;
      }
      if (!khataCertificate) {
        setError('Please select Khata Certificate.');
        return;
      }
      if (!saleDeedCertificate) {
        setError('Please select Sale Deed Certificate.');
        return;
      }
      if (saleDeedCertificate === 'no' && !saleAgreement) {
        setError('Please select Sale Agreement.');
        return;
      }
      if (!propertyTaxPaid) {
        setError('Please select Property Tax.');
        return;
      }
      if (!occupancyCertificate) {
        setError('Please select Occupancy Certificate.');
        return;
      }
      setError(null);
      setStep(getNextStep!);
      return;
    }
    if (step === 'schedule') {
      if (isLandPlot) {
        if (!whoWillShowProperty.trim()) {
          setError('Please select Who will show the plot.');
          return;
        }
        if (secondaryPhoneDigits.length && secondaryPhoneDigits.length !== 10) {
          setError('Secondary phone must be 10 digits.');
          return;
        }
      }
      if (!scheduleAllDay) {
        if (!scheduleStart || !scheduleEnd) {
          setError('Please select start time and end time (or select Available All Day).');
          return;
        }
      }
      setError(null);
      setStep(getNextStep!);
      return;
    }
  };

  const back = () => {
    if (saving) return;
    
    // Use centralized flow navigation
    if (!canGoBack) {
      router.back();
      return;
    }
    
    setStep(getPreviousStep!);
  };

  const pickPhotos = async () => {
    setError(null);
    const remaining = Math.max(10 - photos.length, 0);
    if (remaining <= 0) {
      setError('Maximum 10 photos allowed.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });

    if (result.canceled) return;

    const compressJpegIfNeeded = async (uri: string) => {
      try {
        const size = await getLocalFileSizeBytes(uri);
        if (size !== null && size <= TARGET_IMAGE_BYTES) return uri;

        if (Platform.OS === 'web') {
          const res = await fetch(uri);
          const blob = await res.blob();
          const bmp = await createImageBitmap(blob as any);
          const maxDim = 1600;
          const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
          const w = Math.max(1, Math.round(bmp.width * scale));
          const h = Math.max(1, Math.round(bmp.height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return uri;
          ctx.drawImage(bmp as any, 0, 0, w, h);

          let q = 0.82;
          let dataUrl = canvas.toDataURL('image/jpeg', q);
          while (dataUrl.length * 0.75 > TARGET_IMAGE_BYTES && q > 0.35) {
            q -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', q);
          }
          return dataUrl;
        }

        try {
          const mod = require('expo-image-manipulator');
          const manipulateAsync = mod?.manipulateAsync ?? mod?.default?.manipulateAsync;
          const SaveFormat = mod?.SaveFormat ?? mod?.default?.SaveFormat;
          if (!manipulateAsync || !SaveFormat) return uri;

          const maxDim = 1600;
          let q = 0.82;
          let currentUri = uri;
          for (let i = 0; i < 6; i++) {
            const result = await manipulateAsync(
              currentUri,
              [{ resize: { width: maxDim } }],
              { compress: q, format: SaveFormat.JPEG }
            );
            const outUri = String(result?.uri ?? '').trim();
            if (!outUri) return uri;

            const outSize = await getLocalFileSizeBytes(outUri);
            if (outSize !== null && outSize <= TARGET_IMAGE_BYTES) return outUri;

            currentUri = outUri;
            q = Math.max(0.35, q - 0.12);
          }
          return currentUri;
        } catch {
          return uri;
        }
      } catch {
        return uri;
      }
    };

    const accepted: string[] = [];
    for (const asset of result.assets) {
      const uri = asset?.uri;
      if (!uri) continue;

      const mimeHint = String(asset?.mimeType ?? asset?.fileName ?? '').trim();
      if (!(await isAllowedPhotoUri(uri, mimeHint))) {
        setError('Only JPG/JPEG images are allowed.');
        continue;
      }

      const size = typeof asset?.fileSize === 'number' ? asset.fileSize : null;
      const finalSize = size ?? (await getLocalFileSizeBytes(uri));
      if (finalSize !== null && finalSize > MAX_IMAGE_UPLOAD_BYTES) {
        setError('Image too large. Please select an image up to 10MB.');
        continue;
      }

      const finalUri = await compressJpegIfNeeded(uri);
      mediaMimeByUriRef.current[finalUri] = finalUri.startsWith('data:image/') ? 'image/jpeg' : String(asset?.mimeType ?? 'image/jpeg').toLowerCase();
      if (finalUri !== uri) delete mediaMimeByUriRef.current[uri];
      accepted.push(finalUri);
    }

    if (!accepted.length) return;
    setPhotos((p) => [...p, ...accepted].slice(0, 10));
  };

  const pickVideo = async () => {
    setError(null);
    if (videos.length >= 2) {
      setError('Maximum 2 videos allowed.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
    });

    if (result.canceled) return;
    const asset = result.assets[0];

    const rawDuration = typeof asset?.duration === 'number' ? asset.duration : null;
    const durationSec = rawDuration === null ? null : rawDuration > 300 ? rawDuration / 1000 : rawDuration;
    if (durationSec !== null && durationSec > MAX_VIDEO_DURATION_SEC) {
      setError('Video must be 2 minutes or less.');
      return;
    }

    if (!asset?.uri) return;

    const videoMimeHint = String(asset?.mimeType ?? asset?.fileName ?? '').trim();
    if (!(await isAllowedVideoUri(asset.uri, videoMimeHint))) {
      setError('Only MP4 videos are allowed.');
      return;
    }

    const size = typeof asset?.fileSize === 'number' ? asset.fileSize : null;
    const finalSize = size ?? (await getLocalFileSizeBytes(asset.uri));
    if (finalSize !== null && finalSize > MAX_VIDEO_BYTES) {
      setError('Video too large. Please select an MP4 up to 30MB.');
      return;
    }

    mediaMimeByUriRef.current[asset.uri] = String(asset?.mimeType ?? 'video/mp4').toLowerCase();
    setVideos((p) => [...p, asset.uri].slice(0, 2));
  };

  const buildPropertyRecord = () => {
    const dateToSave = availableFromDate ?? parseDateDdMmYyyy(availableFromText);

    return {
        property_category: propertyCategory,
        ad_type: adType,
        listing_type: listingType,
        property_type: propertyType,
        ownership_type: ownershipType || null,
        title: title.trim() || null,
        description: description.trim() || null,
        price: price.trim() ? Number(price) : null,
        deposit: isCommercialRent ? (deposit.trim() ? Number(deposit) : null) : propertyAvailableFor === 'only_lease' ? null : deposit.trim() ? Number(deposit) : null,
        maintenance: isCommercialRent
          ? (monthlyMaintenanceType === 'extra' && maintenanceAmount.trim() ? Number(maintenanceAmount.trim()) : null)
          : (monthlyMaintenanceType === 'extra' ? maintenanceAmount : maintenance).trim()
            ? Number((monthlyMaintenanceType === 'extra' ? maintenanceAmount : maintenance).trim())
            : null,
        available_from: dateToSave ? dateToSave.toISOString().slice(0, 10) : null,
        rent_negotiable: isCommercialRent ? rentNegotiable : null,
        deposit_negotiable: isCommercialAny ? depositNegotiable : null,
        maintenance_extra: monthlyMaintenanceType === 'extra',
        lease_duration_years: isCommercialRent ? (commercialLeaseDurationYears.trim() ? Number(commercialLeaseDurationYears.trim()) : null) : null,
        lockin_period_years: isCommercialRent ? (commercialLockinPeriodYears.trim() ? Number(commercialLockinPeriodYears.trim()) : null) : null,
        ideal_for_tags: isCommercialAny ? commercialIdealForTags : null,
        bedrooms: bedrooms.trim() ? Number(bedrooms) : null,
        bathrooms: bathrooms.trim() ? Number(bathrooms) : null,
        balconies,
        water_supply: waterSupply || null,
        pet_allowed: petAllowed,
        gym,
        non_veg_allowed: nonVegAllowed,
        gated_security: gatedSecurity,
        who_will_show_property: whoWillShowProperty.trim() || null,
        current_property_condition: currentPropertyCondition.trim() || null,
        secondary_phone: secondaryPhoneToSave,
        more_similar_units_available: moreSimilarUnitsAvailable,
        direction_tip: directionTip.trim() || null,
        amenity_lift: amenityLift,
        amenity_internet_services: amenityInternetServices,
        amenity_air_conditioner: amenityAirConditioner,
        amenity_club_house: amenityClubHouse,
        amenity_intercom: amenityIntercom,
        amenity_swimming_pool: amenitySwimmingPool,
        amenity_children_play_area: amenityChildrenPlayArea,
        amenity_fire_safety: amenityFireSafety,
        amenity_servant_room: amenityServantRoom,
        amenity_shopping_center: amenityShoppingCenter,
        amenity_gas_pipeline: amenityGasPipeline,
        amenity_park: amenityPark,
        amenity_rain_water_harvesting: amenityRainWaterHarvesting,
        amenity_sewage_treatment_plant: amenitySewageTreatmentPlant,
        amenity_house_keeping: amenityHouseKeeping,
        amenity_power_backup: amenityPowerBackup,
        amenity_visitor_parking: amenityVisitorParking,
        area_sqft: areaSqft.trim() ? Number(areaSqft) : null,
        carpet_area_sqft: carpetAreaSqft.trim() ? Number(carpetAreaSqft) : null,
        facing: facing.trim() || null,
        plot_area_sqft: plotAreaSqft.trim() ? Number(plotAreaSqft) : null,
        plot_length_ft: plotLengthFt.trim() ? Number(plotLengthFt) : null,
        plot_width_ft: plotWidthFt.trim() ? Number(plotWidthFt) : null,
        boundary_wall: boundaryWall,
        floors_allowed: floorsAllowed.trim() ? Number(floorsAllowed) : null,
        corner_plot: cornerPlot,
        inside_gated_project: insideGatedProject,
        gated_project_name: gatedProjectName.trim() || null,
        land_water_supply: landWaterSupply || null,
        land_electricity_connection: landElectricityConnection || null,
        land_sewage_connection: landSewageConnection || null,
        facing_road_width_ft: landFacingRoadWidthFt.trim() ? Number(landFacingRoadWidthFt) : null,
        land_sale_deed_certificate: landSaleDeedCertificate || null,
        land_encumbrance_certificate: landEncumbranceCertificate || null,
        land_conversion_certificate: landConversionCertificate || null,
        land_rera_approved: landReraApproved || null,
        land_khata_certificate: landKhataCertificate || null,
        commercial_power_backup_type: isCommercialAny ? (commercialPowerBackupType || null) : null,
        commercial_lift_type: isCommercialAny ? (commercialLiftType || null) : null,
        commercial_parking_type: isCommercialAny ? (commercialParkingType || null) : null,
        commercial_parking_slots: isCommercialAny && commercialParkingSlots.trim() ? Number(commercialParkingSlots.trim()) : null,
        commercial_washroom_type: isCommercialAny ? (commercialWashroomType || null) : null,
        commercial_water_storage_facility: isCommercialAny ? commercialWaterStorageFacility : null,
        commercial_security: isCommercialAny ? commercialSecurity : null,
        commercial_business_running: isCommercialAny ? (commercialBusinessRunning.trim() || null) : null,
        commercial_previous_occupancy: isCommercialAny ? (commercialPreviousOccupancy || null) : null,
        commercial_want_painted: isCommercialAny ? commercialWantPainted : null,
        commercial_want_cleaned: isCommercialAny ? commercialWantCleaned : null,
        furnishing,
        parking,
        address_line1: address1.trim() || null,
        address_line2: address2.trim() || null,
        state: stateValue.trim() || null,
        city: cityValue.trim() || null,
        locality: localityValue.trim() || null,
        pincode: pincode.trim() || null,
        latitude: mapPickerCoord?.lat ?? null,
        longitude: mapPickerCoord?.lng ?? null,
        contact_name: contactName.trim() || null,
        contact_phone: primaryContactPhone.trim() || null,
    };
  };

  const createPropertyIfNeeded = async () => {
    if (!requireSession()) return null;

    const ownerId = session?.user?.id ?? '';
    if (!ownerId) return null;

    const record = buildPropertyRecord();
    const existingId = createdPropertyIdRef.current;

    if (existingId) {
      const { error: updateError } = await supabase
        .from('properties')
        .update(record)
        .eq('id', existingId)
        .eq('owner_user_id', ownerId);
      if (updateError) throw new Error(updateError.message);
      return existingId;
    }

    const { data, error: insertError } = await supabase
      .from('properties')
      .insert({
        owner_user_id: ownerId,
        status: 'draft',
        ...record,
      })
      .select('id')
      .maybeSingle();

    if (insertError) throw new Error(insertError.message);
    const id = String((data as any)?.id ?? '').trim();
    if (!id) throw new Error('Failed to create property.');

    createdPropertyIdRef.current = id;
    return id;
  };

  const uploadMedia = async (propertyId: string) => {
    if (!requireSession()) return;

    const ownerId = session?.user?.id ?? '';
    if (!ownerId) throw new Error('Please sign in to upload media.');

    const rawBucket = 'property-uploads-raw';
    const items: UploadItem[] = [
      ...photos.map((uri) => ({ uri, kind: 'photo' as const })),
      ...videos.map((uri) => ({ uri, kind: 'video' as const })),
    ];

    for (const it of items) {
      if (isRemoteMediaUri(it.uri)) continue;

      const fileSize = await getLocalFileSizeBytes(it.uri);

      const mimeHint = mediaMimeByUriRef.current[it.uri] ?? '';
      const trustedWebPhoto = Platform.OS === 'web' && it.kind === 'photo' && photos.includes(it.uri);
      const trustedWebVideo = Platform.OS === 'web' && it.kind === 'video' && videos.includes(it.uri);

      if (it.kind === 'photo') {
        if (!trustedWebPhoto && !(await isAllowedPhotoUri(it.uri, mimeHint))) {
          throw new Error('Only JPG/JPEG images are allowed.');
        }
        if (fileSize !== null && fileSize > MAX_IMAGE_UPLOAD_BYTES) throw new Error('Image too large. Please select an image up to 10MB.');
      }

      if (it.kind === 'video') {
        if (!trustedWebVideo && !(await isAllowedVideoUri(it.uri, mimeHint))) {
          throw new Error('Only MP4 videos are allowed.');
        }
        if (fileSize !== null && fileSize > MAX_VIDEO_BYTES) throw new Error('Video too large. Please select an MP4 up to 30MB.');
      }

      const res = await fetch(it.uri);
      const blob = await res.blob();

      const ext = it.kind === 'video' ? 'mp4' : 'jpg';
      const rawPath = `properties/${propertyId}/${it.kind}s/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
      const contentType = it.kind === 'video' ? 'video/mp4' : 'image/jpeg';

      const { error: uploadError } = await supabase.storage.from(rawBucket).upload(rawPath, blob, { contentType, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      await processPropertyMediaUpload({
        propertyId,
        ownerUserId: ownerId,
        rawPath,
        kind: it.kind,
        blob,
      });
    }
  };

  const submit = async () => {
    setError(null);
    if (!requireSession()) return;

    try {
      setSaving(true);

      const propertyId = await createPropertyIfNeeded();
      if (!propertyId) return;

      await uploadMedia(propertyId);

      const { error: updateError } = await supabase.from('properties').update({ status: 'published' }).eq('id', propertyId);
      if (updateError) throw new Error(updateError.message);

      Alert.alert(
        isEditMode ? 'Property published' : 'Property posted',
        'Your property is now live and visible in search.'
      );
      router.replace({ pathname: '/properties/my-properties' } as any);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post property.');
    } finally {
      setSaving(false);
    }
  };

  const pageBg = '#FFFFFF';
  const border = '#E5E7EB';
  const titleColor = '#0F172A';
  const muted = '#64748B';
  const valueColor = '#475569';
  const valueWeight: any = '400';

  const clampAvailableFromDate = (d: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const max = new Date(today);
    max.setMonth(max.getMonth() + 2);
    max.setHours(23, 59, 59, 999);

    const picked = new Date(d);
    picked.setHours(0, 0, 0, 0);
    if (picked.getTime() < today.getTime()) return null;
    if (picked.getTime() > max.getTime()) return null;
    return picked;
  };

  const pgSelectedRoomTypes = useMemo(() => {
    const arr: Array<'single' | 'double' | 'three' | 'four'> = [];
    if (pgRoomSingle) arr.push('single');
    if (pgRoomDouble) arr.push('double');
    if (pgRoomThree) arr.push('three');
    if (pgRoomFour) arr.push('four');
    return arr;
  }, [pgRoomDouble, pgRoomFour, pgRoomSingle, pgRoomThree]);

  const pgRoomLabel = (k: 'single' | 'double' | 'three' | 'four') => {
    if (k === 'single') return 'Single Room Details';
    if (k === 'double') return 'Double Room Details';
    if (k === 'three') return 'Three Room Details';
    return 'Four Room Details';
  };

  const pgAmenityState = (k: 'single' | 'double' | 'three' | 'four') => {
    if (k === 'single') {
      return {
        cupboard: [pgSingleAmenityCupboard, setPgSingleAmenityCupboard] as const,
        tv: [pgSingleAmenityTv, setPgSingleAmenityTv] as const,
        bedding: [pgSingleAmenityBedding, setPgSingleAmenityBedding] as const,
        geyser: [pgSingleAmenityGeyser, setPgSingleAmenityGeyser] as const,
        ac: [pgSingleAmenityAc, setPgSingleAmenityAc] as const,
        attachedBathroom: [pgSingleAmenityAttachedBathroom, setPgSingleAmenityAttachedBathroom] as const,
      };
    }
    if (k === 'double') {
      return {
        cupboard: [pgDoubleAmenityCupboard, setPgDoubleAmenityCupboard] as const,
        tv: [pgDoubleAmenityTv, setPgDoubleAmenityTv] as const,
        bedding: [pgDoubleAmenityBedding, setPgDoubleAmenityBedding] as const,
        geyser: [pgDoubleAmenityGeyser, setPgDoubleAmenityGeyser] as const,
        ac: [pgDoubleAmenityAc, setPgDoubleAmenityAc] as const,
        attachedBathroom: [pgDoubleAmenityAttachedBathroom, setPgDoubleAmenityAttachedBathroom] as const,
      };
    }
    if (k === 'three') {
      return {
        cupboard: [pgThreeAmenityCupboard, setPgThreeAmenityCupboard] as const,
        tv: [pgThreeAmenityTv, setPgThreeAmenityTv] as const,
        bedding: [pgThreeAmenityBedding, setPgThreeAmenityBedding] as const,
        geyser: [pgThreeAmenityGeyser, setPgThreeAmenityGeyser] as const,
        ac: [pgThreeAmenityAc, setPgThreeAmenityAc] as const,
        attachedBathroom: [pgThreeAmenityAttachedBathroom, setPgThreeAmenityAttachedBathroom] as const,
      };
    }
    return {
      cupboard: [pgFourAmenityCupboard, setPgFourAmenityCupboard] as const,
      tv: [pgFourAmenityTv, setPgFourAmenityTv] as const,
      bedding: [pgFourAmenityBedding, setPgFourAmenityBedding] as const,
      geyser: [pgFourAmenityGeyser, setPgFourAmenityGeyser] as const,
      ac: [pgFourAmenityAc, setPgFourAmenityAc] as const,
      attachedBathroom: [pgFourAmenityAttachedBathroom, setPgFourAmenityAttachedBathroom] as const,
    };
  };

  const pgRoomMoneyState = (k: 'single' | 'double' | 'three' | 'four') => {
    if (k === 'single') return { rent: [pgSingleRent, setPgSingleRent] as const, deposit: [pgSingleDeposit, setPgSingleDeposit] as const };
    if (k === 'double') return { rent: [pgDoubleRent, setPgDoubleRent] as const, deposit: [pgDoubleDeposit, setPgDoubleDeposit] as const };
    if (k === 'three') return { rent: [pgThreeRent, setPgThreeRent] as const, deposit: [pgThreeDeposit, setPgThreeDeposit] as const };
    return { rent: [pgFourRent, setPgFourRent] as const, deposit: [pgFourDeposit, setPgFourDeposit] as const };
  };

  const parseDateDdMmYyyy = (value: string) => {
    const v = String(value ?? '').trim();
    const m = /^([0-9]{2})-([0-9]{2})-([0-9]{4})$/.exec(v);
    if (!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (!dd || !mm || !yyyy) return null;
    const d = new Date(yyyy, mm - 1, dd);
    if (Number.isNaN(d.getTime())) return null;
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
    return d;
  };

  const formatDateDdMmYyyy = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
  };

  const formatTimeHhMm = (d: Date | null) => {
    if (!d) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const reviewRow = (label: string, value: string) => {
    return (
      <XStack flexWrap="wrap">
        <Text color="#374151">{label}: </Text>
        <Text color="#60A5FA" fontWeight={valueWeight}>
          {value}
        </Text>
      </XStack>
    );
  };

  const khataCertificateText = (v: typeof khataCertificate) => {
    if (v === 'yes_a_khata') return 'Yes, A-Khata';
    if (v === 'yes_b_khata') return 'Yes, B-Khata';
    if (v === 'no') return 'No';
    if (v === 'dont_know') return "Don't know";
    return 'Select';
  };

  const updatePreferredAll = (checked: boolean) => {
    setPreferredFamily(checked);
    setPreferredBachelorFemale(checked);
    setPreferredBachelorMale(checked);
    setPreferredCompany(checked);
  };

  const togglePreferredAnyone = () => {
    setPreferredAnyone((prev) => {
      const nextVal = !prev;
      if (nextVal) updatePreferredAll(true);
      else updatePreferredAll(false);
      return nextVal;
    });
  };

  const sanitizeSingleDecimal = (value: string) => {
    const raw = String(value ?? '');
    let out = '';
    let seenDot = false;
    for (const ch of raw) {
      if (ch >= '0' && ch <= '9') out += ch;
      else if (ch === '.' && !seenDot) {
        out += '.';
        seenDot = true;
      }
    }
    if (out.startsWith('.')) out = `0${out}`;
    return out;
  };

  const isValidSingleDecimalNumber = (value: string) => {
    const v = String(value ?? '').trim();
    if (!v) return false;
    return /^[0-9]+(\.[0-9]+)?$/.test(v);
  };

  const floorToNumber = (value: string) => {
    const v = String(value ?? '').trim();
    if (!v) return null;
    if (v.toLowerCase().includes('lower basement')) return -2;
    if (v.toLowerCase().includes('upper basement')) return -1;
    if (v.toLowerCase() === 'basement') return -1;
    if (v.toLowerCase().includes('ground')) return 0;
    if (v.toLowerCase().includes('full building')) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n;
  };

  const reviewValue = (v: any) => {
    const s = String(v ?? '').trim();
    return s ? s : '—';
  };

  const reviewYesNo = (v: 0 | 1 | null) => {
    if (v === 1) return 'Yes';
    if (v === 0) return 'No';
    return '—';
  };

  const openPreview = (kind: 'photo' | 'video', uri: string) => {
    setPreviewKind(kind);
    setPreviewUri(uri);
    setPreviewOpen(true);
  };

  const selectedAmenityLabels = useMemo(() => {
    const items: Array<{ label: string; value: 0 | 1 | null }> = [
      { label: 'Lift', value: amenityLift },
      { label: 'Internet Services', value: amenityInternetServices },
      { label: 'Air Conditioner', value: amenityAirConditioner },
      { label: 'Club House', value: amenityClubHouse },
      { label: 'Intercom', value: amenityIntercom },
      { label: 'Swimming Pool', value: amenitySwimmingPool },
      { label: 'Children Play Area', value: amenityChildrenPlayArea },
      { label: 'Fire Safety', value: amenityFireSafety },
      { label: 'Servant Room', value: amenityServantRoom },
      { label: 'Shopping Center', value: amenityShoppingCenter },
      { label: 'Gas Pipeline', value: amenityGasPipeline },
      { label: 'Park', value: amenityPark },
      { label: 'Rain Water Harvesting', value: amenityRainWaterHarvesting },
      { label: 'Sewage Treatment Plant', value: amenitySewageTreatmentPlant },
      { label: 'House Keeping', value: amenityHouseKeeping },
      { label: 'Power Backup', value: amenityPowerBackup },
      { label: 'Visitor Parking', value: amenityVisitorParking },
    ];
    return items.filter((x) => x.value === 1).map((x) => x.label);
  }, [
    amenityAirConditioner,
    amenityChildrenPlayArea,
    amenityClubHouse,
    amenityFireSafety,
    amenityGasPipeline,
    amenityHouseKeeping,
    amenityIntercom,
    amenityInternetServices,
    amenityLift,
    amenityPark,
    amenityPowerBackup,
    amenityRainWaterHarvesting,
    amenityServantRoom,
    amenitySewageTreatmentPlant,
    amenityShoppingCenter,
    amenitySwimmingPool,
    amenityVisitorParking,
  ]);

  const isResidentialRent = propertyCategory === 'residential' && adType === 'rent';

  const residentialRentPropertyConditionOptions = useMemo(
    () => ['Vacant', 'Tenant on Notice Period', 'New Property', 'Need Help to Manage'] as const,
    []
  );

  useEffect(() => {
    if (!isResidentialRent) return;
    const allowed = new Set<string>(residentialRentPropertyConditionOptions as unknown as string[]);
    if (currentPropertyCondition && !allowed.has(currentPropertyCondition)) {
      setCurrentPropertyCondition('');
    }
  }, [isResidentialRent, currentPropertyCondition, residentialRentPropertyConditionOptions]);

  const primaryContactPhone = useMemo(() => {
    const fromState = contactPhone.trim();
    const fromProfile = String(profile?.phone ?? '').trim();
    const fromAuth = String((session?.user as { phone?: string })?.phone ?? '').trim();
    return fromState || fromProfile || fromAuth || '';
  }, [contactPhone, profile?.phone, session?.user]);

  useEffect(() => {
    const fromProfile = String(profile?.phone ?? '').trim();
    if (!fromProfile) return;
    setContactPhone((prev) => (prev.trim() ? prev : fromProfile));
  }, [profile?.phone]);

  const togglePreferredOne = (
    current: boolean,
    setCurrent: (v: boolean) => void,
    nextValue: boolean,
  ) => {
    if (preferredAnyone) return;
    setCurrent(nextValue);
  };

  const whoWillShowOptions = useMemo(() => {
    return [
      'Need help',
      'I will show',
      'Neighbors',
      'Friends and Relative',
      'Security',
      'Tenant',
      'Others',
    ];
  }, []);

  const secondaryCountryCodeOptions = useMemo(() => {
    return [
      { label: '🇮🇳 India (+91)', value: '+91' },
      { label: '🇵🇰 Pakistan (+92)', value: '+92' },
      { label: '🇧🇩 Bangladesh (+880)', value: '+880' },
      { label: '🇳🇵 Nepal (+977)', value: '+977' },
      { label: '🇱🇰 Sri Lanka (+94)', value: '+94' },
      { label: '🇦🇪 UAE (+971)', value: '+971' },
      { label: '🇸🇦 Saudi Arabia (+966)', value: '+966' },
      { label: '🇬🇧 UK (+44)', value: '+44' },
      { label: '🇺🇸 USA (+1)', value: '+1' },
      { label: '🇨🇦 Canada (+1)', value: '+1' },
    ] as const;
  }, []);

  const secondaryCountryCodeLabel = useMemo(() => {
    const found = secondaryCountryCodeOptions.find((x) => x.value === secondaryCountryCode);
    return found?.label ?? `Code (${secondaryCountryCode})`;
  }, [secondaryCountryCode, secondaryCountryCodeOptions]);

  const commercialPreviousOccupancyOptions = useMemo(() => {
    return [
      { label: 'First time rental', value: 'first_time_rental' },
      { label: 'Currently rented-rented', value: 'currently_rented' },
      { label: 'Previously rented', value: 'previously_rented' },
    ] as const;
  }, []);

  const propertyConditionOptions = useMemo(() => {
    return ['Pattern', 'Tune', 'Exchange', 'Self Occupied', 'Sale', 'Urgently Not Finding Tenant'];
  }, []);

  const powerBackupOptions = useMemo(() => {
    return [
      { label: 'Full', value: 'full' },
      { label: 'Partial', value: 'partial' },
      { label: 'None', value: 'none' },
    ] as const;
  }, []);

  const commercialPowerBackupOptions = useMemo(() => {
    return [
      { label: 'Full', value: 'full' },
      { label: 'DG Backup', value: 'dg_backup' },
      { label: 'Need to arrange', value: 'need_to_arrange' },
    ] as const;
  }, []);

  const commercialLiftOptions = useMemo(() => {
    return [
      { label: 'None', value: 'none' },
      { label: 'Personal', value: 'personal' },
      { label: 'Common', value: 'common' },
    ] as const;
  }, []);

  const commercialParkingOptions = useMemo(() => {
    return [
      { label: 'None', value: 'none' },
      { label: 'Public And Reserved', value: 'public_and_reserved' },
      { label: 'Public', value: 'public' },
      { label: 'Reserved', value: 'reserved' },
    ] as const;
  }, []);

  const commercialWashroomOptions = useMemo(() => {
    return [
      { label: 'Shared', value: 'shared' },
      { label: 'No Washroom', value: 'no_washroom' },
      { label: 'Private', value: 'private' },
    ] as const;
  }, []);

  const commercialPropertyConditionOptions = useMemo(() => {
    return ['Vacant', 'Currently Rented / Leased', 'Own Business', 'New Property'] as const;
  }, []);

  const commercialBusinessOptions = useMemo(() => {
    return [
      'Office',
      'Restaurant / Cafe',
      'Salon / Spa',
      'Store / Showroom',
      'Cloud Kitchen',
      'Warehouse / Godown',
      'Clinic',
      'School / Institute',
      'Gym / Yoga Center',
      'Industrial Use',
      'Other Business',
    ] as const;
  }, []);

  const yesNoDontKnowOptions = useMemo(() => {
    return [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
      { label: "Don't know", value: 'dont_know' },
    ] as const;
  }, []);

  const yesNoDontKnowText = (v: string) => {
    return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v === 'dont_know' ? "Don't know" : 'Select';
  };

  const renderYesNo = (value: 0 | 1 | null, onChange: (v: 0 | 1 | null) => void) => {
    return (
      <XStack borderWidth={1} borderColor={border} borderRadius={14} overflow="hidden" backgroundColor="#F3F4F6">
        <Button
          flex={1}
          borderRadius={0}
          backgroundColor={value === 1 ? '#059669' : 'transparent'}
          color={value === 1 ? '#FFFFFF' : '#111827'}
          fontWeight="800"
          hoverStyle={{
            backgroundColor: value === 1 ? '#059669' : 'transparent',
          }}
          pressStyle={{
            backgroundColor: value === 1 ? '#059669' : 'transparent',
          }}
          onPress={() => onChange(1)}>
          <Text color={value === 1 ? '#FFFFFF' : '#111827'} fontWeight="800" hoverStyle={{ color: '#FFFFFF' }}>
            Yes
          </Text>
        </Button>
        <Button
          flex={1}
          borderRadius={0}
          backgroundColor={value === 0 ? '#059669' : 'transparent'}
          color={value === 0 ? '#FFFFFF' : '#111827'}
          fontWeight="800"
          hoverStyle={{
            backgroundColor: value === 0 ? '#059669' : 'transparent',
          }}
          pressStyle={{
            backgroundColor: value === 0 ? '#059669' : 'transparent',
          }}
          onPress={() => onChange(0)}>
          <Text color={value === 0 ? '#FFFFFF' : '#111827'} fontWeight="800" hoverStyle={{ color: '#FFFFFF' }}>
            No
          </Text>
        </Button>
      </XStack>
    );
  };

  const renderCounter = (value: number, setValue: (n: number) => void) => {
    return (
      <XStack borderWidth={1} borderColor={border} borderRadius={14} overflow="hidden" backgroundColor="#FFFFFF" alignItems="center">
        <Button
          size="$3"
          borderRadius={0}
          backgroundColor="#F3F4F6"
          color="#111827"
          fontWeight="900"
          hoverStyle={{ backgroundColor: '#F3F4F6' }}
          onPress={() => setValue(Math.max(0, value - 1))}>
          <Text color="#111827" fontWeight="900" hoverStyle={{ color: '#FFFFFF' }}>
            -
          </Text>
        </Button>
        <YStack flex={1} alignItems="center" justifyContent="center" paddingVertical={10} paddingHorizontal={12}>
          <Text color={titleColor} fontWeight="900">
            {value}
          </Text>
        </YStack>
        <Button
          size="$3"
          borderRadius={0}
          backgroundColor="#F3F4F6"
          color="#111827"
          fontWeight="900"
          hoverStyle={{ backgroundColor: '#F3F4F6' }}
          onPress={() => setValue(value + 1)}>
          <Text color="#111827" fontWeight="900" hoverStyle={{ color: '#FFFFFF' }}>
            +
          </Text>
        </Button>
      </XStack>
    );
  };

  const setCategoryAndDefaultAdType = (nextCategory: 'residential' | 'commercial' | 'land_plot') => {
    setPropertyCategory(nextCategory);
    setPropertyType(defaultPropertyTypeForCategory(nextCategory));
    setPickerOpen(null);
    setError(null);
    if (nextCategory === 'residential') {
      setAdType('rent');
      setListingType('rent');
      return;
    }
    if (nextCategory === 'commercial') {
      setAdType('rent');
      setListingType('commercial');
      return;
    }
    setAdType('resale');
    setListingType('buy');
  };

  const setAdTypeAndListingType = (nextAd: 'rent' | 'resale' | 'pg_hostel' | 'flatmates' | 'sale') => {
    setAdType(nextAd);
    setPickerOpen(null);
    setError(null);
    if (propertyCategory === 'commercial') {
      setListingType('commercial');
      return;
    }
    if (nextAd === 'resale') {
      setListingType('buy');
      return;
    }
    setListingType('rent');
  };

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <YStack backgroundColor="#ECFDF5" padding={16} paddingTop={18} borderBottomWidth={1} borderBottomColor={border}>
        <XStack alignItems="center" justifyContent="center" position="relative">
          <Button
            size="$3"
            chromeless
            color={titleColor}
            position="absolute"
            left={0}
            hoverStyle={{ backgroundColor: 'transparent' }}
            pressStyle={{ backgroundColor: 'transparent' }}
            onPress={back}>
            ‹
          </Button>
          <YStack alignItems="center">
            <Text color={titleColor} fontSize={16} fontWeight="900">
              {editLoading
                ? 'Loading property…'
                : isEditMode
                  ? flowLabel
                    ? `Edit & Publish - ${flowLabel}`
                    : 'Edit & Publish'
                  : flowLabel
                    ? `Post Property - ${flowLabel}`
                    : 'Post Property'}
            </Text>
            <Text color={muted} fontSize={12} fontWeight="700">
              {`Step ${getCurrentStepIndex + 1} of ${currentFlowSteps.length}`}
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <YStack gap="$3">
          <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', padding: 16 }} onPress={() => setPreviewOpen(false)}>
              <Pressable
                onPress={() => {}}
                style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginTop: 60, borderWidth: 1, borderColor: border, maxHeight: 520 }}>
                <YStack gap="$3">
                  <XStack alignItems="center" justifyContent="space-between">
                    <Text color={titleColor} fontWeight="900">
                      Preview
                    </Text>
                    <Button
                      size="$2"
                      backgroundColor="#E5E7EB"
                      color="#111827"
                      hoverStyle={{ backgroundColor: '#E5E7EB' }}
                      onPress={() => setPreviewOpen(false)}>
                      <Text color="#111827" fontWeight="900" hoverStyle={{ color: '#FFFFFF' }}>
                        Close
                      </Text>
                    </Button>
                  </XStack>
                  <YStack height={420} borderRadius={12} overflow="hidden" backgroundColor="#0B0B12" alignItems="center" justifyContent="center">
                    {previewKind === 'photo' ? (
                      <Image source={{ uri: previewUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                    ) : (
                      <Video
                        source={{ uri: previewUri }}
                        style={{ width: '100%', height: '100%' }}
                        useNativeControls
                        resizeMode={ResizeMode.CONTAIN}
                      />
                    )}
                  </YStack>
                </YStack>
              </Pressable>
            </Pressable>
          </Modal>

          <Modal visible={pickerOpen !== null} transparent animationType="fade" onRequestClose={() => setPickerOpen(null)}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', padding: 18 }} onPress={() => setPickerOpen(null)}>
              <Pressable onPress={() => {}} style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginTop: 60, borderWidth: 1, borderColor: border, maxHeight: 420 }}>
                <ScrollView>
                  {pickerOpen === 'apartmentType'
                    ? ((adType === 'resale'
                        ? ([
                            { label: 'Apartment', value: 'apartment' },
                            { label: 'Independent House / Villa', value: 'independent_house_villa' },
                            { label: 'Gated Community Villa', value: 'gated_community_villa' },
                            { label: 'Standalone Building', value: 'standalone_building' },
                          ] as const)
                        : ([
                            { label: 'Apartment', value: 'apartment' },
                            { label: 'Independent House / Villa', value: 'independent_house_villa' },
                            { label: 'Gated Community Villa', value: 'gated_community_villa' },
                          ] as const)
                      )).map((it) => (
                        <Pressable
                          key={it.value}
                          onPress={() => {
                            setApartmentType(it.value);
                            setPropertyType(it.value);
                            setApartmentName('');
                            setPlotAreaSqft('');
                            setPickerOpen(null);
                          }}>
                          <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                            <Text color={titleColor} fontWeight="800">
                              {it.label}
                            </Text>
                            <Text color={muted} fontWeight="900">
                              {apartmentType === it.value ? '✓' : ''}
                            </Text>
                          </XStack>
                        </Pressable>
                      ))
                    : pickerOpen === 'commercialPropertyType'
                      ? commercialPropertyTypeOptions.map((it) => (
                          <Pressable
                            key={it.value}
                            onPress={() => {
                              setPropertyType(it.value);
                              setCommercialBuildingType('');
                              setPickerOpen(null);
                            }}>
                            <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                              <Text color={titleColor} fontWeight="800">
                                {it.label}
                              </Text>
                              <Text color={muted} fontWeight="900">
                                {propertyType === it.value ? '✓' : ''}
                              </Text>
                            </XStack>
                          </Pressable>
                        ))
                      : pickerOpen === 'commercialBuildingType'
                        ? commercialBuildingTypeOptions
                            .filter((it) => allowedCommercialBuildingTypes.includes(it.value as any))
                            .map((it) => (
                            <Pressable
                              key={it.value}
                              onPress={() => {
                                setCommercialBuildingType(it.value);
                                setPickerOpen(null);
                              }}>
                              <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                <Text color={titleColor} fontWeight="800">
                                  {it.label}
                                </Text>
                                <Text color={muted} fontWeight="900">
                                  {commercialBuildingType === it.value ? '✓' : ''}
                                </Text>
                              </XStack>
                            </Pressable>
                          ))
                    : pickerOpen === 'ownershipType'
                      ? ([
                          { label: 'On Lease', value: 'on_lease' },
                          { label: 'Self Owned', value: 'self_owned' },
                        ] as const).map((it) => (
                          <Pressable
                            key={it.value}
                            onPress={() => {
                              setOwnershipType(it.value);
                              if (it.value !== 'on_lease') setLeaseYears('');
                              setPickerOpen(null);
                            }}>
                            <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                              <Text color={titleColor} fontWeight="800">
                                {it.label}
                              </Text>
                              <Text color={muted} fontWeight="900">
                                {ownershipType === it.value ? '✓' : ''}
                              </Text>
                            </XStack>
                          </Pressable>
                        ))
                      : pickerOpen === 'floorType'
                        ? ([
                            { label: 'Verified Tiles', value: 'verified_tiles' },
                            { label: 'Mosaic', value: 'mosaic' },
                            { label: 'Marble / Granite', value: 'marble_granite' },
                            { label: 'Wooden', value: 'wooden' },
                            { label: 'Cement', value: 'cement' },
                          ] as const).map((it) => (
                            <Pressable
                              key={it.value}
                              onPress={() => {
                                setFloorType(it.value);
                                setPickerOpen(null);
                              }}>
                              <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                <Text color={titleColor} fontWeight="800">
                                  {it.label}
                                </Text>
                                <Text color={muted} fontWeight="900">
                                  {floorType === it.value ? '✓' : ''}
                                </Text>
                              </XStack>
                            </Pressable>
                          ))
                    : pickerOpen === 'bhkType'
                      ? (['1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '10 BHK'] as const).map((v) => (
                          <Pressable
                            key={v}
                            onPress={() => {
                              setBhkType(v);
                              const bedroomsValue = v === '1 RK' ? '1' : String(parseInt(v.split(' ')[0] ?? '0', 10) || '');
                              if (bedroomsValue) setBedrooms(bedroomsValue);
                              setPickerOpen(null);
                            }}>
                            <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                              <Text color={titleColor} fontWeight="800">
                                {v}
                              </Text>
                              <Text color={muted} fontWeight="900">
                                {bhkType === v ? '✓' : ''}
                              </Text>
                            </XStack>
                          </Pressable>
                        ))
                    : pickerOpen === 'floor' || pickerOpen === 'totalFloors'
                        ? (
                            (
                              pickerOpen === 'floor'
                                ? (isCommercialAny
                                    ? (['Lower Basement', 'Upper Basement', 'Ground', 'Full Building', ...Array.from({ length: 99 }, (_, i) => String(i + 1))] as readonly string[])
                                    : ((propertyCategory === 'residential' && adType === 'rent'
                                        ? ['Ground', ...Array.from({ length: 99 }, (_, i) => String(i + 1))]
                                        : ['Basement', 'Ground', 'Full Building', ...Array.from({ length: 99 }, (_, i) => String(i + 1))]) as readonly string[]))
                                : (['Ground', ...Array.from({ length: 99 }, (_, i) => String(i + 1))] as readonly string[])
                            )
                          ).map((v) => (
                            <Pressable
                              key={v}
                              onPress={() => {
                                if (pickerOpen === 'floor') setFloor(v);
                                else setTotalFloors(v);
                                setPickerOpen(null);
                              }}>
                              <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                <Text color={titleColor} fontWeight="800">
                                  {v}
                                </Text>
                                <Text color={muted} fontWeight="900">
                                  {(pickerOpen === 'floor' ? floor : totalFloors) === v ? '✓' : ''}
                                </Text>
                              </XStack>
                            </Pressable>
                          ))
                        : pickerOpen === 'propertyAge'
                          ? (
                              propertyCategory === 'commercial'
                                ? (['Less than a year', '1 to 5 year', '5 to 10 year', 'More than 10 year'] as const)
                                : (['Under Construction', 'Less than 1 year', '1 to 3 years', '3 to 5 years', '5 to 10 years', 'More than 10 years'] as const)
                            ).map((v) => (
                              <Pressable
                                key={v}
                                onPress={() => {
                                  setPropertyAge(v);
                                  setPickerOpen(null);
                                }}>
                                <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                  <Text color={titleColor} fontWeight="800">
                                    {v}
                                  </Text>
                                  <Text color={muted} fontWeight="900">
                                    {propertyAge === v ? '✓' : ''}
                                  </Text>
                                </XStack>
                              </Pressable>
                            ))
                          : pickerOpen === 'commercialLeaseDurationYears' || pickerOpen === 'commercialLockinPeriodYears'
                            ? Array.from({ length: 99 }, (_, i) => String(i + 1)).map((v) => (
                                <Pressable
                                  key={v}
                                  onPress={() => {
                                    if (pickerOpen === 'commercialLeaseDurationYears') setCommercialLeaseDurationYears(v);
                                    else setCommercialLockinPeriodYears(v);
                                    setPickerOpen(null);
                                  }}>
                                  <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                    <Text color={titleColor} fontWeight="800">
                                      {v}
                                    </Text>
                                    <Text color={muted} fontWeight="900">
                                      {(pickerOpen === 'commercialLeaseDurationYears' ? commercialLeaseDurationYears : commercialLockinPeriodYears) === v ? '✓' : ''}
                                    </Text>
                                  </XStack>
                                </Pressable>
                              ))
                            : pickerOpen === 'facing'
                              ? ([
                                  'North',
                                  'South',
                                  'East',
                                  'West',
                                  'North-East',
                                  'South-East',
                                  'North-West',
                                  'South-West',
                                ] as const).map((v) => (
                                  <Pressable
                                    key={v}
                                    onPress={() => {
                                      setFacing(v);
                                      setPickerOpen(null);
                                    }}>
                                    <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                      <Text color={titleColor} fontWeight="800">
                                        {v}
                                      </Text>
                                      <Text color={muted} fontWeight="900">
                                        {facing === v ? '✓' : ''}
                                      </Text>
                                    </XStack>
                                  </Pressable>
                                ))
                            : pickerOpen === 'areaUnit'
                              ? ([{ label: 'Sq.ft', value: 'sqft' }] as const).map((it) => (
                                  <Pressable
                                    key={it.value}
                                    onPress={() => {
                                      setAreaUnit(it.value);
                                      setPickerOpen(null);
                                    }}>
                                    <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                      <Text color={titleColor} fontWeight="800">
                                        {it.label}
                                      </Text>
                                      <Text color={muted} fontWeight="900">
                                        {areaUnit === it.value ? '✓' : ''}
                                      </Text>
                                    </XStack>
                                  </Pressable>
                                ))
                              : pickerOpen === 'kitchenType'
                                ? ([
                                    { label: 'Modular', value: 'modular' },
                                    { label: 'Cupboard Shelves', value: 'cupboard_shelf' },
                                    { label: 'Open Shelves', value: 'open_shelf' },
                                  ] as const).map((it) => (
                                    <Pressable
                                      key={it.value}
                                      onPress={() => {
                                        setKitchenType(it.value);
                                        setPickerOpen(null);
                                      }}>
                                      <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                        <Text color={titleColor} fontWeight="800">
                                          {it.label}
                                        </Text>
                                        <Text color={muted} fontWeight="900">
                                          {kitchenType === it.value ? '✓' : ''}
                                        </Text>
                                      </XStack>
                                    </Pressable>
                                  ))
                              : pickerOpen === 'maintenanceType'
                                ? ([
                                    { label: 'Maintenance Included', value: 'included' },
                                    { label: 'Maintenance Extra', value: 'extra' },
                                  ] as const).map((it) => (
                                    <Pressable
                                      key={it.value}
                                      onPress={() => {
                                        setMonthlyMaintenanceType(it.value);
                                        if (it.value === 'included') {
                                          setMaintenanceAmount('');
                                        }
                                        setPickerOpen(null);
                                      }}>
                                      <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                        <Text color={titleColor} fontWeight="800">
                                          {it.label}
                                        </Text>
                                        <Text color={muted} fontWeight="900">
                                          {monthlyMaintenanceType === it.value ? '✓' : ''}
                                        </Text>
                                      </XStack>
                                    </Pressable>
                                  ))
                                : pickerOpen === 'furnishing'
                                  ? (
                                      propertyCategory === 'commercial'
                                        ? (['Fully Furnished', 'Heavy Furnished', 'Unfurnished'] as const)
                                        : (['Fully Furnished', 'Semi Furnished', 'Unfurnished'] as const)
                                    ).map((v) => (
                                      <Pressable
                                        key={v}
                                        onPress={() => {
                                          setFurnishing(v === 'Fully Furnished' ? 'furnished' : v === 'Semi Furnished' || v === 'Heavy Furnished' ? 'semi_furnished' : 'unfurnished');
                                          setPickerOpen(null);
                                        }}>
                                        <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                          <Text color={titleColor} fontWeight="800">
                                            {v}
                                          </Text>
                                          <Text color={muted} fontWeight="900">
                                            {(
                                              furnishing === 'furnished'
                                                ? 'Fully Furnished'
                                                : furnishing === 'semi_furnished'
                                                  ? propertyCategory === 'commercial'
                                                    ? 'Heavy Furnished'
                                                    : 'Semi Furnished'
                                                  : 'Unfurnished'
                                            ) === v
                                              ? '✓'
                                              : ''}
                                          </Text>
                                        </XStack>
                                      </Pressable>
                                    ))
                                  : pickerOpen === 'parking'
                                    ? (['Bike', 'Car', 'Both', 'None'] as const).map((v) => (
                                        <Pressable
                                          key={v}
                                          onPress={() => {
                                            setParking(v === 'Bike' ? 'bike' : v === 'Car' ? 'car' : v === 'Both' ? 'both' : 'none');
                                            setPickerOpen(null);
                                          }}>
                                          <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                            <Text color={titleColor} fontWeight="800">
                                              {v}
                                            </Text>
                                            <Text color={muted} fontWeight="900">
                                              {(
                                                parking === 'bike'
                                                  ? 'Bike'
                                                  : parking === 'car'
                                                    ? 'Car'
                                                    : parking === 'both'
                                                      ? 'Both'
                                                      : 'None'
                                              ) === v
                                                ? '✓'
                                                : ''}
                                            </Text>
                                          </XStack>
                                        </Pressable>
                                      ))
                                    : pickerOpen === 'state'
                                      ? stateOptions.map((s) => (
                                          <Pressable
                                            key={s}
                                            onPress={() => {
                                              setStateValue(s);
                                              setCityValue('');
                                              setLocalityValue('');
                                              setLocalityTyped(false);
                                              setLocalitySuggestions([]);
                                              setPickerOpen(null);
                                            }}>
                                            <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                              <Text color={titleColor} fontWeight="800">
                                                {s}
                                              </Text>
                                              <Text color={muted} fontWeight="900">
                                                {stateValue.trim().toLowerCase() === String(s).trim().toLowerCase() ? '✓' : ''}
                                              </Text>
                                            </XStack>
                                          </Pressable>
                                        ))
                                      : pickerOpen === 'city'
                                        ? (cityOptions ?? []).map((c) => (
                                            <Pressable
                                              key={c}
                                              onPress={() => {
                                                setCityValue(c);
                                                setLocalityValue('');
                                                setLocalityTyped(false);
                                                setLocalitySuggestions([]);
                                                setPickerOpen(null);
                                              }}>
                                              <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                                <Text color={titleColor} fontWeight="800">
                                                  {c}
                                                </Text>
                                                <Text color={muted} fontWeight="900">
                                                  {cityValue.trim().toLowerCase() === String(c).trim().toLowerCase() ? '✓' : ''}
                                                </Text>
                                              </XStack>
                                            </Pressable>
                                          ))
                                    : pickerOpen === 'waterSupply'
                    ? ([
                        { label: 'Corporation', value: 'corporation' },
                        { label: 'Borewell', value: 'borewell' },
                        { label: 'Both', value: 'both' },
                      ] as const).map((it) => (
                        <Pressable key={it.value} onPress={() => {
                          setWaterSupply(it.value);
                          setPickerOpen(null);
                        }}>
                          <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                            <Text color={titleColor} fontWeight="800">
                              {it.label}
                            </Text>
                            <Text color={muted} fontWeight="900">
                              {waterSupply === it.value ? '✓' : ''}
                            </Text>
                          </XStack>
                        </Pressable>
                      ))
                    : pickerOpen === 'landWaterSupply'
                      ? ([
                          { label: 'Corporation', value: 'corporation' },
                          { label: 'Borewell', value: 'borewell' },
                          { label: 'Both', value: 'both' },
                          { label: 'None', value: 'none' },
                        ] as const).map((it) => (
                          <Pressable key={it.value} onPress={() => {
                            setLandWaterSupply(it.value);
                            setPickerOpen(null);
                          }}>
                            <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                              <Text color={titleColor} fontWeight="800">
                                {it.label}
                              </Text>
                              <Text color={muted} fontWeight="900">
                                {landWaterSupply === it.value ? '✓' : ''}
                              </Text>
                            </XStack>
                          </Pressable>
                        ))
                      : pickerOpen === 'landElectricityConnection'
                        ? ([
                            { label: 'Electricity', value: 'electricity' },
                            { label: 'Solar', value: 'solar' },
                            { label: 'None', value: 'none' },
                          ] as const).map((it) => (
                            <Pressable key={it.value} onPress={() => {
                              setLandElectricityConnection(it.value);
                              setPickerOpen(null);
                            }}>
                              <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                <Text color={titleColor} fontWeight="800">
                                  {it.label}
                                </Text>
                                <Text color={muted} fontWeight="900">
                                  {landElectricityConnection === it.value ? '✓' : ''}
                                </Text>
                              </XStack>
                            </Pressable>
                          ))
                        : pickerOpen === 'landSewageConnection'
                          ? ([
                              { label: 'Open', value: 'open' },
                              { label: 'Underground', value: 'underground' },
                              { label: 'None', value: 'none' },
                            ] as const).map((it) => (
                              <Pressable key={it.value} onPress={() => {
                                setLandSewageConnection(it.value);
                                setPickerOpen(null);
                              }}>
                                <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                  <Text color={titleColor} fontWeight="800">
                                    {it.label}
                                  </Text>
                                  <Text color={muted} fontWeight="900">
                                    {landSewageConnection === it.value ? '✓' : ''}
                                  </Text>
                                </XStack>
                              </Pressable>
                            ))
                          : pickerOpen === 'landOwnership'
                            ? ([
                                { label: 'Freehold', value: 'freehold' },
                                { label: 'Leasehold', value: 'leasehold' },
                                { label: 'Co-operative Society', value: 'cooperative_society' },
                                { label: 'Power Of Attorney', value: 'power_of_attorney' },
                              ] as const).map((it) => (
                                <Pressable key={it.value} onPress={() => {
                                  setLandOwnership(it.value);
                                  if (it.value !== 'leasehold') setLandLeaseTermYears('');
                                  setPickerOpen(null);
                                }}>
                                  <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                    <Text color={titleColor} fontWeight="800">
                                      {it.label}
                                    </Text>
                                    <Text color={muted} fontWeight="900">
                                      {landOwnership === it.value ? '✓' : ''}
                                    </Text>
                                  </XStack>
                                </Pressable>
                              ))
                            : pickerOpen === 'landSaleDeedCertificate'
                              ? ([
                                  { label: 'Yes', value: 'yes' },
                                  { label: 'No', value: 'no' },
                                  { label: "Don't know", value: 'dont_know' },
                                ] as const).map((it) => (
                                  <Pressable key={it.value} onPress={() => {
                                    setLandSaleDeedCertificate(it.value);
                                    setPickerOpen(null);
                                  }}>
                                    <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                      <Text color={titleColor} fontWeight="800">
                                        {it.label}
                                      </Text>
                                      <Text color={muted} fontWeight="900">
                                        {landSaleDeedCertificate === it.value ? '✓' : ''}
                                      </Text>
                                    </XStack>
                                  </Pressable>
                                ))
                              : pickerOpen === 'landEncumbranceCertificate'
                                ? ([
                                    { label: 'Yes', value: 'yes' },
                                    { label: 'No', value: 'no' },
                                    { label: "Don't know", value: 'dont_know' },
                                  ] as const).map((it) => (
                                    <Pressable key={it.value} onPress={() => {
                                      setLandEncumbranceCertificate(it.value);
                                      setPickerOpen(null);
                                    }}>
                                      <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                        <Text color={titleColor} fontWeight="800">
                                          {it.label}
                                        </Text>
                                        <Text color={muted} fontWeight="900">
                                          {landEncumbranceCertificate === it.value ? '✓' : ''}
                                        </Text>
                                      </XStack>
                                    </Pressable>
                                  ))
                                : pickerOpen === 'landConversionCertificate'
                                  ? ([
                                      { label: 'Yes', value: 'yes' },
                                      { label: 'No', value: 'no' },
                                      { label: 'Not Needed', value: 'not_needed' },
                                      { label: "Don't know", value: 'dont_know' },
                                    ] as const).map((it) => (
                                      <Pressable key={it.value} onPress={() => {
                                        setLandConversionCertificate(it.value);
                                        setPickerOpen(null);
                                      }}>
                                        <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                          <Text color={titleColor} fontWeight="800">
                                            {it.label}
                                          </Text>
                                          <Text color={muted} fontWeight="900">
                                            {landConversionCertificate === it.value ? '✓' : ''}
                                          </Text>
                                        </XStack>
                                      </Pressable>
                                    ))
                                  : pickerOpen === 'landReraApproved'
                                    ? ([
                                        { label: 'Yes', value: 'yes' },
                                        { label: 'No', value: 'no' },
                                      ] as const).map((it) => (
                                        <Pressable key={it.value} onPress={() => {
                                          setLandReraApproved(it.value);
                                          setPickerOpen(null);
                                        }}>
                                          <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                            <Text color={titleColor} fontWeight="800">
                                              {it.label}
                                            </Text>
                                            <Text color={muted} fontWeight="900">
                                              {landReraApproved === it.value ? '✓' : ''}
                                            </Text>
                                          </XStack>
                                        </Pressable>
                                      ))
                                    : pickerOpen === 'landKhataCertificate'
                                      ? ([
                                          { label: 'Yes, A-Khata', value: 'yes_a_khata' },
                                          { label: 'Yes, B-Khata', value: 'yes_b_khata' },
                                          { label: 'No', value: 'no' },
                                          { label: "Don't know", value: 'dont_know' },
                                        ] as const).map((it) => (
                                          <Pressable key={it.value} onPress={() => {
                                            setLandKhataCertificate(it.value);
                                            setPickerOpen(null);
                                          }}>
                                            <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                              <Text color={titleColor} fontWeight="800">
                                                {it.label}
                                              </Text>
                                              <Text color={muted} fontWeight="900">
                                                {landKhataCertificate === it.value ? '✓' : ''}
                                              </Text>
                                            </XStack>
                                          </Pressable>
                                        ))
                    : pickerOpen === 'whoWillShow'
                      ? whoWillShowOptions.map((v) => (
                          <Pressable key={v} onPress={() => {
                            setWhoWillShowProperty(v);
                            setPickerOpen(null);
                          }}>
                            <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                              <Text color={titleColor} fontWeight="800">
                                {v}
                              </Text>
                              <Text color={muted} fontWeight="900">
                                {whoWillShowProperty === v ? '✓' : ''}
                              </Text>
                            </XStack>
                          </Pressable>
                        ))
                      : pickerOpen === 'propertyCondition'
                        ? (isCommercialRent
                            ? commercialPropertyConditionOptions
                            : isResidentialRent
                              ? residentialRentPropertyConditionOptions
                              : propertyConditionOptions
                          ).map((v) => (
                            <Pressable
                              key={v}
                              onPress={() => {
                                setCurrentPropertyCondition(v);
                                setPickerOpen(null);
                              }}>
                              <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                <Text color={titleColor} fontWeight="800">
                                  {v}
                                </Text>
                                <Text color={muted} fontWeight="900">
                                  {currentPropertyCondition === v ? '✓' : ''}
                                </Text>
                              </XStack>
                            </Pressable>
                          ))
                        : pickerOpen === 'commercialPreviousOccupancy'
                          ? commercialPreviousOccupancyOptions.map((it) => (
                              <Pressable
                                key={it.value}
                                onPress={() => {
                                  setCommercialPreviousOccupancy(it.value);
                                  setPickerOpen(null);
                                }}>
                                <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                  <Text color={titleColor} fontWeight="800">
                                    {it.label}
                                  </Text>
                                  <Text color={muted} fontWeight="900">
                                    {commercialPreviousOccupancy === it.value ? '✓' : ''}
                                  </Text>
                                </XStack>
                              </Pressable>
                            ))
                          : pickerOpen === 'secondaryCountryCode'
                            ? secondaryCountryCodeOptions.map((it) => (
                                <Pressable
                                  key={it.label}
                                  onPress={() => {
                                    setSecondaryCountryCode(it.value);
                                    setPickerOpen(null);
                                  }}>
                                  <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                    <Text color={titleColor} fontWeight="800">
                                      {it.label}
                                    </Text>
                                    <Text color={muted} fontWeight="900">
                                      {secondaryCountryCode === it.value ? '✓' : ''}
                                    </Text>
                                  </XStack>
                                </Pressable>
                              ))
                        : pickerOpen === 'khataCertificate'
                          ? ([
                              { label: 'Yes, A-Khata', value: 'yes_a_khata' },
                              { label: 'Yes, B-Khata', value: 'yes_b_khata' },
                              { label: 'No', value: 'no' },
                              { label: "Don't know", value: 'dont_know' },
                            ] as const).map((it) => (
                              <Pressable
                                key={it.value}
                                onPress={() => {
                                  setKhataCertificate(it.value);
                                  setPickerOpen(null);
                                }}>
                                <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                  <Text color={titleColor} fontWeight="800">
                                    {it.label}
                                  </Text>
                                  <Text color={muted} fontWeight="900">
                                    {khataCertificate === it.value ? '✓' : ''}
                                  </Text>
                                </XStack>
                              </Pressable>
                            ))
                        : pickerOpen === 'saleDeedCertificate'
                          ? yesNoDontKnowOptions.map((it) => (
                              <Pressable
                                key={it.value}
                                onPress={() => {
                                  setSaleDeedCertificate(it.value);
                                  if (it.value !== 'no') setSaleAgreement('');
                                  setPickerOpen(null);
                                }}>
                                <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                  <Text color={titleColor} fontWeight="800">
                                    {it.label}
                                  </Text>
                                  <Text color={muted} fontWeight="900">
                                    {saleDeedCertificate === it.value ? '✓' : ''}
                                  </Text>
                                </XStack>
                              </Pressable>
                            ))
                          : pickerOpen === 'saleAgreement'
                            ? yesNoDontKnowOptions.map((it) => (
                                <Pressable
                                  key={it.value}
                                  onPress={() => {
                                    setSaleAgreement(it.value);
                                    setPickerOpen(null);
                                  }}>
                                  <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                    <Text color={titleColor} fontWeight="800">
                                      {it.label}
                                    </Text>
                                    <Text color={muted} fontWeight="900">
                                      {saleAgreement === it.value ? '✓' : ''}
                                    </Text>
                                  </XStack>
                                </Pressable>
                              ))
                            : pickerOpen === 'propertyTaxPaid'
                              ? yesNoDontKnowOptions.map((it) => (
                                  <Pressable
                                    key={it.value}
                                    onPress={() => {
                                      setPropertyTaxPaid(it.value);
                                      setPickerOpen(null);
                                    }}>
                                    <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                      <Text color={titleColor} fontWeight="800">
                                        {it.label}
                                      </Text>
                                      <Text color={muted} fontWeight="900">
                                        {propertyTaxPaid === it.value ? '✓' : ''}
                                      </Text>
                                    </XStack>
                                  </Pressable>
                                ))
                              : pickerOpen === 'occupancyCertificate'
                                ? yesNoDontKnowOptions.map((it) => (
                                    <Pressable
                                      key={it.value}
                                      onPress={() => {
                                        setOccupancyCertificate(it.value);
                                        setPickerOpen(null);
                                      }}>
                                      <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                        <Text color={titleColor} fontWeight="800">
                                          {it.label}
                                        </Text>
                                        <Text color={muted} fontWeight="900">
                                          {occupancyCertificate === it.value ? '✓' : ''}
                                        </Text>
                                      </XStack>
                                    </Pressable>
                                  ))
                        : pickerOpen === 'pgPreferredGuests'
                          ? ([
                                { label: 'Working Professional', value: 'working_professional' },
                                { label: 'Student', value: 'student' },
                                { label: 'Both', value: 'both' },
                              ] as const).map((it) => (
                                <Pressable
                                  key={it.value}
                                  onPress={() => {
                                    setPgPreferredGuests(it.value);
                                    setPickerOpen(null);
                                  }}>
                                  <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                    <Text color={titleColor} fontWeight="800">
                                      {it.label}
                                    </Text>
                                    <Text color={muted} fontWeight="900">
                                      {pgPreferredGuests === it.value ? '✓' : ''}
                                    </Text>
                                  </XStack>
                                </Pressable>
                              ))
                        : pickerOpen === 'powerBackupType'
                          ? powerBackupOptions.map((it) => (
                              <Pressable
                                key={it.value}
                                onPress={() => {
                                  setPowerBackupType(it.value);
                                  setPickerOpen(null);
                                }}>
                                <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                  <Text color={titleColor} fontWeight="800">
                                    {it.label}
                                  </Text>
                                  <Text color={muted} fontWeight="900">
                                    {powerBackupType === it.value ? '✓' : ''}
                                  </Text>
                                </XStack>
                              </Pressable>
                            ))
                          : pickerOpen === 'commercialPowerBackupType'
                            ? commercialPowerBackupOptions.map((it) => (
                                <Pressable
                                  key={it.value}
                                  onPress={() => {
                                    setCommercialPowerBackupType(it.value);
                                    setPickerOpen(null);
                                  }}>
                                  <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                    <Text color={titleColor} fontWeight="800">
                                      {it.label}
                                    </Text>
                                    <Text color={muted} fontWeight="900">
                                      {commercialPowerBackupType === it.value ? '✓' : ''}
                                    </Text>
                                  </XStack>
                                </Pressable>
                              ))
                            : pickerOpen === 'commercialLiftType'
                              ? commercialLiftOptions.map((it) => (
                                  <Pressable
                                    key={it.value}
                                    onPress={() => {
                                      setCommercialLiftType(it.value);
                                      setPickerOpen(null);
                                    }}>
                                    <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                      <Text color={titleColor} fontWeight="800">
                                        {it.label}
                                      </Text>
                                      <Text color={muted} fontWeight="900">
                                        {commercialLiftType === it.value ? '✓' : ''}
                                      </Text>
                                    </XStack>
                                  </Pressable>
                                ))
                              : pickerOpen === 'commercialParkingType'
                                ? commercialParkingOptions.map((it) => (
                                    <Pressable
                                      key={it.value}
                                      onPress={() => {
                                        setCommercialParkingType(it.value);
                                        if (it.value !== 'public_and_reserved' && it.value !== 'reserved') setCommercialParkingSlots('');
                                        setPickerOpen(null);
                                      }}>
                                      <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                        <Text color={titleColor} fontWeight="800">
                                          {it.label}
                                        </Text>
                                        <Text color={muted} fontWeight="900">
                                          {commercialParkingType === it.value ? '✓' : ''}
                                        </Text>
                                      </XStack>
                                    </Pressable>
                                  ))
                                : pickerOpen === 'commercialWashroomType'
                                  ? commercialWashroomOptions.map((it) => (
                                      <Pressable
                                        key={it.value}
                                        onPress={() => {
                                          setCommercialWashroomType(it.value);
                                          setPickerOpen(null);
                                        }}>
                                        <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                          <Text color={titleColor} fontWeight="800">
                                            {it.label}
                                          </Text>
                                          <Text color={muted} fontWeight="900">
                                            {commercialWashroomType === it.value ? '✓' : ''}
                                          </Text>
                                        </XStack>
                                      </Pressable>
                                    ))
                                  : pickerOpen === 'commercialBusinessRunning'
                                    ? commercialBusinessOptions.map((v) => (
                                        <Pressable
                                          key={v}
                                          onPress={() => {
                                            setCommercialBusinessRunning(v);
                                            setPickerOpen(null);
                                          }}>
                                          <XStack paddingVertical={12} paddingHorizontal={10} borderRadius={10} alignItems="center" justifyContent="space-between">
                                            <Text color={titleColor} fontWeight="800">
                                              {v}
                                            </Text>
                                            <Text color={muted} fontWeight="900">
                                              {commercialBusinessRunning === v ? '✓' : ''}
                                            </Text>
                                          </XStack>
                                        </Pressable>
                                      ))
                          : null}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          {step === 'basic' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900">
                Basic
              </Text>

              <YStack gap="$2">
                <Text color={muted} fontSize={12} fontWeight="700">
                  Property type
                </Text>

                <XStack borderWidth={1} borderColor={border} borderRadius={14} overflow="hidden" backgroundColor="#F3F4F6">
                  <Button
                    flex={1}
                    borderRadius={0}
                    backgroundColor={propertyCategory === 'residential' ? '#059669' : 'transparent'}
                    color={propertyCategory === 'residential' ? '#FFFFFF' : '#111827'}
                    fontWeight="800"
                    hoverStyle={{ backgroundColor: propertyCategory === 'residential' ? '#059669' : 'transparent' }}
                    pressStyle={{ backgroundColor: propertyCategory === 'residential' ? '#059669' : 'transparent' }}
                    onPress={() => setCategoryAndDefaultAdType('residential')}>
                    <Text color={propertyCategory === 'residential' ? '#FFFFFF' : '#111827'} fontWeight="800" hoverStyle={{ color: '#FFFFFF' }}>
                      Residential
                    </Text>
                  </Button>
                  <Button
                    flex={1}
                    borderRadius={0}
                    backgroundColor={propertyCategory === 'commercial' ? '#059669' : 'transparent'}
                    color={propertyCategory === 'commercial' ? '#FFFFFF' : '#111827'}
                    fontWeight="800"
                    hoverStyle={{ backgroundColor: propertyCategory === 'commercial' ? '#059669' : 'transparent' }}
                    pressStyle={{ backgroundColor: propertyCategory === 'commercial' ? '#059669' : 'transparent' }}
                    onPress={() => setCategoryAndDefaultAdType('commercial')}>
                    <Text color={propertyCategory === 'commercial' ? '#FFFFFF' : '#111827'} fontWeight="800" hoverStyle={{ color: '#FFFFFF' }}>
                      Commercial
                    </Text>
                  </Button>
                  <Button
                    flex={1}
                    borderRadius={0}
                    backgroundColor={propertyCategory === 'land_plot' ? '#059669' : 'transparent'}
                    color={propertyCategory === 'land_plot' ? '#FFFFFF' : '#111827'}
                    fontWeight="800"
                    hoverStyle={{ backgroundColor: propertyCategory === 'land_plot' ? '#059669' : 'transparent' }}
                    pressStyle={{ backgroundColor: propertyCategory === 'land_plot' ? '#059669' : 'transparent' }}
                    onPress={() => setCategoryAndDefaultAdType('land_plot')}>
                    <Text color={propertyCategory === 'land_plot' ? '#FFFFFF' : '#111827'} fontWeight="800" hoverStyle={{ color: '#FFFFFF' }}>
                      Land/Plot
                    </Text>
                  </Button>
                </XStack>

                <YStack borderWidth={1} borderColor={border} borderRadius={14} padding={12} backgroundColor="#FFFFFF" gap="$2">
                  <Text color={titleColor} fontWeight="800" textAlign="center">
                    Select Property Ad Type
                  </Text>

                  {propertyCategory === 'residential' ? (
                    <XStack gap="$2" flexWrap="wrap" justifyContent="center">
                      {([
                        { label: 'Rent', value: 'rent' },
                        { label: 'Resale', value: 'resale' },
                        { label: 'PG/Hostel', value: 'pg_hostel' },
                        { label: 'Flatmates', value: 'flatmates' },
                      ] as const).map((x) => (
                        <Button
                          key={x.value}
                          size="$3"
                          minWidth={120}
                          backgroundColor={adType === x.value ? '#059669' : '#F3F4F6'}
                          color={adType === x.value ? '#FFFFFF' : '#111827'}
                          fontWeight="800"
                          borderRadius={12}
                          hoverStyle={{ backgroundColor: adType === x.value ? '#059669' : '#F3F4F6' }}
                          onPress={() => setAdTypeAndListingType(x.value)}>
                          <Text color={adType === x.value ? '#FFFFFF' : '#111827'} fontWeight="800" hoverStyle={{ color: '#FFFFFF' }}>
                            {x.label}
                          </Text>
                        </Button>
                      ))}
                    </XStack>
                  ) : propertyCategory === 'commercial' ? (
                    <XStack gap="$2" flexWrap="wrap" justifyContent="center">
                      {([
                        { label: 'Rent', value: 'rent' },
                        { label: 'Sale', value: 'sale' },
                      ] as const).map((x) => (
                        <Button
                          key={x.value}
                          size="$3"
                          minWidth={140}
                          backgroundColor={adType === x.value ? '#059669' : '#F3F4F6'}
                          color={adType === x.value ? '#FFFFFF' : '#111827'}
                          fontWeight="800"
                          borderRadius={12}
                          hoverStyle={{ backgroundColor: adType === x.value ? '#059669' : '#F3F4F6' }}
                          onPress={() => setAdTypeAndListingType(x.value)}>
                          <Text color={adType === x.value ? '#FFFFFF' : '#111827'} fontWeight="800" hoverStyle={{ color: '#FFFFFF' }}>
                            {x.label}
                          </Text>
                        </Button>
                      ))}
                    </XStack>
                  ) : (
                    <XStack gap="$2" flexWrap="wrap" justifyContent="center">
                      <Button
                        size="$3"
                        minWidth={160}
                        backgroundColor={adType === 'resale' ? '#059669' : '#F3F4F6'}
                        color={adType === 'resale' ? '#FFFFFF' : '#111827'}
                        fontWeight="800"
                        borderRadius={12}
                        hoverStyle={{
                          backgroundColor: adType === 'resale' ? '#059669' : '#F3F4F6',
                        }}
                        onPress={() => setAdTypeAndListingType('resale')}>
                        <Text color={adType === 'resale' ? '#FFFFFF' : '#111827'} fontWeight="800" hoverStyle={{ color: '#FFFFFF' }}>
                          Resale
                        </Text>
                      </Button>
                    </XStack>
                  )}
                </YStack>
              </YStack>
            </YStack>
          ) : null}

          {step === 'pg_details' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$3">
              <Text color={titleColor} fontWeight="900">
                PG Details
              </Text>

              <YStack gap="$2">
                <Text color={muted} fontSize={12} fontWeight="700">
                  Place is available for*
                </Text>
                <XStack gap="$3" flexWrap="wrap">
                  {(
                    [
                      { label: 'Male', value: 'male' as const },
                      { label: 'Female', value: 'female' as const },
                      { label: 'Anyone', value: 'anyone' as const },
                    ] as const
                  ).map((it) => (
                    <Pressable
                      key={it.value}
                      onPress={() => {
                        setPgPlaceAvailableFor(it.value);
                        if (it.value === 'anyone') setPgRuleNoOppositeEntry(false);
                      }}>
                      <XStack alignItems="center" gap="$2" paddingVertical={6}>
                        <YStack
                          width={18}
                          height={18}
                          borderWidth={2}
                          borderColor={pgPlaceAvailableFor === it.value ? '#059669' : border}
                          borderRadius={20}
                          alignItems="center"
                          justifyContent="center">
                          <YStack width={10} height={10} borderRadius={10} backgroundColor={pgPlaceAvailableFor === it.value ? '#059669' : 'transparent'} />
                        </YStack>
                        <Text color={titleColor} fontWeight="800">
                          {it.label}
                        </Text>
                      </XStack>
                    </Pressable>
                  ))}
                </XStack>
              </YStack>

              <XStack gap="$2" flexWrap="wrap" alignItems="flex-end">
                <YStack flexGrow={1} minWidth={220} gap="$2">
                  <Text color={muted} fontSize={12} fontWeight="700">
                    Preferred Guests*
                  </Text>
                  <Pressable onPress={() => setPickerOpen('pgPreferredGuests')}>
                    <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                      <Text color={valueColor} fontWeight={valueWeight}>
                        {pgPreferredGuestText(pgPreferredGuests)}
                      </Text>
                    </YStack>
                  </Pressable>
                </YStack>

                <YStack flexGrow={1} minWidth={220} gap="$2">
                  <Text color={muted} fontSize={12} fontWeight="700">
                    Available From*
                  </Text>
                  <YStack borderWidth={1} borderColor={border} borderRadius={12} overflow="hidden" backgroundColor="#FFFFFF" position="relative">
                    <YStack padding={12}>
                      <Text color={valueColor} fontWeight={valueWeight}>
                        {pgAvailableFromDate ? formatDateDdMmYyyy(pgAvailableFromDate) : pgAvailableFromText || 'Select date'}
                      </Text>
                    </YStack>
                    <YStack position="absolute" top={0} left={0} right={0} bottom={0} opacity={Platform.OS === 'web' ? 0.02 : 0.01}>
                      <AppDateTimePicker
                        value={pgAvailableFromDate ?? new Date()}
                        mode="date"
                        display="default"
                        onChange={(_e: any, d?: Date) => {
                          if (!d) return;
                          setPgAvailableFromDate(d);
                          setPgAvailableFromText('');
                        }}
                        style={{ height: 48, padding: '0 12px' }}
                      />
                    </YStack>
                  </YStack>
                </YStack>
              </XStack>

              <YStack gap="$2">
                <Text color={muted} fontSize={12} fontWeight="700">
                  Food Included*
                </Text>
                <XStack gap="$3" flexWrap="wrap">
                  {(
                    [
                      { label: 'Yes', value: 'yes' as const },
                      { label: 'No', value: 'no' as const },
                    ] as const
                  ).map((it) => (
                    <Pressable
                      key={it.value}
                      onPress={() => {
                        setPgFoodIncluded(it.value);
                        if (it.value === 'no') {
                          setPgMealBreakfast(false);
                          setPgMealLunch(false);
                          setPgMealDinner(false);
                        }
                      }}>
                      <XStack alignItems="center" gap="$2" paddingVertical={6}>
                        <YStack
                          width={18}
                          height={18}
                          borderWidth={2}
                          borderColor={pgFoodIncluded === it.value ? '#059669' : border}
                          borderRadius={20}
                          alignItems="center"
                          justifyContent="center">
                          <YStack width={10} height={10} borderRadius={10} backgroundColor={pgFoodIncluded === it.value ? '#059669' : 'transparent'} />
                        </YStack>
                        <Text color={titleColor} fontWeight="800">
                          {it.label}
                        </Text>
                      </XStack>
                    </Pressable>
                  ))}
                </XStack>

                {pgFoodIncluded === 'yes' ? (
                  <XStack gap="$3" flexWrap="wrap" paddingTop={6}>
                    {(
                      [
                        { label: 'Breakfast', v: pgMealBreakfast, setV: setPgMealBreakfast },
                        { label: 'Lunch', v: pgMealLunch, setV: setPgMealLunch },
                        { label: 'Dinner', v: pgMealDinner, setV: setPgMealDinner },
                      ] as const
                    ).map((it) => (
                      <Pressable key={it.label} onPress={() => it.setV(!it.v)}>
                        <XStack alignItems="center" gap="$2" paddingVertical={6}>
                          <YStack
                            width={18}
                            height={18}
                            borderWidth={1}
                            borderColor={it.v ? '#059669' : border}
                            borderRadius={4}
                            backgroundColor={it.v ? '#059669' : '#FFFFFF'}
                            alignItems="center"
                            justifyContent="center">
                            <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                              {it.v ? '✓' : ''}
                            </Text>
                          </YStack>
                          <Text color={titleColor} fontWeight="800">
                            {it.label}
                          </Text>
                        </XStack>
                      </Pressable>
                    ))}
                  </XStack>
                ) : null}
              </YStack>

              <YStack gap="$2">
                <Text color={titleColor} fontWeight="900">
                  PG/Hostel Rules
                </Text>

                <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                  {(
                    [
                      { label: 'No Smoking', icon: 'smoking-off', show: true, v: pgRuleNoSmoking, setV: setPgRuleNoSmoking },
                      { label: 'No Guardians Stay', icon: 'account-off-outline', show: true, v: pgRuleNoGuardianStay, setV: setPgRuleNoGuardianStay },
                      { label: pgOppositeEntryLabel, icon: 'account-remove-outline', show: pgPlaceAvailableFor !== 'anyone', v: pgRuleNoOppositeEntry, setV: setPgRuleNoOppositeEntry },
                      { label: 'No Drinking', icon: 'glass-wine', show: true, v: pgRuleNoDrinking, setV: setPgRuleNoDrinking },
                      { label: 'No Non-Veg', icon: 'food-drumstick-off-outline', show: true, v: pgRuleNoNonVeg, setV: setPgRuleNoNonVeg },
                    ] as const
                  )
                    .filter((x) => x.show)
                    .map((it) => (
                      <Pressable key={it.label} onPress={() => it.setV(!it.v)}>
                        <XStack alignItems="center" justifyContent="space-between" paddingVertical={10} paddingHorizontal={10} borderWidth={1} borderColor={border} borderRadius={12} backgroundColor="#FFFFFF" minWidth={240}>
                          <XStack alignItems="center" gap="$2">
                            <MaterialCommunityIcons name={it.icon as any} size={20} color={it.v ? '#059669' : '#374151'} />
                            <Text color={titleColor} fontWeight="800">
                              {it.label}
                            </Text>
                          </XStack>
                          <YStack
                            width={18}
                            height={18}
                            borderWidth={1}
                            borderColor={it.v ? '#059669' : border}
                            borderRadius={4}
                            backgroundColor={it.v ? '#059669' : '#FFFFFF'}
                            alignItems="center"
                            justifyContent="center">
                            <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                              {it.v ? '✓' : ''}
                            </Text>
                          </YStack>
                        </XStack>
                      </Pressable>
                    ))}
                </XStack>
              </YStack>

              <YStack gap="$2">
                <Text color={muted} fontSize={12} fontWeight="700">
                  Gate Closing Time*
                </Text>
                <YStack borderWidth={1} borderColor={border} borderRadius={12} overflow="hidden" backgroundColor="#FFFFFF" position="relative">
                  <YStack padding={12}>
                    <Text color={valueColor} fontWeight={valueWeight}>
                      {pgGateClosingTime ? formatTimeHhMm(pgGateClosingTime) : 'Gate Closing Time'}
                    </Text>
                  </YStack>
                  <YStack position="absolute" top={0} left={0} right={0} bottom={0} opacity={Platform.OS === 'web' ? 0.02 : 0.01}>
                    <AppDateTimePicker
                      value={pgGateClosingTime ?? new Date()}
                      mode="time"
                      display="default"
                      onChange={(_e: any, d?: Date) => {
                        if (!d) return;
                        setPgGateClosingTime(d);
                      }}
                      style={{ height: 48, padding: '0 12px' }}
                    />
                  </YStack>
                </YStack>
              </YStack>

              <YStack gap="$2">
                <Text color={muted} fontSize={12} fontWeight="700">
                  Description
                </Text>
                <TextInput
                  value={pgDescription}
                  onChangeText={setPgDescription}
                  placeholder="Write a few lines about your property. Please do not mention your contact details."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 90,
                    backgroundColor: '#FFFFFF',
                    color: valueColor,
                    textAlignVertical: 'top',
                  }}
                />
              </YStack>
            </YStack>
          ) : null}

          {step === 'pg_room_types' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$3">
              <Text color={titleColor} fontWeight="900">
                Room Details
              </Text>
              <Text color={muted} fontSize={12} fontWeight="700">
                Select the type of rooms available in your PG
              </Text>

              <XStack gap="$2" flexWrap="wrap" justifyContent="space-between">
                {(
                  [
                    { key: 'single' as const, label: 'Single', icon: 'bed-single-outline', value: pgRoomSingle, setValue: setPgRoomSingle },
                    { key: 'double' as const, label: 'Double', icon: 'bed-double-outline', value: pgRoomDouble, setValue: setPgRoomDouble },
                    { key: 'three' as const, label: 'Three', icon: 'bunk-bed-outline', value: pgRoomThree, setValue: setPgRoomThree },
                    { key: 'four' as const, label: 'Four', icon: 'bunk-bed', value: pgRoomFour, setValue: setPgRoomFour },
                  ] as const
                ).map((it) => (
                  <Pressable key={it.key} onPress={() => it.setValue(!it.value)}>
                    <YStack
                      width={160}
                      minHeight={120}
                      borderWidth={1}
                      borderColor={it.value ? '#059669' : border}
                      borderRadius={14}
                      padding={12}
                      backgroundColor={it.value ? '#ECFDF5' : '#FFFFFF'}
                      alignItems="center"
                      justifyContent="center"
                      gap="$2">
                      <MaterialCommunityIcons name={it.icon as any} size={34} color={it.value ? '#059669' : '#374151'} />
                      <XStack alignItems="center" gap="$2">
                        <YStack
                          width={18}
                          height={18}
                          borderWidth={1}
                          borderColor={it.value ? '#059669' : border}
                          borderRadius={4}
                          backgroundColor={it.value ? '#059669' : '#FFFFFF'}
                          alignItems="center"
                          justifyContent="center">
                          <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                            {it.value ? '✓' : ''}
                          </Text>
                        </YStack>
                        <Text color={titleColor} fontWeight="800">
                          {it.label}
                        </Text>
                      </XStack>
                    </YStack>
                  </Pressable>
                ))}
              </XStack>
            </YStack>
          ) : null}

          {step === 'pg_room_details' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$3">
              <Text color={titleColor} fontWeight="900">
                Room Details
              </Text>

              <XStack gap="$2" flexWrap="wrap">
                {pgSelectedRoomTypes.map((k) => (
                  <Pressable key={k} onPress={() => setPgActiveRoom(k)}>
                    <YStack
                      minWidth={140}
                      borderWidth={1}
                      borderColor={pgActiveRoom === k ? '#059669' : border}
                      borderRadius={12}
                      padding={12}
                      backgroundColor={pgActiveRoom === k ? '#ECFDF5' : '#FFFFFF'}
                      alignItems="center"
                      justifyContent="center">
                      <Text color={pgActiveRoom === k ? '#059669' : titleColor} fontWeight="900">
                        {pgRoomLabel(k)}
                      </Text>
                    </YStack>
                  </Pressable>
                ))}
              </XStack>

              <YStack gap="$2">
                <Text color={muted} fontSize={12} fontWeight="700">
                  Expected {pgActiveRoom === 'single' ? 'Rent' : 'Rent per person'}*
                </Text>
                <Input
                  value={pgRoomMoneyState(pgActiveRoom).rent[0]}
                  onChangeText={(t) => pgRoomMoneyState(pgActiveRoom).rent[1](sanitizeSingleDecimal(String(t ?? '')))}
                  placeholder="Enter amount"
                  keyboardType="numeric"
                  backgroundColor="#FFFFFF"
                  borderColor={border}
                  color={valueColor}
                />
              </YStack>

              <YStack gap="$2">
                <Text color={muted} fontSize={12} fontWeight="700">
                  Expected {pgActiveRoom === 'single' ? 'Deposit' : 'Deposit per person'}*
                </Text>
                <Input
                  value={pgRoomMoneyState(pgActiveRoom).deposit[0]}
                  onChangeText={(t) => pgRoomMoneyState(pgActiveRoom).deposit[1](sanitizeSingleDecimal(String(t ?? '')))}
                  placeholder="Enter amount"
                  keyboardType="numeric"
                  backgroundColor="#FFFFFF"
                  borderColor={border}
                  color={valueColor}
                />
              </YStack>

              <YStack gap="$2">
                <Text color={titleColor} fontWeight="900">
                  Room Amenities
                </Text>

                {(
                  [
                    { k: 'cupboard' as const, label: 'Cupboard', icon: 'cupboard-outline' },
                    { k: 'tv' as const, label: 'TV', icon: 'television' },
                    { k: 'bedding' as const, label: 'Bedding', icon: 'bed-outline' },
                    { k: 'geyer' as const, label: 'Geyser', icon: 'water-boiler' },
                    { k: 'ac' as const, label: 'AC', icon: 'air-conditioner' },
                    { k: 'attachedBathroom' as const, label: 'Attached Bathroom', icon: 'toilet' },
                  ] as const
                ).map((it) => {
                  const st = pgAmenityState(pgActiveRoom);
                  const v = it.k === 'cupboard' ? st.cupboard : it.k === 'tv' ? st.tv : it.k === 'bedding' ? st.bedding : it.k === 'geyer' ? st.geyser : it.k === 'ac' ? st.ac : st.attachedBathroom;
                  const checked = v[0];
                  const setChecked = v[1];
                  return (
                    <Pressable key={it.k} onPress={() => setChecked(!checked)}>
                      <XStack alignItems="center" justifyContent="space-between" paddingVertical={10} paddingHorizontal={10} borderWidth={1} borderColor={border} borderRadius={12} backgroundColor="#FFFFFF">
                        <XStack alignItems="center" gap="$2">
                          <MaterialCommunityIcons name={it.icon as any} size={20} color={checked ? '#059669' : '#374151'} />
                          <Text color={titleColor} fontWeight="800">
                            {it.label}
                          </Text>
                        </XStack>
                        <YStack
                          width={18}
                          height={18}
                          borderWidth={1}
                          borderColor={checked ? '#059669' : border}
                          borderRadius={4}
                          backgroundColor={checked ? '#059669' : '#FFFFFF'}
                          alignItems="center"
                          justifyContent="center">
                          <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                            {checked ? '✓' : ''}
                          </Text>
                        </YStack>
                      </XStack>
                    </Pressable>
                  );
                })}
              </YStack>
            </YStack>
          ) : null}

          {step === 'additional_info' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$3">
              <Text color={titleColor} fontWeight="900">
                Additional Information
              </Text>

              {isCommercialAny ? (
                <>
                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Property Description
                    </Text>
                    <TextInput
                      value={description}
                      onChangeText={setDescription}
                      placeholder="Provide any specific description you want to add about your property like furnishing and other amenities..."
                      placeholderTextColor="#9CA3AF"
                      multiline
                      style={{
                        borderWidth: 1,
                        borderColor: border,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        minHeight: 100,
                        backgroundColor: '#FFFFFF',
                        color: valueColor,
                        textAlignVertical: 'top',
                      }}
                    />
                  </YStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Previous Occupancy
                      </Text>
                      <Pressable onPress={() => setPickerOpen('commercialPreviousOccupancy')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {commercialPreviousOccupancy
                              ? commercialPreviousOccupancy === 'first_time_rental'
                                ? 'First time rental'
                                : commercialPreviousOccupancy === 'currently_rented'
                                  ? 'Currently rented-rented'
                                  : 'Previously rented'
                              : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Who will show the property?*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('whoWillShow')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {whoWillShowProperty || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        I want to get my property painted
                      </Text>
                      {renderYesNo(commercialWantPainted, setCommercialWantPainted)}
                    </YStack>
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        I want to get my property cleaned
                      </Text>
                      {renderYesNo(commercialWantCleaned, setCommercialWantCleaned)}
                    </YStack>
                  </XStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Secondary Number
                    </Text>
                    <XStack gap="$2" flexWrap="wrap">
                      <YStack minWidth={220} flexGrow={1} gap="$2">
                        <Pressable onPress={() => setPickerOpen('secondaryCountryCode')}>
                          <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                            <Text color={valueColor} fontWeight={valueWeight}>
                              {secondaryCountryCodeLabel}
                            </Text>
                          </YStack>
                        </Pressable>
                      </YStack>
                      <YStack minWidth={220} flexGrow={2} gap="$2">
                        <Input
                          value={secondaryPhoneDigits}
                          onChangeText={(t) => setSecondaryPhone(String(t ?? '').replace(/[^0-9]/g, '').slice(0, 10))}
                          placeholder="Secondary Number"
                          keyboardType={Platform.OS === 'web' ? 'default' : 'phone-pad'}
                          backgroundColor="#FFFFFF"
                          borderColor={border}
                          color={valueColor}
                        />
                      </YStack>
                    </XStack>
                  </YStack>
                </>
              ) : isLandPlot ? (
                <>
                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Ownership*
                    </Text>
                    <Pressable onPress={() => setPickerOpen('landOwnership')}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {landOwnership
                            ? landOwnership === 'freehold'
                              ? 'Freehold'
                              : landOwnership === 'leasehold'
                                ? 'Leasehold'
                                : landOwnership === 'cooperative_society'
                                  ? 'Co-operative Society'
                                  : 'Power Of Attorney'
                            : 'Select'}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>

                  {landOwnership === 'leasehold' ? (
                    <YStack gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Lease Term (Years)*
                      </Text>
                      <Input
                        value={landLeaseTermYears}
                        onChangeText={(t) => setLandLeaseTermYears(String(t ?? '').replace(/[^0-9]/g, '').slice(0, 2))}
                        placeholder="Enter years"
                        keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>
                  ) : null}

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Sale Deed Certificate*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('landSaleDeedCertificate')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {landSaleDeedCertificate ? yesNoDontKnowText(landSaleDeedCertificate as any) : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Encumbrance certificate*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('landEncumbranceCertificate')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {landEncumbranceCertificate ? yesNoDontKnowText(landEncumbranceCertificate as any) : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Conversion certificate*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('landConversionCertificate')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {landConversionCertificate
                              ? landConversionCertificate === 'yes'
                                ? 'Yes'
                                : landConversionCertificate === 'no'
                                  ? 'No'
                                  : landConversionCertificate === 'not_needed'
                                    ? 'Not Needed'
                                    : "Don't know"
                              : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Is the property RERA Approved?*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('landReraApproved')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {landReraApproved ? (landReraApproved === 'yes' ? 'Yes' : 'No') : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <YStack flexGrow={1} minWidth={220} gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Khata certificate*
                    </Text>
                    <Pressable onPress={() => setPickerOpen('landKhataCertificate')}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {landKhataCertificate
                            ? landKhataCertificate === 'yes_a_khata'
                              ? 'Yes, A-Khata'
                              : landKhataCertificate === 'yes_b_khata'
                                ? 'Yes, B-Khata'
                                : landKhataCertificate === 'no'
                                  ? 'No'
                                  : "Don't know"
                            : 'Select'}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>
                </>
              ) : (
                <>
                  <YStack flexGrow={1} minWidth={220} gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Do you have Khata Certificate?*
                    </Text>
                    <Pressable onPress={() => setPickerOpen('khataCertificate')}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {khataCertificateText(khataCertificate)}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Do you have Sale Deed Certificate?*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('saleDeedCertificate')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {yesNoDontKnowText(saleDeedCertificate)}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    {saleDeedCertificate === 'no' ? (
                      <YStack flexGrow={1} minWidth={220} gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Do you have Sale Agreement?*
                        </Text>
                        <Pressable onPress={() => setPickerOpen('saleAgreement')}>
                          <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                            <Text color={valueColor} fontWeight={valueWeight}>
                              {yesNoDontKnowText(saleAgreement)}
                            </Text>
                          </YStack>
                        </Pressable>
                      </YStack>
                    ) : null}
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Have you paid Property Tax?*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('propertyTaxPaid')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {yesNoDontKnowText(propertyTaxPaid)}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Do you have Occupancy Certificate?*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('occupancyCertificate')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {yesNoDontKnowText(occupancyCertificate)}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>
                </>
              )}
            </YStack>
          ) : null}

          {step === 'schedule' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$3">
              <Text color={titleColor} fontWeight="900">
                Schedule
              </Text>

              {isLandPlot ? (
                <XStack gap="$2" flexWrap="wrap">
                  <YStack flexGrow={1} minWidth={220} gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Who will show the plot?*
                    </Text>
                    <Pressable onPress={() => setPickerOpen('whoWillShow')}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {whoWillShowProperty || 'Select'}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>

                  <YStack flexGrow={1} minWidth={220} gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Secondary Number
                    </Text>
                    <Input
                      value={secondaryPhoneDigits}
                      onChangeText={(t) => setSecondaryPhone(String(t ?? '').replace(/[^0-9]/g, '').slice(0, 10))}
                      placeholder="10 digit number"
                      keyboardType={Platform.OS === 'web' ? 'default' : 'phone-pad'}
                      backgroundColor="#FFFFFF"
                      borderColor={border}
                      color={valueColor}
                    />
                  </YStack>
                </XStack>
              ) : null}

              <YStack gap="$2">
                <Text color={muted} fontSize={12} fontWeight="700">
                  Availability
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  <Button
                    size="$3"
                    backgroundColor={scheduleAvailability === 'everyday' ? '#059669' : '#F3F4F6'}
                    color={scheduleAvailability === 'everyday' ? '#FFFFFF' : '#111827'}
                    fontWeight="900"
                    hoverStyle={{
                      backgroundColor: scheduleAvailability === 'everyday' ? '#059669' : '#F3F4F6',
                    }}
                    onPress={() => setScheduleAvailability('everyday')}>
                    <YStack alignItems="center" gap={2}>
                      <Text
                        color={scheduleAvailability === 'everyday' ? '#FFFFFF' : '#111827'}
                        fontWeight="900"
                        hoverStyle={{ color: '#FFFFFF' }}>
                        Everyday
                      </Text>
                      <Text color={scheduleAvailability === 'everyday' ? '#D1FAE5' : muted} fontSize={11} fontWeight="700">
                        Mon-Sun
                      </Text>
                    </YStack>
                  </Button>
                  <Button
                    size="$3"
                    backgroundColor={scheduleAvailability === 'weekday' ? '#059669' : '#F3F4F6'}
                    color={scheduleAvailability === 'weekday' ? '#FFFFFF' : '#111827'}
                    fontWeight="900"
                    hoverStyle={{
                      backgroundColor: scheduleAvailability === 'weekday' ? '#059669' : '#F3F4F6',
                    }}
                    onPress={() => setScheduleAvailability('weekday')}>
                    <YStack alignItems="center" gap={2}>
                      <Text
                        color={scheduleAvailability === 'weekday' ? '#FFFFFF' : '#111827'}
                        fontWeight="900"
                        hoverStyle={{ color: '#FFFFFF' }}>
                        Weekday
                      </Text>
                      <Text color={scheduleAvailability === 'weekday' ? '#D1FAE5' : muted} fontSize={11} fontWeight="700">
                        Mon-Fri
                      </Text>
                    </YStack>
                  </Button>
                  <Button
                    size="$3"
                    backgroundColor={scheduleAvailability === 'weekend' ? '#059669' : '#F3F4F6'}
                    color={scheduleAvailability === 'weekend' ? '#FFFFFF' : '#111827'}
                    fontWeight="900"
                    hoverStyle={{
                      backgroundColor: scheduleAvailability === 'weekend' ? '#059669' : '#F3F4F6',
                    }}
                    onPress={() => setScheduleAvailability('weekend')}>
                    <YStack alignItems="center" gap={2}>
                      <Text
                        color={scheduleAvailability === 'weekend' ? '#FFFFFF' : '#111827'}
                        fontWeight="900"
                        hoverStyle={{ color: '#FFFFFF' }}>
                        Weekend
                      </Text>
                      <Text color={scheduleAvailability === 'weekend' ? '#D1FAE5' : muted} fontSize={11} fontWeight="700">
                        Sat-Sun
                      </Text>
                    </YStack>
                  </Button>
                </XStack>
              </YStack>

              <XStack gap="$2" flexWrap="wrap" alignItems="flex-end">
                <YStack flexGrow={1} minWidth={220} gap="$2">
                  <Text color={muted} fontSize={12} fontWeight="700">
                    Select Time Schedule
                  </Text>
                  <YStack borderWidth={1} borderColor={border} borderRadius={12} overflow="hidden" backgroundColor="#FFFFFF" position="relative">
                    <YStack padding={12} opacity={scheduleAllDay ? 0.5 : 1}>
                      <Text color={valueColor} fontWeight={valueWeight}>
                        {scheduleStart ? formatTimeHhMm(scheduleStart) : 'Start time'}
                      </Text>
                    </YStack>
                    <YStack position="absolute" top={0} left={0} right={0} bottom={0} opacity={scheduleAllDay ? 0 : Platform.OS === 'web' ? 0.02 : 0.01} pointerEvents={scheduleAllDay ? 'none' : 'auto'}>
                      <AppDateTimePicker
                        value={scheduleStart ?? new Date()}
                        mode="time"
                        display="default"
                        onChange={(_e: any, d?: Date) => {
                          if (!d) return;
                          setScheduleStart(d);
                        }}
                        style={{ height: 48, padding: '0 12px' }}
                      />
                    </YStack>
                  </YStack>
                </YStack>

                <YStack flexGrow={1} minWidth={220} gap="$2">
                  <YStack height={16} />
                  <YStack borderWidth={1} borderColor={border} borderRadius={12} overflow="hidden" backgroundColor="#FFFFFF" position="relative">
                    <YStack padding={12} opacity={scheduleAllDay ? 0.5 : 1}>
                      <Text color={valueColor} fontWeight={valueWeight}>
                        {scheduleEnd ? formatTimeHhMm(scheduleEnd) : 'End time'}
                      </Text>
                    </YStack>
                    <YStack position="absolute" top={0} left={0} right={0} bottom={0} opacity={scheduleAllDay ? 0 : Platform.OS === 'web' ? 0.02 : 0.01} pointerEvents={scheduleAllDay ? 'none' : 'auto'}>
                      <AppDateTimePicker
                        value={scheduleEnd ?? new Date()}
                        mode="time"
                        display="default"
                        onChange={(_e: any, d?: Date) => {
                          if (!d) return;
                          setScheduleEnd(d);
                        }}
                        style={{ height: 48, padding: '0 12px' }}
                      />
                    </YStack>
                  </YStack>
                </YStack>
              </XStack>

              <Pressable
                onPress={() => {
                  setScheduleAllDay((p) => {
                    const nextVal = !p;
                    if (nextVal) {
                      const start = new Date();
                      start.setHours(7, 0, 0, 0);
                      const end = new Date();
                      end.setHours(22, 0, 0, 0);
                      setScheduleStart(start);
                      setScheduleEnd(end);
                    } else {
                      setScheduleStart(null);
                      setScheduleEnd(null);
                    }
                    return nextVal;
                  });
                }}>
                <XStack alignItems="center" gap="$2" paddingVertical={8}>
                  <YStack
                    width={18}
                    height={18}
                    borderWidth={1}
                    borderColor={scheduleAllDay ? '#059669' : border}
                    borderRadius={4}
                    backgroundColor={scheduleAllDay ? '#059669' : '#FFFFFF'}
                    alignItems="center"
                    justifyContent="center">
                    <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                      {scheduleAllDay ? '✓' : ''}
                    </Text>
                  </YStack>
                  <Text color={titleColor} fontWeight="800">
                    Available All Day
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          ) : null}

          <BookingMapPicker
            open={mapPickerOpen}
            onOpenChange={(nextVal) => setMapPickerOpen(nextVal)}
            title="Select Location"
            token={mapboxToken}
            coord={mapPickerCoord}
            onCoordChange={setMapPickerCoord}
            busy={mapPickerBusy}
            isWide={false}
            onConfirm={async () => {
              if (!mapPickerCoord) return;
              setMapPickerBusy(true);
              try {
                const features = await reverseGeocodeFeatures(mapPickerCoord.lng, mapPickerCoord.lat, 8).catch(() => []);
                const details =
                  (features.find((f: any) => (f.place_type ?? []).includes('address')) ??
                    features[0] ??
                    (await reverseGeocodeDetails(mapPickerCoord.lng, mapPickerCoord.lat).catch(() => null))) as any;

                const fallbackPlace = await reverseGeocode(mapPickerCoord.lng, mapPickerCoord.lat).catch(() => '');
                const placeName = String(details?.place_name ?? fallbackPlace ?? '').trim();

                const ctx = Array.isArray(details?.context) ? details.context : [];
                const ctxState = ctx.find((x: any) => String(x?.id ?? '').startsWith('region.'));
                const ctxCity = ctx.find((x: any) => String(x?.id ?? '').startsWith('place.'));
                const ctxLocality = ctx.find((x: any) => String(x?.id ?? '').startsWith('locality.')) ?? ctx.find((x: any) => String(x?.id ?? '').startsWith('neighborhood.'));
                const ctxPostcode = ctx.find((x: any) => String(x?.id ?? '').startsWith('postcode.'));

                const nextState = String(ctxState?.text ?? '').trim();
                const nextCity = String(ctxCity?.text ?? '').trim();
                const nextLocality = String(ctxLocality?.text ?? '').trim();
                const landmark = String(
                  `${details?.address ? `${details.address} ` : ''}${details?.text ?? ''}`
                ).trim();

                const pincodeFromLandmark = /\b([0-9]{6})\b/.exec(landmark)?.[1] ?? '';
                const pincodeFromContext = String(ctxPostcode?.text ?? '').trim();
                const pincodeFromText = /\b([0-9]{6})\b/.exec(placeName)?.[1] ?? '';
                const nextPincode = (pincodeFromLandmark || pincodeFromContext || pincodeFromText).trim();

                if (nextState) setStateValue(nextState);
                if (nextCity) setCityValue(nextCity);
                if (nextLocality) {
                  setLocalityValue(nextLocality);
                  setLocalityTyped(false);
                  setLocalitySuggestions([]);
                } else if (placeName) {
                  const first = placeName.split(',')[0]?.trim();
                  if (first) {
                    setLocalityValue(first);
                    setLocalityTyped(false);
                    setLocalitySuggestions([]);
                  }
                }

                if (landmark) {
                  setAddress1(landmark);
                } else if (placeName) {
                  setAddress1(placeName.split(',')[0]?.trim() || placeName);
                }

                if (nextPincode) {
                  setPincode(String(nextPincode).replace(/[^0-9]/g, '').slice(0, 6));
                }

                setMapPickerOpen(false);
              } catch {
                setError('Failed to fetch location details. Please try again or fill address manually.');
              } finally {
                setMapPickerBusy(false);
              }
            }}
          />

          {step === 'details' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900">
                Property Details
              </Text>

              {adType === 'resale' ? (
                <Text color={muted} fontSize={11}>
                  Residential Resale details
                </Text>
              ) : null}

              {isLandPlot ? (
                <>
                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Plot Area (Sq.ft)*
                    </Text>
                    <Input
                      value={plotAreaSqft}
                      onChangeText={(t) => {
                        const nextArea = sanitizeSingleDecimal(String(t ?? ''));
                        setPlotAreaSqft(nextArea);

                        const a = Number(nextArea || 0);
                        const l = Number(plotLengthFt || 0);
                        const w = Number(plotWidthFt || 0);
                        if (a > 0 && l > 0) {
                          const nextW = a / l;
                          if (Number.isFinite(nextW) && nextW > 0) setPlotWidthFt(sanitizeSingleDecimal(String(Number(nextW.toFixed(2)))));
                        } else if (a > 0 && w > 0) {
                          const nextL = a / w;
                          if (Number.isFinite(nextL) && nextL > 0) setPlotLengthFt(sanitizeSingleDecimal(String(Number(nextL.toFixed(2)))));
                        }
                      }}
                      placeholder="Minimum 100 sq.ft"
                      keyboardType="numeric"
                      backgroundColor="#FFFFFF"
                      borderColor={border}
                      color={valueColor}
                    />
                  </YStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Length (ft.)*
                      </Text>
                      <Input
                        value={plotLengthFt}
                        onChangeText={(t) => {
                          const nextLen = sanitizeSingleDecimal(String(t ?? ''));
                          setPlotLengthFt(nextLen);

                          const a = Number(plotAreaSqft || 0);
                          const l = Number(nextLen || 0);
                          if (a > 0 && l > 0) {
                            const nextW = a / l;
                            if (Number.isFinite(nextW) && nextW > 0) setPlotWidthFt(sanitizeSingleDecimal(String(Number(nextW.toFixed(2)))));
                          }
                        }}
                        placeholder="Enter length"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>

                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Width (ft.)*
                      </Text>
                      <Input
                        value={plotWidthFt}
                        editable={false}
                        placeholder="Auto calculated (Plot Area / Length)"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Boundary Wall*
                      </Text>
                      {renderYesNo(boundaryWall, setBoundaryWall)}
                    </YStack>
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Corner Plot*
                      </Text>
                      {renderYesNo(cornerPlot, setCornerPlot)}
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Floors allowed for construction*
                      </Text>
                      <Input
                        value={floorsAllowed}
                        onChangeText={(t) => setFloorsAllowed(String(t ?? '').replace(/[^0-9]/g, '').slice(0, 3))}
                        placeholder="Enter floors"
                        keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>
                  </XStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Is the Land/Plot inside a gated project?*
                    </Text>
                    {renderYesNo(insideGatedProject, (v) => {
                      setInsideGatedProject(v);
                      if (v === 0) setGatedProjectName('');
                    })}

                    {insideGatedProject === 1 ? (
                      <Input
                        marginTop={10}
                        value={gatedProjectName}
                        onChangeText={setGatedProjectName}
                        placeholder="Project Name"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    ) : null}
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Facing*
                    </Text>
                    <Pressable onPress={() => setPickerOpen('facing')}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {facing || 'Select'}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>
                </>
              ) : isCommercialAny ? (
                <>
                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Property Type*
                    </Text>
                    <Pressable
                      onPress={() => {
                        setPickerOpen('commercialPropertyType');
                        setAreaUnit('sqft');
                      }}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {commercialPropertyTypeOptions.find((x) => x.value === (propertyType as any))?.label ?? 'Select'}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Building Type*
                    </Text>
                    <Pressable onPress={() => setPickerOpen('commercialBuildingType')}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {commercialBuildingTypeOptions.find((x) => x.value === (commercialBuildingType as any))?.label ?? 'Select'}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Age of Property*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('propertyAge')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {propertyAge || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Floor*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('floor')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {floor || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Total Floor*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('totalFloors')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {totalFloors || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  {isCommercialSale ? (
                    <XStack gap="$2" flexWrap="wrap" alignItems="flex-end">
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Super Built-up Area (Sq.ft)*
                        </Text>
                        <Input
                          value={areaSqft}
                          onChangeText={(t) => {
                            setAreaUnit('sqft');
                            setAreaSqft(sanitizeSingleDecimal(String(t ?? '')));
                          }}
                          placeholder="Enter area"
                          keyboardType="numeric"
                          backgroundColor="#FFFFFF"
                          borderColor={border}
                          color={valueColor}
                        />
                      </YStack>
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Carpet Area
                        </Text>
                        <Input
                          value={carpetAreaSqft}
                          onChangeText={(t) => setCarpetAreaSqft(sanitizeSingleDecimal(String(t ?? '')))}
                          placeholder="Enter carpet area"
                          keyboardType="numeric"
                          backgroundColor="#FFFFFF"
                          borderColor={border}
                          color={valueColor}
                        />
                      </YStack>
                    </XStack>
                  ) : (
                    <XStack gap="$2" flexWrap="wrap" alignItems="flex-end">
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Super Built-up Area (Sq.ft)*
                        </Text>
                        <Input
                          value={areaSqft}
                          onChangeText={(t) => {
                            setAreaUnit('sqft');
                            setAreaSqft(sanitizeSingleDecimal(String(t ?? '')));
                          }}
                          placeholder="Enter area"
                          keyboardType="numeric"
                          backgroundColor="#FFFFFF"
                          borderColor={border}
                          color={valueColor}
                        />
                      </YStack>
                    </XStack>
                  )}

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Furnishing*
                    </Text>
                    <Pressable onPress={() => setPickerOpen('furnishing')}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {furnishing === 'furnished'
                            ? 'Fully Furnished'
                            : furnishing === 'semi_furnished'
                              ? 'Heavy Furnished'
                              : furnishing === 'unfurnished'
                                ? 'Unfurnished'
                                : 'Select'}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Other Features
                    </Text>
                    <XStack gap="$3" flexWrap="wrap" paddingTop={2}>
                      <Pressable onPress={() => setCommercialOnMainRoad((p) => !p)}>
                        <XStack alignItems="center" gap="$2" paddingVertical={6}>
                          <YStack
                            width={18}
                            height={18}
                            borderWidth={1}
                            borderColor={commercialOnMainRoad ? '#059669' : border}
                            borderRadius={4}
                            backgroundColor={commercialOnMainRoad ? '#059669' : '#FFFFFF'}
                            alignItems="center"
                            justifyContent="center">
                            <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                              {commercialOnMainRoad ? '✓' : ''}
                            </Text>
                          </YStack>
                          <Text color={titleColor} fontWeight="800">
                            On Main Road
                          </Text>
                        </XStack>
                      </Pressable>

                      <Pressable onPress={() => setCommercialCornerProperty((p) => !p)}>
                        <XStack alignItems="center" gap="$2" paddingVertical={6}>
                          <YStack
                            width={18}
                            height={18}
                            borderWidth={1}
                            borderColor={commercialCornerProperty ? '#059669' : border}
                            borderRadius={4}
                            backgroundColor={commercialCornerProperty ? '#059669' : '#FFFFFF'}
                            alignItems="center"
                            justifyContent="center">
                            <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                              {commercialCornerProperty ? '✓' : ''}
                            </Text>
                          </YStack>
                          <Text color={titleColor} fontWeight="800">
                            Corner Property
                          </Text>
                        </XStack>
                      </Pressable>
                    </XStack>
                  </YStack>
                </>
              ) : (
                <YStack gap="$2">
                  <Text color={muted} fontSize={12} fontWeight="700">
                    Property Type*
                  </Text>
                  <Pressable onPress={() => setPickerOpen('apartmentType')}>
                    <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                      <Text color={valueColor} fontWeight={valueWeight}>
                        {apartmentType === 'apartment'
                          ? 'Apartment'
                          : apartmentType === 'independent_house_villa'
                            ? 'Independent House / Villa'
                            : apartmentType === 'standalone_building'
                              ? 'Standalone Building'
                              : 'Gated Community Villa'}
                      </Text>
                    </YStack>
                  </Pressable>
                </YStack>
              )}

              {isLandPlot ? null : adType === 'flatmates' ? (
                apartmentType === 'apartment' || apartmentType === 'gated_community_villa' ? (
                  <Input value={apartmentName} onChangeText={setApartmentName} placeholder="Apartment Name" backgroundColor="#FFFFFF" borderColor={border} color={valueColor} />
                ) : null
              ) : adType === 'resale' ? (
                apartmentType === 'apartment' || apartmentType === 'gated_community_villa' || apartmentType === 'standalone_building' ? (
                  <Input value={apartmentName} onChangeText={setApartmentName} placeholder="Apartment Name" backgroundColor="#FFFFFF" borderColor={border} color={valueColor} />
                ) : null
              ) : isCommercialAny ? null : apartmentType !== 'independent_house_villa' ? (
                <Input value={apartmentName} onChangeText={setApartmentName} placeholder="Apartment Name" backgroundColor="#FFFFFF" borderColor={border} color={valueColor} />
              ) : null}

              {isCommercialAny || isLandPlot ? null : (
                <YStack gap="$2">
                  <Text color={muted} fontSize={12} fontWeight="700">
                    BHK Type*
                  </Text>
                  <Pressable onPress={() => setPickerOpen('bhkType')}>
                    <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                      <Text color={valueColor} fontWeight={valueWeight}>
                        {bhkType || 'Select'}
                      </Text>
                    </YStack>
                  </Pressable>
                </YStack>
              )}

              {adType === 'flatmates' ? (
                <>
                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Floor*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('floor')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {floor || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Total Floor*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('totalFloors')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {totalFloors || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={240} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Room Type*
                      </Text>
                      <XStack gap="$2" flexWrap="wrap">
                        <Button
                          size="$2"
                          borderWidth={1}
                          borderColor={flatmatesRoomType === 'single_room' ? '#059669' : border}
                          backgroundColor={flatmatesRoomType === 'single_room' ? '#ECFDF5' : '#FFFFFF'}
                          color={titleColor}
                          fontWeight="800"
                          onPress={() => setFlatmatesRoomType('single_room')}>
                          Single Room {flatmatesRoomType === 'single_room' ? '✓' : ''}
                        </Button>
                        <Button
                          size="$2"
                          borderWidth={1}
                          borderColor={flatmatesRoomType === 'shared_room' ? '#059669' : border}
                          backgroundColor={flatmatesRoomType === 'shared_room' ? '#ECFDF5' : '#FFFFFF'}
                          color={titleColor}
                          fontWeight="800"
                          onPress={() => setFlatmatesRoomType('shared_room')}>
                          Shared Room {flatmatesRoomType === 'shared_room' ? '✓' : ''}
                        </Button>
                      </XStack>
                    </YStack>

                    <YStack flexGrow={1} minWidth={240} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Tenant Type*
                      </Text>
                      <XStack gap="$2" flexWrap="wrap">
                        <Button
                          size="$2"
                          borderWidth={1}
                          borderColor={flatmatesTenantType === 'male' ? '#059669' : border}
                          backgroundColor={flatmatesTenantType === 'male' ? '#ECFDF5' : '#FFFFFF'}
                          color={titleColor}
                          fontWeight="800"
                          onPress={() => setFlatmatesTenantType('male')}>
                          Male {flatmatesTenantType === 'male' ? '✓' : ''}
                        </Button>
                        <Button
                          size="$2"
                          borderWidth={1}
                          borderColor={flatmatesTenantType === 'female' ? '#059669' : border}
                          backgroundColor={flatmatesTenantType === 'female' ? '#ECFDF5' : '#FFFFFF'}
                          color={titleColor}
                          fontWeight="800"
                          onPress={() => setFlatmatesTenantType('female')}>
                          Female {flatmatesTenantType === 'female' ? '✓' : ''}
                        </Button>
                      </XStack>
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Property Age*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('propertyAge')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {propertyAge || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Facing
                      </Text>
                      <Pressable onPress={() => setPickerOpen('facing')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {facing || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap" alignItems="flex-end">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Built Up Area*
                      </Text>
                      <Input
                        value={areaSqft}
                        onChangeText={(t) => setAreaSqft(sanitizeSingleDecimal(String(t ?? '')))}
                        placeholder="Enter area"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>
                    <YStack minWidth={140} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Unit
                      </Text>
                      <Pressable
                        onPress={() => {
                          setAreaUnit('sqft');
                          setPickerOpen('areaUnit');
                        }}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            Sq ft
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>
                </>
              ) : null}

              {adType === 'resale' && !isLandPlot ? (
                <YStack gap="$2">
                  <Text color={muted} fontSize={12} fontWeight="700">
                    Ownership Type*
                  </Text>
                  <Pressable onPress={() => setPickerOpen('ownershipType')}>
                  <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                    <Text color={valueColor} fontWeight={valueWeight}>
                      {ownershipType === 'on_lease' ? 'On Lease' : ownershipType === 'self_owned' ? 'Self Owned' : 'Select'}
                    </Text>
                  </YStack>
                </Pressable>
              </YStack>
              ) : adType !== 'flatmates' && !isCommercialAny && !(propertyCategory === 'residential' && adType === 'rent') ? (
                <>
                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Property available for
                    </Text>
                    <XStack borderWidth={1} borderColor={border} borderRadius={14} overflow="hidden" backgroundColor="#F3F4F6">
                      <Button
                        flex={1}
                        borderRadius={0}
                        backgroundColor={propertyAvailableFor === 'only_rent' ? '#059669' : 'transparent'}
                        color={propertyAvailableFor === 'only_rent' ? '#FFFFFF' : '#111827'}
                        fontWeight="800"
                        hoverStyle={{ backgroundColor: propertyAvailableFor === 'only_rent' ? '#059669' : 'transparent' }}
                        pressStyle={{ backgroundColor: propertyAvailableFor === 'only_rent' ? '#059669' : 'transparent' }}
                        onPress={() => {
                          setPropertyAvailableFor('only_rent');
                        }}>
                        <Text color={propertyAvailableFor === 'only_rent' ? '#FFFFFF' : '#111827'} fontWeight="800" hoverStyle={{ color: '#FFFFFF' }}>
                          Only rent
                        </Text>
                      </Button>
                      <Button
                        flex={1}
                        borderRadius={0}
                        backgroundColor={propertyAvailableFor === 'only_lease' ? '#059669' : 'transparent'}
                        color={propertyAvailableFor === 'only_lease' ? '#FFFFFF' : '#111827'}
                        fontWeight="800"
                        hoverStyle={{ backgroundColor: propertyAvailableFor === 'only_lease' ? '#059669' : 'transparent' }}
                        pressStyle={{ backgroundColor: propertyAvailableFor === 'only_lease' ? '#059669' : 'transparent' }}
                        onPress={() => {
                          setPropertyAvailableFor('only_lease');
                          setDeposit('');
                        }}>
                        <Text color={propertyAvailableFor === 'only_lease' ? '#FFFFFF' : '#111827'} fontWeight="800" hoverStyle={{ color: '#FFFFFF' }}>
                          Only lease
                        </Text>
                      </Button>
                    </XStack>
                  </YStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={price}
                      onChangeText={(t) => setPrice(sanitizeSingleDecimal(String(t ?? '')))}
                      placeholder={propertyAvailableFor === 'only_lease' ? 'Expected Lease Amount *' : 'Expected Rent *'}
                      keyboardType="numeric"
                      backgroundColor="#FFFFFF"
                      borderColor={border}
                      color={valueColor}
                      flexGrow={1}
                      minWidth={200}
                    />
                    {propertyAvailableFor === 'only_rent' ? (
                      <Input
                        value={deposit}
                        onChangeText={(t) => setDeposit(sanitizeSingleDecimal(String(t ?? '')))}
                        placeholder="Expected Deposit *"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                        flexGrow={1}
                        minWidth={200}
                      />
                    ) : null}
                  </XStack>

                  <Pressable onPress={() => setRentNegotiable((p) => !p)}>
                    <XStack alignItems="center" gap="$2" paddingVertical={8}>
                      <YStack
                        width={18}
                        height={18}
                        borderWidth={1}
                        borderColor={rentNegotiable ? '#059669' : border}
                        borderRadius={4}
                        backgroundColor={rentNegotiable ? '#059669' : '#FFFFFF'}
                        alignItems="center"
                        justifyContent="center">
                        <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                          {rentNegotiable ? '✓' : ''}
                        </Text>
                      </YStack>
                      <Text color={titleColor} fontWeight="800">
                        Rent Negotiable
                      </Text>
                    </XStack>
                  </Pressable>
                </>
              ) : null}

              {propertyCategory === 'residential' && adType === 'rent' ? (
                <>
                  <XStack gap="$2" flexWrap="wrap" alignItems="flex-end">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Built Up Area*
                      </Text>
                      <Input
                        value={areaSqft}
                        onChangeText={(t) => setAreaSqft(sanitizeSingleDecimal(String(t ?? '')))}
                        placeholder="Enter area"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>
                    <YStack minWidth={140} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Unit
                      </Text>
                      <Pressable onPress={() => setPickerOpen('areaUnit')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            Sq ft
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        No. of Floor(s)*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('floor')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {floor || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    {apartmentType !== 'independent_house_villa' ? (
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Total Floor(s)*
                        </Text>
                        <Pressable onPress={() => setPickerOpen('totalFloors')}>
                          <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                            <Text color={valueColor} fontWeight={valueWeight}>
                              {totalFloors || 'Select'}
                            </Text>
                          </YStack>
                        </Pressable>
                      </YStack>
                    ) : null}
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Property Age*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('propertyAge')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {propertyAge || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Facing*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('facing')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {facing || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>
                </>
              ) : null}

              {adType === 'resale' && !isLandPlot ? (
                <>
                  {ownershipType === 'on_lease' ? (
                    <YStack gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Lease Years*
                      </Text>
                      <Input
                        value={leaseYears}
                        onChangeText={(t) => setLeaseYears(String(t ?? '').replace(/[^0-9]/g, '').slice(0, 2))}
                        placeholder="Enter years"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>
                  ) : null}

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Floor Type*
                    </Text>
                    <Pressable onPress={() => setPickerOpen('floorType')}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {floorType === 'verified_tiles'
                            ? 'Verified Tiles'
                            : floorType === 'mosaic'
                              ? 'Mosaic'
                              : floorType === 'marble_granite'
                                ? 'Marble / Granite'
                                : floorType === 'wooden'
                                  ? 'Wooden'
                                  : floorType === 'cement'
                                    ? 'Cement'
                                    : 'Select'}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>

                  <XStack gap="$2" flexWrap="wrap" alignItems="flex-end">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Built Up Area*
                      </Text>
                      <Input
                        value={areaSqft}
                        onChangeText={(t) => setAreaSqft(sanitizeSingleDecimal(String(t ?? '')))}
                        placeholder="Enter area"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>
                    <YStack minWidth={140} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Unit
                      </Text>
                      <Pressable onPress={() => setPickerOpen('areaUnit')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            Sq ft
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Carpet Area (Optional)
                      </Text>
                      <Input
                        value={carpetAreaSqft}
                        onChangeText={(t) => setCarpetAreaSqft(sanitizeSingleDecimal(String(t ?? '')))}
                        placeholder="Enter carpet area"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>
                    {apartmentType === 'independent_house_villa' ? (
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Plot Area*
                        </Text>
                        <Input
                          value={plotAreaSqft}
                          onChangeText={(t) => setPlotAreaSqft(sanitizeSingleDecimal(String(t ?? '')))}
                          placeholder="Enter plot area"
                          keyboardType="numeric"
                          backgroundColor="#FFFFFF"
                          borderColor={border}
                          color={valueColor}
                        />
                      </YStack>
                    ) : null}
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        No. of Floor(s)*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('floor')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {floor || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                    {apartmentType === 'apartment' || apartmentType === 'standalone_building' ? (
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Total Floor(s)*
                        </Text>
                        <Pressable onPress={() => setPickerOpen('totalFloors')}>
                          <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                            <Text color={valueColor} fontWeight={valueWeight}>
                              {totalFloors || 'Select'}
                            </Text>
                          </YStack>
                        </Pressable>
                      </YStack>
                    ) : null}
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Property Age*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('propertyAge')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {propertyAge || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Facing*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('facing')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {facing || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>
                </>
              ) : null}

              {adType !== 'resale' && adType !== 'flatmates' && !isCommercialAny && !(propertyCategory === 'residential' && adType === 'rent') ? (
                <XStack gap="$2" flexWrap="wrap" alignItems="flex-end">
                  <YStack flexGrow={1} minWidth={220} gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Monthly Maintenance
                    </Text>
                    <Pressable onPress={() => setPickerOpen('maintenanceType')}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {monthlyMaintenanceType === 'included'
                            ? 'Maintenance Included'
                            : monthlyMaintenanceType === 'extra'
                              ? 'Maintenance Extra'
                              : 'Select'}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>
                  {monthlyMaintenanceType === 'extra' ? (
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Maintenance Amount*
                      </Text>
                      <Input
                        value={maintenanceAmount}
                        onChangeText={(t) => setMaintenanceAmount(sanitizeSingleDecimal(String(t ?? '')))}
                        placeholder="Enter amount"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>
                  ) : null}
                </XStack>
              ) : null}

              {adType !== 'resale' && adType !== 'flatmates' && !isCommercialAny && !(propertyCategory === 'residential' && adType === 'rent') ? (
                <YStack gap="$2">
                  <Text color={muted} fontSize={12} fontWeight="700">
                    Available From*
                  </Text>
                  <YStack borderWidth={1} borderColor={border} borderRadius={12} overflow="hidden" backgroundColor="#FFFFFF" position="relative">
                    <YStack padding={12}>
                      <Text color={valueColor} fontWeight={valueWeight}>
                        {availableFromDate ? formatDateDdMmYyyy(availableFromDate) : availableFromText || 'Select date'}
                      </Text>
                    </YStack>
                    <YStack position="absolute" top={0} left={0} right={0} bottom={0} opacity={Platform.OS === 'web' ? 0.02 : 0.01} pointerEvents="auto">
                      <AppDateTimePicker
                        value={availableFromDate ?? new Date()}
                        mode="date"
                        display="default"
                        onChange={(_e: any, d?: Date) => {
                          if (!d) return;
                          setAvailableFromDate(d);
                          setAvailableFromText(formatDateDdMmYyyy(d));
                        }}
                        style={{ height: 48, padding: '0 12px' }}
                      />
                    </YStack>
                  </YStack>
                </YStack>
              ) : null}

              {adType !== 'resale' && adType !== 'flatmates' && !isCommercialAny && !(propertyCategory === 'residential' && adType === 'rent') ? (
                <YStack gap="$2">
                  <Text color={muted} fontSize={12} fontWeight="700">
                    Preferred Tenants*
                  </Text>
                  <XStack gap="$2" flexWrap="wrap">
                    <Button
                      size="$2"
                      borderWidth={1}
                      borderColor={preferredAnyone ? '#059669' : border}
                      backgroundColor={preferredAnyone ? '#ECFDF5' : '#FFFFFF'}
                      color={titleColor}
                      fontWeight="800"
                      onPress={togglePreferredAnyone}>
                      Anyone {preferredAnyone ? '✓' : ''}
                    </Button>
                    <Button
                      size="$2"
                      borderWidth={1}
                      borderColor={preferredFamily ? '#059669' : border}
                      backgroundColor={preferredFamily ? '#ECFDF5' : '#FFFFFF'}
                      color={preferredAnyone ? '#9CA3AF' : titleColor}
                      fontWeight="800"
                      disabled={preferredAnyone}
                      onPress={() => togglePreferredOne(preferredFamily, setPreferredFamily, !preferredFamily)}>
                      Family {preferredFamily ? '✓' : ''}
                    </Button>
                    <Button
                      size="$2"
                      borderWidth={1}
                      borderColor={preferredBachelorFemale ? '#059669' : border}
                      backgroundColor={preferredBachelorFemale ? '#ECFDF5' : '#FFFFFF'}
                      color={preferredAnyone ? '#9CA3AF' : titleColor}
                      fontWeight="800"
                      disabled={preferredAnyone}
                      onPress={() => togglePreferredOne(preferredBachelorFemale, setPreferredBachelorFemale, !preferredBachelorFemale)}>
                      Bachelor Female {preferredBachelorFemale ? '✓' : ''}
                    </Button>
                    <Button
                      size="$2"
                      borderWidth={1}
                      borderColor={preferredBachelorMale ? '#059669' : border}
                      backgroundColor={preferredBachelorMale ? '#ECFDF5' : '#FFFFFF'}
                      color={preferredAnyone ? '#9CA3AF' : titleColor}
                      fontWeight="800"
                      disabled={preferredAnyone}
                      onPress={() => togglePreferredOne(preferredBachelorMale, setPreferredBachelorMale, !preferredBachelorMale)}>
                      Bachelor Male {preferredBachelorMale ? '✓' : ''}
                    </Button>
                    <Button
                      size="$2"
                      borderWidth={1}
                      borderColor={preferredCompany ? '#059669' : border}
                      backgroundColor={preferredCompany ? '#ECFDF5' : '#FFFFFF'}
                      color={preferredAnyone ? '#9CA3AF' : titleColor}
                      fontWeight="800"
                      disabled={preferredAnyone}
                      onPress={() => togglePreferredOne(preferredCompany, setPreferredCompany, !preferredCompany)}>
                      Company {preferredCompany ? '✓' : ''}
                    </Button>
                  </XStack>
                </YStack>
              ) : null}
            </YStack>
          ) : null}

          {step === 'location' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$3">
              <Text color={titleColor} fontWeight="900">
                Location
              </Text>

              <XStack gap="$2" flexWrap="wrap">
                <YStack flexGrow={1} minWidth={220} gap="$2">
                  <Text color={muted} fontSize={12} fontWeight="700">
                    State*
                  </Text>
                  <Pressable onPress={() => setPickerOpen('state')}>
                    <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                      <Text color={valueColor} fontWeight={valueWeight}>
                        {stateValue || 'Select'}
                      </Text>
                    </YStack>
                  </Pressable>
                </YStack>

                <YStack flexGrow={1} minWidth={220} gap="$2">
                  <Text color={muted} fontSize={12} fontWeight="700">
                    City*
                  </Text>
                  <Pressable onPress={() => setPickerOpen('city')}>
                    <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                      <Text color={valueColor} fontWeight={valueWeight}>
                        {cityValue || 'Select'}
                      </Text>
                    </YStack>
                  </Pressable>
                </YStack>
              </XStack>

              <YStack gap="$2">
                <Text color={muted} fontSize={12} fontWeight="700">
                  Locality*
                </Text>
                <Input
                  value={localityValue}
                  onChangeText={(t) => {
                    setLocalityValue(String(t ?? ''));
                    setLocalityTyped(true);
                  }}
                  placeholder="Enter locality"
                  backgroundColor="#FFFFFF"
                  borderColor={border}
                  color={valueColor}
                />
              </YStack>

              <YStack gap="$2">
                <Text color={muted} fontSize={12} fontWeight="700">
                  Landmark / Street*
                </Text>
                <Input
                  value={address1}
                  onChangeText={setAddress1}
                  placeholder="Landmark / street"
                  backgroundColor="#FFFFFF"
                  borderColor={border}
                  color={valueColor}
                />
              </YStack>

              <YStack gap="$2">
                <Text color={muted} fontSize={12} fontWeight="700">
                  Pincode*
                </Text>
                <Input
                  value={pincode}
                  onChangeText={(t) => setPincode(String(t ?? '').replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="6 digit pincode"
                  keyboardType="numeric"
                  backgroundColor="#FFFFFF"
                  borderColor={border}
                  color={valueColor}
                />
              </YStack>

              <XStack gap="$2" flexWrap="wrap" alignItems="center" justifyContent="space-between">
                <Button backgroundColor="#1F4E79" color="#FFFFFF" onPress={() => setMapPickerOpen(true)}>
                  Select on Map
                </Button>
                <Text color={muted} fontSize={12}>
                  {mapPickerCoord ? `Lat ${mapPickerCoord.lat.toFixed(6)}, Lng ${mapPickerCoord.lng.toFixed(6)}` : ''}
                </Text>
              </XStack>
            </YStack>
          ) : null}

          {step === 'pricing' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$3">
              <Text color={titleColor} fontWeight="900">
                {adType === 'resale'
                  ? 'Resale Details'
                  : isCommercialSale
                    ? 'Resale Details'
                    : adType === 'flatmates'
                      ? 'Rental Details'
                      : 'Pricing'}
              </Text>

              {adType === 'resale' ? (
                <>
                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={price}
                      onChangeText={(t) => setPrice(sanitizeSingleDecimal(String(t ?? '')))}
                      placeholder="Expected Price *"
                      keyboardType="numeric"
                      backgroundColor="#FFFFFF"
                      borderColor={border}
                      color={valueColor}
                      flexGrow={1}
                      minWidth={220}
                    />
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220}>
                      <Pressable onPress={() => setRentNegotiable((p) => !p)}>
                        <XStack alignItems="center" gap="$2" paddingVertical={8}>
                          <YStack
                            width={18}
                            height={18}
                            borderWidth={1}
                            borderColor={rentNegotiable ? '#059669' : border}
                            borderRadius={4}
                            backgroundColor={rentNegotiable ? '#059669' : '#FFFFFF'}
                            alignItems="center"
                            justifyContent="center">
                            <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                              {rentNegotiable ? '✓' : ''}
                            </Text>
                          </YStack>
                          <Text color={titleColor} fontWeight="800">
                            Price Negotiable
                          </Text>
                        </XStack>
                      </Pressable>
                    </YStack>

                    <YStack flexGrow={1} minWidth={220}>
                      <Pressable onPress={() => setCurrentlyUnderLoan((p) => !p)}>
                        <XStack alignItems="center" gap="$2" paddingVertical={8}>
                          <YStack
                            width={18}
                            height={18}
                            borderWidth={1}
                            borderColor={currentlyUnderLoan ? '#059669' : border}
                            borderRadius={4}
                            backgroundColor={currentlyUnderLoan ? '#059669' : '#FFFFFF'}
                            alignItems="center"
                            justifyContent="center">
                            <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                              {currentlyUnderLoan ? '✓' : ''}
                            </Text>
                          </YStack>
                          <Text color={titleColor} fontWeight="800">
                            Currently Under Loan
                          </Text>
                        </XStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Available From*
                    </Text>
                    <YStack borderWidth={1} borderColor={border} borderRadius={12} overflow="hidden" backgroundColor="#FFFFFF" position="relative">
                      <YStack padding={12}>
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {availableFromDate ? formatDateDdMmYyyy(availableFromDate) : availableFromText || 'Select date'}
                        </Text>
                      </YStack>
                      <YStack position="absolute" top={0} left={0} right={0} bottom={0} opacity={Platform.OS === 'web' ? 0.02 : 0.01} pointerEvents="auto">
                        <AppDateTimePicker
                          value={availableFromDate ?? new Date()}
                          mode="date"
                          display="default"
                          onChange={(_e: any, d?: Date) => {
                            if (!d) return;
                            const clamped = clampAvailableFromDate(d);
                            if (!clamped) return;
                            setAvailableFromDate(clamped);
                            setAvailableFromText(formatDateDdMmYyyy(clamped));
                          }}
                          minimumDate={(() => {
                            const t = new Date();
                            t.setHours(0, 0, 0, 0);
                            return t;
                          })()}
                          maximumDate={(() => {
                            const t = new Date();
                            t.setHours(0, 0, 0, 0);
                            const m = new Date(t);
                            m.setMonth(m.getMonth() + 2);
                            m.setHours(23, 59, 59, 999);
                            return m;
                          })()}
                          style={{ height: 48, padding: '0 12px' }}
                        />
                      </YStack>
                    </YStack>
                  </YStack>

                  {isLandPlot ? null : (
                    <>
                      <XStack gap="$2" flexWrap="wrap">
                        <YStack flexGrow={1} minWidth={220} gap="$2">
                          <Text color={muted} fontSize={12} fontWeight="700">
                            Kitchen Type*
                          </Text>
                          <Pressable onPress={() => setPickerOpen('kitchenType')}>
                            <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                              <Text color={valueColor} fontWeight={valueWeight}>
                                {kitchenType === 'modular'
                                  ? 'Modular'
                                  : kitchenType === 'cupboard_shelf'
                                    ? 'Cupboard / Shelf'
                                    : kitchenType === 'open_shelf'
                                      ? 'Open Shelf'
                                      : 'Select'}
                              </Text>
                            </YStack>
                          </Pressable>
                        </YStack>

                        <YStack flexGrow={1} minWidth={220} gap="$2">
                          <Text color={muted} fontSize={12} fontWeight="700">
                            Furnishing*
                          </Text>
                          <Pressable onPress={() => setPickerOpen('furnishing')}>
                            <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                              <Text color={valueColor} fontWeight={valueWeight}>
                                {furnishing === 'furnished' ? 'Fully Furnished' : furnishing === 'semi_furnished' ? 'Semi Furnished' : furnishing === 'unfurnished' ? 'Unfurnished' : 'Select'}
                              </Text>
                            </YStack>
                          </Pressable>
                        </YStack>
                      </XStack>

                      <YStack gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Parking*
                        </Text>
                        <Pressable onPress={() => setPickerOpen('parking')}>
                          <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                            <Text color={valueColor} fontWeight={valueWeight}>
                              {parking === 'bike' ? 'Bike' : parking === 'car' ? 'Car' : parking === 'both' ? 'Both' : parking === 'none' ? 'None' : 'Select'}
                            </Text>
                          </YStack>
                        </Pressable>
                      </YStack>
                    </>
                  )}

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Description*
                    </Text>
                    <TextInput
                      value={description}
                      onChangeText={setDescription}
                      placeholder="Describe your property"
                      placeholderTextColor="#9CA3AF"
                      multiline
                      style={{
                        borderWidth: 1,
                        borderColor: border,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        minHeight: 90,
                        backgroundColor: '#FFFFFF',
                        color: valueColor,
                        textAlignVertical: 'top',
                      }}
                    />
                  </YStack>
                </>
              ) : isCommercialSale ? (
                <>
                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Expected Price*
                      </Text>
                      <Input
                        value={price}
                        onChangeText={(t) => setPrice(sanitizeSingleDecimal(String(t ?? '')))}
                        placeholder="Enter amount"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>

                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Ownership Type*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('ownershipType')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {ownershipType === 'self_owned' ? 'Self Owned' : ownershipType === 'on_lease' ? 'On Lease' : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <Pressable onPress={() => setRentNegotiable((p) => !p)}>
                    <XStack alignItems="center" gap="$2" paddingVertical={8}>
                      <YStack
                        width={18}
                        height={18}
                        borderWidth={1}
                        borderColor={rentNegotiable ? '#059669' : border}
                        borderRadius={4}
                        backgroundColor={rentNegotiable ? '#059669' : '#FFFFFF'}
                        alignItems="center"
                        justifyContent="center">
                        <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                          {rentNegotiable ? '✓' : ''}
                        </Text>
                      </YStack>
                      <Text color={titleColor} fontWeight="800">
                        Price Negotiable
                      </Text>
                    </XStack>
                  </Pressable>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Available From*
                    </Text>
                    <YStack borderWidth={1} borderColor={border} borderRadius={12} overflow="hidden" backgroundColor="#FFFFFF" position="relative">
                      <YStack padding={12}>
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {availableFromDate ? formatDateDdMmYyyy(availableFromDate) : availableFromText || 'Select date'}
                        </Text>
                      </YStack>
                      <YStack position="absolute" top={0} left={0} right={0} bottom={0} opacity={Platform.OS === 'web' ? 0.02 : 0.01} pointerEvents="auto">
                        <AppDateTimePicker
                          value={availableFromDate ?? new Date()}
                          mode="date"
                          display="default"
                          onChange={(_e: any, d?: Date) => {
                            if (!d) return;
                            const clamped = clampAvailableFromDate(d);
                            if (!clamped) return;
                            setAvailableFromDate(clamped);
                            setAvailableFromText(formatDateDdMmYyyy(clamped));
                          }}
                          minimumDate={(() => {
                            const t = new Date();
                            t.setHours(0, 0, 0, 0);
                            return t;
                          })()}
                          maximumDate={(() => {
                            const t = new Date();
                            t.setHours(0, 0, 0, 0);
                            const m = new Date(t);
                            m.setMonth(m.getMonth() + 2);
                            m.setHours(23, 59, 59, 999);
                            return m;
                          })()}
                          style={{ height: 48, padding: '0 12px' }}
                        />
                      </YStack>
                    </YStack>
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Ideal For
                    </Text>
                    <XStack gap="$2" flexWrap="wrap">
                      {commercialIdealForTags.map((tag) => {
                        const selected = commercialIdealForTags.includes(tag);
                        return (
                          <Button
                            key={tag}
                            size="$2"
                            backgroundColor={selected ? '#059669' : '#F3F4F6'}
                            color={selected ? '#FFFFFF' : '#111827'}
                            fontWeight="800"
                            hoverStyle={{ backgroundColor: selected ? '#059669' : '#E5E7EB' }}
                            pressStyle={{ backgroundColor: selected ? '#059669' : '#E5E7EB' }}
                            onPress={() => toggleCommercialIdealTag(tag)}>
                            <XStack alignItems="center" gap="$2">
                              <Text color={selected ? '#FFFFFF' : '#111827'} fontWeight="800">
                                {tag}
                              </Text>
                              {!commercialIdealForBaseTags.includes(tag as any) && selected ? (
                                <Pressable
                                  onPress={() => {
                                    removeCommercialIdealTag(tag);
                                  }}>
                                  <MaterialCommunityIcons name="close" size={14} color={selected ? '#FFFFFF' : '#111827'} />
                                </Pressable>
                              ) : null}
                            </XStack>
                          </Button>
                        );
                      })}
                      {commercialIdealForBaseTags
                        .filter((t) => !commercialIdealForTags.includes(t))
                        .map((tag) => (
                          <Button
                            key={tag}
                            size="$2"
                            backgroundColor="#F3F4F6"
                            color="#111827"
                            fontWeight="800"
                            hoverStyle={{ backgroundColor: '#E5E7EB' }}
                            pressStyle={{ backgroundColor: '#E5E7EB' }}
                            onPress={() => toggleCommercialIdealTag(tag)}>
                            {tag}
                          </Button>
                        ))}
                    </XStack>

                    <XStack gap="$2" alignItems="center">
                      <Input
                        value={commercialIdealForInput}
                        onChangeText={setCommercialIdealForInput}
                        placeholder="Add other tags"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                        flexGrow={1}
                      />
                      <Pressable onPress={addCommercialIdealTag}>
                        <Text color="#059669" fontWeight="800">
                          create new tag
                        </Text>
                      </Pressable>
                    </XStack>
                  </YStack>
                </>
              ) : isCommercialRent ? (
                <>
                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={price}
                      onChangeText={(t) => setPrice(sanitizeSingleDecimal(String(t ?? '')))}
                      placeholder="Expected Rent *"
                      keyboardType="numeric"
                      backgroundColor="#FFFFFF"
                      borderColor={border}
                      color={valueColor}
                      flexGrow={1}
                      minWidth={220}
                    />
                    <Text color={muted} fontSize={12} fontWeight="800" alignSelf="center">
                      / Month
                    </Text>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Pressable onPress={() => setRentNegotiable((p) => !p)}>
                      <XStack alignItems="center" gap="$2" paddingVertical={8}>
                        <YStack
                          width={18}
                          height={18}
                          borderWidth={1}
                          borderColor={rentNegotiable ? '#059669' : border}
                          borderRadius={4}
                          backgroundColor={rentNegotiable ? '#059669' : '#FFFFFF'}
                          alignItems="center"
                          justifyContent="center">
                          <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                            {rentNegotiable ? '✓' : ''}
                          </Text>
                        </YStack>
                        <Text color={titleColor} fontWeight="800">
                          Rent Negotiable
                        </Text>
                      </XStack>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        if (monthlyMaintenanceType === 'extra') {
                          setMonthlyMaintenanceType('');
                          setMaintenanceAmount('');
                        } else {
                          setMonthlyMaintenanceType('extra');
                        }
                      }}>
                      <XStack alignItems="center" gap="$2" paddingVertical={8}>
                        <YStack
                          width={18}
                          height={18}
                          borderWidth={1}
                          borderColor={monthlyMaintenanceType === 'extra' ? '#059669' : border}
                          borderRadius={4}
                          backgroundColor={monthlyMaintenanceType === 'extra' ? '#059669' : '#FFFFFF'}
                          alignItems="center"
                          justifyContent="center">
                          <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                            {monthlyMaintenanceType === 'extra' ? '✓' : ''}
                          </Text>
                        </YStack>
                        <Text color={titleColor} fontWeight="800">
                          Maintenance Extra
                        </Text>
                      </XStack>
                    </Pressable>
                  </XStack>

                  {monthlyMaintenanceType === 'extra' ? (
                    <XStack gap="$2" flexWrap="wrap">
                      <Input
                        value={maintenanceAmount}
                        onChangeText={(t) => setMaintenanceAmount(sanitizeSingleDecimal(String(t ?? '')))}
                        placeholder="Monthly Maintenance *"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                        flexGrow={1}
                        minWidth={220}
                      />
                      <Text color={muted} fontSize={12} fontWeight="800" alignSelf="center">
                        / Month
                      </Text>
                    </XStack>
                  ) : null}

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={deposit}
                      onChangeText={(t) => setDeposit(sanitizeSingleDecimal(String(t ?? '')))}
                      placeholder="Deposit *"
                      keyboardType="numeric"
                      backgroundColor="#FFFFFF"
                      borderColor={border}
                      color={valueColor}
                      flexGrow={1}
                      minWidth={220}
                    />
                  </XStack>

                  <Pressable onPress={() => setDepositNegotiable((p) => !p)}>
                    <XStack alignItems="center" gap="$2" paddingVertical={8}>
                      <YStack
                        width={18}
                        height={18}
                        borderWidth={1}
                        borderColor={depositNegotiable ? '#059669' : border}
                        borderRadius={4}
                        backgroundColor={depositNegotiable ? '#059669' : '#FFFFFF'}
                        alignItems="center"
                        justifyContent="center">
                        <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                          {depositNegotiable ? '✓' : ''}
                        </Text>
                      </YStack>
                      <Text color={titleColor} fontWeight="800">
                        Deposit Negotiable
                      </Text>
                    </XStack>
                  </Pressable>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Lease Duration (Years)
                      </Text>
                      <Pressable onPress={() => setPickerOpen('commercialLeaseDurationYears')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {commercialLeaseDurationYears || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Lockin Period (Years)
                      </Text>
                      <Pressable onPress={() => setPickerOpen('commercialLockinPeriodYears')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {commercialLockinPeriodYears || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Available From*
                    </Text>
                    <YStack borderWidth={1} borderColor={border} borderRadius={12} overflow="hidden" backgroundColor="#FFFFFF" position="relative">
                      <YStack padding={12}>
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {availableFromDate ? formatDateDdMmYyyy(availableFromDate) : availableFromText || 'Select date'}
                        </Text>
                      </YStack>
                      <YStack position="absolute" top={0} left={0} right={0} bottom={0} opacity={Platform.OS === 'web' ? 0.02 : 0.01} pointerEvents="auto">
                        <AppDateTimePicker
                          value={availableFromDate ?? new Date()}
                          mode="date"
                          display="default"
                          onChange={(_e: any, d?: Date) => {
                            if (!d) return;
                            const clamped = clampAvailableFromDate(d);
                            if (!clamped) return;
                            setAvailableFromDate(clamped);
                            setAvailableFromText(formatDateDdMmYyyy(clamped));
                          }}
                          minimumDate={(() => {
                            const t = new Date();
                            t.setHours(0, 0, 0, 0);
                            return t;
                          })()}
                          maximumDate={(() => {
                            const t = new Date();
                            t.setHours(0, 0, 0, 0);
                            const m = new Date(t);
                            m.setMonth(m.getMonth() + 2);
                            m.setHours(23, 59, 59, 999);
                            return m;
                          })()}
                          style={{ height: 48, padding: '0 12px' }}
                        />
                      </YStack>
                    </YStack>
                  </YStack>

                  <YStack gap="$2">
                    <XStack alignItems="center" gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Ideal For
                      </Text>
                      <Pressable
                        onPress={() => {
                          Alert.alert('Ideal For', 'Choose what this property is suited for by creating tags.');
                        }}>
                        <Text color={muted} fontSize={12} fontWeight="900">
                          i
                        </Text>
                      </Pressable>
                    </XStack>

                    <XStack gap="$2" flexWrap="wrap">
                      {[...commercialIdealForBaseTags, ...commercialIdealForTags.filter((t) => !commercialIdealForBaseTags.includes(t as any))].map((tag) => {
                        const selected = commercialIdealForTags.includes(tag);
                        return (
                          <Button
                            key={tag}
                            size="$2"
                            backgroundColor={selected ? '#059669' : '#F3F4F6'}
                            color={selected ? '#FFFFFF' : '#111827'}
                            fontWeight="800"
                            hoverStyle={{ backgroundColor: selected ? '#059669' : '#E5E7EB' }}
                            pressStyle={{ backgroundColor: selected ? '#059669' : '#E5E7EB' }}
                            onPress={() => toggleCommercialIdealTag(tag)}>
                            <XStack alignItems="center" gap="$2">
                              <Text color={selected ? '#FFFFFF' : '#111827'} fontWeight="800">
                                {tag}
                              </Text>
                              {!commercialIdealForBaseTags.includes(tag as any) && selected ? (
                                <Pressable
                                  onPress={() => {
                                    removeCommercialIdealTag(tag);
                                  }}>
                                  <MaterialCommunityIcons name="close" size={14} color={selected ? '#FFFFFF' : '#111827'} />
                                </Pressable>
                              ) : null}
                            </XStack>
                          </Button>
                        );
                      })}
                    </XStack>

                    <XStack gap="$2" alignItems="center">
                      <Input
                        value={commercialIdealForInput}
                        onChangeText={setCommercialIdealForInput}
                        placeholder="Add other tags"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                        flexGrow={1}
                      />
                      <Pressable onPress={addCommercialIdealTag}>
                        <Text color="#059669" fontWeight="800">
                          create new tag
                        </Text>
                      </Pressable>
                    </XStack>
                  </YStack>
                </>
              ) : (
                <>
                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Property available for
                    </Text>
                    <XStack borderWidth={1} borderColor={border} borderRadius={14} overflow="hidden" backgroundColor="#F3F4F6">
                      <Button
                        flex={1}
                        borderRadius={0}
                        backgroundColor={propertyAvailableFor === 'only_rent' ? '#059669' : 'transparent'}
                        color={propertyAvailableFor === 'only_rent' ? '#FFFFFF' : '#111827'}
                        fontWeight="800"
                        hoverStyle={{ backgroundColor: propertyAvailableFor === 'only_rent' ? '#059669' : 'transparent' }}
                        pressStyle={{ backgroundColor: propertyAvailableFor === 'only_rent' ? '#059669' : 'transparent' }}
                        onPress={() => {
                          setPropertyAvailableFor('only_rent');
                        }}>
                        Only rent
                      </Button>
                      <Button
                        flex={1}
                        borderRadius={0}
                        backgroundColor={propertyAvailableFor === 'only_lease' ? '#059669' : 'transparent'}
                        color={propertyAvailableFor === 'only_lease' ? '#FFFFFF' : '#111827'}
                        fontWeight="800"
                        hoverStyle={{ backgroundColor: propertyAvailableFor === 'only_lease' ? '#059669' : 'transparent' }}
                        pressStyle={{ backgroundColor: propertyAvailableFor === 'only_lease' ? '#059669' : 'transparent' }}
                        onPress={() => {
                          setPropertyAvailableFor('only_lease');
                          setDeposit('');
                        }}>
                        Only lease
                      </Button>
                    </XStack>
                  </YStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={price}
                      onChangeText={(t) => setPrice(sanitizeSingleDecimal(String(t ?? '')))}
                      placeholder={propertyAvailableFor === 'only_lease' ? 'Expected Lease Amount *' : 'Expected Rent *'}
                      keyboardType="numeric"
                      backgroundColor="#FFFFFF"
                      borderColor={border}
                      color={valueColor}
                      flexGrow={1}
                      minWidth={200}
                    />
                    {propertyAvailableFor === 'only_rent' ? (
                      <Input
                        value={deposit}
                        onChangeText={(t) => setDeposit(sanitizeSingleDecimal(String(t ?? '')))}
                        placeholder="Expected Deposit *"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                        flexGrow={1}
                        minWidth={200}
                      />
                    ) : null}
                  </XStack>

                  <Pressable onPress={() => setRentNegotiable((p) => !p)}>
                    <XStack alignItems="center" gap="$2" paddingVertical={8}>
                      <YStack
                        width={18}
                        height={18}
                        borderWidth={1}
                        borderColor={rentNegotiable ? '#059669' : border}
                        borderRadius={4}
                        backgroundColor={rentNegotiable ? '#059669' : '#FFFFFF'}
                        alignItems="center"
                        justifyContent="center">
                        <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                          {rentNegotiable ? '✓' : ''}
                        </Text>
                      </YStack>
                      <Text color={titleColor} fontWeight="800">
                        Rent Negotiable
                      </Text>
                    </XStack>
                  </Pressable>

                  {!isCommercialRent ? (
                    <>
                      <XStack gap="$2" flexWrap="wrap" alignItems="flex-end">
                        <YStack flexGrow={1} minWidth={220} gap="$2">
                          <Text color={muted} fontSize={12} fontWeight="700">
                            Monthly Maintenance
                          </Text>
                          <Pressable onPress={() => setPickerOpen('maintenanceType')}>
                            <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                              <Text color={valueColor} fontWeight={valueWeight}>
                                {monthlyMaintenanceType === 'included'
                                  ? 'Maintenance Included'
                                  : monthlyMaintenanceType === 'extra'
                                    ? 'Maintenance Extra'
                                    : 'Select'}
                              </Text>
                            </YStack>
                          </Pressable>
                        </YStack>
                        {monthlyMaintenanceType === 'extra' ? (
                          <YStack flexGrow={1} minWidth={220} gap="$2">
                            <Text color={muted} fontSize={12} fontWeight="700">
                              Maintenance Amount*
                            </Text>
                            <Input
                              value={maintenanceAmount}
                              onChangeText={(t) => setMaintenanceAmount(sanitizeSingleDecimal(String(t ?? '')))}
                              placeholder="Enter amount"
                              keyboardType="numeric"
                              backgroundColor="#FFFFFF"
                              borderColor={border}
                              color={valueColor}
                            />
                          </YStack>
                        ) : null}
                      </XStack>

                      <YStack gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Available From*
                        </Text>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} overflow="hidden" backgroundColor="#FFFFFF" position="relative">
                          <YStack padding={12}>
                            <Text color={valueColor} fontWeight={valueWeight}>
                              {availableFromDate ? formatDateDdMmYyyy(availableFromDate) : availableFromText || 'Select date'}
                            </Text>
                          </YStack>
                          <YStack position="absolute" top={0} left={0} right={0} bottom={0} opacity={Platform.OS === 'web' ? 0.02 : 0.01} pointerEvents="auto">
                            <AppDateTimePicker
                              value={availableFromDate ?? new Date()}
                              mode="date"
                              display="default"
                              onChange={(_e: any, d?: Date) => {
                                if (!d) return;
                                const clamped = clampAvailableFromDate(d);
                                if (!clamped) return;
                                setAvailableFromDate(clamped);
                                setAvailableFromText(formatDateDdMmYyyy(clamped));
                              }}
                              minimumDate={(() => {
                                const t = new Date();
                                t.setHours(0, 0, 0, 0);
                                return t;
                              })()}
                              maximumDate={(() => {
                                const t = new Date();
                                t.setHours(0, 0, 0, 0);
                                const m = new Date(t);
                                m.setMonth(m.getMonth() + 2);
                                m.setHours(23, 59, 59, 999);
                                return m;
                              })()}
                              style={{ height: 48, padding: '0 12px' }}
                            />
                          </YStack>
                        </YStack>
                      </YStack>

                      {propertyCategory === 'residential' && adType === 'rent' ? (
                        <XStack gap="$2" flexWrap="wrap">
                          <Button
                            size="$2"
                            backgroundColor="#F3F4F6"
                            color="#111827"
                            fontWeight="800"
                            onPress={() => {
                              const t = new Date();
                              t.setHours(0, 0, 0, 0);
                              setAvailableFromDate(t);
                              setAvailableFromText(formatDateDdMmYyyy(t));
                            }}>
                            Today
                          </Button>
                          <Button
                            size="$2"
                            backgroundColor="#F3F4F6"
                            color="#111827"
                            fontWeight="800"
                            onPress={() => {
                              const t = new Date();
                              t.setHours(0, 0, 0, 0);
                              t.setDate(t.getDate() + 1);
                              setAvailableFromDate(t);
                              setAvailableFromText(formatDateDdMmYyyy(t));
                            }}>
                            Tomorrow
                          </Button>
                        </XStack>
                      ) : null}

                      {propertyCategory === 'residential' && adType === 'rent' ? (
                        <>
                          <YStack gap="$2">
                            <Text color={muted} fontSize={12} fontWeight="700">
                              Preferred Tenants*
                            </Text>
                            <XStack gap="$2" flexWrap="wrap">
                              <Button
                                size="$2"
                                borderWidth={1}
                                borderColor={preferredAnyone ? '#059669' : border}
                                backgroundColor={preferredAnyone ? '#ECFDF5' : '#FFFFFF'}
                                color={titleColor}
                                fontWeight="800"
                                onPress={togglePreferredAnyone}>
                                Anyone {preferredAnyone ? '✓' : ''}
                              </Button>
                              <Button
                                size="$2"
                                borderWidth={1}
                                borderColor={preferredFamily ? '#059669' : border}
                                backgroundColor={preferredFamily ? '#ECFDF5' : '#FFFFFF'}
                                color={preferredAnyone ? '#9CA3AF' : titleColor}
                                fontWeight="800"
                                disabled={preferredAnyone}
                                onPress={() => togglePreferredOne(preferredFamily, setPreferredFamily, !preferredFamily)}>
                                Family {preferredFamily ? '✓' : ''}
                              </Button>
                              <Button
                                size="$2"
                                borderWidth={1}
                                borderColor={preferredBachelorFemale ? '#059669' : border}
                                backgroundColor={preferredBachelorFemale ? '#ECFDF5' : '#FFFFFF'}
                                color={preferredAnyone ? '#9CA3AF' : titleColor}
                                fontWeight="800"
                                disabled={preferredAnyone}
                                onPress={() => togglePreferredOne(preferredBachelorFemale, setPreferredBachelorFemale, !preferredBachelorFemale)}>
                                Bachelor Female {preferredBachelorFemale ? '✓' : ''}
                              </Button>
                              <Button
                                size="$2"
                                borderWidth={1}
                                borderColor={preferredBachelorMale ? '#059669' : border}
                                backgroundColor={preferredBachelorMale ? '#ECFDF5' : '#FFFFFF'}
                                color={preferredAnyone ? '#9CA3AF' : titleColor}
                                fontWeight="800"
                                disabled={preferredAnyone}
                                onPress={() => togglePreferredOne(preferredBachelorMale, setPreferredBachelorMale, !preferredBachelorMale)}>
                                Bachelor Male {preferredBachelorMale ? '✓' : ''}
                              </Button>
                              <Button
                                size="$2"
                                borderWidth={1}
                                borderColor={preferredCompany ? '#059669' : border}
                                backgroundColor={preferredCompany ? '#ECFDF5' : '#FFFFFF'}
                                color={preferredAnyone ? '#9CA3AF' : titleColor}
                                fontWeight="800"
                                disabled={preferredAnyone}
                                onPress={() => togglePreferredOne(preferredCompany, setPreferredCompany, !preferredCompany)}>
                                Company {preferredCompany ? '✓' : ''}
                              </Button>
                            </XStack>
                          </YStack>

                          <XStack gap="$2" flexWrap="wrap">
                            <YStack flexGrow={1} minWidth={220} gap="$2">
                              <Text color={muted} fontSize={12} fontWeight="700">
                                Furnishing*
                              </Text>
                              <Pressable onPress={() => setPickerOpen('furnishing')}>
                                <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                                  <Text color={valueColor} fontWeight={valueWeight}>
                                    {furnishing === 'furnished'
                                      ? 'Fully Furnished'
                                      : furnishing === 'semi_furnished'
                                        ? 'Semi Furnished'
                                        : furnishing === 'unfurnished'
                                          ? 'Unfurnished'
                                          : 'Select'}
                                  </Text>
                                </YStack>
                              </Pressable>
                            </YStack>
                            <YStack flexGrow={1} minWidth={220} gap="$2">
                              <Text color={muted} fontSize={12} fontWeight="700">
                                Parking*
                              </Text>
                              <Pressable onPress={() => setPickerOpen('parking')}>
                                <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                                  <Text color={valueColor} fontWeight={valueWeight}>
                                    {parking === 'bike'
                                      ? 'Bike'
                                      : parking === 'car'
                                        ? 'Car'
                                        : parking === 'both'
                                          ? 'Both'
                                          : parking === 'none'
                                            ? 'None'
                                            : 'Select'}
                                  </Text>
                                </YStack>
                              </Pressable>
                            </YStack>
                          </XStack>

                          <YStack gap="$2">
                            <Text color={muted} fontSize={12} fontWeight="700">
                              Description*
                            </Text>
                            <TextInput
                              value={description}
                              onChangeText={setDescription}
                              placeholder="Write a few lines about your property"
                              placeholderTextColor="#9CA3AF"
                              multiline
                              style={{
                                borderWidth: 1,
                                borderColor: border,
                                borderRadius: 12,
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                              }}
                            />
                          </YStack>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </YStack>
          ) : null}

          {step === 'amenities' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$3">
              <Text color={titleColor} fontWeight="900">
                Amenities
              </Text>

              {isLandPlot ? (
                <>
                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Water Supply*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('landWaterSupply')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {landWaterSupply === 'corporation'
                              ? 'Corporation'
                              : landWaterSupply === 'borewell'
                                ? 'Borewell'
                                : landWaterSupply === 'both'
                                  ? 'Both'
                                  : landWaterSupply === 'none'
                                    ? 'None'
                                    : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Electricity Connection*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('landElectricityConnection')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {landElectricityConnection === 'electricity'
                              ? 'Electricity'
                              : landElectricityConnection === 'solar'
                                ? 'Solar'
                                : landElectricityConnection === 'none'
                                  ? 'None'
                                  : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Sewage Connection*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('landSewageConnection')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {landSewageConnection === 'open'
                              ? 'Open'
                              : landSewageConnection === 'underground'
                                ? 'Underground'
                                : landSewageConnection === 'none'
                                  ? 'None'
                                  : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Width of Facing Road (ft.)*
                      </Text>
                      <Input
                        value={landFacingRoadWidthFt}
                        onChangeText={(t) => setLandFacingRoadWidthFt(sanitizeSingleDecimal(String(t ?? '')))}
                        placeholder="Enter road width"
                        keyboardType="numeric"
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Do you have more similar units/properties available ?*
                      </Text>
                      {renderYesNo(moreSimilarUnitsAvailable, setMoreSimilarUnitsAvailable)}
                    </YStack>
                    <YStack flexGrow={1} minWidth={220} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Gated Security*
                      </Text>
                      {renderYesNo(gatedSecurity, setGatedSecurity)}
                    </YStack>
                  </XStack>

                  <Pressable onPress={() => {
                    setLandAddDirectionTip((p) => {
                      const nextV = !p;
                      if (!nextV) setDirectionTip('');
                      return nextV;
                    });
                  }}>
                    <XStack alignItems="center" gap="$2" paddingVertical={8}>
                      <YStack width={18} height={18} borderWidth={1} borderColor={landAddDirectionTip ? '#059669' : border} borderRadius={4} backgroundColor={landAddDirectionTip ? '#059669' : '#FFFFFF'} alignItems="center" justifyContent="center">
                        <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                          {landAddDirectionTip ? '✓' : ''}
                        </Text>
                      </YStack>
                      <Text color={titleColor} fontWeight="800">
                        Add Directions Tip
                      </Text>
                    </XStack>
                  </Pressable>

                  {landAddDirectionTip ? (
                    <YStack gap="$2">
                      <TextInput
                        value={directionTip}
                        onChangeText={setDirectionTip}
                        placeholder="Eg. Take the road opposite to ..., take right after 300m..."
                        placeholderTextColor="#9CA3AF"
                        multiline
                        style={{
                          borderWidth: 1,
                          borderColor: border,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          minHeight: 80,
                          backgroundColor: '#FFFFFF',
                          color: valueColor,
                          textAlignVertical: 'top',
                        }}
                      />
                    </YStack>
                  ) : null}

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Select the available amenities
                    </Text>

                    {(() => {
                      const items = [
                        { label: 'Clubhouse', icon: 'home-group', value: amenityClubHouse, setValue: setAmenityClubHouse },
                        { label: 'Park', icon: 'tree', value: amenityPark, setValue: setAmenityPark },
                        { label: 'Swimming Pool', icon: 'pool', value: amenitySwimmingPool, setValue: setAmenitySwimmingPool },
                        { label: "Children's Play Area", icon: 'human-male-child', value: amenityChildrenPlayArea, setValue: setAmenityChildrenPlayArea },
                      ] as const;

                      const columns = [items.slice(0, 2), items.slice(2, 4)].filter((c) => c.length);

                      const renderItem = (it: any) => {
                        const checked = it.value === 1;
                        return (
                          <Pressable key={it.label} onPress={() => it.setValue(checked ? 0 : 1)}>
                            <XStack alignItems="center" gap="$2" paddingVertical={8}>
                              <YStack width={18} height={18} borderWidth={1} borderColor={checked ? '#059669' : border} borderRadius={4} backgroundColor={checked ? '#059669' : '#FFFFFF'} alignItems="center" justifyContent="center">
                                <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                                  {checked ? '✓' : ''}
                                </Text>
                              </YStack>
                              <MaterialCommunityIcons name={it.icon} size={18} color={checked ? '#059669' : titleColor} />
                              <Text color={titleColor} fontWeight="800">
                                {it.label}
                              </Text>
                            </XStack>
                          </Pressable>
                        );
                      };

                      return (
                        <XStack gap="$4" flexWrap="wrap">
                          {columns.map((col, idx) => (
                            <YStack key={String(idx)} minWidth={220} flexGrow={1}>
                              {col.map(renderItem)}
                            </YStack>
                          ))}
                        </XStack>
                      );
                    })()}
                  </YStack>
                </>
              ) : isCommercialAny ? (
                <>
                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Power Backup*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('commercialPowerBackupType')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {commercialPowerBackupType === 'full'
                              ? 'Full'
                              : commercialPowerBackupType === 'dg_backup'
                                ? 'DG Backup'
                                : commercialPowerBackupType === 'need_to_arrange'
                                  ? 'Need to arrange'
                                  : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Lift*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('commercialLiftType')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {commercialLiftType === 'none' ? 'None' : commercialLiftType === 'personal' ? 'Personal' : commercialLiftType === 'common' ? 'Common' : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Parking*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('commercialParkingType')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {commercialParkingType === 'none'
                              ? 'None'
                              : commercialParkingType === 'public_and_reserved'
                                ? 'Public And Reserved'
                                : commercialParkingType === 'public'
                                  ? 'Public'
                                  : commercialParkingType === 'reserved'
                                    ? 'Reserved'
                                    : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>

                      {commercialParkingType === 'public_and_reserved' || commercialParkingType === 'reserved' ? (
                        <Input
                          marginTop={10}
                          value={commercialParkingSlots}
                          onChangeText={(t) => setCommercialParkingSlots(String(t ?? '').replace(/[^0-9]/g, '').slice(0, 3))}
                          placeholder="No of Available Slots"
                          keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                          backgroundColor="#FFFFFF"
                          borderColor={border}
                          color={valueColor}
                        />
                      ) : null}
                    </YStack>

                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Washroom(s)*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('commercialWashroomType')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {commercialWashroomType === 'shared'
                              ? 'Shared'
                              : commercialWashroomType === 'no_washroom'
                                ? 'No Washroom'
                                : commercialWashroomType === 'private'
                                  ? 'Private'
                                  : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Water Storage Facility
                      </Text>
                      {renderYesNo(commercialWaterStorageFacility, setCommercialWaterStorageFacility)}
                    </YStack>
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Security
                      </Text>
                      {renderYesNo(commercialSecurity, setCommercialSecurity)}
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Current Property Condition?
                      </Text>
                      <Pressable onPress={() => setPickerOpen('propertyCondition')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {currentPropertyCondition || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        What business is currently running?
                      </Text>
                      <Pressable onPress={() => setPickerOpen('commercialBusinessRunning')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {commercialBusinessRunning || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Do you have more similar units/properties available ?
                    </Text>
                    {renderYesNo(moreSimilarUnitsAvailable, setMoreSimilarUnitsAvailable)}
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Add Directions Tip for your tenants
                    </Text>
                    <TextInput
                      value={directionTip}
                      onChangeText={setDirectionTip}
                      placeholder="Eg. Take the road opposite to ..., take right after 300m..."
                      placeholderTextColor="#9CA3AF"
                      multiline
                      style={{
                        borderWidth: 1,
                        borderColor: border,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        minHeight: 80,
                        backgroundColor: '#FFFFFF',
                        color: valueColor,
                        textAlignVertical: 'top',
                      }}
                    />
                  </YStack>
                </>
              ) : adType === 'pg_hostel' ? (
                <>
                  <YStack gap="$2">
                    <Text color={titleColor} fontWeight="900">
                      Provide additional details about your place
                    </Text>
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Available Services
                    </Text>

                    <XStack gap="$2" flexWrap="wrap">
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Laundry
                        </Text>
                        {renderYesNo(pgLaundryAvailable, setPgLaundryAvailable)}
                      </YStack>
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Room Cleaning
                        </Text>
                        {renderYesNo(pgRoomCleaningAvailable, setPgRoomCleaningAvailable)}
                      </YStack>
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Warden Facility
                        </Text>
                        {renderYesNo(pgWardenFacilityAvailable, setPgWardenFacilityAvailable)}
                      </YStack>
                    </XStack>
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Add Directions Tip for your tenants
                    </Text>
                    <TextInput
                      value={directionTip}
                      onChangeText={setDirectionTip}
                      placeholder="Eg. Take the road opposite to ..., take right after 300m..."
                      placeholderTextColor="#9CA3AF"
                      multiline
                      style={{
                        borderWidth: 1,
                        borderColor: border,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        minHeight: 80,
                        backgroundColor: '#FFFFFF',
                        color: valueColor,
                        textAlignVertical: 'top',
                      }}
                    />
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Available Amenities
                    </Text>

                    {(() => {
                      const items = [
                        { label: 'Common TV', icon: 'television-classic', value: pgAmenityCommonTv, setValue: setPgAmenityCommonTv },
                        { label: 'Lift', icon: 'elevator', value: pgAmenityLift, setValue: setPgAmenityLift },
                        { label: 'Wifi', icon: 'wifi', value: pgAmenityWifi, setValue: setPgAmenityWifi },
                        { label: 'Power Backup', icon: 'power', value: pgAmenityPowerBackup, setValue: setPgAmenityPowerBackup },
                        { label: 'Mess', icon: 'silverware-fork-knife', value: pgAmenityMess, setValue: setPgAmenityMess },
                        { label: 'Refrigerator', icon: 'fridge-outline', value: pgAmenityRefrigerator, setValue: setPgAmenityRefrigerator },
                        { label: 'Cooking Allowed', icon: 'chef-hat', value: pgAmenityCookingAllowed, setValue: setPgAmenityCookingAllowed },
                      ] as const;

                      const columns = [items.slice(0, 4), items.slice(4, 7)].filter((c) => c.length);

                      const renderItem = (it: any) => {
                        const checked = !!it.value;
                        return (
                          <Pressable key={it.label} onPress={() => it.setValue(!checked)}>
                            <XStack alignItems="center" gap="$2" paddingVertical={8}>
                              <YStack width={18} height={18} borderWidth={1} borderColor={checked ? '#059669' : border} borderRadius={4} backgroundColor={checked ? '#059669' : '#FFFFFF'} alignItems="center" justifyContent="center">
                                <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                                  {checked ? '✓' : ''}
                                </Text>
                              </YStack>
                              <MaterialCommunityIcons name={it.icon} size={18} color={checked ? '#059669' : titleColor} />
                              <Text color={titleColor} fontWeight="800">
                                {it.label}
                              </Text>
                            </XStack>
                          </Pressable>
                        );
                      };

                      return (
                        <XStack gap="$4" flexWrap="wrap">
                          {columns.map((col, idx) => (
                            <YStack key={String(idx)} minWidth={220} flexGrow={1}>
                              {col.map(renderItem)}
                            </YStack>
                          ))}
                        </XStack>
                      );
                    })()}
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Parking
                    </Text>
                    <Pressable onPress={() => setPickerOpen('parking')}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {parking === 'bike' ? 'Bike' : parking === 'car' ? 'Car' : parking === 'both' ? 'Both' : parking === 'none' ? 'None' : 'Select'}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>
                </>
              ) : adType === 'flatmates' ? (
                <>
                  <YStack gap="$2">
                    <Text color={titleColor} fontWeight="900">
                      Room Details
                    </Text>
                  </YStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <XStack alignItems="center" gap="$2">
                        <MaterialCommunityIcons name="bathtub" size={18} color={titleColor} />
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Attached Bathroom*
                        </Text>
                      </XStack>
                      {renderYesNo(flatmatesAttachedBathroom, (v) => {
                        setFlatmatesAttachedBathroom(v);
                        if (v === 1) setFlatmatesBathroomType('');
                      })}

                      {flatmatesAttachedBathroom === 0 ? (
                        <XStack gap="$2" flexWrap="wrap">
                          <Button
                            flexGrow={1}
                            minWidth={140}
                            backgroundColor={flatmatesBathroomType === 'private' ? '#E0F2FE' : '#FFFFFF'}
                            borderWidth={1}
                            borderColor={flatmatesBathroomType === 'private' ? '#0891B2' : border}
                            onPress={() => setFlatmatesBathroomType('private')}
                          >
                            <Text color={titleColor} fontWeight="900">
                              Private Bathroom
                            </Text>
                          </Button>
                          <Button
                            flexGrow={1}
                            minWidth={140}
                            backgroundColor={flatmatesBathroomType === 'shared' ? '#E0F2FE' : '#FFFFFF'}
                            borderWidth={1}
                            borderColor={flatmatesBathroomType === 'shared' ? '#0891B2' : border}
                            onPress={() => setFlatmatesBathroomType('shared')}
                          >
                            <Text color={titleColor} fontWeight="900">
                              Shared Bathroom
                            </Text>
                          </Button>
                        </XStack>
                      ) : null}
                    </YStack>

                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <XStack alignItems="center" gap="$2">
                        <MaterialCommunityIcons name="air-conditioner" size={18} color={titleColor} />
                        <Text color={muted} fontSize={12} fontWeight="700">
                          AC Room*
                        </Text>
                      </XStack>
                      {renderYesNo(flatmatesAcRoom, setFlatmatesAcRoom)}
                    </YStack>

                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <XStack alignItems="center" gap="$2">
                        <MaterialCommunityIcons name="balcony" size={18} color={titleColor} />
                        <Text color={muted} fontSize={12} fontWeight="700">
                          Balcony*
                        </Text>
                      </XStack>
                      {renderYesNo(flatmatesBalcony, setFlatmatesBalcony)}
                    </YStack>
                  </XStack>

                  <YStack borderTopWidth={1} borderColor={border} paddingTop={12} marginTop={4} gap="$2">
                    <Text color={titleColor} fontWeight="900">
                      Flatmate Preference
                    </Text>

                    <XStack gap="$2" flexWrap="wrap">
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <XStack alignItems="center" gap="$2">
                          <MaterialCommunityIcons name="food" size={18} color={titleColor} />
                          <Text color={muted} fontSize={12} fontWeight="700">
                            Non-Veg Allowed*
                          </Text>
                        </XStack>
                        {renderYesNo(nonVegAllowed, setNonVegAllowed)}
                      </YStack>
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <XStack alignItems="center" gap="$2">
                          <MaterialCommunityIcons name="smoking-off" size={18} color={titleColor} />
                          <Text color={muted} fontSize={12} fontWeight="700">
                            Smoking Allowed
                          </Text>
                        </XStack>
                        {renderYesNo(flatmatesSmokingAllowed, setFlatmatesSmokingAllowed)}
                      </YStack>
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <XStack alignItems="center" gap="$2">
                          <MaterialCommunityIcons name="bottle-wine-outline" size={18} color={titleColor} />
                          <Text color={muted} fontSize={12} fontWeight="700">
                            Drinking Allowed
                          </Text>
                        </XStack>
                        {renderYesNo(flatmatesDrinkingAllowed, setFlatmatesDrinkingAllowed)}
                      </YStack>
                    </XStack>
                  </YStack>

                  <YStack borderTopWidth={1} borderColor={border} paddingTop={12} marginTop={4} gap="$2">
                    <Text color={titleColor} fontWeight="900">
                      Additional Details for maximum visibility
                    </Text>

                    <XStack gap="$2" flexWrap="wrap">
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <XStack alignItems="center" gap="$2">
                          <MaterialCommunityIcons name="dumbbell" size={18} color={titleColor} />
                          <Text color={muted} fontSize={12} fontWeight="700">
                            Gym*
                          </Text>
                        </XStack>
                        {renderYesNo(gym, setGym)}
                      </YStack>
                      <YStack flexGrow={1} minWidth={200} gap="$2">
                        <XStack alignItems="center" gap="$2">
                          <MaterialCommunityIcons name="shield-home" size={18} color={titleColor} />
                          <Text color={muted} fontSize={12} fontWeight="700">
                            Gated Security*
                          </Text>
                        </XStack>
                        {renderYesNo(gatedSecurity, setGatedSecurity)}
                      </YStack>
                    </XStack>
                  </YStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Who will show the property?*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('whoWillShow')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {whoWillShowProperty || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>

                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Secondary Number
                      </Text>
                      <Input
                        value={secondaryPhone}
                        onChangeText={(t) => setSecondaryPhone(String(t ?? '').replace(/[^0-9]/g, '').slice(0, 10))}
                        placeholder="10 digit number"
                        keyboardType={Platform.OS === 'web' ? 'default' : 'phone-pad'}
                        backgroundColor="#FFFFFF"
                        borderColor={border}
                        color={valueColor}
                      />
                    </YStack>

                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Water Supply
                      </Text>
                      <Pressable onPress={() => setPickerOpen('waterSupply')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {waterSupply === 'corporation' ? 'Corporation' : waterSupply === 'borewell' ? 'Borewell' : waterSupply === 'both' ? 'Both' : 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Add Directions Tip for your tenants
                    </Text>
                    <TextInput
                      value={directionTip}
                      onChangeText={setDirectionTip}
                      placeholder="Eg. Take the road opposite to ..., take right after 300m..."
                      placeholderTextColor="#9CA3AF"
                      multiline
                      style={{
                        borderWidth: 1,
                        borderColor: border,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        minHeight: 80,
                        backgroundColor: '#FFFFFF',
                        color: valueColor,
                        textAlignVertical: 'top',
                      }}
                    />
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Select the available amenities
                    </Text>
                    {(() => {
                      const items = [
                        { label: 'Lift', icon: 'elevator', value: amenityLift, setValue: setAmenityLift },
                        { label: 'Club House', icon: 'home-city', value: amenityClubHouse, setValue: setAmenityClubHouse },
                        { label: 'Park', icon: 'tree', value: amenityPark, setValue: setAmenityPark },
                        { label: 'House Keeping', icon: 'broom', value: amenityHouseKeeping, setValue: setAmenityHouseKeeping },
                        { label: 'Gas Pipeline', icon: 'gas-cylinder', value: amenityGasPipeline, setValue: setAmenityGasPipeline },
                        { label: 'Visitor Parking', icon: 'parking', value: amenityVisitorParking, setValue: setAmenityVisitorParking },
                        { label: 'Swimming Pool', icon: 'pool', value: amenitySwimmingPool, setValue: setAmenitySwimmingPool },
                        { label: 'Power Backup', icon: 'power', value: amenityPowerBackup, setValue: setAmenityPowerBackup },
                        { label: 'Shopping Center', icon: 'shopping', value: amenityShoppingCenter, setValue: setAmenityShoppingCenter },
                        { label: 'Intercom', icon: 'phone-in-talk', value: amenityIntercom, setValue: setAmenityIntercom },
                        { label: 'Sewage Treatment Plant', icon: 'water-pump', value: amenitySewageTreatmentPlant, setValue: setAmenitySewageTreatmentPlant },
                        { label: 'Fire Safety', icon: 'fire-extinguisher', value: amenityFireSafety, setValue: setAmenityFireSafety },
                      ] as const;

                      const columns = [items.slice(0, 6), items.slice(6, 12)].filter((c) => c.length);

                      const renderItem = (it: any) => {
                        const checked = it.value === 1;
                        return (
                          <Pressable key={it.label} onPress={() => it.setValue(checked ? null : 1)}>
                            <XStack alignItems="center" gap="$2" paddingVertical={8}>
                              <YStack width={18} height={18} borderWidth={1} borderColor={checked ? '#059669' : border} borderRadius={4} backgroundColor={checked ? '#059669' : '#FFFFFF'} alignItems="center" justifyContent="center">
                                <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                                  {checked ? '✓' : ''}
                                </Text>
                              </YStack>
                              <MaterialCommunityIcons name={it.icon} size={18} color={checked ? '#059669' : titleColor} />
                              <Text color={titleColor} fontWeight="800">
                                {it.label}
                              </Text>
                            </XStack>
                          </Pressable>
                        );
                      };

                      return (
                        <XStack gap="$4" flexWrap="wrap">
                          {columns.map((col, idx) => (
                            <YStack key={String(idx)} minWidth={220} flexGrow={1}>
                              {col.map(renderItem)}
                            </YStack>
                          ))}
                        </XStack>
                      );
                    })()}
                  </YStack>
                </>
              ) : (
                <>
                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={160} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Bathroom(s)
                      </Text>
                      {renderCounter(Number(bathrooms.trim() ? Number(bathrooms) : 0), (n) => setBathrooms(String(n)))}
                    </YStack>
                    <YStack flexGrow={1} minWidth={160} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Balcony
                      </Text>
                      {renderCounter(balconies, setBalconies)}
                    </YStack>
                  </XStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Water Supply
                    </Text>
                    <Pressable onPress={() => setPickerOpen('waterSupply')}>
                      <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                        <Text color={valueColor} fontWeight={valueWeight}>
                          {waterSupply === 'corporation' ? 'Corporation' : waterSupply === 'borewell' ? 'Borewell' : waterSupply === 'both' ? 'Both' : 'Select'}
                        </Text>
                      </YStack>
                    </Pressable>
                  </YStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={160} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Pet Allowed
                      </Text>
                      {renderYesNo(petAllowed, setPetAllowed)}
                    </YStack>
                    <YStack flexGrow={1} minWidth={160} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Gym
                      </Text>
                      {renderYesNo(gym, setGym)}
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={160} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Non-Veg Allowed
                      </Text>
                      {renderYesNo(nonVegAllowed, setNonVegAllowed)}
                    </YStack>
                    <YStack flexGrow={1} minWidth={160} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Gated Security
                      </Text>
                      {renderYesNo(gatedSecurity, setGatedSecurity)}
                    </YStack>
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Who will show the property?*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('whoWillShow')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {whoWillShowProperty || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                    <YStack flexGrow={1} minWidth={200} gap="$2">
                      <Text color={muted} fontSize={12} fontWeight="700">
                        Current Property Condition?*
                      </Text>
                      <Pressable onPress={() => setPickerOpen('propertyCondition')}>
                        <YStack borderWidth={1} borderColor={border} borderRadius={12} padding={12} backgroundColor="#FFFFFF">
                          <Text color={valueColor} fontWeight={valueWeight}>
                            {currentPropertyCondition || 'Select'}
                          </Text>
                        </YStack>
                      </Pressable>
                    </YStack>
                  </XStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Secondary Phone (Optional)
                    </Text>
                    <Input
                      value={secondaryPhone}
                      onChangeText={(t) => setSecondaryPhone(String(t ?? '').replace(/[^0-9]/g, '').slice(0, 10))}
                      placeholder="10 digit number"
                      keyboardType={Platform.OS === 'web' ? 'default' : 'phone-pad'}
                      backgroundColor="#FFFFFF"
                      borderColor={border}
                      color={valueColor}
                    />
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      More similar units available?
                    </Text>
                    {renderYesNo(moreSimilarUnitsAvailable, setMoreSimilarUnitsAvailable)}
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      Direction tip
                    </Text>
                    <TextInput
                      value={directionTip}
                      onChangeText={setDirectionTip}
                      placeholder="Any directions to reach the property"
                      placeholderTextColor="#9CA3AF"
                      multiline
                      style={{
                        borderWidth: 1,
                        borderColor: border,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        minHeight: 80,
                        backgroundColor: '#FFFFFF',
                        color: valueColor,
                        textAlignVertical: 'top',
                      }}
                    />
                  </YStack>

                  <YStack gap="$2">
                    <Text color={muted} fontSize={12} fontWeight="700">
                      {isResidentialRent ? 'Select the available amenities' : 'Available amenities'}
                    </Text>
                    {(() => {
                      const items = isResidentialRent
                        ? ([
                            { label: 'Lift', icon: 'elevator', value: amenityLift, setValue: setAmenityLift },
                            { label: 'Internet Services', icon: 'wifi', value: amenityInternetServices, setValue: setAmenityInternetServices },
                            { label: 'Air Conditioner', icon: 'air-conditioner', value: amenityAirConditioner, setValue: setAmenityAirConditioner },
                            { label: 'Club House', icon: 'home-city', value: amenityClubHouse, setValue: setAmenityClubHouse },
                            { label: 'Intercom', icon: 'phone-in-talk', value: amenityIntercom, setValue: setAmenityIntercom },
                            { label: 'Swimming Pool', icon: 'pool', value: amenitySwimmingPool, setValue: setAmenitySwimmingPool },
                            { label: 'Children Play Area', icon: 'human-male-child', value: amenityChildrenPlayArea, setValue: setAmenityChildrenPlayArea },
                            { label: 'Fire Safety', icon: 'fire-extinguisher', value: amenityFireSafety, setValue: setAmenityFireSafety },
                            { label: 'Servant Room', icon: 'room-service-outline', value: amenityServantRoom, setValue: setAmenityServantRoom },
                            { label: 'Shopping Center', icon: 'shopping', value: amenityShoppingCenter, setValue: setAmenityShoppingCenter },
                            { label: 'Gas Pipeline', icon: 'gas-cylinder', value: amenityGasPipeline, setValue: setAmenityGasPipeline },
                            { label: 'Park', icon: 'tree', value: amenityPark, setValue: setAmenityPark },
                            { label: 'Rain Water Harvesting', icon: 'weather-pouring', value: amenityRainWaterHarvesting, setValue: setAmenityRainWaterHarvesting },
                            { label: 'Sewage Treatment Plant', icon: 'water-pump', value: amenitySewageTreatmentPlant, setValue: setAmenitySewageTreatmentPlant },
                            { label: 'House Keeping', icon: 'broom', value: amenityHouseKeeping, setValue: setAmenityHouseKeeping },
                            { label: 'Power Backup', icon: 'power', value: amenityPowerBackup, setValue: setAmenityPowerBackup },
                            { label: 'Visitor Parking', icon: 'car', value: amenityVisitorParking, setValue: setAmenityVisitorParking },
                          ] as const)
                        : ([
                            { label: 'Visitor Parking', icon: 'car', value: amenityVisitorParking, setValue: setAmenityVisitorParking },
                            { label: 'Club House', icon: 'home-city', value: amenityClubHouse, setValue: setAmenityClubHouse },
                            { label: 'Swimming Pool', icon: 'pool', value: amenitySwimmingPool, setValue: setAmenitySwimmingPool },
                            { label: 'Lift', icon: 'elevator', value: amenityLift, setValue: setAmenityLift },
                            { label: 'Fire Safety', icon: 'fire-extinguisher', value: amenityFireSafety, setValue: setAmenityFireSafety },
                            { label: 'Intercom', icon: 'phone-in-talk', value: amenityIntercom, setValue: setAmenityIntercom },
                            { label: 'Children Play Area', icon: 'human-male-child', value: amenityChildrenPlayArea, setValue: setAmenityChildrenPlayArea },
                            { label: 'Shopping Center', icon: 'shopping', value: amenityShoppingCenter, setValue: setAmenityShoppingCenter },
                            { label: 'Park', icon: 'tree', value: amenityPark, setValue: setAmenityPark },
                            { label: 'Sewage Treatment Plant', icon: 'water-pump', value: amenitySewageTreatmentPlant, setValue: setAmenitySewageTreatmentPlant },
                            { label: 'Gas Pipeline', icon: 'gas-cylinder', value: amenityGasPipeline, setValue: setAmenityGasPipeline },
                            { label: 'Internet Provider', icon: 'wifi', value: amenityInternetServices, setValue: setAmenityInternetServices },
                          ] as const);

                      const columns = isResidentialRent
                        ? [items.slice(0, 6), items.slice(6, 12), items.slice(12, 17)].filter((c) => c.length)
                        : [items.slice(0, 6), items.slice(6, 12)].filter((c) => c.length);

                      const renderItem = (it: any) => {
                        const checked = it.value === 1;
                        return (
                          <Pressable key={it.label} onPress={() => it.setValue(checked ? null : 1)}>
                            <XStack alignItems="center" gap="$2" paddingVertical={8}>
                              <YStack width={18} height={18} borderWidth={1} borderColor={checked ? '#059669' : border} borderRadius={4} backgroundColor={checked ? '#059669' : '#FFFFFF'} alignItems="center" justifyContent="center">
                                <Text color="#FFFFFF" fontWeight="900" fontSize={12}>
                                  {checked ? '✓' : ''}
                                </Text>
                              </YStack>
                              <MaterialCommunityIcons name={it.icon} size={18} color={checked ? '#059669' : titleColor} />
                              <Text color={titleColor} fontWeight="800">
                                {it.label}
                              </Text>
                            </XStack>
                          </Pressable>
                        );
                      };

                      return (
                        <XStack gap="$4" flexWrap="wrap">
                          {columns.map((col, idx) => (
                            <YStack key={String(idx)} minWidth={220} flexGrow={1}>
                              {col.map(renderItem)}
                            </YStack>
                          ))}
                        </XStack>
                      );
                    })()}
                  </YStack>
                </>
              )}
            </YStack>
          ) : null}

          {step === 'uploads' ? (
            <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
              <Text color={titleColor} fontWeight="900">
                Uploads
              </Text>
              <Paragraph color={muted}>
                JPG/JPEG only (we compress images to ~1MB). Videos: MP4 only (max 2 minutes, up to 30MB; will be compressed after upload).
              </Paragraph>

              <XStack gap="$2" flexWrap="wrap">
                <Button backgroundColor="#1F4E79" color="#FFFFFF" onPress={() => void pickPhotos()}>
                  Add Photos ({photos.length}/10)
                </Button>
                <Button backgroundColor="#111827" color="#FFFFFF" onPress={() => void pickVideo()}>
                  Add Video ({videos.length}/2)
                </Button>
              </XStack>

              {photos.length || videos.length ? (
                <YStack gap="$2">
                  <PropertyMediaGrid
                    items={[
                      ...photos.map(
                        (uri, i): PropertyMediaItem => ({
                          id: `photo-${i}-${uri}`,
                          uri,
                          kind: 'photo',
                        })
                      ),
                      ...videos.map(
                        (uri, i): PropertyMediaItem => ({
                          id: `video-${i}-${uri}`,
                          uri,
                          kind: 'video',
                        })
                      ),
                    ]}
                    size={96}
                  />
                  <XStack gap="$2" flexWrap="wrap">
                    {photos.map((u) => (
                      <Button
                        key={`rm-photo-${u}`}
                        size="$2"
                        backgroundColor="#EF4444"
                        color="#FFFFFF"
                        onPress={() => setPhotos((p) => p.filter((x) => x !== u))}>
                        Remove photo
                      </Button>
                    ))}
                    {videos.map((u) => (
                      <Button
                        key={`rm-video-${u}`}
                        size="$2"
                        backgroundColor="#EF4444"
                        color="#FFFFFF"
                        onPress={() => setVideos((p) => p.filter((x) => x !== u))}>
                        Remove video
                      </Button>
                    ))}
                  </XStack>
                </YStack>
              ) : null}
            </YStack>
          ) : null}

          {step === 'review' ? (
            <YStack gap="$3">
              {(() => {
                const isCommercialRent = propertyCategory === 'commercial' && adType === 'rent';
                return null;
              })()}
              <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900">
                  Review
                </Text>
                <Text color={muted} fontSize={12}>
                  Please verify all details before posting.
                </Text>
              </YStack>

              <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900">Basic</Text>
                {reviewRow('Property Category', reviewValue(propertyCategory))}
                {reviewRow('Ad Type', reviewValue(adType))}
              </YStack>

              {adType === 'pg_hostel' ? (
                <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                  <Text color={titleColor} fontWeight="900">PG Room Details</Text>
                  {pgRoomSingle ? reviewRow('Single Room', `Rent: ${reviewValue(pgSingleRent)}, Deposit: ${reviewValue(pgSingleDeposit)}`) : null}
                  {pgRoomDouble ? reviewRow('Double Room (per person)', `Rent: ${reviewValue(pgDoubleRent)}, Deposit: ${reviewValue(pgDoubleDeposit)}`) : null}
                  {pgRoomThree ? reviewRow('Three Room (per person)', `Rent: ${reviewValue(pgThreeRent)}, Deposit: ${reviewValue(pgThreeDeposit)}`) : null}
                  {pgRoomFour ? reviewRow('Four Room (per person)', `Rent: ${reviewValue(pgFourRent)}, Deposit: ${reviewValue(pgFourDeposit)}`) : null}
                </YStack>
              ) : null}

              {adType === 'pg_hostel' ? (
                <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                  <Text color={titleColor} fontWeight="900">PG Details</Text>
                  {reviewRow('Place available for', reviewValue(pgPlaceAvailableFor))}
                  {reviewRow('Preferred Guests', pgPreferredGuestText(pgPreferredGuests))}
                  {reviewRow('Available From', pgAvailableFromDate ? formatDateDdMmYyyy(pgAvailableFromDate) : reviewValue(pgAvailableFromText))}
                  {reviewRow('Food Included', reviewValue(pgFoodIncluded))}
                  {pgFoodIncluded === 'yes'
                    ? reviewRow(
                        'Meals',
                        [pgMealBreakfast ? 'Breakfast' : '', pgMealLunch ? 'Lunch' : '', pgMealDinner ? 'Dinner' : ''].filter(Boolean).join(', ') || '—'
                      )
                    : null}
                  {reviewRow('Gate Closing Time', pgGateClosingTime ? formatTimeHhMm(pgGateClosingTime) : '—')}
                  {pgDescription ? reviewRow('Description', reviewValue(pgDescription)) : null}
                </YStack>
              ) : null}

              <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900">Property Details</Text>
                {propertyCategory === 'commercial' && (adType === 'rent' || adType === 'sale') ? (
                  <>
                    {reviewRow('Property Type', reviewValue(propertyType))}
                    {reviewRow('Building Type', reviewValue(commercialBuildingType))}
                    {reviewRow('Property Age', reviewValue(propertyAge))}
                    {reviewRow('Floor', reviewValue(floor))}
                    {reviewRow('Total Floor(s)', reviewValue(totalFloors))}
                    {reviewRow('Super Built-up Area', `${reviewValue(areaSqft)} (Sq ft)`) }
                    {adType === 'sale' && carpetAreaSqft ? reviewRow('Carpet Area', `${reviewValue(carpetAreaSqft)} (Sq ft)`) : null}
                    {reviewRow(
                      'Furnishing',
                      furnishing === 'furnished'
                        ? 'Fully Furnished'
                        : furnishing === 'semi_furnished'
                          ? 'Heavy Furnished'
                          : furnishing === 'unfurnished'
                            ? 'Unfurnished'
                            : '—'
                    )}
                    {reviewRow('On Main Road', commercialOnMainRoad ? 'Yes' : 'No')}
                    {reviewRow('Corner Property', commercialCornerProperty ? 'Yes' : 'No')}
                  </>
                ) : isLandPlot ? (
                  <>
                    {plotAreaSqft ? reviewRow('Plot Area', `${reviewValue(plotAreaSqft)} (Sq ft)`) : null}
                    {plotLengthFt ? reviewRow('Length (ft.)', reviewValue(plotLengthFt)) : null}
                    {plotWidthFt ? reviewRow('Width (ft.)', reviewValue(plotWidthFt)) : null}
                    {boundaryWall !== null ? reviewRow('Boundary Wall', boundaryWall === 1 ? 'Yes' : 'No') : null}
                    {floorsAllowed ? reviewRow('Floors Allowed', reviewValue(floorsAllowed)) : null}
                    {cornerPlot !== null ? reviewRow('Corner Plot', cornerPlot === 1 ? 'Yes' : 'No') : null}
                    {insideGatedProject !== null ? reviewRow('Inside Gated Project', insideGatedProject === 1 ? 'Yes' : 'No') : null}
                    {insideGatedProject === 1 ? reviewRow('Project Name', reviewValue(gatedProjectName)) : null}
                    {reviewRow('Facing', reviewValue(facing))}
                  </>
                ) : (
                  <>
                    {reviewRow('Apartment Type', reviewValue(apartmentType))}
                    {apartmentType === 'apartment' || apartmentType === 'gated_community_villa'
                      ? reviewRow('Apartment Name', reviewValue(apartmentName))
                      : null}
                    {reviewRow('BHK Type', reviewValue(bhkType))}
                    {adType === 'flatmates' ? reviewRow('Room Type', flatmatesRoomType === 'single_room' ? 'Single Room' : flatmatesRoomType === 'shared_room' ? 'Shared Room' : '—') : null}
                    {adType === 'flatmates' ? reviewRow('Tenant Type', flatmatesTenantType ? (flatmatesTenantType === 'male' ? 'Male' : 'Female') : '—') : null}
                    {!isLandPlot && ownershipType ? reviewRow('Ownership Type', ownershipType === 'on_lease' ? 'On Lease' : 'Self Owned') : null}
                    {!isLandPlot && ownershipType === 'on_lease' && leaseYears ? reviewRow('Lease Years', `${reviewValue(leaseYears)} Years`) : null}
                    {carpetAreaSqft ? reviewRow('Carpet Area', `${reviewValue(carpetAreaSqft)} (Sq ft)`) : null}
                    {plotAreaSqft ? reviewRow('Plot Area', `${reviewValue(plotAreaSqft)} (Sq ft)`) : null}
                  </>
                )}
                {propertyCategory === 'commercial' && (adType === 'rent' || adType === 'sale') ? null : isLandPlot ? null : (
                  <>
                    {floorType ?
                      reviewRow(
                        'Floor Type',
                        floorType === 'verified_tiles'
                          ? 'Verified Tiles'
                          : floorType === 'mosaic'
                            ? 'Mosaic'
                            : floorType === 'marble_granite'
                              ? 'Marble / Granite'
                              : floorType === 'wooden'
                                ? 'Wooden'
                                : 'Cement'
                      )
                    : null}
                    {reviewRow('No. of Floor(s)', reviewValue(floor))}
                    {(adType === 'resale'
                      ? apartmentType === 'apartment' || apartmentType === 'standalone_building'
                      : adType === 'flatmates' ? true : apartmentType !== 'independent_house_villa')
                      ? reviewRow('Total Floor(s)', reviewValue(totalFloors))
                      : null}
                    {reviewRow('Property Age', reviewValue(propertyAge))}
                    {reviewRow('Facing', reviewValue(facing))}
                    {reviewRow('Built Up Area', `${reviewValue(areaSqft)} (Sq ft)`) }
                  </>
                )}
              </YStack>

              <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900">Location</Text>
                {reviewRow('State', reviewValue(stateValue))}
                {reviewRow('City', reviewValue(cityValue))}
                {reviewRow('Locality', reviewValue(localityValue))}
                {reviewRow('Landmark / Street', reviewValue(address1))}
                {reviewRow('Pincode', reviewValue(pincode))}
                {reviewRow('Map', mapPickerCoord ? `Lat ${mapPickerCoord.lat.toFixed(6)}, Lng ${mapPickerCoord.lng.toFixed(6)}` : '—')}
              </YStack>

              {adType === 'resale' ? (
                <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                  <Text color={titleColor} fontWeight="900">Resale Details</Text>
                  {reviewRow('Expected Price', reviewValue(price))}
                  {reviewRow('Price Negotiable', reviewValue(rentNegotiable ? 'Yes' : 'No'))}
                  {reviewRow('Currently Under Loan', reviewValue(currentlyUnderLoan ? 'Yes' : 'No'))}
                  {reviewRow('Available From', availableFromDate ? formatDateDdMmYyyy(availableFromDate) : reviewValue(availableFromText))}
                  {isLandPlot
                    ? null
                    : reviewRow(
                        'Kitchen Type',
                        kitchenType === 'modular' ? 'Modular' : kitchenType === 'cupboard_shelf' ? 'Cupboard Shelves' : kitchenType === 'open_shelf' ? 'Open Shelves' : '—'
                      )}
                  {isLandPlot ? null : reviewRow('Furnishing', reviewValue(furnishing))}
                  {isLandPlot ? null : reviewRow('Parking', reviewValue(parking))}
                  {reviewRow('Description', reviewValue(description))}
                </YStack>
              ) : isCommercialSale ? (
                <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                  <Text color={titleColor} fontWeight="900">Commercial Sale Resale Details</Text>
                  {reviewRow('Expected Price', reviewValue(price))}
                  {reviewRow('Ownership Type', ownershipType === 'self_owned' ? 'Self Owned' : ownershipType === 'on_lease' ? 'On Lease' : '—')}
                  {reviewRow('Price Negotiable', reviewValue(rentNegotiable ? 'Yes' : 'No'))}
                  {reviewRow('Available From', availableFromDate ? formatDateDdMmYyyy(availableFromDate) : reviewValue(availableFromText))}
                  {reviewRow('Ideal For', commercialIdealForTags.length ? commercialIdealForTags.join(', ') : '—')}
                </YStack>
              ) : isCommercialRent ? (
                <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                  <Text color={titleColor} fontWeight="900">Commercial Rent Pricing</Text>
                  {reviewRow('Expected Rent', reviewValue(price))}
                  {reviewRow('Rent Negotiable', reviewValue(rentNegotiable ? 'Yes' : 'No'))}
                  {reviewRow('Maintenance Extra', reviewValue(monthlyMaintenanceType === 'extra' ? 'Yes' : 'No'))}
                  {monthlyMaintenanceType === 'extra' ? reviewRow('Monthly Maintenance', reviewValue(maintenanceAmount)) : null}
                  {reviewRow('Deposit', reviewValue(deposit))}
                  {reviewRow('Deposit Negotiable', reviewValue(depositNegotiable ? 'Yes' : 'No'))}
                  {reviewRow('Lease Duration (Years)', reviewValue(commercialLeaseDurationYears))}
                  {reviewRow('Lockin Period (Years)', reviewValue(commercialLockinPeriodYears))}
                  {reviewRow('Available From', availableFromDate ? formatDateDdMmYyyy(availableFromDate) : reviewValue(availableFromText))}
                  {reviewRow('Ideal For', commercialIdealForTags.length ? commercialIdealForTags.join(', ') : '—')}
                </YStack>
              ) : (
                <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                  <Text color={titleColor} fontWeight="900">Rental Details</Text>
                  {reviewRow('Available for', reviewValue(propertyAvailableFor === 'only_rent' ? 'Only rent' : 'Only lease'))}
                  {reviewRow('Expected Amount', reviewValue(price))}
                  {propertyAvailableFor === 'only_rent' ? reviewRow('Expected Deposit', reviewValue(deposit)) : null}
                  {reviewRow('Rent Negotiable', reviewValue(rentNegotiable ? 'Yes' : 'No'))}
                  {reviewRow('Monthly Maintenance', reviewValue(monthlyMaintenanceType === 'included' ? 'Included' : monthlyMaintenanceType === 'extra' ? 'Extra' : ''))}
                  {monthlyMaintenanceType === 'extra' ? reviewRow('Maintenance Amount', reviewValue(maintenanceAmount)) : null}
                  {reviewRow('Available From', availableFromDate ? formatDateDdMmYyyy(availableFromDate) : reviewValue(availableFromText))}
                  {reviewRow('Preferred Tenants', preferredAnyone ? 'Anyone' : [preferredFamily ? 'Family' : '', preferredBachelorFemale ? 'Bachelor Female' : '', preferredBachelorMale ? 'Bachelor Male' : '', preferredCompany ? 'Company' : ''].filter(Boolean).join(', ') || '—')}
                  {reviewRow('Furnishing', reviewValue(furnishing))}
                  {reviewRow('Parking', reviewValue(parking))}
                  {reviewRow('Description', reviewValue(description))}
                </YStack>
              )}

              <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900">Schedule</Text>
                {reviewRow('Availability', scheduleAvailability === 'everyday' ? 'Everyday (Mon-Sun)' : scheduleAvailability === 'weekday' ? 'Weekday (Mon-Fri)' : 'Weekend (Sat-Sun)')}
                {reviewRow('Available All Day', scheduleAllDay ? 'Yes' : 'No')}
                {!scheduleAllDay ? reviewRow('Start time', scheduleStart ? formatTimeHhMm(scheduleStart) : '—') : null}
                {!scheduleAllDay ? reviewRow('End time', scheduleEnd ? formatTimeHhMm(scheduleEnd) : '—') : null}
              </YStack>

              <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900">Amenities</Text>

                {adType === 'pg_hostel' ? (
                  <>
                    {reviewRow('Laundry', reviewYesNo(pgLaundryAvailable))}
                    {reviewRow('Room Cleaning', reviewYesNo(pgRoomCleaningAvailable))}
                    {reviewRow('Warden Facility', reviewYesNo(pgWardenFacilityAvailable))}
                    {reviewRow('Direction tip', reviewValue(directionTip))}
                    {reviewRow(
                      'Available Amenities',
                      [
                        pgAmenityCommonTv ? 'Common TV' : '',
                        pgAmenityLift ? 'Lift' : '',
                        pgAmenityWifi ? 'Wifi' : '',
                        pgAmenityPowerBackup ? 'Power Backup' : '',
                        pgAmenityMess ? 'Mess' : '',
                        pgAmenityRefrigerator ? 'Refrigerator' : '',
                        pgAmenityCookingAllowed ? 'Cooking Allowed' : '',
                      ]
                        .filter(Boolean)
                        .join(', ') || '—'
                    )}
                    {reviewRow('Parking', reviewValue(parking))}
                  </>
                ) : adType === 'flatmates' ? (
                  <>
                    {reviewRow('Attached Bathroom', reviewYesNo(flatmatesAttachedBathroom))}
                    {flatmatesAttachedBathroom === 0 ? reviewRow('Bathroom Type', flatmatesBathroomType ? (flatmatesBathroomType === 'private' ? 'Private Bathroom' : 'Shared Bathroom') : '—') : null}
                    {reviewRow('AC Room', reviewYesNo(flatmatesAcRoom))}
                    {reviewRow('Balcony', reviewYesNo(flatmatesBalcony))}
                    {reviewRow('Non-Veg Allowed', reviewYesNo(nonVegAllowed))}
                    {reviewRow('Smoking Allowed', reviewYesNo(flatmatesSmokingAllowed))}
                    {reviewRow('Drinking Allowed', reviewYesNo(flatmatesDrinkingAllowed))}
                    {reviewRow('Gym', reviewYesNo(gym))}
                    {reviewRow('Gated Security', reviewYesNo(gatedSecurity))}
                    {reviewRow('Who will show', reviewValue(whoWillShowProperty))}
                    {reviewRow('Secondary Phone', secondaryPhoneToSave ? reviewValue(secondaryPhoneToSave) : '—')}
                    {reviewRow('Water Supply', reviewValue(waterSupply))}
                    {reviewRow('Direction tip', reviewValue(directionTip))}
                    {reviewRow('Selected Amenities', selectedAmenityLabels.length ? selectedAmenityLabels.join(', ') : '—')}
                  </>
                ) : (
                  <>
                    {isCommercialAny ? (
                      <>
                        {reviewRow(
                          'Power Backup',
                          commercialPowerBackupType
                            ? commercialPowerBackupType === 'full'
                              ? 'Full'
                              : commercialPowerBackupType === 'dg_backup'
                                ? 'DG Backup'
                                : 'Need to arrange'
                            : '—'
                        )}
                        {reviewRow(
                          'Lift',
                          commercialLiftType
                            ? commercialLiftType === 'none'
                              ? 'None'
                              : commercialLiftType === 'personal'
                                ? 'Personal'
                                : 'Common'
                            : '—'
                        )}
                        {reviewRow(
                          'Parking',
                          commercialParkingType
                            ? commercialParkingType === 'none'
                              ? 'None'
                              : commercialParkingType === 'public_and_reserved'
                                ? 'Public And Reserved'
                                : commercialParkingType === 'public'
                                  ? 'Public'
                                  : 'Reserved'
                            : '—'
                        )}
                        {(commercialParkingType === 'public_and_reserved' || commercialParkingType === 'reserved') && commercialParkingSlots.trim()
                          ? reviewRow('Parking Slots', reviewValue(commercialParkingSlots))
                          : null}
                        {reviewRow(
                          'Washroom(s)',
                          commercialWashroomType
                            ? commercialWashroomType === 'shared'
                              ? 'Shared'
                              : commercialWashroomType === 'no_washroom'
                                ? 'No Washroom'
                                : 'Private'
                            : '—'
                        )}
                        {reviewRow('Water Storage Facility', reviewYesNo(commercialWaterStorageFacility))}
                        {reviewRow('Security', reviewYesNo(commercialSecurity))}
                        {reviewRow('Current Property Condition', reviewValue(currentPropertyCondition))}
                        {reviewRow('Current Business Running', reviewValue(commercialBusinessRunning))}
                        {reviewRow('More Similar Units Available', reviewYesNo(moreSimilarUnitsAvailable))}
                        {reviewRow('Direction tip', reviewValue(directionTip))}
                        <YStack height={8} />
                        <Text color={titleColor} fontWeight="900">
                          Additional Information
                        </Text>
                        {reviewRow('Property Description', reviewValue(description))}
                        {reviewRow(
                          'Previous Occupancy',
                          commercialPreviousOccupancy === 'first_time_rental'
                            ? 'First time rental'
                            : commercialPreviousOccupancy === 'currently_rented'
                              ? 'Currently rented-rented'
                              : commercialPreviousOccupancy === 'previously_rented'
                                ? 'Previously rented'
                                : '—'
                        )}
                        {reviewRow('Who will show', reviewValue(whoWillShowProperty))}
                        {reviewRow('Want Painted', reviewYesNo(commercialWantPainted))}
                        {reviewRow('Want Cleaned', reviewYesNo(commercialWantCleaned))}
                        {reviewRow('Secondary Phone', secondaryPhoneToSave ? reviewValue(secondaryPhoneToSave) : '—')}
                      </>
                    ) : (
                      <>
                        {isLandPlot ? (
                          <>
                            {reviewRow('Water Supply', reviewValue(landWaterSupply))}
                            {reviewRow('Electricity Connection', reviewValue(landElectricityConnection))}
                            {reviewRow('Sewage Connection', reviewValue(landSewageConnection))}
                            {reviewRow('Width of Facing Road (ft.)', reviewValue(landFacingRoadWidthFt))}
                            {reviewRow('More Similar Units Available', reviewYesNo(moreSimilarUnitsAvailable))}
                            {reviewRow('Gated Security', reviewYesNo(gatedSecurity))}
                            {reviewRow('Direction tip', reviewValue(directionTip))}
                            {reviewRow('Selected Amenities', selectedAmenityLabels.length ? selectedAmenityLabels.join(', ') : '—')}
                          </>
                        ) : (
                          <>
                            {reviewRow('Bathrooms', reviewValue(bathrooms))}
                            {reviewRow('Balconies', reviewValue(balconies))}
                            {reviewRow('Water Supply', reviewValue(waterSupply))}
                            {reviewRow('Pet Allowed', reviewYesNo(petAllowed))}
                            {reviewRow('Gym', reviewYesNo(gym))}
                            {!isResidentialRent
                              ? reviewRow(
                                  'Power Backup',
                                  powerBackupType
                                    ? powerBackupType === 'full'
                                      ? 'Full'
                                      : powerBackupType === 'partial'
                                        ? 'Partial'
                                        : 'None'
                                    : '—'
                                )
                              : null}
                            {reviewRow('Non-Veg Allowed', reviewYesNo(nonVegAllowed))}
                            {reviewRow('Gated Security', reviewYesNo(gatedSecurity))}
                            {reviewRow('Who will show the property?', reviewValue(whoWillShowProperty))}
                            {reviewRow('Current Property Condition?', reviewValue(currentPropertyCondition))}
                            {reviewRow(
                              'Secondary Phone (Optional)',
                              secondaryPhoneToSave ? reviewValue(secondaryPhoneToSave) : '—'
                            )}
                            {reviewRow('More similar units available?', reviewYesNo(moreSimilarUnitsAvailable))}
                            {reviewRow('Direction tip', reviewValue(directionTip))}
                            {reviewRow('Selected Amenities', selectedAmenityLabels.length ? selectedAmenityLabels.join(', ') : '—')}
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </YStack>

              {adType === 'resale' ? (
                <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                  <Text color={titleColor} fontWeight="900">Additional Information</Text>
                  {isLandPlot ? (
                    <>
                      {reviewRow(
                        'Khata Certificate',
                        landKhataCertificate
                          ? landKhataCertificate === 'yes_a_khata'
                            ? 'Yes, A-Khata'
                            : landKhataCertificate === 'yes_b_khata'
                              ? 'Yes, B-Khata'
                              : landKhataCertificate === 'no'
                                ? 'No'
                                : "Don't know"
                          : '—'
                      )}
                      {reviewRow('Sale Deed Certificate', landSaleDeedCertificate ? yesNoDontKnowText(landSaleDeedCertificate as any) : '—')}
                      {reviewRow('Encumbrance certificate', landEncumbranceCertificate ? yesNoDontKnowText(landEncumbranceCertificate as any) : '—')}
                      {reviewRow('Conversion certificate', landConversionCertificate ? (landConversionCertificate === 'not_needed' ? 'Not needed' : yesNoDontKnowText(landConversionCertificate as any)) : '—')}
                      {reviewRow('RERA Approved', landReraApproved ? (landReraApproved === 'yes' ? 'Yes' : 'No') : '—')}
                    </>
                  ) : (
                    <>
                      {reviewRow('Khata Certificate', khataCertificateText(khataCertificate))}
                      {reviewRow('Sale Deed Certificate', yesNoDontKnowText(saleDeedCertificate))}
                      {saleDeedCertificate === 'no' ? reviewRow('Sale Agreement', yesNoDontKnowText(saleAgreement)) : null}
                      {reviewRow('Property Tax Paid', yesNoDontKnowText(propertyTaxPaid))}
                      {reviewRow('Occupancy Certificate', yesNoDontKnowText(occupancyCertificate))}
                    </>
                  )}
                </YStack>
              ) : null}

              <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900">Uploads</Text>
                <Text color={muted}>Photos: {photos.length}</Text>
                {photos.length ? (
                  <XStack gap="$2" flexWrap="wrap">
                    {photos.slice(0, 6).map((u) => (
                      <Pressable key={u} onPress={() => openPreview('photo', u)}>
                        <Text color="#2563EB" fontWeight="900">
                          View photo
                        </Text>
                      </Pressable>
                    ))}
                  </XStack>
                ) : null}
                <Text color={muted}>Videos: {videos.length}</Text>
                {videos.length ? (
                  <XStack gap="$2" flexWrap="wrap">
                    {videos.slice(0, 3).map((u) => (
                      <Pressable key={u} onPress={() => openPreview('video', u)}>
                        <Text color="#2563EB" fontWeight="900">
                          View video
                        </Text>
                      </Pressable>
                    ))}
                  </XStack>
                ) : null}
              </YStack>

              <YStack backgroundColor="#FFFFFF" borderRadius={16} padding={14} borderWidth={1} borderColor={border} gap="$2">
                <Text color={titleColor} fontWeight="900">Contact</Text>
                <Text color={muted}>Name: {reviewValue(contactName)}</Text>
                <Text color={muted}>Phone: {reviewValue(primaryContactPhone)}</Text>
              </YStack>
            </YStack>
          ) : null}

          {error ? (
            <YStack backgroundColor="#FEF2F2" borderRadius={12} padding={12} borderWidth={1} borderColor="#FECACA">
              <Text color="#991B1B" fontWeight="800">
                {error}
              </Text>
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>

      <YStack position="absolute" bottom={0} left={0} right={0} backgroundColor="#FFFFFF" padding={14} borderTopWidth={1} borderTopColor="#E5E7EB">
        <XStack gap="$2" justifyContent="space-between" alignItems="center" flexWrap="wrap">
          <Button
            disabled={saving || editLoading}
            backgroundColor="#0EA5E9"
            color="#FFFFFF"
            hoverStyle={{ backgroundColor: '#9CA3AF' }}
            onPress={back}>
            <Text color="#FFFFFF" fontWeight="900" fontFamily="Times New Roman">
              Back
            </Text>
          </Button>

          {step !== 'review' ? (
            <Button disabled={saving || editLoading} backgroundColor="#10B981" color="#FFFFFF" onPress={next}>
              <Text color="#FFFFFF" fontWeight="900" fontFamily="Times New Roman">
                Next
              </Text>
            </Button>
          ) : (
            <Button disabled={saving || editLoading} backgroundColor="#10B981" color="#FFFFFF" onPress={() => void submit()}>
              <Text color="#FFFFFF" fontWeight="900" fontFamily="Times New Roman">
                {saving ? 'Publishing…' : isEditMode ? 'Publish' : 'Post Property'}
              </Text>
            </Button>
          )}
        </XStack>
      </YStack>
    </View>
  );
}
