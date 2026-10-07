import type { CSSProperties } from 'react';
import type { StoreVisualTheme, StoreVisualThemePreset } from '../types';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MIN_RADIUS = 8;
const MAX_RADIUS = 32;

export const STORE_VISUAL_THEME_PRESETS: Record<Exclude<StoreVisualThemePreset, 'custom'>, StoreVisualTheme> = {
  foodweb: {
    preset: 'foodweb', primaryColor: '#17633D', accentColor: '#A94726', highlightColor: '#CC8618',
    backgroundColor: '#FAF9F6', surfaceColor: '#FFFFFF', textColor: '#18231D', mutedColor: '#6F746F', borderColor: '#E8E3DC', radius: 18,
  },
  doce_lua: {
    preset: 'doce_lua', primaryColor: '#542114', accentColor: '#C97952', highlightColor: '#C98A38',
    backgroundColor: '#FFF7EF', surfaceColor: '#FFFFFF', textColor: '#32110C', mutedColor: '#7C6259', borderColor: '#EFD9C9', radius: 20,
  },
};

export const DEFAULT_STORE_VISUAL_THEME = STORE_VISUAL_THEME_PRESETS.foodweb;

const safeColor = (value: unknown, fallback: string) => typeof value === 'string' && HEX_COLOR.test(value) ? value.toUpperCase() : fallback;

export const normalizeStoreVisualTheme = (value: unknown): StoreVisualTheme => {
  const input = value && typeof value === 'object' ? value as Partial<StoreVisualTheme> : {};
  const preset: StoreVisualThemePreset = input.preset === 'doce_lua' || input.preset === 'custom' || input.preset === 'foodweb' ? input.preset : 'foodweb';
  const fallback = preset === 'doce_lua' ? STORE_VISUAL_THEME_PRESETS.doce_lua : DEFAULT_STORE_VISUAL_THEME;
  const radius = Number(input.radius);
  return {
    preset,
    primaryColor: safeColor(input.primaryColor, fallback.primaryColor),
    accentColor: safeColor(input.accentColor, fallback.accentColor),
    highlightColor: safeColor(input.highlightColor, fallback.highlightColor),
    backgroundColor: safeColor(input.backgroundColor, fallback.backgroundColor),
    surfaceColor: safeColor(input.surfaceColor, fallback.surfaceColor),
    textColor: safeColor(input.textColor, fallback.textColor),
    mutedColor: safeColor(input.mutedColor, fallback.mutedColor),
    borderColor: safeColor(input.borderColor, fallback.borderColor),
    radius: Number.isInteger(radius) ? Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius)) : fallback.radius,
  };
};

export const isStoreVisualColor = (value: string) => HEX_COLOR.test(value);

export const getStorefrontThemeStyle = (theme: StoreVisualTheme): CSSProperties => {
  const safe = normalizeStoreVisualTheme(theme);
  return {
    '--food-store-primary': safe.primaryColor,
    '--food-store-accent': safe.accentColor,
    '--food-store-highlight': safe.highlightColor,
    '--food-store-background': safe.backgroundColor,
    '--food-store-surface': safe.surfaceColor,
    '--food-store-text': safe.textColor,
    '--food-store-muted': safe.mutedColor,
    '--food-store-border': safe.borderColor,
    '--food-store-radius': `${safe.radius}px`,
  } as CSSProperties;
};
