import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { AdBanner, AdItem } from '../AdBanner';
import { getAdminMetrics, getAds, getSchoolDetails, getStationDetails } from '../api';
import { finiteNumbers, Sparkline, useMeasuredWidth } from '../charts';
import { errorMessage, useNavigation, useSession, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { openInApp } from '../links';
import { makeStyles, useColors } from '../theme';
import {
  Button,
  Card,
  CurrencyDisplay,
  EmptyState,
  formatDate,
  formatLabel,
  Loading,
  Pill,
  SectionHeader,
  Sheet,
  UserAvatar,
  UserIdentity,
} from '../ui';
import { SchoolAdminDashboardView, SchoolAnalyticsView } from './SchoolAnalytics';

type Stats = Record<string, any>;

function StatCard({
  icon,
  label,
  tone,
  hint,
  trend,
  children,
}: {
  icon: IconName;
  label: string;
  tone: string;
  hint: string;
  trend?: unknown;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.statCard}>
      <View style={[styles.statGlow, { backgroundColor: tone + '10' }]} />
      <View style={styles.statTop}>
        <View style={[styles.statIcon, { backgroundColor: tone + '1A' }]}>
          <Icon name={icon} size={22} color={tone} />
        </View>
        {trend !== undefined ? <Sparkline data={trend} color={tone} width={90} height={34} /> : null}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>{children}</View>
      <Text style={styles.statHint}>{hint}</Text>
    </View>
  );
}

function DashboardSummary({ stats }: { stats: Stats }) {
  const colors = useColors();
  const styles = useStyles();
  const tickets = Number(stats.pendingTickets ?? 0);
  return (
    <View style={styles.summary}>
      <StatCard icon="groups" label="Active Users" tone={colors.info} hint="People using iCampus right now">
        <Text style={styles.statValue}>{Number(stats.activeUsers ?? 0).toLocaleString()}</Text>
      </StatCard>
      <StatCard icon="account-balance-wallet" label="Total Liquidity" tone={colors.success} hint="Funds held across the platform" trend={stats.liquidityTrend?.inFlow}>
        <CurrencyDisplay value={stats.platformLiquidity ?? 0} size="large" success />
      </StatCard>
      <StatCard
        icon="confirmation-number"
        label="Open Tickets"
        tone={colors.primary}
        hint={tickets === 0 ? 'All caught up' : 'Waiting for a response'}
        trend={stats.ticketTrend}
      >
        <Text style={styles.statValue}>{tickets.toLocaleString()}</Text>
      </StatCard>
    </View>
  );
}

function FlowTile({ label, value, tone, icon, success = false }: { label: string; value: number; tone: string; icon: IconName; success?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.flowTile}>
      <View style={[styles.flowIcon, { backgroundColor: tone + '1A' }]}>
        <Icon name={icon} size={18} color={tone} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.tileLabel}>{label}</Text>
        <CurrencyDisplay value={value} size="medium" success={success} />
      </View>
    </View>
  );
}

function FinanceSection({ trend }: { trend: { labels?: string[]; inFlow?: number[]; outFlow?: number[] } }) {
  const colors = useColors();
  const styles = useStyles();
  const { width, onLayout } = useMeasuredWidth();
  const inFlow = finiteNumbers(trend.inFlow);
  const outFlow = finiteNumbers(trend.outFlow);
  const labels = Array.isArray(trend.labels) ? trend.labels : [];
  const hasChart = labels.length > 0 && inFlow.length === labels.length && outFlow.length === labels.length;

  return (
    <Card>
      <SectionHeader icon="insights" title="iCampus Flow Analysis" subtitle="Money moving in and out of the platform" />
      <View style={styles.flowRow}>
        <FlowTile label="Total Ins" icon="south-west" tone={colors.success} success value={inFlow.reduce((sum, value) => sum + value, 0)} />
        <FlowTile label="Total Outs" icon="north-east" tone={colors.primary} value={outFlow.reduce((sum, value) => sum + value, 0)} />
      </View>
      <View onLayout={onLayout}>
        {hasChart && width > 0 ? (
          <>
            <LineChart
              data={{
                labels,
                datasets: [
                  { data: inFlow, color: () => colors.success, strokeWidth: 2.5 },
                  { data: outFlow, color: () => colors.primary, strokeWidth: 2.5 },
                ],
              }}
              width={width}
              height={220}
              withInnerLines={false}
              withOuterLines={false}
              chartConfig={{
                backgroundGradientFrom: colors.backgroundSecondary,
                backgroundGradientTo: colors.backgroundSecondary,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(128, 128, 128, ${opacity})`,
                labelColor: () => colors.textMuted,
                propsForDots: { r: '3' },
              }}
              bezier
              style={styles.chart}
            />
            <View style={styles.legend}>
              <LegendItem color={colors.success} label="Money in" />
              <LegendItem color={colors.primary} label="Money out" />
            </View>
          </>
        ) : (
          <Text style={styles.muted}>No flow data has been recorded yet.</Text>
        )}
      </View>
    </Card>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function SystemHealthSection({ latency, locations }: { latency: number; locations: Array<{ _id?: string; count: number }> }) {
  const colors = useColors();
  const styles = useStyles();
  const healthy = latency <= 300;
  const top = Math.max(1, ...locations.map(location => location.count));
  return (
    <Card>
      <SectionHeader
        icon="speed"
        title="System Performance & Activity"
        subtitle="Response times and where users are active"
        right={<Pill label={healthy ? 'Healthy' : 'Slow'} icon={healthy ? 'check-circle' : 'warning-amber'} color={healthy ? colors.success : colors.primary} />}
      />
      <View style={styles.latency}>
        <Text style={styles.tileLabel}>Average Latency</Text>
        <Text style={[styles.latencyValue, { color: healthy ? colors.success : colors.primary }]}>
          {latency.toFixed(0)}
          <Text style={styles.latencyUnit}> ms</Text>
        </Text>
      </View>
      <Text style={styles.subTitle}>Top Active User Locations</Text>
      {locations.length === 0 ? <Text style={styles.muted}>No location data yet.</Text> : null}
      {locations.map((location, index) => (
        <View key={`${location._id}-${index}`} style={styles.locationRow}>
          <Text style={styles.rank}>{index + 1}</Text>
          <View style={styles.flex}>
            <View style={styles.locationHead}>
              <Text numberOfLines={1} style={[styles.rowText, styles.flex]}>{location._id || 'Unknown'}</Text>
              <Text style={[styles.rowText, styles.bold, { color: colors.primary }]}>{location.count.toLocaleString()} users</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(location.count / top) * 100}%` }]} />
            </View>
          </View>
        </View>
      ))}
    </Card>
  );
}

/** One tax entry row; the related transaction opens in the iCampus app. */
export function TaxEntryRow({ item }: { item: Record<string, any> }) {
  const colors = useColors();
  const styles = useStyles();
  const transactionId = item.sourceDetails?.relatedTransactionId;
  const linkable = transactionId && item.taxType !== 'product_tax';
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon name="receipt-long" size={18} color={colors.primary} />
      </View>
      <View style={styles.taxRow}>
        <View style={styles.taxText}>
          <Text style={[styles.rowText, styles.bold]}>{formatLabel(String(item.taxType ?? 'tax'))}</Text>
          {transactionId ? (
            <Pressable accessibilityRole={linkable ? 'link' : undefined} disabled={!linkable} onPress={() => openInApp(`transaction/${transactionId}`)}>
              <Text numberOfLines={1} style={[styles.rowTextMini, { color: colors.primary }, linkable && styles.underline]}>Ref: {transactionId}</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.taxAmount}>
          <CurrencyDisplay value={Number(item.amount) || 0} size="small" />
          <Text style={styles.date}>{formatDate(item.date)}</Text>
        </View>
      </View>
    </View>
  );
}

function TaxEntryPreviewSection({ items, onViewAll }: { items: Record<string, any>[]; onViewAll: () => void }) {
  const styles = useStyles();
  return (
    <Card>
      <SectionHeader icon="receipt-long" title="iCampus Tax Entries" subtitle="Most recent tax transactions" onViewAll={onViewAll} />
      {items.length === 0 ? <Text style={styles.muted}>No recent tax entries.</Text> : null}
      {items.map((item, index) => <TaxEntryRow key={`${item.transactionReference}-${index}`} item={item} />)}
    </Card>
  );
}

function AdsPreviewSection({ onViewAll }: { onViewAll: () => void }) {
  const toast = useToast();
  const styles = useStyles();
  const { width, onLayout } = useMeasuredWidth();
  const [ads, setAds] = useState<AdItem[] | null>(null);
  useEffect(() => {
    getAds()
      .then(items => setAds(items as AdItem[]))
      .catch(reason => {
        setAds([]);
        toast('error', errorMessage(reason), 'Fetch Error');
      });
  }, [toast]);
  return (
    <Card>
      <SectionHeader
        icon="campaign"
        title="Advertisement Banners"
        subtitle={ads ? `${ads.length} active ${ads.length === 1 ? 'banner' : 'banners'}` : 'Loading banners'}
        onViewAll={onViewAll}
      />
      <View onLayout={onLayout}>
        {ads === null ? (
          <ActivityIndicator />
        ) : ads.length === 0 ? (
          <Text style={styles.muted}>No active advertisements.</Text>
        ) : width > 0 ? (
          <AdBanner ads={ads} perPage={width >= 640 ? 2 : 1} />
        ) : null}
      </View>
    </Card>
  );
}

function EntityPreviewSection({
  title,
  icon,
  items,
  total,
  onViewAll,
  onItemPress,
}: {
  title: string;
  icon: IconName;
  items: Record<string, any>[];
  total: number;
  onViewAll: () => void;
  onItemPress: (item: Record<string, any>) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Card style={styles.flexCard}>
      <SectionHeader icon={icon} title={title} subtitle={`${total.toLocaleString()} in total`} onViewAll={onViewAll} />
      {items.length === 0 ? <Text style={styles.muted}>Nothing added yet.</Text> : null}
      {items.map((item, index) => (
        <Pressable
          key={String(item.id ?? index)}
          onPress={() => onItemPress(item)}
          style={({ hovered }: any) => [styles.row, styles.entityRow, hovered && { backgroundColor: colors.primary + '0D' }]}
        >
          {item.logo ? (
            <Image source={{ uri: item.logo }} style={styles.entityLogo} />
          ) : (
            <View style={styles.rowIcon}>
              <Icon name={icon} size={18} color={colors.primary} />
            </View>
          )}
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.rowText, styles.bold]}>{item.name || item.schoolName}</Text>
            {item.address ? <Text numberOfLines={1} style={styles.rowTextMini}>{item.address}</Text> : null}
          </View>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

function DetailSheet({
  kind,
  id,
  onClose,
}: {
  kind: 'school' | 'station';
  id: string | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setData(null);
    (kind === 'school' ? getSchoolDetails(id) : getStationDetails(id))
      .then(result => active && setData(result.data && !Array.isArray(result.data) ? result.data : result))
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, kind]);

  const agent = data?.agent ?? {};
  return (
    <Sheet visible={Boolean(id)} onClose={onClose}>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : !data ? (
        <Text style={[styles.muted, { color: colors.primaryTint }]}>Failed to load details.</Text>
      ) : kind === 'school' ? (
        <>
          <View style={styles.detailRow}>
            {data.logo ? <Image source={{ uri: data.logo }} style={styles.detailLogo} /> : null}
            <View style={styles.flex}>
              <Text style={styles.detailTitle}>{data.schoolName}</Text>
              <Text style={styles.rowText}>{data.contactEmail}</Text>
            </View>
          </View>
          <View style={styles.flowRow}>
            <View style={styles.flowTile}>
              <View style={styles.flex}>
                <Text style={styles.tileLabel}>Students</Text>
                <Text style={styles.tileValue}>{Number(data.studentCount ?? 0).toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.flowTile}>
              <View style={styles.flex}>
                <Text style={styles.tileLabel}>Lecturers</Text>
                <Text style={styles.tileValue}>{Number(data.lecturerCount ?? 0).toLocaleString()}</Text>
              </View>
            </View>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.detailTitle}>{data.stationName}</Text>
          <Text style={[styles.rowText, styles.detailGap]}>{data.address}</Text>
          <Text style={[styles.rowText, styles.detailGap]}>Managed By:</Text>
          <View style={styles.agent}>
            <UserAvatar profilePic={agent.profilePic} firstName={agent.firstname} lastName={agent.lastname} size={40} />
            <UserIdentity
              firstname={agent.firstname}
              lastname={agent.lastname}
              username={agent.username}
              tier={agent.tier}
              isVerified={agent.isVerified}
              organizationName={agent.organizationName}
            />
          </View>
        </>
      )}
      <Button title="Close" variant="outline" onPress={onClose} style={styles.detailClose} />
    </Sheet>
  );
}

/** The dashboard. `header` is the page intro, scrolled along with the content. */
export function Overview({ header }: { header?: React.ReactNode }) {
  const { admin } = useSession();
  const { setTab } = useNavigation();
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [stationId, setStationId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setStats(await getAdminMetrics());
    } catch (reason) {
      setFailed(true);
      toast('error', errorMessage(reason), 'Dashboard Error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const role = admin.adminType;
  const canViewFinance = ['super_admin', 'finance'].includes(role);
  const canViewSystem = ['super_admin', 'analyst'].includes(role);
  const canViewInstitutions = ['super_admin', 'support'].includes(role);
  const canViewSchoolMetrics = ['super_admin', 'school_administrator'].includes(role);

  const schoolMetrics = stats?.schoolMetrics;
  return (
    <ScrollView style={overviewStyles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={overviewStyles.content}>
      {header}
      {loading ? (
        <Loading label="Loading data..." />
      ) : failed || !stats ? (
        <EmptyState
          icon="wifi-off"
          title="Couldn't load the dashboard"
          subtitle="Check your connection, then try again."
          buttonText="Try again"
          buttonIcon="refresh"
          onPress={() => void load()}
        />
      ) : (
        <>
          <DashboardSummary stats={stats} />
          {canViewSchoolMetrics ? <AdsPreviewSection onViewAll={() => setTab('Advertisements')} /> : null}
          {canViewSystem ? <SystemHealthSection latency={Number(stats.latencyData) || 0} locations={stats.locationStats ?? []} /> : null}
          {canViewFinance ? <FinanceSection trend={stats.liquidityTrend ?? {}} /> : null}
          {canViewFinance ? <TaxEntryPreviewSection items={stats.recentTaxes ?? []} onViewAll={() => setTab('Tax Entries')} /> : null}
          {canViewInstitutions ? (
            <View style={overviewStyles.entities}>
              <EntityPreviewSection
                title="Authorized Institutions"
                icon="school"
                items={stats.recentSchools?.items ?? []}
                total={stats.recentSchools?.total ?? 0}
                onViewAll={() => setTab('Institutions')}
                onItemPress={item => item.id && setSchoolId(String(item.id))}
              />
              <EntityPreviewSection
                title="Drop Off Stations"
                icon="storefront"
                items={stats.recentStations?.items ?? []}
                total={stats.recentStations?.total ?? 0}
                onViewAll={() => setTab('Drop-off Stations')}
                onItemPress={item => item.id && setStationId(String(item.id))}
              />
            </View>
          ) : null}
          {canViewSchoolMetrics && schoolMetrics ? (
            schoolMetrics.basic ? (
              // Tiered view (Basic / Professional / Enterprise by school plan).
              <SchoolAnalyticsView metrics={schoolMetrics} />
            ) : (
              // Older servers only send the flat legacy fields.
              <SchoolAdminDashboardView metrics={schoolMetrics} />
            )
          ) : null}
        </>
      )}
      <DetailSheet kind="school" id={schoolId} onClose={() => setSchoolId(null)} />
      <DetailSheet kind="station" id={stationId} onClose={() => setStationId(null)} />
    </ScrollView>
  );
}

const overviewStyles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 120 },
  entities: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
});

const useStyles = makeStyles(c =>
  StyleSheet.create({
    summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 16 },
    statCard: {
      flexGrow: 1,
      flexBasis: 240,
      padding: 20,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      backgroundColor: c.backgroundSecondary,
      overflow: 'hidden',
      shadowColor: c.shadow,
      shadowOpacity: 0.04,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
    },
    statGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -60, top: -70 },
    statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    statIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    statLabel: { fontSize: 13, fontWeight: '700', color: c.textMuted, letterSpacing: 0.2 },
    statValueRow: { minHeight: 46, justifyContent: 'center', marginTop: 4 },
    statValue: { fontSize: 34, fontWeight: '900', color: c.textDarker, letterSpacing: -0.8 },
    statHint: { fontSize: 12, color: c.textMuted, marginTop: 6 },
    flowRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
    flowTile: { flexGrow: 1, flexBasis: 200, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderSubtle },
    flowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    tileLabel: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 4 },
    tileValue: { fontSize: 22, fontWeight: '900', color: c.textDarker },
    chart: { marginLeft: -12, borderRadius: 16 },
    latency: { padding: 16, borderRadius: 16, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderSubtle, alignSelf: 'flex-start', minWidth: 200 },
    latencyValue: { fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
    latencyUnit: { fontSize: 15, fontWeight: '700' },
    subTitle: { fontSize: 14, fontWeight: '800', marginTop: 20, marginBottom: 10, color: c.textDarker },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    locationHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    rank: { width: 26, height: 26, borderRadius: 13, textAlign: 'center', lineHeight: 26, fontSize: 12, fontWeight: '800', color: c.primary, backgroundColor: c.primary + '14', overflow: 'hidden' },
    barTrack: { height: 6, borderRadius: 3, backgroundColor: c.borderSubtle, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3, backgroundColor: c.primary },
    row: {
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderSubtle,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    entityRow: { borderBottomWidth: 0, marginBottom: 2 },
    rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary + '14' },
    entityLogo: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.surfaceRaised },
    taxRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 },
    taxText: { flexShrink: 1, minWidth: 140 },
    taxAmount: { alignItems: 'flex-end', gap: 2, marginLeft: 'auto' },
    rowText: { fontSize: 14, color: c.textDarker },
    rowTextMini: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    bold: { fontWeight: '700' },
    underline: { textDecorationLine: 'underline' },
    date: { fontSize: 11.5, color: c.textMuted },
    muted: { fontSize: 13, color: c.textMuted, paddingVertical: 8 },
    flex: { flex: 1, minWidth: 0 },
    flexCard: { flexGrow: 1, flexBasis: 380 },
    legend: { flexDirection: 'row', gap: 20, justifyContent: 'center', marginTop: 8 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legendSwatch: { width: 14, height: 4, borderRadius: 2 },
    legendText: { fontSize: 12.5, fontWeight: '600', color: c.text },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 },
    detailLogo: { width: 45, height: 45, borderRadius: 22.5 },
    detailTitle: { fontSize: 18, fontWeight: '800', marginBottom: 5, color: c.textDarker },
    detailGap: { marginBottom: 15 },
    agent: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: c.primary + '0A', marginBottom: 10 },
    detailClose: { marginTop: 10 },
  }),
);
