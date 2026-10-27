import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AdminSession, clearSession, readSession, SESSION_EXPIRED_EVENT, writeSession } from './src/api';
import {
  canAccess,
  LOG_CATEGORIES,
  NavigationProvider,
  Route,
  SessionProvider,
  Tab,
  TAB_ACCESS,
  ToastProvider,
  useToast,
} from './src/context';
import { AdminFab } from './src/Fab';
import { Icon, IconName } from './src/icons';
import { Logo } from './src/Logo';
import { ActivityLogs } from './src/screens/ActivityLogs';
import { AdminForm, AdminManagement } from './src/screens/Admins';
import { Login } from './src/screens/Login';
import { AdForm, AdsList, InstitutionForm, InstitutionsList, StationForm, StationsList, TaxEntries } from './src/screens/Manage';
import { Overview } from './src/screens/Overview';
import { AdminSearch } from './src/screens/Search';
import { SupportChat, SupportInquiries } from './src/screens/Support';
import { TicketDetail, TicketsSection } from './src/screens/Tickets';
import { makeStyles, useColors } from './src/theme';
import { ConfirmModal, formatLabel, ScreenTransition, TabStrip, UserAvatar, UserIdentity } from './src/ui';

const TAB_META: Record<Tab, { icon: IconName; description: string }> = {
  Overview: { icon: 'dashboard', description: 'Platform health, finance and institution activity at a glance.' },
  Tickets: { icon: 'support-agent', description: 'Review support tickets, user context and resolutions.' },
  'Security Alerts': { icon: 'security', description: 'Security-related activity recorded by the platform.' },
  Financial: { icon: 'account-balance', description: 'Financial activity recorded by the platform.' },
  'User Operations': { icon: 'people', description: 'Social and user activity for support and moderation.' },
  'Admin Actions': { icon: 'account-circle', description: 'Profile changes and administrator actions.' },
  Subscriptions: { icon: 'verified', description: 'Subscription and plan activity.' },
  Store: { icon: 'shopping-cart', description: 'Marketplace and store activity.' },
  'Access Control': { icon: 'admin-panel-settings', description: 'Manage system administrators and team access.' },
  Institutions: { icon: 'school', description: 'Manage the iCampus network of authorized institutions.' },
  'Drop-off Stations': { icon: 'storefront', description: 'Manage authorized parcel drop-off locations.' },
  Advertisements: { icon: 'campaign', description: 'Manage iCampus advertisement banners.' },
  'Tax Entries': { icon: 'receipt-long', description: 'All recorded tax transactions and monthly reports.' },
};

function TabContent({ tab }: { tab: Tab }) {
  const category = LOG_CATEGORIES[tab];
  if (category) return <ActivityLogs key={tab} category={category} label={tab} />;
  switch (tab) {
    case 'Overview':
      return <Overview />;
    case 'Tickets':
      return <TicketsSection />;
    case 'Access Control':
      return <AdminManagement />;
    case 'Institutions':
      return <InstitutionsList />;
    case 'Drop-off Stations':
      return <StationsList />;
    case 'Advertisements':
      return <AdsList />;
    case 'Tax Entries':
      return <TaxEntries />;
    default:
      return null;
  }
}

function RouteContent({ route }: { route: Route }) {
  switch (route.name) {
    case 'ticket':
      return <TicketDetail ticket={route.ticket} />;
    case 'chat':
      return <SupportChat ticketRefId={route.ticketRefId} />;
    case 'search':
      return <AdminSearch />;
    case 'inquiries':
      return <SupportInquiries />;
    case 'adminForm':
      return <AdminForm admin={route.admin} />;
    case 'institutionForm':
      return <InstitutionForm item={route.item} />;
    case 'stationForm':
      return <StationForm item={route.item} />;
    case 'adForm':
      return <AdForm item={route.item} />;
  }
}

function Dashboard({ session, onLogout }: { session: AdminSession; onLogout: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const compact = width < 820;
  const [tab, setTabState] = useState<Tab>('Overview');
  const [stack, setStack] = useState<Route[]>([]);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const { admin } = session;

  const visibleTabs = useMemo(
    () => (Object.keys(TAB_ACCESS) as Tab[]).filter(item => canAccess(item, admin.adminType)),
    [admin.adminType],
  );

  const navigation = useMemo(
    () => ({
      tab,
      setTab: (next: Tab) => {
        setStack([]);
        setTabState(canAccess(next, admin.adminType) ? next : 'Overview');
      },
      push: (route: Route) => setStack(previous => [...previous, route]),
      pop: () => setStack(previous => previous.slice(0, -1)),
    }),
    [admin.adminType, tab],
  );

  const route = stack[stack.length - 1];
  const fabRight = compact ? 16 : 32;

  return (
    <SessionProvider value={{ admin, logout: onLogout }}>
      <NavigationProvider value={navigation}>
        <View style={styles.app}>
          <View style={[styles.topBar, compact && styles.topBarCompact]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go to overview" onPress={() => navigation.setTab('Overview')} style={styles.brand}>
              <Logo size={compact ? 40 : 46} />
              <View>
                <Text style={styles.brandName}>iCampus</Text>
                <Text style={styles.brandCaption}>ADMIN PORTAL</Text>
              </View>
            </Pressable>
            <View style={styles.account}>
              <UserAvatar profilePic={admin.profilePic} firstName={admin.firstname} lastName={admin.lastname} size={compact ? 36 : 42} />
              {!compact ? (
                <View style={styles.accountText}>
                  <UserIdentity firstname={admin.firstname} lastname={admin.lastname} isVerified={admin.isVerified} showVerifyIcon />
                  <Text style={styles.accountRole}>{formatLabel(admin.adminType)}</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityLabel="Sign out"
                accessibilityRole="button"
                onPress={() => setConfirmLogout(true)}
                style={({ hovered }: any) => [styles.logout, hovered && { backgroundColor: colors.primary + '14' }]}
              >
                <Icon name="logout" size={18} color={colors.primary} />
                {!compact ? <Text style={styles.logoutText}>Sign out</Text> : null}
              </Pressable>
            </View>
          </View>

          <View style={[styles.workspace, compact && styles.workspaceCompact]}>
            {compact ? (
              <View style={styles.compactTabs}>
                <TabStrip tabs={visibleTabs.map(item => ({ id: item, label: item }))} active={tab} onChange={navigation.setTab} />
              </View>
            ) : (
              <ScrollView style={styles.sidebar} contentContainerStyle={styles.sidebarContent}>
                <Text style={styles.sidebarLabel}>WORKSPACE</Text>
                {visibleTabs.map(item => {
                  const active = item === tab && !route;
                  return (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      key={item}
                      onPress={() => navigation.setTab(item)}
                      style={({ hovered }: any) => [
                        styles.navItem,
                        item === tab && styles.navItemActive,
                        hovered && item !== tab && styles.navItemHover,
                      ]}
                    >
                      <Icon name={TAB_META[item].icon} size={20} color={item === tab ? colors.primary : colors.text} />
                      <Text style={[styles.navText, item === tab && styles.navTextActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.main}>
              {route ? (
                <ScreenTransition key={stack.length} style={styles.content}>
                  <RouteContent route={route} />
                </ScreenTransition>
              ) : (
                <ScreenTransition key={tab} style={styles.content}>
                  <View style={styles.pageHeader}>
                    <Text style={styles.pageTitle}>{tab === 'Overview' ? 'Admin Dashboard' : tab}</Text>
                    <Text style={styles.pageDescription}>{TAB_META[tab].description}</Text>
                  </View>
                  <View style={styles.flex}>
                    <TabContent tab={tab} />
                  </View>
                </ScreenTransition>
              )}
              {!route ? <AdminFab right={fabRight} /> : null}
            </View>
          </View>
        </View>
        <ConfirmModal
          visible={confirmLogout}
          onClose={() => setConfirmLogout(false)}
          onConfirm={onLogout}
          title="Confirm Logout"
          subtitle="Are you sure you want to logout from this device?"
          confirmText="Logout"
        />
      </NavigationProvider>
    </SessionProvider>
  );
}

function Root() {
  const colors = useColors();
  const toast = useToast();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(readSession());
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const expired = () => {
      setSession(null);
      toast('error', 'Your session expired. Please sign in again.', 'Signed out');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, [toast]);

  if (!ready) {
    return (
      <View style={[rootStyles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!session) {
    return (
      <Login
        onLogin={next => {
          writeSession(next);
          setSession(next);
        }}
      />
    );
  }
  return <Dashboard key={session.admin.uid} session={session} onLogout={logout} />;
}

export default function App() {
  const colors = useColors();
  return (
    <View style={[rootStyles.root, { backgroundColor: colors.background }]}>
      <StatusBar style="auto" />
      <ToastProvider>
        <Root />
      </ToastProvider>
    </View>
  );
}

const rootStyles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

const useStyles = makeStyles(c =>
  StyleSheet.create({
    app: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    topBar: {
      height: 72,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      backgroundColor: c.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: c.border + '66',
    },
    topBarCompact: { height: 62, paddingHorizontal: 16 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brandName: { color: c.primary, fontWeight: '800', fontSize: 18 },
    brandCaption: { color: c.text, fontSize: 9, letterSpacing: 1.2, marginTop: 2 },
    account: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    accountText: { maxWidth: 260 },
    accountRole: { color: c.text, fontSize: 11, marginTop: 2, opacity: 0.8 },
    logout: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: c.border },
    logoutText: { color: c.primary, fontWeight: '700', fontSize: 13 },
    workspace: { flex: 1, flexDirection: 'row' },
    workspaceCompact: { flexDirection: 'column' },
    compactTabs: { paddingHorizontal: 16, paddingTop: 12 },
    sidebar: { width: 240, flexGrow: 0, backgroundColor: c.backgroundSecondary, borderRightWidth: 1, borderRightColor: c.border + '66' },
    sidebarContent: { padding: 16, gap: 2 },
    sidebarLabel: { color: c.text, opacity: 0.7, fontWeight: '700', fontSize: 10, letterSpacing: 1.1, paddingHorizontal: 12, marginBottom: 10 },
    navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, borderLeftWidth: 3, borderLeftColor: 'transparent' },
    navItemActive: { backgroundColor: c.primary + '14', borderLeftColor: c.primary },
    navItemHover: { backgroundColor: c.primary + '0A' },
    navText: { color: c.text, fontSize: 14, fontWeight: '500' },
    navTextActive: { color: c.primary, fontWeight: '700' },
    main: { flex: 1, minWidth: 0 },
    content: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16 },
    pageHeader: { marginBottom: 16 },
    pageTitle: { color: c.textDarker, fontSize: 24, fontWeight: '800' },
    pageDescription: { color: c.text, fontSize: 13, marginTop: 4, opacity: 0.85 },
  }),
);
