import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { AdBanner, AdItem } from '../AdBanner';
import { getAdminMetrics, getAds, getSchoolDetails, getStationDetails } from '../api';
import { finiteNumbers, Sparkline, useMeasuredWidth } from '../charts';
import { errorMessage, useNavigation, useSession, useToast } from '../context';
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
  SectionHeader,
  Sheet,
  UserAvatar,
  UserIdentity,
} from '../ui';
import { SchoolAdminDashboardView, SchoolAnalyticsView } from './SchoolAnalytics';

type Stats = Record<string, any>;

function DashboardSummary({ stats }: { stats: Stats }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.summary}>
      <View style={styles.summaryCard}>
        <Text style={styles.label}>Active Users</Text>
        <Text style={styles.value}>{Number(stats.activeUsers ?? 0).toLocaleString()}</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.label}>Total Liquidity</Text>
        <CurrencyDisplay value={stats.platformLiquidity ?? 0} size="large" />
        <View style={styles.sparkline}>
          <Sparkline data={stats.liquidityTrend?.inFlow} color={colors.success} />
        </View>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.label}>Open Tickets</Text>
        <Text style={styles.value}>{Number(stats.pendingTickets ?? 0).toLocaleString()}</Text>
        <View style={styles.sparkline}>
          <Sparkline data={stats.ticketTrend} color={colors.primary} />
        </View>
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
      <Text style={[styles.value, styles.cardHeading]}>iCampus Flow Analysis</Text>
      <View style={styles.summary}>
        <View style={[styles.summaryCard, styles.halfCard]}>
          <Text style={styles.label}>Total Ins</Text>
          <CurrencyDisplay value={inFlow.reduce((sum, value) => sum + value, 0)} size="large" />
        </View>
        <View style={[styles.summaryCard, styles.halfCard]}>
          <Text style={styles.label}>Total Outs</Text>
          <CurrencyDisplay value={outFlow.reduce((sum, value) => sum + value, 0)} size="large" />
        </View>
      </View>
      <View onLayout={onLayout}>
        {hasChart && width > 0 ? (
          <>
            <LineChart
              data={{
                labels,
                datasets: [
                  { data: inFlow, color: () => colors.success, strokeWidth: 2 },
                  { data: outFlow, color: () => colors.primary, strokeWidth: 2 },
                ],
              }}
              width={Math.min(width, 900)}
              height={180}
              chartConfig={{
                backgroundGradientFrom: colors.backgroundSecondary,
                backgroundGradientTo: colors.backgroundSecondary,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(128, 128, 128, ${opacity})`,
                labelColor: () => colors.text,
              }}
              bezier
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
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function SystemHealthSection({ latency, locations }: { latency: number; locations: Array<{ _id?: string; count: number }> }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Card>
      <Text style={[styles.value, styles.cardHeading]}>System Performance & Activity</Text>
      <View style={[styles.summaryCard, styles.latencyCard]}>
        <Text style={styles.label}>Average Latency</Text>
        <Text style={[styles.value, { color: latency > 300 ? colors.primary : colors.success }]}>{latency.toFixed(0)} ms</Text>
      </View>
      <Text style={styles.subTitle}>Top Active User Locations</Text>
      {locations.length === 0 ? <Text style={styles.muted}>No location data yet.</Text> : null}
      {locations.map((location, index) => (
        <View key={`${location._id}-${index}`} style={styles.row}>
          <Text style={[styles.rowText, styles.flex]}>{location._id || 'Unknown'}</Text>
          <Text style={[styles.rowText, styles.bold, { color: colors.primary }]}>{location.count} users</Text>
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
      <View style={styles.taxRow}>
        <Text style={[styles.rowText, styles.bold]}>{formatLabel(String(item.taxType ?? 'tax')).toUpperCase()}</Text>
        {transactionId ? (
          <Pressable accessibilityRole={linkable ? 'link' : undefined} disabled={!linkable} onPress={() => openInApp(`transaction/${transactionId}`)}>
            <Text style={[styles.rowText, { color: colors.primary }, linkable && styles.underline]}>Ref: {transactionId}</Text>
          </Pressable>
        ) : null}
        <CurrencyDisplay value={Number(item.amount) || 0} size="small" />
      </View>
      <Text style={styles.date}>{formatDate(item.date)}</Text>
    </View>
  );
}

function TaxEntryPreviewSection({ items, onViewAll }: { items: Record<string, any>[]; onViewAll: () => void }) {
  const styles = useStyles();
  return (
    <Card>
      <SectionHeader title="iCampus Tax Entries" onViewAll={onViewAll} />
      {items.length === 0 ? <Text style={styles.muted}>No recent tax entries.</Text> : null}
      {items.map((item, index) => <TaxEntryRow key={`${item.transactionReference}-${index}`} item={item} />)}
    </Card>
  );
}

function AdsPreviewSection({ onViewAll }: { onViewAll: () => void }) {
  const toast = useToast();
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
      <SectionHeader title="Advertisement Banners" onViewAll={onViewAll} />
      <View onLayout={onLayout}>
        {ads === null ? <ActivityIndicator /> : <AdBanner ads={ads} width={width} />}
      </View>
    </Card>
  );
}

function EntityPreviewSection({
  title,
  items,
  total,
  onViewAll,
  onItemPress,
}: {
  title: string;
  items: Record<string, any>[];
  total: number;
  onViewAll: () => void;
  onItemPress: (item: Record<string, any>) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Card style={styles.flexCard}>
      <SectionHeader title={`${title} (${total})`} onViewAll={onViewAll} />
      {items.length === 0 ? <Text style={styles.muted}>Nothing added yet.</Text> : null}
      {items.map((item, index) => (
        <Pressable
          key={String(item.id ?? index)}
          onPress={() => onItemPress(item)}
          style={({ hovered }: any) => [styles.row, hovered && { backgroundColor: colors.primary + '0D' }]}
        >
          <Text style={[styles.rowText, styles.bold]}>{item.name || item.schoolName}</Text>
          {item.address ? <Text style={styles.rowTextMini}>{item.address}</Text> : null}
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
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
          <View style={styles.summary}>
            <View style={[styles.summaryCard, styles.halfCard]}>
              <Text style={styles.label}>Students</Text>
              <Text style={styles.value}>{Number(data.studentCount ?? 0).toLocaleString()}</Text>
            </View>
            <View style={[styles.summaryCard, styles.halfCard]}>
              <Text style={styles.label}>Lecturers</Text>
              <Text style={styles.value}>{Number(data.lecturerCount ?? 0).toLocaleString()}</Text>
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

export function Overview() {
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

  if (loading) return <Loading label="Loading data..." />;
  if (failed || !stats) {
    return (
      <EmptyState
        icon="wifi-off"
        title="Couldn't load the dashboard"
        subtitle="Check your connection, then try again."
        buttonText="Try again"
        buttonIcon="refresh"
        onPress={() => void load()}
      />
    );
  }

  const schoolMetrics = stats.schoolMetrics;
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={overviewStyles.content}>
      <DashboardSummary stats={stats} />
      {canViewSystem ? <SystemHealthSection latency={Number(stats.latencyData) || 0} locations={stats.locationStats ?? []} /> : null}
      {canViewFinance ? <FinanceSection trend={stats.liquidityTrend ?? {}} /> : null}
      {canViewSchoolMetrics ? <AdsPreviewSection onViewAll={() => setTab('Advertisements')} /> : null}
      {canViewFinance ? <TaxEntryPreviewSection items={stats.recentTaxes ?? []} onViewAll={() => setTab('Tax Entries')} /> : null}
      {canViewInstitutions ? (
        <View style={overviewStyles.entities}>
          <EntityPreviewSection
            title="iCampus Authorized Institutions"
            items={stats.recentSchools?.items ?? []}
            total={stats.recentSchools?.total ?? 0}
            onViewAll={() => setTab('Institutions')}
            onItemPress={item => item.id && setSchoolId(String(item.id))}
          />
          <EntityPreviewSection
            title="Recent Drop Off Stations"
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
      <DetailSheet kind="school" id={schoolId} onClose={() => setSchoolId(null)} />
      <DetailSheet kind="station" id={stationId} onClose={() => setStationId(null)} />
    </ScrollView>
  );
}

const overviewStyles = StyleSheet.create({
  content: { paddingBottom: 110 },
  entities: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 15 },
});

const useStyles = makeStyles(c =>
  StyleSheet.create({
    summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
    summaryCard: {
      flexGrow: 1,
      flexBasis: 200,
      padding: 15,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.backgroundSecondary,
      alignItems: 'center',
    },
    halfCard: { flexBasis: 160 },
    latencyCard: { flexGrow: 0, flexBasis: 'auto', marginBottom: 5 },
    label: { fontSize: 14, fontWeight: 'bold', marginBottom: 7, color: c.text },
    value: { fontSize: 18, fontWeight: 'bold', color: c.textDarker },
    cardHeading: { marginBottom: 15 },
    sparkline: { marginTop: 8 },
    subTitle: { fontSize: 15, fontWeight: 'bold', marginVertical: 15, color: c.text },
    row: { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    taxRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 220 },
    rowText: { fontSize: 14, color: c.text },
    rowTextMini: { fontSize: 12, color: c.text, opacity: 0.8 },
    bold: { fontWeight: '600' },
    underline: { textDecorationLine: 'underline' },
    date: { fontSize: 11, marginLeft: 'auto', color: c.text },
    muted: { fontSize: 13, color: c.text, opacity: 0.75, paddingVertical: 8 },
    flex: { flex: 1 },
    flexCard: { flexGrow: 1, flexBasis: 360 },
    legend: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 4 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendSwatch: { width: 12, height: 3, borderRadius: 2 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 },
    detailLogo: { width: 45, height: 45, borderRadius: 22.5 },
    detailTitle: { fontSize: 18, fontWeight: '700', marginBottom: 5, color: c.textDarker },
    detailGap: { marginBottom: 15 },
    agent: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: c.primary + '0A', marginBottom: 10 },
    detailClose: { marginTop: 10 },
  }),
);
