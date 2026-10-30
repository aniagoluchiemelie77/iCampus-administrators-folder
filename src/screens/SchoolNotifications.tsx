import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Attachment, getSchoolNotifications, SchoolAudience, sendSchoolNotification } from '../api';
import { AttachmentPicker } from '../dashboard';
import { errorMessage, isSchoolAdminA, useSession, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { NotificationItem } from '../NotificationItem';
import { makeStyles, useColors } from '../theme';
import { Button, Card, ConfirmModal, Field, FilterChips, fromNow, Loading, Pill, ScrollPage, SectionHeader, TabStrip } from '../ui';

const AUDIENCE_META: Record<SchoolAudience, { label: string; icon: IconName; hint: string }> = {
  students: { label: 'Students', icon: 'school', hint: 'In-app and push' },
  lecturers: { label: 'Lecturers', icon: 'co-present', hint: 'In-app and push' },
  reps: { label: 'Department reps', icon: 'apartment', hint: 'B-level admins' },
};
const TITLE_MAX = 80;
const MESSAGE_MAX = 1000;

type Loaded = Awaited<ReturnType<typeof getSchoolNotifications>>;

function AudienceToggle({ audience, selected, onPress }: { audience: SchoolAudience; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const meta = AUDIENCE_META[audience];
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ hovered }: any) => [
        styles.audience,
        { borderColor: selected ? colors.primary : colors.borderSubtle, backgroundColor: selected ? colors.primary + '12' : hovered ? colors.primary + '08' : colors.surfaceRaised },
      ]}
    >
      <Icon name={selected ? 'check-box' : 'check-box-outline-blank'} size={20} color={selected ? colors.primary : colors.textMuted} />
      <Icon name={meta.icon} size={18} color={selected ? colors.primary : colors.text} />
      <View>
        <Text style={[styles.audienceLabel, selected && { color: colors.primary }]}>{meta.label}</Text>
        <Text style={styles.meta}>{meta.hint}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Institution reps notify students, lecturers and department reps across the
 * school or in one department; department reps notify their own department's
 * students and lecturers. Recipients see it in the iCampus app's notifications.
 */
export function SchoolNotifications() {
  const { admin } = useSession();
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const institutionRep = isSchoolAdminA(admin.adminType);
  const [data, setData] = useState<Loaded | null>(null);
  const [view, setView] = useState<'sent' | 'inbox'>('sent');
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [audiences, setAudiences] = useState<SchoolAudience[]>(['students']);
  const [department, setDepartment] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getSchoolNotifications(page));
    } catch (reason) {
      toast('error', errorMessage(reason), 'Fetch Error');
    }
  }, [page, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (audience: SchoolAudience) =>
    setAudiences(current => (current.includes(audience) ? current.filter(a => a !== audience) : [...current, audience]));

  // A memo image can carry the whole message.
  const valid = title.trim().length >= 3 && (message.trim().length >= 3 || attachments.length > 0) && audiences.length > 0;
  const scopeLabel = institutionRep ? department || 'the whole institution' : `the ${data?.department ?? 'your'} department`;
  const audienceLabel = audiences.map(a => AUDIENCE_META[a].label.toLowerCase()).join(', ');

  const send = async () => {
    setSending(true);
    try {
      const result = await sendSchoolNotification({
        title: title.trim(),
        message: message.trim(),
        audiences,
        department: institutionRep ? department : undefined,
        attachments,
      });
      toast('success', result.message, 'Sending');
      setConfirming(false);
      setTitle('');
      setMessage('');
      setAttachments([]);
      setPage(1);
      setView('sent');
      await load();
    } catch (reason) {
      toast('error', errorMessage(reason), 'Send Failed');
    } finally {
      setSending(false);
    }
  };

  if (!data) return <Loading />;
  const sent = data.sent;
  return (
    <>
      <ScrollPage contentContainerStyle={styles.page}>
        <View style={styles.grid}>
          <View style={styles.compose}>
            <Card>
              <SectionHeader icon="edit-notifications" title="New notification" subtitle={`To ${scopeLabel}`} />
              <Text style={styles.label}>Who receives it</Text>
              <View style={styles.audiences}>
                {data.audiences.map(audience => (
                  <AudienceToggle key={audience} audience={audience} selected={audiences.includes(audience)} onPress={() => toggle(audience)} />
                ))}
              </View>
              {institutionRep ? (
                <>
                  <Text style={styles.label}>Department</Text>
                  <FilterChips
                    value={department ?? '__all'}
                    onChange={value => setDepartment(value === '__all' ? null : value)}
                    options={[{ value: '__all', label: 'All departments' }, ...data.departments.map(name => ({ value: name, label: name }))]}
                  />
                </>
              ) : (
                <View style={styles.lockedScope}>
                  <Icon name="lock-outline" size={15} color={colors.textMuted} />
                  <Text style={styles.meta}>Department reps can only notify their own department ({data.department ?? 'not set'}).</Text>
                </View>
              )}
              <Field label={`Title (${title.length}/${TITLE_MAX})`} value={title} onChangeText={value => setTitle(value.slice(0, TITLE_MAX))} placeholder="e.g. Mid-semester tests start Monday" />
              <Field
                label={`Message (${message.length}/${MESSAGE_MAX})`}
                multiline
                value={message}
                onChangeText={value => setMessage(value.slice(0, MESSAGE_MAX))}
                placeholder={attachments.length ? 'Optional when you attach the memo' : 'What do they need to know?'}
              />
              <AttachmentPicker value={attachments} onChange={setAttachments} />
              <Button title="Review and send" icon="send" disabled={!valid} onPress={() => setConfirming(true)} />
            </Card>
          </View>
          <View style={styles.preview}>
            <Card>
              <SectionHeader icon="smartphone" title="Preview" subtitle="How it appears in the iCampus app" />
              <NotificationItem
                item={{
                  title: title.trim() || 'Your title',
                  message: message.trim() || (attachments.length ? 'Open to view the attached memo.' : 'Your message will appear here.'),
                  category: 'classroom',
                  actionType: 'SCHOOL_ANNOUNCEMENT',
                  isRead: false,
                  createdAt: new Date().toISOString(),
                }}
              />
              {attachments[0] ? <Image source={{ uri: attachments[0].url }} style={styles.previewImage} resizeMode="cover" /> : null}
              <Text style={styles.meta}>Recipients can open it to read the full message and view attached images. Students who turned off classroom notifications won't get a push.</Text>
            </Card>
          </View>
        </View>

        <TabStrip
          tabs={[
            { id: 'sent', label: 'Sent by your school', icon: 'outbox', badge: sent.total || undefined },
            { id: 'inbox', label: 'Your inbox', icon: 'inbox', badge: data.inbox.filter(item => item.isRead === false).length || undefined },
          ]}
          active={view}
          onChange={setView}
        />
        {view === 'sent' ? (
          <Card>
            {sent.items.length === 0 ? <Text style={styles.meta}>Nothing sent yet.</Text> : null}
            {sent.items.map(item => (
              <View key={item.id} style={styles.sentRow}>
                <View style={[styles.sentIcon, { backgroundColor: colors.primary + '14' }]}>
                  <Icon name="notifications-active" size={18} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <View style={styles.sentHead}>
                    <Text numberOfLines={1} style={styles.sentTitle}>{item.title}</Text>
                    <Pill label={item.status === 'sent' ? 'SENT' : 'SENDING'} color={item.status === 'sent' ? colors.success : colors.pendingDelivery} />
                  </View>
                  <Text numberOfLines={3} style={styles.body}>{item.message}</Text>
                  {item.attachments?.length ? (
                    <View style={styles.sentImages}>
                      {item.attachments.map((a: Attachment) => (
                        <Image key={a.url} source={{ uri: a.url }} style={styles.sentImage} />
                      ))}
                    </View>
                  ) : null}
                  <Text style={styles.meta}>
                    {item.senderName} · {item.department || 'All departments'} · {(item.audiences ?? []).map((a: SchoolAudience) => AUDIENCE_META[a]?.label ?? a).join(', ')} · {fromNow(item.createdAt)}
                  </Text>
                </View>
                <View style={styles.reach}>
                  <Text style={styles.sentTitle}>{Number(item.recipientCount ?? 0).toLocaleString()}</Text>
                  <Text style={styles.meta}>recipients</Text>
                </View>
              </View>
            ))}
            {sent.totalPages > 1 ? (
              <View style={styles.pager}>
                <Button compact variant="outline" icon="chevron-left" title="Newer" disabled={page <= 1} onPress={() => setPage(page - 1)} />
                <Text style={styles.meta}>
                  Page {sent.page} of {sent.totalPages}
                </Text>
                <Button compact variant="outline" icon="chevron-right" title="Older" disabled={page >= sent.totalPages} onPress={() => setPage(page + 1)} />
              </View>
            ) : null}
          </Card>
        ) : (
          <Card>
            {data.inbox.length === 0 ? <Text style={styles.meta}>No notifications for you yet.</Text> : null}
            {data.inbox.map(item => (
              <NotificationItem key={item.id} item={item} />
            ))}
          </Card>
        )}
      </ScrollPage>
      <ConfirmModal
        visible={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void send()}
        title="Send this notification?"
        subtitle={`"${title.trim()}" goes to ${audienceLabel} in ${scopeLabel}. It can't be unsent.`}
        confirmText="Send"
        loading={sending}
      />
    </>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    page: { paddingBottom: 120 },
    flex: { flex: 1, minWidth: 0 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
    compose: { flexGrow: 3, flexBasis: 420, minWidth: 0 },
    preview: { flexGrow: 2, flexBasis: 300, minWidth: 0 },
    label: { color: c.textDarker, fontSize: 13, fontWeight: '700', marginBottom: 8 },
    audiences: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    audience: { flexGrow: 1, flexBasis: 170, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
    audienceLabel: { fontSize: 13.5, fontWeight: '700', color: c.textDarker },
    lockedScope: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
    meta: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
    body: { fontSize: 13, color: c.text, lineHeight: 19, marginVertical: 4 },
    sentRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    sentIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    sentHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sentTitle: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: c.textDarker },
    reach: { alignItems: 'flex-end' },
    previewImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 10 },
    sentImages: { flexDirection: 'row', gap: 6, marginBottom: 4 },
    sentImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: c.surfaceRaised },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 },
  }),
);
