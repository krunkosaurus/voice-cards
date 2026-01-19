// lib/constants.ts - Color constants and theme tokens

import type { CardColor } from '@/types';

export const CARD_COLORS: Record<CardColor, { hex: string; name: string }> = {
  neutral: { hex: '#6B7280', name: 'Gray' },
  red: { hex: '#EF4444', name: 'Red' },
  orange: { hex: '#F97316', name: 'Orange' },
  yellow: { hex: '#EAB308', name: 'Yellow' },
  green: { hex: '#22C55E', name: 'Green' },
  blue: { hex: '#3B82F6', name: 'Blue' },
  purple: { hex: '#8B5CF6', name: 'Purple' },
  pink: { hex: '#EC4899', name: 'Pink' },
} as const;

export const THEME_TOKENS = {
  light: {
    bgPrimary: '#FAF8F3',
    bgSurface: '#FEFDFB',
    bgElevated: '#FFFFFF',
    textPrimary: '#2D2520',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    border: '#E2D5C8',
    accent: '#D97642',
    accentHover: '#C5642F',
    destructive: '#8B4049',
  },
  dark: {
    bgPrimary: '#1A1512',
    bgSurface: '#2D2520',
    bgElevated: '#3A3330',
    textPrimary: '#F1EDE8',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    border: '#3A3330',
    accent: '#E89B6D',
    accentHover: '#D97642',
    destructive: '#B85A64',
  },
} as const;
