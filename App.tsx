import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AdminSession, clearSession, readSession, SESSION_EXPIRED_EVENT, writeSession } from './src/api';
import {
  canAccess,
  isSchoolAdmin,
  isSchoolAdminA,
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
import { AdminActivityScreen, AdminDetail, MessageAdmins, SuperAccessControl } from './src/screens/AccessControl';
import { FinanceOverview, FinanceSection, SchoolBillingTab } from './src/screens/Finance';
import { SchoolUsers } from './src/screens/SchoolUsers';
import { SocialOverview } from './src/screens/Social';
import { StaffNotifications } from './src/screens/StaffNotifications';
import { AdminForm, AdminManagement } from './src/screens/Admins';
import { Login } from './src/screens/Login';
import { AdForm, AdsList, InstitutionForm, InstitutionsList, StationForm, StationsList, TaxEntries } from './src/screens/Manage';
import { Overview } from './src/screens/Overview';
import { SchoolSection } from './src/screens/SchoolSection';
import { SchoolNotifications } from './src/screens/SchoolNotifications';
import { RepForm, SchoolAuditLog, SchoolReps } from './src/screens/SchoolReps';
import { AdminSearch } from './src/screens/Search';
import { SupportChat, SupportInquiries } from './src/screens/Support';
import { TicketDetail, TicketsSection } from './src/screens/Tickets';
import { makeStyles, ThemeProvider, useColors } from './src/theme';
import { ConfirmModal, formatLabel, IconButton, ScreenTransition, TabStrip, ThemeToggle, UserAvatar, UserIdentity } from './src/ui';

const TAB_META: Record<Tab, { icon: IconName; description: string }> = {
  Overview: { icon: 'dashboard', description: 'Platform health, finance and institution activity at a glance.' },
  Finance: { icon: 'insights', description: 'Orders, subscriptions and school billing, in four-month periods.' },
  'Social Media': { icon: 'share', description: 'Followers, posts and impressions across the iCampus social accounts.' },
  Users: { icon: 'people-alt', description: 'Your students and lecturers by department and level.' },
  Tickets: { icon: 'support-agent', description: 'Review support tickets, user context and resolutions.' },
  'Security Alerts': { icon: 'security', description: 'Security-related activity recorded by the platform.' },
  Financial: { icon: 'account-balance', description: 'Financial activity recorded by the platform.' },
  'User Operations': { icon: 'people', description: 'Social and user activity for support and moderation.' },
  'Admin Actions': { icon: 'account-circle', description: 'Profile changes and administrator actions.' },
  Subscriptions: { icon: 'verified', description: 'Subscription and plan activity.' },
  Store: { icon: 'shopping-cart', description: 'Marketplace and store activity.' },
  'Access Control': { icon: 'admin-panel-settings', description: 'Manage system administrators and team access.' },
  Notifications: { icon: 'notifications-active', description: 'Send announcements to your students, lecturers and representatives.' },
  Institutions: { icon: 'school', description: 'Manage the iCampus network of authorized institutions.' },
  'Drop-off Stations': { icon: 'storefront', description: 'Manage authorized parcel drop-off locations.' },
  Advertisements: { icon: 'campaign', description: 'Manage iCampus advertisement banners.' },
  'School Billing': { icon: 'request-quote', description: "Each institution's plan and when its next payment is due." },
  'Tax Entries': { icon: 'receipt-long', description: 'All recorded tax transactions and monthly reports.' },
};

function TabContent({ tab, schoolAdmin, superAdmin }: { tab: Tab; schoolAdmin: boolean; superAdmin: boolean }) {
  const category = LOG_CATEGORIES[tab];
  if (category) return <ActivityLogs key={tab} category={category} label={tab} />;
  switch (tab) {
    case 'Finance':
      return <FinanceOverview />;
    case 'Social Media':
      return <SocialOverview />;
    case 'Users':
      return <SchoolUsers />;
    case 'School Billing':
      return <SchoolBillingTab />;
    case 'Tickets':
      return <TicketsSection />;
    case 'Access Control':
      return schoolAdmin ? <SchoolReps /> : superAdmin ? <SuperAccessControl /> : <AdminManagement />;
    case 'Notifications':
      return schoolAdmin ? <SchoolNotifications /> : <StaffNotifications />;
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
    case 'schoolSection':
      return <SchoolSection section={route.section} department={route.department ?? null} filter={route.filter} session={route.session} />;
    case 'repForm':
      return <RepForm rep={route.rep} canInviteA={route.canInviteA} />;
    case 'auditLog':
      return <SchoolAuditLog />;
    case 'financeSection':
      return <FinanceSection section={route.section} status={route.status} year={route.year} period={route.period} />;
    case 'adminDetail':
      return <AdminDetail key={route.uid} uid={route.uid} />;
    case 'adminActivity':
      return <AdminActivityScreen actorUid={route.actorUid} title={route.title} />;
    case 'messageAdmins':
      return <MessageAdmins uids={route.uids} label={route.label} />;
  }
}

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

/** Title block at the top of each tab. */
const OVERVIEW_DESCRIPTIONS: Record<string, string> = {
  finance: 'Orders, subscribers and school payments for the current four-month period.',
  super_admin: 'Finance, users, schools, support and app health across iCampus.',
  support: 'Tickets, the email inbox and accounts that need attention.',
  social_media: 'How the iCampus social accounts are growing, platform by platform.',
};

function PageIntro({ tab, firstname, schoolAdmin, role }: { tab: Tab; firstname?: string; schoolAdmin: boolean; role: string }) {
  const styles = useStyles();
  const overview = tab === 'Overview';
  return (
    <View style={styles.pageHeader}>
      {overview ? (
        <Text style={styles.pageEyebrow}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
        </Text>
      ) : null}
      <Text style={styles.pageTitle}>{overview ? `${greeting()}${firstname ? `, ${firstname.trim()}` : ''}` : tab}</Text>
      <Text style={styles.pageDescription}>
        {schoolAdmin && overview
          ? "Your institution's enrolment, lectures and performance at a glance."
          : schoolAdmin && tab === 'Access Control'
            ? "Your institution's representatives and their access."
            : !schoolAdmin && tab === 'Notifications'
              ? 'Message app users and read notifications sent to you.'
              : overview && OVERVIEW_DESCRIPTIONS[role]
                ? OVERVIEW_DESCRIPTIONS[role]
                : TAB_META[tab].description}
      </Text>
    </View>
  );
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
  const schoolAdmin = isSchoolAdmin(admin.adminType);
  const intro = <PageIntro tab={tab} firstname={admin.firstname} schoolAdmin={schoolAdmin} role={admin.adminType} />;
  const roleLabel = isSchoolAdminA(admin.adminType)
    ? 'Institution Representative'
    : schoolAdmin
      ? `Department Rep${admin.department ? ` · ${admin.department}` : ''}`
      : formatLabel(admin.adminType);

  return (
    <SessionProvider value={{ admin, logout: onLogout }}>
      <NavigationProvider value={navigation}>
        <View style={[styles.app, compact && styles.appCompact]}>
          {compact ? (
            <View style={styles.topBar}>
              <Pressable accessibilityRole="button" accessibilityLabel="Go to overview" onPress={() => navigation.setTab('Overview')} style={styles.brand}>
                <Logo size={36} />
                <View>
                  <Text style={styles.brandName}>iCampus</Text>
                  <Text style={styles.brandCaption}>ADMIN PORTAL</Text>
                </View>
              </Pressable>
              <View style={styles.topActions}>
                <ThemeToggle />
                <UserAvatar profilePic={admin.profilePic} firstName={admin.firstname} lastName={admin.lastname} size={34} />
                <IconButton filled icon="logout" size={19} label="Sign out" onPress={() => setConfirmLogout(true)} />
              </View>
            </View>
          ) : (
            <View style={styles.sidebar}>
              <Pressable accessibilityRole="button" accessibilityLabel="Go to overview" onPress={() => navigation.setTab('Overview')} style={styles.sidebarBrand}>
                <View style={styles.brandMark}>
                  <Logo size={34} />
                </View>
                <View>
                  <Text style={styles.brandName}>iCampus</Text>
                  <Text style={styles.brandCaption}>ADMIN PORTAL</Text>
                </View>
              </Pressable>

              <ScrollView style={styles.sidebarNav} contentContainerStyle={styles.sidebarNavContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.sidebarLabel}>WORKSPACE</Text>
                {visibleTabs.map(item => {
                  const selected = item === tab;
                  return (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: selected && !route }}
                      key={item}
                      onPress={() => navigation.setTab(item)}
                      style={({ hovered }: any) => [styles.navItem, selected && styles.navItemActive, hovered && !selected && styles.navItemHover]}
                    >
                      <View style={[styles.navIcon, selected && styles.navIconActive]}>
                        <Icon name={TAB_META[item].icon} size={19} color={selected ? colors.btnTextColor : colors.textMuted} />
                      </View>
                      <Text numberOfLines={1} style={[styles.navText, selected && styles.navTextActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.sidebarFooter}>
                <ThemeToggle showLabel />
                <View style={styles.accountCard}>
                  <UserAvatar profilePic={admin.profilePic} firstName={admin.firstname} lastName={admin.lastname} size={40} />
                  <View style={styles.accountText}>
                    <UserIdentity firstname={admin.firstname} lastname={admin.lastname} isVerified={admin.isVerified} showVerifyIcon size="small" />
                    <Text numberOfLines={1} style={styles.accountRole}>{roleLabel}</Text>
                  </View>
                </View>
                <Pressable
                  accessibilityLabel="Sign out"
                  accessibilityRole="button"
                  onPress={() => setConfirmLogout(true)}
                  style={({ hovered, pressed }: any) => [styles.logout, (hovered || pressed) && styles.logoutHover]}
                >
                  <Icon name="logout" size={18} color={colors.primary} />
                  <Text style={styles.logoutText}>Sign out</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.main}>
            {compact ? (
              <View style={styles.compactTabs}>
                <TabStrip
                  tabs={visibleTabs.map(item => ({ id: item, label: item, icon: TAB_META[item].icon }))}
                  active={tab}
                  onChange={navigation.setTab}
                  style={styles.compactStrip}
                />
              </View>
            ) : null}
            {route ? (
              <ScreenTransition key={stack.length} style={[styles.content, compact && styles.contentCompact]}>
                <RouteContent route={route} />
              </ScreenTransition>
            ) : (
              <ScreenTransition key={tab} style={[styles.content, compact && styles.contentCompact]}>
                {/* The overview scrolls its intro with the page; list tabs keep it pinned above their list. */}
                {tab === 'Overview' ? null : intro}
                <View style={styles.flex}>
                  {tab === 'Overview' ? <Overview header={intro} /> : <TabContent tab={tab} schoolAdmin={schoolAdmin} superAdmin={admin.adminType === 'super_admin'} />}
                </View>
              </ScreenTransition>
            )}
            {!route ? <AdminFab right={fabRight} /> : null}
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

function ThemedApp() {
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

export default function App() {
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}

const rootStyles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

const useStyles = makeStyles(c =>
  StyleSheet.create({
    app: { flex: 1, flexDirection: 'row', backgroundColor: c.background },
    appCompact: { flexDirection: 'column' },
    flex: { flex: 1, minHeight: 0 },
    topBar: {
      height: 62,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      backgroundColor: c.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: c.borderSubtle,
    },
    topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brandName: { color: c.primary, fontWeight: '900', fontSize: 19, letterSpacing: -0.3 },
    brandCaption: { color: c.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1.6, marginTop: 1 },
    sidebar: { width: 264, backgroundColor: c.backgroundSecondary, borderRightWidth: 1, borderRightColor: c.borderSubtle },
    sidebarBrand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 20 },
    brandMark: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary + '14' },
    sidebarNav: { flex: 1 },
    sidebarNavContent: { paddingHorizontal: 14, paddingBottom: 12, gap: 3 },
    sidebarLabel: { color: c.textMuted, fontWeight: '800', fontSize: 10.5, letterSpacing: 1.4, paddingHorizontal: 10, marginTop: 4, marginBottom: 10 },
    navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 8 },
    navItemActive: { backgroundColor: c.primary + '14' },
    navItemHover: { backgroundColor: c.primary + '0A' },
    navIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    navIconActive: {
      backgroundColor: c.primary,
      shadowColor: c.primary,
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    navText: { flex: 1, color: c.text, fontSize: 14, fontWeight: '600' },
    navTextActive: { color: c.primary, fontWeight: '800' },
    sidebarFooter: { padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: c.borderSubtle },
    accountCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderSubtle },
    accountText: { flex: 1, minWidth: 0 },
    accountRole: { color: c.textMuted, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
    logout: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primary + '55',
    },
    logoutHover: { backgroundColor: c.primary + '12', borderColor: c.primary },
    logoutText: { color: c.primary, fontWeight: '800', fontSize: 14 },
    main: { flex: 1, minWidth: 0, minHeight: 0 },
    compactTabs: { paddingHorizontal: 16, paddingTop: 12 },
    compactStrip: { marginBottom: 0 },
    content: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: 32, paddingTop: 28, minHeight: 0 },
    contentCompact: { paddingHorizontal: 16, paddingTop: 16 },
    pageHeader: { marginBottom: 22 },
    pageEyebrow: { color: c.primary, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
    pageTitle: { color: c.textDarker, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
    pageDescription: { color: c.textMuted, fontSize: 14, marginTop: 6 },
  }),
);
