import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

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

// Every token is a 6-digit hex so screens can append an alpha suffix (`c.primary + '14'`).
const lightPalette = {
  ...severity,
  background: '#f6f4f1',
  backgroundSecondary: '#ffffff',
  surfaceRaised: '#fbf9f7',
  text: '#3a3532',
  textDarker: '#1d1a18',
  textMuted: '#857a73',
  success: '#2e9d4f',
  pendingDelivery: '#f08c00',
  info: '#2f7de1',
  primary: PRIMARY_COLOR,
  primaryTint: PRIMARY_COLOR_TINT,
  border: PRIMARY_COLOR_TINT,
  borderSubtle: '#ebe5e0',
  inputTextHolder: '#b9aca4',
  btnColor: PRIMARY_COLOR,
  btnTextColor: '#ffffff',
  unread: '#fadccc',
  loginBackground: '#f8f0eb',
  loginCard: '#ffffff',
  loginPatternOpacity: 1,
  shadow: '#5a3a28',
};

const darkPalette: typeof lightPalette = {
  ...severity,
  background: '#0e0e10',
  backgroundSecondary: '#18181b',
  surfaceRaised: '#202024',
  text: '#e9d9d1',
  textDarker: '#fbf1ec',
  textMuted: '#9d918b',
  success: '#4cc46f',
  pendingDelivery: '#ffa526',
  info: '#5d9cf0',
  primary: PRIMARY_COLOR,
  primaryTint: PRIMARY_COLOR_TINT,
  border: '#4a3c36',
  borderSubtle: '#2a2a2f',
  inputTextHolder: '#7d716b',
  btnColor: PRIMARY_COLOR,
  btnTextColor: '#ffffff',
  unread: '#3a2418',
  loginBackground: '#0e0e10',
  loginCard: '#18181b',
  // The brand tints are bright on near-black, so the pattern is kept subtle.
  loginPatternOpacity: 0.18,
  shadow: '#000000',
};

export type Colors = typeof lightPalette;
export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'icampus-admin-theme';

const readStoredMode = (): ThemeMode => {
  try {
    const value = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
};

type ThemeState = { mode: ThemeMode; scheme: 'light' | 'dark'; setMode: (mode: ThemeMode) => void; toggle: () => void };

const ThemeContext = createContext<ThemeState | null>(null);

// Lets backgrounds and borders cross-fade when the theme flips, instead of snapping.
const WEB_TRANSITION_CSS =
  '[data-theme-ready] div, [data-theme-ready] span, [data-theme-ready] input, [data-theme-ready] textarea {' +
  ' transition: background-color 280ms ease, border-color 280ms ease, color 200ms ease; }';

/** Light / dark / system theme. The choice is remembered per browser. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const scheme = mode === 'system' ? system : mode;

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked (private mode); the choice then lasts for this visit.
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.colorScheme = scheme;
    document.body.style.backgroundColor = (scheme === 'dark' ? darkPalette : lightPalette).background;
  }, [scheme]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.textContent = WEB_TRANSITION_CSS;
    document.head.appendChild(style);
    // Enabled after the first paint so the initial render doesn't animate in.
    const timer = setTimeout(() => document.documentElement.setAttribute('data-theme-ready', ''), 400);
    return () => {
      clearTimeout(timer);
      style.remove();
      document.documentElement.removeAttribute('data-theme-ready');
    };
  }, []);

  const value = useMemo(
    () => ({ mode, scheme, setMode, toggle: () => setMode(scheme === 'dark' ? 'light' : 'dark') }),
    [mode, scheme, setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useThemeMode = (): ThemeState => {
  const value = useContext(ThemeContext);
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  return value ?? { mode: 'system', scheme: system, setMode: () => {}, toggle: () => {} };
};

export const useColors = (): Colors => (useThemeMode().scheme === 'dark' ? darkPalette : lightPalette);

/** Builds a theme-aware stylesheet hook: `const useStyles = makeStyles(c => StyleSheet.create({...}))`. */
export const makeStyles = <T,>(factory: (colors: Colors) => T) => () => {
  const colors = useColors();
  return useMemo(() => factory(colors), [colors]);
};
