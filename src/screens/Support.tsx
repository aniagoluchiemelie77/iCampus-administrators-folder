import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Attachment, fetchTicket, replyToTicket, SupportTicket, uploadAttachment } from '../api';
import { errorMessage, useNavigation, useToast } from '../context';
import { Icon } from '../icons';
import { makeStyles, useColors } from '../theme';
import { Button, EmptyState, formatDate, fromNow, Loading, PageHeader, TabStrip, UserAvatar } from '../ui';
import { useTicketPages } from './Tickets';

export const isEmailInquiry = (ticket: SupportTicket) => ticket.source === 'email' || Boolean(ticket.guestEmail);

type Filter = 'all' | 'open' | 'resolved';
const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: 'all', label: 'all' },
  { id: 'open', label: 'open' },
  { id: 'resolved', label: 'resolved' },
];

export function SupportInquiries() {
  const { push } = useNavigation();
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 2 : 1;
  const styles = useStyles();
  const colors = useColors();
  const [filter, setFilter] = useState<Filter>('all');
  const pages = useTicketPages(isEmailInquiry);

  const tickets = pages.tickets.filter(ticket => {
    if (filter === 'open') return ticket.status === 'open' || ticket.status === 'pending';
    if (filter === 'resolved') return ticket.status === 'resolved' || ticket.status === 'closed';
    return true;
  });

  return (
    <View style={styles.flex}>
      <PageHeader title="Support Inquiries" />
      <TabStrip tabs={FILTERS} active={filter} onChange={setFilter} uppercase />
      {pages.loading && pages.tickets.length === 0 ? (
        <Loading />
      ) : (
        <FlatList
          key={columns}
          data={tickets}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? styles.columns : undefined}
          keyExtractor={item => item.ticketRefId}
          renderItem={({ item }) => {
            const lastMessage = item.thread?.[item.thread.length - 1]?.message || item.originalMessage;
            const sender = item.guestEmail || item.userId || 'Unknown sender';
            const open = item.status === 'open' || item.status === 'pending';
            return (
              <Pressable
                onPress={() => push({ name: 'chat', ticketRefId: item.ticketRefId })}
                style={({ hovered }: any) => [styles.card, hovered && styles.cardHover]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.sender}>
                    <UserAvatar firstName={sender} size={36} />
                    <View style={styles.flex}>
                      <Text numberOfLines={1} style={styles.senderEmail}>{sender}</Text>
                      <Text numberOfLines={1} style={styles.ticketId}>Ref: {item.ticketRefId}</Text>
                    </View>
                  </View>
                  <Text style={[styles.status, { color: open ? colors.pendingDelivery : colors.success }]}>{item.status}</Text>
                </View>
                {item.summary ? <Text numberOfLines={1} style={styles.subject}>{item.summary}</Text> : null}
                <Text numberOfLines={2} style={styles.snippet}>{lastMessage}</Text>
                <Text style={styles.timestamp}>{fromNow(item.updatedAt || item.createdAt)}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            pages.error ? (
              <EmptyState icon="wifi-off" title="Couldn't load inquiries" subtitle={pages.error} buttonText="Try again" buttonIcon="refresh" onPress={() => void pages.refresh()} />
            ) : (
              <EmptyState icon="email" title="No Support Inquiries" subtitle="All clean! There are no external emails or inquiries matching this filter." />
            )
          }
          onEndReached={() => void pages.loadMore()}
          onEndReachedThreshold={0.5}
          onRefresh={() => void pages.refresh()}
          refreshing={false}
          ListFooterComponent={
            pages.loadingMore ? (
              <ActivityIndicator style={styles.footer} />
            ) : pages.hasMore ? (
              <Button compact variant="outline" title="Load more inquiries" onPress={() => void pages.loadMore()} style={styles.footer} />
            ) : undefined
          }
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

/** Opens the browser file picker; resolves with null if nothing was chosen. */
const pickFile = (accept: string) =>
  new Promise<File | null>(resolve => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });

type ChatMessage = { id: string; text: string; isUser: boolean; timestamp?: string; attachments: Attachment[] };

const toMessages = (ticket: SupportTicket): ChatMessage[] => {
  const requester = ticket.guestEmail || ticket.userId;
  const thread = (ticket.thread ?? []).map((message, index) => ({
    id: `${index}_${message.timestamp}`,
    text: message.message ?? '',
    isUser: message.sender !== requester,
    timestamp: message.timestamp,
    attachments: message.attachments ?? [],
  }));
  if (thread.length === 0 && ticket.originalMessage) {
    thread.push({ id: 'original_msg', text: ticket.originalMessage, isUser: false, timestamp: ticket.createdAt, attachments: [] });
  }
  return thread.reverse();
};

function MessageBubble({ message }: { message: ChatMessage }) {
  const colors = useColors();
  const styles = useStyles();
  const mine = message.isUser;
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {message.attachments.map((attachment, index) =>
          attachment.type === 'image' ? (
            <Pressable key={index} accessibilityRole="link" onPress={() => void Linking.openURL(attachment.url)}>
              <Image source={{ uri: attachment.url }} style={styles.attachmentImage} />
            </Pressable>
          ) : (
            <Pressable key={index} accessibilityRole="link" onPress={() => void Linking.openURL(attachment.url)} style={styles.attachmentFile}>
              <Icon name="insert-drive-file" size={20} color={mine ? colors.btnTextColor : colors.primary} />
              <Text numberOfLines={1} style={[styles.attachmentName, mine && styles.textMine]}>{attachment.fileName || 'Document'}</Text>
            </Pressable>
          ),
        )}
        {message.text ? <Text style={[styles.bubbleText, mine && styles.textMine]}>{message.text}</Text> : null}
        {message.timestamp ? <Text style={[styles.bubbleTime, mine && styles.textMine]}>{formatDate(message.timestamp, true)}</Text> : null}
      </View>
    </View>
  );
}

export function SupportChat({ ticketRefId }: { ticketRefId: string }) {
  const colors = useColors();
  const styles = useStyles();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setMessages(toMessages(await fetchTicket(ticketRefId)));
    } catch (reason) {
      toast('error', errorMessage(reason), 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  }, [ticketRefId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (text: string, attachments: Attachment[] = []) => {
    if (!text.trim() && attachments.length === 0) return;
    const optimistic: ChatMessage = { id: `local_${Date.now()}`, text, isUser: true, timestamp: new Date().toISOString(), attachments };
    setMessages(previous => [optimistic, ...previous]);
    setInput('');
    setSending(true);
    try {
      await replyToTicket(ticketRefId, text, attachments);
    } catch (reason) {
      setMessages(previous => previous.filter(message => message.id !== optimistic.id));
      setInput(text);
      toast('error', errorMessage(reason, 'Could not dispatch message.'), 'Failed to Send');
    } finally {
      setSending(false);
    }
  };

  const attach = async (kind: 'image' | 'file') => {
    setMenuOpen(false);
    const file = await pickFile(kind === 'image' ? 'image/*' : '*/*');
    if (!file) return;
    setSending(true);
    try {
      const url = await uploadAttachment(file);
      await send(kind === 'image' ? 'Sent an image' : `Shared: ${file.name || 'Document'}`, [
        { url, type: kind, fileName: file.name || (kind === 'image' ? 'attachment.jpg' : 'Document') },
      ]);
    } catch (reason) {
      toast('error', errorMessage(reason, 'Attachment process failed.'), kind === 'image' ? 'Media Error' : 'Document Error');
      setSending(false);
    }
  };

  return (
    <View style={styles.flex}>
      <PageHeader title="Support Inquiry" subtitle={`#${ticketRefId}`} />
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          inverted={messages.length > 0}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.chatList}
          ListEmptyComponent={<EmptyState icon="speaker-notes-off" title="No Thread History" subtitle="Start the conversation by sending a message below." />}
        />
      )}
      {menuOpen ? (
        <View style={styles.attachMenu}>
          <Button compact variant="outline" icon="add-photo-alternate" title="Image" onPress={() => void attach('image')} />
          <Button compact variant="outline" icon="insert-drive-file" title="Document" onPress={() => void attach('file')} />
        </View>
      ) : null}
      <View style={styles.inputBar}>
        <Pressable
          accessibilityLabel="Add attachment"
          accessibilityRole="button"
          onPress={() => setMenuOpen(open => !open)}
          style={styles.attachButton}
        >
          <Icon name={menuOpen ? 'close' : 'add'} size={24} color={colors.primary} />
        </Pressable>
        <TextInput
          accessibilityLabel="Reply"
          multiline
          onChangeText={setInput}
          onKeyPress={(event: any) => {
            if (event.nativeEvent.key === 'Enter' && !event.nativeEvent.shiftKey) {
              event.preventDefault?.();
              void send(input);
            }
          }}
          placeholder="Type your reply..."
          placeholderTextColor={colors.inputTextHolder}
          style={styles.input}
          value={input}
        />
        <Pressable
          accessibilityLabel="Send"
          accessibilityRole="button"
          disabled={sending || !input.trim()}
          onPress={() => void send(input)}
          style={[styles.sendButton, (sending || !input.trim()) && styles.disabled]}
        >
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="send" size={20} color={colors.btnTextColor} />}
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1 },
    list: { paddingBottom: 30, width: '100%', maxWidth: 1200, alignSelf: 'center' },
    columns: { gap: 12 },
    card: { flex: 1, padding: 15, borderRadius: 15, marginBottom: 15, backgroundColor: c.backgroundSecondary },
    cardHover: { opacity: 0.85 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
    sender: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
    senderEmail: { fontSize: 14, fontWeight: 'bold', color: c.textDarker },
    ticketId: { fontSize: 11, opacity: 0.7, marginTop: 3, color: c.text },
    status: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
    subject: { fontSize: 14, fontWeight: '600', marginBottom: 4, color: c.text },
    snippet: { fontSize: 14, opacity: 0.85, marginBottom: 6, color: c.text },
    timestamp: { fontSize: 11, opacity: 0.6, alignSelf: 'flex-end', color: c.text },
    footer: { marginVertical: 16, alignSelf: 'center' },
    chatList: { flexGrow: 1, paddingVertical: 12, width: '100%', maxWidth: 900, alignSelf: 'center' },
    bubbleRow: { flexDirection: 'row', marginVertical: 4, paddingHorizontal: 8 },
    bubbleRowMine: { justifyContent: 'flex-end' },
    bubble: { maxWidth: '78%', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14, gap: 6 },
    bubbleMine: { backgroundColor: c.btnColor, borderBottomRightRadius: 4 },
    bubbleTheirs: { backgroundColor: c.backgroundSecondary, borderBottomLeftRadius: 4 },
    bubbleText: { fontSize: 14, lineHeight: 20, color: c.text },
    bubbleTime: { fontSize: 10, opacity: 0.7, alignSelf: 'flex-end', color: c.text },
    textMine: { color: c.btnTextColor },
    attachmentImage: { width: 220, height: 160, borderRadius: 12 },
    attachmentFile: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)' },
    attachmentName: { fontSize: 13, fontWeight: '600', color: c.text, flexShrink: 1 },
    attachMenu: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: c.background },
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, backgroundColor: c.background },
    attachButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.backgroundSecondary },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 140,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 14,
      color: c.textDarker,
      backgroundColor: c.backgroundSecondary,
    },
    sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.btnColor },
    disabled: { opacity: 0.6 },
  }),
);
