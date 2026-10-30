import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { exportFinanceData, FinancePeriod, getFinanceOverview, getFinanceSection, updateSchoolBilling } from '../api';
import { AreaChart, DonutChart, MeterRow, StackedBarChart } from '../charts';
import { Cell, ExportButton, ExportOption, fmtPct, Grid, StatCard, StatRow, Tiles } from '../dashboard';
import { errorMessage, FinanceSectionId, useNavigation, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { Colors, makeStyles, useColors } from '../theme';
import {
  Button,
  Card,
  EmptyState,
  Field,
  FilterChips,
  formatCount,
  formatDate,
  formatLabel,
  formatMoney,
  fromNow,
  Loading,
  OptionPicker,
  PageHeader,
  Pill,
  ScrollPage,
  SectionHeader,
  Sheet,
} from '../ui';

/**
 * Finance dashboard: the year in three four-month periods (P1 Jan–Apr,
 * P2 May–Aug, P3 Sep–Dec). Money is shown in one currency at a time; counts
 * are currency-free. Used as the finance admin's Overview and the super
 * admin's Finance tab.
 */

type Data = Record<string, any>;

const PERIOD_OPTIONS = [
  { value: '1', label: 'P1 · Jan–Apr' },
  { value: '2', label: 'P2 · May–Aug' },
  { value: '3', label: 'P3 · Sep–Dec' },
  { value: 'all', label: 'Full year' },
] as const;

const SECTION_META: Record<FinanceSectionId, { title: string; icon: IconName; filters?: Array<{ value: string; label: string }>; dated: boolean }> = {
  transactions: {
    title: 'Transactions',
    icon: 'receipt-long',
    dated: true,
    filters: [
      { value: 'all', label: 'All types' },
      { value: 'checkout', label: 'Checkouts' },
      { value: 'subscription', label: 'Subscriptions' },
      { value: 'refund', label: 'Refunds' },
      { value: 'payout', label: 'Payouts' },
    ],
  },
  orders: {
    title: 'Orders',
    icon: 'shopping-bag',
    dated: true,
    filters: [
      { value: 'all', label: 'All orders' },
      { value: 'completed', label: 'Successful' },
      { value: 'inProgress', label: 'In progress' },
      { value: 'unsuccessful', label: 'Unsuccessful' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
  },
  sellers: { title: 'Sellers by cancellations', icon: 'storefront', dated: true },
  products: { title: 'Products with cancellations', icon: 'inventory-2', dated: true },
  payments: {
    title: 'Unsuccessful payments',
    icon: 'credit-card-off',
    dated: true,
    filters: [
      { value: 'all', label: 'All unsuccessful' },
      { value: 'abandoned', label: 'Abandoned' },
      { value: 'refunded', label: 'Refunded' },
      { value: 'refund_failed', label: 'Refund failed' },
      { value: 'flagged', label: 'Flagged' },
    ],
  },
  subscribers: {
    title: 'Active subscribers',
    icon: 'workspace-premium',
    dated: false,
    filters: [
      { value: 'all', label: 'All plans' },
      { value: 'pro', label: 'Pro' },
      { value: 'premium', label: 'Premium' },
      { value: 'expiring', label: 'Expiring in 7 days' },
    ],
  },
  schools: {
    title: 'School plans & billing',
    icon: 'school',
    dated: false,
    filters: [
      { value: 'all', label: 'All schools' },
      { value: 'overdue', label: 'Overdue' },
      { value: 'due_soon', label: 'Due soon' },
      { value: 'active', label: 'Paid up' },
      { value: 'not_set', label: 'No billing set' },
    ],
  },
};

const EXPORT_OPTIONS: ExportOption[] = [
  { value: 'transactions', label: 'Transactions', personal: true },
  { value: 'orders', label: 'Orders (successful and unsuccessful)', personal: true },
  { value: 'sellers', label: 'Sellers by cancellations', personal: true },
  { value: 'products', label: 'Products with cancellations' },
  { value: 'payments', label: 'Unsuccessful payments' },
  { value: 'subscribers', label: 'Active subscribers', personal: true },
  { value: 'schools', label: 'School plans & billing' },
];

const billingTone = (status: string, colors: Colors) =>
  ({ overdue: colors.criticalSeverity, due_soon: colors.pendingDelivery, active: colors.success })[status] ?? colors.textMuted;
const billingLabel = (status: string) =>
  ({ overdue: 'OVERDUE', due_soon: 'DUE SOON', active: 'PAID UP', not_set: 'NOT SET' })[status] ?? status.toUpperCase();
const dueText = (school: Data) =>
  school.daysLeft == null
    ? 'No due date set'
    : school.daysLeft < 0
      ? `Overdue by ${Math.abs(school.daysLeft)} day${Math.abs(school.daysLeft) === 1 ? '' : 's'}`
      : school.daysLeft === 0
        ? 'Due today'
        : `Due in ${school.daysLeft} day${school.daysLeft === 1 ? '' : 's'}`;

function PeriodBar({
  year,
  period,
  onChange,
  currency,
  currencies,
  onCurrency,
  right,
}: {
  year: number;
  period: FinancePeriod;
  onChange: (year: number, period: FinancePeriod) => void;
  currency?: string;
  currencies?: string[];
  onCurrency?: (currency: string) => void;
  right?: React.ReactNode;
}) {
  const styles = useStyles();
  const thisYear = new Date().getFullYear();
  return (
    <View style={styles.periodBar}>
      <FilterChips
        value={String(year)}
        onChange={value => onChange(Number(value), period)}
        options={[thisYear - 2, thisYear - 1, thisYear].map(y => ({ value: String(y), label: String(y) }))}
      />
      <FilterChips value={String(period)} onChange={value => onChange(year, value === 'all' ? 'all' : Number(value))} options={PERIOD_OPTIONS} />
      {currencies && currencies.length > 1 && onCurrency ? (
        <FilterChips value={currency ?? currencies[0]} onChange={onCurrency} options={currencies.map(c => ({ value: c, label: c }))} />
      ) : null}
      <View style={styles.flex} />
      {right}
    </View>
  );
}

export function SchoolBillingCard({ school, onPress }: { school: Data; onPress?: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const tone = billingTone(school.status, colors);
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ hovered }: any) => [styles.schoolCard, hovered && onPress && { borderColor: tone }]}>
      <View style={[styles.schoolStripe, { backgroundColor: tone }]} />
      <View style={styles.schoolHead}>
        {school.logo ? <Image source={{ uri: school.logo }} style={styles.schoolLogo} /> : (
          <View style={[styles.schoolLogo, styles.center, { backgroundColor: colors.primary + '14' }]}>
            <Icon name="school" size={18} color={colors.primary} />
          </View>
        )}
        <View style={styles.flex}>
          <Text numberOfLines={1} style={styles.rowTitle}>{school.name}</Text>
          <Text style={styles.meta}>{school.tierLabel} plan{school.cycle ? ` · billed ${school.cycle}` : ''}</Text>
        </View>
        <Pill label={billingLabel(school.status)} color={tone} />
      </View>
      <View style={styles.schoolFoot}>
        <View>
          <Text style={styles.footLabel}>NEXT PAYMENT</Text>
          <Text style={[styles.rowTitle, { color: tone }]}>{school.nextPaymentDue ? formatDate(school.nextPaymentDue) : '—'}</Text>
          <Text style={styles.meta}>{dueText(school)}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.footLabel}>AMOUNT</Text>
          <Text style={styles.rowTitle}>{school.amount != null ? formatMoney(school.amount, school.currency) : '—'}</Text>
          <Text style={styles.meta}>{school.lastPaidAt ? `Paid ${fromNow(school.lastPaidAt)}` : 'No payment recorded'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** The dashboard. `header` is the page intro, scrolled with the content. */
export function FinanceOverview({ header }: { header?: React.ReactNode }) {
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const { push } = useNavigation();
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState<FinancePeriod>(Math.floor(new Date().getMonth() / 4) + 1);
  const [currency, setCurrency] = useState<string | undefined>();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setData(await getFinanceOverview({ year, period, currency }));
    } catch (reason) {
      setFailed(true);
      toast('error', errorMessage(reason), 'Finance Error');
    } finally {
      setLoading(false);
    }
  }, [currency, period, toast, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (section: FinanceSectionId, status?: string) => () => push({ name: 'financeSection', section, status, year, period });

  if (!data) {
    return (
      <ScrollPage contentContainerStyle={styles.page}>
        {header}
        {loading ? <Loading label="Loading finance analytics..." /> : (
          <EmptyState icon="wifi-off" title="Couldn't load finance data" subtitle="Check your connection, then try again." buttonText="Try again" onPress={() => void load()} />
        )}
      </ScrollPage>
    );
  }

  const cur = data.currency as string;
  const money = (v: number) => formatMoney(v, cur, true);
  const { cards, kpis, monthly } = data;
  const labels = monthly.map((m: Data) => m.label);

  return (
    <ScrollPage contentContainerStyle={styles.page}>
      {header}
      <PeriodBar
        year={year}
        period={period}
        onChange={(y, p) => {
          setYear(y);
          setPeriod(p);
        }}
        currency={cur}
        currencies={data.currencies}
        onCurrency={setCurrency}
        right={
          <ExportButton
            multiple
            title="Export finance report"
            scopeNote={`${data.period.label}. Subscribers and schools are exported as they stand today.`}
            options={EXPORT_OPTIONS}
            onExport={sections => exportFinanceData({ sections, year, period })}
          />
        }
      />
      <Text style={[styles.meta, styles.periodNote]}>
        {data.period.label} · compared with {data.previousLabel} · amounts in {cur}
        {failed ? ' · showing the last loaded data' : loading ? ' · updating…' : ''}
      </Text>

      <View style={loading ? styles.dim : null}>
        <StatRow>
          <StatCard
            icon="task-alt"
            label="Total Successful Orders"
            tone={colors.success}
            value={formatCount(cards.successfulOrders.current)}
            trend={monthly.map((m: Data) => m.completed)}
            delta={{ ...cards.successfulOrders, suffix: `vs ${formatCount(cards.successfulOrders.previous)} last period` }}
            onPress={open('orders', 'completed')}
          />
          <StatCard
            icon="cancel"
            label="Total Cancelled Orders"
            tone={colors.criticalSeverity}
            value={formatCount(cards.cancelledOrders.current)}
            trend={monthly.map((m: Data) => m.cancelled)}
            delta={{ ...cards.cancelledOrders, invert: true, suffix: `vs ${formatCount(cards.cancelledOrders.previous)} last period` }}
            hint={`${fmtPct(kpis.cancellationRatePct)} of all orders`}
            onPress={open('orders', 'cancelled')}
          />
          <StatCard
            icon="workspace-premium"
            label="Total Active Subscribers"
            tone={colors.primary}
            value={formatCount(cards.activeSubscribers.current)}
            trend={monthly.map((m: Data) => m.subscriptions)}
            delta={{ current: cards.activeSubscribers.newInPeriod, previous: cards.activeSubscribers.newInPrevious, suffix: `${formatCount(cards.activeSubscribers.newInPeriod)} new this period` }}
            hint={kpis.expiringSoon ? `${formatCount(kpis.expiringSoon)} expire within 7 days` : 'None expiring this week'}
            onPress={open('subscribers')}
          />
        </StatRow>

        <Card>
          <SectionHeader icon="account-balance-wallet" title="Money this period" subtitle="Marketplace volume excludes cancelled orders" onViewAll={open('transactions')} />
          <Tiles
            items={[
              { label: 'Marketplace volume (GMV)', value: money(kpis.gmv), icon: 'shopping-cart' },
              { label: 'Subscription revenue', value: money(kpis.subscriptionRevenue), icon: 'workspace-premium', tone: colors.primary },
              { label: 'Delivery fees', value: money(kpis.deliveryFees), icon: 'local-shipping' },
              { label: 'Average order', value: money(kpis.averageOrderValue), icon: 'functions' },
              { label: 'Refunds', value: money(kpis.refunds), icon: 'undo', tone: kpis.refunds > 0 ? colors.pendingDelivery : undefined },
              { label: 'Seller payouts', value: money(kpis.payouts), icon: 'payments' },
              { label: 'Tax collected', value: money(kpis.taxCollected), icon: 'receipt-long' },
            ]}
          />
          <Text style={styles.subTitle}>Per month</Text>
          <AreaChart
            labels={labels}
            series={[
              { name: 'Marketplace volume', color: colors.series1, values: monthly.map((m: Data) => m.gmv) },
              { name: 'Subscriptions', color: colors.series2, values: monthly.map((m: Data) => m.subscriptionRevenue) },
              { name: 'Refunds', color: colors.series4, values: monthly.map((m: Data) => m.refunds) },
            ]}
          />
        </Card>

        <Grid>
          <Cell>
            <Card>
              <SectionHeader icon="stacked-bar-chart" title="Orders per month" subtitle={`${formatCount(kpis.totalOrders)} orders this period`} onViewAll={open('orders')} />
              <StackedBarChart
                labels={labels}
                series={[
                  { name: 'Successful', color: colors.series3, values: monthly.map((m: Data) => m.completed) },
                  { name: 'In progress', color: colors.series1, values: monthly.map((m: Data) => m.inProgress) },
                  { name: 'Cancelled', color: colors.series2, values: monthly.map((m: Data) => m.cancelled) },
                ]}
              />
            </Card>
          </Cell>
          <Cell>
            <Card>
              <SectionHeader icon="date-range" title={`${data.period.year} at a glance`} subtitle="The three four-month periods side by side" />
              <StackedBarChart
                labels={data.comparison.map((p: Data) => `P${p.period}`)}
                series={[
                  { name: 'Successful', color: colors.series3, values: data.comparison.map((p: Data) => (p.isFuture ? null : p.completed)) },
                  { name: 'Other', color: colors.series1, values: data.comparison.map((p: Data) => (p.isFuture ? null : p.orders - p.completed - p.cancelled)) },
                  { name: 'Cancelled', color: colors.series2, values: data.comparison.map((p: Data) => (p.isFuture ? null : p.cancelled)) },
                ]}
              />
              <View style={styles.periodTotals}>
                {data.comparison.map((p: Data) => (
                  <View key={p.period} style={[styles.periodTotal, p.period === period && { borderColor: colors.primary }]}>
                    <Text style={styles.footLabel}>{p.label.toUpperCase()}</Text>
                    <Text style={styles.rowTitle}>{p.isFuture ? 'Upcoming' : money(p.gmv)}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </Cell>
        </Grid>

        <Grid>
          <Cell>
            <Card>
              <SectionHeader icon="donut-large" title="Order status" subtitle="Where this period's orders are now" />
              <DonutChart
                centerLabel="orders"
                formatValue={formatCount}
                segments={data.orderStatus
                  .filter((s: Data) => s.count > 0 || ['completed', 'cancelled'].includes(s.status))
                  .slice(0, 5)
                  .map((s: Data, i: number) => ({
                    label: formatLabel(s.status),
                    value: s.count,
                    color: [colors.series3, colors.series1, colors.series4, colors.series2, colors.textMuted][i],
                  }))}
              />
              <Text style={styles.subTitle}>Delivery method</Text>
              {data.deliveryMethods.map((d: Data) => (
                <MeterRow key={d.method} label={formatLabel(d.method)} value={d.count} max={Math.max(1, kpis.totalOrders)} unit="" color={colors.series1} />
              ))}
            </Card>
          </Cell>
          <Cell>
            <Card>
              <SectionHeader icon="workspace-premium" title="Subscribers by plan" subtitle="Active right now" onViewAll={open('subscribers')} />
              <DonutChart
                centerLabel="subscribers"
                formatValue={formatCount}
                segments={data.subscribersByTier.map((t: Data, i: number) => ({ label: formatLabel(t.tier), value: t.count, color: [colors.series1, colors.series2][i] }))}
              />
              <Text style={styles.subTitle}>Payment attempts this period</Text>
              {data.paymentOutcomes.map((o: Data) => (
                <MeterRow
                  key={o.status}
                  label={formatLabel(o.status)}
                  value={o.count}
                  max={Math.max(1, ...data.paymentOutcomes.map((x: Data) => x.count))}
                  unit=""
                  color={o.status === 'completed' ? colors.series3 : colors.series2}
                />
              ))}
              <Button compact variant="soft" icon="credit-card-off" title="Unsuccessful payments" onPress={open('payments')} />
            </Card>
          </Cell>
        </Grid>

        <Grid>
          <Cell>
            <Card>
              <SectionHeader icon="storefront" title="Sellers with cancellations" subtitle="Who may have product or delivery issues" onViewAll={open('sellers')} />
              {data.sellerIssues.length === 0 ? <Text style={styles.meta}>No cancellations this period.</Text> : null}
              {data.sellerIssues.map((s: Data) => (
                <MeterRow
                  key={s.sellerId}
                  label={s.name}
                  value={s.cancellationRatePct}
                  color={colors.series2}
                  sub={`${s.cancelled} of ${s.orders} orders cancelled${s.topReason ? ` · "${s.topReason}"` : ''}`}
                />
              ))}
            </Card>
          </Cell>
          <Cell>
            <Card>
              <SectionHeader icon="report-problem" title="Why orders were cancelled" subtitle="Reasons buyers gave" onViewAll={open('products')} />
              {data.cancellationReasons.length === 0 ? <Text style={styles.meta}>No cancellations this period.</Text> : null}
              {data.cancellationReasons.map((r: Data) => (
                <MeterRow key={r.reason} label={r.reason} value={r.count} max={data.cancellationReasons[0].count} unit="" color={colors.series2} />
              ))}
              {data.productIssues.length ? (
                <>
                  <Text style={styles.subTitle}>Products most cancelled</Text>
                  {data.productIssues.slice(0, 4).map((p: Data) => (
                    <View key={p.productId || p.productName} style={styles.listRow}>
                      <Text numberOfLines={1} style={[styles.rowTitle, styles.flex]}>{p.productName}</Text>
                      <Text style={styles.meta}>
                        {p.cancelled}/{p.orders} · {fmtPct(p.cancellationRatePct)}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}
            </Card>
          </Cell>
        </Grid>

        <Card>
          <SectionHeader
            icon="school"
            title="School plans"
            subtitle={`${data.schools.total} institutions · ${data.schools.overdue} overdue · ${data.schools.dueSoon} due within 14 days`}
            onViewAll={open('schools')}
          />
          <View style={styles.tierRow}>
            {data.schools.byTier.map((t: Data) => (
              <Pill key={t.tier} label={`${t.label} ${t.count}`} color={colors.primary} icon="workspace-premium" />
            ))}
            {data.schools.notSet ? <Pill label={`${data.schools.notSet} without billing`} color={colors.textMuted} icon="info-outline" /> : null}
          </View>
          <View style={styles.schoolGrid}>
            {data.schools.items.map((s: Data) => (
              <View key={s.id} style={styles.schoolCell}>
                <SchoolBillingCard school={s} onPress={open('schools')} />
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <SectionHeader icon="receipt-long" title="Recent transactions" subtitle="Newest first, all currencies" onViewAll={open('transactions')} />
          {data.recentTransactions.length === 0 ? <Text style={styles.meta}>No transactions this period.</Text> : null}
          {data.recentTransactions.map((t: Data) => (
            <TransactionRow key={t.transactionId} item={t} />
          ))}
        </Card>
      </View>
    </ScrollPage>
  );
}

const TX_ICONS: Record<string, IconName> = { checkout: 'shopping-cart', subscription: 'workspace-premium', refund: 'undo', payout: 'payments' };

function TransactionRow({ item }: { item: Data }) {
  const colors = useColors();
  const styles = useStyles();
  const incoming = item.type === 'checkout' || item.type === 'subscription';
  const tone = item.status === 'failed' ? colors.criticalSeverity : item.status === 'pending' ? colors.pendingDelivery : colors.success;
  return (
    <View style={styles.listRow}>
      <View style={[styles.rowIcon, { backgroundColor: colors.primary + '14' }]}>
        <Icon name={TX_ICONS[item.type] ?? 'swap-horiz'} size={18} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={styles.rowTitle}>{item.title || formatLabel(item.type)}</Text>
        <Text numberOfLines={1} style={styles.meta}>
          {formatLabel(item.type)} · {item.userName || item.userId || 'Unknown user'} · {formatDate(item.createdAt, true)}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>Ref {item.reference || item.transactionId}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.rowTitle, { color: incoming ? colors.success : colors.textDarker }]}>{formatMoney(item.amount, item.currency)}</Text>
        <Pill label={String(item.status).toUpperCase()} color={tone} />
      </View>
    </View>
  );
}

function OrderRow({ item }: { item: Data }) {
  const colors = useColors();
  const styles = useStyles();
  const tone = item.group === 'completed' ? colors.success : item.group === 'cancelled' ? colors.criticalSeverity : colors.info;
  return (
    <View style={styles.listRow}>
      <View style={[styles.rowIcon, { backgroundColor: tone + '1A' }]}>
        <Icon name={item.group === 'completed' ? 'task-alt' : item.group === 'cancelled' ? 'cancel' : 'local-shipping'} size={18} color={tone} />
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {item.productName} × {item.quantity}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          #{item.orderId} · seller {item.sellerName || item.sellerId} · buyer {item.buyerName || item.buyerId}
        </Text>
        <Text numberOfLines={2} style={styles.meta}>
          {formatDate(item.createdAt, true)} · {formatLabel(item.deliveryMethod || 'delivery')}
          {item.cancellationReason ? ` · Reason: ${item.cancellationReason}` : ''}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.rowTitle}>{formatMoney(item.amountPaid, item.currency)}</Text>
        <Pill label={formatLabel(item.status).toUpperCase()} color={tone} />
        {item.refundAmount ? <Text style={styles.meta}>Refunded {formatMoney(item.refundAmount, item.currency)}</Text> : null}
      </View>
    </View>
  );
}

function SectionRow({ section, item, onEdit }: { section: FinanceSectionId; item: Data; onEdit: (item: Data) => void }) {
  const colors = useColors();
  const styles = useStyles();
  switch (section) {
    case 'transactions':
      return <TransactionRow item={item} />;
    case 'orders':
      return <OrderRow item={item} />;
    case 'sellers':
      return (
        <View style={styles.listRow}>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Text style={styles.meta}>
              {item.orders} orders · {item.completed} successful · {item.cancelled} cancelled
              {item.topReason ? ` · most often "${item.topReason}"` : ''}
            </Text>
          </View>
          <View style={styles.meterCell}>
            <MeterRow label="Cancelled" value={item.cancellationRatePct} color={colors.series2} />
          </View>
        </View>
      );
    case 'products':
      return (
        <View style={styles.listRow}>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>{item.productName}</Text>
            <Text style={styles.meta}>
              {item.cancelled} of {item.orders} orders cancelled
            </Text>
          </View>
          <View style={styles.meterCell}>
            <MeterRow label="Cancelled" value={item.cancellationRatePct} color={colors.series2} />
          </View>
        </View>
      );
    case 'payments':
      return (
        <View style={styles.listRow}>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>{item.title || formatLabel(item.purpose || 'payment')}</Text>
            <Text style={styles.meta}>
              {item.txRef} · {formatDate(item.createdAt, true)}
              {item.failureReason ? ` · ${item.failureReason}` : ''}
            </Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.rowTitle}>{formatMoney(item.amount, item.currency)}</Text>
            <Pill label={formatLabel(item.status).toUpperCase()} color={item.status === 'refund_failed' || item.status === 'flagged' ? colors.criticalSeverity : colors.pendingDelivery} />
          </View>
        </View>
      );
    case 'subscribers':
      return (
        <View style={styles.listRow}>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Text style={styles.meta}>
              {item.username ? `@${item.username} · ` : ''}subscribed {item.subscribedAt ? formatDate(item.subscribedAt) : '—'}
              {item.country ? ` · ${item.country}` : ''}
            </Text>
          </View>
          <View style={styles.right}>
            <Pill label={String(item.tier).toUpperCase()} color={colors.primary} icon="workspace-premium" />
            <Text style={[styles.meta, item.daysLeft != null && item.daysLeft <= 7 && { color: colors.pendingDelivery }]}>
              {item.expiresAt ? `Renews/expires ${formatDate(item.expiresAt)}` : 'No expiry'}
            </Text>
          </View>
        </View>
      );
    case 'schools':
      return (
        <View style={styles.schoolListCell}>
          <SchoolBillingCard school={item} onPress={() => onEdit(item)} />
        </View>
      );
  }
}

/** Edit a school's billing, or record that it paid. */
function BillingSheet({ school, onClose, onSaved }: { school: Data | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const styles = useStyles();
  const [form, setForm] = useState({ amount: '', currency: 'NGN', cycle: 'yearly', due: '', note: '' });
  const [saving, setSaving] = useState<'save' | 'paid' | null>(null);

  useEffect(() => {
    if (!school) return;
    setForm({
      amount: school.amount != null ? String(school.amount) : '',
      currency: school.currency || 'NGN',
      cycle: school.cycle || 'yearly',
      due: school.nextPaymentDue ? String(school.nextPaymentDue).slice(0, 10) : '',
      note: school.note || '',
    });
  }, [school]);

  const dueValid = !form.due || /^\d{4}-\d{2}-\d{2}$/.test(form.due);
  const submit = async (markPaid: boolean) => {
    if (!school) return;
    setSaving(markPaid ? 'paid' : 'save');
    try {
      const result = await updateSchoolBilling(school.id, {
        amount: form.amount ? Number(form.amount) : undefined,
        currency: form.currency,
        cycle: form.cycle,
        nextPaymentDue: form.due ? new Date(`${form.due}T00:00:00`).toISOString() : null,
        note: form.note,
        markPaid,
      });
      toast('success', result.message, school.name);
      onSaved();
      onClose();
    } catch (reason) {
      toast('error', errorMessage(reason), 'Billing');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Sheet visible={Boolean(school)} onClose={() => !saving && onClose()} variant="dialog" maxWidth={520}>
      {school ? (
        <>
          <Text style={styles.sheetTitle}>{school.name}</Text>
          <Text style={styles.meta}>
            {school.tierLabel} plan · {dueText(school)}
          </Text>
          <View style={styles.sheetGap} />
          <OptionPicker
            label="Billing cycle"
            value={form.cycle as 'monthly' | 'termly' | 'yearly'}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'termly', label: 'Every 4 months' },
              { value: 'yearly', label: 'Yearly' },
            ]}
            onChange={cycle => setForm({ ...form, cycle })}
          />
          <View style={styles.formRow}>
            <Field style={styles.flex} label="Amount" keyboardType="numeric" value={form.amount} onChangeText={amount => setForm({ ...form, amount: amount.replace(/[^\d.]/g, '') })} />
            <Field style={styles.currencyField} label="Currency" value={form.currency} onChangeText={currency => setForm({ ...form, currency: currency.toUpperCase().slice(0, 3) })} />
          </View>
          <Field label="Next payment due (YYYY-MM-DD)" value={form.due} onChangeText={due => setForm({ ...form, due })} placeholder="2027-01-31" />
          {!dueValid ? <Text style={styles.error}>Use the format YYYY-MM-DD.</Text> : null}
          <Field label="Note" value={form.note} onChangeText={note => setForm({ ...form, note })} placeholder="Invoice number, contact, terms…" />
          <View style={styles.formRow}>
            <Button title="Save" variant="outline" onPress={() => void submit(false)} loading={saving === 'save'} disabled={!dueValid || saving !== null} style={styles.flex} />
            <Button title="Record payment" icon="check" variant="success" onPress={() => void submit(true)} loading={saving === 'paid'} disabled={!dueValid || saving !== null} style={styles.flex} />
          </View>
          <Text style={styles.meta}>Recording a payment moves the due date forward by one billing cycle.</Text>
        </>
      ) : null}
    </Sheet>
  );
}

/** "View all" for a finance section, with period, filter, search, pages and export. */
export function FinanceSection({
  section,
  status: initialStatus,
  year: initialYear,
  period: initialPeriod,
  embedded = false,
}: {
  section: FinanceSectionId;
  status?: string;
  year?: number;
  period?: FinancePeriod;
  /** Shown as a tab rather than pushed, so there's nothing to go back to. */
  embedded?: boolean;
}) {
  const toast = useToast();
  const styles = useStyles();
  const meta = SECTION_META[section];
  const [year, setYear] = useState(initialYear ?? new Date().getFullYear());
  const [period, setPeriod] = useState<FinancePeriod>(initialPeriod ?? Math.floor(new Date().getMonth() / 4) + 1);
  const [status, setStatus] = useState(initialStatus ?? 'all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Data | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await getFinanceSection(section, { year, period, status, q: search, page }));
    } catch (reason) {
      toast('error', errorMessage(reason), 'Fetch Error');
      setResult(previous => previous ?? { items: [], total: 0, page: 1, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [page, period, search, section, status, toast, year]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const option = EXPORT_OPTIONS.find(o => o.value === section);
  return (
    <View style={styles.flex}>
      <PageHeader
        back={!embedded}
        title={meta.title}
        subtitle={`${result?.period?.label ?? 'As of today'}${result ? ` · ${formatCount(result.total)} total` : ''}`}
        right={
          option ? (
            <ExportButton
              title={`Export ${meta.title.toLowerCase()}`}
              scopeNote={`${result?.period?.label ?? 'As of today'}${status !== 'all' ? ` · ${formatLabel(status)}` : ''}`}
              options={[option]}
              onExport={sections => exportFinanceData({ sections, year, period, status })}
            />
          ) : undefined
        }
      />
      <ScrollPage contentContainerStyle={styles.sectionContent}>
        {meta.dated ? (
          <PeriodBar
            year={year}
            period={period}
            onChange={(y, p) => {
              setYear(y);
              setPeriod(p);
              setPage(1);
            }}
          />
        ) : null}
        {meta.filters ? (
          <FilterChips
            value={status}
            onChange={value => {
              setStatus(value);
              setPage(1);
            }}
            options={meta.filters}
          />
        ) : null}
        <Field icon="search" placeholder="Search this list" value={query} onChangeText={setQuery} />
        {!result ? (
          <Loading />
        ) : result.items.length === 0 ? (
          <EmptyState icon={meta.icon} title="Nothing here" subtitle={search ? `No results for "${search}".` : 'Nothing matches these filters.'} />
        ) : (
          <View style={[section === 'schools' ? styles.schoolGrid : styles.list, loading && styles.dim]}>
            {result.items.map((item: Data, index: number) => (
              <SectionRow key={String(item.transactionId ?? item.orderId ?? item.id ?? item.uid ?? item.sellerId ?? item.txRef ?? index)} section={section} item={item} onEdit={setEditing} />
            ))}
          </View>
        )}
        {result && result.totalPages > 1 ? (
          <View style={styles.pager}>
            <Button compact variant="outline" icon="chevron-left" title="Previous" disabled={page <= 1 || loading} onPress={() => setPage(page - 1)} />
            <Text style={styles.meta}>
              Page {result.page} of {result.totalPages}
            </Text>
            <Button compact variant="outline" icon="chevron-right" title="Next" disabled={page >= result.totalPages || loading} onPress={() => setPage(page + 1)} />
          </View>
        ) : null}
      </ScrollPage>
      <BillingSheet school={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
    </View>
  );
}

/** The School Billing tab: the schools list without the back button. */
export function SchoolBillingTab() {
  return <FinanceSection section="schools" embedded />;
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    page: { paddingBottom: 120 },
    flex: { flex: 1, minWidth: 0 },
    center: { alignItems: 'center', justifyContent: 'center' },
    dim: { opacity: 0.55 },
    right: { alignItems: 'flex-end', gap: 4 },
    meta: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
    error: { fontSize: 12, color: c.criticalSeverity, marginTop: -10, marginBottom: 12 },
    periodBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 },
    periodNote: { marginBottom: 14 },
    subTitle: { fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 10, color: c.textDarker },
    rowTitle: { fontSize: 13.5, fontWeight: '700', color: c.textDarker },
    rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    listRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    meterCell: { flexBasis: 220, flexGrow: 1, maxWidth: 320 },
    periodTotals: { flexDirection: 'row', gap: 8, marginTop: 12 },
    periodTotal: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.surfaceRaised, gap: 2 },
    footLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: c.textMuted },
    tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    schoolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    schoolCell: { flexGrow: 1, flexBasis: 300 },
    schoolListCell: { flexGrow: 1, flexBasis: 320 },
    schoolCard: { borderRadius: 16, borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.surfaceRaised, overflow: 'hidden' },
    schoolStripe: { height: 4 },
    schoolHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    schoolLogo: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.backgroundSecondary },
    schoolFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.borderSubtle },
    sectionContent: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingBottom: 60 },
    list: { borderRadius: 18, borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.backgroundSecondary, paddingHorizontal: 16 },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 },
    sheetTitle: { fontSize: 18, fontWeight: '900', color: c.textDarker },
    sheetGap: { height: 14 },
    formRow: { flexDirection: 'row', gap: 10 },
    currencyField: { width: 110 },
  }),
);
