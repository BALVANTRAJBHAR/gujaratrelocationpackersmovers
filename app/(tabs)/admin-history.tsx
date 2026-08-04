import * as FileSystem from 'expo-file-system/legacy';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, NativeModules, Platform, Pressable, ToastAndroid, View } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import MobileDatePicker from '@/components/MobileDatePicker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { themes } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { useRouter } from 'expo-router';
import { useAuthGuard } from '@/lib/auth-guard';
import { t } from '@/constants/typography';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '@/lib/date-format';
import EndOfResults from '@/components/EndOfResults';

type ApprovalRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  is_verified: boolean | null;
  updated_at: string | null;
};

type ActionLog = {
  id: string;
  action_type: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
  admin_user?: { name: string | null }[] | null;
  target_user?: { name: string | null }[] | null;
};

function AdminHistoryGuard() {
  const router = useRouter();
  const authGuard = useAuthGuard(['admin', 'staff']);
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  useEffect(() => {
    if (authGuard.isLoading) return;
    if (!authGuard.isAuthenticated || authGuard.error === 'not_authenticated') {
      router.replace('/auth/login' as any);
    } else if (authGuard.error === 'forbidden') {
      router.replace('/unauthorized' as any);
    }
  }, [authGuard.isLoading, authGuard.isAuthenticated, authGuard.error, router]);

  if (authGuard.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }
  if (!authGuard.isAuthenticated || authGuard.error) return null;

  return <AdminHistoryInner />;
}

export default function AdminHistoryScreen() {
  return <AdminHistoryGuard />;
}

function AdminHistoryInner() {
  const router = useRouter();
  const { profile } = useSession();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? themes.dark : themes.light;
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startPickerValue, setStartPickerValue] = useState(new Date());
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerValue, setEndPickerValue] = useState(new Date());
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<'all' | 'driver_status_update'>('all');
  const [logsPage, setLogsPage] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsHasMore, setLogsHasMore] = useState(true);
  const [logsStartDate, setLogsStartDate] = useState('');
  const [logsEndDate, setLogsEndDate] = useState('');
  const [logsStartPickerValue, setLogsStartPickerValue] = useState(new Date());
  const [logsStartPickerOpen, setLogsStartPickerOpen] = useState(false);
  const [logsEndPickerValue, setLogsEndPickerValue] = useState(new Date());
  const [logsEndPickerOpen, setLogsEndPickerOpen] = useState(false);
  const historyListRef = useRef<FlatList<ApprovalRecord>>(null);

  const logsPageSize = 10;

  const isoDay = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const canManage = ['admin', 'staff'].includes(profile?.role ?? '');

  const fetchHistory = async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('users')
        .select('id, name, phone, is_verified, updated_at')
        .eq('role', 'driver')
        .eq('is_verified', true);

      if (startDate) {
        query = query.gte('updated_at', `${startDate}T00:00:00.000Z`);
      }

      if (endDate) {
        query = query.lte('updated_at', `${endDate}T23:59:59.999Z`);
      }

      const { data, error: fetchError } = await query.order('updated_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setRecords((data ?? []) as ApprovalRecord[]);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to fetch approval history.');
    }
    setLoading(false);
  };

  const fetchActionLogs = async (
    { reset, filter }: { reset?: boolean; filter?: typeof actionFilter } = {}
  ) => {
    if (!canManage) return;
    setLogsError(null);
    setLogsLoading(true);
    try {
      const page = reset ? 0 : logsPage;
      const effectiveFilter = filter ?? actionFilter;
      let query = supabase
        .from('admin_action_logs')
        .select(
          'id, action_type, created_at, metadata, admin_user:users!admin_id(name), target_user:users!target_user_id(name)'
        )
        .order('created_at', { ascending: false });

      if (effectiveFilter !== 'all') {
        query = query.eq('action_type', effectiveFilter);
      }

      if (logsStartDate) {
        query = query.gte('created_at', `${logsStartDate}T00:00:00.000Z`);
      }

      if (logsEndDate) {
        query = query.lte('created_at', `${logsEndDate}T23:59:59.999Z`);
      }

      const { data, error: fetchError } = await query.range(
        page * logsPageSize,
        page * logsPageSize + logsPageSize - 1
      );

      if (fetchError) {
        setLogsError(fetchError.message);
      } else {
        const nextLogs = (data ?? []) as ActionLog[];
        setActionLogs((prev) => (reset ? nextLogs : [...prev, ...nextLogs]));
        setLogsHasMore(nextLogs.length === logsPageSize);
        setLogsPage(reset ? 1 : page + 1);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLogsError(message || 'Failed to fetch action logs.');
    }
    setLogsLoading(false);
  };

  useEffect(() => {
    fetchHistory();
    fetchActionLogs({ reset: true });
  }, [canManage]);

  const createActionLogsCsv = async () => {
    let query = supabase
      .from('admin_action_logs')
      .select('id, action_type, created_at, metadata, admin_user:users!admin_id(name), target_user:users!target_user_id(name)')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (actionFilter !== 'all') {
      query = query.eq('action_type', actionFilter);
    }

    if (logsStartDate) {
      query = query.gte('created_at', `${logsStartDate}T00:00:00.000Z`);
    }

    if (logsEndDate) {
      query = query.lte('created_at', `${logsEndDate}T23:59:59.999Z`);
    }

    const { data, error: fetchError } = await query;
    if (fetchError) {
      setLogsError(fetchError.message);
      return;
    }

    const headers = ['action_type', 'admin_name', 'target_name', 'created_at', 'metadata'];
    const rows = (data ?? []).map((log: any) => [
      log.action_type ?? '',
      log.admin_user?.[0]?.name ?? '',
      log.target_user?.[0]?.name ?? '',
      log.created_at ? formatDateTimeDDMMYYYY(log.created_at) : '',
      log.metadata ? JSON.stringify(log.metadata) : '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  };

  const exportActionLogsCsv = async () => {
    try {
      const csv = await createActionLogsCsv();
      if (!csv) return;
      const fileName = `admin-action-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      const content = `\uFEFF${csv}`;
      if (Platform.OS === 'web') {
        if (typeof document === 'undefined') return;
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return;
      }
      // Native: write to temp file then save to public Downloads folder
      const baseDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
      const tempUri = `${baseDir}${fileName}`;
      await FileSystem.writeAsStringAsync(tempUri, content, { encoding: 'utf8' as any });
      const nativePdfDownloader = NativeModules.PdfDownload as { saveToDownloads(src: string, name: string, type?: string): Promise<string> } | undefined;
      if (Platform.OS === 'android' && nativePdfDownloader) {
        await nativePdfDownloader.saveToDownloads(tempUri, fileName, 'text/csv');
        ToastAndroid.show('Downloaded successfully.', ToastAndroid.LONG);
      } else {
        const destination = `${(FileSystem as any).documentDirectory || baseDir}${fileName}`;
        if (destination !== tempUri) await FileSystem.copyAsync({ from: tempUri, to: destination });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLogsError(message || 'Failed to export action logs.');
    }
  };

  const renderDateField = (
    value: string,
    onChange: (v: string) => void,
    pickerValue: Date,
    setPickerValue: (d: Date) => void,
    pickerOpen: boolean,
    setPickerOpen: (v: boolean) => void,
    placeholder: string
  ) => {
    if (Platform.OS === 'web') {
      return (
        <YStack
          backgroundColor={theme.bgCardSecondary}
          borderColor={theme.border}
          borderWidth={1}
          borderRadius={10}
          paddingHorizontal={12}
          paddingVertical={10}
          minWidth={170}
          flexGrow={1}
          flexBasis={170}>
          <input
            value={value}
            onChange={(e) => onChange((e.target as any).value)}
            type="date"
            placeholder={placeholder}
            className="admin-date-input"
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              color: theme.inputText,
              outline: 'none',
            }}
          />
        </YStack>
      );
    }
    return (
      <Pressable
        onPress={() => {
          setPickerValue(value ? new Date(`${value}T00:00:00.000Z`) : new Date());
          setPickerOpen(true);
        }}
        style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
        <Input
          value={value}
          editable={false}
          pointerEvents="none"
          placeholder={placeholder}
          backgroundColor={theme.bgCardSecondary}
          borderColor={theme.border}
          color={theme.inputText}
        />
      </Pressable>
    );
  };

  return (
    <YStack flex={1} backgroundColor={theme.bg} padding={24} gap="$4">
      {Platform.OS === 'web' ? (
        <style>{`
          .admin-date-input::placeholder { color: #9CA3AF; opacity: 1; }
        `}</style>
      ) : null}
      <XStack justifyContent="space-between" alignItems="center">
        <YStack gap="$1">
          <XStack alignItems="center" gap="$2"><Button size="$2" chromeless onPress={() => router.back()} color={theme.text}>←</Button><Text color={theme.accent} fontSize={t(12)} letterSpacing={2} textTransform="uppercase">Admin</Text></XStack>
          <H2 color={theme.text}>Approval history</H2>
          <Paragraph color={theme.textMuted}>See who approved drivers and when.</Paragraph>
        </YStack>
        <Button
          size="$2"
          backgroundColor={theme.bgCard}
          color={theme.textSecondary}
          borderRadius={10}
          onPress={() => {
            fetchHistory();
            fetchActionLogs({ reset: true });
          }}>
          Refresh
        </Button>
      </XStack>

      <XStack gap="$2" flexWrap="wrap" alignItems="center">
        {renderDateField(startDate, setStartDate, startPickerValue, setStartPickerValue, startPickerOpen, setStartPickerOpen, 'Start date')}
        {renderDateField(endDate, setEndDate, endPickerValue, setEndPickerValue, endPickerOpen, setEndPickerOpen, 'End date')}
        <Button
          size="$2"
          backgroundColor={theme.accent}
          color={'#FFFFFF'}
          borderRadius={10}
          onPress={fetchHistory}>
          Apply
        </Button>
        <Button
          size="$2"
          backgroundColor={theme.bgCard}
          color={theme.textSecondary}
          borderRadius={10}
          onPress={() => {
            setStartDate('');
            setEndDate('');
            fetchHistory();
          }}>
          Clear
        </Button>
      </XStack>
      <MobileDatePicker value={startPickerValue} open={startPickerOpen} onClose={() => setStartPickerOpen(false)} onChange={(d) => { setStartDate(isoDay(d)); }} />
      <MobileDatePicker value={endPickerValue} open={endPickerOpen} onClose={() => setEndPickerOpen(false)} onChange={(d) => { setEndDate(isoDay(d)); }} />

      {!canManage ? (
        <YStack backgroundColor={theme.bgSecondary} padding={20} borderRadius={18} gap="$2" borderWidth={1} borderColor={theme.border}>
          <Text color={theme.text} fontWeight="700">Admin access only</Text>
          <Text color={theme.textMuted} fontSize={t(12)}>
            You do not have permission to view approvals.
          </Text>
        </YStack>
      ) : (
        <>
          {loading ? <Text color={theme.textMuted}>Loading...</Text> : null}
          {error ? <Text color="#FCA5A5">{error}</Text> : null}
          <FlatList
            ref={historyListRef}
            data={records}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 12, paddingBottom: 64 }}
            ListFooterComponent={
              <YStack gap="$3" marginTop={12}>
                <Text color={theme.text} fontWeight="700">Admin action logs</Text>
                <XStack gap="$2" flexWrap="wrap" alignItems="center">
                  {renderDateField(logsStartDate, setLogsStartDate, logsStartPickerValue, setLogsStartPickerValue, logsStartPickerOpen, setLogsStartPickerOpen, 'Log start')}
                  {renderDateField(logsEndDate, setLogsEndDate, logsEndPickerValue, setLogsEndPickerValue, logsEndPickerOpen, setLogsEndPickerOpen, 'Log end')}
                  <Button
                    size="$2"
                    backgroundColor={theme.accent}
                    color={'#FFFFFF'}
                    borderRadius={10}
                    onPress={() => fetchActionLogs({ reset: true })}>
                    Apply
                  </Button>
                  <Button
                    size="$2"
                    backgroundColor={theme.bgCard}
                    color={theme.textSecondary}
                    borderRadius={10}
                    onPress={() => {
                      setLogsStartDate('');
                      setLogsEndDate('');
                      fetchActionLogs({ reset: true });
                    }}>
                    Clear
                  </Button>
                  <Button
                    size="$2"
                    backgroundColor={theme.bgCard}
                    color={theme.text}
                    borderRadius={10}
                    onPress={exportActionLogsCsv}>
                    Export CSV
                  </Button>
                </XStack>
                <MobileDatePicker value={logsStartPickerValue} open={logsStartPickerOpen} onClose={() => setLogsStartPickerOpen(false)} onChange={(d) => { setLogsStartDate(isoDay(d)); }} />
                <MobileDatePicker value={logsEndPickerValue} open={logsEndPickerOpen} onClose={() => setLogsEndPickerOpen(false)} onChange={(d) => { setLogsEndDate(isoDay(d)); }} />
                <XStack gap="$2" flexWrap="wrap">
                  {[{ label: 'All', value: 'all' }, { label: 'Driver status updates', value: 'driver_status_update' }].map(
                    (filter) => (
                      <Button
                        key={filter.value}
                        size="$2"
                        backgroundColor={actionFilter === filter.value ? theme.accent : theme.bgCard}
                        color={actionFilter === filter.value ? '#FFFFFF' : theme.textSecondary}
                        borderRadius={999}
                        onPress={() => {
                          setActionFilter(filter.value as typeof actionFilter);
                          fetchActionLogs({ reset: true, filter: filter.value as any });
                        }}>
                        {filter.label}
                      </Button>
                    )
                  )}
                </XStack>

                {logsError ? <Text color="#FCA5A5">{logsError}</Text> : null}
                {logsLoading ? <Text color={theme.textMuted}>Loading logs...</Text> : null}

                {!actionLogs.length && !logsLoading ? (
                  <Text color={theme.textMuted} fontSize={t(12)}>No action logs yet.</Text>
                ) : (
                  actionLogs.map((log) => (
                    <YStack key={log.id} backgroundColor={theme.bgCard} borderRadius={16} padding={14} gap="$1" borderWidth={1} borderColor={theme.border}>
                      <Text color={theme.text} fontSize={t(12)} fontWeight="600">
                        {log.action_type ?? 'action'}
                      </Text>
                      <Text color={theme.textMuted} fontSize={t(11)}>
                        {formatDateTimeDDMMYYYY(log.created_at)}
                      </Text>
                    </YStack>
                  ))
                )}

                {logsHasMore ? (
                  <Button
                    size="$2"
                    backgroundColor={theme.bgCard}
                    color={theme.textSecondary}
                    borderRadius={10}
                    onPress={() => fetchActionLogs()}>
                    Load more
                  </Button>
                ) : null}
                <EndOfResults theme={theme} onUp={() => historyListRef.current?.scrollToOffset({ offset: 0, animated: true })} />
              </YStack>
            }
            renderItem={({ item }) => (
              <YStack backgroundColor={theme.bgCard} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={theme.border}>
                <Text color={theme.text} fontWeight="700" fontSize={t(14)}>
                  {item.name ?? 'Driver'}
                </Text>
                <XStack gap={4} alignItems="center">
                  <Text color="#FFFFFF" fontWeight="800" fontSize={t(12)}>Phone:</Text>
                  {item.phone ? (
                    <Pressable onPress={() => Linking.openURL(`tel:${item.phone}`)}>  
                      <Text color="#3B82F6" fontWeight="700" fontSize={t(12)} style={{ textDecorationLine: 'underline' }}>{item.phone}</Text>
                    </Pressable>
                  ) : <Text color={theme.textMuted} fontSize={t(12)}>—</Text>}
                </XStack>
                <Text color={theme.textMuted} fontSize={t(12)}>
                  Approved: {formatDateTimeDDMMYYYY(item.updated_at)}
                </Text>
              </YStack>
            )}
          />
        </>
      )}
    </YStack>
  );
}
