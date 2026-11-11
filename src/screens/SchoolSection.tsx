import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AtRiskGroup, AtRiskSort, exportSchoolData, getSchoolSection } from '../api';
import { levelLabel, scopeText } from './SchoolAnalytics';
import { ExportButton } from '../dashboard';
import { MeterRow } from '../charts';
import { errorMessage, isSchoolAdminA, SchoolSectionId, useSession, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { makeStyles, useColors } from '../theme';
import { Button, EmptyState, Field, FilterChips, formatCount, formatDate, fromNow, Loading, PageHeader, Pill, ScrollPage } from '../ui';

const SECTION_META: Record<SchoolSectionId, { title: string; icon: IconName; empty: string }> = {
  courses: { title: 'Courses this session', icon: 'menu-book', empty: 'No courses for this session.' },
  announcements: { title: 'Announcements this session', icon: 'campaign', empty: 'Nothing announced this session.' },
  lectures: { title: 'Lectures', icon: 'event', empty: 'No lectures match.' },
  'at-risk': { title: 'Students at risk', icon: 'report', empty: 'No students are at risk right now.' },
  lecturers: { title: 'Lecturers', icon: 'co-present', empty: 'No lecturer activity yet.' },
};

const LECTURE_FILTERS = [
  { value: 'all', label: 'All this session' },
  { value: 'today', label: 'Today' },
  { value: 'ongoing', label: 'Happening now' },
] as const;

const when = (iso?: string | null) => (iso ? formatDate(iso, true) : 'Time not set');

function Row({ section, item }: { section: SchoolSectionId; item: Record<string, any> }) {
  const colors = useColors();
  const styles = useStyles();
  switch (section) {
    case 'courses':
      return (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.title}>
              {item.courseCode} {item.courseTitle}
            </Text>
            <Text style={styles.meta}>
              {item.department}
              {item.level ? ` · ${item.level}L` : ''}
              {item.semester ? ` · ${item.semester} semester` : ''} · {item.session}
            </Text>
            <Text style={styles.meta}>{item.lecturers.length ? item.lecturers.join(', ') : 'No lecturer assigned'}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.title}>{Number(item.enrolled).toLocaleString()}</Text>
            <Text style={styles.meta}>enrolled · {item.lecturesHeld} held</Text>
          </View>
        </View>
      );
    case 'announcements':
      return (
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: colors.primary + '14' }]}>
            <Icon name={item.kind === 'memo' ? 'article' : 'notifications-active'} size={18} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.meta}>
              {item.sentBy} · {item.department || 'All departments'}
              {item.audiences?.length ? ` · to ${item.audiences.join(', ')}` : ''} · {fromNow(item.createdAt)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.title}>{Number(item.reach).toLocaleString()}</Text>
            <Text style={styles.meta}>{item.reachLabel}</Text>
          </View>
        </View>
      );
    case 'lectures': {
      const ongoing = item.status === 'ongoing';
      return (
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: colors.info + '1A' }]}>
            <Icon name={item.lectureType === 'Physical' ? 'meeting-room' : 'videocam'} size={18} color={colors.info} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title}>
              {item.courseCode ? `${item.courseCode} · ` : ''}
              {item.topicName}
            </Text>
            <Text style={styles.meta}>
              {item.host} · {item.department} · {item.lectureType}
              {item.location ? ` · ${item.location}` : ''}
            </Text>
            <Text style={styles.meta}>{when(item.startsAt)}</Text>
          </View>
          <View style={styles.stat}>
            <Pill label={String(item.status).toUpperCase()} color={ongoing ? colors.success : item.status === 'completed' ? colors.info : colors.textMuted} />
            <Text style={styles.meta}>
              {item.checkIns}/{item.enrolled} checked in
            </Text>
          </View>
        </View>
      );
    }
    case 'at-risk':
      return (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.meta}>
              {item.matricNumber} · {item.department}
              {item.level ? ` · ${item.level}L` : ''}
            </Text>
          </View>
          <View style={styles.meters}>
            <MeterRow label="Attendance" value={item.attendancePct} color={colors.series1} />
            <MeterRow label="Score" value={item.scorePct} color={colors.series2} />
          </View>
        </View>
      );
    case 'lecturers':
      return (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.meta}>
              {item.physical} physical · {item.online} online
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.title}>{item.lecturesDelivered}</Text>
            <Text style={styles.meta}>lectures delivered</Text>
          </View>
        </View>
      );
  }
}

/** At-risk sort choices. Department reps only ever see one department, so they sort by level. */
const sortOptions = (canFilter: boolean, department: string | null) =>
  [
    { value: 'risk' as const, label: 'Most at risk' },
    ...(canFilter && !department ? [{ value: 'department' as const, label: 'By department' }] : []),
    { value: 'level' as const, label: 'By level' },
  ];

/** Group heading for the at-risk list when it's sorted by department or level. */
const groupOf = (sort: AtRiskSort, item: Record<string, any>) =>
  sort === 'department' ? item.department || 'General' : sort === 'level' ? levelLabel(item.level ? String(item.level).match(/\d+/)?.[0] ?? item.level : 'Unknown') : null;

/** Counts per department or level above the at-risk list. */
function AtRiskSummary({ groups, label }: { groups: AtRiskGroup[]; label: (key: string) => string }) {
  const colors = useColors();
  const styles = useStyles();
  if (groups.length === 0) return null;
  return (
    <View style={styles.summary}>
      {groups.map(g => (
        <View key={g.key} style={[styles.summaryCell, { borderColor: colors.criticalSeverity + '33' }]}>
          <Text numberOfLines={1} style={styles.meta}>{label(g.key)}</Text>
          <Text style={[styles.summaryCount, { color: colors.criticalSeverity }]}>{formatCount(g.count)}</Text>
          <Text style={styles.meta}>
            {g.lowAttendance} attendance · {g.lowScore} score
          </Text>
        </View>
      ))}
    </View>
  );
}

/** "View all" for a school dashboard section, with search, department and level filters, and pages. */
export function SchoolSection({
  section,
  department: initialDepartment,
  level: initialLevel = null,
  filter: initialFilter,
  session,
}: {
  section: SchoolSectionId;
  department: string | null;
  level?: string | null;
  filter?: string;
  /** The session the dashboard was showing; the list stays on it. */
  session?: string;
}) {
  const { admin } = useSession();
  const toast = useToast();
  const styles = useStyles();
  const meta = SECTION_META[section];
  const canFilter = isSchoolAdminA(admin.adminType);
  const isAtRisk = section === 'at-risk';
  const [department, setDepartment] = useState(initialDepartment);
  const [level, setLevel] = useState<string | null>(initialLevel);
  // Institution reps looking across departments start grouped by department; everyone else by level.
  const [sort, setSort] = useState<AtRiskSort>(canFilter && !initialDepartment ? 'department' : 'level');
  const [filter, setFilter] = useState(initialFilter ?? 'all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(
        await getSchoolSection(section, {
          department: canFilter ? department : null,
          level,
          page,
          q: search,
          filter,
          session,
          sort: isAtRisk ? sort : undefined,
        }),
      );
    } catch (reason) {
      toast('error', errorMessage(reason), 'Fetch Error');
      setResult(previous => previous ?? { items: [], total: 0, page: 1, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [canFilter, department, filter, isAtRisk, level, page, search, section, session, sort, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced search; a new search starts from page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const departments: string[] = result?.scope?.departments ?? [];
  const levels: string[] = result?.scope?.levels ?? [];
  const scopeLabel = scopeText((canFilter ? department : result?.scope?.department) ?? null, level);
  const sorts = sortOptions(canFilter, department);
  const activeSort: AtRiskSort = sorts.some(option => option.value === sort) ? sort : 'level';
  const breakdown = result?.breakdown as { byDepartment: AtRiskGroup[]; byLevel: AtRiskGroup[] } | undefined;
  const items: Array<Record<string, any>> = result?.items ?? [];
  return (
    <View style={styles.flex}>
      <PageHeader
        title={meta.title}
        subtitle={`${scopeLabel}${result?.session?.label ? ` · ${result.session.label} session` : ''}${result ? ` · ${formatCount(result.total)} total` : ''}`}
        right={
          <ExportButton
            title={`Export ${meta.title.toLowerCase()}`}
            scopeNote={scopeLabel}
            options={[{ value: section, label: meta.title, personal: section === 'at-risk' || section === 'lecturers' }]}
            onExport={() =>
              exportSchoolData({
                section,
                department: canFilter ? department : null,
                level,
                session: result?.session?.label ?? session,
                sort: isAtRisk ? activeSort : undefined,
              })
            }
          />
        }
      />
      <ScrollPage contentContainerStyle={styles.content}>
        {canFilter && departments.length > 0 ? (
          <FilterChips
            value={department ?? '__all'}
            onChange={value => {
              setDepartment(value === '__all' ? null : value);
              setLevel(null);
              setPage(1);
            }}
            options={[{ value: '__all', label: 'All departments' }, ...departments.map(name => ({ value: name, label: name }))]}
          />
        ) : null}
        {levels.length > 0 ? (
          <FilterChips
            value={level ?? '__all'}
            onChange={value => {
              setLevel(value === '__all' ? null : value);
              setPage(1);
            }}
            options={[{ value: '__all', label: 'All levels' }, ...levels.map(key => ({ value: key, label: levelLabel(key) }))]}
          />
        ) : null}
        {isAtRisk ? (
          <>
            <FilterChips
              value={activeSort}
              onChange={value => {
                setSort(value);
                setPage(1);
              }}
              options={sorts}
            />
            {breakdown && activeSort === 'department' ? <AtRiskSummary groups={breakdown.byDepartment} label={key => key} /> : null}
            {breakdown && activeSort === 'level' && !level ? <AtRiskSummary groups={breakdown.byLevel} label={levelLabel} /> : null}
          </>
        ) : null}
        {section === 'lectures' ? (
          <FilterChips
            value={filter}
            onChange={value => {
              setFilter(value);
              setPage(1);
            }}
            options={LECTURE_FILTERS}
          />
        ) : null}
        <Field icon="search" placeholder="Search this list" value={query} onChangeText={setQuery} />
        {!result ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState icon={meta.icon} title="Nothing here" subtitle={search ? `No results for "${search}".` : meta.empty} />
        ) : (
          <View style={[styles.list, loading && styles.dim]}>
            {items.map((item, index) => {
              const group = isAtRisk ? groupOf(activeSort, item) : null;
              const newGroup = group !== null && (index === 0 || groupOf(activeSort, items[index - 1]) !== group);
              return (
                <React.Fragment key={String(item.id ?? item.courseId ?? item.uid ?? index)}>
                  {newGroup ? <Text style={styles.groupHeading}>{group}</Text> : null}
                  <Row section={section} item={item} />
                </React.Fragment>
              );
            })}
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
    </View>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    content: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingBottom: 60 },
    list: { borderRadius: 18, borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.backgroundSecondary, paddingHorizontal: 16 },
    dim: { opacity: 0.55 },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 14, fontWeight: '700', color: c.textDarker },
    body: { fontSize: 13, color: c.text, marginTop: 3, lineHeight: 19 },
    meta: { fontSize: 12, color: c.textMuted, marginTop: 3 },
    stat: { alignItems: 'flex-end', gap: 4 },
    meters: { flexBasis: 220, flexGrow: 1, maxWidth: 320 },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 },
    groupHeading: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: c.textMuted, paddingTop: 16, paddingBottom: 4 },
    summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
    summaryCell: { flexGrow: 1, flexBasis: 150, maxWidth: 240, padding: 12, borderRadius: 14, borderWidth: 1, backgroundColor: c.backgroundSecondary },
    summaryCount: { fontSize: 22, fontWeight: '800', marginVertical: 2 },
  }),
);

