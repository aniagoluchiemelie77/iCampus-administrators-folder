import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { getPlatformOverview, getSupportOverview } from '../api';
import { AreaChart, BarChart, DonutChart, MeterRow, StackedBarChart } from '../charts';
import { Cell, fmtPct, Grid, StatCard, StatRow, Tiles } from '../dashboard';
import { errorMessage, useNavigation, useToast } from '../context';
import { Icon } from '../icons';
import { makeStyles, useColors } from '../theme';
import {
  Button,
  Card,
  EmptyState,
  formatCount,
  formatLabel,
  formatMoney,
  fromNow,
  Loading,
  Pill,
  ScrollPage,
  SectionHeader,
  severityColor,
} from '../ui';
import { AdsPreviewSection } from './Overview';
import { SocialSummaryCard } from './Social';

type Data = Record<string, any>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key: string) => MONTHS[Number(String(key).split('-')[1]) - 1] ?? key;
/** "2026-10-30" → "30 Oct". */
const dayLabel = (key: string) => {
  const [, m, d] = String(key).split('-').map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : key;
};

/** Loads a dashboard payload with retry; shared by both overviews. */
const useDashboard = (fetcher: () => Promise<Data>, label: string) => {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetcher());
    } catch (reason) {
      toast('error', errorMessage(reason), label);
    } finally {
      setLoading(false);
    }
  }, [fetcher, label, toast]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loading, load };
};

function Fallback({ loading, onRetry, label }: { loading: boolean; onRetry: () => void; label: string }) {
  return loading ? (
    <Loading label={label} />
  ) : (
    <EmptyState icon="wifi-off" title="Couldn't load the dashboard" subtitle="Check your connection, then try again." buttonText="Try again" buttonIcon="refresh" onPress={onRetry} />
  );
}

function SupportTickets({ tickets, compact = false }: { tickets: Data; compact?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const { setTab, push } = useNavigation();
  return (
    <Card>
      <SectionHeader
        icon="support-agent"
        title="Support"
        subtitle={`${formatCount(tickets.openCount)} open · oldest waiting ${tickets.oldestOpenHours == null ? '—' : `${tickets.oldestOpenHours}h`}`}
        onViewAll={() => setTab('Tickets')}
      />
      <AreaChart
        height={compact ? 150 : 180}
        labels={tickets.daily.map((d: Data) => dayLabel(d.day))}
        series={[
          { name: 'Opened', color: colors.series2, values: tickets.daily.map((d: Data) => d.opened) },
          { name: 'Resolved', color: colors.series3, values: tickets.daily.map((d: Data) => d.resolved) },
        ]}
      />
      {!compact ? (
        <Grid>
          <Cell>
            <Text style={styles.subTitle}>Open by severity</Text>
            {tickets.bySeverity.length === 0 ? <Text style={styles.meta}>Nothing open.</Text> : null}
            {tickets.bySeverity.map((s: Data) => (
              <MeterRow key={s.name} label={formatLabel(s.name)} value={s.count} max={tickets.bySeverity[0].count} unit="" color={severityColor(s.name, colors) ?? colors.primary} />
            ))}
          </Cell>
          <Cell>
            <Text style={styles.subTitle}>Open by category</Text>
            {tickets.byCategory.slice(0, 5).map((s: Data) => (
              <MeterRow key={s.name} label={formatLabel(s.name)} value={s.count} max={tickets.byCategory[0].count} unit="" color={colors.series1} />
            ))}
          </Cell>
        </Grid>
      ) : null}
      <View style={styles.inlineHead}>
        <Text style={styles.subTitle}>Email inbox</Text>
        <Pill label={`${tickets.emailOpen} OPEN`} color={tickets.emailOpen ? colors.primary : colors.success} icon="mail-outline" />
        <View style={styles.flex} />
        <Button compact variant="soft" icon="mail-outline" title="Open inbox" onPress={() => push({ name: 'inquiries' })} />
      </View>
      {tickets.recentEmails.length === 0 ? <Text style={styles.meta}>No unanswered emails.</Text> : null}
      {tickets.recentEmails.map((t: Data) => (
        <Pressable key={t.ticketRefId} onPress={() => push({ name: 'chat', ticketRefId: t.ticketRefId })} style={({ hovered }: any) => [styles.listRow, hovered && { backgroundColor: colors.primary + '08' }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.primary + '14' }]}>
            <Icon name="mark-email-unread" size={18} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text numberOfLines={1} style={styles.rowTitle}>{t.summary}</Text>
            <Text numberOfLines={1} style={styles.meta}>
              {t.from} · {t.messages} message{t.messages === 1 ? '' : 's'} · {fromNow(t.updatedAt)}
            </Text>
          </View>
          <Icon name="reply" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

function HealthCard({ health }: { health: Data }) {
  const colors = useColors();
  const styles = useStyles();
  const healthy = health.avgLatency <= 600 && (health.errorRatePct ?? 0) < 5;
  return (
    <Card>
      <SectionHeader
        icon="monitor-heart"
        title="App health & maintenance"
        subtitle={`Last 7 days · ${formatCount(health.sample)} logged requests`}
        right={<Pill label={healthy ? 'HEALTHY' : 'NEEDS ATTENTION'} icon={healthy ? 'check-circle' : 'warning-amber'} color={healthy ? colors.success : colors.pendingDelivery} />}
      />
      <Tiles
        items={[
          { label: 'Avg response', value: `${formatCount(health.avgLatency)} ms`, icon: 'speed' },
          { label: '95th percentile', value: `${formatCount(health.p95Latency)} ms`, icon: 'timer' },
          { label: 'Error rate', value: fmtPct(health.errorRatePct), icon: 'error-outline', tone: (health.errorRatePct ?? 0) >= 5 ? colors.criticalSeverity : undefined },
          { label: 'Errors', value: formatCount(health.errors), icon: 'bug-report' },
        ]}
      />
      <Text style={styles.subTitle}>Requests and errors per day</Text>
      <StackedBarChart
        height={150}
        labels={health.daily.map((d: Data) => dayLabel(d.day))}
        series={[
          { name: 'Succeeded', color: colors.series1, values: health.daily.map((d: Data) => d.requests - d.errors) },
          { name: 'Failed', color: colors.series2, values: health.daily.map((d: Data) => d.errors) },
        ]}
      />
      <Grid>
        <Cell>
          <Text style={styles.subTitle}>Slowest endpoints</Text>
          {health.slowest.map((a: Data) => (
            <MeterRow key={a.name} label={a.name.replace(/Controller$/, '')} value={a.avgLatency} max={health.slowest[0]?.avgLatency || 1} unit=" ms" color={colors.series4} sub={`${formatCount(a.requests)} requests`} />
          ))}
        </Cell>
        <Cell>
          <Text style={styles.subTitle}>Failing most</Text>
          {health.failing.length === 0 ? <Text style={styles.meta}>No errors logged.</Text> : null}
          {health.failing.map((a: Data) => (
            <MeterRow key={a.name} label={a.name.replace(/Controller$/, '')} value={a.errorRatePct} color={colors.series2} sub={a.lastError ? `${a.errors} errors · ${a.lastError}` : `${a.errors} errors`} />
          ))}
        </Cell>
      </Grid>
    </Card>
  );
}

/** Super admin: a little of everything, each section linking to its full view. */
export function PlatformOverview({ header }: { header?: React.ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  const { setTab, push } = useNavigation();
  const { data, loading, load } = useDashboard(getPlatformOverview, 'Dashboard Error');

  if (!data) {
    return (
      <ScrollPage contentContainerStyle={styles.page}>
        {header}
        <Fallback loading={loading} onRetry={() => void load()} label="Loading the platform overview..." />
      </ScrollPage>
    );
  }
  const { users, institutions, finance, support, health, admins } = data;
  const signups = users.signups as Data[];
  return (
    <ScrollPage contentContainerStyle={styles.page}>
      {header}
      <View style={loading ? styles.dim : null}>
        <StatRow>
          <StatCard
            icon="groups"
            label="Total users"
            tone={colors.info}
            value={formatCount(users.total)}
            trend={signups.map(m => m.students + m.lecturers + m.others)}
            delta={{ current: users.newThisMonth, previous: users.newLastMonth, suffix: `${formatCount(users.newThisMonth)} joined this month` }}
          />
          <StatCard
            icon="school"
            label="Institutions"
            tone={colors.primary}
            value={formatCount(institutions.total)}
            hint={`${institutions.overdue} overdue on billing`}
            onPress={() => setTab('Institutions')}
          />
          <StatCard
            icon="confirmation-number"
            label="Open tickets"
            tone={colors.pendingDelivery}
            value={formatCount(support.openCount)}
            hint={`${support.emailOpen} unanswered emails`}
            onPress={() => setTab('Tickets')}
          />
          <StatCard
            icon="admin-panel-settings"
            label="Administrators"
            tone={colors.success}
            value={formatCount(admins.total)}
            hint={`${admins.activeThisWeek} active this week`}
            onPress={() => setTab('Access Control')}
          />
        </StatRow>

        {finance ? (
          <Card>
            <SectionHeader icon="account-balance" title="Finance" subtitle={`${finance.period.label} · ${finance.currency}`} onViewAll={() => setTab('Finance')} />
            <Tiles
              items={[
                { label: 'Successful orders', value: formatCount(finance.cards.successfulOrders.current), icon: 'task-alt', tone: colors.success },
                { label: 'Cancelled orders', value: formatCount(finance.cards.cancelledOrders.current), icon: 'cancel', tone: finance.cards.cancelledOrders.current ? colors.criticalSeverity : undefined },
                { label: 'Active subscribers', value: formatCount(finance.cards.activeSubscribers.current), icon: 'workspace-premium' },
                { label: 'Marketplace volume', value: formatMoney(finance.kpis.gmv, finance.currency, true), icon: 'shopping-cart' },
                { label: 'Subscription revenue', value: formatMoney(finance.kpis.subscriptionRevenue, finance.currency, true), icon: 'payments' },
              ]}
            />
            <StackedBarChart
              height={150}
              labels={finance.monthly.map((m: Data) => m.label)}
              series={[
                { name: 'Successful', color: colors.series3, values: finance.monthly.map((m: Data) => m.completed) },
                { name: 'In progress', color: colors.series1, values: finance.monthly.map((m: Data) => m.inProgress) },
                { name: 'Cancelled', color: colors.series2, values: finance.monthly.map((m: Data) => m.cancelled) },
              ]}
            />
          </Card>
        ) : null}

        <Grid>
          <Cell>
            <Card>
              <SectionHeader icon="person-add-alt" title="Users" subtitle={`${fmtPct(users.verifiedPct)} verified · ${formatCount(users.subscribed)} subscribed`} />
              <AreaChart
                height={170}
                labels={signups.map(m => monthLabel(m.month))}
                series={[
                  { name: 'Students', color: colors.series1, values: signups.map(m => m.students) },
                  { name: 'Lecturers', color: colors.series2, values: signups.map(m => m.lecturers) },
                  { name: 'Others', color: colors.series3, values: signups.map(m => m.others) },
                ]}
              />
              <Tiles
                items={[
                  { label: 'Suspended', value: formatCount(users.suspended), icon: 'block', tone: users.suspended ? colors.criticalSeverity : undefined },
                  { label: 'Flagged sign-ins', value: formatCount(users.flagged), icon: 'gpp-maybe', tone: users.flagged ? colors.pendingDelivery : undefined },
                ]}
              />
            </Card>
          </Cell>
          <Cell>
            <Card>
              <SectionHeader icon="pie-chart" title="Who uses iCampus" subtitle="Accounts by type" />
              <DonutChart
                centerLabel="accounts"
                formatValue={formatCount}
                segments={users.byType.map((t: Data, i: number) => ({
                  label: formatLabel(t.type === 'regular' ? 'other' : t.type),
                  value: t.count,
                  color: [colors.series1, colors.series2, colors.series3, colors.series4][i],
                }))}
              />
            </Card>
          </Cell>
        </Grid>

        <Card>
          <SectionHeader icon="school" title="Average school" subtitle={`Across ${institutions.total} institutions`} onViewAll={() => setTab('Institutions')} />
          <Grid>
            <Cell>
              <Tiles
                items={[
                  { label: 'Students per school', value: formatCount(institutions.averageStudents), icon: 'school' },
                  { label: 'Lecturers per school', value: formatCount(institutions.averageLecturers), icon: 'co-present' },
                  { label: 'Accounts verified', value: fmtPct(institutions.averageVerificationPct), icon: 'verified-user' },
                ]}
              />
              <Text style={styles.subTitle}>Schools by plan</Text>
              <BarChart height={130} color={colors.primary} data={institutions.byTier.map((t: Data) => ({ label: t.label, value: t.count }))} />
            </Cell>
            <Cell>
              <Text style={styles.subTitle}>Largest institutions</Text>
              {institutions.top.map((s: Data) => (
                <View key={s.id} style={styles.listRow}>
                  {s.logo ? <Image source={{ uri: s.logo }} style={styles.logo} /> : <View style={[styles.rowIcon, { backgroundColor: colors.primary + '14' }]}><Icon name="school" size={18} color={colors.primary} /></View>}
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={styles.rowTitle}>{s.name}</Text>
                    <Text style={styles.meta}>
                      {formatCount(s.students)} students · {formatCount(s.lecturers)} lecturers
                    </Text>
                  </View>
                  <Pill label={s.tierLabel.toUpperCase()} color={colors.primary} />
                </View>
              ))}
            </Cell>
          </Grid>
        </Card>

        <SocialSummaryCard onViewAll={() => setTab('Social Media')} />

        <SupportTickets tickets={support} compact />
        <HealthCard health={health} />

        <Card>
          <SectionHeader icon="admin-panel-settings" title="Administrators" subtitle={`${admins.activeThisWeek} of ${admins.total} active this week`} onViewAll={() => setTab('Access Control')} right={<Button compact variant="soft" icon="history" title="Activity" onPress={() => push({ name: 'adminActivity' })} />} />
          <View style={styles.pills}>
            {admins.byRole
              .filter((r: Data) => r.count > 0)
              .map((r: Data) => (
                <Pill key={r.role} label={`${formatLabel(r.role.replace('school_admin_a', 'institution reps').replace('school_admin_b', 'department reps'))} ${r.count}`} color={colors.info} />
              ))}
          </View>
        </Card>

        <AdsPreviewSection onViewAll={() => setTab('Advertisements')} />
      </View>
    </ScrollPage>
  );
}

/** Support admin: tickets and the email inbox first, then accounts that need care. */
export function SupportOverview({ header }: { header?: React.ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  const { setTab } = useNavigation();
  const { data, loading, load } = useDashboard(getSupportOverview, 'Dashboard Error');

  if (!data) {
    return (
      <ScrollPage contentContainerStyle={styles.page}>
        {header}
        <Fallback loading={loading} onRetry={() => void load()} label="Loading support..." />
      </ScrollPage>
    );
  }
  const { tickets, accounts, broadcasts } = data;
  const byStatus = Object.fromEntries(tickets.byStatus.map((s: Data) => [s.status, s.count]));
  return (
    <ScrollPage contentContainerStyle={styles.page}>
      {header}
      <View style={loading ? styles.dim : null}>
        <StatRow>
          <StatCard icon="confirmation-number" label="Open tickets" tone={colors.primary} value={formatCount(byStatus.open)} hint={`${formatCount(byStatus.pending)} pending a reply`} trend={tickets.daily.map((d: Data) => d.opened)} onPress={() => setTab('Tickets')} />
          <StatCard icon="mark-email-unread" label="Unanswered emails" tone={colors.info} value={formatCount(tickets.emailOpen)} hint="Inbound support emails" />
          <StatCard icon="block" label="Suspended accounts" tone={colors.criticalSeverity} value={formatCount(accounts.suspended)} hint={`${formatCount(accounts.unverifiedNew)} new accounts unverified`} />
        </StatRow>

        <SupportTickets tickets={tickets} />

        <Grid>
          <Cell>
            <Card>
              <SectionHeader icon="person-add" title="New accounts" subtitle={`${formatCount(accounts.newLast30Days)} in the last 30 days`} />
              <BarChart height={150} color={colors.series1} data={accounts.signupsDaily.map((d: Data) => ({ label: dayLabel(d.day).split(' ')[0], value: d.count }))} />
              <Text style={styles.subTitle}>Recently suspended</Text>
              {accounts.recentlySuspended.length === 0 ? <Text style={styles.meta}>No suspended accounts.</Text> : null}
              {accounts.recentlySuspended.map((u: Data) => (
                <View key={u.uid} style={styles.listRow}>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{u.name}</Text>
                    <Text style={styles.meta}>
                      {u.username ? `@${u.username} · ` : ''}
                      {u.flags} security flag{u.flags === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </Cell>
          <Cell>
            <Card>
              <SectionHeader
                icon="campaign"
                title="Notifications sent to users"
                subtitle="Latest direct messages from the support team"
                right={<Button compact variant="soft" icon="send" title="New" onPress={() => setTab('Notifications')} />}
              />
              {broadcasts.length === 0 ? <Text style={styles.meta}>Nothing sent yet.</Text> : null}
              {broadcasts.map((b: Data) => (
                <View key={b.id} style={styles.listRow}>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={styles.rowTitle}>{b.title}</Text>
                    <Text numberOfLines={1} style={styles.meta}>
                      {b.senderName} · {b.targetLabel} · {fromNow(b.createdAt)}
                    </Text>
                  </View>
                  <Text style={styles.rowTitle}>{formatCount(b.recipientCount)}</Text>
                </View>
              ))}
            </Card>
          </Cell>
        </Grid>
      </View>
    </ScrollPage>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    page: { paddingBottom: 120 },
    flex: { flex: 1, minWidth: 0 },
    dim: { opacity: 0.55 },
    meta: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
    subTitle: { fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 10, color: c.textDarker },
    inlineHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowTitle: { fontSize: 13.5, fontWeight: '700', color: c.textDarker },
    rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    logo: { width: 38, height: 38, borderRadius: 19 },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  }),
);
