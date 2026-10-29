import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdminUser, createAdmin, deleteAdmin, getAdmins, updateAdmin } from '../api';
import { useMeasuredWidth } from '../charts';
import { errorMessage, useNavigation, useSession, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { Colors, makeStyles, useColors } from '../theme';
import {
  Button,
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
  SectionHeader,
  UserAvatar,
} from '../ui';

const ROLE_META: Record<string, { icon: IconName; tone: (c: Colors) => string }> = {
  super_admin: { icon: 'shield', tone: c => c.primary },
  finance: { icon: 'payments', tone: c => c.success },
  support: { icon: 'support-agent', tone: c => c.info },
  moderator: { icon: 'gavel', tone: () => '#8e5cd9' },
  analyst: { icon: 'analytics', tone: () => '#0f9fa3' },
  school_administrator: { icon: 'school', tone: c => c.pendingDelivery },
};

const roleMeta = (role: string | undefined, colors: Colors) => {
  const meta = ROLE_META[role ?? ''] ?? { icon: 'person' as IconName, tone: (c: Colors) => c.textMuted };
  return { icon: meta.icon, tone: meta.tone(colors), label: formatLabel(role || 'administrator') };
};

const fullName = (admin: AdminUser) => [admin.firstname, admin.lastname].filter(Boolean).join(' ') || 'Administrator';

function AdminCard({
  admin,
  isSelf,
  canManage,
  onEdit,
  onDelete,
}: {
  admin: AdminUser;
  isSelf: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const role = roleMeta(admin.adminType, colors);
  const lastSeen = parseDate(admin.lastAccessed);
  const lift = useRef(new Animated.Value(0)).current;
  const hover = (toValue: number) => Animated.timing(lift, { toValue, duration: 180, useNativeDriver: true }).start();

  return (
    <Pressable onHoverIn={() => hover(1)} onHoverOut={() => hover(0)} accessible={false}>
      <Animated.View
        style={[
          styles.card,
          { transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] },
        ]}
      >
        <View style={[styles.cover, { backgroundColor: role.tone + '1C' }]}>
          <View style={[styles.coverOrb, { backgroundColor: role.tone + '1F' }]} />
          <Icon name={role.icon} size={88} color={role.tone + '2E'} style={styles.coverIcon} />
          {isSelf ? (
            <View style={styles.coverBadge}>
              <Pill label="YOU" icon="person" color={role.tone} solid />
            </View>
          ) : null}
        </View>
        <View style={styles.body}>
          <View style={[styles.avatarRing, { backgroundColor: colors.backgroundSecondary }]}>
            <UserAvatar profilePic={admin.profilePic} firstName={admin.firstname} lastName={admin.lastname} size={68} />
          </View>
          <View style={styles.nameRow}>
            <Text numberOfLines={2} style={styles.name}>{fullName(admin)}</Text>
            {admin.isVerified ? <Icon name="verified" size={18} color={colors.primary} /> : null}
          </View>
          {admin.email ? (
            <View style={styles.metaRow}>
              <Icon name="mail-outline" size={14} color={colors.textMuted} />
              <Text numberOfLines={1} style={styles.meta}>{admin.email}</Text>
            </View>
          ) : null}
          <View style={styles.roleRow}>
            <Pill label={role.label.toUpperCase()} icon={role.icon} color={role.tone} />
          </View>
        </View>
        <View style={styles.footer}>
          <View style={styles.flex}>
            <Text style={styles.footerLabel}>LAST ACTIVE</Text>
            <View style={styles.metaRow}>
              <View style={[styles.presence, { backgroundColor: lastSeen ? colors.success : colors.textMuted }]} />
              <Text numberOfLines={1} style={styles.footerValue}>
                {lastSeen ? `${fromNow(lastSeen)} · ${formatDate(lastSeen)}` : 'Never signed in'}
              </Text>
            </View>
          </View>
          {canManage ? (
            <View style={styles.actions}>
              <IconButton filled size={19} icon="edit" label={`Edit ${admin.firstname ?? 'administrator'}`} onPress={onEdit} />
              {!isSelf ? (
                <IconButton filled size={19} icon="delete-outline" color={colors.criticalSeverity} label={`Delete ${admin.firstname ?? 'administrator'}`} onPress={onDelete} />
              ) : null}
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const CARD_MIN_WIDTH = 320;
const GAP = 16;

export function AdminManagement() {
  const { admin: currentAdmin } = useSession();
  const { push } = useNavigation();
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const { width, onLayout } = useMeasuredWidth();
  const [admins, setAdmins] = useState<AdminUser[] | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isSuperAdmin = currentAdmin.adminType === 'super_admin';

  const load = useCallback(async () => {
    try {
      setAdmins(await getAdmins());
    } catch (reason) {
      setAdmins(previous => previous ?? []);
      toast('error', errorMessage(reason, 'Failed to fetch administrator list'), 'Fetch Error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await deleteAdmin(selected.uid);
      toast('success', 'Administrator deleted.', 'Deleted');
      setSelected(null);
      await load();
    } catch (reason) {
      toast('error', errorMessage(reason, 'Failed to delete administrator.'), 'Delete Failed');
    } finally {
      setDeleting(false);
    }
  };

  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of admins ?? []) counts.set(item.adminType, (counts.get(item.adminType) ?? 0) + 1);
    return [...counts.entries()];
  }, [admins]);

  if (!admins) return <Loading />;
  const shown = roleFilter === 'all' ? admins : admins.filter(item => item.adminType === roleFilter);
  const columns = Math.max(1, Math.floor((width + GAP) / (CARD_MIN_WIDTH + GAP)));
  const cardWidth = width > 0 ? (width - GAP * (columns - 1)) / columns : undefined;

  return (
    <>
      <ScrollView style={styles.flex} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <SectionHeader
          icon="admin-panel-settings"
          title="iCampus Administrators"
          subtitle={`${admins.length} ${admins.length === 1 ? 'administrator' : 'administrators'} with portal access`}
          right={
            <View style={styles.headerActions}>
              <IconButton filled size={19} icon="refresh" label="Refresh" onPress={() => void load()} />
              {isSuperAdmin ? <Button compact icon="person-add-alt" title="Add Admin" onPress={() => push({ name: 'adminForm' })} /> : null}
            </View>
          }
        />
        {roleCounts.length > 1 ? (
          <View style={styles.filters}>
            {[['all', admins.length] as [string, number], ...roleCounts].map(([role, count]) => {
              const active = roleFilter === role;
              const tone = role === 'all' ? colors.primary : roleMeta(role, colors).tone;
              return (
                <Pressable
                  key={role}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setRoleFilter(role)}
                  style={({ hovered }: any) => [
                    styles.filter,
                    { borderColor: active ? tone : colors.borderSubtle, backgroundColor: active ? tone + '17' : hovered ? colors.primary + '0A' : colors.backgroundSecondary },
                  ]}
                >
                  <Text style={[styles.filterText, { color: active ? tone : colors.text }]}>
                    {role === 'all' ? 'All roles' : formatLabel(role)}
                  </Text>
                  <Text style={[styles.filterCount, { color: active ? tone : colors.textMuted }]}>{count}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <View onLayout={onLayout} style={styles.grid}>
          {shown.length === 0 ? (
            <View style={styles.flex}>
              <EmptyState icon="admin-panel-settings" title="No administrators" subtitle="No administrator accounts were returned." />
            </View>
          ) : (
            cardWidth ? shown.map(item => (
              <View key={item.uid} style={{ width: cardWidth }}>
                <AdminCard
                  admin={item}
                  isSelf={item.uid === currentAdmin.uid}
                  canManage={isSuperAdmin}
                  onEdit={() => push({ name: 'adminForm', admin: item })}
                  onDelete={() => setSelected(item)}
                />
              </View>
            )) : null
          )}
        </View>
      </ScrollView>
      <ConfirmModal
        visible={Boolean(selected)}
        onClose={() => setSelected(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete Administrator?"
        subtitle={`Are you sure you want to delete ${[selected?.firstname, selected?.lastname].filter(Boolean).join(' ') || `the administrator with UID "${selected?.uid}"`}? This action cannot be undone.`}
        confirmText="Delete"
        loading={deleting}
      />
    </>
  );
}

const ROLE_OPTIONS = [
  { value: 'moderator', label: 'Moderator' },
  { value: 'support', label: 'Support' },
] as const;

export function AdminForm({ admin }: { admin?: AdminUser }) {
  const { admin: currentAdmin } = useSession();
  const { pop } = useNavigation();
  const toast = useToast();
  const styles = useStyles();
  const editing = Boolean(admin);
  const [form, setForm] = useState({
    firstname: admin?.firstname ?? '',
    lastname: admin?.lastname ?? '',
    email: admin?.email ?? '',
    adminType: admin?.adminType ?? 'support',
  });
  const [saving, setSaving] = useState(false);

  if (currentAdmin.adminType !== 'super_admin') {
    return (
      <View style={styles.flex}>
        <PageHeader title="Access Denied" />
        <EmptyState icon="block" title="Access Denied" subtitle="Only Super Admins can manage administrative access." />
      </View>
    );
  }

  const valid =
    form.firstname.trim() && form.lastname.trim() && (editing || isValidEmail(form.email));

  const save = async () => {
    setSaving(true);
    try {
      if (admin) {
        await updateAdmin(admin.uid, { firstname: form.firstname.trim(), lastname: form.lastname.trim(), adminType: form.adminType });
      } else {
        await createAdmin({ ...form, firstname: form.firstname.trim(), lastname: form.lastname.trim(), email: form.email.trim() });
      }
      toast('success', admin ? 'Administrator updated.' : 'Administrator created.', 'Saved');
      pop();
    } catch (reason) {
      toast('error', errorMessage(reason, admin ? 'Failed to update admin' : 'Failed to create admin'), admin ? 'Update Error' : 'Create Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <PageHeader
        title={editing ? 'Edit iCampus Administrator' : 'Create iCampus Administrator'}
        subtitle={editing ? `Managing ${form.firstname}` : 'Add new system admin'}
      />
      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
        <Field label="First Name" value={form.firstname} onChangeText={value => setForm({ ...form, firstname: value })} />
        <Field label="Last Name" value={form.lastname} onChangeText={value => setForm({ ...form, lastname: value })} />
        <Field
          label="Email"
          keyboardType="email-address"
          locked={editing}
          value={form.email}
          onChangeText={value => setForm({ ...form, email: value })}
        />
        <OptionPicker label="Admin Role" value={form.adminType} options={ROLE_OPTIONS} onChange={value => setForm({ ...form, adminType: value })} />
        <Button title={saving ? 'Saving...' : 'Save Changes'} onPress={() => void save()} loading={saving} disabled={!valid} style={styles.submit} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    list: { paddingBottom: 120 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
    filter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
    filterText: { fontSize: 13, fontWeight: '700' },
    filterCount: { fontSize: 12, fontWeight: '800' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    card: {
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.borderSubtle,
      backgroundColor: c.backgroundSecondary,
      shadowColor: c.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    cover: { height: 84, overflow: 'hidden' },
    coverOrb: { position: 'absolute', width: 160, height: 160, borderRadius: 80, left: -40, top: -90 },
    coverIcon: { position: 'absolute', right: 14, top: -6, transform: [{ rotate: '-12deg' }] },
    coverBadge: { position: 'absolute', top: 12, left: 14 },
    body: { paddingHorizontal: 20, marginTop: -38 },
    avatarRing: { alignSelf: 'flex-start', padding: 4, borderRadius: 40, marginBottom: 12 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: c.textDarker },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, minWidth: 0 },
    meta: { flexShrink: 1, fontSize: 13, color: c.textMuted },
    roleRow: { flexDirection: 'row', marginTop: 12, marginBottom: 16 },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: c.borderSubtle,
      backgroundColor: c.surfaceRaised,
    },
    footerLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted },
    footerValue: { flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: c.text },
    presence: { width: 8, height: 8, borderRadius: 4 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    form: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 40 },
    submit: { marginTop: 20 },
  }),
);
