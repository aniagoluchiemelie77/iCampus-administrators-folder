import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { deleteUserAccount, getUserProfile, ProfileSection, UserProfile } from '../api';
import { errorMessage, isSchoolAdmin, useNavigation, useSession, useToast } from '../context';
import { fmtPct, Tiles } from '../dashboard';
import { Icon, IconName } from '../icons';
import { makeStyles, useColors } from '../theme';
import {
  Button,
  Card,
  EmptyState,
  Field,
  formatCount,
  formatDate,
  formatLabel,
  formatMoney,
  fromNow,
  Loading,
  PageHeader,
  Pill,
  ScrollPage,
  SectionHeader,
  Sheet,
  TabStrip,
  UserAvatar,
  UserIdentity,
} from '../ui';
import { TimelineRow } from './CourseDetail';
import { EditUserSheet } from './EditUser';

const SECTION_META: Record<ProfileSection, { label: string; icon: IconName }> = {
  academics: { label: 'Classes & courses', icon: 'school' },
  posts: { label: 'Posts', icon: 'dynamic-feed' },
  store: { label: 'Store', icon: 'storefront' },
  transactions: { label: 'Transactions', icon: 'receipt-long' },
  tickets: { label: 'Support', icon: 'support-agent' },
  security: { label: 'Security', icon: 'security' },
  notifications: { label: 'Notifications', icon: 'notifications' },
};

/** Profile fields worth showing, in order. Only the ones the server sent (and the user has) appear. */
const DETAIL_FIELDS: Array<[string, string]> = [
  ['uid', 'User ID'],
  ['email', 'Email'],
  ['usertype', 'Account type'],
  ['tier', 'Tier'],
  ['matricNumber', 'Matric number'],
  ['staffId', 'Staff ID'],
  ['department', 'Department'],
  ['current_level', 'Level'],
  ['schoolName', 'School'],
  ['schoolCode', 'School code'],
  ['organizationName', 'Organization'],
  ['itagusername', 'iTag'],
  ['country', 'Country'],
  ['website', 'Website'],
  ['headline', 'Headline'],
  ['createdAt', 'Joined'],
  ['lastActiveAt', 'Last active'],
  ['updatedAt', 'Last updated'],
];
const DATE_FIELDS = new Set(['createdAt', 'lastActiveAt', 'updatedAt']);

function ListRow({ icon, tone, title, meta, right }: { icon: IconName; tone: string; title: string; meta?: string; right?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: tone + '1A' }]}>
        <Icon name={icon} size={18} color={tone} />
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={2} style={styles.title}>{title}</Text>
        {meta ? <Text numberOfLines={2} style={styles.meta}>{meta}</Text> : null}
      </View>
      {right ? <View style={styles.trailing}>{right}</View> : null}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const styles = useStyles();
  return <Text style={[styles.meta, styles.empty]}>{text}</Text>;
}

/** One activity feed. Feeds load independently, so one failing doesn't hide the rest. */
function SectionBody({ section, profile, schoolAdmin }: { section: ProfileSection; profile: UserProfile; schoolAdmin: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const { push } = useNavigation();
  const feed = profile.activity[section];
  if (!feed) return <Empty text="Nothing to show for this account." />;
  if (feed.error) return <Empty text={`Couldn't load this: ${feed.error}`} />;

  switch (section) {
    case 'academics': {
      const data = profile.activity.academics!.data!;
      const s = data.summary;
      const lecturer = data.role === 'lecturer';
      return (
        <>
          <Tiles
            items={
              lecturer
                ? [
                    { label: 'Courses', value: formatCount(s.courses), icon: 'menu-book' },
                    { label: 'Lectures held', value: formatCount(s.lecturesHeld), icon: 'co-present', tone: colors.success },
                    { label: 'Upcoming', value: formatCount(s.lecturesScheduled), icon: 'event', tone: colors.info },
                    { label: 'Cancelled', value: formatCount(s.lecturesCancelled), icon: 'event-busy', tone: colors.criticalSeverity },
                  ]
                : [
                    { label: 'Courses', value: formatCount(s.courses), icon: 'menu-book' },
                    { label: 'Attendance', value: fmtPct(s.attendancePct), icon: 'how-to-reg', tone: colors.success },
                    { label: 'Tests taken', value: formatCount(s.testsTaken), icon: 'quiz', tone: colors.series2 },
                    { label: 'Average score', value: fmtPct(s.averageScorePct), icon: 'grade', tone: colors.series3 },
                  ]
            }
          />
          <Text style={styles.subheading}>{lecturer ? 'Courses taught' : 'Courses enrolled'}</Text>
          {data.courses.length === 0 ? <Empty text="No courses." /> : null}
          {data.courses.map(c => {
            // The course screen is a school endpoint; staff see the row only.
            const open = schoolAdmin ? () => push({ name: 'courseDetail', courseId: c.courseId }) : undefined;
            return (
              <Pressable key={c.courseId} disabled={!open} onPress={open} style={({ hovered }: any) => [hovered && open ? styles.hover : null]}>
                <ListRow
                  icon="menu-book"
                  tone={colors.primary}
                  title={`${c.courseCode} ${c.courseTitle}`.trim()}
                  meta={[c.department, c.level ? `${String(c.level).replace(/\D/g, '') || c.level}L` : null, c.semester ? `${c.semester} sem` : null, c.session].filter(Boolean).join(' · ')}
                  right={
                    <>
                      {lecturer ? (
                        <Text style={styles.meta}>
                          {c.hostedByUser ?? 0} of {c.lecturesHeld} lectures
                        </Text>
                      ) : (
                        <Text style={styles.meta}>
                          {c.lecturesAttended ?? 0}/{c.lecturesHeld} attended · {fmtPct(c.attendancePct ?? null)}
                        </Text>
                      )}
                      {!lecturer && c.averageScorePct != null ? <Text style={styles.meta}>avg score {fmtPct(c.averageScorePct)}</Text> : null}
                    </>
                  }
                />
              </Pressable>
            );
          })}
          <Text style={styles.subheading}>Class activity</Text>
          {data.timeline.length === 0 ? <Empty text="No class activity yet." /> : null}
          {data.timeline.map((e, index) => (
            <TimelineRow key={index} kind={e.kind} title={e.course ? `${e.course} · ${e.title}` : e.title} detail={e.detail} at={e.at} />
          ))}
        </>
      );
    }
    case 'posts': {
      const data = profile.activity.posts!.data!;
      return (
        <>
          <Text style={styles.meta}>{data.total != null ? `${formatCount(data.total)} posts in total · latest ${data.items.length}` : `Latest ${data.items.length}`}</Text>
          {data.items.length === 0 ? <Empty text="No posts." /> : null}
          {data.items.map(p => (
            <ListRow
              key={p.postId}
              icon="article"
              tone={colors.series1}
              title={p.content || (p.media ? 'Media post' : 'Post')}
              meta={`${fromNow(p.createdAt)} · ${p.likes} likes · ${p.comments} comments · ${formatCount(p.impressions)} views`}
              right={p.status === 'hidden' ? <Pill label="HIDDEN" color={colors.pendingDelivery} /> : null}
            />
          ))}
        </>
      );
    }
    case 'store': {
      const data = profile.activity.store!.data!;
      return (
        <>
          <Text style={styles.subheading}>Orders</Text>
          {data.orders.length === 0 ? <Empty text="No orders." /> : null}
          {data.orders.map(o => (
            <ListRow
              key={`${o.side}-${o.orderId}`}
              icon={o.side === 'seller' ? 'sell' : 'shopping-bag'}
              tone={o.side === 'seller' ? colors.success : colors.series1}
              title={`${o.productName}${o.quantity > 1 ? ` ×${o.quantity}` : ''}`}
              meta={`${o.side === 'seller' ? 'Sold' : 'Bought'} · ${formatDate(o.createdAt, true)} · ${o.orderId}`}
              right={
                <>
                  <Text style={styles.title}>{formatMoney(o.amount, o.currency)}</Text>
                  <Text style={styles.meta}>{formatLabel(String(o.status ?? ''))}</Text>
                </>
              }
            />
          ))}
          <Text style={styles.subheading}>Products listed</Text>
          {data.products.length === 0 ? <Empty text="No products." /> : null}
          {data.products.map(p => (
            <ListRow
              key={p.productId}
              icon="inventory-2"
              tone={colors.series3}
              title={p.title}
              meta={`${p.inStock} in stock · ${p.sales} sold`}
              right={<Text style={styles.title}>{formatMoney(p.price, p.currency)}</Text>}
            />
          ))}
        </>
      );
    }
    case 'transactions': {
      const list = profile.activity.transactions!.data!;
      return (
        <>
          {list.length === 0 ? <Empty text="No transactions." /> : null}
          {list.map(t => (
            <ListRow
              key={t.transactionId}
              icon="receipt-long"
              tone={t.status === 'success' ? colors.success : colors.textMuted}
              title={t.title || formatLabel(String(t.type ?? 'transaction'))}
              meta={`${formatDate(t.createdAt, true)}${t.reference ? ` · ${t.reference}` : ''}`}
              right={
                <>
                  <Text style={styles.title}>{formatMoney(t.amount, t.currency)}</Text>
                  <Text style={styles.meta}>{formatLabel(String(t.status ?? ''))}</Text>
                </>
              }
            />
          ))}
        </>
      );
    }
    case 'tickets': {
      const list = profile.activity.tickets!.data!;
      return (
        <>
          {list.length === 0 ? <Empty text="No support tickets." /> : null}
          {list.map(t => (
            <ListRow
              key={t.ticketRefId}
              icon="support-agent"
              tone={colors.info}
              title={t.subject}
              meta={`${t.ticketRefId} · opened ${fromNow(t.createdAt)}`}
              right={<Pill label={String(t.status ?? 'open').toUpperCase()} color={t.status === 'resolved' || t.status === 'closed' ? colors.success : colors.pendingDelivery} />}
            />
          ))}
        </>
      );
    }
    case 'security': {
      const data = profile.activity.security!.data!;
      return (
        <>
          <ListRow
            icon={data.twoFactorEnabled ? 'verified-user' : 'gpp-maybe'}
            tone={data.twoFactorEnabled ? colors.success : colors.pendingDelivery}
            title={`Two-factor authentication ${data.twoFactorEnabled ? 'on' : 'off'}`}
          />
          <Text style={styles.subheading}>Signed-in devices</Text>
          {data.sessions.length === 0 ? <Empty text="No active sessions." /> : null}
          {data.sessions.map((s, index) => (
            <ListRow
              key={index}
              icon="devices"
              tone={colors.series1}
              title={s.deviceName}
              meta={[s.location, s.ipAddress].filter(Boolean).join(' · ') || undefined}
              right={s.lastUsed ? <Text style={styles.meta}>{fromNow(s.lastUsed)}</Text> : null}
            />
          ))}
          <Text style={styles.subheading}>Suspicious activity</Text>
          {data.suspiciousActivity.length === 0 ? <Empty text="None recorded." /> : null}
          {data.suspiciousActivity.map((a, index) => (
            <ListRow key={index} icon="warning" tone={colors.criticalSeverity} title={formatLabel(a.type)} meta={a.detail || undefined} right={<Text style={styles.meta}>{formatDate(a.at, true)}</Text>} />
          ))}
          <Text style={styles.subheading}>Recovery emails & phone numbers</Text>
          {data.recoveryEmails.length + data.phoneNumbers.length === 0 ? <Empty text="None set." /> : null}
          {data.recoveryEmails.map((e, index) => (
            <ListRow key={`e${index}`} icon="alternate-email" tone={colors.info} title={e.email} right={<Pill label={e.isVerified ? 'VERIFIED' : 'PENDING'} color={e.isVerified ? colors.success : colors.textMuted} />} />
          ))}
          {data.phoneNumbers.map((p, index) => (
            <ListRow key={`p${index}`} icon="phone" tone={colors.info} title={p.number} right={<Pill label={p.isVerified ? 'VERIFIED' : 'PENDING'} color={p.isVerified ? colors.success : colors.textMuted} />} />
          ))}
        </>
      );
    }
    case 'notifications': {
      const list = profile.activity.notifications!.data!;
      return (
        <>
          {list.length === 0 ? <Empty text="No notifications." /> : null}
          {list.map(n => (
            <ListRow
              key={n.id}
              icon={n.isRead ? 'drafts' : 'mark-email-unread'}
              tone={n.isRead ? colors.textMuted : colors.primary}
              title={n.title || formatLabel(String(n.category ?? 'notification'))}
              meta={n.message}
              right={<Text style={styles.meta}>{fromNow(n.createdAt)}</Text>}
            />
          ))}
        </>
      );
    }
  }
}

function DeleteAccountSheet({
  user,
  visible,
  onClose,
  onDeleted,
}: {
  user: Record<string, any>;
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const handle = user.username || user.uid;
  const ready = reason.trim().length >= 5 && confirm.trim().toLowerCase() === String(handle).toLowerCase();

  const submit = async () => {
    setBusy(true);
    try {
      await deleteUserAccount(user.uid, { reason: reason.trim(), confirm: confirm.trim() });
      toast('success', 'The account and its content were deleted.', 'Account deleted');
      onDeleted();
    } catch (reason) {
      toast('error', errorMessage(reason), 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={() => !busy && onClose()} variant="dialog" maxWidth={480}>
      <View style={styles.deleteHead}>
        <Icon name="delete-forever" size={52} color={colors.criticalSeverity} />
        <Text style={styles.deleteTitle}>Delete this account?</Text>
        <Text style={styles.deleteBody}>
          This permanently removes {user.firstname || 'this user'}'s account, posts, comments, follows, saved cards and course memberships. It can't be undone.
        </Text>
      </View>
      <Field label="Reason (kept in the deletion record)" value={reason} onChangeText={setReason} multiline placeholder="e.g. Duplicate account requested by the school" />
      <Field label={`Type ${handle} to confirm`} value={confirm} onChangeText={setConfirm} placeholder={String(handle)} />
      <View style={styles.deleteRow}>
        <Button title="Cancel" variant="outline" onPress={onClose} disabled={busy} style={styles.flex} />
        <Button title="Delete account" icon="delete-forever" onPress={() => void submit()} loading={busy} disabled={!ready} style={styles.flex} />
      </View>
    </Sheet>
  );
}

/**
 * One user, as the signed-in admin is allowed to see them. The server decides
 * which fields and activity feeds come back, and whether edit/delete is allowed.
 */
export function UserProfileScreen({ uid }: { uid: string }) {
  const { admin } = useSession();
  const { pop } = useNavigation();
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const schoolAdmin = isSchoolAdmin(admin.adminType);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [section, setSection] = useState<ProfileSection | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setProfile(await getUserProfile(uid));
    } catch (reason) {
      setFailed(true);
      toast('error', errorMessage(reason), 'Fetch Error');
    }
  }, [toast, uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = useMemo(() => (profile ? (Object.keys(profile.activity) as ProfileSection[]) : []), [profile]);
  const active = section && sections.includes(section) ? section : sections[0];

  if (!profile) {
    return (
      <View style={styles.flex}>
        <PageHeader title="User profile" />
        {failed ? (
          <EmptyState icon="person-off" title="Couldn't load this user" subtitle="They may not exist, or be outside what you can see." buttonText="Try again" onPress={() => void load()} />
        ) : (
          <Loading label="Loading profile..." />
        )}
      </View>
    );
  }

  const { user, access } = profile;
  const details = DETAIL_FIELDS.filter(([key]) => user[key] !== undefined && user[key] !== null && user[key] !== '');
  const readOnly = !access.canEdit;

  return (
    <View style={styles.flex}>
      <PageHeader
        title={[user.firstname, user.lastname].filter(Boolean).join(' ') || user.username || 'User profile'}
        subtitle={user.username ? `@${user.username}` : user.uid}
        right={
          access.canEdit || access.canDelete ? (
            <View style={styles.actions}>
              {access.canEdit ? <Button compact variant="outline" icon="edit" title="Edit" onPress={() => setEditing(true)} /> : null}
              {access.canDelete ? <Button compact variant="soft" icon="delete-outline" title="Delete" onPress={() => setDeleting(true)} /> : null}
            </View>
          ) : undefined
        }
      />
      <ScrollPage contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.hero}>
            <UserAvatar profilePic={user.profilePic} firstName={user.firstname} lastName={user.lastname} username={user.username} size={72} />
            <View style={styles.flex}>
              <UserIdentity firstname={user.firstname} lastname={user.lastname} username={user.username} tier={user.tier} isVerified={user.isVerified} showVerifyIcon />
              <View style={styles.pills}>
                {user.usertype ? <Pill label={String(user.usertype).toUpperCase()} color={colors.primary} /> : null}
                {user.isVerified ? <Pill label="VERIFIED" icon="verified" color={colors.success} /> : <Pill label="NOT VERIFIED" color={colors.textMuted} />}
                {user.isSuspended ? <Pill label="SUSPENDED" icon="block" color={colors.criticalSeverity} /> : null}
              </View>
            </View>
          </View>
          {readOnly ? (
            <View style={styles.notice}>
              <Icon name="lock-outline" size={15} color={colors.textMuted} />
              <Text style={styles.meta}>
                View only.{' '}
                {schoolAdmin
                  ? 'Changes to accounts are made by iCampus support; contact details are not shown to school representatives.'
                  : 'Only support and super admins can change or delete accounts.'}
              </Text>
            </View>
          ) : null}
        </Card>

        <Card>
          <SectionHeader icon="badge" title="Details" />
          <View style={styles.facts}>
            {details.map(([key, label]) => (
              <View key={key} style={styles.fact}>
                <Text style={styles.metaSmall}>{label.toUpperCase()}</Text>
                <Text selectable style={styles.title}>
                  {DATE_FIELDS.has(key) ? `${formatDate(user[key])} (${fromNow(user[key])})` : key === 'current_level' ? `${String(user[key]).replace(/\D/g, '') || user[key]} level` : String(user[key])}
                </Text>
              </View>
            ))}
          </View>
          {user.bio ? <Text style={styles.body}>{user.bio}</Text> : null}
        </Card>

        {sections.length ? (
          <Card>
            <SectionHeader icon="history" title="Activity" subtitle={schoolAdmin ? 'Classes and courses in your scope' : 'What this account has been doing'} />
            {sections.length > 1 ? (
              <TabStrip tabs={sections.map(id => ({ id, label: SECTION_META[id].label, icon: SECTION_META[id].icon }))} active={active!} onChange={setSection} />
            ) : null}
            {active ? <SectionBody section={active} profile={profile} schoolAdmin={schoolAdmin} /> : null}
          </Card>
        ) : null}
      </ScrollPage>

      {access.canEdit ? (
        <EditUserSheet
          user={editing ? user : null}
          onClose={() => setEditing(false)}
          onUpdated={() => {
            setEditing(false);
            void load();
          }}
        />
      ) : null}
      {access.canDelete ? (
        <DeleteAccountSheet
          user={user}
          visible={deleting}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            pop();
          }}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    content: { width: '100%', maxWidth: 1000, alignSelf: 'center', paddingBottom: 60 },
    actions: { flexDirection: 'row', gap: 8 },
    hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.borderSubtle },
    facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    fact: { flexGrow: 1, flexBasis: 200, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.borderSubtle, gap: 4 },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    hover: { backgroundColor: c.primary + '08' },
    icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    trailing: { alignItems: 'flex-end', gap: 4 },
    title: { fontSize: 14, fontWeight: '700', color: c.textDarker },
    body: { fontSize: 13.5, lineHeight: 20, color: c.text, marginTop: 12 },
    meta: { fontSize: 12, color: c.textMuted, marginTop: 2, flexShrink: 1 },
    metaSmall: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, color: c.textMuted },
    empty: { paddingVertical: 10 },
    subheading: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: c.textMuted, marginTop: 18, marginBottom: 4 },
    deleteHead: { alignItems: 'center', gap: 8, marginBottom: 16 },
    deleteTitle: { fontSize: 19, fontWeight: '900', color: c.textDarker },
    deleteBody: { fontSize: 13.5, lineHeight: 20, color: c.text, textAlign: 'center' },
    deleteRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  }),
);
