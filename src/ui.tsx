import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ImageStyle,
  Modal,
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
import { Colors, makeStyles, PRIMARY_COLOR, TIER_COLORS, useColors } from './theme';
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
  variant?: 'primary' | 'outline' | 'success';
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const colors = useColors();
  const outline = variant === 'outline';
  const background = outline ? 'transparent' : variant === 'success' ? colors.success : colors.btnColor;
  const foreground = outline ? colors.primary : colors.btnTextColor;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        uiStyles.button,
        compact && uiStyles.buttonCompact,
        { backgroundColor: background, borderColor: colors.primary, borderWidth: outline ? 1 : 0 },
        { opacity: disabled ? 0.6 : 1, transform: [{ scale: pressed && !disabled ? 0.96 : 1 }] },
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
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        uiStyles.iconButton,
        (pressed || hovered) && { backgroundColor: colors.primary + '14' },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Icon name={icon} size={22} color={color ?? colors.primary} />
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
    label: { color: c.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 50,
      borderWidth: 0.8,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
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
                { borderColor: active ? colors.primary : colors.border },
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

/** Horizontal tab strip with the iCampus underline indicator. */
export function TabStrip<T extends string>({
  tabs,
  active,
  onChange,
  uppercase = false,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; badge?: number }>;
  active: T;
  onChange: (tab: T) => void;
  uppercase?: boolean;
}) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[uiStyles.tabStrip, { backgroundColor: colors.backgroundSecondary }]}
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
            style={[uiStyles.tab, { borderBottomColor: selected ? colors.primary : 'transparent' }]}
          >
            <Text style={[uiStyles.tabText, { color: selected ? colors.primary : colors.text }]}>
              {uppercase ? tab.label.toUpperCase() : tab.label}
            </Text>
            {tab.badge ? <CountBadge count={tab.badge} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
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
    <View style={[uiStyles.pageHeader, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={uiStyles.pageHeaderSide}>
        {back ? <IconButton icon="chevron-left" label="Go back" onPress={pop} /> : null}
      </View>
      <View style={uiStyles.pageHeaderCenter}>
        <Text numberOfLines={1} style={[uiStyles.pageHeaderTitle, { color: colors.primary }]}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={[uiStyles.pageHeaderSubtitle, { color: colors.text }]}>{subtitle}</Text> : null}
      </View>
      <View style={[uiStyles.pageHeaderSide, uiStyles.pageHeaderRight]}>{right ?? <Logo size={44} />}</View>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[uiStyles.card, { backgroundColor: colors.backgroundSecondary }, style]}>{children}</View>;
}

/** Section title with an optional "View All" button, as on the iCampus dashboard. */
export function SectionHeader({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  const colors = useColors();
  return (
    <View style={uiStyles.sectionHeader}>
      <Text style={[uiStyles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {onViewAll ? <Button compact title="View All" onPress={onViewAll} style={uiStyles.viewAll} /> : null}
    </View>
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
  button: { minHeight: 50, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonCompact: { minHeight: 38, paddingHorizontal: 12, borderRadius: 8 },
  buttonIcon: { marginRight: 7 },
  buttonText: { fontSize: 14, fontWeight: 'bold' },
  iconButton: { padding: 8, borderRadius: 20 },
  picker: { marginBottom: 16 },
  pickerLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  pickerHint: { fontSize: 12, opacity: 0.8, marginBottom: 8, lineHeight: 17 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 14 },
  chipText: { fontSize: 13, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, marginBottom: 15, gap: 12 },
  toggleText: { fontSize: 14, flex: 1 },
  tabStrip: { flexGrow: 0, marginBottom: 15, borderRadius: 12 },
  tabStripContent: { paddingHorizontal: 10, alignItems: 'center' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 3, marginRight: 4 },
  tabText: { fontSize: 14, fontWeight: '600' },
  countBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { fontSize: 10, fontWeight: 'bold' },
  pageHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 20 },
  pageHeaderSide: { minWidth: 48, justifyContent: 'center' },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageHeaderCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 10 },
  pageHeaderTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  pageHeaderSubtitle: { fontSize: 11, textAlign: 'center', marginTop: 2 },
  card: { padding: 15, borderRadius: 15, marginBottom: 15 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', flex: 1 },
  viewAll: { paddingHorizontal: 15 },
  loading: { padding: 24, alignItems: 'center', gap: 12 },
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
  sheet: { width: '100%', borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  dialog: { width: '100%', borderRadius: 20 },
  sheetContent: { padding: 25 },
  confirm: { alignItems: 'center' },
  confirmTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 20, textAlign: 'center' },
  confirmSubtitle: { fontSize: 14, marginBottom: 20, textAlign: 'center', lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmButton: { flex: 1 },
});
