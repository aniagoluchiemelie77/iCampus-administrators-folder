import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { AdminUser, SchoolRep, SupportTicket } from './api';
import { useColors } from './theme';
import { Icon } from './icons';

export type Role =
  | 'super_admin'
  | 'finance'
  | 'support'
  | 'moderator'
  | 'analyst'
  | 'school_admin_a'
  | 'school_admin_b';

const ALL_ROLES: Role[] = ['super_admin', 'finance', 'support', 'moderator', 'analyst', 'school_admin_a', 'school_admin_b'];
const SCHOOL_ROLES: Role[] = ['school_admin_a', 'school_admin_b'];

/** "school_administrator" is the old name for the A-level institution representative. */
export const normalizeRole = (adminType: string | undefined) =>
  adminType === 'school_administrator' ? 'school_admin_a' : adminType ?? '';
export const isSchoolAdminA = (adminType: string | undefined) => normalizeRole(adminType) === 'school_admin_a';
export const isSchoolAdminB = (adminType: string | undefined) => adminType === 'school_admin_b';
export const isSchoolAdmin = (adminType: string | undefined) => isSchoolAdminA(adminType) || isSchoolAdminB(adminType);

export type Tab =
  | 'Overview'
  | 'Tickets'
  | 'Security Alerts'
  | 'Financial'
  | 'User Operations'
  | 'Admin Actions'
  | 'Subscriptions'
  | 'Store'
  | 'Access Control'
  | 'Notifications'
  | 'Institutions'
  | 'Drop-off Stations'
  | 'Advertisements'
  | 'Tax Entries';

// The first nine are the iCampus dashboard tabs (CATEGORY_ACCESS). The last four
// were the dashboard's "View All" screens; their access mirrors who could see
// the matching Overview preview.
export const TAB_ACCESS: Record<Tab, Role[]> = {
  Overview: ALL_ROLES,
  Tickets: ['super_admin', 'support'],
  'Security Alerts': ['super_admin'],
  Financial: ['super_admin', 'finance'],
  'User Operations': ['support', 'moderator'],
  'Admin Actions': ['super_admin'],
  Subscriptions: ['super_admin'],
  Store: ['super_admin', 'finance'],
  'Access Control': ALL_ROLES,
  Notifications: SCHOOL_ROLES,
  Institutions: ['super_admin', 'support'],
  'Drop-off Stations': ['super_admin', 'support'],
  Advertisements: ['super_admin', 'school_admin_a'],
  'Tax Entries': ['super_admin', 'finance'],
};

export const LOG_CATEGORIES: Partial<Record<Tab, string>> = {
  'Security Alerts': 'security',
  Financial: 'finance',
  'User Operations': 'social',
  'Admin Actions': 'profile',
  Subscriptions: 'subscription',
  Store: 'store',
};

export const canAccess = (tab: Tab, adminType: string) =>
  (TAB_ACCESS[tab] as string[]).includes(normalizeRole(adminType));

export type SchoolSectionId = 'courses' | 'announcements' | 'lectures' | 'at-risk' | 'lecturers';

export type Route =
  | { name: 'ticket'; ticket: SupportTicket }
  | { name: 'chat'; ticketRefId: string }
  | { name: 'search' }
  | { name: 'inquiries' }
  | { name: 'adminForm'; admin?: AdminUser }
  | { name: 'institutionForm'; item?: Record<string, any> }
  | { name: 'stationForm'; item?: Record<string, any> }
  | { name: 'adForm'; item?: Record<string, any> }
  | { name: 'schoolSection'; section: SchoolSectionId; department?: string | null; filter?: string }
  | { name: 'repForm'; rep?: SchoolRep; canInviteA?: boolean }
  | { name: 'auditLog' };

type Session = { admin: AdminUser; logout: () => void };
type Navigation = {
  tab: Tab;
  setTab: (tab: Tab) => void;
  push: (route: Route) => void;
  pop: () => void;
};

const SessionContext = createContext<Session | null>(null);
const NavigationContext = createContext<Navigation | null>(null);

export const SessionProvider = SessionContext.Provider;
export const NavigationProvider = NavigationContext.Provider;

export const useSession = () => {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider.');
  return value;
};

export const useNavigation = () => {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation must be used inside NavigationProvider.');
  return value;
};

type ToastType = 'success' | 'error' | 'info';
type ToastMessage = { id: number; type: ToastType; title?: string; message: string };
type ShowToast = (type: ToastType, message: string, title?: string) => void;

const ToastContext = createContext<ShowToast>(() => {});

export const useToast = () => useContext(ToastContext);

/** Error text from a caught value, for toasts. */
export const errorMessage = (reason: unknown, fallback = 'The request failed.') =>
  reason instanceof Error ? reason.message : fallback;

function ToastCard({ toast, onDone }: { toast: ToastMessage; onDone: () => void }) {
  const colors = useColors();
  const progress = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(toast.type === 'error' ? 4500 : 3000),
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => finished && onDone());
    return () => animation.stop();
  }, [progress, toast, onDone]);

  const accent = toast.type === 'error' ? colors.primary : toast.type === 'success' ? colors.success : colors.pendingDelivery;
  const icon = toast.type === 'error' ? 'error-outline' : toast.type === 'success' ? 'check-circle' : 'info-outline';
  return (
    <Animated.View
      accessibilityRole="alert"
      style={[
        styles.toast,
        { backgroundColor: colors.backgroundSecondary, borderLeftColor: accent },
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
        },
      ]}
    >
      <Icon name={icon} size={22} color={accent} />
      <View style={styles.toastText}>
        {toast.title ? <Text style={[styles.toastTitle, { color: colors.textDarker }]}>{toast.title}</Text> : null}
        <Text style={[styles.toastMessage, { color: colors.text }]}>{toast.message}</Text>
      </View>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);
  const show = useCallback<ShowToast>((type, message, title) => {
    const id = ++nextId.current;
    setToasts(current => [...current.slice(-2), { id, type, message, title }]);
  }, []);
  const remove = useCallback((id: number) => setToasts(current => current.filter(item => item.id !== id)), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <View pointerEvents="box-none" style={styles.toastStack}>
        {toasts.map(toast => (
          <ToastCard key={toast.id} toast={toast} onDone={() => remove(toast.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastStack: { position: 'absolute', top: 16, left: 16, right: 16, alignItems: 'center', gap: 8, zIndex: 1000 },
  toast: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastText: { flex: 1 },
  toastTitle: { fontWeight: '700', fontSize: 14, marginBottom: 2 },
  toastMessage: { fontSize: 13, lineHeight: 18 },
});
