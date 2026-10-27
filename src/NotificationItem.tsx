import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, IconName } from './icons';
import { notificationPath, openInApp } from './links';
import { useColors } from './theme';
import { formatDate } from './ui';

const CATEGORY_ICONS: Record<string, IconName> = {
  finance: 'account-balance',
  auth: 'security',
  store: 'shopping-cart',
  profile: 'account-circle',
  security: 'security',
  reminder: 'school',
  classroom: 'school',
  social: 'people',
  subscription: 'verified',
};

const grouped = (payload: Record<string, any>, one: string, many: string) =>
  payload.othersCount > 0
    ? `${payload.primaryUser} and ${payload.othersCount} others ${many}`
    : `${payload.primaryUser} ${one}`;

const formatMessage = (item: Record<string, any>) => {
  const payload = item.payload ?? {};
  switch (item.actionType) {
    case 'PROFILE_VIEW':
      return grouped(payload, 'viewed your profile', 'viewed your profile');
    case 'NEW_FOLLOWER':
      return grouped(payload, 'started following you', 'started following you');
    case 'POST_LIKED':
      return grouped(payload, 'liked your post', 'liked your post');
    case 'POST_MENTION':
      return grouped(payload, 'mentioned you in a post', 'mentioned you in their posts');
    case 'POST_COMMENTED':
      return grouped(payload, 'commented on your post', 'commented on your post');
    case 'POST_REPOSTED':
      return grouped(payload, 'reshared your post', 'reshared on your post');
    default:
      return item.message;
  }
};

/** Notification row from the iCampus app; opens the related app page in a new tab. */
export function NotificationItem({ item }: { item: Record<string, any> }) {
  const colors = useColors();
  const welcome = item.actionType === 'WELCOME_USER';
  const path = notificationPath(item);
  return (
    <Pressable
      accessibilityRole={path ? 'link' : undefined}
      disabled={!path}
      onPress={() => path && openInApp(path)}
      style={({ hovered }: any) => [
        styles.card,
        welcome
          ? [styles.welcomeCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.primaryTint }]
          : { backgroundColor: item.isRead === false ? colors.unread : colors.background },
        hovered && path ? styles.hovered : null,
      ]}
    >
      <View style={[styles.icon, welcome && [styles.welcomeIcon, { backgroundColor: colors.primary }]]}>
        <Icon
          name={welcome ? 'celebration' : CATEGORY_ICONS[item.category] ?? 'notifications-on'}
          size={welcome ? 25 : 24}
          color={welcome ? '#fff' : colors.primary}
        />
      </View>
      <View style={styles.content}>
        {welcome ? <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR ACCOUNT IS READY</Text> : null}
        <Text numberOfLines={welcome ? 2 : 1} style={[styles.title, welcome && styles.welcomeTitle, { color: colors.text }]}>
          {item.title || 'Notification'}
        </Text>
        <Text numberOfLines={welcome ? 3 : 2} style={[styles.message, { color: colors.text }]}>{formatMessage(item)}</Text>
        <Text style={[styles.time, { color: colors.text }]}>{formatDate(item.createdAt, true) || 'Recent'}</Text>
      </View>
      {path ? <Icon name="open-in-new" size={16} color={colors.primaryTint} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', marginBottom: 12, padding: 15, alignItems: 'flex-start', borderRadius: 10, gap: 12 },
  hovered: { opacity: 0.85 },
  welcomeCard: { borderWidth: 1, padding: 18, borderRadius: 16 },
  icon: { justifyContent: 'center' },
  welcomeIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 5 },
  title: { fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
  welcomeTitle: { fontSize: 17, marginBottom: 7 },
  message: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  time: { fontSize: 11 },
});
