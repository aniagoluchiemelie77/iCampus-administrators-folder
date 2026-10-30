import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { AdminUser, createAdmin, updateAdmin } from '../api';
import { errorMessage, normalizeRole, useNavigation, useSession, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { Colors, makeStyles, useColors } from '../theme';
import {
  Button,
  EmptyState,
  Field,
  formatDate,
  formatLabel,
  fromNow,
  IconButton,
  isValidEmail,
  OptionPicker,
  PageHeader,
  parseDate,
  Pill,
  ScrollPage,
  UserAvatar,
} from '../ui';

const ROLE_META: Record<string, { icon: IconName; tone: (c: Colors) => string }> = {
  super_admin: { icon: 'shield', tone: c => c.primary },
  finance: { icon: 'payments', tone: c => c.success },
  support: { icon: 'support-agent', tone: c => c.info },
  moderator: { icon: 'gavel', tone: () => '#8e5cd9' },
  analyst: { icon: 'analytics', tone: () => '#0f9fa3' },
  social_media: { icon: 'share', tone: () => '#d94c8a' },
  school_admin_a: { icon: 'account-balance', tone: c => c.pendingDelivery },
  school_admin_b: { icon: 'apartment', tone: c => c.info },
};

const ROLE_LABELS: Record<string, string> = {
  school_admin_a: 'Institution Rep (A)',
  school_admin_b: 'Department Rep (B)',
};

export const roleMeta = (role: string | undefined, colors: Colors) => {
  const key = normalizeRole(role);
  const meta = ROLE_META[key] ?? { icon: 'person' as IconName, tone: (c: Colors) => c.textMuted };
  return { icon: meta.icon, tone: meta.tone(colors), label: ROLE_LABELS[key] ?? formatLabel(key || 'administrator') };
};

export const fullName = (admin: AdminUser) => [admin.firstname, admin.lastname].filter(Boolean).join(' ') || 'Administrator';

export function AdminCard({
  admin,
  isSelf,
  canManage,
  onEdit,
  onDelete,
  onOpen,
}: {
  admin: AdminUser;
  isSelf: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** Opens the admin's detail screen. */
  onOpen?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const role = roleMeta(admin.adminType, colors);
  const lastSeen = parseDate(admin.lastAccessed);
  const lift = useRef(new Animated.Value(0)).current;
  const hover = (toValue: number) => Animated.timing(lift, { toValue, duration: 180, useNativeDriver: true }).start();

  return (
    <Pressable onHoverIn={() => hover(1)} onHoverOut={() => hover(0)} onPress={onOpen} accessible={false}>
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

// Super admins create every admin type except department reps (B), whom
// each school's institution rep adds from their own Access Control tab.
const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'finance', label: 'Finance' },
  { value: 'support', label: 'Support' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'school_admin_a', label: 'School Institution Rep (A)' },
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
    adminType: normalizeRole(admin?.adminType) || 'support',
    schoolCode: String(admin?.schoolCode ?? ''),
  });
  const schoolRep = form.adminType === 'school_admin_a' || form.adminType === 'school_admin_b';
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
    form.firstname.trim() && form.lastname.trim() && (editing || isValidEmail(form.email)) && (editing || !schoolRep || form.schoolCode.trim());

  const save = async () => {
    setSaving(true);
    try {
      if (admin) {
        await updateAdmin(admin.uid, { firstname: form.firstname.trim(), lastname: form.lastname.trim(), adminType: form.adminType });
      } else {
        await createAdmin({
          firstname: form.firstname.trim(),
          lastname: form.lastname.trim(),
          email: form.email.trim(),
          adminType: form.adminType,
          ...(schoolRep ? { schoolCode: form.schoolCode.trim() } : {}),
        });
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
      <ScrollPage contentContainerStyle={styles.form}>
        <Field label="First Name" value={form.firstname} onChangeText={value => setForm({ ...form, firstname: value })} />
        <Field label="Last Name" value={form.lastname} onChangeText={value => setForm({ ...form, lastname: value })} />
        <Field
          label="Email"
          keyboardType="email-address"
          locked={editing}
          value={form.email}
          onChangeText={value => setForm({ ...form, email: value })}
        />
        {editing && schoolRep ? (
          <Text style={styles.formNote}>School representatives keep their level; their institution rep manages department reps.</Text>
        ) : (
          <OptionPicker
            label="Admin Role"
            value={form.adminType as (typeof ROLE_OPTIONS)[number]['value']}
            options={editing ? ROLE_OPTIONS.filter(option => option.value !== 'school_admin_a') : ROLE_OPTIONS}
            onChange={value => setForm({ ...form, adminType: value })}
            hint={schoolRep ? "The school's first representative, created when the contract is signed. They add the rest from their own Access Control tab." : undefined}
          />
        )}
        {schoolRep && !editing ? (
          <Field
            label="School code"
            value={form.schoolCode}
            onChangeText={value => setForm({ ...form, schoolCode: value })}
            placeholder="The institution's ID from the Institutions tab"
          />
        ) : null}
        <Button title={saving ? 'Saving...' : 'Save Changes'} onPress={() => void save()} loading={saving} disabled={!valid} style={styles.submit} />
      </ScrollPage>
    </View>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
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
    formNote: { fontSize: 13, color: c.textMuted, marginBottom: 16, lineHeight: 19 },
    submit: { marginTop: 20 },
  }),
);
