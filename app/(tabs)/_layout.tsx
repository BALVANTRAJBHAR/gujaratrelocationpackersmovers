import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session, profile, refreshProfile } = useSession();
  const role = (profile?.role ?? 'customer').toString().trim().toLowerCase();
  const canSeeDriver = ['driver', 'staff', 'admin'].includes(role);
  const canSeeAdmin = ['admin', 'staff'].includes(role);
  const canSeeBookings = role !== 'driver';

  useEffect(() => {
    if (!session?.user?.id) return;
    void refreshProfile();
  }, [refreshProfile, session?.user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalError = console.error;
    console.error = (...args: any[]) => {
      try {
        const first = args[0];
        const msg = typeof first === 'string' ? first : '';
        if (msg.includes('6000ms timeout exceeded')) {
          return;
        }
      } catch {
        // ignore
      }
      originalError(...args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  return (
    <Tabs
      key={`tabs-${role}-${session?.user?.id ?? 'guest'}`}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        key="tab-index"
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        key="tab-bookings"
        name="bookings"
        options={{
          href: canSeeBookings ? undefined : null,
          title: 'Bookings',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        key="tab-tracking"
        name="tracking"
        options={{
          title: 'Tracking',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="location.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        key="tab-explore-hidden"
        name="explore"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        key="tab-admin-history-hidden"
        name="admin-history"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        key="tab-driver"
        name="driver"
        options={{
          href: canSeeDriver ? undefined : null,
          title: 'Driver',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="steeringwheel" color={color} />,
        }}
      />

      <Tabs.Screen
        key="tab-admin"
        name="admin"
        options={{
          href: canSeeAdmin ? undefined : null,
          title: 'Admin',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
