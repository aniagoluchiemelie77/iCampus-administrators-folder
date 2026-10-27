import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { io } from 'socket.io-client';
import { backendUrl, getNotifications, NOTIFICATIONS_PAGE_SIZE } from '../api';
import { errorMessage, useSession, useToast } from '../context';
import { NotificationItem } from '../NotificationItem';
import { EmptyState, Loading } from '../ui';

/** Paginated activity feed for one notification category, with live additions. */
export function ActivityLogs({ category, label }: { category: string; label: string }) {
  const { admin } = useSession();
  const toast = useToast();
  const [logs, setLogs] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = useRef(0);
  const hasMore = useRef(true);
  const inFlight = useRef(false);

  const fetchPage = useCallback(
    async (pageNumber: number) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (pageNumber === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const data = await getNotifications(category, pageNumber);
        hasMore.current = data.length >= NOTIFICATIONS_PAGE_SIZE;
        page.current = pageNumber;
        setLogs(previous => (pageNumber === 1 ? data : [...previous, ...data]));
      } catch (reason) {
        const message = errorMessage(reason);
        if (pageNumber === 1) setError(message);
        else toast('error', message, `Failed to fetch ${label} notifications`);
      } finally {
        inFlight.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, label, toast],
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  // New platform events for this category arrive over the backend socket.
  useEffect(() => {
    let socket: ReturnType<typeof io> | null = null;
    try {
      socket = io(backendUrl(), { transports: ['websocket'], query: { userId: admin.uid } });
      socket.on('new_notification', (log: Record<string, any>) => {
        if (log?.category === category) setLogs(previous => [log, ...previous]);
      });
    } catch {
      // Without a backend URL the page shows its own error from the fetch.
    }
    return () => {
      socket?.disconnect();
    };
  }, [admin.uid, category]);

  if (loading) return <Loading />;
  return (
    <FlatList
      data={logs}
      keyExtractor={(item, index) => String(item.notificationId ?? item._id ?? index)}
      renderItem={({ item }) => <NotificationItem item={item} />}
      onEndReached={() => hasMore.current && void fetchPage(page.current + 1)}
      onEndReachedThreshold={0.5}
      onRefresh={() => void fetchPage(1)}
      refreshing={false}
      ListEmptyComponent={
        error ? (
          <EmptyState icon="wifi-off" title={`Couldn't load ${label}`} subtitle={error} buttonText="Try again" buttonIcon="refresh" onPress={() => void fetchPage(1)} />
        ) : (
          <EmptyState icon="notifications-none" title="No activity yet" subtitle={`${label} activity recorded by the platform will appear here.`} />
        )
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} /> : undefined}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 110 },
  footer: { marginVertical: 16 },
});
