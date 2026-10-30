import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { exportSchoolData, getSchoolSection } from '../api';
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

/** "View all" for a school dashboard section, with search, department filter and pages. */
export function SchoolSection({
  section,
  department: initialDepartment,
  filter: initialFilter,
  session,
}: {
  section: SchoolSectionId;
  department: string | null;
  filter?: string;
  /** The session the dashboard was showing; the list stays on it. */
  session?: string;
}) {
  const { admin } = useSession();
  const toast = useToast();
  const styles = useStyles();
  const meta = SECTION_META[section];
  const canFilter = isSchoolAdminA(admin.adminType);
  const [department, setDepartment] = useState(initialDepartment);
  const [filter, setFilter] = useState(initialFilter ?? 'all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await getSchoolSection(section, { department: canFilter ? department : null, page, q: search, filter, session }));
    } catch (reason) {
      toast('error', errorMessage(reason), 'Fetch Error');
      setResult(previous => previous ?? { items: [], total: 0, page: 1, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [canFilter, department, filter, page, search, section, session, toast]);

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
  const scopeLabel = (canFilter ? department : result?.scope?.department) || 'All departments';
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
            onExport={() => exportSchoolData({ section, department: canFilter ? department : null, session: result?.session?.label ?? session })}
          />
        }
      />
      <ScrollPage contentContainerStyle={styles.content}>
        {canFilter && departments.length > 0 ? (
          <FilterChips
            value={department ?? '__all'}
            onChange={value => {
              setDepartment(value === '__all' ? null : value);
              setPage(1);
            }}
            options={[{ value: '__all', label: 'All departments' }, ...departments.map(name => ({ value: name, label: name }))]}
          />
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
        ) : result.items.length === 0 ? (
          <EmptyState icon={meta.icon} title="Nothing here" subtitle={search ? `No results for "${search}".` : meta.empty} />
        ) : (
          <View style={[styles.list, loading && styles.dim]}>
            {result.items.map((item: Record<string, any>, index: number) => (
              <Row key={String(item.id ?? item.courseId ?? item.uid ?? index)} section={section} item={item} />
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
  }),
);

