export function getDashboardRoute(role?: string | null, providerSubtype?: string | null, platform: 'web' | 'native' = 'native') {
  const normalizedRole = String(role ?? '').trim().toLowerCase();
  const normalizedSubtype = String(providerSubtype ?? '').trim().toLowerCase();

  if (normalizedRole === 'admin' || normalizedRole === 'staff') {
    return platform === 'web' ? '/admin' : '/(tabs)/admin';
  }

  if (normalizedRole === 'driver') {
    return platform === 'web' ? '/driver' : '/(tabs)/driver';
  }

  if (normalizedRole === 'provider') {
    if (normalizedSubtype === 'property_owner') {
      return platform === 'web' ? '/properties' : '/(tabs)/properties';
    }
    if (normalizedSubtype === 'home_service') {
      return platform === 'web' ? '/home-services/request' : '/(tabs)/home-service';
    }
    return platform === 'web' ? '/home' : '/(tabs)';
  }

  if (normalizedRole === 'customer') {
    return '/home';
  }

  return '/home';
}
