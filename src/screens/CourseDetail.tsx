import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CourseDetail, getSchoolCourseDetail } from '../api';
import { MeterRow } from '../charts';
import { errorMessage, useNavigation, useToast } from '../context';
import { fmtPct, StatCard, StatRow } from '../dashboard';
import { Icon, IconName } from '../icons';
import { makeStyles, useColors } from '../theme';
import { Card, EmptyState, Field, formatCount, formatDate, fromNow, Loading, PageHeader, Pill, ScrollPage, SectionHeader, TabStrip, UserAvatar } from '../ui';

type CourseTab = 'overview' | 'students' | 'lectures' | 'assessments' | 'activity';

const STUDENTS_SHOWN = 60;

/** Icon and colour for one timeline entry (courses and user profiles share these). */
export const timelineStyle = (kind: string, colors: ReturnType<typeof useColors>): { icon: IconName; color: string } => {
  switch (kind) {
    case 'lecture_held':
      return { icon: 'co-present', color: colors.success };
    case 'lecture_scheduled':
      return { icon: 'event', color: colors.info };
    case 'lecture_cancelled':
      return { icon: 'event-busy', color: colors.criticalSeverity };
    case 'assessment_published':
    case 'test_submitted':
      return { icon: 'quiz', color: colors.series2 };
    case 'test_flagged':
      return { icon: 'flag', color: colors.criticalSeverity };
    case 'assessment_draft':
      return { icon: 'edit-note', color: colors.textMuted };
    case 'material_uploaded':
      return { icon: 'upload-file', color: colors.series3 };
    case 'assignment_due':
      return { icon: 'assignment', color: colors.pendingDelivery };
    case 'checked_in':
      return { icon: 'how-to-reg', color: colors.success };
    case 'absent':
      return { icon: 'person-off', color: colors.textMuted };
    default:
      return { icon: 'history', color: colors.primary };
  }
};

const TIMELINE_LABELS: Record<string, string> = {
  lecture_held: 'Lecture held',
  lecture_scheduled: 'Lecture scheduled',
  lecture_cancelled: 'Lecture cancelled',
  assessment_published: 'Assessment published',
  assessment_draft: 'Assessment drafted',
  material_uploaded: 'Material uploaded',
  assignment_due: 'Assignment due',
  checked_in: 'Checked in',
  absent: 'Marked absent',
  test_submitted: 'Test submitted',
  test_flagged: 'Test flagged',
};
export const timelineLabel = (kind: string) => TIMELINE_LABELS[kind] ?? 'Activity';

export function TimelineRow({ kind, title, detail, at }: { kind: string; title: string; detail?: string; at: string }) {
  const colors = useColors();
  const styles = useStyles();
  const look = timelineStyle(kind, colors);
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: look.color + '1A' }]}>
        <Icon name={look.icon} size={18} color={look.color} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          {timelineLabel(kind)}
          {detail ? ` · ${detail}` : ''}
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text style={styles.meta}>{fromNow(at)}</Text>
        <Text style={styles.metaSmall}>{formatDate(at, true)}</Text>
      </View>
    </View>
  );
}

function PersonRow({
  name,
  meta,
  profilePic,
  right,
  onPress,
}: {
  name: string;
  meta: string;
  profilePic: unknown;
  right?: React.ReactNode;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ hovered }: any) => [styles.row, hovered && styles.hover]}>
      <UserAvatar profilePic={profilePic} firstName={name} size={38} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={styles.title}>{name}</Text>
        <Text numberOfLines={1} style={styles.meta}>{meta}</Text>
      </View>
      {right}
      <Icon name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const lectureColor = (status: string, colors: ReturnType<typeof useColors>) =>
  status === 'held' ? colors.success : status === 'cancelled' ? colors.criticalSeverity : status === 'ongoing' ? colors.primary : colors.info;

/** One course: its lecturers, enrolled students, lectures, assessments and activity. Read-only. */
export function CourseDetailScreen({ courseId }: { courseId: string }) {
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const { push } = useNavigation();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<CourseTab>('overview');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await getSchoolCourseDetail(courseId));
    } catch (reason) {
      setFailed(true);
      toast('error', errorMessage(reason), 'Fetch Error');
    }
  }, [courseId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const students = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = data?.students ?? [];
    return term ? list.filter(s => [s.name, s.matricNumber, s.level, s.department].some(v => String(v ?? '').toLowerCase().includes(term))) : list;
  }, [data, query]);

  if (!data) {
    return (
      <View style={styles.flex}>
        <PageHeader title="Course" />
        {failed ? (
          <EmptyState icon="wifi-off" title="Couldn't load this course" buttonText="Try again" onPress={() => void load()} />
        ) : (
          <Loading label="Loading course..." />
        )}
      </View>
    );
  }

  const { course, summary, access } = data;
  const subtitle = [
    course.department,
    course.level ? `${String(course.level).replace(/\D/g, '') || course.level}L` : null,
    course.semester ? `${course.semester} semester` : null,
    course.session,
    course.credits ? `${course.credits} credits` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const tabs: Array<{ id: CourseTab; label: string; icon: IconName; badge?: number }> = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'students', label: 'Students', icon: 'school', badge: summary.enrolled || undefined },
    { id: 'lectures', label: 'Lectures', icon: 'event', badge: summary.lecturesScheduled || undefined },
    ...(access.assessments ? [{ id: 'assessments' as const, label: 'Assessments', icon: 'quiz' as IconName, badge: summary.assessments || undefined }] : []),
    { id: 'activity', label: 'Activity', icon: 'history' },
  ];
  const openUser = (uid: string) => push({ name: 'userProfile', uid });
  const shown = showAll ? students : students.slice(0, STUDENTS_SHOWN);

  return (
    <View style={styles.flex}>
      <PageHeader title={`${course.courseCode} ${course.courseTitle}`.trim() || 'Course'} subtitle={subtitle} />
      <ScrollPage contentContainerStyle={styles.content}>
        <StatRow>
          <StatCard icon="school" label="Enrolled" tone={colors.series1} value={formatCount(summary.enrolled)} hint={`${summary.lecturers} lecturer${summary.lecturers === 1 ? '' : 's'}`} />
          <StatCard
            icon="co-present"
            label="Lectures held"
            tone={colors.series3}
            value={formatCount(summary.lecturesHeld)}
            hint={`${summary.lecturesScheduled} scheduled · ${summary.lecturesCancelled} cancelled`}
          />
          <StatCard icon="how-to-reg" label="Attendance" tone={colors.success} value={fmtPct(summary.attendanceRatePct)} hint="Check-ins across held lectures" />
          {access.assessments ? (
            <StatCard icon="quiz" label="Average score" tone={colors.series2} value={fmtPct(summary.averageScorePct ?? null)} hint={`${formatCount(summary.submissions ?? 0)} submissions`} />
          ) : null}
        </StatRow>

        <TabStrip tabs={tabs} active={tab} onChange={setTab} />

        {tab === 'overview' ? (
          <>
            <Card>
              <SectionHeader icon="co-present" title="Lecturers" subtitle="Assigned to this course" />
              {data.lecturers.length === 0 ? (
                <Text style={styles.meta}>No lecturer assigned yet.</Text>
              ) : (
                data.lecturers.map(l => (
                  <PersonRow
                    key={l.uid}
                    name={l.name}
                    profilePic={l.profilePic}
                    meta={[l.staffId || 'No staff ID', l.department].filter(Boolean).join(' · ')}
                    right={<Text style={styles.meta}>{l.lecturesHeld} held</Text>}
                    onPress={() => openUser(l.uid)}
                  />
                ))
              )}
            </Card>
            <Card>
              <SectionHeader icon="info-outline" title="About this course" />
              {course.description ? <Text style={styles.body}>{course.description}</Text> : null}
              <View style={styles.facts}>
                <Fact label="Status" value={course.isActive ? 'Active' : 'Inactive'} />
                <Fact label="Materials" value={formatCount(summary.materials)} />
                <Fact label="Assignments" value={formatCount(summary.assignments)} />
                <Fact label="Exceptions" value={`${summary.exceptionsPending} pending · ${summary.exceptionsApproved} approved`} />
              </View>
              {course.contents.length ? (
                <>
                  <Text style={styles.subheading}>Course outline</Text>
                  {course.contents.map((item, index) => (
                    <Text key={index} style={styles.body}>
                      {index + 1}. {item}
                    </Text>
                  ))}
                </>
              ) : null}
            </Card>
            {data.materials.length || data.assignments.length ? (
              <Card>
                <SectionHeader icon="folder-open" title="Materials & assignments" />
                {data.assignments.map((a, index) => (
                  <View key={`a${index}`} style={styles.row}>
                    <Icon name="assignment" size={18} color={colors.pendingDelivery} />
                    <Text style={[styles.title, styles.flex]}>{a.title}</Text>
                    <Text style={styles.meta}>
                      {a.submissions} submitted{a.dueDate ? ` · due ${formatDate(a.dueDate)}` : ''}
                    </Text>
                  </View>
                ))}
                {data.materials.map((m, index) => (
                  <View key={`m${index}`} style={styles.row}>
                    <Icon name="description" size={18} color={colors.series3} />
                    <Text style={[styles.title, styles.flex]}>{m.title}</Text>
                    {m.uploadedAt ? <Text style={styles.meta}>{formatDate(m.uploadedAt)}</Text> : null}
                  </View>
                ))}
              </Card>
            ) : null}
            <Card>
              <SectionHeader icon="history" title="Recent activity" onViewAll={data.timeline.length > 6 ? () => setTab('activity') : undefined} />
              {data.timeline.length === 0 ? <Text style={styles.meta}>Nothing has happened in this course yet.</Text> : null}
              {data.timeline.slice(0, 6).map((e, index) => (
                <TimelineRow key={index} {...e} />
              ))}
            </Card>
          </>
        ) : null}

        {tab === 'students' ? (
          <Card>
            <SectionHeader icon="school" title="Enrolled students" subtitle={`${formatCount(students.length)} ${query.trim() ? 'matching' : 'enrolled'}`} />
            <Field icon="search" placeholder="Search by name, matric number or level" value={query} onChangeText={setQuery} />
            {students.length === 0 ? (
              <EmptyState icon="person-search" title="No students" subtitle={query.trim() ? `No results for "${query.trim()}".` : 'No one is enrolled yet.'} />
            ) : (
              shown.map(s => (
                <PersonRow
                  key={s.uid}
                  name={s.name}
                  profilePic={s.profilePic}
                  meta={[s.matricNumber || 'No matric number', s.level ? `${s.level}L` : null, s.isSuspended ? 'Suspended' : null].filter(Boolean).join(' · ')}
                  onPress={() => openUser(s.uid)}
                  right={
                    <View style={styles.meters}>
                      <MeterRow label={`Attendance · ${s.lecturesAttended}/${summary.lecturesHeld}`} value={s.attendancePct} color={colors.series1} />
                      {access.assessments ? <MeterRow label={`Score · ${s.testsTaken ?? 0} tests`} value={s.averageScorePct ?? null} color={colors.series2} /> : null}
                    </View>
                  }
                />
              ))
            )}
            {!showAll && students.length > STUDENTS_SHOWN ? (
              <Pressable onPress={() => setShowAll(true)} style={styles.more}>
                <Text style={styles.moreText}>Show all {formatCount(students.length)}</Text>
              </Pressable>
            ) : null}
          </Card>
        ) : null}

        {tab === 'lectures' ? (
          <Card>
            <SectionHeader icon="event" title="Lectures" subtitle={`${summary.lecturesHeld} held of ${summary.lecturesScheduled}`} />
            {data.lectures.length === 0 ? <Text style={styles.meta}>No lectures yet.</Text> : null}
            {data.lectures.map(l => (
              <View key={l.id} style={styles.row}>
                <View style={[styles.icon, { backgroundColor: colors.info + '1A' }]}>
                  <Icon name={l.lectureType === 'Physical' ? 'meeting-room' : 'videocam'} size={18} color={colors.info} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.title}>{l.topicName}</Text>
                  <Text style={styles.meta}>
                    {l.host} · {l.lectureType}
                    {l.location ? ` · ${l.location}` : ''}
                  </Text>
                  <Text style={styles.meta}>{l.startsAt ? formatDate(l.startsAt, true) : 'Time not set'}</Text>
                </View>
                <View style={styles.trailing}>
                  <Pill label={l.status.toUpperCase()} color={lectureColor(l.status, colors)} />
                  {l.status === 'held' ? (
                    <Text style={styles.meta}>
                      {l.checkIns}/{summary.enrolled} checked in
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {tab === 'assessments' && access.assessments ? (
          <Card>
            <SectionHeader icon="quiz" title="Assessments" subtitle={`${formatCount(summary.submissions ?? 0)} submissions`} />
            {data.assessments.length === 0 ? <Text style={styles.meta}>No assessments yet.</Text> : null}
            {data.assessments.map(a => (
              <View key={a.id} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.title}>{a.title}</Text>
                  <Text style={styles.meta}>
                    {a.totalMarks} marks
                    {a.dueDate ? ` · due ${formatDate(a.dueDate, true)}` : ''}
                    {a.flagged ? ` · ${a.flagged} flagged` : ''}
                  </Text>
                </View>
                <View style={styles.trailing}>
                  <Pill label={a.isPublished ? 'PUBLISHED' : 'DRAFT'} color={a.isPublished ? colors.success : colors.textMuted} />
                  <Text style={styles.meta}>
                    {a.submissions} submitted · avg {fmtPct(a.averageScorePct)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {tab === 'activity' ? (
          <Card>
            <SectionHeader icon="history" title="Course activity" subtitle="Lectures, assessments, materials and assignments, newest first" />
            {data.timeline.length === 0 ? <Text style={styles.meta}>Nothing has happened in this course yet.</Text> : null}
            {data.timeline.map((e, index) => (
              <TimelineRow key={index} {...e} />
            ))}
          </Card>
        ) : null}
      </ScrollPage>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.fact}>
      <Text style={styles.metaSmall}>{label.toUpperCase()}</Text>
      <Text style={styles.title}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    content: { width: '100%', maxWidth: 1000, alignSelf: 'center', paddingBottom: 60 },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    hover: { backgroundColor: c.primary + '08' },
    icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 14, fontWeight: '700', color: c.textDarker },
    body: { fontSize: 13.5, lineHeight: 20, color: c.text, marginBottom: 4 },
    meta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    metaSmall: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, color: c.textMuted },
    trailing: { alignItems: 'flex-end', gap: 4 },
    meters: { flexBasis: 200, flexGrow: 1, maxWidth: 280 },
    facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 8 },
    fact: { flexGrow: 1, flexBasis: 150, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.borderSubtle, gap: 4 },
    subheading: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: c.textMuted, marginTop: 12, marginBottom: 6 },
    more: { alignItems: 'center', paddingVertical: 14 },
    moreText: { color: c.primary, fontWeight: '800', fontSize: 13 },
  }),
);
