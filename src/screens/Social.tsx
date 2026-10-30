import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
// Deep import: only the Font Awesome font ships, for the platform logos.
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { exportSocialData, getSocialOverview, refreshSocialStats } from '../api';
import { AreaChart, BarChart, Sparkline } from '../charts';
import { Cell, ExportButton, fmtPct, Grid, StatCard, StatRow, Tiles } from '../dashboard';
import { errorMessage, useSession, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { makeStyles, useColors } from '../theme';
import { Button, Card, EmptyState, FilterChips, formatCount, formatDate, fromNow, Loading, Pill, ScrollPage, SectionHeader } from '../ui';

/**
 * The iCampus social accounts over time: followers, posts and impressions per
 * platform, built from daily snapshots the backend takes. The scorecard
 * compares growth since the paid manager started with the 90 days before.
 * Links and credentials live in the backend .env.
 */

type Data = Record<string, any>;

// Logo glyph and brand colour for each platform's identity mark only; charts
// and text keep the dashboard's own tokens.
const BRANDS: Record<string, { glyph: string; color: string }> = {
  x: { glyph: 'x-twitter', color: '#000000' },
  instagram: { glyph: 'instagram', color: '#E1306C' },
  facebook: { glyph: 'facebook', color: '#1877F2' },
  threads: { glyph: 'threads', color: '#000000' },
  tiktok: { glyph: 'tiktok', color: '#000000' },
  youtube: { glyph: 'youtube', color: '#FF0000' },
  linkedin: { glyph: 'linkedin', color: '#0A66C2' },
};

const RANGES = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '6 months' },
  { value: '365', label: '1 year' },
] as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (key: string) => {
  const [, m, d] = String(key).split('-').map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : key;
};

/** Thins daily points to ~12 labelled points so long ranges stay readable. */
const thin = (days: string[], ...series: Array<Array<number | null>>) => {
  const step = Math.max(1, Math.ceil(days.length / 12));
  const idx = days.map((_, i) => i).filter(i => i % step === 0 || i === days.length - 1);
  return { labels: idx.map(i => dayLabel(days[i])), series: series.map(s => idx.map(i => s[i] ?? null)) };
};

const signed = (n: number | null | undefined) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCount(Math.abs(n))}`);

const VERDICTS: Record<string, { label: string; icon: IconName; tone: 'success' | 'warning' | 'critical' | 'muted'; text: string }> = {
  improving: { label: 'Working', icon: 'trending-up', tone: 'success', text: 'Followers are growing faster than before the manager started.' },
  growing: { label: 'Growing', icon: 'trending-up', tone: 'success', text: 'Followers are growing. There is no earlier history to compare with.' },
  flat: { label: 'No change', icon: 'trending-flat', tone: 'warning', text: 'Growth is about the same as before the manager started.' },
  slower: { label: 'Slower than before', icon: 'trending-down', tone: 'warning', text: 'Followers grow more slowly than before the manager started.' },
  declining: { label: 'Declining', icon: 'trending-down', tone: 'critical', text: 'The accounts are losing followers overall.' },
  too_early: { label: 'Too early to tell', icon: 'hourglass-empty', tone: 'muted', text: 'Needs at least two weeks of daily snapshots since the start date.' },
};

export function PlatformLogo({ id, size = 22 }: { id: string; size?: number }) {
  const colors = useColors();
  const brand = BRANDS[id];
  if (!brand) return <Icon name="public" size={size} color={colors.textMuted} />;
  // Black marks would vanish on the dark theme.
  const color = brand.color === '#000000' ? colors.textDarker : brand.color;
  return <FontAwesome6 name={brand.glyph as any} brand size={size} color={color} />;
}

function Scorecard({ card, totals }: { card: Data; totals: Data }) {
  const colors = useColors();
  const styles = useStyles();
  if (card.status === 'not_set') {
    return (
      <Card>
        <SectionHeader icon="assignment-ind" title="Is the social media manager working?" subtitle="Set the manager's start date to compare growth before and after" />
        <Text style={styles.meta}>
          Add <Text style={styles.code}>SOCIAL_MANAGER_NAME</Text> and <Text style={styles.code}>SOCIAL_MANAGER_START_DATE</Text> (YYYY-MM-DD) to the
          backend .env file. The scorecard then compares follower growth since that date with the 90 days before it.
        </Text>
      </Card>
    );
  }
  const verdict = VERDICTS[card.verdict] ?? VERDICTS.too_early;
  const tone = { success: colors.success, warning: colors.pendingDelivery, critical: colors.criticalSeverity, muted: colors.textMuted }[verdict.tone];
  return (
    <Card style={[styles.scorecard, { borderColor: tone + '66' }]}>
      <View style={styles.scoreHead}>
        <View style={[styles.scoreIcon, { backgroundColor: tone + '1A' }]}>
          <Icon name={verdict.icon} size={28} color={tone} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>SOCIAL MEDIA MANAGER{card.name ? ` · ${String(card.name).toUpperCase()}` : ''}</Text>
          <Text style={styles.scoreTitle}>{verdict.label}</Text>
          <Text style={styles.meta}>
            {verdict.text} Started {formatDate(card.startDate)} ({card.daysIn} days ago).
          </Text>
        </View>
        <Pill label={verdict.label.toUpperCase()} icon={verdict.icon} color={tone} />
      </View>
      <View style={styles.compare}>
        <View style={styles.compareCol}>
          <Text style={styles.eyebrow}>90 DAYS BEFORE</Text>
          <Text style={styles.compareValue}>{card.before ? `${signed(card.before.followersPer30Days)}` : '—'}</Text>
          <Text style={styles.meta}>{card.before ? `followers / 30 days · ${card.before.postsPerWeek ?? '—'} posts a week` : 'No snapshots from before the start date'}</Text>
        </View>
        <Icon name="arrow-forward" size={22} color={colors.textMuted} />
        <View style={styles.compareCol}>
          <Text style={styles.eyebrow}>SINCE STARTING</Text>
          <Text style={[styles.compareValue, { color: tone }]}>{card.after ? `${signed(card.after.followersPer30Days)}` : '—'}</Text>
          <Text style={styles.meta}>{card.after ? `followers / 30 days · ${card.after.postsPerWeek ?? '—'} posts a week` : 'Not enough snapshots yet'}</Text>
        </View>
        <View style={styles.compareCol}>
          <Text style={styles.eyebrow}>AUDIENCE NOW</Text>
          <Text style={styles.compareValue}>{formatCount(totals.followers)}</Text>
          <Text style={styles.meta}>across {totals.tracked} tracked accounts</Text>
        </View>
      </View>
    </Card>
  );
}

function PlatformCard({ platform, days }: { platform: Data; days: string[] }) {
  const { admin } = useSession();
  const colors = useColors();
  const styles = useStyles();
  const g = platform.followersGrowth;
  const status = !platform.connected
    ? { label: platform.url ? 'LINK ONLY' : 'NOT SET UP', color: colors.textMuted, icon: 'link' as IconName }
    : platform.lastError
      ? { label: 'NEEDS ATTENTION', color: colors.criticalSeverity, icon: 'error-outline' as IconName }
      : platform.current
        ? { label: 'TRACKING', color: colors.success, icon: 'check-circle' as IconName }
        : { label: 'WAITING FOR FIRST SNAPSHOT', color: colors.pendingDelivery, icon: 'schedule' as IconName };
  const chart = thin(days, platform.series.followers);
  return (
    <View style={styles.platform}>
      <View style={styles.platformHead}>
        <View style={styles.logoWrap}>
          <PlatformLogo id={platform.id} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.platformName}>{platform.name}</Text>
          {platform.url ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(platform.url)}>
              <Text numberOfLines={1} style={[styles.meta, styles.link, { color: colors.primary }]}>{platform.url.replace(/^https?:\/\/(www\.)?/, '')}</Text>
            </Pressable>
          ) : (
            <Text style={styles.meta}>No profile link set</Text>
          )}
        </View>
        <Pill label={status.label} icon={status.icon} color={status.color} />
      </View>

      {platform.current ? (
        <>
          <View style={styles.platformStats}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>FOLLOWERS</Text>
              <Text style={styles.big}>{formatCount(platform.current.followers)}</Text>
              <Text style={[styles.meta, { color: (g.change ?? 0) > 0 ? colors.success : (g.change ?? 0) < 0 ? colors.criticalSeverity : colors.textMuted }]}>
                {signed(g.change)} {g.pct != null ? `(${g.pct > 0 ? '+' : ''}${g.pct}%)` : ''} in range
              </Text>
            </View>
            <View style={styles.sparkCol}>
              <Text style={styles.eyebrow}>IMPRESSIONS</Text>
              <Sparkline data={platform.series.impressions.filter((v: number | null) => v != null)} color={colors.series1} width={110} height={34} />
            </View>
          </View>
          <AreaChart height={130} labels={chart.labels} series={[{ name: 'Followers', color: colors.primary, values: chart.series[0] }]} />
          <Tiles
            items={[
              { label: 'Total posts', value: formatCount(platform.current.posts) },
              { label: 'Posts in range', value: signed(platform.postsInRange) },
              { label: platform.impressionsLabel, value: formatCount(platform.impressions28d) },
            ]}
          />
          <Text style={styles.meta}>
            Updated {platform.lastSnapshotAt ? fromNow(platform.lastSnapshotAt) : '—'}
            {platform.lastError ? ` · Last attempt failed: ${platform.lastError}` : ''}
          </Text>
        </>
      ) : platform.connected ? (
        <Text style={[styles.meta, styles.pad]}>
          {platform.lastError ? `The last attempt failed: ${platform.lastError}` : 'Credentials are set. Press Refresh now, or wait for tonight\'s snapshot.'}
        </Text>
      ) : (
        <View style={styles.pad}>
          <Text style={styles.meta}>Add these to the backend .env file to start tracking:</Text>
          {admin.adminType === 'super_admin' || admin.adminType === 'social_media' ? (
            <View style={styles.keys}>
              {platform.missing.map((key: string) => (
                <Text key={key} style={styles.code}>{key}</Text>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

export function SocialOverview({ header }: { header?: React.ReactNode }) {
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getSocialOverview(days));
    } catch (reason) {
      toast('error', errorMessage(reason), 'Social Media');
    } finally {
      setLoading(false);
    }
  }, [days, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshSocialStats();
      const failed = result.results.filter(r => !r.ok);
      toast(failed.length ? 'info' : 'success', result.message, 'Refreshed');
      await load();
    } catch (reason) {
      toast('error', errorMessage(reason), 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  if (!data) {
    return (
      <ScrollPage contentContainerStyle={styles.page}>
        {header}
        {loading ? (
          <Loading label="Loading social media..." />
        ) : (
          <EmptyState icon="wifi-off" title="Couldn't load social media stats" buttonText="Try again" buttonIcon="refresh" onPress={() => void load()} />
        )}
      </ScrollPage>
    );
  }

  const { totals, platforms } = data;
  const tracked = platforms.filter((p: Data) => p.current);
  const totalChart = thin(data.days, totals.series);
  return (
    <ScrollPage contentContainerStyle={styles.page}>
      {header}
      <View style={styles.toolbar}>
        <FilterChips value={String(days)} onChange={value => setDays(Number(value))} options={RANGES} />
        <View style={styles.flex} />
        <Button compact variant="soft" icon="refresh" title="Refresh now" loading={refreshing} onPress={() => void refresh()} />
        <ExportButton
          title="Export social media report"
          scopeNote={`Last ${data.range} days: summary, daily figures per platform and the manager scorecard.`}
          options={[{ value: 'social', label: 'Social media report' }]}
          onExport={() => exportSocialData(days)}
        />
      </View>

      <View style={loading ? styles.dim : null}>
        <Scorecard card={data.scorecard} totals={totals} />

        <StatRow>
          <StatCard
            icon="groups"
            label="Total audience"
            tone={colors.primary}
            value={formatCount(totals.followers)}
            trend={totals.series.filter((v: number | null) => v != null)}
            hint={`${signed(totals.followersGrowth.change)} followers in ${data.range} days${totals.followersGrowth.pct != null ? ` (${fmtPct(totals.followersGrowth.pct)})` : ''}`}
          />
          <StatCard icon="post-add" label={`Posts in ${data.range} days`} tone={colors.info} value={signed(totals.postsInRange)} hint="Across tracked accounts" />
          <StatCard icon="visibility" label="Impressions (28 days)" tone={colors.success} value={formatCount(totals.impressions28d)} hint="Reach, views or impressions, as each platform reports them" />
          <StatCard icon="hub" label="Accounts tracked" tone={colors.pendingDelivery} value={`${totals.tracked}/${platforms.length}`} hint={`${totals.connected} connected in .env`} />
        </StatRow>

        {tracked.length ? (
          <Grid>
            <Cell wide>
              <Card>
                <SectionHeader
                  icon="show-chart"
                  title="Audience over time"
                  subtitle={`Followers across all tracked accounts${data.manager.startDate ? ` · manager started ${formatDate(data.manager.startDate)}` : ''}`}
                />
                <AreaChart labels={totalChart.labels} series={[{ name: 'Total followers', color: colors.primary, values: totalChart.series[0] }]} />
              </Card>
            </Cell>
            <Cell>
              <Card>
                <SectionHeader icon="leaderboard" title="Followers by platform" subtitle="Right now" />
                <BarChart
                  color={colors.series1}
                  data={tracked.map((p: Data) => ({ label: p.name.replace(' (Twitter)', ''), value: p.current.followers }))}
                />
                <Text style={styles.subTitle}>Growth in range</Text>
                {tracked.map((p: Data) => (
                  <View key={p.id} style={styles.growthRow}>
                    <PlatformLogo id={p.id} size={14} />
                    <Text numberOfLines={1} style={[styles.rowTitle, styles.flex]}>{p.name}</Text>
                    <Text style={[styles.rowTitle, { color: (p.followersGrowth.change ?? 0) >= 0 ? colors.success : colors.criticalSeverity }]}>
                      {signed(p.followersGrowth.change)}
                    </Text>
                    <Text style={styles.share}>{p.followersGrowth.pct != null ? `${p.followersGrowth.pct}%` : '—'}</Text>
                  </View>
                ))}
              </Card>
            </Cell>
          </Grid>
        ) : (
          <Card>
            <EmptyState
              icon="insights"
              title="No snapshots yet"
              subtitle="Add each platform's credentials to the backend .env file. A snapshot is taken every night at 02:15; trends appear as the days add up. Press Refresh now to take today's."
            />
          </Card>
        )}

        <SectionHeader icon="apps" title="Platforms" subtitle="Each account's followers, posts and impressions" />
        <View style={styles.platforms}>
          {platforms.map((p: Data) => (
            <View key={p.id} style={styles.platformCell}>
              <PlatformCard platform={p} days={data.days} />
            </View>
          ))}
        </View>
        <Text style={[styles.meta, styles.footnote]}>
          Generated {formatDate(data.generatedAt, true)}. Impressions mean different things per platform (reach, views or impressions); compare a platform with
          itself over time rather than platforms with each other.
        </Text>
      </View>
    </ScrollPage>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    page: { paddingBottom: 120 },
    flex: { flex: 1, minWidth: 0 },
    dim: { opacity: 0.55 },
    pad: { paddingVertical: 10, gap: 8 },
    meta: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
    link: { textDecorationLine: 'underline' },
    code: { fontFamily: 'monospace', fontSize: 12, color: c.textDarker, backgroundColor: c.surfaceRaised, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9, color: c.textMuted },
    subTitle: { fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 8, color: c.textDarker },
    rowTitle: { fontSize: 13, fontWeight: '700', color: c.textDarker },
    share: { width: 52, textAlign: 'right', fontSize: 12, color: c.textMuted },
    toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 },
    scorecard: { borderWidth: 1.5 },
    scoreHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
    scoreIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    scoreTitle: { fontSize: 24, fontWeight: '900', color: c.textDarker, letterSpacing: -0.4, marginVertical: 2 },
    compare: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginTop: 18, padding: 16, borderRadius: 16, backgroundColor: c.surfaceRaised },
    compareCol: { flexGrow: 1, flexBasis: 160, gap: 2 },
    compareValue: { fontSize: 26, fontWeight: '900', color: c.textDarker, letterSpacing: -0.5 },
    growthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    platforms: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    platformCell: { flexGrow: 1, flexBasis: 340, minWidth: 0 },
    platform: { padding: 18, borderRadius: 20, borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.backgroundSecondary, gap: 10 },
    platformHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    logoWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderSubtle },
    platformName: { fontSize: 15, fontWeight: '800', color: c.textDarker },
    platformStats: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
    sparkCol: { alignItems: 'flex-end', gap: 4 },
    big: { fontSize: 28, fontWeight: '900', color: c.textDarker, letterSpacing: -0.6 },
    footnote: { marginTop: 16, textAlign: 'center' },
  }),
);

/** Compact card for the super admin's overview: audience, growth and the manager verdict. */
export function SocialSummaryCard({ onViewAll }: { onViewAll: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    getSocialOverview(30)
      .then(setData)
      .catch(() => setData(null));
  }, []);
  if (!data) return null;
  const verdict = data.scorecard.status === 'set' ? VERDICTS[data.scorecard.verdict] : null;
  const tracked = data.platforms.filter((p: Data) => p.current);
  return (
    <Card>
      <SectionHeader
        icon="share"
        title="Social media"
        subtitle={`${data.totals.tracked} of ${data.platforms.length} accounts tracked · last 30 days`}
        right={verdict ? <Pill label={verdict.label.toUpperCase()} icon={verdict.icon} color={verdict.tone === 'success' ? colors.success : verdict.tone === 'critical' ? colors.criticalSeverity : colors.pendingDelivery} /> : undefined}
        onViewAll={onViewAll}
      />
      <Tiles
        items={[
          { label: 'Total audience', value: formatCount(data.totals.followers), icon: 'groups' },
          { label: 'Follower change', value: signed(data.totals.followersGrowth.change), icon: 'trending-up' },
          { label: 'Posts', value: signed(data.totals.postsInRange), icon: 'post-add' },
          { label: 'Impressions (28 days)', value: formatCount(data.totals.impressions28d), icon: 'visibility' },
        ]}
      />
      {tracked.length ? (
        <View style={styles.keys}>
          {tracked.map((p: Data) => (
            <View key={p.id} style={styles.growthRow}>
              <PlatformLogo id={p.id} size={14} />
              <Text style={styles.rowTitle}>{formatCount(p.current.followers)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.meta}>No accounts connected yet. Add their credentials to the backend .env file.</Text>
      )}
    </Card>
  );
}
