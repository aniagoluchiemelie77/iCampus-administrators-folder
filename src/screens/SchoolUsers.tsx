import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { exportSchoolData, getSchoolSection, getSchoolUsers, LIST_PAGE_SIZE, Page, SchoolUsersResult } from '../api';
import { BarChart, StackedBarChart } from '../charts';
import { Cell, ExportButton, Grid, StatCard, StatRow } from '../dashboard';
import { errorMessage, isSchoolAdminA, useNavigation, useSession, useToast } from '../context';
import { Icon } from '../icons';
import { makeStyles, useColors } from '../theme';
import {
  Button,
  Card,
  EmptyState,
  Field,
  FilterChips,
  formatCount,
  fromNow,
  IconButton,
  Loading,
  Pill,
  ScrollPage,
  SectionHeader,
  TabStrip,
  UserAvatar,
} from '../ui';

type Role = 'students' | 'lecturers';
type UsersView = Role | 'courses';

function Pager({ page, totalPages, total, loading, onPage }: { page: number; totalPages: number; total: number; loading: boolean; onPage: (page: number) => void }) {
  const styles = useStyles();
  if (totalPages <= 1) return null;
  // The server sends one batch of LIST_PAGE_SIZE at a time, never the whole school.
  return (
    <View style={styles.pager}>
      <IconButton filled icon="first-page" label="First page" onPress={() => onPage(1)} disabled={page <= 1 || loading} />
      <Button compact variant="outline" icon="chevron-left" title="Previous" disabled={page <= 1 || loading} onPress={() => onPage(page - 1)} />
      <View style={styles.pagerText}>
        <Text style={styles.name}>
          {formatCount((page - 1) * LIST_PAGE_SIZE + 1)}–{formatCount(Math.min(total, page * LIST_PAGE_SIZE))} of {formatCount(total)}
        </Text>
        <Text style={styles.meta}>
          Page {page} of {totalPages}
        </Text>
      </View>
      <Button compact variant="outline" icon="chevron-right" title="Next" disabled={page >= totalPages || loading} onPress={() => onPage(page + 1)} />
      <IconButton filled icon="last-page" label="Last page" onPress={() => onPage(totalPages)} disabled={page >= totalPages || loading} />
    </View>
  );
}

type CoursesPage = Page<Record<string, any>> & { scope?: { department: string | null; departments: string[] }; session?: { label: string } };

/**
 * This session's courses, grouped by department. Institution reps can narrow
 * to one department; department reps only ever get their own (server-side).
 */
function SchoolCourses({ canFilter }: { canFilter: boolean }) {
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const { push } = useNavigation();
  const [department, setDepartment] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CoursesPage | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getSchoolSection('courses', { department: canFilter ? department : null, q: search, page, sort: 'department' }));
    } catch (reason) {
      toast('error', errorMessage(reason), 'Fetch Error');
    } finally {
      setLoading(false);
    }
  }, [canFilter, department, page, search, toast]);

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

  const departments = data?.scope?.departments ?? [];
  const items = data?.items ?? [];
  return (
    <>
      {canFilter && departments.length > 0 ? (
        <FilterChips
          value={department ?? '__all'}
          onChange={value => {
            setDepartment(value === '__all' ? null : value);
            setPage(1);
          }}
          options={[{ value: '__all', label: 'All departments' }, ...departments.map(name => ({ value: name, label: name }))]}
        />
      ) : !canFilter ? (
        <View style={styles.locked}>
          <Icon name="lock-outline" size={15} color={colors.textMuted} />
          <Text style={styles.meta}>Showing courses in the {data?.scope?.department ?? 'your'} department only.</Text>
        </View>
      ) : null}
      <Field icon="search" placeholder="Search by course code, title or lecturer" value={query} onChangeText={setQuery} />
      {data?.session?.label ? (
        <Text style={[styles.meta, styles.sessionNote]}>
          {formatCount(data.total)} {data.total === 1 ? 'course' : 'courses'} in the {data.session.label} session
        </Text>
      ) : null}
      {!data ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState icon="menu-book" title="No courses" subtitle={search ? `No results for "${search}".` : 'No courses for this session yet.'} />
      ) : (
        <View style={loading ? styles.dim : null}>
          {items.map((course, index) => {
            const newGroup = index === 0 || items[index - 1].department !== course.department;
            return (
              <React.Fragment key={course.courseId ?? index}>
                {newGroup ? <Text style={styles.groupHeading}>{course.department}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${course.courseCode} ${course.courseTitle}`}
                  onPress={() => push({ name: 'courseDetail', courseId: course.courseId })}
                  style={({ hovered }: any) => [styles.row, hovered && styles.hover]}
                >
                  <View style={styles.codeBadge}>
                    <Text numberOfLines={1} style={styles.codeText}>{String(course.courseCode || '?').slice(0, 9)}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={styles.name}>{course.courseTitle || 'Untitled course'}</Text>
                    <Text numberOfLines={1} style={styles.meta}>
                      {[course.level ? `${course.level}L` : null, course.semester ? `${course.semester} semester` : null].filter(Boolean).join(' · ') || 'Level not set'}
                    </Text>
                    <Text numberOfLines={1} style={styles.meta}>{course.lecturers?.length ? course.lecturers.join(', ') : 'No lecturer assigned'}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.name}>{formatCount(course.enrolled)}</Text>
                    <Text style={styles.meta}>enrolled · {course.lecturesHeld} held</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.textMuted} />
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      )}
      {data ? <Pager page={data.page} totalPages={data.totalPages} total={data.total} loading={loading} onPage={setPage} /> : null}
    </>
  );
}

/**
 * The school's students and lecturers, grouped by department and level.
 * Institution reps (A) see the whole school and can narrow to a department;
 * department reps (B) only ever get their own department (enforced server-side).
 */
export function SchoolUsers() {
  const { admin } = useSession();
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const { push } = useNavigation();
  const canFilter = isSchoolAdminA(admin.adminType);
  const [view, setView] = useState<UsersView>('students');
  const [role, setRole] = useState<Role>('students');
  const [department, setDepartment] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SchoolUsersResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getSchoolUsers({ role, department: canFilter ? department : null, level, q: search, page }));
    } catch (reason) {
      toast('error', errorMessage(reason), 'Fetch Error');
    } finally {
      setLoading(false);
    }
  }, [canFilter, department, level, page, role, search, toast]);

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

  if (!data) return loading ? <Loading label="Loading your institution's users..." /> : <EmptyState icon="wifi-off" title="Couldn't load users" buttonText="Try again" onPress={() => void load()} />;

  const { breakdown, scope } = data;
  const scopeLabel = (canFilter ? department : scope.department) || 'All departments';
  const depts = breakdown.byDepartment.slice(0, 8);

  return (
    <ScrollPage contentContainerStyle={styles.page}>
      <StatRow>
        <StatCard icon="school" label="Students" tone={colors.series1} value={formatCount(breakdown.totals.students)} hint={scopeLabel} />
        <StatCard icon="co-present" label="Lecturers" tone={colors.series3} value={formatCount(breakdown.totals.lecturers)} hint={scopeLabel} />
        <StatCard
          icon="verified-user"
          label="Verified accounts"
          tone={colors.primary}
          value={formatCount(breakdown.totals.verified)}
          hint={`${formatCount(breakdown.totals.suspended)} suspended`}
        />
      </StatRow>

      <Grid>
        <Cell>
          <Card>
            <SectionHeader icon="apartment" title="By department" subtitle="Students and lecturers in each department" />
            {depts.length ? (
              <StackedBarChart
                labels={depts.map(d => (d.department.length > 10 ? `${d.department.slice(0, 9)}…` : d.department))}
                series={[
                  { name: 'Students', color: colors.series1, values: depts.map(d => d.students) },
                  { name: 'Lecturers', color: colors.series3, values: depts.map(d => d.lecturers) },
                ]}
              />
            ) : (
              <Text style={styles.meta}>No users yet.</Text>
            )}
          </Card>
        </Cell>
        <Cell>
          <Card>
            <SectionHeader icon="stairs" title="Students by level" subtitle={scopeLabel} />
            {breakdown.byLevel.length ? (
              <BarChart color={colors.series1} data={breakdown.byLevel.map(l => ({ label: l.level === 'Unknown' ? '?' : `${l.level}L`, value: l.students }))} />
            ) : (
              <Text style={styles.meta}>No students yet.</Text>
            )}
          </Card>
        </Cell>
      </Grid>

      <Card>
        <SectionHeader
          icon="people"
          title={view === 'courses' ? 'Courses' : role === 'students' ? 'Students' : 'Lecturers'}
          subtitle={view === 'courses' ? 'This session, by department. Open one for its people and activity.' : `${formatCount(data.total)} ${loading ? '· updating…' : 'matching'}`}
          right={
            view === 'courses' ? (
              <ExportButton
                title="Export courses"
                scopeNote={scopeLabel}
                options={[{ value: 'courses', label: 'Courses this session' }]}
                onExport={() => exportSchoolData({ section: 'courses', department: canFilter ? department : null })}
              />
            ) : (
            <ExportButton
              title="Export users"
              scopeNote={`${scopeLabel}${level && role === 'students' ? ` · ${level} level` : ''}`}
              options={[
                { value: 'students', label: 'Students', personal: true, hint: 'Name, matric number, department, level' },
                { value: 'lecturer-accounts', label: 'Lecturers', personal: true, hint: 'Name, staff ID, department' },
              ]}
              onExport={([section]) =>
                exportSchoolData({ section, department: canFilter ? department : null, level: section === 'students' ? level : null })
              }
            />
            )
          }
        />
        <TabStrip
          tabs={[
            { id: 'students', label: 'Students', icon: 'school', badge: breakdown.totals.students || undefined },
            { id: 'lecturers', label: 'Lecturers', icon: 'co-present', badge: breakdown.totals.lecturers || undefined },
            { id: 'courses', label: 'Courses', icon: 'menu-book' },
          ]}
          active={view}
          onChange={next => {
            setView(next);
            if (next === 'courses' || next === role) return;
            setRole(next);
            setLevel(null);
            setPage(1);
          }}
        />
        {view === 'courses' ? (
          <SchoolCourses canFilter={canFilter} />
        ) : (
        <>
        {canFilter && scope.departments.length > 0 ? (
          <FilterChips
            value={department ?? '__all'}
            onChange={value => {
              setDepartment(value === '__all' ? null : value);
              setPage(1);
            }}
            options={[{ value: '__all', label: 'All departments' }, ...scope.departments.map(name => ({ value: name, label: name }))]}
          />
        ) : !canFilter ? (
          <View style={styles.locked}>
            <Icon name="lock-outline" size={15} color={colors.textMuted} />
            <Text style={styles.meta}>Showing the {scope.department ?? 'your'} department only.</Text>
          </View>
        ) : null}
        {role === 'students' && breakdown.byLevel.length > 0 ? (
          <FilterChips
            value={level ?? '__all'}
            onChange={value => {
              setLevel(value === '__all' ? null : value);
              setPage(1);
            }}
            options={[
              { value: '__all', label: 'All levels' },
              ...breakdown.byLevel.map(l => ({ value: l.level, label: l.level === 'Unknown' ? 'Level not set' : `${l.level} level`, count: l.students })),
            ]}
          />
        ) : null}
        <Field icon="search" placeholder="Search by name, username, ID number or user ID" value={query} onChangeText={setQuery} />
        {data.items.length === 0 ? (
          <EmptyState icon="person-search" title="No one here" subtitle={search ? `No results for "${search}".` : 'No users match these filters.'} />
        ) : (
          <View style={loading ? styles.dim : null}>
            {data.items.map(user => (
              <Pressable
                key={user.uid}
                accessibilityRole="button"
                accessibilityLabel={`Open ${user.name}`}
                onPress={() => push({ name: 'userProfile', uid: user.uid })}
                style={({ hovered }: any) => [styles.row, hovered && styles.hover]}
              >
                <UserAvatar profilePic={user.profilePic} firstName={user.name} size={40} />
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <Text numberOfLines={1} style={styles.name}>{user.name}</Text>
                    {user.isVerified ? <Icon name="verified" size={15} color={colors.primary} /> : null}
                    {user.isSuspended ? <Pill label="SUSPENDED" color={colors.criticalSeverity} /> : null}
                  </View>
                  <Text numberOfLines={1} style={styles.meta}>
                    {user.idNumber || 'No ID'} · {user.department}
                    {user.level ? ` · ${user.level === 'Unknown' ? 'level not set' : `${user.level}L`}` : ''}
                    {user.username ? ` · @${user.username}` : ''}
                  </Text>
                </View>
                {user.joinedAt ? <Text style={styles.meta}>Joined {fromNow(user.joinedAt)}</Text> : null}
                <Icon name="chevron-right" size={20} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}
        <Pager page={data.page} totalPages={data.totalPages} total={data.total} loading={loading} onPage={setPage} />
        </>
        )}
      </Card>
    </ScrollPage>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    page: { paddingBottom: 120 },
    flex: { flex: 1, minWidth: 0 },
    dim: { opacity: 0.55 },
    meta: { fontSize: 12, color: c.textMuted },
    locked: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: c.textDarker },
    pager: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 },
    pagerText: { alignItems: 'center', minWidth: 130, paddingHorizontal: 6 },
    hover: { backgroundColor: c.primary + '08' },
    stat: { alignItems: 'flex-end', gap: 2 },
    sessionNote: { marginBottom: 4 },
    groupHeading: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: c.textMuted, paddingTop: 16, paddingBottom: 4 },
    codeBadge: { minWidth: 70, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12, alignItems: 'center', backgroundColor: c.primary },
    codeText: { color: c.btnTextColor, fontWeight: '900', fontSize: 12, letterSpacing: 0.4 },
  }),
);
