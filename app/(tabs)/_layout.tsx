import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session, profile, refreshProfile } = useSession();
  const role = (profile?.role ?? (session?.user?.user_metadata as any)?.role ?? 'customer').toString().trim().toLowerCase();
  const providerSubtype = String((session?.user?.user_metadata as any)?.provider_subtype ?? '')
    .trim()
    .toLowerCase();
  const { width: screenWidth } = useWindowDimensions();
  const isMobile = screenWidth <= 768;

  const canSeeDriver = ['driver', 'staff', 'admin'].includes(role);
  const canSeeAdmin = ['admin', 'staff'].includes(role);
  const canSeeBookings = !['driver', 'provider'].includes(role);

  const canSeeProperties = role === 'provider' && providerSubtype === 'property_owner';
  const canSeeHomeService = role === 'provider' && providerSubtype === 'home_service';

  useEffect(() => {
    if (!session?.user?.id) return;
    void refreshProfile();
  }, [refreshProfile, session?.user?.id]);

  return (
    <Tabs
      key={`tabs-${role}-${session?.user?.id ?? 'guest'}`}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: (Platform.OS === 'web' || isMobile) ? { display: 'none' } : undefined,
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
          href: Platform.OS === 'web' ? undefined : (canSeeBookings ? undefined : null),
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
        key="tab-properties"
        name="properties"
        options={{
          href: Platform.OS === 'web' ? undefined : (canSeeProperties ? undefined : null),
          title: 'Properties',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="building.2.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        key="tab-home-service"
        name="home-service"
        options={{
          href: Platform.OS === 'web' ? undefined : (canSeeHomeService ? undefined : null),
          title: 'Home Service',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="wrench.and.screwdriver.fill" color={color} />,
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
          href: Platform.OS === 'web' ? undefined : (canSeeDriver ? undefined : null),
          title: 'Driver',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="steeringwheel" color={color} />,
        }}
      />

      <Tabs.Screen
        key="tab-admin"
        name="admin"
        options={{
          href: Platform.OS === 'web' ? undefined : (canSeeAdmin ? undefined : null),
          title: 'Admin',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
