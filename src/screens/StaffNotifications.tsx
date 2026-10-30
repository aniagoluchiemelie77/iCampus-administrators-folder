import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Attachment, getAdminInbox, getBroadcasts, notifyUsers, searchUsers, UserAudience } from '../api';
import { AttachmentPicker, Cell, Grid } from '../dashboard';
import { errorMessage, useSession, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { NotificationItem } from '../NotificationItem';
import { makeStyles, useColors } from '../theme';
import {
  Button,
  Card,
  ConfirmModal,
  Field,
  formatCount,
  fromNow,
  Loading,
  OptionPicker,
  Pill,
  ScrollPage,
  SectionHeader,
  TabStrip,
  UserAvatar,
} from '../ui';

/**
 * Notifications for iCampus staff. Support and super admins message app users
 * directly (specific people or a whole school; super admins also a user type
 * or everyone). Every admin reads their own inbox here, including direct
 * messages from super admins.
 */

type Data = Record<string, any>;

const AUDIENCES: Array<{ value: UserAudience; label: string; icon: IconName; superOnly?: boolean }> = [
  { value: 'users', label: 'Specific users', icon: 'person-search' },
  { value: 'school', label: 'A school', icon: 'school' },
  { value: 'usertype', label: 'A user type', icon: 'groups', superOnly: true },
  { value: 'all', label: 'Everyone', icon: 'public', superOnly: true },
];

function Composer({ onSent }: { onSent: () => void }) {
  const { admin } = useSession();
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const superAdmin = admin.adminType === 'super_admin';
  const [target, setTarget] = useState<UserAudience>('users');
  const [picked, setPicked] = useState<Data[]>([]);
  const [lookup, setLookup] = useState('');
  const [matches, setMatches] = useState<Data[]>([]);
  const [schoolCode, setSchoolCode] = useState('');
  const [usertype, setUsertype] = useState<'student' | 'lecturer' | 'enterprise' | 'regular'>('student');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  // Debounced user search for the "specific users" audience.
  useEffect(() => {
    const term = lookup.trim();
    if (target !== 'users' || term.length < 2) return setMatches([]);
    const timer = setTimeout(() => {
      searchUsers(term, 'premium')
        .then(list => setMatches(list.slice(0, 6)))
        .catch(() => setMatches([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [lookup, target]);

  const audienceReady = target === 'users' ? picked.length > 0 : target === 'school' ? schoolCode.trim().length > 0 : true;
  const valid = audienceReady && title.trim().length >= 3 && (message.trim().length >= 3 || attachments.length > 0);
  const audienceLabel =
    target === 'users'
      ? `${picked.length} selected user${picked.length === 1 ? '' : 's'}`
      : target === 'school'
        ? `everyone at ${schoolCode.trim()}`
        : target === 'usertype'
          ? `all ${usertype}s`
          : 'every iCampus user';

  const send = async () => {
    setSending(true);
    try {
      const result = await notifyUsers({
        target,
        title: title.trim(),
        message: message.trim(),
        attachments,
        ...(target === 'users' ? { uids: picked.map(u => String(u.uid)) } : {}),
        ...(target === 'school' ? { schoolCode: schoolCode.trim() } : {}),
        ...(target === 'usertype' ? { usertype } : {}),
      });
      toast('success', result.message, 'Sending');
      setConfirming(false);
      setTitle('');
      setMessage('');
      setAttachments([]);
      setPicked([]);
      onSent();
    } catch (reason) {
      toast('error', errorMessage(reason), 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <SectionHeader icon="edit-notifications" title="Message app users" subtitle="In-app and push, from iCampus Support" />
      <Text style={styles.label}>Who receives it</Text>
      <View style={styles.audiences}>
        {AUDIENCES.filter(a => superAdmin || !a.superOnly).map(a => {
          const active = a.value === target;
          return (
            <Pressable
              key={a.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setTarget(a.value)}
              style={[styles.audience, { borderColor: active ? colors.primary : colors.borderSubtle, backgroundColor: active ? colors.primary + '12' : colors.surfaceRaised }]}
            >
              <Icon name={a.icon} size={18} color={active ? colors.primary : colors.text} />
              <Text style={[styles.audienceLabel, active && { color: colors.primary }]}>{a.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {target === 'users' ? (
        <>
          <Field icon="search" label="Find users" placeholder="Name, username or email" value={lookup} onChangeText={setLookup} />
          {matches.map(user => {
            const chosen = picked.some(p => p.uid === user.uid);
            return (
              <Pressable
                key={user.uid}
                onPress={() => setPicked(current => (chosen ? current.filter(p => p.uid !== user.uid) : [...current, user].slice(0, 50)))}
                style={[styles.match, chosen && { backgroundColor: colors.primary + '10' }]}
              >
                <UserAvatar profilePic={user.profilePic} firstName={user.firstname} lastName={user.lastname} username={user.username} size={32} />
                <Text numberOfLines={1} style={[styles.rowTitle, styles.flex]}>
                  {[user.firstname, user.lastname].filter(Boolean).join(' ') || user.organizationName || user.username}
                  {user.username ? <Text style={styles.meta}>  @{user.username}</Text> : null}
                </Text>
                <Icon name={chosen ? 'check-circle' : 'add-circle-outline'} size={20} color={chosen ? colors.primary : colors.textMuted} />
              </Pressable>
            );
          })}
          {picked.length ? (
            <View style={styles.chips}>
              {picked.map(user => (
                <Pressable key={user.uid} onPress={() => setPicked(current => current.filter(p => p.uid !== user.uid))} style={[styles.chip, { backgroundColor: colors.primary + '14' }]}>
                  <Text style={[styles.chipText, { color: colors.primary }]}>{user.username ? `@${user.username}` : user.firstname}</Text>
                  <Icon name="close" size={14} color={colors.primary} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : target === 'school' ? (
        <Field label="School code" value={schoolCode} onChangeText={setSchoolCode} placeholder="The institution's ID from the Institutions tab" />
      ) : target === 'usertype' ? (
        <OptionPicker
          label="User type"
          value={usertype}
          options={[
            { value: 'student', label: 'Students' },
            { value: 'lecturer', label: 'Lecturers' },
            { value: 'enterprise', label: 'Organisations' },
            { value: 'regular', label: 'Other users' },
          ]}
          onChange={setUsertype}
        />
      ) : (
        <View style={[styles.warning, { borderLeftColor: colors.pendingDelivery, backgroundColor: colors.pendingDelivery + '12' }]}>
          <Icon name="warning-amber" size={18} color={colors.pendingDelivery} />
          <Text style={[styles.meta, styles.flex]}>This reaches every active iCampus account. Use it for outages and important policy changes.</Text>
        </View>
      )}

      <Field label={`Title (${title.length}/80)`} value={title} onChangeText={value => setTitle(value.slice(0, 80))} placeholder="e.g. Scheduled maintenance tonight" />
      <Field label={`Message (${message.length}/1000)`} multiline value={message} onChangeText={value => setMessage(value.slice(0, 1000))} placeholder="What do they need to know?" />
      <AttachmentPicker value={attachments} onChange={setAttachments} />
      <Button title="Review and send" icon="send" disabled={!valid} onPress={() => setConfirming(true)} />
      <ConfirmModal
        visible={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void send()}
        title="Send this notification?"
        subtitle={`"${title.trim()}" goes to ${audienceLabel}. It can't be unsent.`}
        confirmText="Send"
        loading={sending}
      />
    </Card>
  );
}

function SentList({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    getBroadcasts(page)
      .then(setData)
      .catch(reason => toast('error', errorMessage(reason), 'Fetch Error'));
  }, [page, refreshKey, toast]);
  if (!data) return <Loading />;
  return (
    <Card>
      {data.items.length === 0 ? <Text style={styles.meta}>Nothing sent yet.</Text> : null}
      {data.items.map((item: Data) => (
        <View key={item.id} style={styles.sentRow}>
          <View style={styles.flex}>
            <View style={styles.sentHead}>
              <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
              <Pill label={item.status === 'sent' ? 'SENT' : 'SENDING'} color={item.status === 'sent' ? colors.success : colors.pendingDelivery} />
            </View>
            <Text numberOfLines={3} style={styles.body}>{item.message}</Text>
            {item.attachments?.length ? (
              <View style={styles.thumbs}>
                {item.attachments.map((a: Attachment) => (
                  <Image key={a.url} source={{ uri: a.url }} style={styles.thumb} />
                ))}
              </View>
            ) : null}
            <Text style={styles.meta}>
              {item.senderName} · {item.targetLabel} · {fromNow(item.createdAt)}
            </Text>
          </View>
          <View style={styles.reach}>
            <Text style={styles.rowTitle}>{formatCount(item.recipientCount)}</Text>
            <Text style={styles.meta}>recipients</Text>
          </View>
        </View>
      ))}
      {data.totalPages > 1 ? (
        <View style={styles.pager}>
          <Button compact variant="outline" icon="chevron-left" title="Newer" disabled={page <= 1} onPress={() => setPage(page - 1)} />
          <Text style={styles.meta}>
            Page {data.page} of {data.totalPages}
          </Text>
          <Button compact variant="outline" icon="chevron-right" title="Older" disabled={page >= data.totalPages} onPress={() => setPage(page + 1)} />
        </View>
      ) : null}
    </Card>
  );
}

function Inbox() {
  const toast = useToast();
  const styles = useStyles();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(() => {
    getAdminInbox(page)
      .then(setData)
      .catch(reason => toast('error', errorMessage(reason), 'Fetch Error'));
  }, [page, toast]);
  useEffect(load, [load]);
  if (!data) return <Loading />;
  return (
    <Card>
      {data.items.length === 0 ? <Text style={styles.meta}>No notifications for you yet.</Text> : null}
      {data.items.map((item: Data) => (
        <View key={item.id}>
          <NotificationItem item={item} />
          {item.payload?.attachments?.length ? (
            <View style={[styles.thumbs, styles.inboxThumbs]}>
              {item.payload.attachments.map((a: Attachment) => (
                <Pressable key={a.url} onPress={() => typeof window !== 'undefined' && window.open(a.url, '_blank', 'noopener')}>
                  <Image source={{ uri: a.url }} style={styles.inboxImage} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {data.totalPages > 1 ? (
        <View style={styles.pager}>
          <Button compact variant="outline" icon="chevron-left" title="Newer" disabled={page <= 1} onPress={() => setPage(page - 1)} />
          <Text style={styles.meta}>
            Page {data.page} of {data.totalPages}
          </Text>
          <Button compact variant="outline" icon="chevron-right" title="Older" disabled={page >= data.totalPages} onPress={() => setPage(page + 1)} />
        </View>
      ) : null}
    </Card>
  );
}

export function StaffNotifications() {
  const { admin } = useSession();
  const styles = useStyles();
  const canSend = admin.adminType === 'super_admin' || admin.adminType === 'support';
  const [view, setView] = useState<'sent' | 'inbox'>(canSend ? 'sent' : 'inbox');
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <ScrollPage contentContainerStyle={styles.page}>
      {canSend ? (
        <Grid>
          <Cell wide>
            <Composer onSent={() => setRefreshKey(k => k + 1)} />
          </Cell>
        </Grid>
      ) : null}
      {canSend ? (
        <TabStrip
          tabs={[
            { id: 'sent', label: 'Sent to users', icon: 'outbox' },
            { id: 'inbox', label: 'Your inbox', icon: 'inbox' },
          ]}
          active={view}
          onChange={setView}
        />
      ) : null}
      {view === 'sent' && canSend ? <SentList refreshKey={refreshKey} /> : <Inbox />}
    </ScrollPage>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    page: { paddingBottom: 120 },
    flex: { flex: 1, minWidth: 0 },
    label: { color: c.textDarker, fontSize: 13, fontWeight: '700', marginBottom: 8 },
    meta: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
    body: { fontSize: 13, color: c.text, lineHeight: 19, marginVertical: 4 },
    rowTitle: { flexShrink: 1, fontSize: 13.5, fontWeight: '700', color: c.textDarker },
    audiences: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    audience: { flexGrow: 1, flexBasis: 140, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1 },
    audienceLabel: { fontSize: 13, fontWeight: '700', color: c.textDarker },
    match: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 10 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
    chipText: { fontSize: 12, fontWeight: '700' },
    warning: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10, borderLeftWidth: 4, marginBottom: 16 },
    sentRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    sentHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    reach: { alignItems: 'flex-end' },
    thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: c.surfaceRaised },
    inboxThumbs: { paddingLeft: 52, marginTop: -4, marginBottom: 10 },
    inboxImage: { width: 120, height: 120, borderRadius: 10, backgroundColor: c.surfaceRaised },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 },
  }),
);
