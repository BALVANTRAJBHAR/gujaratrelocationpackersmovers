import * as FileSystem from 'expo-file-system';
import React, { useEffect, useState } from 'react';
import { FlatList, Share } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

type ApprovalRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  driver_status: string | null;
  driver_verified: boolean | null;
  approved_at: string | null;
};

type ActionLog = {
  id: string;
  action_type: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
  admin_user?: { name: string | null }[] | null;
  target_user?: { name: string | null }[] | null;
};

export default function AdminHistoryScreen() {
  const { profile } = useSession();
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<'all' | 'driver_status_update'>('all');
  const [logsPage, setLogsPage] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsHasMore, setLogsHasMore] = useState(true);
  const [logsStartDate, setLogsStartDate] = useState('');
  const [logsEndDate, setLogsEndDate] = useState('');

  const logsPageSize = 10;

  const canManage = ['admin', 'staff'].includes(profile?.role ?? '');

  const fetchHistory = async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    let query = supabase
      .from('users')
      .select('id, name, phone, driver_status, driver_verified, approved_at')
      .eq('role', 'driver')
      .not('approved_at', 'is', null);

    if (startDate) {
      query = query.gte('approved_at', `${startDate}T00:00:00.000Z`);
    }

    if (endDate) {
      query = query.lte('approved_at', `${endDate}T23:59:59.999Z`);
    }

    const { data, error: fetchError } = await query.order('approved_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setRecords((data ?? []) as ApprovalRecord[]);
    }
    setLoading(false);
  };

  const fetchActionLogs = async (
    { reset, filter }: { reset?: boolean; filter?: typeof actionFilter } = {}
  ) => {
    if (!canManage) return;
    setLogsError(null);
    setLogsLoading(true);
    const page = reset ? 0 : logsPage;
    const effectiveFilter = filter ?? actionFilter;
    let query = supabase
      .from('admin_action_logs')
      .select('id, action_type, created_at, metadata, admin_user:users!admin_id(name), target_user:users!target_user_id(name)')
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
    const rows = (data ?? []).map((log) => [
      log.action_type ?? '',
      log.admin_user?.[0]?.name ?? '',
      log.target_user?.[0]?.name ?? '',
      log.created_at ?? '',
      log.metadata ? JSON.stringify(log.metadata) : '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const baseDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    const uri = `${baseDir}admin-action-logs-${Date.now()}.csv`;
    await FileSystem.writeAsStringAsync(uri, csv, { encoding: 'utf8' as any });
    return uri;
  };

  const exportActionLogsCsv = async () => {
    const uri = await createActionLogsCsv();
    if (!uri) return;
    await Share.share({ url: uri, title: 'Admin action logs' });
  };

  return (
    <YStack flex={1} backgroundColor="#0B0B12" padding={24} gap="$4">
      <XStack justifyContent="space-between" alignItems="center">
        <YStack gap="$1">
          <Text color="#F97316" fontSize={12} letterSpacing={2} textTransform="uppercase">
            Admin
          </Text>
          <H2 color="#F9FAFB">Approval history</H2>
          <Paragraph color="#9CA3AF">See who approved drivers and when.</Paragraph>
        </YStack>
        <Button
          size="$2"
          backgroundColor="#111827"
          color="#E5E7EB"
          borderRadius={10}
          onPress={() => {
            fetchHistory();
            fetchActionLogs({ reset: true });
          }}>
          Refresh
        </Button>
      </XStack>

      <XStack gap="$2" flexWrap="wrap" alignItems="center">
        <YStack gap="$1">
          <Text color="#94A3B8" fontSize={11}>Start date (YYYY-MM-DD)</Text>
          <Input
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2024-01-01"
            backgroundColor="#111827"
            borderColor="#1F2937"
            color="#E5E7EB"
            width={160}
          />
        </YStack>
        <YStack gap="$1">
          <Text color="#94A3B8" fontSize={11}>End date (YYYY-MM-DD)</Text>
          <Input
            value={endDate}
            onChangeText={setEndDate}
            placeholder="2024-12-31"
            backgroundColor="#111827"
            borderColor="#1F2937"
            color="#E5E7EB"
            width={160}
          />
        </YStack>
        <Button
          size="$2"
          backgroundColor="#F97316"
          color="#0B0B12"
          borderRadius={10}
          onPress={fetchHistory}>
          Apply
        </Button>
        <Button
          size="$2"
          backgroundColor="#111827"
          color="#E5E7EB"
          borderRadius={10}
          onPress={() => {
            setStartDate('');
            setEndDate('');
            fetchHistory();
          }}>
          Clear
        </Button>
      </XStack>

      {!canManage ? (
        <YStack backgroundColor="#111827" padding={20} borderRadius={18} gap="$2">
          <Text color="#F9FAFB" fontWeight="700">Admin access only</Text>
          <Text color="#94A3B8" fontSize={12}>
            You do not have permission to view approvals.
          </Text>
        </YStack>
      ) : (
        <>
          {loading ? <Text color="#94A3B8">Loading...</Text> : null}
          {error ? <Text color="#FCA5A5">{error}</Text> : null}
          <FlatList
            data={records}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 12, paddingBottom: 32 }}
            ListFooterComponent={
              <YStack gap="$3" marginTop={12}>
                <Text color="#F9FAFB" fontWeight="700">Admin action logs</Text>
                <XStack gap="$2" flexWrap="wrap" alignItems="center">
                  <YStack gap="$1">
                    <Text color="#94A3B8" fontSize={11}>Log start (YYYY-MM-DD)</Text>
                    <Input
                      value={logsStartDate}
                      onChangeText={setLogsStartDate}
                      placeholder="2024-01-01"
                      backgroundColor="#111827"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      width={150}
                    />
                  </YStack>
                  <YStack gap="$1">
                    <Text color="#94A3B8" fontSize={11}>Log end (YYYY-MM-DD)</Text>
                    <Input
                      value={logsEndDate}
                      onChangeText={setLogsEndDate}
                      placeholder="2024-12-31"
                      backgroundColor="#111827"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      width={150}
                    />
                  </YStack>
                  <Button
                    size="$2"
                    backgroundColor="#F97316"
                    color="#0B0B12"
                    borderRadius={10}
                    onPress={() => fetchActionLogs({ reset: true })}>
                    Apply
                  </Button>
                  <Button
                    size="$2"
                    backgroundColor="#111827"
                    color="#E5E7EB"
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
                    backgroundColor="#0F172A"
                    color="#E5E7EB"
                    borderRadius={10}
                    onPress={exportActionLogsCsv}>
                    Export CSV
                  </Button>
                </XStack>
                <XStack gap="$2" flexWrap="wrap">
                  {[{ label: 'All', value: 'all' }, { label: 'Driver status', value: 'driver_status_update' }].map(
                    (filter) => (
                      <Button
                        key={filter.value}
                        size="$2"
                        backgroundColor={actionFilter === filter.value ? '#F97316' : '#111827'}
                        color={actionFilter === filter.value ? '#0B0B12' : '#E5E7EB'}
                        borderRadius={999}
                        onPress={() => {
                          setActionFilter(filter.value as typeof actionFilter);
                          setLogsPage(0);
                          fetchActionLogs({ reset: true, filter: filter.value as typeof actionFilter });
                        }}>
                        {filter.label}
                      </Button>
                    )
                  )}
                </XStack>
                {logsError ? <Text color="#FCA5A5">{logsError}</Text> : null}
                {!actionLogs.length ? (
                  <Text color="#6B7280" fontSize={12}>No action logs yet.</Text>
                ) : (
                  actionLogs.map((log) => (
                    <YStack key={log.id} backgroundColor="#111827" borderRadius={16} padding={14} gap="$1">
                      <Text color="#E5E7EB" fontSize={12} fontWeight="600">
                        {log.action_type ?? 'action'}
                      </Text>
                      <Text color="#94A3B8" fontSize={11}>
                        By: {log.admin_user?.[0]?.name ?? '—'} → {log.target_user?.[0]?.name ?? '—'}
                      </Text>
                      <Text color="#6B7280" fontSize={11}>
                        {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                      </Text>
                      {log.metadata ? (
                        <Text color="#6B7280" fontSize={11}>
                          {JSON.stringify(log.metadata)}
                        </Text>
                      ) : null}
                    </YStack>
                  ))
                )}
                {logsLoading ? <Text color="#94A3B8">Loading logs...</Text> : null}
                {logsHasMore ? (
                  <Button
                    size="$2"
                    backgroundColor="#111827"
                    color="#E5E7EB"
                    borderRadius={10}
                    onPress={() => fetchActionLogs()}>
                    Load more
                  </Button>
                ) : (
                  <Text color="#6B7280" fontSize={12}>End of logs.</Text>
                )}
              </YStack>
            }
            renderItem={({ item }) => (
              <YStack backgroundColor="#111827" borderRadius={18} padding={16} gap="$2">
                <Text color="#F9FAFB" fontWeight="700" fontSize={14}>
                  {item.name ?? 'Driver'}
                </Text>
                <Text color="#94A3B8" fontSize={12}>Phone: {item.phone ?? '—'}</Text>
                <Text color="#94A3B8" fontSize={12}>
                  Approved: {item.approved_at ? new Date(item.approved_at).toLocaleString() : '—'}
                </Text>
              </YStack>
            )}
          />
        </>
      )}
    </YStack>
  );
}
