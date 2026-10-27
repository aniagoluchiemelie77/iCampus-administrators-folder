import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { fetchTickets } from './api';
import { Route, useNavigation, useSession } from './context';
import { Icon, IconName } from './icons';
import { isEmailInquiry } from './screens/Support';
import { PRIMARY_COLOR_TINT, useColors } from './theme';
import { CountBadge } from './ui';

const ACTIONS: Array<{ label: string; icon: IconName; route: Route }> = [
  { label: 'Search', icon: 'search', route: { name: 'search' } },
  { label: 'Support Inquiries', icon: 'mail-outline', route: { name: 'inquiries' } },
];

/** Open email inquiries, for the badge on the Support Inquiries action. */
const useUnreadInquiries = (enabled: boolean) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    fetchTickets(50)
      .then(page => setCount(page.tickets.filter(ticket => isEmailInquiry(ticket) && ticket.status === 'open').length))
      .catch(() => setCount(0));
  }, [enabled]);
  return count;
};

/**
 * The dashboard's floating button. Super admins and support staff get the
 * expandable menu over a blurred backdrop; everyone else goes straight to search.
 */
export function AdminFab({ right }: { right: number }) {
  const colors = useColors();
  const { admin } = useSession();
  const { push } = useNavigation();
  const [open, setOpen] = useState(false);
  const canViewWidgets = admin.adminType === 'super_admin' || admin.adminType === 'support';
  const unread = useUnreadInquiries(canViewWidgets);

  return (
    <>
      {!open ? (
        <Pressable
          accessibilityLabel={canViewWidgets ? 'Open quick actions' : 'Search'}
          accessibilityRole="button"
          onPress={() => (canViewWidgets ? setOpen(true) : push({ name: 'search' }))}
          style={({ pressed }) => [styles.fab, { right, backgroundColor: colors.btnColor, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
        >
          <Icon name={canViewWidgets ? 'widgets' : 'search'} size={34} color={colors.btnTextColor} />
          {canViewWidgets && unread > 0 ? <CountBadge count={unread} style={styles.fabBadge} /> : null}
        </Pressable>
      ) : null}
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable accessibilityLabel="Close quick actions" style={styles.overlay} onPress={() => setOpen(false)} />
        <View style={[styles.menu, { right }]}>
          {ACTIONS.map(action => (
            <View key={action.label} style={[styles.menuItem, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.menuLabel, { color: colors.primary }]}>{action.label}</Text>
              <Pressable
                accessibilityLabel={action.label}
                accessibilityRole="button"
                onPress={() => {
                  setOpen(false);
                  push(action.route);
                }}
                style={({ pressed }) => [styles.miniFab, { backgroundColor: colors.btnColor, transform: [{ scale: pressed ? 0.92 : 1 }] }]}
              >
                <Icon name={action.icon} size={24} color={colors.btnTextColor} />
              </Pressable>
              {action.route.name === 'inquiries' && unread > 0 ? <CountBadge count={unread} style={styles.menuBadge} /> : null}
            </View>
          ))}
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            style={[styles.closeFab, { backgroundColor: colors.btnColor }]}
          >
            <Icon name="close" size={30} color={colors.btnTextColor} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 32,
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: PRIMARY_COLOR_TINT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 100,
  },
  fabBadge: { position: 'absolute', top: 2, right: 2 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(19, 18, 18, 0.4)' },
  menu: { position: 'absolute', bottom: 32, alignItems: 'flex-end' },
  menuItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, paddingLeft: 14, borderRadius: 30 },
  menuLabel: { fontWeight: '700', marginRight: 15, fontSize: 15 },
  miniFab: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: PRIMARY_COLOR_TINT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  menuBadge: { position: 'absolute', top: -4, right: -4 },
  closeFab: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginRight: 7 },
});
