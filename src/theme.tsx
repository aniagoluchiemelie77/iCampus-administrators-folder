import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

// Brand colours carried over from the iCampus app (src/assets/styles/colors.ts).
export const PRIMARY_COLOR = '#f54b02';
export const PRIMARY_COLOR_TINT = '#f4a887';
export const PRIMARY_COLOR_TINT_MAIN = '#f0d2c4';

export const TIER_COLORS: Record<string, string> = {
  pro: '#f54b02',
  premium: '#93370f',
  enterprise: '#f5770a',
};

const severity = {
  criticalSeverity: '#fa0000',
  highSeverity: '#f93535',
  mediumSeverity: '#fb6464',
  lowSeverity: '#f9a0a0',
};

const lightPalette = {
  ...severity,
  background: '#FFFFFF',
  backgroundSecondary: '#faf9f5',
  text: '#333333',
  textDarker: '#222222',
  success: '#4CAF50',
  pendingDelivery: '#FF9800',
  primary: PRIMARY_COLOR,
  primaryTint: PRIMARY_COLOR_TINT,
  border: PRIMARY_COLOR_TINT,
  inputTextHolder: PRIMARY_COLOR_TINT,
  btnColor: PRIMARY_COLOR,
  btnTextColor: '#fff',
  unread: '#fadccc',
  loginBackground: '#f8f0eb',
  loginCard: '#fff',
  loginPatternOpacity: 1,
};

const darkPalette: typeof lightPalette = {
  ...severity,
  background: '#111',
  backgroundSecondary: '#222',
  text: PRIMARY_COLOR_TINT_MAIN,
  textDarker: PRIMARY_COLOR_TINT_MAIN,
  success: '#4CAF50',
  pendingDelivery: '#FF9800',
  primary: PRIMARY_COLOR,
  primaryTint: PRIMARY_COLOR_TINT,
  border: PRIMARY_COLOR_TINT_MAIN,
  inputTextHolder: PRIMARY_COLOR_TINT_MAIN,
  btnColor: PRIMARY_COLOR,
  btnTextColor: '#fff',
  unread: '#3a2418',
  loginBackground: '#111',
  loginCard: '#222',
  // The brand tints are bright on near-black, so the pattern is kept subtle.
  loginPatternOpacity: 0.18,
};

export type Colors = typeof lightPalette;

// Administrators have no stored theme preference, so like the iCampus app's
// 'system' mode this follows the browser/device colour scheme.
export const useColors = (): Colors =>
  useColorScheme() === 'dark' ? darkPalette : lightPalette;

/** Builds a theme-aware stylesheet hook: `const useStyles = makeStyles(c => StyleSheet.create({...}))`. */
export const makeStyles = <T,>(factory: (colors: Colors) => T) => () => {
  const colors = useColors();
  return useMemo(() => factory(colors), [colors]);
};
