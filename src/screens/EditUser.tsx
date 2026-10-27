import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { updateUser } from '../api';
import { errorMessage, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { useColors } from '../theme';
import { Button, Field, formatDate, formatLabel, Sheet, ToggleRow } from '../ui';

type User = Record<string, any>;

// Same fields and rules as the iCampus "Edit User Context" modal: tier,
// headline, bio, country and pending payout are shown read-only, and only
// fields the user actually has are listed.
const TEXT_FIELDS: Array<{ key: string; label: string; locked?: boolean }> = [
  { key: 'firstname', label: 'First Name' },
  { key: 'lastname', label: 'Last Name' },
  { key: 'username', label: 'Username' },
  { key: 'organizationName', label: 'Organization Name' },
  { key: 'tier', label: 'User Tier', locked: true },
  { key: 'staffId', label: 'Staff Id' },
  { key: 'matricNumber', label: 'Matriculation Number' },
  { key: 'department', label: 'Department' },
  { key: 'schoolName', label: 'School Name' },
  { key: 'website', label: 'Website' },
  { key: 'email', label: 'Email' },
  { key: 'headline', label: 'Headline', locked: true },
  { key: 'bio', label: 'Bio', locked: true },
  { key: 'country', label: 'Country', locked: true },
  { key: 'current_level', label: 'User Current Level' },
  { key: 'pendingSalesBalance', label: 'Pending Payout Balance', locked: true },
];

const initialForm = (user: User) => ({
  firstname: user.firstname || '',
  lastname: user.lastname || '',
  username: user.username || '',
  email: user.email || '',
  bio: user.bio || '',
  pendingSalesBalance: user.pendingSalesBalance || 0,
  tier: user.tier || 'free',
  website: user.website || '',
  headline: user.headline || '',
  department: user.department || '',
  organizationName: user.organizationName || '',
  staffId: user.staffId || '',
  matricNumber: user.matricNumber || '',
  schoolName: user.schoolName || '',
  country: user.country || '',
  current_level: user.current_level || '',
  isSuspended: user.isSuspended || false,
  twoFactorEnabled: user.twoFactorEnabled || false,
});

function InfoList({
  title,
  icon,
  items,
  empty,
  render,
}: {
  title: string;
  icon: IconName;
  items: unknown;
  empty: string;
  render: (item: any) => [string, string, boolean?];
}) {
  const colors = useColors();
  const list = Array.isArray(items) ? items : [];
  return (
    <View style={[styles.infoList, { borderColor: colors.border }]}>
      <View style={styles.infoHead}>
        <Icon name={icon} size={18} color={colors.primary} />
        <Text style={[styles.infoTitle, { color: colors.textDarker }]}>{title}</Text>
      </View>
      {list.length === 0 ? <Text style={[styles.infoEmpty, { color: colors.text }]}>{empty}</Text> : null}
      {list.map((item, index) => {
        const [left, right, ok] = render(item);
        return (
          <View key={index} style={styles.infoRow}>
            <Text style={[styles.infoText, { color: colors.text }]}>{left}</Text>
            <Text style={[styles.infoMeta, { color: ok ? colors.success : colors.text }]}>{right}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function EditUserSheet({
  user,
  onClose,
  onUpdated,
}: {
  user: User | null;
  onClose: () => void;
  onUpdated: (user: User) => void;
}) {
  const colors = useColors();
  const toast = useToast();
  const initial = useMemo(() => (user ? initialForm(user) : null), [user]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(initial), [initial]);

  const hasChanges = useMemo(
    () => Boolean(form && initial && (Object.keys(initial) as Array<keyof typeof initial>).some(key => form[key] !== initial[key])),
    [form, initial],
  );

  const save = async () => {
    if (!user || !form) return;
    setSaving(true);
    try {
      const result = await updateUser(user.uid, form);
      toast('success', 'User context updated successfully.', 'Saved');
      onUpdated({ ...user, ...form, ...(result?.user ?? {}) });
    } catch (reason) {
      toast('error', errorMessage(reason, 'Could not update user details.'), 'Update Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={Boolean(user && form)} onClose={onClose}>
      {user && form ? (
        <>
          <Text style={[styles.title, { color: colors.textDarker }]}>Edit User Context</Text>
          <View style={styles.grid}>
            {TEXT_FIELDS.filter(field => Boolean(initial?.[field.key as keyof typeof form])).map(field => (
              <Field
                key={field.key}
                label={field.label}
                locked={field.locked}
                style={styles.gridField}
                value={String(form[field.key as keyof typeof form] ?? '')}
                onChangeText={value => setForm({ ...form, [field.key]: value })}
              />
            ))}
          </View>
          <ToggleRow
            label="Toggle Account Suspension"
            value={Boolean(form.isSuspended)}
            onChange={value => setForm({ ...form, isSuspended: value })}
          />
          <ToggleRow label="Two Factor Authentication" value={Boolean(form.twoFactorEnabled)} />
          <InfoList
            title="Suspicious Activities"
            icon="warning"
            items={user.suspiciousActivity}
            empty="No suspicious activity recorded."
            render={item => [formatLabel(String(item.type ?? 'activity')), formatDate(item.timestamp, true)]}
          />
          <InfoList
            title="Recovery Emails"
            icon="security"
            items={user.recoveryEmails}
            empty="No recovery emails set."
            render={item => [item.email, item.isVerified ? 'Verified' : 'Pending', item.isVerified]}
          />
          <InfoList
            title="Phone Numbers"
            icon="security"
            items={user.phoneNumbers}
            empty="No phone numbers set."
            render={item => [item.number, item.isVerified ? 'Verified' : 'Pending', item.isVerified]}
          />
          <Button title="Save Changes" onPress={() => void save()} loading={saving} disabled={!hasChanges} style={styles.save} />
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  gridField: { flexGrow: 1, flexBasis: 240 },
  infoList: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  infoTitle: { fontSize: 14, fontWeight: '700' },
  infoEmpty: { fontSize: 13, opacity: 0.75 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: 10 },
  infoText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  infoMeta: { fontSize: 12 },
  save: { marginVertical: 20 },
});
