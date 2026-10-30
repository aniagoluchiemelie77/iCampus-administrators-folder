import React, { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { exportSchoolData, getAdminMetrics } from '../api';
import { AreaChart, BarChart, Delta, DonutChart, Heatmap, Legend, MeterRow, RingGauge, Sparkline, StackedBarChart } from '../charts';
import { ExportButton, ExportOption } from '../dashboard';
import { errorMessage, isSchoolAdmin, isSchoolAdminA, SchoolSectionId, useNavigation, useSession, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { makeStyles, useColors } from '../theme';
import {
  Button,
  Card,
  EmptyState,
  FilterChips,
  formatCount,
  formatDate,
  fromNow,
  Loading,
  Pill,
  ScrollPage,
  SectionHeader,
  TabStrip,
} from '../ui';

/**
 * Institution analytics for school administrators, gated by the school's plan
 * (Basic → Professional → Enterprise). Institution representatives can narrow
 * every section to one department; department representatives only ever get
 * their own department (the server enforces this, the UI just reflects it).
 */

type Metrics = Record<string, any>;

const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);
const fmtNum = formatCount;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-03" → "Mar". */
const monthLabel = (month: string) => MONTHS[Number(String(month).split('-')[1]) - 1] ?? month;
/** "2026-03-09" → "9 Mar". */
const weekLabel = (week: string) => {
  const [, month, day] = String(week).split('-').map(Number);
  return month && day ? `${day} ${MONTHS[month - 1]}` : week;
};
const clock = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';

function Tiles({ items }: { items: Array<{ label: string; value: string; tone?: string; icon?: IconName }> }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.tiles}>
      {items.map(item => (
        <View key={item.label} style={styles.tile}>
          {item.icon ? <Icon name={item.icon} size={16} color={item.tone || colors.textMuted} /> : null}
          <Text style={[styles.tileValue, item.tone ? { color: item.tone } : null]}>{item.value}</Text>
          <Text style={styles.tileLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function PlanBadge({ label }: { label: string }) {
  const colors = useColors();
  return <Pill label={label.toUpperCase()} icon="workspace-premium" color={label === 'Basic' ? colors.info : colors.primary} />;
}

function LockedCard({ label, features }: { label: string; features: string[] }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.locked}>
      <View style={styles.lockedHead}>
        <View style={[styles.lockedIcon, { backgroundColor: colors.primary + '17' }]}>
          <Icon name="lock" size={18} color={colors.primary} />
        </View>
        <Text style={styles.lockedTitle}>{label} analytics</Text>
      </View>
      <Text style={styles.muted}>Available on the {label} plan. Upgrading adds:</Text>
      <View style={styles.featureGrid}>
        {features.map(feature => (
          <View key={feature} style={styles.featureRow}>
            <Icon name="check-circle" size={15} color={colors.primary} />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.muted}>Contact the iCampus team to change your institution's plan.</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// KPIs: this month against last month
// ---------------------------------------------------------------------------

function KpiCard({
  icon,
  label,
  tone,
  kpi,
  hint,
}: {
  icon: IconName;
  label: string;
  tone: string;
  kpi: { current: number; previous: number; series: Array<{ value: number }> };
  hint: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.kpi}>
      <View style={[styles.kpiGlow, { backgroundColor: tone + '10' }]} />
      <View style={styles.kpiTop}>
        <View style={[styles.kpiIcon, { backgroundColor: tone + '1A' }]}>
          <Icon name={icon} size={22} color={tone} />
        </View>
        <Sparkline data={kpi.series.map(point => point.value)} color={tone} width={104} height={38} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{fmtNum(kpi.current)}</Text>
      <Delta current={kpi.current} previous={kpi.previous} suffix={`vs ${fmtNum(kpi.previous)} last month`} />
      <Text style={styles.kpiHint}>{hint}</Text>
    </View>
  );
}

type TrendKey = 'students' | 'lecturers' | 'classes';

function MonthlyTrend({ kpis }: { kpis: Metrics }) {
  const colors = useColors();
  const [key, setKey] = useState<TrendKey>('students');
  const series = kpis[key].series as Array<{ month: string; value: number }>;
  const names: Record<TrendKey, string> = { students: 'Students enrolled', lecturers: 'Lecturers enrolled', classes: 'Classes scheduled' };
  return (
    <Card>
      <SectionHeader icon="show-chart" title="Six-month trend" subtitle="Monthly totals; hover a month for its value" />
      <TabStrip
        tabs={[
          { id: 'students', label: 'Students', icon: 'school' },
          { id: 'lecturers', label: 'Lecturers', icon: 'co-present' },
          { id: 'classes', label: 'Classes', icon: 'event' },
        ]}
        active={key}
        onChange={setKey}
      />
      <AreaChart
        labels={series.map(point => monthLabel(point.month))}
        series={[{ name: names[key], color: colors.primary, values: series.map(point => point.value) }]}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Live lectures
// ---------------------------------------------------------------------------

function PulseDot({ color }: { color: string }) {
  const pulse = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={pulseStyles.wrap}>
      <Animated.View
        style={[
          pulseStyles.ring,
          { backgroundColor: color, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] },
        ]}
      />
      <View style={[pulseStyles.dot, { backgroundColor: color }]} />
    </View>
  );
}

function LectureRow({ lecture, live }: { lecture: Record<string, any>; live: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const rate = lecture.enrolled > 0 ? Math.round((lecture.checkIns / lecture.enrolled) * 100) : null;
  return (
    <View style={styles.lectureRow}>
      <View style={[styles.lectureIcon, { backgroundColor: (live ? colors.success : colors.info) + '1A' }]}>
        <Icon name={lecture.lectureType === 'Physical' ? 'meeting-room' : 'videocam'} size={18} color={live ? colors.success : colors.info} />
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {lecture.courseCode ? `${lecture.courseCode} · ` : ''}
          {lecture.topicName}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {lecture.host} · {lecture.lectureType}
          {lecture.location ? ` · ${lecture.location}` : ''} · {clock(lecture.startsAt)}
          {lecture.endsAt ? `–${clock(lecture.endsAt)}` : ''}
        </Text>
      </View>
      {live ? (
        <View style={styles.lectureStat}>
          <Text style={styles.rowTitle}>
            {fmtNum(lecture.checkIns)}/{fmtNum(lecture.enrolled)}
          </Text>
          <Text style={styles.rowMeta}>{rate === null ? 'checked in' : `${rate}% in`}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LiveSection({ live, onViewAll }: { live: Metrics; onViewAll: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Card>
      <SectionHeader
        icon="podcasts"
        title="Lectures right now"
        subtitle={`${fmtNum(live.todayCount)} scheduled today · ${fmtNum(live.completedToday)} finished`}
        onViewAll={onViewAll}
      />
      <View style={styles.liveHead}>
        {live.ongoingCount > 0 ? <PulseDot color={colors.success} /> : <View style={[pulseStyles.dot, { backgroundColor: colors.textMuted }]} />}
        <Text style={styles.liveCount}>{fmtNum(live.ongoingCount)}</Text>
        <Text style={styles.muted}>{live.ongoingCount === 1 ? 'lecture in progress' : 'lectures in progress'}</Text>
      </View>
      {live.ongoing.map((lecture: Record<string, any>) => (
        <LectureRow key={lecture.id} lecture={lecture} live />
      ))}
      {live.upcomingToday.length > 0 ? (
        <>
          <Text style={styles.subTitle}>Later today</Text>
          {live.upcomingToday.map((lecture: Record<string, any>) => (
            <LectureRow key={lecture.id} lecture={lecture} live={false} />
          ))}
        </>
      ) : live.ongoingCount === 0 ? (
        <Text style={styles.muted}>No more lectures today.</Text>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Online vs physical classes
// ---------------------------------------------------------------------------

/** What a school rep can export, by plan. */
export const schoolExportOptions = (access?: { professional?: boolean; enterprise?: boolean }): ExportOption[] => [
  { value: 'overview', label: 'Institution summary', hint: 'Headline figures and lectures by month' },
  { value: 'courses', label: 'Courses this session' },
  { value: 'lectures', label: 'Lectures this session', hint: 'Every lecture with type, host and check-ins' },
  { value: 'announcements', label: 'Announcements this session' },
  { value: 'students', label: 'Students', personal: true, hint: 'Name, matric number, department, level' },
  { value: 'lecturer-accounts', label: 'Lecturers', personal: true, hint: 'Name, staff ID, department' },
  ...(access?.professional ? [{ value: 'lecturers', label: 'Lecturer activity', personal: true }] : []),
  ...(access?.enterprise ? [{ value: 'at-risk', label: 'Students at risk', personal: true }] : []),
];

function LectureModesCard({ modes, department, onViewAll }: { modes: Metrics; department: string | null; onViewAll: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const held = modes.physical + modes.online;
  const byMonth = modes.byMonth as Array<{ month: string; physical: number; online: number }>;
  const depts = (modes.byDepartment as Array<{ department: string; physical: number; online: number }>).slice(0, 6);
  return (
    <Card>
      <SectionHeader icon="cast-for-education" title="Online vs physical classes" subtitle="How lectures are delivered this session" onViewAll={onViewAll} />
      <View style={styles.grid}>
        <View style={styles.gridHalf}>
          <Text style={styles.subTitle}>Lectures held so far</Text>
          {held > 0 ? (
            <DonutChart
              centerLabel="lectures held"
              formatValue={v => fmtNum(v)}
              segments={[
                { label: 'Physical', value: modes.physical, color: colors.series1 },
                { label: 'Online', value: modes.online, color: colors.series2 },
              ]}
            />
          ) : (
            <Text style={styles.muted}>No lectures held yet this session.</Text>
          )}
          <Text style={styles.subTitle}>Attendance by class type</Text>
          <MeterRow label="Physical" value={modes.attendanceRatePct.physical} color={colors.series1} />
          <MeterRow label="Online" value={modes.attendanceRatePct.online} color={colors.series2} />
        </View>
        <View style={styles.gridHalf}>
          <Text style={styles.subTitle}>Scheduled per month</Text>
          <StackedBarChart
            labels={byMonth.map(m => monthLabel(m.month))}
            series={[
              { name: 'Physical', color: colors.series1, values: byMonth.map(m => m.physical) },
              { name: 'Online', color: colors.series2, values: byMonth.map(m => m.online) },
            ]}
          />
          {!department && depts.length > 1 ? (
            <>
              <Text style={styles.subTitle}>Online share by department</Text>
              {depts.map(d => (
                <MeterRow
                  key={d.department}
                  label={d.department}
                  value={d.physical + d.online > 0 ? Math.round((d.online / (d.physical + d.online)) * 100) : null}
                  color={colors.series2}
                  sub={`${fmtNum(d.physical)} physical · ${fmtNum(d.online)} online`}
                />
              ))}
            </>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------

export function SchoolAnalyticsView({
  metrics,
  department,
  onDepartmentChange,
  canFilter,
  onSessionChange,
}: {
  metrics: Metrics;
  department: string | null;
  onDepartmentChange?: (department: string | null) => void;
  canFilter: boolean;
  /** Omitted where the session can't be changed (e.g. a super admin's preview). */
  onSessionChange?: (session: string) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { push, setTab } = useNavigation();
  const { admin } = useSession();
  const { basic, professional: pro, enterprise: ent, institution: inst, kpis, live } = metrics;
  const lockedFor = (tier: string) => metrics.locked?.find((item: any) => item.tier === tier);
  const departments: string[] = metrics.scope?.departments ?? [];
  const scopeLabel = department || 'All departments';
  const sessionLabel: string = metrics.session?.label ?? '';
  const isCurrent = metrics.session?.isCurrent !== false;
  const sessions: string[] = metrics.sessions ?? [];
  const viewAll = (section: SchoolSectionId, filter?: string) => () =>
    push({ name: 'schoolSection', section, department, filter, session: sessionLabel });
  // "This month" only makes sense for the current session.
  const thisMonth = isCurrent ? 'this month' : 'in its last month';
  const lastMonth = isCurrent ? 'last month' : 'the month before';

  if (!basic || !kpis) return null;
  const attendance = basic.attendance;

  return (
    <View>
      <View style={styles.hero}>
        {inst?.logo ? <Image source={{ uri: inst.logo }} style={styles.heroLogo} /> : null}
        <View style={styles.flex}>
          <Text numberOfLines={2} style={styles.heroName}>{inst?.name || 'Your institution'}</Text>
          <Text style={styles.muted}>
            {scopeLabel} · updated {metrics.generatedAt ? fromNow(metrics.generatedAt) : 'just now'}
          </Text>
        </View>
        <Pill
          label={`${sessionLabel} SESSION${isCurrent ? '' : ' · PAST'}`}
          icon={isCurrent ? 'event' : 'history'}
          color={isCurrent ? colors.success : colors.pendingDelivery}
        />
        <PlanBadge label={inst?.tierLabel || 'Basic'} />
        {isSchoolAdmin(admin.adminType) ? (
        <ExportButton
          title="Export institution data"
          scopeNote={`${sessionLabel} session · ${scopeLabel}`}
          options={schoolExportOptions(metrics.access)}
          onExport={([section]) => exportSchoolData({ section, department, session: sessionLabel })}
        />
        ) : null}
      </View>

      {onSessionChange && sessions.length > 1 ? (
        <FilterChips
          value={sessionLabel}
          onChange={onSessionChange}
          options={sessions.map((label, i) => ({ value: label, label: i === 0 ? `${label} (current)` : label }))}
        />
      ) : null}
      {!isCurrent ? (
        <View style={[styles.pastNote, { borderLeftColor: colors.pendingDelivery, backgroundColor: colors.pendingDelivery + '12' }]}>
          <Icon name="history" size={16} color={colors.pendingDelivery} />
          <Text style={[styles.muted, styles.flex]}>
            You are viewing the {sessionLabel} session, which has ended. Figures are as of its last day; live lectures only show for the
            current session.
          </Text>
        </View>
      ) : null}

      {canFilter && departments.length > 0 ? (
        <FilterChips
          value={department ?? '__all'}
          onChange={value => onDepartmentChange?.(value === '__all' ? null : value)}
          options={[{ value: '__all', label: 'All departments' }, ...departments.map(name => ({ value: name, label: name }))]}
        />
      ) : department ? (
        <View style={styles.scopeNote}>
          <Icon name="lock-outline" size={15} color={colors.textMuted} />
          <Text style={styles.muted}>Showing the {department} department only.</Text>
        </View>
      ) : null}

      <View style={styles.kpis}>
        <KpiCard
          icon="school"
          label="Total Students Enrolled"
          tone={colors.series1}
          kpi={kpis.students}
          hint={`+${fmtNum(kpis.students.addedThisMonth)} ${thisMonth} · +${fmtNum(kpis.students.addedLastMonth)} ${lastMonth}`}
        />
        <KpiCard
          icon="co-present"
          label="Total Lecturers Enrolled"
          tone={colors.series3}
          kpi={kpis.lecturers}
          hint={`+${fmtNum(kpis.lecturers.addedThisMonth)} ${thisMonth} · +${fmtNum(kpis.lecturers.addedLastMonth)} ${lastMonth}`}
        />
        <KpiCard icon="event-available" label="Total Classes Scheduled" tone={colors.primary} kpi={kpis.classes} hint={`Lectures scheduled ${thisMonth} (cancelled excluded)`} />
      </View>

      <View style={styles.grid}>
        <View style={styles.gridWide}>
          <MonthlyTrend kpis={kpis} />
        </View>
        {isCurrent ? (
          <View style={styles.gridNarrow}>
            <LiveSection live={live} onViewAll={viewAll('lectures', live.ongoingCount > 0 ? 'ongoing' : 'today')} />
          </View>
        ) : null}
      </View>

      <View style={styles.grid}>
        <View style={styles.gridHalf}>
          <Card>
            <SectionHeader icon="how-to-reg" title="Attendance overview" subtitle={`${sessionLabel} session${isCurrent ? ', lectures held so far' : ''}`} onViewAll={viewAll('lectures')} />
            <View style={styles.ringRow}>
              <RingGauge value={attendance.attendanceRatePct} color={colors.primary} label="attendance" />
              <View style={styles.flex}>
                <Tiles
                  items={[
                    { label: 'Lectures held', value: fmtNum(attendance.lecturesHeld) },
                    { label: 'Check-ins', value: fmtNum(attendance.checkIns) },
                    { label: 'Cancelled', value: fmtNum(attendance.lecturesCancelled), tone: attendance.lecturesCancelled > 0 ? colors.pendingDelivery : undefined },
                    { label: 'Scheduled', value: fmtNum(attendance.lecturesScheduled) },
                  ]}
                />
              </View>
            </View>
          </Card>
        </View>
        <View style={styles.gridHalf}>
          <Card>
            <SectionHeader icon="person-add-alt" title="New sign-ups" subtitle="Verified students and lecturers who joined each month" />
            <AreaChart
              height={170}
              labels={basic.onboardingGrowth.map((g: any) => monthLabel(g.month))}
              series={[
                { name: 'Students', color: colors.series1, values: basic.onboardingGrowth.map((g: any) => g.students) },
                { name: 'Lecturers', color: colors.series2, values: basic.onboardingGrowth.map((g: any) => g.lecturers) },
              ]}
            />
            <Text style={[styles.muted, styles.gapTop]}>
              Identity: {fmtNum(basic.identity.verifiedStudents)} of {fmtNum(basic.identity.totalStudents)} students verified ·{' '}
              {fmtPct(basic.identity.verificationRatePct)} overall
            </Text>
          </Card>
        </View>
      </View>

      {basic.lectureModes ? <LectureModesCard modes={basic.lectureModes} department={department} onViewAll={viewAll('lectures')} /> : null}

      <Card>
        <SectionHeader icon="menu-book" title="Courses this session" subtitle={`${metrics.session?.label} · sorted by enrolment`} onViewAll={viewAll('courses')} />
        <Tiles
          items={[
            { label: 'Active courses', value: fmtNum(basic.courses.totalActiveCourses), icon: 'menu-book' },
            { label: 'Enrolments', value: fmtNum(basic.courses.studentEnrollments), icon: 'groups' },
            {
              label: 'Without a lecturer',
              value: fmtNum(basic.courses.allocationStatus.unassigned),
              icon: 'person-off',
              tone: basic.courses.allocationStatus.unassigned > 0 ? colors.pendingDelivery : undefined,
            },
          ]}
        />
        <View style={styles.grid}>
          <View style={styles.gridHalf}>
            <Text style={styles.subTitle}>Top courses</Text>
            {basic.courses.list.length === 0 ? <Text style={styles.muted}>No courses for this session yet.</Text> : null}
            {basic.courses.list.map((course: any) => (
              <View key={course.courseId} style={styles.listRow}>
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {course.courseCode} {course.courseTitle}
                  </Text>
                  <Text numberOfLines={1} style={styles.rowMeta}>
                    {course.department}
                    {course.level ? ` · ${course.level}L` : ''} · {course.lecturers.length ? course.lecturers.join(', ') : 'No lecturer'}
                  </Text>
                </View>
                <Text style={styles.rowTitle}>{fmtNum(course.enrolled)}</Text>
              </View>
            ))}
          </View>
          {!department && basic.courses.byDepartment.length > 1 ? (
            <View style={styles.gridHalf}>
              <Text style={styles.subTitle}>Courses by department</Text>
              {basic.courses.byDepartment.slice(0, 8).map((row: any) => (
                <MeterRow
                  key={row.department}
                  label={row.department}
                  value={row.courses}
                  max={basic.courses.byDepartment[0].courses}
                  unit=""
                  color={colors.primary}
                />
              ))}
            </View>
          ) : null}
        </View>
      </Card>

      <Card>
        <SectionHeader
          icon="campaign"
          title="Announcements this session"
          subtitle={`${fmtNum(basic.announcements.memosPosted)} memos · ${fmtNum(basic.announcements.notificationsSent)} notifications sent`}
          right={<Button compact variant="soft" icon="send" title="New" onPress={() => setTab('Notifications')} />}
          onViewAll={viewAll('announcements')}
        />
        {basic.announcements.recent.length === 0 ? <Text style={styles.muted}>Nothing announced this session yet.</Text> : null}
        {basic.announcements.recent.map((item: any) => (
          <View key={`${item.kind}-${item.id}`} style={styles.listRow}>
            <View style={[styles.lectureIcon, { backgroundColor: colors.primary + '14' }]}>
              <Icon name={item.kind === 'memo' ? 'article' : 'notifications-active'} size={18} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
              <Text numberOfLines={2} style={styles.rowMeta}>{item.body}</Text>
              <Text style={styles.rowMeta}>
                {item.sentBy} · {item.department || 'All departments'} · {fromNow(item.createdAt)}
              </Text>
            </View>
            <View style={styles.lectureStat}>
              <Text style={styles.rowTitle}>{fmtNum(item.reach)}</Text>
              <Text style={styles.rowMeta}>{item.reachLabel}</Text>
            </View>
          </View>
        ))}
      </Card>

      {pro ? (
        <>
          <View style={styles.grid}>
            <View style={styles.gridHalf}>
              <Card>
                <SectionHeader icon="quiz" title="Tests & proctoring" subtitle="Published tests this session" right={<PlanBadge label="Professional" />} />
                <Tiles
                  items={[
                    { label: 'Published tests', value: fmtNum(pro.assessments.published) },
                    { label: 'Submissions', value: fmtNum(pro.assessments.submissions) },
                    { label: 'Average score', value: fmtPct(pro.assessments.averageScorePct) },
                    { label: 'Pass rate (40%+)', value: fmtPct(pro.assessments.passRatePct), tone: colors.success },
                  ]}
                />
                <Text style={styles.subTitle}>Score distribution</Text>
                <BarChart color={colors.primary} data={pro.assessments.scoreBands.map((b: any) => ({ label: b.band, value: b.count }))} />
                <Text style={[styles.muted, styles.gapTop]}>
                  {fmtNum(pro.assessments.flaggedSubmissions)} flagged for review · {fmtNum(pro.assessments.impersonationBlocked)} failed the final identity check
                </Text>
              </Card>
            </View>
            <View style={styles.gridHalf}>
              <Card>
                <SectionHeader icon="trending-up" title="Weekly attendance" subtitle="Last 8 weeks" right={<PlanBadge label="Professional" />} />
                <AreaChart
                  max={100}
                  unit="%"
                  labels={pro.attendance.weeklyTrend.map((w: any) => weekLabel(w.week))}
                  series={[{ name: 'Attendance', color: colors.primary, values: pro.attendance.weeklyTrend.map((w: any) => w.attendanceRatePct) }]}
                />
                <Text style={[styles.muted, styles.gapTop]}>
                  Lecture exceptions: {fmtNum(pro.attendance.exceptionsApproved)} approved · {fmtNum(pro.attendance.exceptionsPending)} pending
                </Text>
              </Card>
            </View>
          </View>

          <View style={styles.grid}>
            <View style={styles.gridHalf}>
              <Card>
                <SectionHeader
                  icon="apartment"
                  title={department ? 'Courses needing attention' : 'Attendance by department'}
                  subtitle="Share of enrolled students who checked in"
                  onViewAll={viewAll('courses')}
                />
                {!department
                  ? pro.attendance.byDepartment.slice(0, 8).map((d: any) => (
                      <MeterRow key={d.department} label={d.department} value={d.attendanceRatePct} color={colors.primary} />
                    ))
                  : null}
                {department || pro.attendance.byDepartment.length === 0
                  ? pro.attendance.lowestCourses.map((c: any) => (
                      <MeterRow
                        key={c.courseId}
                        label={`${c.courseCode} ${c.courseTitle}`.trim()}
                        value={c.attendanceRatePct}
                        color={colors.pendingDelivery}
                        sub={`${c.lecturesHeld} lectures held`}
                      />
                    ))
                  : null}
                {pro.attendance.byDepartment.length === 0 && pro.attendance.lowestCourses.length === 0 ? (
                  <Text style={styles.muted}>No lectures held yet.</Text>
                ) : null}
              </Card>
            </View>
            <View style={styles.gridHalf}>
              <Card>
                <SectionHeader icon="co-present" title="Lecturer activity" subtitle="Most lectures delivered" onViewAll={viewAll('lecturers')} />
                <Tiles
                  items={[
                    { label: 'Syllabus coverage', value: fmtPct(pro.lms.syllabusCoveragePct) },
                    { label: 'Materials', value: fmtNum(pro.lms.materialsUploaded) },
                    { label: 'Assignments', value: fmtNum(pro.lms.assignmentsPosted) },
                  ]}
                />
                {pro.lecturers.length === 0 ? <Text style={styles.muted}>No lectures delivered yet.</Text> : null}
                {pro.lecturers.slice(0, 5).map((l: any) => (
                  <MeterRow
                    key={l.uid}
                    label={l.name}
                    value={l.lecturesDelivered}
                    max={pro.lecturers[0].lecturesDelivered}
                    unit=" lectures"
                    color={colors.series1}
                    sub={`${l.physical} physical · ${l.online} online`}
                  />
                ))}
              </Card>
            </View>
          </View>
        </>
      ) : lockedFor('pro') ? (
        <LockedCard {...lockedFor('pro')} />
      ) : null}

      {ent ? (
        <>
          <View style={styles.grid}>
            <View style={styles.gridHalf}>
              <Card>
                <SectionHeader
                  icon="report"
                  title="Students at risk"
                  subtitle={`Below ${ent.atRisk.thresholds.attendancePct}% attendance or ${ent.atRisk.thresholds.scorePct}% average score`}
                  onViewAll={viewAll('at-risk')}
                />
                <View style={styles.liveHead}>
                  <Text style={[styles.liveCount, { color: ent.atRisk.count > 0 ? colors.criticalSeverity : colors.success }]}>{fmtNum(ent.atRisk.count)}</Text>
                  <Text style={styles.muted}>students need follow-up</Text>
                </View>
                {ent.atRisk.students.slice(0, 5).map((st: any) => (
                  <View key={st.uid} style={styles.listRow}>
                    <View style={styles.flex}>
                      <Text numberOfLines={1} style={styles.rowTitle}>{st.name}</Text>
                      <Text numberOfLines={1} style={styles.rowMeta}>
                        {st.matricNumber} · {st.department}
                        {st.level ? ` · ${st.level}L` : ''}
                      </Text>
                    </View>
                    <View style={styles.lectureStat}>
                      <Text style={styles.rowMeta}>Attendance {fmtPct(st.attendancePct)}</Text>
                      <Text style={styles.rowMeta}>Score {fmtPct(st.scorePct)}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
            <View style={styles.gridHalf}>
              <Card>
                <SectionHeader icon="bar-chart" title="Attendance distribution" subtitle="Students by personal attendance rate" right={<PlanBadge label="Enterprise" />} />
                <BarChart color={colors.series1} data={ent.attendanceDistribution.map((b: any) => ({ label: b.band, value: b.count }))} />
                {ent.levels.length > 0 ? (
                  <>
                    <Text style={styles.subTitle}>Students by level</Text>
                    <BarChart height={140} color={colors.series3} data={ent.levels.map((l: any) => ({ label: l.level, value: l.students }))} />
                  </>
                ) : null}
              </Card>
            </View>
          </View>

          {!department && ent.departments.length > 1 ? (
            <Card>
              <SectionHeader icon="compare-arrows" title="Department comparison" subtitle="Average attendance and test score per student" />
              <Legend items={[{ color: colors.series1, label: 'Attendance' }, { color: colors.series2, label: 'Test score' }]} />
              <View style={[styles.grid, styles.gapTop]}>
                {ent.departments.map((d: any) => (
                  <View key={d.department} style={styles.deptCell}>
                    <Text numberOfLines={1} style={styles.rowTitle}>{d.department}</Text>
                    <Text style={styles.rowMeta}>{fmtNum(d.students)} students</Text>
                    <MeterRow label="Attendance" value={d.averageAttendancePct} color={colors.series1} />
                    <MeterRow label="Test score" value={d.averageScorePct} color={colors.series2} />
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <View style={styles.grid}>
            <View style={styles.gridHalf}>
              <Card>
                <SectionHeader icon="insights" title="12-week engagement" subtitle="Weekly check-ins and test submissions" />
                <AreaChart
                  labels={ent.engagementTrend.map((w: any) => weekLabel(w.week))}
                  series={[
                    { name: 'Check-ins', color: colors.series1, values: ent.engagementTrend.map((w: any) => w.checkIns) },
                    { name: 'Test submissions', color: colors.series2, values: ent.engagementTrend.map((w: any) => w.submissions) },
                  ]}
                />
              </Card>
            </View>
            <View style={styles.gridHalf}>
              <Card>
                <SectionHeader icon="grid-on" title="When lectures happen" subtitle="Lectures this session by day and hour" />
                <Heatmap
                  rows={ent.heatmap.days}
                  columns={ent.heatmap.hours.map((h: number) => `${h}:00`)}
                  counts={ent.heatmap.counts}
                  color={colors.primary}
                />
              </Card>
            </View>
          </View>

          <View style={styles.grid}>
            <View style={styles.gridHalf}>
              <Card>
                <SectionHeader icon="security" title="Exam integrity" subtitle="From the proctoring checks on every test" />
                <Tiles
                  items={[
                    { label: 'Flagged tests', value: fmtNum(ent.integrity.flaggedSubmissions), tone: colors.primary },
                    { label: 'Face mismatches', value: fmtNum(ent.integrity.identityMismatchesInTests) },
                    { label: 'Another person seen', value: fmtNum(ent.integrity.multiplePeopleDetected) },
                    { label: 'Look-aways', value: fmtNum(ent.integrity.lookAways) },
                    { label: 'Left the test', value: fmtNum(ent.integrity.testInterruptions) },
                    { label: 'Avg strikes per test', value: fmtNum(ent.integrity.averageStrikes) },
                  ]}
                />
                {ent.integrity.flagReasons.length > 0 ? (
                  <>
                    <Text style={styles.subTitle}>Why tests were flagged</Text>
                    {ent.integrity.flagReasons.map((r: any) => (
                      <MeterRow key={r.reason} label={r.reason} value={r.count} max={ent.integrity.flagReasons[0].count} unit="" color={colors.criticalSeverity} />
                    ))}
                  </>
                ) : null}
                <Text style={[styles.muted, styles.gapTop]}>
                  {fmtNum(ent.integrity.accountsWithSuspiciousActivity)} accounts with suspicious sign-ins · {fmtNum(ent.integrity.suspendedAccounts)} suspended
                </Text>
                {ent.support?.contactEmail ? <Text style={[styles.muted, { color: colors.primary }]}>Dedicated support: {ent.support.contactEmail}</Text> : null}
              </Card>
            </View>
            <View style={styles.gridHalf}>
              <Card>
                <SectionHeader icon="work-outline" title="Lecturer workload" subtitle="Courses and students per lecturer" onViewAll={viewAll('lecturers')} />
                {ent.lecturerLoad.length === 0 ? <Text style={styles.muted}>No lecturers assigned to courses yet.</Text> : null}
                {ent.lecturerLoad.slice(0, 6).map((l: any) => (
                  <MeterRow
                    key={l.uid}
                    label={l.name}
                    value={l.students}
                    max={ent.lecturerLoad[0].students}
                    unit=" students"
                    color={colors.series3}
                    sub={`${l.courses} ${l.courses === 1 ? 'course' : 'courses'}`}
                  />
                ))}
                {Object.keys(ent.exceptionReasons || {}).length > 0 ? (
                  <Text style={[styles.muted, styles.gapTop]}>
                    Exception reasons: {Object.entries(ent.exceptionReasons).map(([r, n]) => `${r} ${n}`).join(' · ')}
                  </Text>
                ) : null}
              </Card>
            </View>
          </View>
        </>
      ) : lockedFor('enterprise') ? (
        <LockedCard {...lockedFor('enterprise')} />
      ) : null}
    </View>
  );
}

/** The school admin's Overview tab: loads the dashboard and keeps the department filter. */
export function SchoolOverview({ header }: { header?: React.ReactNode }) {
  const { admin } = useSession();
  const toast = useToast();
  const styles = useStyles();
  const canFilter = isSchoolAdminA(admin.adminType);
  const [department, setDepartment] = useState<string | null>(null);
  // null = the current session (the server decides which that is).
  const [session, setSession] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (next: string | null, nextSession: string | null) => {
      setLoading(true);
      setFailed(false);
      try {
        const result = await getAdminMetrics(canFilter ? next : null, nextSession);
        setMetrics(result.schoolMetrics ?? null);
      } catch (reason) {
        setFailed(true);
        toast('error', errorMessage(reason), 'Dashboard Error');
      } finally {
        setLoading(false);
      }
    },
    [canFilter, toast],
  );

  useEffect(() => {
    void load(department, session);
  }, [department, load, session]);

  return (
    <ScrollPage contentContainerStyle={styles.page}>
      {header}
      {metrics && !failed ? (
        <View style={loading ? styles.refreshing : null}>
          <SchoolAnalyticsView
            metrics={metrics}
            department={canFilter ? department : metrics.scope?.department ?? null}
            onDepartmentChange={setDepartment}
            canFilter={canFilter}
            onSessionChange={setSession}
          />
        </View>
      ) : loading ? (
        <Loading label="Loading your institution's analytics..." />
      ) : (
        <EmptyState
          icon="wifi-off"
          title="Couldn't load the dashboard"
          subtitle={failed ? 'Check your connection, then try again.' : 'No analytics were returned for your account.'}
          buttonText="Try again"
          buttonIcon="refresh"
          onPress={() => void load(department, session)}
        />
      )}
      {metrics && loading ? <Text style={styles.updating}>Updating…</Text> : null}
      {metrics?.generatedAt ? <Text style={styles.footnote}>Generated {formatDate(metrics.generatedAt, true)}</Text> : null}
    </ScrollPage>
  );
}

const pulseStyles = StyleSheet.create({
  wrap: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

const useStyles = makeStyles(c =>
  StyleSheet.create({
    page: { paddingBottom: 120 },
    refreshing: { opacity: 0.55 },
    updating: { position: 'absolute', top: 8, right: 8, fontSize: 12, fontWeight: '700', color: c.primary },
    footnote: { fontSize: 11.5, color: c.textMuted, textAlign: 'center', marginTop: 4 },
    flex: { flex: 1, minWidth: 0 },
    muted: { fontSize: 12.5, color: c.textMuted, lineHeight: 18 },
    gapTop: { marginTop: 10 },
    hero: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 14,
      padding: 18,
      borderRadius: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      backgroundColor: c.backgroundSecondary,
    },
    heroLogo: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.surfaceRaised },
    heroName: { fontSize: 18, fontWeight: '900', color: c.textDarker, marginBottom: 3 },
    scopeNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
    pastNote: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderLeftWidth: 4, marginBottom: 14 },
    kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 16 },
    kpi: {
      flexGrow: 1,
      flexBasis: 250,
      padding: 20,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      backgroundColor: c.backgroundSecondary,
      overflow: 'hidden',
      gap: 4,
    },
    kpiGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -60, top: -70 },
    kpiTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    kpiIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    kpiLabel: { fontSize: 13, fontWeight: '700', color: c.textMuted },
    kpiValue: { fontSize: 34, fontWeight: '900', color: c.textDarker, letterSpacing: -0.8 },
    kpiHint: { fontSize: 11.5, color: c.textMuted, marginTop: 6 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
    gridHalf: { flexGrow: 1, flexBasis: 380, minWidth: 0 },
    gridWide: { flexGrow: 3, flexBasis: 420, minWidth: 0 },
    gridNarrow: { flexGrow: 2, flexBasis: 320, minWidth: 0 },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    tile: { flexGrow: 1, flexBasis: 120, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderSubtle, gap: 2 },
    tileValue: { fontSize: 20, fontWeight: '900', color: c.textDarker },
    tileLabel: { fontSize: 11.5, color: c.textMuted },
    subTitle: { fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 10, color: c.textDarker },
    ringRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 },
    liveHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    liveCount: { fontSize: 30, fontWeight: '900', color: c.textDarker, letterSpacing: -0.6 },
    lectureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.borderSubtle },
    lectureIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    lectureStat: { alignItems: 'flex-end' },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    rowTitle: { fontSize: 13.5, fontWeight: '700', color: c.textDarker },
    rowMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    deptCell: { flexGrow: 1, flexBasis: 220, padding: 14, borderRadius: 14, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderSubtle, marginBottom: 12, gap: 6 },
    locked: { borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: c.primary + '55', backgroundColor: c.primary + '0A', gap: 10 },
    lockedHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    lockedIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    lockedTitle: { fontSize: 16, fontWeight: '800', color: c.textDarker },
    featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexBasis: 240, flexGrow: 1 },
    featureText: { fontSize: 13, fontWeight: '600', color: c.textDarker },
  }),
);
