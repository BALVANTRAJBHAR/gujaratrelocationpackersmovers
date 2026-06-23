import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const themes = {
  light: {
    bg: '#FFFFFF',
    bgSecondary: '#F8F9FA',
    bgCard: '#FFFFFF',
    bgCardSecondary: '#F3F4F6',
    text: '#1A1A1A',
    textSecondary: '#4A5568',
    textMuted: '#718096',
    primary: '#4F46E5',
    primaryHover: '#4338CA',
    accent: '#F59E0B',
    accentHover: '#D97706',
    border: '#E2E8F0',
    shadow: 'rgba(0, 0, 0, 0.08)',
    couponBg: '#DCFCE7',
    couponBorder: '#22C55E',
    couponText: '#166534',
    menuBg: '#4F46E5',
    menuText: '#FFFFFF',
    gradient1: '#EEF2FF',
    gradient2: '#E0E7FF',
    headerBg: '#FFFFFF',
    inputBg: '#FFFFFF',
    inputBorder: '#E2E8F0',
    inputText: '#1A1A1A',
    danger: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
    info: '#3B82F6',
  },
  dark: {
    bg: '#0F172A',
    bgSecondary: '#1E293B',
    bgCard: '#1E293B',
    bgCardSecondary: '#334155',
    text: '#F1F5F9',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    primary: '#6366F1',
    primaryHover: '#818CF8',
    accent: '#F59E0B',
    accentHover: '#FBBF24',
    border: '#334155',
    shadow: 'rgba(0, 0, 0, 0.3)',
    couponBg: '#065F46',
    couponBorder: '#10B981',
    couponText: '#D1FAE5',
    menuBg: '#1E293B',
    menuText: '#F1F5F9',
    gradient1: '#1E293B',
    gradient2: '#334155',
    headerBg: '#1E293B',
    inputBg: '#1E293B',
    inputBorder: '#475569',
    inputText: '#F1F5F9',
    danger: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
    info: '#3B82F6',
  },
};

export type ThemeColors = (typeof themes)['light'];

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'Times New Roman',
  },
  default: {
    sans: 'Times New Roman',
    serif: 'Times New Roman',
    rounded: 'Times New Roman',
    mono: 'Times New Roman',
  },
  web: {
    sans: "'Times New Roman', Times, serif",
    serif: "'Times New Roman', Times, serif",
    rounded: "'Times New Roman', Times, serif",
    mono: "'Times New Roman', Times, serif",
  },
});
