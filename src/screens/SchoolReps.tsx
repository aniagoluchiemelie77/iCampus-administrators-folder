import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  getSchoolAuditLog,
  getSchoolReps,
  inviteSchoolRep,
  removeSchoolRep,
  SchoolRep,
  SchoolRepsResult,
  Seats,
  updateSchoolRep,
} from '../api';
import { useMeasuredWidth } from '../charts';
import { errorMessage, useNavigation, useSession, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { makeStyles, useColors } from '../theme';
import {
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  Field,
  formatDate,
  formatLabel,
  fromNow,
  IconButton,
  isValidEmail,
  Loading,
  OptionPicker,
  PageHeader,
  parseDate,
  Pill,
  ScrollPage,
  SectionHeader,
  UserAvatar,
} from '../ui';

const fullName = (rep: Pick<SchoolRep, 'firstname' | 'lastname'>) =>
  [rep.firstname, rep.lastname].filter(Boolean).join(' ') || 'Representative';

function SeatMeter({ label, icon, seats, tone }: { label: string; icon: IconName; seats: Seats; tone: string }) {
  const colors = useColors();
  const styles = useStyles();
  const full = seats.limit !== null && seats.used >= seats.limit;
  return (
    <View style={styles.seat}>
      <View style={styles.seatHead}>
        <Icon name={icon} size={18} color={tone} />
        <Text style={styles.seatLabel}>{label}</Text>
        <Text style={[styles.seatCount, full && { color: colors.pendingDelivery }]}>
          {seats.used}
          {seats.limit === null ? ' · unlimited' : ` / ${seats.limit}`}
        </Text>
      </View>
      {seats.limit !== null ? (
        <View style={[styles.seatTrack, { backgroundColor: colors.gridLine }]}>
          <View style={[styles.seatFill, { width: `${Math.min(100, (seats.used / Math.max(1, seats.limit)) * 100)}%`, backgroundColor: full ? colors.pendingDelivery : tone }]} />
        </View>
      ) : null}
    </View>
  );
}

function RepCard({
  rep,
  isSelf,
  canManage,
  onEdit,
  onRemove,
}: {
  rep: SchoolRep;
  isSelf: boolean;
  canManage: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const institution = rep.level === 'a';
  const tone = institution ? colors.primary : colors.info;
  const lastSeen = parseDate(rep.lastAccessed);
  return (
    <View style={styles.card}>
      <View style={[styles.cover, { backgroundColor: tone + '1C' }]}>
        <Icon name={institution ? 'account-balance' : 'apartment'} size={84} color={tone + '2E'} style={styles.coverIcon} />
        <View style={styles.coverBadges}>
          <Pill label={institution ? 'A LEVEL' : 'B LEVEL'} color={tone} solid />
          {isSelf ? <Pill label="YOU" icon="person" color={tone} /> : null}
        </View>
      </View>
      <View style={styles.body}>
        <View style={[styles.avatarRing, { backgroundColor: colors.backgroundSecondary }]}>
          <UserAvatar profilePic={rep.profilePic} firstName={rep.firstname} lastName={rep.lastname} size={64} />
        </View>
        <Text numberOfLines={2} style={styles.name}>{fullName(rep)}</Text>
        <Text style={[styles.role, { color: tone }]}>{institution ? 'Institution Representative' : 'Department Representative'}</Text>
        <View style={styles.metaRow}>
          <Icon name="school" size={14} color={colors.textMuted} />
          <Text numberOfLines={1} style={styles.meta}>{rep.schoolName}</Text>
        </View>
        {rep.department ? (
          <View style={styles.metaRow}>
            <Icon name="apartment" size={14} color={colors.textMuted} />
            <Text numberOfLines={1} style={styles.meta}>{rep.department}</Text>
          </View>
        ) : null}
        {rep.email ? (
          <View style={styles.metaRow}>
            <Icon name="mail-outline" size={14} color={colors.textMuted} />
            <Text numberOfLines={1} style={styles.meta}>{rep.email}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.footer}>
        <View style={styles.flex}>
          <Text style={styles.footerLabel}>LAST ACTIVE</Text>
          <View style={styles.metaRow}>
            <View style={[styles.presence, { backgroundColor: lastSeen ? colors.success : colors.textMuted }]} />
            <Text numberOfLines={1} style={styles.footerValue}>{lastSeen ? `${fromNow(lastSeen)} · ${formatDate(lastSeen)}` : 'Not signed in yet'}</Text>
          </View>
        </View>
        {canManage && !isSelf ? (
          <View style={styles.actions}>
            <IconButton filled size={19} icon="edit" label={`Edit ${rep.firstname}`} onPress={onEdit} />
            <IconButton filled size={19} icon="person-remove" color={colors.criticalSeverity} label={`Remove ${rep.firstname}`} onPress={onRemove} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const CARD_MIN_WIDTH = 300;
const GAP = 16;

function RepGrid({ title, subtitle, reps, renderCard }: { title: string; subtitle: string; reps: SchoolRep[]; renderCard: (rep: SchoolRep) => React.ReactNode }) {
  const styles = useStyles();
  const { width, onLayout } = useMeasuredWidth();
  const columns = Math.max(1, Math.floor((width + GAP) / (CARD_MIN_WIDTH + GAP)));
  const cardWidth = width > 0 ? (width - GAP * (columns - 1)) / columns : undefined;
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <Text style={styles.groupSubtitle}>{subtitle}</Text>
      <View onLayout={onLayout} style={styles.grid}>
        {cardWidth ? reps.map(rep => <View key={rep.uid} style={{ width: cardWidth }}>{renderCard(rep)}</View>) : null}
      </View>
    </View>
  );
}

/** Access Control for school admins: their own school's representatives only. */
export function SchoolReps() {
  const { admin } = useSession();
  const { push } = useNavigation();
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const [data, setData] = useState<SchoolRepsResult | null>(null);
  const [removing, setRemoving] = useState<SchoolRep | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getSchoolReps());
    } catch (reason) {
      toast('error', errorMessage(reason, 'Failed to load representatives.'), 'Fetch Error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await removeSchoolRep(removing.uid);
      toast('success', `${fullName(removing)} no longer has access.`, 'Removed');
      setRemoving(null);
      await load();
    } catch (reason) {
      toast('error', errorMessage(reason), 'Remove Failed');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Loading />;
  const levelA = data.reps.filter(rep => rep.level === 'a');
  const levelB = data.reps.filter(rep => rep.level === 'b');
  const bFull = data.seats.b.limit !== null && data.seats.b.used >= data.seats.b.limit;
  const card = (rep: SchoolRep) => (
    <RepCard
      rep={rep}
      isSelf={rep.uid === admin.uid}
      canManage={data.canManage}
      onEdit={() => push({ name: 'repForm', rep })}
      onRemove={() => setRemoving(rep)}
    />
  );

  return (
    <>
      <ScrollPage contentContainerStyle={styles.list}>
        <Card>
          <SectionHeader
            icon="workspace-premium"
            title={`${data.schoolName} · ${data.tierLabel} plan`}
            subtitle={data.domainWhitelist.length ? `Invites limited to ${data.domainWhitelist.map(d => `@${d}`).join(', ')}` : 'Representative seats on your plan'}
            right={
              <View style={styles.headerActions}>
                <IconButton filled size={19} icon="refresh" label="Refresh" onPress={() => void load()} />
                {data.canManage ? <IconButton filled size={19} icon="history" label="Audit log" onPress={() => push({ name: 'auditLog' })} /> : null}
                {data.canManage ? (
                  <Button
                    compact
                    icon="person-add-alt"
                    title="Add representative"
                    disabled={bFull && !data.canInviteA}
                    onPress={() => push({ name: 'repForm', canInviteA: data.canInviteA })}
                  />
                ) : null}
              </View>
            }
          />
          <View style={styles.seats}>
            <SeatMeter label="Institution reps (A level)" icon="account-balance" seats={data.seats.a} tone={colors.primary} />
            <SeatMeter label="Department reps (B level)" icon="apartment" seats={data.seats.b} tone={colors.info} />
          </View>
          {data.canManage && bFull ? (
            <Text style={styles.note}>All department seats on your plan are in use. Remove a representative or contact iCampus to upgrade.</Text>
          ) : null}
        </Card>

        <RepGrid title="Institution representatives" subtitle="Whole institution: all departments' analytics, representatives, ads and school-wide notifications." reps={levelA} renderCard={card} />
        {levelB.length > 0 ? (
          <RepGrid title="Department representatives" subtitle="One department: that department's analytics and announcements to its students and lecturers." reps={levelB} renderCard={card} />
        ) : (
          <EmptyState
            icon="apartment"
            title="No department representatives yet"
            subtitle={data.canManage ? 'Add heads of department so they can follow their own department.' : 'Your institution representative can add them.'}
            buttonText={data.canManage && !bFull ? 'Add representative' : undefined}
            buttonIcon="person-add-alt"
            onPress={() => push({ name: 'repForm', canInviteA: data.canInviteA })}
          />
        )}
      </ScrollPage>
      <ConfirmModal
        visible={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => void remove()}
        title="Remove representative?"
        subtitle={`${removing ? fullName(removing) : ''} will lose access to ${data.schoolName}'s dashboard straight away and their seat is freed.`}
        confirmText="Remove"
        loading={busy}
      />
    </>
  );
}

/** Add (A-level reps only) or edit a school representative. */
export function RepForm({ rep, canInviteA = false }: { rep?: SchoolRep; canInviteA?: boolean }) {
  const { pop } = useNavigation();
  const toast = useToast();
  const styles = useStyles();
  const editing = Boolean(rep);
  const [form, setForm] = useState({
    firstname: rep?.firstname ?? '',
    lastname: rep?.lastname ?? '',
    email: rep?.email ?? '',
    department: rep?.department ?? '',
    level: (rep?.level ?? 'b') as 'a' | 'b',
  });
  const [saving, setSaving] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  const valid =
    form.firstname.trim() &&
    form.lastname.trim() &&
    (editing || isValidEmail(form.email)) &&
    (form.level === 'a' || form.department.trim());

  const save = async () => {
    setSaving(true);
    try {
      if (rep) {
        await updateSchoolRep(rep.uid, {
          firstname: form.firstname.trim(),
          lastname: form.lastname.trim(),
          ...(rep.level === 'b' ? { department: form.department.trim() } : {}),
        });
        toast('success', 'Representative updated.', 'Saved');
      } else {
        const result = await inviteSchoolRep({
          firstname: form.firstname.trim(),
          lastname: form.lastname.trim(),
          email: form.email.trim(),
          level: form.level,
          department: form.level === 'b' ? form.department.trim() : undefined,
        });
        toast('success', result.message, 'Invited');
      }
      pop();
    } catch (reason) {
      toast('error', errorMessage(reason), editing ? 'Update Failed' : 'Invite Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <PageHeader title={editing ? 'Edit representative' : 'Add a representative'} subtitle={editing ? fullName(rep!) : 'They get an email with a one-time password'} />
      <ScrollPage contentContainerStyle={styles.form}>
        {!editing && canInviteA ? (
          <OptionPicker
            label="Access level"
            value={form.level}
            onChange={value => update('level', value)}
            options={[
              { value: 'b', label: 'Department rep (B level)' },
              { value: 'a', label: 'Institution rep (A level)' },
            ]}
            hint={form.level === 'a' ? 'Whole institution, including managing representatives.' : 'One department only.'}
          />
        ) : null}
        <Field label="First name" value={form.firstname} onChangeText={value => update('firstname', value)} />
        <Field label="Last name" value={form.lastname} onChangeText={value => update('lastname', value)} />
        <Field label="School email" keyboardType="email-address" locked={editing} value={form.email} onChangeText={value => update('email', value)} placeholder="name@school.edu.ng" />
        {form.level === 'b' ? (
          <Field label="Department" value={form.department} onChangeText={value => update('department', value)} placeholder="e.g. Computer Science" />
        ) : null}
        <Text style={styles.note}>
          {form.level === 'b'
            ? 'Department reps see only this department\'s analytics and can send announcements to its students and lecturers. Spell the department exactly as it appears on students\' profiles.'
            : 'Institution reps see the whole institution and can manage representatives.'}
        </Text>
        <Button title={editing ? 'Save changes' : 'Send invite'} icon={editing ? 'save' : 'send'} onPress={() => void save()} loading={saving} disabled={!valid} style={styles.submit} />
      </ScrollPage>
    </View>
  );
}

const AUDIT_LABELS: Record<string, { label: string; icon: IconName }> = {
  analytics_viewed: { label: 'Viewed the dashboard', icon: 'visibility' },
  section_viewed: { label: 'Opened a full list', icon: 'list-alt' },
  rep_invited: { label: 'Added a representative', icon: 'person-add-alt' },
  rep_updated: { label: 'Edited a representative', icon: 'edit' },
  rep_removed: { label: 'Removed a representative', icon: 'person-remove' },
  notification_sent: { label: 'Sent a notification', icon: 'send' },
};

/** Who viewed or changed what, for the school's data-protection officer (NDPR). */
export function SchoolAuditLog() {
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: Array<Record<string, any>>; page: number; totalPages: number; total: number } | null>(null);

  useEffect(() => {
    getSchoolAuditLog(page)
      .then(setResult)
      .catch(reason => {
        toast('error', errorMessage(reason), 'Fetch Error');
        setResult(previous => previous ?? { items: [], page: 1, totalPages: 1, total: 0 });
      });
  }, [page, toast]);

  return (
    <View style={styles.flex}>
      <PageHeader title="Audit log" subtitle={result ? `${result.total.toLocaleString()} recorded actions` : undefined} />
      <ScrollPage contentContainerStyle={styles.form}>
        {!result ? (
          <Loading />
        ) : result.items.length === 0 ? (
          <EmptyState icon="history" title="Nothing recorded yet" />
        ) : (
          result.items.map(entry => {
            const meta = AUDIT_LABELS[entry.action] ?? { label: formatLabel(String(entry.action)), icon: 'info-outline' as IconName };
            const details = entry.details ?? {};
            const extra = [
              details.section && `list: ${details.section}`,
              details.department && `department: ${details.department}`,
              details.recipients && `${details.recipients} recipients`,
              details.name,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <View key={entry.id} style={styles.auditRow}>
                <View style={[styles.auditIcon, { backgroundColor: colors.primary + '14' }]}>
                  <Icon name={meta.icon} size={17} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.auditTitle}>
                    {entry.actorName} · {meta.label}
                  </Text>
                  {extra ? <Text style={styles.meta}>{extra}</Text> : null}
                  <Text style={styles.meta}>
                    {formatDate(entry.createdAt, true)}
                    {entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
                  </Text>
                </View>
              </View>
            );
          })
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

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    list: { paddingBottom: 120 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
    seats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    seat: { flexGrow: 1, flexBasis: 240, padding: 14, borderRadius: 14, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderSubtle, gap: 10 },
    seatHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    seatLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: c.textDarker },
    seatCount: { fontSize: 14, fontWeight: '900', color: c.textDarker },
    seatTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    seatFill: { height: '100%', borderRadius: 4 },
    note: { fontSize: 12.5, color: c.textMuted, marginTop: 10, lineHeight: 18 },
    group: { marginBottom: 20 },
    groupTitle: { fontSize: 17, fontWeight: '800', color: c.textDarker },
    groupSubtitle: { fontSize: 12.5, color: c.textMuted, marginTop: 3, marginBottom: 14 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    card: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.backgroundSecondary },
    cover: { height: 80, overflow: 'hidden' },
    coverIcon: { position: 'absolute', right: 14, top: -4, transform: [{ rotate: '-12deg' }] },
    coverBadges: { position: 'absolute', top: 12, left: 14, flexDirection: 'row', gap: 6 },
    body: { paddingHorizontal: 20, marginTop: -34, paddingBottom: 16 },
    avatarRing: { alignSelf: 'flex-start', padding: 4, borderRadius: 40, marginBottom: 10 },
    name: { fontSize: 17, fontWeight: '800', color: c.textDarker },
    role: { fontSize: 12.5, fontWeight: '700', marginTop: 2, marginBottom: 8 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, minWidth: 0 },
    meta: { flexShrink: 1, fontSize: 12.5, color: c.textMuted },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.borderSubtle, backgroundColor: c.surfaceRaised },
    footerLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted },
    footerValue: { flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: c.text },
    presence: { width: 8, height: 8, borderRadius: 4 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    form: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 40 },
    submit: { marginTop: 20 },
    auditRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    auditIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    auditTitle: { fontSize: 13.5, fontWeight: '700', color: c.textDarker },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 },
  }),
);
