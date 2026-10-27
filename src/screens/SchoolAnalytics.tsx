import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sparkline } from '../charts';
import { Icon, IconName } from '../icons';
import { PRIMARY_COLOR_TINT, PRIMARY_COLOR_TINT_MAIN, useColors } from '../theme';
import { fromNow } from '../ui';

/**
 * Institution analytics for school administrators, gated by the school's plan
 * (OperationalInstitutions.tier): Basic (free) → Professional (pro) →
 * Enterprise (premium). Data for a tier is only computed server-side when the
 * school has it; locked tiers show what upgrading adds.
 */

const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);
const fmtNum = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString());

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-03" → "Mar". */
const monthLabel = (month: string) => MONTHS[Number(String(month).split('-')[1]) - 1] ?? month;
/** "2026-03-09" → "9/3". */
const weekLabel = (week: string) => {
  const [, month, day] = String(week).split('-').map(Number);
  return month && day ? `${day}/${month}` : week;
};

function Section({ title, icon, badge, children }: { title: string; icon: IconName; badge?: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[s.card, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={s.sectionHead}>
        <Icon name={icon} size={18} color={colors.primary} />
        <Text style={[s.sectionTitle, { color: colors.textDarker }]}>{title}</Text>
        {badge ? (
          <View style={[s.badge, { backgroundColor: colors.primary + '1A' }]}>
            <Text style={[s.badgeText, { color: colors.primary }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Tiles({ items }: { items: { label: string; value: string; tone?: string }[] }) {
  const colors = useColors();
  return (
    <View style={s.tiles}>
      {items.map(item => (
        <View key={item.label} style={[s.tile, { backgroundColor: colors.background }]}>
          <Text style={[s.tileValue, { color: item.tone || colors.textDarker }]}>{item.value}</Text>
          <Text style={[s.tileLabel, { color: colors.text }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Horizontal percentage bar row. */
function BarRow({ label, value, sub }: { label: string; value: number | null; sub?: string }) {
  const colors = useColors();
  const tone =
    value == null ? colors.border : value >= 75 ? colors.success : value >= 50 ? colors.pendingDelivery : colors.primary;
  return (
    <View style={s.barRow}>
      <View style={s.barHead}>
        <Text numberOfLines={1} style={[s.barLabel, { color: colors.textDarker }]}>{label}</Text>
        <Text style={[s.barValue, { color: colors.textDarker }]}>{fmtPct(value)}</Text>
      </View>
      <View style={[s.barTrack, { backgroundColor: colors.border + '66' }]}>
        <View style={[s.barFill, { width: `${Math.min(100, value ?? 0)}%`, backgroundColor: tone }]} />
      </View>
      {sub ? <Text style={[s.barSub, { color: colors.text }]}>{sub}</Text> : null}
    </View>
  );
}

/** Tiny column chart for weekly series. */
function MiniColumns({ data, max, color }: { data: { label: string; value: number | null }[]; max?: number; color: string }) {
  const colors = useColors();
  const top = max ?? Math.max(1, ...data.map(d => d.value ?? 0));
  return (
    <View style={s.columns}>
      {data.map(d => (
        <View key={d.label} style={s.columnWrap}>
          <View style={[s.columnTrack, { backgroundColor: colors.border + '44' }]}>
            <View style={[s.columnFill, { height: `${Math.max(2, ((d.value ?? 0) / top) * 100)}%`, backgroundColor: color }]} />
          </View>
          <Text style={[s.columnLabel, { color: colors.text }]}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

function LockedCard({ label, features }: { label: string; features: string[] }) {
  const colors = useColors();
  return (
    <View style={[s.card, s.locked, { borderColor: colors.primary + '55', backgroundColor: colors.primary + '0A' }]}>
      <View style={s.sectionHead}>
        <Icon name="lock" size={18} color={colors.primary} />
        <Text style={[s.sectionTitle, { color: colors.textDarker }]}>{label} analytics</Text>
      </View>
      <Text style={[s.lockedText, { color: colors.text }]}>Available on the {label} plan. Upgrading adds:</Text>
      {features.map(feature => (
        <View key={feature} style={s.featureRow}>
          <Icon name="check" size={15} color={colors.primary} />
          <Text style={[s.featureText, { color: colors.textDarker }]}>{feature}</Text>
        </View>
      ))}
      <Text style={[s.lockedText, { color: colors.text, marginTop: 8 }]}>
        Contact the iCampus team to change your institution's plan.
      </Text>
    </View>
  );
}

export function SchoolAnalyticsView({ metrics }: { metrics: Record<string, any> }) {
  const colors = useColors();
  const basic = metrics.basic;
  const pro = metrics.professional;
  const ent = metrics.enterprise;
  const inst = metrics.institution;
  const lockedFor = (tier: string) => metrics.locked?.find((l: any) => l.tier === tier);

  if (!basic) return null;

  return (
    <View style={s.container}>
      <View style={[s.card, s.header, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={[s.schoolName, { color: colors.textDarker }]}>{inst?.name || 'Your institution'}</Text>
          <Text style={[s.meta, { color: colors.text }]}>Updated {metrics.generatedAt ? fromNow(metrics.generatedAt) : 'just now'}</Text>
        </View>
        <View style={[s.planPill, { backgroundColor: colors.primary }]}>
          <Icon name="workspace-premium" size={14} color="#fff" />
          <Text style={s.planText}>{inst?.tierLabel || 'Basic'} plan</Text>
        </View>
      </View>

      <View style={s.grid}>
        <View style={s.gridItem}>
        <Section title="Student identity" icon="badge" badge="Basic">
          <Tiles
            items={[
              { label: 'Students', value: fmtNum(basic.identity.totalStudents) },
              { label: 'Verified students', value: fmtNum(basic.identity.verifiedStudents), tone: colors.success },
              { label: 'Lecturers', value: fmtNum(basic.identity.totalLecturers) },
              { label: 'Verification rate', value: fmtPct(basic.identity.verificationRatePct) },
            ]}
          />
        </Section>
        </View>

        <View style={s.gridItem}>
        <Section title="Attendance overview" icon="how-to-reg" badge="Basic">
          <Tiles
            items={[
              { label: 'Attendance rate', value: fmtPct(basic.attendance.attendanceRatePct), tone: colors.primary },
              { label: 'Lectures held', value: fmtNum(basic.attendance.lecturesHeld) },
              { label: 'Check-ins', value: fmtNum(basic.attendance.checkIns) },
              { label: 'Cancelled', value: fmtNum(basic.attendance.lecturesCancelled) },
            ]}
          />
          <Text style={[s.meta, { color: colors.text, marginTop: 8 }]}>
            {basic.attendance.physicalLectures} physical · {basic.attendance.onlineLectures} online lectures held
          </Text>
        </Section>
        </View>
      </View>

      <Section title="Courses & announcements" icon="campaign" badge="Basic">
        <Tiles
          items={[
            { label: 'Active courses', value: fmtNum(basic.courses.totalActiveCourses) },
            { label: 'Enrollments', value: fmtNum(basic.courses.studentEnrollments) },
            {
              label: 'Without lecturer',
              value: fmtNum(basic.courses.allocationStatus.unassigned),
              tone: basic.courses.allocationStatus.unassigned > 0 ? colors.pendingDelivery : undefined,
            },
            { label: 'School memos', value: fmtNum(basic.announcements.memosPosted) },
          ]}
        />
        {basic.announcements.lastPostedAt ? (
          <Text style={[s.meta, { color: colors.text, marginTop: 8 }]}>
            Last memo {fromNow(basic.announcements.lastPostedAt)} · {fmtNum(basic.announcements.totalImpressions)} views
          </Text>
        ) : null}
        {basic.onboardingGrowth.length > 0 ? (
          <>
            <Text style={[s.subTitle, { color: colors.textDarker }]}>Verified sign-ups per month</Text>
            <MiniColumns
              color={colors.success}
              data={basic.onboardingGrowth.map((g: any) => ({ label: monthLabel(g.month), value: g.students + g.lecturers }))}
            />
          </>
        ) : null}
      </Section>

      {pro ? (
        <>
          <Section title="Tests & exam proctoring" icon="quiz" badge="Professional">
            <Tiles
              items={[
                { label: 'Published tests', value: fmtNum(pro.assessments.published) },
                { label: 'Submissions', value: fmtNum(pro.assessments.submissions) },
                { label: 'Average score', value: fmtPct(pro.assessments.averageScorePct) },
                { label: 'Pass rate (40%+)', value: fmtPct(pro.assessments.passRatePct), tone: colors.success },
              ]}
            />
            <Text style={[s.meta, { color: colors.text, marginTop: 8 }]}>
              {pro.assessments.flaggedSubmissions} flagged for review · {pro.assessments.impersonationBlocked} impersonation attempts blocked
            </Text>
          </Section>

          <Section title="Attendance by department" icon="apartment" badge="Professional">
            {pro.attendance.byDepartment.length === 0 ? (
              <Text style={[s.meta, { color: colors.text }]}>No lectures held yet.</Text>
            ) : (
              pro.attendance.byDepartment.map((d: any) => <BarRow key={d.department} label={d.department} value={d.attendanceRatePct} />)
            )}
            <Text style={[s.subTitle, { color: colors.textDarker }]}>Weekly attendance (8 weeks)</Text>
            <MiniColumns
              max={100}
              color={colors.primary}
              data={pro.attendance.weeklyTrend.map((w: any) => ({ label: weekLabel(w.week), value: w.attendanceRatePct }))}
            />
            {pro.attendance.lowestCourses.length > 0 ? (
              <>
                <Text style={[s.subTitle, { color: colors.textDarker }]}>Courses needing attention</Text>
                {pro.attendance.lowestCourses.map((c: any) => (
                  <BarRow
                    key={c.courseId}
                    label={`${c.courseCode} ${c.courseTitle}`.trim()}
                    value={c.attendanceRatePct}
                    sub={`${c.lecturesHeld} lectures held`}
                  />
                ))}
              </>
            ) : null}
            <Text style={[s.meta, { color: colors.text, marginTop: 8 }]}>
              Exceptions: {pro.attendance.exceptionsApproved} approved · {pro.attendance.exceptionsPending} pending
            </Text>
          </Section>

          <Section title="LMS & lecturer activity" icon="menu-book" badge="Professional">
            <Tiles
              items={[
                { label: 'Syllabus coverage', value: fmtPct(pro.lms.syllabusCoveragePct) },
                { label: 'Materials', value: fmtNum(pro.lms.materialsUploaded) },
                { label: 'Assignments', value: fmtNum(pro.lms.assignmentsPosted) },
              ]}
            />
            {pro.lecturers.length > 0 ? (
              <>
                <Text style={[s.subTitle, { color: colors.textDarker }]}>Most active lecturers</Text>
                {pro.lecturers.map((l: any) => (
                  <View key={l.uid} style={[s.listRow, { borderColor: colors.border + '55' }]}>
                    <Text numberOfLines={1} style={[s.listName, { color: colors.textDarker }]}>{l.name}</Text>
                    <Text style={[s.meta, { color: colors.text }]}>
                      {l.lecturesDelivered} lectures · {l.physical} physical · {l.online} online
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
          </Section>
        </>
      ) : lockedFor('pro') ? (
        <LockedCard {...lockedFor('pro')} />
      ) : null}

      {ent ? (
        <>
          <Section title="At-risk students" icon="report" badge="Enterprise">
            <Text style={[s.meta, { color: colors.text, marginBottom: 8 }]}>
              Below {ent.atRisk.thresholds.attendancePct}% attendance or {ent.atRisk.thresholds.scorePct}% average score
            </Text>
            <Tiles items={[{ label: 'Students at risk', value: fmtNum(ent.atRisk.count), tone: colors.primary }]} />
            {ent.atRisk.students.map((st: any) => (
              <View key={st.uid} style={[s.listRow, { borderColor: colors.border + '55' }]}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[s.listName, { color: colors.textDarker }]}>{st.name}</Text>
                  <Text style={[s.meta, { color: colors.text }]}>{st.matricNumber} · {st.department}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.meta, { color: colors.text }]}>Attendance {fmtPct(st.attendancePct)}</Text>
                  <Text style={[s.meta, { color: colors.text }]}>Score {fmtPct(st.scorePct)}</Text>
                </View>
              </View>
            ))}
          </Section>

          <Section title="Department comparison" icon="compare-arrows" badge="Enterprise">
            {ent.departments.map((d: any) => (
              <View key={d.department} style={[s.listRow, { borderColor: colors.border + '55' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.listName, { color: colors.textDarker }]}>{d.department}</Text>
                  <Text style={[s.meta, { color: colors.text }]}>{d.students} students</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.meta, { color: colors.text }]}>Attendance {fmtPct(d.averageAttendancePct)}</Text>
                  <Text style={[s.meta, { color: colors.text }]}>Score {fmtPct(d.averageScorePct)}</Text>
                </View>
              </View>
            ))}
          </Section>

          <Section title="12-week engagement" icon="trending-up" badge="Enterprise">
            <Text style={[s.subTitle, { color: colors.textDarker, marginTop: 0 }]}>Attendance check-ins</Text>
            <MiniColumns color={colors.primary} data={ent.engagementTrend.map((w: any) => ({ label: weekLabel(w.week), value: w.checkIns }))} />
            <Text style={[s.subTitle, { color: colors.textDarker }]}>Test submissions</Text>
            <MiniColumns color={colors.success} data={ent.engagementTrend.map((w: any) => ({ label: weekLabel(w.week), value: w.submissions }))} />
          </Section>

          <Section title="Integrity & security" icon="security" badge="Enterprise">
            <Tiles
              items={[
                { label: 'Flagged tests', value: fmtNum(ent.integrity.flaggedSubmissions), tone: colors.primary },
                { label: 'Face mismatches', value: fmtNum(ent.integrity.identityMismatchesInTests) },
                { label: 'Test interruptions', value: fmtNum(ent.integrity.testInterruptions) },
                { label: 'Suspicious accounts', value: fmtNum(ent.integrity.accountsWithSuspiciousActivity) },
              ]}
            />
            {Object.keys(ent.exceptionReasons || {}).length > 0 ? (
              <Text style={[s.meta, { color: colors.text, marginTop: 8 }]}>
                Exception reasons: {Object.entries(ent.exceptionReasons).map(([r, n]) => `${r} ${n}`).join(' · ')}
              </Text>
            ) : null}
            {ent.support?.contactEmail ? (
              <Text style={[s.meta, { color: colors.primary, marginTop: 8 }]}>Dedicated support: {ent.support.contactEmail}</Text>
            ) : null}
          </Section>
        </>
      ) : lockedFor('premium') ? (
        <LockedCard {...lockedFor('premium')} />
      ) : null}
    </View>
  );
}

function StatusCard({ label, count, color, icon }: { label: string; count: string; color: string; icon: IconName }) {
  const colors = useColors();
  return (
    <View style={[s.statusCard, { borderLeftColor: color, backgroundColor: colors.backgroundSecondary }]}>
      <Icon name={icon} size={22} color={color} />
      <View>
        <Text style={[s.statusCount, { color }]}>{count}</Text>
        <Text style={[s.statusLabel, { color: colors.text }]}>{label}</Text>
      </View>
    </View>
  );
}

/** Older servers only send the flat legacy school metrics. */
export function SchoolAdminDashboardView({ metrics }: { metrics: Record<string, any> }) {
  const colors = useColors();
  const { users, courses, academics } = metrics;
  const growth: any[] = users?.onboardingGrowth ?? [];
  const departments = Object.entries(courses?.departmentBreakdown ?? {});

  return (
    <View style={s.container}>
      <Text style={[s.legacyHeader, { color: colors.textDarker }]}>Institutional Overview</Text>
      <View style={s.statusGrid}>
        <StatusCard label="Verified Students" count={String(users?.verifiedStudents ?? 0)} color={colors.success} icon="school" />
        <StatusCard label="Verified Lecturers" count={String(users?.verifiedLecturers ?? 0)} color={colors.success} icon="person-outline" />
        <StatusCard label="Active Courses" count={String(courses?.totalActiveCourses ?? 0)} color={colors.success} icon="menu-book" />
        <StatusCard label="Student Enrollments" count={String(courses?.studentEnrollmentDensity ?? 0)} color={colors.success} icon="groups" />
      </View>

      <Text style={[s.legacyHeader, { color: colors.textDarker }]}>Onboarding Trends</Text>
      <View style={[s.card, { backgroundColor: colors.backgroundSecondary }]}>
        {(['students', 'lecturers'] as const).map((key, index) => (
          <View key={key}>
            {index > 0 ? <View style={s.divider} /> : null}
            <View style={s.trendRow}>
              <Sparkline data={growth.map(item => item[key])} color={colors.success} />
              <View>
                <Text style={[s.trendLabel, { color: colors.text }]}>{key === 'students' ? 'Student' : 'Lecturer'} Growth Trend</Text>
                <Text style={[s.trendLabel, { color: colors.text }]}>Last {growth.length} months</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      <Text style={[s.legacyHeader, { color: colors.textDarker }]}>Academic & Allocation Status</Text>
      <View style={s.statusGrid}>
        <StatusCard label="Assigned Courses" count={String(courses?.allocationStatus?.assigned ?? 0)} color={colors.success} icon="check-circle" />
        <StatusCard label="Unassigned / Pending" count={String(courses?.allocationStatus?.unassigned ?? 0)} color={colors.pendingDelivery} icon="warning" />
      </View>
      <View style={[s.card, { backgroundColor: colors.backgroundSecondary }]}>
        {(
          [
            ['assignment', 'Total Assessments Created', academics?.totalAssessmentsCreated, colors.text],
            ['check-circle', 'Test Submissions Logged', academics?.testSubmissionsCount, colors.success],
            ['verified-user', 'Attendance Sync Volume', academics?.attendanceSyncVolume, colors.text],
          ] as const
        ).map(([icon, label, value, tone]) => (
          <View key={label} style={s.statRow}>
            <Icon name={icon} size={20} color={tone} />
            <Text style={[s.statLabel, { color: colors.text }]}>{label}</Text>
            <Text style={[s.statValue, { color: colors.textDarker }]}>{value ?? 0}</Text>
          </View>
        ))}
      </View>

      <Text style={[s.legacyHeader, { color: colors.textDarker }]}>Courses by Department</Text>
      <View style={[s.card, { backgroundColor: colors.backgroundSecondary }]}>
        {departments.length === 0 ? (
          <Text style={[s.emptyText, { color: colors.text }]}>No department data available.</Text>
        ) : (
          departments.map(([department, count], index) => (
            <View key={department}>
              <View style={s.deptRow}>
                <Text style={[s.deptName, { color: colors.text }]}>{department}</Text>
                <Text style={[s.deptCount, { color: colors.primary }]}>{String(count)} courses</Text>
              </View>
              {index < departments.length - 1 ? <View style={s.divider} /> : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingBottom: 30 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  card: { borderRadius: 18, padding: 14, marginBottom: 12 },
  gridItem: { flexGrow: 1, flexBasis: 320 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  schoolName: { fontSize: 17, fontWeight: '800' },
  planPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  planText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  tileValue: { fontSize: 18, fontWeight: '800' },
  tileLabel: { fontSize: 11.5, marginTop: 2, opacity: 0.75 },
  meta: { fontSize: 12, opacity: 0.8 },
  subTitle: { fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  barRow: { marginBottom: 10 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { flex: 1, fontSize: 13, fontWeight: '600', marginRight: 8 },
  barValue: { fontSize: 13, fontWeight: '800' },
  barTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barSub: { fontSize: 11, marginTop: 3, opacity: 0.7 },
  columns: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 90 },
  columnWrap: { flex: 1, alignItems: 'center' },
  columnTrack: { width: '100%', height: 72, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  columnFill: { width: '100%', borderRadius: 4 },
  columnLabel: { fontSize: 9, marginTop: 4, opacity: 0.7 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  listName: { fontSize: 13.5, fontWeight: '700' },
  locked: { borderWidth: 1, borderStyle: 'dashed' },
  lockedText: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 },
  featureText: { fontSize: 13, fontWeight: '600' },
  legacyHeader: { fontSize: 18, fontWeight: '700', alignSelf: 'center', marginBottom: 15 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  statusCard: {
    flexGrow: 1,
    flexBasis: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: PRIMARY_COLOR_TINT,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  statusCount: { fontSize: 20, fontWeight: '800' },
  statusLabel: { fontSize: 12, marginTop: 2 },
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  trendLabel: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: PRIMARY_COLOR_TINT_MAIN, marginVertical: 8 },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10 },
  statLabel: { flex: 1, fontSize: 14, marginHorizontal: 8 },
  statValue: { fontSize: 16, fontWeight: '700' },
  deptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 15 },
  deptName: { fontSize: 14 },
  deptCount: { fontSize: 14, fontWeight: '600' },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 15 },
});
