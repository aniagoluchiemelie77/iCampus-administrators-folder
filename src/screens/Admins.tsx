import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { AdminUser, createAdmin, deleteAdmin, getAdmins, updateAdmin } from '../api';
import { errorMessage, useNavigation, useSession, useToast } from '../context';
import { makeStyles } from '../theme';
import {
  Button,
  ConfirmModal,
  EmptyState,
  Field,
  formatDate,
  formatLabel,
  IconButton,
  isValidEmail,
  Loading,
  OptionPicker,
  PageHeader,
  SectionHeader,
  UserAvatar,
  UserIdentity,
} from '../ui';

export function AdminManagement() {
  const { admin: currentAdmin } = useSession();
  const { push } = useNavigation();
  const toast = useToast();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const columns = width >= 1400 ? 3 : width >= 900 ? 2 : 1;
  const [admins, setAdmins] = useState<AdminUser[] | null>(null);
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

  if (!admins) return <Loading />;
  return (
    <>
      <FlatList
        key={columns}
        data={admins}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        keyExtractor={item => item.uid}
        ListHeaderComponent={
          <SectionHeader title="iCampus Administrators" />
        }
        ListEmptyComponent={<EmptyState icon="admin-panel-settings" title="No administrators" subtitle="No administrator accounts were returned." />}
        onRefresh={() => void load()}
        refreshing={false}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <UserAvatar profilePic={item.profilePic} firstName={item.firstname} lastName={item.lastname} size={45} />
              <View style={styles.flex}>
                <UserIdentity firstname={item.firstname} lastname={item.lastname} isVerified={item.isVerified} />
                <Text style={styles.adminType}>{formatLabel(item.adminType ?? '').toUpperCase()}</Text>
                <Text style={styles.lastAccessed}>
                  Last accessed: {formatDate(item.lastAccessed) || 'Never'}
                </Text>
              </View>
            </View>
            {isSuperAdmin ? (
              <View style={styles.actions}>
                <IconButton icon="edit" label={`Edit ${item.firstname ?? 'administrator'}`} onPress={() => push({ name: 'adminForm', admin: item })} />
                {item.uid !== currentAdmin.uid ? (
                  <IconButton icon="delete" label={`Delete ${item.firstname ?? 'administrator'}`} onPress={() => setSelected(item)} />
                ) : null}
              </View>
            ) : null}
          </View>
        )}
        contentContainerStyle={styles.list}
      />
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
    flex: { flex: 1 },
    list: { paddingBottom: 110 },
    columns: { gap: 12 },
    card: { flex: 1, padding: 15, borderRadius: 15, marginBottom: 15, backgroundColor: c.backgroundSecondary },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    adminType: { fontSize: 14, fontWeight: '600', marginVertical: 5, color: c.text },
    lastAccessed: { fontSize: 11, color: c.text },
    actions: { flexDirection: 'row', alignItems: 'center' },
    form: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 40 },
    submit: { marginTop: 20 },
  }),
);
