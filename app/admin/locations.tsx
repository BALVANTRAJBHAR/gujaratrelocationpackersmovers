import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Share } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

type StateRow = { id: string; name: string };
type CityRow = { id: string; state_id: string; name: string };

type BulkRow = {
  state: string;
  city: string;
};

const SAMPLE_CSV = `state,city
Gujarat,Ahmedabad
Gujarat,Surat
Gujarat,Vadodara
Gujarat,Rajkot
Maharashtra,Mumbai
Maharashtra,Pune
Maharashtra,Nagpur
Maharashtra,Nashik
Rajasthan,Jaipur
Rajasthan,Jodhpur
Rajasthan,Udaipur
Rajasthan,Kota
Madhya Pradesh,Bhopal
Madhya Pradesh,Indore
Madhya Pradesh,Jabalpur
Madhya Pradesh,Gwalior`;

export default function AdminLocationsScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [states, setStates] = useState<StateRow[]>([]);
  const [newState, setNewState] = useState('');
  const [selectedStateId, setSelectedStateId] = useState('');
  const [newCity, setNewCity] = useState('');

  // Fetch states on mount
  useEffect(() => {
    let active = true;
    const loadStates = async () => {
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
    loadStates();
    return () => {
      active = false;
    };
  }, []);

  // Add a new state
  const handleAddState = async () => {
    const trimmed = newState.trim();
    if (!trimmed) {
      setError('State name required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: insertError } = await supabase.from('states').insert({ name: trimmed });
      if (insertError) throw new Error(insertError.message);
      setSuccess('State added.');
      setNewState('');
      // Refetch
      const { data } = await supabase.from('states').select('id,name').order('name');
      setStates(((data as any) ?? []) as StateRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add state.');
    } finally {
      setLoading(false);
    }
  };

  // Add a new city to selected state
  const handleAddCity = async () => {
    const trimmedCity = newCity.trim();
    if (!selectedStateId) {
      setError('Select a state first.');
      return;
    }
    if (!trimmedCity) {
      setError('City name required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: insertError } = await supabase.from('cities').insert({ state_id: selectedStateId, name: trimmedCity });
      if (insertError) throw new Error(insertError.message);
      setSuccess('City added.');
      setNewCity('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add city.');
    } finally {
      setLoading(false);
    }
  };

  // Export sample CSV format
  const handleExportSample = async () => {
    try {
      await Share.share({
        message: SAMPLE_CSV,
        title: 'Locations Import Format (CSV)',
      });
    } catch {
      setError('Failed to share sample format.');
    }
  };

  // Import CSV file
  const handleImportCSV = async () => {
    setError(null);
    setSuccess(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/csv', 'text/comma-separated-values'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const file = result.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri);
      const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        setError('CSV must have header and at least one data row.');
        return;
      }
      // Parse CSV (simple comma split, no quoted commas support)
      const rows: BulkRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        if (cols.length >= 2) {
          rows.push({ state: cols[0], city: cols[1] });
        }
      }
      if (!rows.length) {
        setError('No valid rows found.');
        return;
      }
      setBulkLoading(true);
      // Upsert states first
      const stateMap = new Map<string, string>();
      for (const row of rows) {
        if (!stateMap.has(row.state)) {
          const { data } = await supabase.from('states').select('id').eq('name', row.state).single();
          if (data?.id) {
            stateMap.set(row.state, data.id);
          } else {
            const { data: inserted } = await supabase.from('states').insert({ name: row.state }).select('id').single();
            if (inserted?.id) stateMap.set(row.state, inserted.id);
          }
        }
      }
      // Upsert cities
      let insertedCities = 0;
      for (const row of rows) {
        const stateId = stateMap.get(row.state);
        if (stateId) {
          const { data: existing } = await supabase.from('cities').select('id').eq('state_id', stateId).eq('name', row.city).single();
          if (!existing?.id) {
            const { error } = await supabase.from('cities').insert({ state_id: stateId, name: row.city });
            if (!error) insertedCities++;
          }
        }
      }
      setSuccess(`Imported ${rows.length} rows. Added ${insertedCities} new cities.`);
      // Refetch states
      const { data: newStates } = await supabase.from('states').select('id,name').order('name');
      setStates(((newStates as any) ?? []) as StateRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBulkLoading(false);
    }
  };

  const pageBg = '#FFFFFF';
  const border = '#E5E7EB';
  const titleColor = '#0F172A';
  const muted = '#64748B';
  const panelBg = '#F8FAFC';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: pageBg }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <YStack gap="$4">
        <YStack backgroundColor="#111827" padding={16} paddingTop={18} borderRadius={16}>
          <XStack alignItems="center" justifyContent="center" position="relative">
            <Button size="$3" chromeless color="#FFFFFF" position="absolute" left={0} onPress={() => router.back()}>
              Back
            </Button>
            <Text color="#FFFFFF" fontSize={18} fontWeight="800">
              Manage Locations
            </Text>
          </XStack>
        </YStack>

        {error ? <Text color="#EF4444">{error}</Text> : null}
        {success ? <Text color="#10B981">{success}</Text> : null}

        {/* Add State */}
        <YStack backgroundColor={panelBg} borderRadius={12} padding={16} borderWidth={1} borderColor={border} gap="$3">
          <Text color={titleColor} fontWeight="900">
            Add State
          </Text>
          <XStack gap="$2">
            <Input
              value={newState}
              onChangeText={setNewState}
              placeholder="State name"
              flexGrow={1}
              backgroundColor="#FFFFFF"
              borderColor={border}
              color={titleColor}
            />
            <Button backgroundColor="#3B82F6" color="#FFFFFF" onPress={handleAddState} disabled={loading}>
              {loading ? 'Adding...' : 'Add'}
            </Button>
          </XStack>
        </YStack>

        {/* Add City */}
        <YStack backgroundColor={panelBg} borderRadius={12} padding={16} borderWidth={1} borderColor={border} gap="$3">
          <Text color={titleColor} fontWeight="900">
            Add City
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            <Input
              value={states.find((s) => s.id === selectedStateId)?.name ?? ''}
              editable={false}
              placeholder="Select state"
              flexGrow={1}
              minWidth={150}
              backgroundColor="#FFFFFF"
              borderColor={border}
              color={titleColor}
            />
            <Button
              backgroundColor="#E5E7EB"
              color="#111827"
              size="$3"
              onPress={() => {
                Alert.alert(
                  'Select State',
                  'Choose a state to add a city under',
                  states.map((s) => ({
                    text: s.name,
                    onPress: () => setSelectedStateId(s.id),
                  }))
                );
              }}>
              Choose
            </Button>
          </XStack>
          <XStack gap="$2">
            <Input
              value={newCity}
              onChangeText={setNewCity}
              placeholder="City name"
              flexGrow={1}
              backgroundColor="#FFFFFF"
              borderColor={border}
              color={titleColor}
            />
            <Button backgroundColor="#3B82F6" color="#FFFFFF" onPress={handleAddCity} disabled={loading}>
              {loading ? 'Adding...' : 'Add'}
            </Button>
          </XStack>
        </YStack>

        {/* Bulk Import/Export */}
        <YStack backgroundColor={panelBg} borderRadius={12} padding={16} borderWidth={1} borderColor={border} gap="$3">
          <Text color={titleColor} fontWeight="900">
            Bulk Import / Export
          </Text>
          <Text color={muted} fontSize={12}>
            Import states and cities from a CSV file. Format: state,city (one per line).
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            <Button backgroundColor="#10B981" color="#FFFFFF" onPress={handleExportSample}>
              Export Sample Format
            </Button>
            <Button backgroundColor="#F59E0B" color="#FFFFFF" onPress={handleImportCSV} disabled={bulkLoading}>
              {bulkLoading ? 'Importing...' : 'Import CSV'}
            </Button>
          </XStack>
        </YStack>

        {/* Existing States */}
        <YStack backgroundColor={panelBg} borderRadius={12} padding={16} borderWidth={1} borderColor={border} gap="$3">
          <Text color={titleColor} fontWeight="900">
            Existing States ({states.length})
          </Text>
          {states.map((s) => (
            <XStack key={s.id} justifyContent="space-between" alignItems="center">
              <Text color={titleColor}>{s.name}</Text>
              <Text color={muted} fontSize={12}>
                ID: {s.id}
              </Text>
            </XStack>
          ))}
        </YStack>
      </YStack>
    </ScrollView>
  );
}
