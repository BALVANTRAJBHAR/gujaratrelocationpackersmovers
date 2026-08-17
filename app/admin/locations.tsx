import React, { useEffect, useRef, useState } from 'react';
import { FontAwesome5 } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, NativeModules, ToastAndroid } from 'react-native';
import { Button, Input, Text, XStack, YStack } from 'tamagui';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuthGuard } from '@/lib/auth-guard';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';
import { t } from '@/constants/typography';
import EndOfResults from '@/components/EndOfResults';

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
  if (authGuard.isLoading || !authGuard.isAuthenticated || authGuard.error) {
    return (
      <YStack flex={1} backgroundColor="#1A2D42" justifyContent="center" alignItems="center">
        <ActivityIndicator size="large" color="#FBBF24" />
      </YStack>
    );
  }

  return <AdminLocationsInner />;
}

export default function AdminLocationsScreen() {
  return <AdminLocationsGuard />;
}

function AdminLocationsInner() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme(); const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [states, setStates] = useState<StateRow[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [localities, setLocalities] = useState<{ id: string; city_id: string; name: string }[]>([]);
  const [newState, setNewState] = useState('');
  const [selectedStateId, setSelectedStateId] = useState('');
  const [newCity, setNewCity] = useState('');
  const [chooseOpen, setChooseOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ type: 'state'; id: string; name: string } | { type: 'city'; id: string; name: string; state_id: string } | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editCityStateId, setEditCityStateId] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [mutationBusy, setMutationBusy] = useState<string | null>(null);

  // Fetch states + cities on mount
  const loadData = async () => {
    try {
      const [statesRes, citiesRes, localitiesRes] = await Promise.all([
        supabase.from('states').select('id,name').order('name'),
        supabase.from('cities').select('id,state_id,name').order('name'),
        supabase.from('localities').select('id,city_id,name').order('name'),
      ]);
      if (statesRes.error) throw new Error(statesRes.error.message);
      if (citiesRes.error) throw new Error(citiesRes.error.message);
      if (localitiesRes.error) throw new Error(localitiesRes.error.message);
      setStates((statesRes.data ?? []) as StateRow[]);
      setCities((citiesRes.data ?? []) as CityRow[]);
      setLocalities((localitiesRes.data ?? []) as { id: string; city_id: string; name: string }[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load locations.');
    }
  };

  useEffect(() => {
    let active = true;
    supabase.from('states').select('id,name').order('name').then(({ data }) => {
      if (active) setStates((data ?? []) as StateRow[]);
    });
    supabase.from('cities').select('id,state_id,name').order('name').then(({ data }) => {
      if (active) setCities((data ?? []) as CityRow[]);
    });
    supabase.from('localities').select('id,city_id,name').order('name').then(({ data }) => {
      if (active) setLocalities((data ?? []) as { id: string; city_id: string; name: string }[]);
    });
    return () => { active = false; };
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
      await loadData();
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
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add city.');
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (target: { type: 'state'; id: string; name: string } | { type: 'city'; id: string; name: string; state_id: string }) => {
    setError(null);
    setSuccess(null);
    setEditTarget(target);
    setEditDraft(target.name);
    setEditCityStateId(target.type === 'city' ? target.state_id : '');
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const trimmed = editDraft.trim();
    if (!trimmed) {
      setError('Name required.');
      return;
    }
    setSaveBusy(true);
    setError(null);
    try {
      if (editTarget.type === 'state') {
        const { data: duplicate } = await supabase
          .from('states')
          .select('id')
          .ilike('name', trimmed)
          .neq('id', editTarget.id)
          .maybeSingle();
        if (duplicate?.id) {
          setError(`State "${trimmed}" already exists.`);
          return;
        }
        const { error } = await supabase.from('states').update({ name: trimmed }).eq('id', editTarget.id);
        if (error) throw new Error(error.message);
        setSuccess('State renamed.');
      } else {
        const { data: duplicate } = await supabase
          .from('cities')
          .select('id')
          .eq('state_id', editCityStateId)
          .ilike('name', trimmed)
          .neq('id', editTarget.id)
          .maybeSingle();
        if (duplicate?.id) {
          setError(`City "${trimmed}" already exists in this state.`);
          return;
        }
        const { error } = await supabase
          .from('cities')
          .update({ name: trimmed, state_id: editCityStateId })
          .eq('id', editTarget.id);
        if (error) throw new Error(error.message);
        setSuccess('City updated.');
      }
      setEditTarget(null);
      setEditDraft('');
      setEditCityStateId('');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save changes.');
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDeleteState = (s: StateRow) => {
    const stateCities = cities.filter((c) => c.state_id === s.id);
    const cityCount = stateCities.length;
    const localityCount = localities.filter((l) => stateCities.some((c) => c.id === l.city_id)).length;
    Alert.alert(
      `Delete state "${s.name}"?`,
      `This will permanently delete ${cityCount} cities${localityCount ? ` and ${localityCount} localities` : ''} under it. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void runDeleteState(s),
        },
      ]
    );
  };

  const runDeleteState = async (s: StateRow) => {
    setMutationBusy(`state-${s.id}`);
    setError(null);
    try {
      const { error } = await supabase.from('states').delete().eq('id', s.id);
      if (error) throw new Error(error.message);
      setSuccess(`State "${s.name}" deleted.`);
      if (selectedStateId === s.id) setSelectedStateId('');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete state.');
    } finally {
      setMutationBusy(null);
    }
  };

  const handleDeleteCity = (c: CityRow) => {
    const cityLocalities = localities.filter((l) => l.city_id === c.id).length;
    Alert.alert(
      `Delete city "${c.name}"?`,
      `This will permanently delete ${cityLocalities} localit${cityLocalities === 1 ? 'y' : 'ies'} under it. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void runDeleteCity(c),
        },
      ]
    );
  };

  const runDeleteCity = async (c: CityRow) => {
    setMutationBusy(`city-${c.id}`);
    setError(null);
    try {
      const { error } = await supabase.from('cities').delete().eq('id', c.id);
      if (error) throw new Error(error.message);
      setSuccess(`City "${c.name}" deleted.`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete city.');
    } finally {
      setMutationBusy(null);
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
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBulkLoading(false);
    }
  };

  // Helper: save file to Downloads or share
  const saveOrShare = async (uri: string, fileName: string, mimeType: string) => {
    const nativeDl = NativeModules.PdfDownload as { saveToDownloads(s: string, n: string, type?: string): Promise<string> } | undefined;
    if (Platform.OS === 'android' && nativeDl) {
      await nativeDl.saveToDownloads(uri, fileName, mimeType);
      ToastAndroid.show('Downloaded successfully.', ToastAndroid.LONG);
    } else {
      const destination = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}${fileName}`;
      if (destination !== uri) await FileSystem.copyAsync({ from: uri, to: destination });
      Alert.alert('Download complete', 'File saved successfully.');
    }
  };

  // Export locations as CSV (opens in Excel)
  const handleExportCSV = async () => {
    setExportLoading(true);
    setError(null);
    try {
      const header = 'State,City';
      const rows = states.flatMap((s) => {
        const stateCities = cities.filter((c) => c.state_id === s.id);
        if (stateCities.length === 0) return [`"${s.name}",""`];
        return stateCities.map((c) => `"${s.name}","${c.name}"`);
      });
      const csv = `\uFEFF${[header, ...rows].join('\n')}`;
      const fileName = `locations-${new Date().toISOString().slice(0, 10)}.csv`;
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setSuccess('Locations exported as CSV.');
        return;
      }
      const tempUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(tempUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await saveOrShare(tempUri, fileName, 'text/csv');
      setSuccess('Locations exported as CSV (Excel).');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CSV export failed.');
    } finally {
      setExportLoading(false);
    }
  };

  // Export locations as PDF
  const handleExportPDF = async () => {
    setExportLoading(true);
    setError(null);
    try {
      const rows = states.map((s) => {
        const stateCities = cities.filter((c) => c.state_id === s.id).map((c) => c.name).join(', ') || '—';
        return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;">${s.name}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#1F2937;">${stateCities}</td></tr>`;
      }).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>body{font-family:sans-serif;padding:20px;color:#111827}h1{font-size:22px;margin-bottom:16px}table{width:100%;border-collapse:collapse}th{background:#3b82f6;color:#fff;padding:10px 12px;text-align:left}tr:nth-child(even){background:#f9fafb}</style></head><body><h1>Locations Report</h1><p>Generated: ${new Date().toLocaleDateString('en-IN')}</p><table><thead><tr><th>State</th><th>Cities</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document;
        if (doc) {
          doc.open(); doc.write(html); doc.close();
          setTimeout(() => {
            iframe.contentWindow?.print();
            setTimeout(() => document.body.removeChild(iframe), 2000);
          }, 500);
        }
        setSuccess('Sending to print dialog...');
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      const fileName = `locations-${new Date().toISOString().slice(0, 10)}.pdf`;
      const destUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${fileName}`;
      await FileSystem.copyAsync({ from: uri, to: destUri });
      await saveOrShare(destUri, fileName, 'application/pdf');
      setSuccess('Locations exported as PDF.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF export failed.');
    } finally {
      setExportLoading(false);
    }
  };

  const pageBg = theme.bg;
  const border = theme.border;
  const titleColor = theme.text;
  const muted = theme.textMuted;
  const panelBg = theme.bgSecondary;

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: pageBg }} contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
      <YStack gap="$4">
        <YStack backgroundColor={theme.primary} padding={16} paddingTop={18} borderRadius={16} gap="$2">
            <Button alignSelf="flex-start" size="$3" chromeless color="#FFFFFF" onPress={() => router.back()}>
              ← Back
            </Button>
            <XStack alignItems="center" justifyContent="center" gap={8}>
              <FontAwesome5 name="map-marker-alt" size={18} color="#FFFFFF" />
              <Text color="#FFFFFF" fontSize={t(20)} fontWeight="800">Manage Locations</Text>
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

        {/* Download Locations Report */}
        <YStack backgroundColor={panelBg} borderRadius={12} padding={16} borderWidth={1} borderColor={border} gap="$3">
          <Text color={titleColor} fontWeight="900">
            Download Locations Report
          </Text>
          <Text color={muted} fontSize={t(13)}>
            Export all states and cities as Excel (CSV) or PDF.
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            <Button
              flex={1}
              backgroundColor={theme.info}
              color="#FFFFFF"
              borderRadius={10}
              disabled={exportLoading}
              onPress={handleExportCSV}>
              {exportLoading ? 'Exporting...' : '📊 Export Excel (CSV)'}
            </Button>
            <Button
              flex={1}
              backgroundColor={theme.danger}
              color="#FFFFFF"
              borderRadius={10}
              disabled={exportLoading}
              onPress={handleExportPDF}>
              {exportLoading ? 'Exporting...' : '📄 Export PDF'}
            </Button>
          </XStack>
        </YStack>

        {/* Existing States with Cities */}
        <YStack backgroundColor={panelBg} borderRadius={12} padding={16} borderWidth={1} borderColor={border} gap="$3">
          <Text color={titleColor} fontWeight="900">
            States & Cities ({states.length} states, {cities.length} cities)
          </Text>
          {states.length === 0 ? (
            <Text color={muted} fontSize={t(14)}>No states added yet.</Text>
          ) : (
            states.map((s) => {
              const stateCities = cities.filter((c) => c.state_id === s.id);
              const stateBusy = mutationBusy === `state-${s.id}`;
              return (
                <YStack
                  key={s.id}
                  borderBottomWidth={1}
                  borderBottomColor={border}
                  paddingVertical={10}
                  gap="$1">
                  <XStack alignItems="center" justifyContent="space-between" gap="$2">
                    <Text color={titleColor} fontWeight="800" fontSize={t(15)} flexShrink={1}>
                      📍 {s.name}
                    </Text>
                    <XStack gap={6}>
                      <Button
                        size="$1"
                        chromeless
                        paddingHorizontal={8}
                        disabled={!!mutationBusy}
                        onPress={() => openEdit({ type: 'state', id: s.id, name: s.name })}>
                        <FontAwesome5 name="pen" size={13} color={theme.info} />
                      </Button>
                      <Button
                        size="$1"
                        chromeless
                        backgroundColor={theme.bgCardSecondary}
                        paddingHorizontal={8}
                        disabled={!!mutationBusy}
                        onPress={() => handleDeleteState(s)}>
                        <FontAwesome5 name="trash" size={13} color={stateBusy ? muted : theme.danger} />
                      </Button>
                    </XStack>
                  </XStack>
                  {stateCities.length > 0 ? (
                    <YStack gap={4}>
                      {stateCities.map((c) => {
                        const cityLocalities = localities.filter((l) => l.city_id === c.id);
                        const cityBusy = mutationBusy === `city-${c.id}`;
                        return (
                          <XStack key={c.id} alignItems="center" justifyContent="space-between" gap="$2" backgroundColor={theme.inputBg} borderRadius={8} paddingLeft={10} paddingVertical={6} paddingRight={4}>
                            <YStack flexShrink={1} gap={1}>
                              <Text color={titleColor} fontSize={t(13)} fontWeight="600">
                                {c.name}
                              </Text>
                              <Text color={muted} fontSize={t(11)}>
                                {cityLocalities.length > 0 ? `${cityLocalities.length} localit${cityLocalities.length === 1 ? 'y' : 'ies'}` : 'No localities'}
                              </Text>
                            </YStack>
                            <XStack gap={6}>
                              <Button
                                size="$1"
                                chromeless
                                paddingHorizontal={8}
                                disabled={!!mutationBusy}
                                onPress={() => openEdit({ type: 'city', id: c.id, name: c.name, state_id: c.state_id })}>
                                <FontAwesome5 name="pen" size={12} color={theme.info} />
                              </Button>
                              <Button
                                size="$1"
                                chromeless
                                backgroundColor={theme.bgCardSecondary}
                                paddingHorizontal={8}
                                disabled={!!mutationBusy}
                                onPress={() => handleDeleteCity(c)}>
                                <FontAwesome5 name="trash" size={12} color={cityBusy ? muted : theme.danger} />
                              </Button>
                            </XStack>
                          </XStack>
                        );
                      })}
                    </YStack>
                  ) : (
                    <Text color={muted} fontSize={t(13)} flexShrink={1}>
                      No cities added yet
                    </Text>
                  )}
                </YStack>
              );
            })
          )}
<EndOfResults theme={theme} onUp={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
        </YStack>
      </YStack>

      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="rgba(0,0,0,0.5)" padding={16}>
          <YStack backgroundColor={theme.bgCard} borderRadius={16} padding={20} width="100%" maxWidth={400} gap="$3">
            <Text color={titleColor} fontWeight="900" fontSize={t(16)}>
              {editTarget?.type === 'state' ? `Edit state: ${editTarget.name}` : `Edit city: ${editTarget?.name ?? ''}`}
            </Text>
            {editTarget?.type === 'city' ? (
              <YStack gap="$1">
                <Text color={muted} fontSize={t(12)}>Move to state</Text>
                <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                  <YStack borderWidth={1} borderColor={border} borderRadius={10} overflow="hidden">
                    {states.map((s) => {
                      const selected = s.id === editCityStateId;
                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => setEditCityStateId(s.id)}>
                          <YStack
                            backgroundColor={selected ? theme.info : theme.inputBg}
                            paddingVertical={9}
                            paddingHorizontal={12}
                            borderBottomWidth={1}
                            borderBottomColor={border}>
                            <Text color={selected ? '#FFFFFF' : theme.text} fontWeight={selected ? '700' : '400'} fontSize={t(13)}>
                              {s.name} {selected ? '✓' : ''}
                            </Text>
                          </YStack>
                        </Pressable>
                      );
                    })}
                  </YStack>
                </ScrollView>
              </YStack>
            ) : null}
            <Input
              value={editDraft}
              onChangeText={setEditDraft}
              placeholder={editTarget?.type === 'state' ? 'State name' : 'City name'}
              backgroundColor={theme.inputBg}
              borderColor={theme.inputBorder}
              color={theme.inputText}
              autoFocus
            />
            <XStack gap="$2">
              <Button flex={1} backgroundColor={theme.accent} color="#FFFFFF" disabled={saveBusy} onPress={handleSaveEdit}>
                <Text color="#FFFFFF" fontWeight="800">{saveBusy ? 'Saving...' : 'Save'}</Text>
              </Button>
              <Button flex={1} backgroundColor={theme.bgCardSecondary} color={theme.text} disabled={saveBusy} onPress={() => setEditTarget(null)}>
                <Text color={theme.text} fontWeight="700">Cancel</Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </Modal>
    </ScrollView>
  );
}
