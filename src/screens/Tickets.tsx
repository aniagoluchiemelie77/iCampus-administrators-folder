import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import {
  fetchTicket,
  fetchTickets,
  fetchUserDetails,
  fetchUserNotifications,
  sendSystemNotification,
  SupportTicket,
  updateTicketStatus,
} from '../api';
import { errorMessage, useNavigation, useToast } from '../context';
import { Icon } from '../icons';
import { NotificationItem } from '../NotificationItem';
import { makeStyles, useColors } from '../theme';
import {
  Button,
  ConfirmModal,
  EmptyState,
  formatDate,
  IconButton,
  Loading,
  PageHeader,
  severityColor,
  Sheet,
  statusColor,
  UserAvatar,
  UserIdentity,
} from '../ui';
import { EditUserSheet } from './EditUser';

const PAGE_SIZE = 20;
const capitalize = (value?: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');

/**
 * Cursor-paginated ticket list shared by the Tickets tab and Support
 * Inquiries. `filter` narrows each fetched page (e.g. to email inquiries).
 */
export const useTicketPages = (filter?: (ticket: SupportTicket) => boolean) => {
  const toast = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const load = useCallback(
    async (cursor = '') => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await fetchTickets(PAGE_SIZE, cursor);
        const items = filterRef.current ? page.tickets.filter(filterRef.current) : page.tickets;
        setTickets(previous => (cursor ? [...previous, ...items] : items));
        setNextCursor(page.nextCursor);
      } catch (reason) {
        const message = errorMessage(reason, 'Check your connection, then try again.');
        setError(message);
        if (cursor) toast('error', message, "Couldn't load more tickets");
      } finally {
        inFlight.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    tickets,
    loading,
    loadingMore,
    error,
    hasMore: Boolean(nextCursor),
    refresh: () => load(),
    loadMore: () => nextCursor && !loadingMore && load(nextCursor),
  };
};

function TicketCard({ ticket, onPress }: { ticket: SupportTicket; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const severity = ticket.severity || 'low';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }: any) => [styles.card, (pressed || hovered) && styles.cardActive]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.ticketRef}>#{ticket.ticketRefId}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor(ticket.status, colors) }]}>
          <Text style={styles.badgeText}>{(ticket.status || 'open').toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.severity}>
          <Icon name="error" size={14} color={severityColor(severity, colors)} />
          <Text style={[styles.severityText, { color: severityColor(severity, colors) }]}>{severity.toUpperCase()} Priority</Text>
        </View>
        <Text numberOfLines={1} style={styles.category}>{capitalize(ticket.category) || 'General'}</Text>
      </View>
      {ticket.summary ? <Text numberOfLines={2} style={styles.summary}>{ticket.summary}</Text> : null}
      <View style={styles.cardFooter}>
        <Text style={styles.date}>{formatDate(ticket.createdAt || ticket.updatedAt)}</Text>
        <Icon name="chevron-right" size={22} color={colors.text} />
      </View>
    </Pressable>
  );
}

export function TicketsSection() {
  const { push } = useNavigation();
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 2 : 1;
  const styles = useStyles();
  const pages = useTicketPages();

  return (
    <FlatList
      key={columns}
      data={pages.tickets}
      numColumns={columns}
      keyExtractor={item => item.ticketRefId}
      columnWrapperStyle={columns > 1 ? styles.columns : undefined}
      renderItem={({ item }) => (
        <View style={styles.cardWrapper}>
          <TicketCard ticket={item} onPress={() => push({ name: 'ticket', ticket: item })} />
        </View>
      )}
      ListHeaderComponent={<Text style={styles.headerTitle}>Tickets</Text>}
      onEndReached={() => void pages.loadMore()}
      onEndReachedThreshold={0.5}
      onRefresh={() => void pages.refresh()}
      refreshing={false}
      ListEmptyComponent={
        pages.loading ? (
          <Loading />
        ) : pages.error ? (
          <EmptyState
            icon="wifi-off"
            title="Couldn't load support tickets"
            subtitle={pages.error}
            buttonText="Try again"
            buttonIcon="refresh"
            onPress={() => void pages.refresh()}
          />
        ) : (
          <EmptyState icon="support-agent" title="No support tickets" subtitle="New support requests will appear here." />
        )
      }
      ListFooterComponent={
        pages.loadingMore ? (
          <ActivityIndicator style={styles.footer} />
        ) : pages.hasMore && pages.tickets.length > 0 ? (
          <Button compact variant="outline" title="Load more tickets" onPress={() => void pages.loadMore()} style={styles.footer} />
        ) : undefined
      }
      contentContainerStyle={styles.list}
    />
  );
}

/** "Request Additional Info": messages the user, then marks the ticket pending. */
function RequestInfoSheet({ ticket, visible, onClose, onSent }: { ticket: SupportTicket; visible: boolean; onClose: () => void; onSent: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await sendSystemNotification({
        ticketRefId: ticket.ticketRefId,
        recipientId: ticket.userId,
        title: `Update on Ticket #${ticket.ticketRefId}`,
        message: message.trim(),
        category: 'system',
      });
      await updateTicketStatus(ticket.ticketRefId, 'pending');
      toast('success', 'The user has been notified and the ticket is pending.', 'Message Sent');
      setMessage('');
      onSent();
    } catch (reason) {
      toast('error', errorMessage(reason, 'Could not send the message to the user.'), 'Notification Failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} variant="dialog" maxWidth={520}>
      <Text style={styles.modalTitle}>Message User</Text>
      <TextInput
        accessibilityLabel="Message"
        multiline
        numberOfLines={4}
        onChangeText={setMessage}
        placeholder="E.g., Please provide a screenshot..."
        placeholderTextColor={colors.inputTextHolder}
        style={styles.messageInput}
        value={message}
      />
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} disabled={sending} style={styles.flex} />
        <Button title="Send" onPress={() => void send()} loading={sending} disabled={!message.trim()} style={styles.flex} />
      </View>
    </Sheet>
  );
}

export function TicketDetail({ ticket: initialTicket }: { ticket: SupportTicket }) {
  const colors = useColors();
  const styles = useStyles();
  const toast = useToast();
  const { pop, push } = useNavigation();
  const [ticket, setTicket] = useState(initialTicket);
  const [user, setUser] = useState<Record<string, any> | null>(null);
  const [notifications, setNotifications] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [requestVisible, setRequestVisible] = useState(false);
  const [resolveVisible, setResolveVisible] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const { ticketRefId, userId } = initialTicket;
    Promise.allSettled([
      fetchTicket(ticketRefId),
      userId ? fetchUserDetails(userId) : Promise.resolve(null),
      userId ? fetchUserNotifications(userId, 10) : Promise.resolve([]),
    ]).then(([ticketResult, userResult, notificationResult]) => {
      if (ticketResult.status === 'fulfilled') setTicket(ticketResult.value);
      else toast('error', 'Showing the ticket list snapshot.', 'Ticket Refresh Failed');
      if (userResult.status === 'fulfilled') setUser(userResult.value);
      if (notificationResult.status === 'fulfilled') setNotifications(notificationResult.value);
      setLoading(false);
    });
  }, [initialTicket, toast]);

  const resolve = async () => {
    setResolving(true);
    try {
      await updateTicketStatus(ticket.ticketRefId, 'resolved');
      toast('success', 'Ticket marked as resolved.', 'Success');
      setResolveVisible(false);
      pop();
    } catch (reason) {
      toast('error', errorMessage(reason, "Couldn't resolve the ticket, please retry."), 'Update Failed');
    } finally {
      setResolving(false);
    }
  };

  const severity = ticket.severity || 'low';
  const requester = ticket.guestEmail || ticket.userId;

  return (
    <View style={styles.flex}>
      <PageHeader title="Support Ticket Details" />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ticket Info</Text>
            <View style={styles.infoRow}>
              <Text style={styles.textLabel}>
                Ref: <Text style={styles.bold}>#{ticket.ticketRefId}</Text>
              </Text>
              <Text style={styles.textLabel}>{capitalize(ticket.category) || 'General'}</Text>
              <Text style={[styles.textLabel, { color: severityColor(severity, colors) }]}>{severity.toUpperCase()}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor(ticket.status, colors) }]}>
                <Text style={styles.badgeText}>{(ticket.status || 'open').toUpperCase()}</Text>
              </View>
            </View>
            {ticket.summary ? <Text style={styles.summaryText}>{ticket.summary}</Text> : null}
            {Array.isArray(ticket.thread) && ticket.thread.length > 0 ? (
              <View style={styles.thread}>
                <Text style={styles.sectionTitle}>Conversation</Text>
                {ticket.thread.map((entry, index) => (
                  <View key={`${entry.timestamp || 'message'}-${index}`}>
                    <Text style={styles.threadSender}>{entry.sender === requester ? 'User' : 'Support'}</Text>
                    <View style={styles.messageBox}>
                      <Text style={styles.messageText}>{entry.message || 'Attachment'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : ticket.originalMessage ? (
              <View style={styles.messageBox}>
                <Text style={[styles.messageText, styles.italic]}>"{ticket.originalMessage}"</Text>
              </View>
            ) : null}
          </View>

          {user ? (
            <View style={styles.section}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>User Context</Text>
                <IconButton icon="edit" label="Edit user" onPress={() => setEditing(true)} />
              </View>
              <View style={styles.userRow}>
                <UserAvatar profilePic={user.profilePic} firstName={user.firstname} lastName={user.lastname} username={user.username} size={50} />
                <View style={styles.flex}>
                  <UserIdentity
                    firstname={user.firstname}
                    lastname={user.lastname}
                    username={user.username}
                    tier={user.tier}
                    isVerified={user.isVerified}
                    showVerifyIcon
                  />
                  <Text style={[styles.textLabel, styles.userEmail]}>{user.email}</Text>
                  <Text style={styles.textLabel}>
                    iScore: <Text style={styles.bold}>{user.currentIScore || 0}</Text>
                  </Text>
                </View>
              </View>
              {user.isSuspended ? (
                <View style={styles.suspended}>
                  <Icon name="info" size={16} color={colors.primary} />
                  <Text style={styles.suspendedText}>ACCOUNT SUSPENDED</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.section, styles.plainSection]}>
            <Text style={styles.sectionTitle}>User's Recent Activity</Text>
            {notifications.length === 0 ? (
              <EmptyState
                icon="notifications-off"
                title="No Recent Notifications"
                subtitle="This user hasn't received any system or ticket alerts yet."
              />
            ) : (
              notifications.map((item, index) => <NotificationItem key={item.notificationId ?? index} item={item} />)
            )}
          </View>
        </ScrollView>
      )}
      <View style={styles.footerActions}>
        <Button title="Reply" icon="chat" variant="outline" onPress={() => push({ name: 'chat', ticketRefId: ticket.ticketRefId })} style={styles.actionButton} />
        <Button title="Request Additional Info" icon="pending-actions" onPress={() => setRequestVisible(true)} style={styles.actionButton} />
        <Button
          title="Mark As Resolved"
          icon="check-circle"
          variant="success"
          disabled={ticket.status === 'resolved'}
          onPress={() => setResolveVisible(true)}
          style={styles.actionButton}
        />
      </View>
      <ConfirmModal
        visible={resolveVisible}
        onClose={() => setResolveVisible(false)}
        onConfirm={() => void resolve()}
        title="Resolve Ticket"
        subtitle="Are you sure this issue is completely resolved?"
        confirmText="Resolve"
        loading={resolving}
      />
      <RequestInfoSheet
        ticket={ticket}
        visible={requestVisible}
        onClose={() => setRequestVisible(false)}
        onSent={() => {
          setRequestVisible(false);
          pop();
        }}
      />
      <EditUserSheet
        user={editing ? user : null}
        onClose={() => setEditing(false)}
        onUpdated={updated => {
          setUser(updated);
          setEditing(false);
        }}
      />
    </View>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1 },
    list: { paddingBottom: 110 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', paddingVertical: 12, color: c.textDarker },
    columns: { gap: 12 },
    cardWrapper: { flex: 1 },
    card: { flex: 1, padding: 15, borderRadius: 15, marginBottom: 15, backgroundColor: c.backgroundSecondary },
    cardActive: { opacity: 0.8 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    ticketRef: { fontSize: 14, fontWeight: 'bold', color: c.text },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    badgeText: { fontSize: 12, fontWeight: 'bold', color: c.btnTextColor },
    cardBody: { marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    severity: { flexDirection: 'row', alignItems: 'center' },
    severityText: { fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
    category: { fontSize: 14, fontWeight: '500', color: c.text, flexShrink: 1 },
    summary: { fontSize: 13, color: c.text, opacity: 0.85, marginBottom: 8 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    date: { fontSize: 12, color: c.text },
    footer: { marginVertical: 16, alignSelf: 'center' },
    detailContent: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingBottom: 120 },
    section: { padding: 15, borderRadius: 15, marginBottom: 15, backgroundColor: c.backgroundSecondary },
    plainSection: { backgroundColor: 'transparent', paddingHorizontal: 0 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: c.textDarker },
    infoRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 15 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    textLabel: { fontSize: 12, color: c.text },
    bold: { fontWeight: 'bold' },
    italic: { fontStyle: 'italic' },
    summaryText: { marginBottom: 15, fontSize: 14, fontWeight: 'bold', color: c.text },
    thread: { marginTop: 12, gap: 8 },
    threadSender: { fontSize: 12, fontWeight: '700', marginBottom: 4, color: c.text },
    messageBox: { padding: 10, borderRadius: 8, borderLeftWidth: 2, borderLeftColor: c.primary },
    messageText: { fontSize: 14, fontWeight: 'bold', color: c.text },
    userRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 15 },
    userEmail: { marginVertical: 5 },
    suspended: { flexDirection: 'row', alignItems: 'center' },
    suspendedText: { marginLeft: 5, fontWeight: 'bold', fontSize: 14, color: c.primary },
    footerActions: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      padding: 15,
      justifyContent: 'flex-end',
      backgroundColor: c.backgroundSecondary,
      borderTopWidth: 1,
      borderTopColor: c.border + '66',
    },
    actionButton: { paddingHorizontal: 15 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: c.textDarker, textAlign: 'center' },
    messageInput: {
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: 8,
      padding: 12,
      minHeight: 110,
      textAlignVertical: 'top',
      color: c.text,
      fontSize: 14,
    },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  }),
);
