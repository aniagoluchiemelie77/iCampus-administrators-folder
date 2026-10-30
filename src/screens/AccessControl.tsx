import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AdminDirectory,
  AdminUser,
  Attachment,
  deleteAdmin,
  DirectoryAdmin,
  getAdminActivity,
  getAdminDirectory,
  getAdminProfile,
  notifyAdmins,
} from '../api';
import { MeterRow } from '../charts';
import { AttachmentPicker, Cell, Grid, StatCard, StatRow } from '../dashboard';
import { errorMessage, normalizeRole, useNavigation, useSession, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { makeStyles, useColors } from '../theme';
import {
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  Field,
  FilterChips,
  formatCount,
  formatDate,
  formatLabel,
  fromNow,
  IconButton,
  Loading,
  PageHeader,
  Pill,
  ScrollPage,
  SectionHeader,
  UserAvatar,
} from '../ui';
import { AdminCard, fullName, roleMeta } from './Admins';
import { SchoolBillingCard } from './Finance';

/**
 * Access control for the iCampus team: staff admins first, then each school's
 * institution representative (A-level), a page at a time. An A rep opens a
 * detail screen with their school and the department reps (B) they added.
 * Every staff role can look; only super admins add, edit, remove, message
 * or see what admins have been doing (also enforced by the backend).
 */

type Data = Record<string, any>;

const lastSeen = (value: unknown) => (value ? `${fromNow(value)}` : 'Never signed in');
/** Finance and super admins see school billing; other staff see the plan only. */
const seesBilling = (adminType: string) => adminType === 'super_admin' || adminType === 'finance';

function SchoolAdminCard({ admin, showBilling, onPress }: { admin: DirectoryAdmin; showBilling: boolean; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const limit = admin.bRepsLimit;
  const used = admin.bRepsAdded ?? 0;
  const billingTone =
    admin.billingStatus === 'overdue' ? colors.criticalSeverity : admin.billingStatus === 'due_soon' ? colors.pendingDelivery : admin.billingStatus === 'active' ? colors.success : colors.textMuted;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ hovered }: any) => [styles.schoolCard, hovered && styles.schoolCardHover]}>
      <View style={[styles.schoolCover, { backgroundColor: colors.pendingDelivery + '18' }]}>
        {admin.schoolLogo ? <Image source={{ uri: admin.schoolLogo }} style={styles.coverLogo} blurRadius={18} /> : null}
        <View style={styles.coverRow}>
          {admin.schoolLogo ? (
            <Image source={{ uri: admin.schoolLogo }} style={styles.schoolLogo} />
          ) : (
            <View style={[styles.schoolLogo, styles.center, { backgroundColor: colors.backgroundSecondary }]}>
              <Icon name="account-balance" size={22} color={colors.pendingDelivery} />
            </View>
          )}
          <View style={styles.flex}>
            <Text numberOfLines={2} style={styles.schoolName}>{admin.schoolName}</Text>
            <Text style={styles.meta}>{admin.schoolCode}</Text>
          </View>
          <Pill label={(admin.tierLabel || 'Basic').toUpperCase()} icon="workspace-premium" color={colors.primary} solid />
        </View>
      </View>
      <View style={styles.schoolBody}>
        <UserAvatar profilePic={admin.profilePic} firstName={admin.firstname} lastName={admin.lastname} size={44} />
        <View style={styles.flex}>
          <Text numberOfLines={1} style={styles.rowTitle}>{fullName(admin)}</Text>
          <Text numberOfLines={1} style={styles.meta}>{admin.email}</Text>
        </View>
      </View>
      <View style={styles.schoolStats}>
        <View style={styles.flex}>
          <MeterRow
            label="Department reps added"
            value={used}
            max={limit ?? Math.max(used, 1)}
            unit={limit == null ? ' (unlimited)' : ` of ${limit}`}
            color={colors.info}
          />
        </View>
      </View>
      <View style={styles.schoolFoot}>
        <View style={[styles.presence, { backgroundColor: admin.lastAccessed ? colors.success : colors.textMuted }]} />
        <Text style={[styles.meta, styles.flex]}>Last active {lastSeen(admin.lastAccessed)}</Text>
        {showBilling ? <Pill label={formatLabel(admin.billingStatus || 'not_set').toUpperCase()} color={billingTone} /> : null}
      </View>
    </Pressable>
  );
}

export function StaffAccessControl() {
  const { admin: me } = useSession();
  const { push } = useNavigation();
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const superAdmin = me.adminType === 'super_admin';
  const showBilling = seesBilling(me.adminType);
  const [data, setData] = useState<Omit<AdminDirectory, 'schoolAdmins'> | null>(null);
  const [reps, setReps] = useState<DirectoryAdmin[]>([]);
  const [repsPage, setRepsPage] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  const [role, setRole] = useState('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  // Drops a slow page that lands after the search has changed.
  const latest = useRef(0);

  /** Page 1 replaces the institution reps; later pages add the next batch. */
  const load = useCallback(
    async (page = 1) => {
      const request = ++latest.current;
      if (page > 1) setLoadingMore(true);
      try {
        const result = await getAdminDirectory({ page, q: search });
        if (request !== latest.current) return;
        setData({ admins: result.admins, totals: result.totals });
        setReps(previous => (page === 1 ? result.schoolAdmins.items : [...previous, ...result.schoolAdmins.items]));
        setRepsPage({ page: result.schoolAdmins.page, totalPages: result.schoolAdmins.totalPages, total: result.schoolAdmins.total });
      } catch (reason) {
        toast('error', errorMessage(reason), 'Fetch Error');
      } finally {
        if (request === latest.current) setLoadingMore(false);
      }
    },
    [search, toast],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteAdmin(removing.uid);
      toast('success', 'Administrator removed.', 'Removed');
      setRemoving(null);
      await load(1);
    } catch (reason) {
      toast('error', errorMessage(reason), 'Remove failed');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Loading />;
  const roles = [...new Set(data.admins.map(a => normalizeRole(a.adminType)))];
  const team = role === 'all' ? data.admins : data.admins.filter(a => a.adminType === role);
  const openAdmin = (uid: string) => push({ name: 'adminDetail', uid });

  return (
    <>
      <ScrollPage contentContainerStyle={styles.page}>
        <StatRow>
          <StatCard icon="shield" label="iCampus team" tone={colors.primary} value={formatCount(data.admins.length)} hint={`${roles.length} roles`} />
          <StatCard
            icon="account-balance"
            label="Institution reps (A)"
            tone={colors.pendingDelivery}
            value={formatCount(data.totals.schoolAdmins)}
            hint={`${formatCount(data.totals.departmentReps)} department reps (B) under them`}
          />
          <StatCard
            icon="bolt"
            label="Active this week"
            tone={colors.success}
            value={formatCount(data.totals.activeThisWeek)}
            hint="Signed in during the last 7 days"
            onPress={superAdmin ? () => push({ name: 'adminActivity' }) : undefined}
          />
        </StatRow>

        <SectionHeader
          icon="admin-panel-settings"
          title="iCampus team"
          subtitle="Staff administrators with portal access"
          right={
            <View style={styles.actions}>
              <IconButton filled size={19} icon="refresh" label="Refresh" onPress={() => void load(1)} />
              {superAdmin ? (
                <>
                  <Button compact variant="soft" icon="history" title="Activity" onPress={() => push({ name: 'adminActivity' })} />
                  <Button compact variant="soft" icon="send" title="Message" onPress={() => push({ name: 'messageAdmins' })} />
                  <Button compact icon="person-add-alt" title="Add Admin" onPress={() => push({ name: 'adminForm' })} />
                </>
              ) : null}
            </View>
          }
        />
        {roles.length > 1 ? (
          <FilterChips
            value={role}
            onChange={setRole}
            options={[
              { value: 'all', label: 'All roles', count: data.admins.length },
              ...roles.map(r => ({ value: r, label: formatLabel(r), count: data.admins.filter(a => a.adminType === r).length })),
            ]}
          />
        ) : null}
        <View style={styles.grid}>
          {team.map(item => (
            <View key={item.uid} style={styles.gridCell}>
              <AdminCard
                admin={item}
                isSelf={item.uid === me.uid}
                canManage={superAdmin}
                onOpen={superAdmin ? () => openAdmin(item.uid) : undefined}
                onEdit={() => push({ name: 'adminForm', admin: item })}
                onDelete={() => setRemoving(item)}
              />
            </View>
          ))}
        </View>

        <View style={styles.sectionGap} />
        <SectionHeader
          icon="account-balance"
          title="Institution representatives"
          subtitle="A-level school admins · open one for their school and the department reps they added"
        />
        <Field icon="search" placeholder="Search by school, name, email or code" value={query} onChangeText={setQuery} />
        {reps.length === 0 ? (
          <EmptyState
            icon="account-balance"
            title="No institution reps"
            subtitle={search ? `No results for "${search}".` : superAdmin ? 'Add one with "Add Admin" when a school signs its contract.' : 'None have been added yet.'}
          />
        ) : (
          <View style={styles.grid}>
            {reps.map(item => (
              <View key={item.uid} style={styles.gridCell}>
                <SchoolAdminCard admin={item} showBilling={showBilling} onPress={() => openAdmin(item.uid)} />
              </View>
            ))}
          </View>
        )}
        {reps.length > 0 ? (
          <View style={styles.pager}>
            <Text style={styles.meta}>
              Showing {formatCount(reps.length)} of {formatCount(repsPage.total)}
            </Text>
            {repsPage.page < repsPage.totalPages ? (
              <Button compact variant="outline" icon="expand-more" title="Show more" loading={loadingMore} onPress={() => void load(repsPage.page + 1)} />
            ) : null}
          </View>
        ) : null}
      </ScrollPage>
      <ConfirmModal
        visible={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => void remove()}
        title="Remove administrator?"
        subtitle={`${removing ? fullName(removing) : ''} will lose portal access immediately. This can't be undone.`}
        confirmText="Remove"
        loading={busy}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Admin detail
// ---------------------------------------------------------------------------

const ACTION_ICONS: Array<[RegExp, IconName]> = [
  [/export/, 'file-download'],
  [/notif|notified|message/, 'send'],
  [/rep|admin|create|invite/, 'person-add-alt'],
  [/remove|delete/, 'delete-outline'],
  [/view/, 'visibility'],
  [/billing|payment/, 'payments'],
  [/ads?\b/, 'campaign'],
];
const actionIcon = (action: string): IconName => ACTION_ICONS.find(([re]) => re.test(action))?.[1] ?? 'history';

export function ActivityRow({ entry, showActor = false }: { entry: Data; showActor?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const details = entry.details || {};
  const summary = [
    details.title,
    details.section && formatLabel(details.section),
    details.department,
    details.rows != null && `${formatCount(details.rows)} rows`,
    details.recipients != null && `${formatCount(details.recipients)} recipients`,
    details.schoolName,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: colors.primary + '14' }]}>
        <Icon name={actionIcon(String(entry.action))} size={16} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>
          {showActor ? `${entry.actorName} · ` : ''}
          {formatLabel(String(entry.action || 'action'))}
        </Text>
        {summary ? <Text numberOfLines={2} style={styles.meta}>{summary}</Text> : null}
        <Text style={styles.meta}>
          {formatDate(entry.createdAt, true)}
          {entry.source === 'school' ? ' · school audit log' : ''}
          {details.personalData ? ' · personal data' : ''}
        </Text>
      </View>
    </View>
  );
}

function RepRow({ rep, onPress }: { rep: Data; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={({ hovered }: any) => [styles.repRow, hovered && { backgroundColor: colors.primary + '08' }]}>
      <UserAvatar profilePic={rep.profilePic} firstName={rep.firstname} lastName={rep.lastname} size={36} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={styles.rowTitle}>{fullName(rep as AdminUser)}</Text>
        <Text numberOfLines={1} style={styles.meta}>
          {rep.adminType === 'school_admin_a' ? 'Institution rep' : rep.department || 'No department'} · {lastSeen(rep.lastAccessed)}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export function AdminDetail({ uid }: { uid: string }) {
  const { admin: me } = useSession();
  const { push } = useNavigation();
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const [data, setData] = useState<Data | null>(null);
  const superAdmin = me.adminType === 'super_admin';

  useEffect(() => {
    getAdminProfile(uid)
      .then(setData)
      .catch(reason => toast('error', errorMessage(reason), 'Fetch Error'));
  }, [toast, uid]);

  if (!data) {
    return (
      <View style={styles.flex}>
        <PageHeader title="Administrator" />
        <Loading />
      </View>
    );
  }
  const a = data.admin as AdminUser;
  const role = roleMeta(a.adminType, colors);
  const school = data.school as Data | null;
  const reps = data.reps as Data[];
  const isA = a.adminType === 'school_admin_a';
  const bReps = reps.filter(r => r.adminType === 'school_admin_b');
  const aSeatsUsed = reps.filter(r => r.adminType === 'school_admin_a').length + (isA ? 1 : 0);
  const bSeatsUsed = bReps.length + (isA ? 0 : 1);
  const added = reps.filter(r => r.addedByThisAdmin);
  const others = reps.filter(r => !r.addedByThisAdmin);
  const staff = !a.schoolCode;
  // The server only sends billing (status, amount, due date) to finance and super admins.
  const billing = Boolean(school?.status);
  const openRep = (rep: Data) => push({ name: 'adminDetail', uid: rep.uid });

  return (
    <View style={styles.flex}>
      <PageHeader
        title={fullName(a)}
        subtitle={school ? `${role.label} · ${school.name}` : role.label}
        right={
          superAdmin ? (
            <IconButton filled icon="send" label={`Message ${a.firstname}`} onPress={() => push({ name: 'messageAdmins', uids: [a.uid], label: fullName(a) })} />
          ) : undefined
        }
      />
      <ScrollPage contentContainerStyle={styles.detail}>
        <View style={styles.hero}>
          <View style={[styles.heroCover, { backgroundColor: role.tone + '1F' }]}>
            <View style={[styles.heroOrb, { backgroundColor: role.tone + '24' }]} />
            <Icon name={role.icon} size={120} color={role.tone + '2E'} style={styles.heroIcon} />
          </View>
          <View style={styles.heroBody}>
            <View style={[styles.avatarRing, { backgroundColor: colors.backgroundSecondary }]}>
              <UserAvatar profilePic={a.profilePic} firstName={a.firstname} lastName={a.lastname} size={84} />
            </View>
            <View style={styles.heroText}>
              <View style={styles.nameRow}>
                <Text style={styles.heroName}>{fullName(a)}</Text>
                {a.isVerified ? <Icon name="verified" size={20} color={colors.primary} /> : null}
              </View>
              <Text style={styles.meta}>{a.email}</Text>
              <View style={styles.pills}>
                <Pill label={role.label.toUpperCase()} icon={role.icon} color={role.tone} />
                {school ? <Pill label={String(school.name)} icon="account-balance" color={colors.pendingDelivery} /> : null}
                {a.department ? <Pill label={String(a.department)} icon="apartment" color={colors.info} /> : null}
              </View>
            </View>
          </View>
          <View style={styles.heroFacts}>
            <Fact icon="schedule" label="Last accessed" value={a.lastAccessed ? `${fromNow(a.lastAccessed)} · ${formatDate(a.lastAccessed, true)}` : 'Never signed in'} />
            <Fact icon="event" label="Admin since" value={a.createdAt ? formatDate(a.createdAt) : '—'} />
            <Fact icon="person" label="Added by" value={data.invitedBy ? fullName(data.invitedBy as AdminUser) : '—'} />
            {data.stats ? <Fact icon="bolt" label="Actions (30 days)" value={formatCount(data.stats.actionsLast30Days)} /> : null}
          </View>
        </View>

        {school ? (
          <Grid>
            <Cell>
              <Card>
                <SectionHeader icon="school" title="Institution" subtitle={`${school.name} · ${school.tierLabel} plan`} />
                {billing ? <SchoolBillingCard school={school} onPress={() => push({ name: 'financeSection', section: 'schools' })} /> : null}
                <Text style={styles.subTitle}>Seats on this plan</Text>
                <MeterRow label="Institution reps (A)" value={aSeatsUsed} max={school.seats?.a ?? aSeatsUsed} unit={` of ${school.seats?.a ?? '∞'}`} color={colors.pendingDelivery} />
                <MeterRow
                  label="Department reps (B)"
                  value={bSeatsUsed}
                  max={school.seats?.b ?? Math.max(1, bSeatsUsed)}
                  unit={school.seats?.b == null ? ' (unlimited)' : ` of ${school.seats.b}`}
                  color={colors.info}
                />
              </Card>
            </Cell>
            <Cell>
              <Card>
                <SectionHeader
                  icon="apartment"
                  title={`Department reps added by ${a.firstname || 'them'}`}
                  subtitle={`${added.length} added · ${bReps.length} department reps at ${school.name}`}
                />
                {added.length === 0 ? (
                  <Text style={styles.meta}>{isA ? `${a.firstname || 'They'} hasn't added any department reps yet.` : 'Department reps are added by institution reps.'}</Text>
                ) : null}
                {added.map(rep => (
                  <RepRow key={rep.uid} rep={rep} onPress={() => openRep(rep)} />
                ))}
              </Card>
            </Cell>
          </Grid>
        ) : null}

        {school && others.length > 0 ? (
          <Card>
            <SectionHeader icon="groups" title={`Other representatives at ${school.name}`} subtitle="Added by someone else" />
            {others.map(rep => (
              <RepRow key={rep.uid} rep={rep} onPress={() => openRep(rep)} />
            ))}
          </Card>
        ) : null}

        {data.activity ? (
          <Card>
            <SectionHeader
              icon="history"
              title="Recent activity"
              subtitle={staff ? 'Changes, messages and exports in the portal' : 'Portal actions and the school audit log'}
              onViewAll={() => push({ name: 'adminActivity', actorUid: a.uid, title: fullName(a) })}
            />
            {data.activity.length === 0 ? <Text style={styles.meta}>Nothing recorded yet.</Text> : null}
            {data.activity.map((entry: Data) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </Card>
        ) : null}
      </ScrollPage>
    </View>
  );
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={16} color={colors.textMuted} />
      <View style={styles.flex}>
        <Text style={styles.factLabel}>{label.toUpperCase()}</Text>
        <Text numberOfLines={2} style={styles.factValue}>{value}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

const ACTIVITY_ROLES = ['all', 'super_admin', 'finance', 'support', 'moderator', 'analyst', 'social_media', 'school_admin_a', 'school_admin_b'];

export function AdminActivityScreen({ actorUid, title }: { actorUid?: string; title?: string }) {
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Data | null>(null);

  useEffect(() => {
    getAdminActivity({ actorUid, role, page })
      .then(setResult)
      .catch(reason => toast('error', errorMessage(reason), 'Fetch Error'));
  }, [actorUid, page, role, toast]);

  return (
    <View style={styles.flex}>
      <PageHeader title={title ? `${title}'s activity` : 'Admin activity'} subtitle={result ? `${formatCount(result.total)} actions` : undefined} />
      <ScrollPage contentContainerStyle={styles.detail}>
        {!actorUid ? (
          <FilterChips
            value={role}
            onChange={value => {
              setRole(value);
              setPage(1);
            }}
            options={ACTIVITY_ROLES.map(r => ({ value: r, label: r === 'all' ? 'Everyone' : roleMeta(r, colors).label }))}
          />
        ) : null}
        {!result ? (
          <Loading />
        ) : result.items.length === 0 ? (
          <EmptyState icon="history" title="No activity yet" subtitle="Admin changes, messages and exports appear here." />
        ) : (
          <Card>
            {result.items.map((entry: Data) => (
              <ActivityRow key={entry.id} entry={entry} showActor={!actorUid} />
            ))}
          </Card>
        )}
        {result && result.totalPages > 1 ? (
          <View style={styles.pager}>
            <Button compact variant="outline" icon="chevron-left" title="Newer" disabled={page <= 1} onPress={() => setPage(page - 1)} />
            <Text style={styles.meta}>
              Page {result.page} of {result.totalPages}
            </Text>
            <Button compact variant="outline" icon="chevron-right" title="Older" disabled={page >= result.totalPages} onPress={() => setPage(page + 1)} />
          </View>
        ) : null}
      </ScrollPage>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Message admins
// ---------------------------------------------------------------------------

const MESSAGE_ROLES = [
  { value: 'finance', label: 'Finance' },
  { value: 'support', label: 'Support' },
  { value: 'moderator', label: 'Moderators' },
  { value: 'analyst', label: 'Analysts' },
  { value: 'social_media', label: 'Social media' },
  { value: 'super_admin', label: 'Super admins' },
  { value: 'school_admin_a', label: 'Institution reps (A)' },
  { value: 'school_admin_b', label: 'Department reps (B)' },
];

export function MessageAdmins({ uids, label }: { uids?: string[]; label?: string }) {
  const { pop } = useNavigation();
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const [roles, setRoles] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const direct = Boolean(uids?.length);
  const valid = title.trim().length >= 3 && (message.trim().length >= 3 || attachments.length > 0) && (direct || roles.length > 0);

  const send = async () => {
    setSending(true);
    try {
      const result = await notifyAdmins({ title: title.trim(), message: message.trim(), attachments, ...(direct ? { uids } : { roles }) });
      toast('success', result.message, 'Sent');
      pop();
    } catch (reason) {
      toast('error', errorMessage(reason), 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.flex}>
      <PageHeader title="Message administrators" subtitle={direct ? `To ${label ?? `${uids!.length} admins`}` : 'Choose who receives it'} />
      <ScrollPage contentContainerStyle={styles.form}>
        {!direct ? (
          <>
            <Text style={styles.label}>Send to</Text>
            <View style={styles.pills}>
              {MESSAGE_ROLES.map(r => {
                const active = roles.includes(r.value);
                return (
                  <Pressable
                    key={r.value}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    onPress={() => setRoles(current => (active ? current.filter(x => x !== r.value) : [...current, r.value]))}
                    style={[styles.roleChip, { borderColor: active ? colors.primary : colors.borderSubtle, backgroundColor: active ? colors.primary + '14' : colors.backgroundSecondary }]}
                  >
                    <Icon name={active ? 'check-box' : 'check-box-outline-blank'} size={18} color={active ? colors.primary : colors.textMuted} />
                    <Text style={[styles.rowTitle, active && { color: colors.primary }]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        <Field label={`Title (${title.length}/80)`} value={title} onChangeText={value => setTitle(value.slice(0, 80))} placeholder="e.g. Portal maintenance on Saturday" />
        <Field label={`Message (${message.length}/1000)`} multiline value={message} onChangeText={value => setMessage(value.slice(0, 1000))} placeholder="What do they need to know?" />
        <AttachmentPicker value={attachments} onChange={setAttachments} />
        <Text style={styles.meta}>Admins see it in their Notifications tab and as a push on any device signed in to their admin account.</Text>
        <Button title="Send" icon="send" onPress={() => void send()} loading={sending} disabled={!valid} style={styles.submit} />
      </ScrollPage>
    </View>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    center: { alignItems: 'center', justifyContent: 'center' },
    page: { paddingBottom: 120 },
    detail: { width: '100%', maxWidth: 1080, alignSelf: 'center', paddingBottom: 60 },
    form: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 60 },
    meta: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
    label: { color: c.textDarker, fontSize: 13, fontWeight: '700', marginBottom: 8 },
    subTitle: { fontSize: 13, fontWeight: '800', marginTop: 16, marginBottom: 10, color: c.textDarker },
    rowTitle: { fontSize: 13.5, fontWeight: '700', color: c.textDarker },
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    gridCell: { flexGrow: 1, flexBasis: 320, maxWidth: 520 },
    sectionGap: { height: 28 },
    schoolCard: { borderRadius: 22, borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.backgroundSecondary, overflow: 'hidden' },
    schoolCardHover: { borderColor: c.pendingDelivery + '88', transform: [{ translateY: -2 }] },
    schoolCover: { padding: 16, overflow: 'hidden' },
    coverLogo: { ...StyleSheet.absoluteFill, opacity: 0.18 },
    coverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    schoolLogo: { width: 52, height: 52, borderRadius: 16, backgroundColor: c.backgroundSecondary },
    schoolName: { fontSize: 16, fontWeight: '900', color: c.textDarker },
    schoolBody: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14 },
    schoolStats: { paddingHorizontal: 16, paddingTop: 12 },
    schoolFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.borderSubtle, backgroundColor: c.surfaceRaised },
    presence: { width: 8, height: 8, borderRadius: 4 },
    hero: { borderRadius: 24, borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.backgroundSecondary, overflow: 'hidden', marginBottom: 16 },
    heroCover: { height: 120, overflow: 'hidden' },
    heroOrb: { position: 'absolute', width: 240, height: 240, borderRadius: 120, left: -60, top: -140 },
    heroIcon: { position: 'absolute', right: 24, top: -10, transform: [{ rotate: '-12deg' }] },
    heroBody: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16, paddingHorizontal: 24, marginTop: -48 },
    avatarRing: { padding: 5, borderRadius: 50 },
    heroText: { flex: 1, minWidth: 220, paddingBottom: 6, gap: 4 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroName: { fontSize: 24, fontWeight: '900', color: c.textDarker, letterSpacing: -0.4 },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 12 },
    heroFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 20 },
    fact: { flexGrow: 1, flexBasis: 200, flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderSubtle },
    factLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: c.textMuted },
    factValue: { fontSize: 13, fontWeight: '700', color: c.textDarker, marginTop: 2 },
    repRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10 },
    activityRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    activityIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    roleChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 },
    submit: { marginTop: 16 },
  }),
);
