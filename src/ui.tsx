import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ImageStyle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextStyle,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Colors, makeStyles, PRIMARY_COLOR, TIER_COLORS, useColors, useThemeMode } from './theme';
import { Icon, IconName } from './icons';
import { Logo } from './Logo';
import { useNavigation } from './context';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const formatLabel = (label: string) =>
  label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** Accepts ISO strings, epoch values and Firestore `{seconds}` timestamps. */
export const parseDate = (value: unknown): Date | null => {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const seconds = (value as any)?.seconds ?? (value as any)?._seconds;
  const date = seconds != null ? new Date(Number(seconds) * 1000) : new Date(value as any);
  return isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value: unknown, withTime = false) => {
  const date = parseDate(value);
  if (!date) return '';
  return withTime
    ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString();
};

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 hours ago", like dayjs().fromNow() in the iCampus app. */
export const fromNow = (value: unknown) => {
  const date = parseDate(value);
  if (!date) return '';
  const seconds = (date.getTime() - Date.now()) / 1000;
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormatter.format(Math.round(seconds / size), unit);
  }
  return 'just now';
};

/**
 * Counts for display: exact below 10,000, then floored with a plus so a
 * figure never overstates (10,000–999,999 → "10K+"…"999K+", 1.25M → "1.2M+").
 */
export const formatCount = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs < 10_000) return n.toLocaleString();
  if (abs < 1_000_000) return `${sign}${Math.floor(abs / 1000)}K+`;
  if (abs < 1_000_000_000) return `${sign}${Math.floor(abs / 100_000) / 10}M+`;
  return `${sign}${Math.floor(abs / 100_000_000) / 10}B+`;
};

const CURRENCY_SIGNS: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€', GHS: '₵', KES: 'KSh ', ZAR: 'R' };
export const currencySign = (currency?: string) => CURRENCY_SIGNS[String(currency || 'NGN').toUpperCase()] ?? `${currency} `;

/** "₦12,500.50", or compact ("₦12K+") once the amount reaches 10,000. */
export const formatMoney = (value: number | null | undefined, currency = 'NGN', compact = false) => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const sign = currencySign(currency);
  if (compact && Math.abs(n) >= 10_000) return `${n < 0 ? '-' : ''}${sign}${formatCount(Math.abs(n))}`;
  return `${n < 0 ? '-' : ''}${sign}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

// ---------------------------------------------------------------------------
// Buttons and inputs
// ---------------------------------------------------------------------------

/** The iCampus CustomButton: filled, shrinks slightly while pressed. */
export function Button({
  title,
  onPress,
  icon,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
  compact = false,
}: {
  title?: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'success' | 'soft';
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const colors = useColors();
  const outline = variant === 'outline';
  const soft = variant === 'soft';
  const background = outline ? 'transparent' : soft ? colors.primary + '17' : variant === 'success' ? colors.success : colors.btnColor;
  const foreground = outline || soft ? colors.primary : colors.btnTextColor;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed, hovered }: any) => [
        uiStyles.button,
        compact && uiStyles.buttonCompact,
        { backgroundColor: background, borderColor: colors.primary + '99', borderWidth: outline ? 1 : 0 },
        !outline && !soft && uiStyles.buttonRaised,
        hovered && !disabled && { opacity: 0.9 },
        { transform: [{ scale: pressed && !disabled ? 0.97 : 1 }] },
        disabled && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={compact ? 18 : 20} color={foreground} style={title ? uiStyles.buttonIcon : undefined} /> : null}
          {title ? <Text style={[uiStyles.buttonText, { color: foreground }]}>{title}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
  disabled = false,
  filled = false,
  size = 22,
  style,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  disabled?: boolean;
  /** Tinted square background instead of a bare icon. */
  filled?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const tone = color ?? colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        uiStyles.iconButton,
        filled && [uiStyles.iconButtonFilled, { backgroundColor: tone + '14' }],
        (pressed || hovered) && { backgroundColor: tone + (filled ? '26' : '14') },
        pressed && { transform: [{ scale: 0.94 }] },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <Icon name={icon} size={size} color={tone} />
    </Pressable>
  );
}

/** The iCampus InputGroup: labelled input that can be locked read-only. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  locked = false,
  icon,
  right,
  keyboardType,
  onSubmitEditing,
  style,
}: {
  label?: string;
  value: string;
  onChangeText?: (value: string) => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  locked?: boolean;
  icon?: IconName;
  right?: React.ReactNode;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'url';
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const styles = useFieldStyles();
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputRow, locked && styles.locked, multiline && styles.multilineRow]}>
        {icon ? <Icon name={icon} size={20} color={colors.primaryTint} style={styles.icon} /> : null}
        <TextInput
          accessibilityLabel={label ?? placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!locked}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor={colors.inputTextHolder}
          secureTextEntry={secureTextEntry}
          style={[styles.input, multiline && styles.multilineInput]}
          value={value}
        />
        {locked ? <Icon name="lock-outline" size={18} color={colors.primaryTint} /> : right}
      </View>
    </View>
  );
}

// Web-only: drops the browser focus ring, since the bordered row already frames the input.
export const noOutline = { outlineStyle: 'none' } as unknown as TextStyle;

const useFieldStyles = makeStyles(c =>
  StyleSheet.create({
    field: { marginBottom: 16 },
    label: { color: c.textDarker, fontSize: 13, fontWeight: '700', marginBottom: 8 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 50,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      borderRadius: 12,
      paddingHorizontal: 14,
      backgroundColor: c.background,
    },
    multilineRow: { alignItems: 'flex-start', paddingVertical: 10 },
    locked: { opacity: 0.7, backgroundColor: c.backgroundSecondary },
    icon: { marginRight: 8 },
    input: { flex: 1, minWidth: 0, color: c.textDarker, fontSize: 14, paddingVertical: 12, ...noOutline },
    multilineInput: { minHeight: 90, textAlignVertical: 'top', paddingVertical: 0 },
  }),
);

/** Replaces the iCampus app's native pickers with a row of selectable chips. */
export function OptionPicker<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label?: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hint?: string;
}) {
  const colors = useColors();
  return (
    <View style={uiStyles.picker}>
      {label ? <Text style={[uiStyles.pickerLabel, { color: colors.text }]}>{label}</Text> : null}
      {hint ? <Text style={[uiStyles.pickerHint, { color: colors.text }]}>{hint}</Text> : null}
      <View style={uiStyles.chipRow}>
        {options.map(option => {
          const active = option.value === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[
                uiStyles.chip,
                { borderColor: active ? colors.primary : colors.borderSubtle, backgroundColor: colors.backgroundSecondary },
                active && { backgroundColor: colors.primary },
              ]}
            >
              <Text style={[uiStyles.chipText, { color: active ? colors.btnTextColor : colors.text }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ToggleRow({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={uiStyles.toggleRow}>
      <Text style={[uiStyles.toggleText, { color: colors.text }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        disabled={disabled || !onChange}
        value={value}
        onValueChange={onChange}
        thumbColor="#fff"
        trackColor={{ false: colors.border, true: colors.primary }}
        {...({ activeThumbColor: '#fff' } as object)}
      />
    </View>
  );
}

/** Horizontal segmented tab strip; scrolls sideways when the tabs overflow. */
export function TabStrip<T extends string>({
  tabs,
  active,
  onChange,
  uppercase = false,
  style,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; badge?: number; icon?: IconName }>;
  active: T;
  onChange: (tab: T) => void;
  uppercase?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // flexShrink 0: on web a horizontal ScrollView shrinks by default, so a long
      // result list below it squeezed the strip down to a sliver.
      style={[uiStyles.tabStrip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.borderSubtle }, style]}
      contentContainerStyle={uiStyles.tabStripContent}
    >
      {tabs.map(tab => {
        const selected = tab.id === active;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={({ hovered }: any) => [
              uiStyles.tab,
              selected ? { backgroundColor: colors.primary } : hovered && { backgroundColor: colors.primary + '12' },
            ]}
          >
            {tab.icon ? <Icon name={tab.icon} size={17} color={selected ? colors.btnTextColor : colors.textMuted} /> : null}
            <Text style={[uiStyles.tabText, { color: selected ? colors.btnTextColor : colors.text }]}>
              {uppercase ? tab.label.toUpperCase() : tab.label}
            </Text>
            {tab.badge ? <CountBadge count={tab.badge} style={selected ? { backgroundColor: '#ffffff33' } : undefined} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Animated sun / moon switch for the light and dark themes. */
export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const colors = useColors();
  const { scheme, toggle } = useThemeMode();
  const dark = scheme === 'dark';
  const progress = useRef(new Animated.Value(dark ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(progress, { toValue: dark ? 1 : 0, useNativeDriver: false, friction: 7, tension: 90 }).start();
  }, [dark, progress]);
  const knobX = progress.interpolate({ inputRange: [0, 1], outputRange: [3, 29] });
  const spin = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const track = progress.interpolate({ inputRange: [0, 1], outputRange: ['#f9d8c8', '#34343c'] });
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: dark }}
      accessibilityLabel="Dark theme"
      onPress={toggle}
      style={({ hovered }: any) => [uiStyles.themeToggle, showLabel && uiStyles.themeToggleWide, showLabel && hovered && { backgroundColor: colors.primary + '0D' }]}
    >
      {showLabel ? (
        <View style={uiStyles.themeToggleText}>
          <Icon name={dark ? 'dark-mode' : 'light-mode'} size={20} color={colors.text} />
          <Text style={[uiStyles.themeToggleLabel, { color: colors.text }]}>{dark ? 'Dark mode' : 'Light mode'}</Text>
        </View>
      ) : null}
      <Animated.View style={[uiStyles.themeTrack, { backgroundColor: track }]}>
        <Animated.View style={[uiStyles.themeKnob, { transform: [{ translateX: knobX }, { rotate: spin }] }]}>
          <Icon name={dark ? 'nightlight-round' : 'wb-sunny'} size={14} color={dark ? '#3b3b48' : PRIMARY_COLOR} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

let shadeCount = 0;

/** Transparent-to-dark vertical fade for text laid over photos. */
export function GradientShade({ from = 0, to = 0.8, style }: { from?: number; to?: number; style?: StyleProp<ViewStyle> }) {
  const id = useRef(`shade-${++shadeCount}`).current;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={from} />
            <Stop offset="0.5" stopColor="#000" stopOpacity={from + (to - from) * 0.3} />
            <Stop offset="1" stopColor="#000" stopOpacity={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Small rounded label, e.g. a role or status. */
export function Pill({ label, color, icon, solid = false }: { label: string; color: string; icon?: IconName; solid?: boolean }) {
  return (
    <View style={[uiStyles.pill, { backgroundColor: solid ? color : color + '1A' }]}>
      {icon ? <Icon name={icon} size={13} color={solid ? '#fff' : color} /> : null}
      <Text numberOfLines={1} style={[uiStyles.pillText, { color: solid ? '#fff' : color }]}>{label}</Text>
    </View>
  );
}

export function CountBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View style={[uiStyles.countBadge, { backgroundColor: colors.btnColor }, style]}>
      <Text style={[uiStyles.countBadgeText, { color: colors.btnTextColor }]}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Header for pushed screens: back chevron, centred orange title, logo on the right. */
export function PageHeader({
  title,
  subtitle,
  right,
  back = true,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  back?: boolean;
}) {
  const colors = useColors();
  const { pop } = useNavigation();
  return (
    <View style={[uiStyles.pageHeader, { backgroundColor: colors.backgroundSecondary, borderColor: colors.borderSubtle }]}>
      <View style={uiStyles.pageHeaderSide}>
        {back ? <IconButton filled icon="arrow-back" size={20} label="Go back" onPress={pop} /> : null}
      </View>
      <View style={uiStyles.pageHeaderCenter}>
        <Text numberOfLines={1} style={[uiStyles.pageHeaderTitle, { color: colors.textDarker }]}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={[uiStyles.pageHeaderSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      <View style={[uiStyles.pageHeaderSide, uiStyles.pageHeaderRight]}>{right ?? <Logo size={38} />}</View>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View style={[uiStyles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.borderSubtle, shadowColor: colors.shadow }, style]}>
      {children}
    </View>
  );
}

/** Section title with an optional icon, subtitle and "View all" link. */
export function SectionHeader({
  title,
  subtitle,
  icon,
  onViewAll,
  right,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  onViewAll?: () => void;
  right?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={uiStyles.sectionHeader}>
      {icon ? (
        <View style={[uiStyles.sectionIcon, { backgroundColor: colors.primary + '17' }]}>
          <Icon name={icon} size={18} color={colors.primary} />
        </View>
      ) : null}
      <View style={uiStyles.sectionText}>
        <Text numberOfLines={1} style={[uiStyles.sectionTitle, { color: colors.textDarker }]}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={[uiStyles.sectionSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right}
      {onViewAll ? (
        <Pressable
          accessibilityRole="button"
          onPress={onViewAll}
          style={({ hovered }: any) => [uiStyles.viewAll, { backgroundColor: colors.primary + (hovered ? '1F' : '12') }]}
        >
          <Text style={[uiStyles.viewAllText, { color: colors.primary }]}>View all</Text>
          <Icon name="arrow-forward" size={15} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const KEY_SCROLL_STEP = 64;

/**
 * On web the page body never scrolls (the Expo reset sets overflow: hidden),
 * so the arrow keys did nothing unless the scroller itself had focus. This
 * sends ↑ ↓ PageUp PageDown Home End and Space to the page's main scroller,
 * except while typing or while a dialog is open.
 */
const useKeyboardScroll = (ref: React.RefObject<any>) => {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === ' ' && target?.closest?.('button, a, [role="button"], [role="tab"], [role="radio"], [role="switch"]')) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const node = (ref.current as any)?.getScrollableNode?.() as HTMLElement | undefined;
      if (!node?.isConnected) return;
      const page = node.clientHeight * 0.85;
      let top: number | null = null;
      switch (event.key) {
        case 'ArrowDown':
          top = node.scrollTop + KEY_SCROLL_STEP;
          break;
        case 'ArrowUp':
          top = node.scrollTop - KEY_SCROLL_STEP;
          break;
        case 'PageDown':
          top = node.scrollTop + page;
          break;
        case 'PageUp':
          top = node.scrollTop - page;
          break;
        case ' ':
          top = node.scrollTop + (event.shiftKey ? -page : page);
          break;
        case 'Home':
          top = 0;
          break;
        case 'End':
          top = node.scrollHeight;
          break;
      }
      if (top === null) return;
      event.preventDefault();
      node.scrollTo({ top, behavior: event.repeat ? 'auto' : 'smooth' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ref]);
};

/** A tab's main scroller: visible scrollbar and keyboard scrolling on web. */
export function ScrollPage({
  children,
  style,
  contentContainerStyle,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  // Typed loosely: on web the instance also has getScrollableNode().
  const ref = useRef<any>(null);
  useKeyboardScroll(ref);
  return (
    <ScrollView ref={ref} style={[uiStyles.scrollPage, style]} contentContainerStyle={contentContainerStyle} showsVerticalScrollIndicator>
      {children}
    </ScrollView>
  );
}

/** One-line row of filter chips that scrolls sideways when it overflows. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[uiStyles.filterRow, style]} contentContainerStyle={uiStyles.filterRowContent}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ hovered }: any) => [
              uiStyles.filterChip,
              {
                borderColor: active ? colors.primary : colors.borderSubtle,
                backgroundColor: active ? colors.primary + '17' : hovered ? colors.primary + '0A' : colors.backgroundSecondary,
              },
            ]}
          >
            <Text style={[uiStyles.filterChipText, { color: active ? colors.primary : colors.text }]}>{option.label}</Text>
            {option.count !== undefined ? (
              <Text style={[uiStyles.filterChipCount, { color: active ? colors.primary : colors.textMuted }]}>{option.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Slide-and-fade entrance used when a screen is pushed. */
export function ScreenTransition({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [progress]);
  return (
    <Animated.View
      style={[
        { flex: 1, opacity: progress, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function Loading({ label }: { label?: string }) {
  const colors = useColors();
  return (
    <View style={uiStyles.loading}>
      <ActivityIndicator size="small" color={colors.primary} />
      {label ? <Text style={[uiStyles.loadingText, { color: colors.text }]}>{label}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export function UserAvatar({
  profilePic,
  firstName,
  lastName,
  username,
  organizationName,
  size = 45,
  style,
}: {
  profilePic?: unknown;
  firstName?: string;
  lastName?: string;
  username?: string;
  organizationName?: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const uri = Array.isArray(profilePic) ? profilePic.at(-1) : profilePic;
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (typeof uri === 'string' && uri) {
    return <Image source={{ uri }} style={[box, style]} />;
  }
  const initials = organizationName
    ? organizationName.substring(0, 2)
    : firstName && lastName
      ? `${firstName[0]}${lastName[0]}`
      : (firstName || username || lastName || '?')[0];
  return (
    <View style={[box, uiStyles.avatarFallback, style as StyleProp<ViewStyle>]}>
      <Text style={[uiStyles.avatarText, { fontSize: Math.max(12, size * 0.32) }]}>{initials.toUpperCase()}</Text>
    </View>
  );
}

/** Name, @username, paid-tier badge and verified badge, as in the iCampus app. */
export function UserIdentity({
  firstname,
  lastname,
  username,
  tier = 'free',
  isVerified = false,
  showVerifyIcon = false,
  size = 'medium',
  isOrganization = false,
  organizationName,
}: {
  firstname?: string;
  lastname?: string;
  username?: string;
  tier?: string;
  isVerified?: boolean;
  showVerifyIcon?: boolean;
  size?: 'small' | 'medium' | 'large';
  isOrganization?: boolean;
  organizationName?: string;
}) {
  const colors = useColors();
  const iconSize = size === 'small' ? 13 : size === 'large' ? 20 : 15;
  const name = isOrganization ? organizationName : [firstname, lastname].filter(Boolean).join(' ');
  return (
    <View style={uiStyles.identity}>
      <Text
        numberOfLines={1}
        style={[
          uiStyles.identityName,
          { color: colors.text },
          size === 'small' && { fontSize: 12 },
          size === 'large' && { fontSize: 20, fontWeight: '800' },
        ]}
      >
        {name || 'iCampus user'} {username ? `@${username}` : ''}
      </Text>
      {tier !== 'free' && TIER_COLORS[tier] ? (
        <Icon name="verified" size={iconSize} color={isOrganization ? TIER_COLORS.enterprise : TIER_COLORS[tier]} style={uiStyles.identityIcon} />
      ) : null}
      {isVerified && showVerifyIcon ? (
        <Icon name={isOrganization ? 'business' : 'verified-user'} size={iconSize + 1} color={colors.primary} style={uiStyles.identityIcon} />
      ) : null}
    </View>
  );
}

// The iCampus app shows platform amounts with the Nigerian naira symbol when no
// user country is set, which is always the case for administrator sessions.
const CURRENCY_SYMBOL = '₦';
const CURRENCY_SIZES = {
  small: { symbol: 12, integer: 16, decimal: 10, spacing: 4 },
  medium: { symbol: 16, integer: 24, decimal: 14, spacing: 6 },
  large: { symbol: 20, integer: 36, decimal: 18, spacing: 8 },
};

export function CurrencyDisplay({
  value,
  size = 'medium',
  success = false,
}: {
  value: number;
  size?: keyof typeof CURRENCY_SIZES;
  success?: boolean;
}) {
  const colors = useColors();
  const color = success ? colors.success : colors.primary;
  const config = CURRENCY_SIZES[size];
  const [integer, decimal] = Number(value || 0)
    .toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    .split('.');
  return (
    <View style={uiStyles.currency}>
      <Text style={{ fontSize: config.symbol, fontWeight: 'bold', marginRight: config.spacing, color }}>{CURRENCY_SYMBOL}</Text>
      <Text style={{ fontSize: config.integer, fontWeight: '700', letterSpacing: -0.5, color }}>
        {integer}
        <Text style={{ fontSize: config.decimal, fontWeight: '600', opacity: 0.85 }}>.{decimal}</Text>
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/** Gentle up-and-down drift; skipped when reduced motion is requested. */
const useFloatAnimation = () => {
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(reduceMotion => {
        if (cancelled || reduceMotion) return;
        const step = (toValue: number) =>
          Animated.timing(offset, { toValue, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
        loop = Animated.loop(Animated.sequence([step(-6), step(0)]));
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [offset]);
  return offset;
};

const HALO = 120;

export function EmptyState({
  icon = 'find-in-page',
  title,
  subtitle,
  buttonText,
  buttonIcon,
  onPress,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  buttonText?: string;
  buttonIcon?: IconName;
  onPress?: () => void;
}) {
  const colors = useColors();
  const float = useFloatAnimation();
  return (
    <View style={uiStyles.empty}>
      <Animated.View style={{ transform: [{ translateY: float }] }}>
        <View style={uiStyles.halo}>
          <View style={[uiStyles.haloRing, uiStyles.haloOuter, { backgroundColor: colors.primary }]} />
          <View style={[uiStyles.haloRing, uiStyles.haloInner, { backgroundColor: colors.primary }]} />
          <View style={[uiStyles.haloBadge, { backgroundColor: colors.primary }]}>
            <Icon name={icon} size={42} color="#fff" />
          </View>
        </View>
      </Animated.View>
      <Text style={[uiStyles.emptyTitle, { color: colors.textDarker }]}>{title}</Text>
      {subtitle ? <Text style={[uiStyles.emptySubtitle, { color: colors.text }]}>{subtitle}</Text> : null}
      {buttonText && onPress ? (
        <Button title={buttonText} icon={buttonIcon} onPress={onPress} style={uiStyles.emptyButton} />
      ) : null}
    </View>
  );
}

/** Centred dialog (fade), or a bottom sheet (slide) like the iCampus modals. */
export function Sheet({
  visible,
  onClose,
  children,
  variant = 'sheet',
  maxWidth = 640,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  variant?: 'sheet' | 'dialog';
  maxWidth?: number;
}) {
  const colors = useColors();
  const { height } = useWindowDimensions();
  const dialog = variant === 'dialog';
  return (
    <Modal transparent visible={visible} animationType={dialog ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={[uiStyles.overlay, dialog && uiStyles.overlayCentered]}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            dialog ? uiStyles.dialog : uiStyles.sheet,
            { backgroundColor: colors.backgroundSecondary, maxWidth, maxHeight: height * (dialog ? 0.85 : 0.88) },
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={uiStyles.sheetContent}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** The iCampus ActionModal: confirm a destructive or final action. */
export function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title,
  subtitle,
  confirmText = 'Continue',
  loading = false,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  subtitle: string;
  confirmText?: string;
  loading?: boolean;
}) {
  const colors = useColors();
  return (
    <Sheet visible={visible} onClose={() => !loading && onClose()} variant="dialog" maxWidth={440}>
      <View style={uiStyles.confirm}>
        <Icon name="info-outline" size={60} color={colors.primary} />
        <Text style={[uiStyles.confirmTitle, { color: colors.textDarker }]}>{title}</Text>
        <Text style={[uiStyles.confirmSubtitle, { color: colors.text }]}>{subtitle}</Text>
        <View style={uiStyles.confirmRow}>
          <Button title="Cancel" variant="outline" onPress={onClose} disabled={loading} style={uiStyles.confirmButton} />
          <Button title={confirmText} onPress={onConfirm} loading={loading} style={uiStyles.confirmButton} />
        </View>
      </View>
    </Sheet>
  );
}

export const statusColor = (status: string | undefined, colors: Colors) =>
  status === 'resolved' || status === 'closed'
    ? colors.success
    : status === 'pending'
      ? colors.pendingDelivery
      : status === 'open'
        ? colors.primary
        : colors.text;

export const severityColor = (severity: string | undefined, colors: Colors) =>
  ({
    critical: colors.criticalSeverity,
    high: colors.highSeverity,
    medium: colors.mediumSeverity,
    low: colors.lowSeverity,
  })[severity ?? ''] ?? colors.text;

const uiStyles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonCompact: { minHeight: 38, paddingHorizontal: 14, borderRadius: 10 },
  buttonRaised: { shadowColor: PRIMARY_COLOR, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  buttonIcon: { marginRight: 7 },
  buttonText: { fontSize: 14, fontWeight: 'bold' },
  iconButton: { padding: 8, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconButtonFilled: { width: 38, height: 38, padding: 0, borderRadius: 11 },
  picker: { marginBottom: 16 },
  pickerLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  pickerHint: { fontSize: 12, opacity: 0.8, marginBottom: 8, lineHeight: 17 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 14 },
  chipText: { fontSize: 13, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, marginBottom: 15, gap: 12 },
  toggleText: { fontSize: 14, flex: 1 },
  tabStrip: { flexGrow: 0, flexShrink: 0, marginBottom: 16, borderRadius: 14, borderWidth: 1 },
  tabStripContent: { padding: 5, gap: 4, alignItems: 'center', flexGrow: 1 },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 10, minHeight: 38 },
  tabText: { fontSize: 13.5, fontWeight: '700' },
  themeToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12 },
  themeToggleWide: { paddingVertical: 9, paddingHorizontal: 12 },
  themeToggleText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  themeToggleLabel: { fontSize: 14, fontWeight: '600' },
  themeTrack: { width: 56, height: 30, borderRadius: 15, justifyContent: 'center' },
  themeKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, maxWidth: '100%' },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  countBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { fontSize: 10, fontWeight: 'bold' },
  pageHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 20, borderRadius: 16, borderWidth: 1 },
  pageHeaderSide: { minWidth: 48, justifyContent: 'center' },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageHeaderCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 10 },
  pageHeaderTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  pageHeaderSubtitle: { fontSize: 12, textAlign: 'center', marginTop: 2 },
  card: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  sectionIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionText: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sectionSubtitle: { fontSize: 12.5, marginTop: 2 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  viewAllText: { fontSize: 13, fontWeight: '700' },
  loading: { padding: 24, alignItems: 'center', gap: 12 },
  scrollPage: { flex: 1 },
  filterRow: { flexGrow: 0, flexShrink: 0, marginBottom: 16 },
  filterRowContent: { gap: 8, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  filterChipText: { fontSize: 13, fontWeight: '700' },
  filterChipCount: { fontSize: 12, fontWeight: '800' },
  loadingText: { fontSize: 14 },
  avatarFallback: { backgroundColor: PRIMARY_COLOR, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold' },
  identity: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  identityName: { fontWeight: '700', fontSize: 14, flexShrink: 1 },
  identityIcon: { marginLeft: 4 },
  currency: { flexDirection: 'row', alignItems: 'baseline' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32, marginTop: 12 },
  halo: { width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center' },
  haloRing: { position: 'absolute', borderRadius: HALO / 2 },
  haloOuter: { width: HALO, height: HALO, opacity: 0.07 },
  haloInner: { width: HALO * 0.72, height: HALO * 0.72, opacity: 0.12 },
  haloBadge: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  emptyTitle: { fontSize: 19, fontWeight: '800', marginTop: 22, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 21, opacity: 0.8, maxWidth: 320 },
  emptyButton: { marginTop: 20, paddingHorizontal: 20 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
  overlayCentered: { justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  dialog: { width: '100%', borderRadius: 24 },
  sheetContent: { padding: 25 },
  confirm: { alignItems: 'center' },
  confirmTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 20, textAlign: 'center' },
  confirmSubtitle: { fontSize: 14, marginBottom: 20, textAlign: 'center', lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmButton: { flex: 1 },
});
