import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Dialog, Text, XStack, YStack } from 'tamagui';

import { themes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { reverseGeocodeDetails, reverseGeocodeFeatures } from '@/lib/mapbox';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

const SERVICE_OPTIONS = [
  { key: 'ac', label: 'AC Service' },
  { key: 'carpenter', label: 'Carpenter' },
  { key: 'electrician', label: 'Electrician' },
  { key: 'plumber', label: 'Plumber' },
  { key: 'pest', label: 'Pest Control' },
  { key: 'cleaning', label: 'Deep Cleaning' },
  { key: 'painting', label: 'Painting' },
] as const;

const STATES = ['Gujarat', 'Maharashtra', 'Rajasthan', 'Madhya Pradesh'];

const STATE_CITY_MAP: Record<string, string[]> = {
  Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
  Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
  Rajasthan: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior'],
};

export default function ProviderProfileScreen() {
  const colorScheme = useColorScheme(); const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const router = useRouter();
  const { session } = useSession();
  const providerSubtype = String((session?.user?.user_metadata as any)?.provider_subtype ?? '').trim().toLowerCase();
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);

  const isFormValid = selectedService && selectedState && selectedCity;

  const availableCities = selectedState ? (STATE_CITY_MAP[selectedState] || []) : [];

  const detectLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied.');
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });

      const features = await reverseGeocodeFeatures(current.coords.longitude, current.coords.latitude, 8).catch(() => []);

      const details = (features.find((f) => (f.place_type ?? []).includes('address')) ??
        features[0] ??
        (await reverseGeocodeDetails(current.coords.longitude, current.coords.latitude))) as any;

      const context: any[] = details?.context ?? [];
      const allTexts = context.map((c: any) => c?.text || '').filter(Boolean);
      const placeText = context.find((c: any) => (c.id ?? '').startsWith('place.'))?.text
        || context.find((c: any) => (c.id ?? '').startsWith('district.'))?.text
        || context.find((c: any) => (c.id ?? '').startsWith('locality.'))?.text
        || '';

      let matchedState = '';
      for (const state of STATES) {
        if (allTexts.some((t: string) => t.toLowerCase().includes(state.toLowerCase()))) {
          matchedState = state;
          break;
        }
      }

      if (!matchedState && placeText) {
        for (const [state, cities] of Object.entries(STATE_CITY_MAP)) {
          if (cities.some((c) => placeText.toLowerCase().includes(c.toLowerCase()))) {
            matchedState = state;
            break;
          }
        }
      }

      if (matchedState) {
        setSelectedState(matchedState);
        const cities = STATE_CITY_MAP[matchedState] || [];
        const matchedCity = cities.find((c) => placeText.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(placeText.toLowerCase()));
        if (matchedCity) {
          setSelectedCity(matchedCity);
        } else if (cities.length > 0) {
          setSelectedCity(cities[0]);
        }
      } else {
        const detected = allTexts.join(', ') || 'unknown';
        setError(`Could not detect state (detected: ${detected}). Please select manually.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to detect location.');
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    if (!session?.user?.id) { setError('Please login first.'); return; }
    if (!isFormValid) { setError('Please select service, state, and city.'); return; }

    setSaving(true);
    setError(null);
    try {
      await supabase.from('home_service_providers').delete().eq('user_id', session.user.id);

      const { error: insertError } = await supabase.from('home_service_providers').insert({
        user_id: session.user.id,
        service_key: selectedService,
        state: selectedState,
        city: selectedCity,
        is_active: true,
      });

      if (insertError) throw new Error(insertError.message);

      const providerServices = providerSubtype === 'property_owner'
        ? ['property owner']
        : providerSubtype === 'home_service'
          ? ['home_service', selectedService]
          : [selectedService];

      await supabase.from('users').update({
        provider_services: providerServices,
        provider_type: providerSubtype === 'property_owner' ? 'property_owner' : providerSubtype === 'home_service' ? 'home_service' : null,
      }).eq('id', session.user.id);

      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const selectedServiceLabel = SERVICE_OPTIONS.find((s) => s.key === selectedService)?.label || 'Select Service';

  return (
    <View style={{ flex: 1, backgroundColor: theme.bgCardSecondary }}>
      <YStack backgroundColor="#1F4E79" padding={16} paddingTop={18}>
        <Text color="#FFFFFF" fontSize={16} fontWeight="800">Provider Profile Setup</Text>
        <Text color={theme.textMuted} fontSize={12} fontWeight="600">Select service, state & city</Text>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <YStack gap="$4">
          {error ? (
            <YStack backgroundColor={theme.bgCardSecondary} borderRadius={12} padding={12} borderWidth={1} borderColor={theme.danger}>
              <Text color={theme.danger} fontWeight="800">{error}</Text>
            </YStack>
          ) : null}

          <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
            <Text fontSize={14} fontWeight="800" color="#1F4E79">Service You Provide</Text>

            <XStack
              backgroundColor={theme.bgSecondary}
              borderRadius={12}
              borderWidth={1}
              borderColor={theme.border}
              padding={14}
              alignItems="center"
              onPress={() => setServicePickerOpen(true)}>
              <Text flex={1} color={selectedService ? theme.text : theme.textMuted} fontWeight="700">{selectedServiceLabel}</Text>
              <Text color={theme.textMuted} fontSize={16}>▼</Text>
            </XStack>
          </YStack>

          <YStack backgroundColor={theme.bgCard} borderRadius={14} padding={16} borderWidth={1} borderColor={theme.border} gap="$3">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={14} fontWeight="800" color="#1F4E79">Location</Text>
              <Button size="$2" backgroundColor={theme.info} color="#FFFFFF" disabled={saving || locating} onPress={detectLocation}>
                {locating ? 'Detecting...' : 'Use Current Location'}
              </Button>
            </XStack>

            <YStack gap="$2">
              <Text fontSize={12} fontWeight="700" color={theme.textSecondary}>State</Text>
              <XStack
                backgroundColor={theme.bgSecondary}
                borderRadius={12}
                borderWidth={1}
                borderColor={selectedState ? '#1F4E79' : theme.border}
                padding={14}
                alignItems="center"
                onPress={() => setStatePickerOpen(true)}>
                <Text flex={1} color={selectedState ? theme.text : theme.textMuted} fontWeight="700">{selectedState || 'Select State'}</Text>
                <Text color={selectedState ? '#1F4E79' : theme.textMuted} fontSize={16}>▼</Text>
              </XStack>
            </YStack>

            {selectedState ? (
              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color={theme.textSecondary}>City</Text>
                <XStack
                  backgroundColor={theme.bgSecondary}
                  borderRadius={12}
                  borderWidth={1}
                  borderColor={selectedCity ? theme.success : theme.border}
                  padding={14}
                  alignItems="center"
                  onPress={() => setCityPickerOpen(true)}>
                  <Text flex={1} color={selectedCity ? theme.text : theme.textMuted} fontWeight="700">{selectedCity || 'Select City'}</Text>
                  {selectedCity ? <Text color={theme.success} fontSize={16} fontWeight="900">✓</Text> : <Text color={theme.textMuted} fontSize={16}>▼</Text>}
                </XStack>
              </YStack>
            ) : null}
          </YStack>

          <YStack gap="$2">
            <Button backgroundColor={theme.success} color="#FFFFFF" disabled={saving || locating || !isFormValid} onPress={handleSave}>
              {saving ? 'Saving...' : 'Save Provider Profile'}
            </Button>
            <Button backgroundColor={theme.textMuted} color="#FFFFFF" disabled={saving} onPress={() => router.back()}>
              Cancel
            </Button>
          </YStack>
        </YStack>
      </ScrollView>

      {/* Service Picker Dialog */}
      <Dialog open={servicePickerOpen} onOpenChange={setServicePickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay opacity={0.6} backgroundColor={theme.bg} />
          <Dialog.Content backgroundColor={theme.bgCard} borderRadius={16} padding={16} width="92%">
            <YStack gap="$2">
              <Text fontSize={16} fontWeight="900" color={theme.text}>Select Service</Text>
              <YStack gap="$1">
                {SERVICE_OPTIONS.map((s) => {
                  const active = selectedService === s.key;
                  return (
                    <XStack key={s.key} alignItems="center" padding={12} borderRadius={12}
                      backgroundColor={active ? theme.couponBg : theme.bgSecondary}
                      borderWidth={1} borderColor={active ? theme.success : theme.border} gap="$2"
                      onPress={() => { setSelectedService(s.key); setServicePickerOpen(false); }}>
                      <XStack width={22} height={22} borderRadius={4} borderWidth={2}
                        borderColor={active ? theme.success : theme.border}
                        backgroundColor={active ? theme.success : 'transparent'}
                        justifyContent="center" alignItems="center">
                        {active ? <Text color="#FFFFFF" fontSize={14} fontWeight="900">✓</Text> : null}
                      </XStack>
                      <Text fontWeight="700" color={active ? theme.couponText : theme.text} flex={1}>{s.label}</Text>
                    </XStack>
                  );
                })}
              </YStack>
              <Button backgroundColor={theme.border} color={theme.text} onPress={() => setServicePickerOpen(false)}>Close</Button>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      {/* State Picker Dialog */}
      <Dialog open={statePickerOpen} onOpenChange={setStatePickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay opacity={0.6} backgroundColor={theme.bg} />
          <Dialog.Content backgroundColor={theme.bgCard} borderRadius={16} padding={16} width="92%">
            <YStack gap="$2">
              <Text fontSize={16} fontWeight="900" color={theme.text}>Select State</Text>
              <YStack gap="$1">
                {Object.keys(STATE_CITY_MAP).map((state) => {
                  const active = selectedState === state;
                  return (
                    <XStack key={state} alignItems="center" padding={12} borderRadius={12}
                      backgroundColor={active ? theme.bgSecondary : theme.bgSecondary}
                      borderWidth={1} borderColor={active ? '#1F4E79' : theme.border} gap="$2"
                      onPress={() => { setSelectedState(state); setSelectedCity(''); setStatePickerOpen(false); }}>
                      <XStack width={22} height={22} borderRadius={4} borderWidth={2}
                        borderColor={active ? '#1F4E79' : theme.border}
                        backgroundColor={active ? '#1F4E79' : 'transparent'}
                        justifyContent="center" alignItems="center">
                        {active ? <Text color="#FFFFFF" fontSize={14} fontWeight="900">✓</Text> : null}
                      </XStack>
                      <Text fontWeight="700" color={theme.text} flex={1}>{state}</Text>
                    </XStack>
                  );
                })}
              </YStack>
              <Button backgroundColor={theme.border} color={theme.text} onPress={() => setStatePickerOpen(false)}>Close</Button>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      {/* City Picker Dialog */}
      <Dialog open={cityPickerOpen} onOpenChange={setCityPickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay opacity={0.6} backgroundColor={theme.bg} />
          <Dialog.Content backgroundColor={theme.bgCard} borderRadius={16} padding={16} width="92%">
            <YStack gap="$2">
              <Text fontSize={16} fontWeight="900" color={theme.text}>Select City ({selectedState})</Text>
              <YStack gap="$1">
                {availableCities.map((city) => {
                  const active = selectedCity === city;
                  return (
                    <XStack key={city} alignItems="center" padding={12} borderRadius={12}
                      backgroundColor={active ? theme.couponBg : theme.bgSecondary}
                      borderWidth={1} borderColor={active ? theme.success : theme.border} gap="$2"
                      onPress={() => { setSelectedCity(city); setCityPickerOpen(false); }}>
                      <XStack width={22} height={22} borderRadius={4} borderWidth={2}
                        borderColor={active ? theme.success : theme.border}
                        backgroundColor={active ? theme.success : 'transparent'}
                        justifyContent="center" alignItems="center">
                        {active ? <Text color="#FFFFFF" fontSize={14} fontWeight="900">✓</Text> : null}
                      </XStack>
                      <Text fontWeight="700" color={active ? theme.couponText : theme.text} flex={1}>{city}</Text>
                    </XStack>
                  );
                })}
              </YStack>
              <Button backgroundColor={theme.border} color={theme.text} onPress={() => setCityPickerOpen(false)}>Close</Button>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </View>
  );
}
