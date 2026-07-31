import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAuthGuard } from '@/lib/auth-guard';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';
import { t } from '@/constants/typography';

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

function AdminLocationsGuard() {
  const router = useRouter();
  const authGuard = useAuthGuard(['admin', 'staff']);

  useEffect(() => {
    if (!authGuard.isLoading && (authGuard.error === 'not_authenticated' || !authGuard.isAuthenticated)) {
      router.replace('/auth/login' as any);
    } else if (!authGuard.isLoading && authGuard.error === 'forbidden') {
      router.replace('/unauthorized' as any);
    }
  }, [authGuard.isLoading, authGuard.isAuthenticated, authGuard.error, router]);
  if (authGuard.isLoading || !authGuard.isAuthenticated || authGuard.error) return null;

  return <AdminLocationsInner />;
}

export default function AdminLocationsScreen() {
  return <AdminLocationsGuard />;
}

function AdminLocationsInner() {
  const router = useRouter();
  const colorScheme = useColorScheme(); const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [states, setStates] = useState<StateRow[]>([]);
  const [newState, setNewState] = useState('');
  const [selectedStateId, setSelectedStateId] = useState('');
  const [newCity, setNewCity] = useState('');
  const [chooseOpen, setChooseOpen] = useState(false);

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
      const { data: existing } = await supabase
        .from('states')
        .select('id,name')
        .ilike('name', trimmed)
        .maybeSingle();
      if (existing?.id) {
        setError(`State "${existing.name}" already exists.`);
        return;
      }
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
      const csvContent = `\uFEFF${SAMPLE_CSV}`;
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'locations-import-format.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setSuccess('Sample format downloaded.');
      } else {
        const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}locations-import-format.csv`;
        await FileSystem.writeAsStringAsync(uri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Save sample format' });
        setSuccess('Sample format exported.');
      }
    } catch {
      setError('Failed to export sample format.');
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
      let existingStates = 0;
      for (const row of rows) {
        if (!stateMap.has(row.state)) {
          const { data } = await supabase.from('states').select('id').ilike('name', row.state).maybeSingle();
          if (data?.id) {
            stateMap.set(row.state, data.id);
            existingStates++;
          } else {
            const { data: inserted } = await supabase.from('states').insert({ name: row.state }).select('id').maybeSingle();
            if (inserted?.id) stateMap.set(row.state, inserted.id);
          }
        }
      }
      // Upsert cities
      let insertedCities = 0;
      let existingCities = 0;
      for (const row of rows) {
        const stateId = stateMap.get(row.state);
        if (stateId) {
          const { data: existing } = await supabase
            .from('cities')
            .select('id')
            .eq('state_id', stateId)
            .ilike('name', row.city)
            .maybeSingle();
          if (!existing?.id) {
            const { error } = await supabase.from('cities').insert({ state_id: stateId, name: row.city });
            if (!error) insertedCities++;
          } else {
            existingCities++;
          }
        }
      }
      const summaryParts = [`Imported ${rows.length} rows. Added ${insertedCities} new cities.`];
      if (existingCities > 0) summaryParts.push(`${existingCities} cities already registered (skipped).`);
      if (existingStates > 0) summaryParts.push(`${existingStates} states already existed (skipped).`);
      setSuccess(summaryParts.join(' '));
      // Refetch states
      const { data: newStates } = await supabase.from('states').select('id,name').order('name');
      setStates(((newStates as any) ?? []) as StateRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBulkLoading(false);
    }
  };

  const pageBg = theme.bg;
  const border = theme.border;
  const titleColor = theme.text;
  const muted = theme.textMuted;
  const panelBg = theme.bgSecondary;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: pageBg }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <YStack gap="$4">
        <YStack backgroundColor={theme.primary} padding={16} paddingTop={18} borderRadius={16}>
          <XStack alignItems="center" justifyContent="center" position="relative">
            <Button size="$3" chromeless color="#FFFFFF" position="absolute" left={0} onPress={() => router.back()}>
              Back
            </Button>
            <Text color="#FFFFFF" fontSize={t(20)} fontWeight="800">
              Manage Locations
            </Text>
          </XStack>
        </YStack>

        {error ? <Text color={theme.danger}>{error}</Text> : null}
        {success ? <Text color={theme.success}>{success}</Text> : null}

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
              backgroundColor={theme.inputBg}
              borderColor={theme.inputBorder}
              color={theme.inputText}
            />
            <Button backgroundColor={theme.info} color="#FFFFFF" onPress={handleAddState} disabled={loading}>
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
              backgroundColor={theme.inputBg}
              borderColor={theme.inputBorder}
              color={theme.inputText}
            />
            <Button
              backgroundColor={theme.border}
              color={theme.text}
              onPress={() => setChooseOpen((v) => !v)}>
              {chooseOpen ? 'Close' : 'Choose'}
            </Button>
          </XStack>
          {chooseOpen ? (
            <YStack borderWidth={1} borderColor={border} borderRadius={10} overflow="hidden">
              <ScrollView style={{ maxHeight: 220 }}>
                {states.length ? (
                  states.map((s) => {
                    const selected = s.id === selectedStateId;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => {
                          setSelectedStateId(s.id);
                          setChooseOpen(false);
                        }}>
                        <XStack
                          alignItems="center"
                          justifyContent="space-between"
                          paddingVertical={10}
                          paddingHorizontal={12}
                          backgroundColor={selected ? theme.info : theme.inputBg}
                          borderBottomWidth={1}
                          borderBottomColor={border}>
                          <Text color={selected ? '#FFFFFF' : theme.text} fontWeight={selected ? '700' : '400'}>
                            {s.name}
                          </Text>
                          {selected ? (
                            <Text color="#FFFFFF" fontSize={t(13)}>
                              Selected
                            </Text>
                          ) : null}
                        </XStack>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text color={muted} padding={12}>
                    No states available. Add a state first.
                  </Text>
                )}
              </ScrollView>
            </YStack>
          ) : null}
          <XStack gap="$2">
            <Input
              value={newCity}
              onChangeText={setNewCity}
              placeholder="City name"
              flexGrow={1}
              backgroundColor={theme.inputBg}
              borderColor={theme.inputBorder}
              color={theme.inputText}
            />
            <Button backgroundColor={theme.info} color="#FFFFFF" onPress={handleAddCity} disabled={loading}>
              {loading ? 'Adding...' : 'Add'}
            </Button>
          </XStack>
        </YStack>

        {/* Bulk Import/Export */}
        <YStack backgroundColor={panelBg} borderRadius={12} padding={16} borderWidth={1} borderColor={border} gap="$3">
          <Text color={titleColor} fontWeight="900">
            Bulk Import / Export
          </Text>
          <Text color={muted} fontSize={t(14)}>
            Import states and cities from a CSV file. Format: state,city (one per line).
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            <Button backgroundColor={theme.success} color="#FFFFFF" onPress={handleExportSample}>
              Export Sample Format
            </Button>
            <Button backgroundColor={theme.warning} color="#FFFFFF" onPress={handleImportCSV} disabled={bulkLoading}>
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
              <Text color={muted} fontSize={t(14)}>
                ID: {s.id}
              </Text>
            </XStack>
          ))}
        </YStack>
      </YStack>
    </ScrollView>
  );
}
