import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { exportSchoolData, getSchoolUsers, LIST_PAGE_SIZE, SchoolUsersResult } from '../api';
import { BarChart, StackedBarChart } from '../charts';
import { Cell, ExportButton, Grid, StatCard, StatRow } from '../dashboard';
import { errorMessage, isSchoolAdminA, useSession, useToast } from '../context';
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
  const canFilter = isSchoolAdminA(admin.adminType);
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
          title={role === 'students' ? 'Students' : 'Lecturers'}
          subtitle={`${formatCount(data.total)} ${loading ? '· updating…' : 'matching'}`}
          right={
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
          }
        />
        <TabStrip
          tabs={[
            { id: 'students', label: 'Students', icon: 'school', badge: breakdown.totals.students || undefined },
            { id: 'lecturers', label: 'Lecturers', icon: 'co-present', badge: breakdown.totals.lecturers || undefined },
          ]}
          active={role}
          onChange={next => {
            setRole(next);
            setLevel(null);
            setPage(1);
          }}
        />
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
        <Field icon="search" placeholder="Search by name, username or ID" value={query} onChangeText={setQuery} />
        {data.items.length === 0 ? (
          <EmptyState icon="person-search" title="No one here" subtitle={search ? `No results for "${search}".` : 'No users match these filters.'} />
        ) : (
          <View style={loading ? styles.dim : null}>
            {data.items.map(user => (
              <View key={user.uid} style={styles.row}>
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
              </View>
            ))}
          </View>
        )}
        {data.totalPages > 1 ? (
          // The server sends one batch of LIST_PAGE_SIZE at a time, never the whole school.
          <View style={styles.pager}>
            <IconButton filled icon="first-page" label="First page" onPress={() => setPage(1)} disabled={page <= 1 || loading} />
            <Button compact variant="outline" icon="chevron-left" title="Previous" disabled={page <= 1 || loading} onPress={() => setPage(page - 1)} />
            <View style={styles.pagerText}>
              <Text style={styles.name}>
                {formatCount((data.page - 1) * LIST_PAGE_SIZE + 1)}–{formatCount(Math.min(data.total, data.page * LIST_PAGE_SIZE))} of {formatCount(data.total)}
              </Text>
              <Text style={styles.meta}>
                Page {data.page} of {data.totalPages}
              </Text>
            </View>
            <Button compact variant="outline" icon="chevron-right" title="Next" disabled={page >= data.totalPages || loading} onPress={() => setPage(page + 1)} />
            <IconButton filled icon="last-page" label="Last page" onPress={() => setPage(data.totalPages)} disabled={page >= data.totalPages || loading} />
          </View>
        ) : null}
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
  }),
);
