import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';
import { Checkbox } from 'tamagui';

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

const STATES = [
  'Gujarat',
  'Maharashtra',
  'Rajasthan',
  'Madhya Pradesh',
];

const STATE_CITY_MAP: Record<string, string[]> = {
  Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
  Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
  Rajasthan: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior'],
};

export default function ProviderProfileScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFormValid = useMemo(() => {
    return selectedServices.length > 0 && selectedState && selectedCities.length > 0;
  }, [selectedServices, selectedState, selectedCities]);

  const availableCities = useMemo(() => {
    return selectedState ? (STATE_CITY_MAP[selectedState] || []) : [];
  }, [selectedState]);

  const toggleService = (serviceKey: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceKey) ? prev.filter((s) => s !== serviceKey) : [...prev, serviceKey]
    );
  };

  const toggleState = (state: string) => {
    setSelectedState(state === selectedState ? '' : state);
    setSelectedCities([]);
  };

  const toggleCity = (city: string) => {
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]
    );
  };

  const detectLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied.');
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      const features = await reverseGeocodeFeatures(
        current.coords.longitude,
        current.coords.latitude,
        8
      ).catch(() => []);

      const details = (features.find((f) => (f.place_type ?? []).includes('address')) ??
        features[0] ??
        (await reverseGeocodeDetails(current.coords.longitude, current.coords.latitude))) as any;

      const context = details?.context ?? [];
      const regionText = context.find((c: any) => (c.id ?? '').startsWith('region.'))?.text || '';

      // Try to match state
      let matchedState = '';
      for (const state of STATES) {
        if (regionText.toLowerCase().includes(state.toLowerCase())) {
          matchedState = state;
          break;
        }
      }

      if (matchedState) {
        setSelectedState(matchedState);
        // Auto-select first city as default
        const cities = STATE_CITY_MAP[matchedState] || [];
        if (cities.length > 0) {
          setSelectedCities([cities[0]]);
        }
      } else {
        setError('Could not detect state. Please select manually.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to detect location.');
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    if (!session?.user?.id) {
      setError('Please login first.');
      return;
    }

    if (!isFormValid) {
      setError('Please select services, state, and at least one city.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Prepare rows for insertion
      const rows = [];
      for (const service of selectedServices) {
        for (const city of selectedCities) {
          rows.push({
            user_id: session.user.id,
            service_key: service,
            state: selectedState,
            city: city,
            is_active: true,
          });
        }
      }

      // Delete existing entries first
      await supabase
        .from('home_service_providers')
        .delete()
        .eq('user_id', session.user.id);

      // Insert new entries
      const { error: insertError } = await supabase
        .from('home_service_providers')
        .insert(rows);

      if (insertError) throw new Error(insertError.message);

      Alert.alert('Success', 'Your provider profile has been updated!', [
        { text: 'OK', onPress: () => router.replace('/home') },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      <YStack backgroundColor="#1F4E79" padding={16} paddingTop={18}>
        <Text color="#FFFFFF" fontSize={16} fontWeight="800">
          Provider Profile Setup
        </Text>
        <Text color="#CFE3F4" fontSize={12} fontWeight="600">
          Select services, state & cities you serve
        </Text>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <YStack gap="$4">
          {error ? (
            <YStack
              backgroundColor="#FEF2F2"
              borderRadius={12}
              padding={12}
              borderWidth={1}
              borderColor="#FECACA">
              <Text color="#991B1B" fontWeight="800">
                {error}
              </Text>
            </YStack>
          ) : null}

          <YStack
            backgroundColor="#FFFFFF"
            borderRadius={14}
            padding={16}
            borderWidth={1}
            borderColor="#E5E7EB"
            gap="$3">
            <Text fontSize={14} fontWeight="800" color="#1F4E79">
              Services You Provide ({selectedServices.length} selected)
            </Text>
            <YStack gap="$2">
              {SERVICE_OPTIONS.map((service) => (
                <XStack
                  key={service.key}
                  alignItems="center"
                  padding={12}
                  borderRadius={12}
                  backgroundColor={selectedServices.includes(service.key) ? '#EFF6FF' : '#F9FAFB'}
                  borderWidth={1}
                  borderColor={selectedServices.includes(service.key) ? '#1F4E79' : '#E5E7EB'}
                  gap="$2"
                  onPress={() => toggleService(service.key)}>
                  <Checkbox
                    checked={selectedServices.includes(service.key)}
                    onCheckedChange={() => toggleService(service.key)}
                  />
                  <Text fontWeight="700" color="#111827" flex={1}>
                    {service.label}
                  </Text>
                </XStack>
              ))}
            </YStack>
          </YStack>

          <YStack
            backgroundColor="#FFFFFF"
            borderRadius={14}
            padding={16}
            borderWidth={1}
            borderColor="#E5E7EB"
            gap="$3">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={14} fontWeight="800" color="#1F4E79">
                Location
              </Text>
              <Button
                size="$2"
                backgroundColor="#0EA5E9"
                color="#FFFFFF"
                disabled={saving || locating}
                onPress={detectLocation}>
                {locating ? 'Detecting...' : 'Use Current Location'}
              </Button>
            </XStack>

            <YStack gap="$2">
              <Text fontSize={12} fontWeight="700" color="#456bbeff">
                State
              </Text>
              <YStack gap="$2">
                {STATES.map((state) => (
                  <XStack
                    key={state}
                    alignItems="center"
                    padding={12}
                    borderRadius={12}
                    backgroundColor={selectedState === state ? '#EFF6FF' : '#F9FAFB'}
                    borderWidth={1}
                    borderColor={selectedState === state ? '#1F4E79' : '#E5E7EB'}
                    gap="$2"
                    onPress={() => toggleState(state)}>
                    <Checkbox checked={selectedState === state} onCheckedChange={() => toggleState(state)} />
                    <Text fontWeight="700" color="#111827" flex={1}>
                      {state}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </YStack>

            {selectedState && (
              <YStack gap="$2">
                <Text fontSize={12} fontWeight="700" color="#456bbeff">
                  Cities ({selectedCities.length} selected)
                </Text>
                <YStack gap="$2">
                  {availableCities.map((city) => (
                    <XStack
                      key={city}
                      alignItems="center"
                      padding={12}
                      borderRadius={12}
                      backgroundColor={selectedCities.includes(city) ? '#EFF6FF' : '#F9FAFB'}
                      borderWidth={1}
                      borderColor={selectedCities.includes(city) ? '#1F4E79' : '#E5E7EB'}
                      gap="$2"
                      onPress={() => toggleCity(city)}>
                      <Checkbox
                        checked={selectedCities.includes(city)}
                        onCheckedChange={() => toggleCity(city)}
                      />
                      <Text fontWeight="700" color="#111827" flex={1}>
                        {city}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              </YStack>
            )}
          </YStack>

          <YStack gap="$2">
            <Button
              backgroundColor="#10B981"
              color="#FFFFFF"
              disabled={saving || locating || !isFormValid}
              onPress={handleSave}>
              {saving ? 'Saving...' : 'Save Provider Profile'}
            </Button>
            <Button
              backgroundColor="#6B7280"
              color="#FFFFFF"
              disabled={saving}
              onPress={() => router.back()}>
              Cancel
            </Button>
          </YStack>
        </YStack>
      </ScrollView>
    </View>
  );
}
