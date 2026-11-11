import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdCard, AdItem, displayDomain } from '../AdBanner';
import {
  deleteAd,
  deleteInstitution,
  deleteStation,
  getAds,
  getInstitutions,
  getSchoolDetails,
  getStations,
  getTaxEntries,
  LIST_PAGE_SIZE,
  requestTaxReport,
  saveAd,
  saveInstitution,
  saveStation,
} from '../api';
import { BarChart, MeterRow, useMeasuredWidth } from '../charts';
import { errorMessage, isSchoolAdminA, useNavigation, useSession, useToast } from '../context';
import { Icon } from '../icons';
import { makeStyles, useColors } from '../theme';
import {
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  Field,
  formatCount,
  formatDate,
  formatLabel,
  formatMoney,
  fromNow,
  IconButton,
  Loading,
  OptionPicker,
  PageHeader,
  Pill,
  ScrollPage,
  SectionHeader,
  Sheet,
  ToggleRow,
  UserAvatar,
} from '../ui';
import { TaxEntryRow } from './Overview';

type Item = Record<string, any>;

/** Page-numbered list that advances only after a successful fetch. */
const usePagedList = (fetchPage: (page: number) => Promise<Item[]>, pageSize = LIST_PAGE_SIZE) => {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const page = useRef(0);
  const hasMore = useRef(true);
  const inFlight = useRef(false);

  const load = useCallback(
    async (pageNumber: number) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (pageNumber === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const data = await fetchPage(pageNumber);
        setItems(previous => (pageNumber === 1 ? data : [...previous, ...data]));
        page.current = pageNumber;
        hasMore.current = data.length === pageSize;
      } catch (reason) {
        toast('error', errorMessage(reason), 'Fetch Error');
      } finally {
        inFlight.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [fetchPage, pageSize, toast],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  return {
    items,
    loading,
    loadingMore,
    refresh: () => load(1),
    loadMore: () => hasMore.current && load(page.current + 1),
  };
};

/** Delete with the iCampus confirmation modal, then refresh the list. */
const useDeletion = (remove: (item: Item) => Promise<unknown>, onDone: () => void, successMessage: string) => {
  const toast = useToast();
  const [target, setTarget] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const confirm = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await remove(target);
      toast('success', successMessage, 'Success');
      setTarget(null);
      onDone();
    } catch (reason) {
      toast('error', errorMessage(reason), 'Deletion Failed');
    } finally {
      setDeleting(false);
    }
  };
  return { target, setTarget, deleting, confirm };
};

function PagedList({
  title,
  addLabel,
  onAdd,
  list,
  renderItem,
  emptyIcon,
  emptyTitle,
}: {
  title: string;
  addLabel?: string;
  onAdd?: () => void;
  list: ReturnType<typeof usePagedList>;
  renderItem: (item: Item) => React.ReactElement;
  emptyIcon: React.ComponentProps<typeof EmptyState>['icon'];
  emptyTitle: string;
}) {
  const styles = useStyles();
  if (list.loading) return <Loading />;
  return (
    <FlatList
      data={list.items}
      keyExtractor={(item, index) => String(item.id ?? item._id ?? index)}
      renderItem={({ item }) => renderItem(item)}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <SectionHeader title={title} />
          {onAdd && addLabel ? <Button compact icon="add" title={addLabel} onPress={onAdd} /> : null}
        </View>
      }
      ListEmptyComponent={<EmptyState icon={emptyIcon} title={emptyTitle} />}
      onEndReached={() => void list.loadMore()}
      onEndReachedThreshold={0.5}
      onRefresh={() => void list.refresh()}
      refreshing={false}
      ListFooterComponent={list.loadingMore ? <ActivityIndicator style={styles.footer} /> : undefined}
      contentContainerStyle={styles.list}
    />
  );
}

function ItemActions({ onEdit, onDelete, name }: { onEdit: () => void; onDelete: () => void; name: string }) {
  const styles = useStyles();
  return (
    <View style={styles.actions}>
      <IconButton icon="edit" label={`Edit ${name}`} onPress={onEdit} />
      <IconButton icon="delete" label={`Delete ${name}`} onPress={onDelete} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Institutions
// ---------------------------------------------------------------------------

const BILLING_STATUS: Record<string, { label: string; tone: 'success' | 'pendingDelivery' | 'criticalSeverity' | 'textMuted' }> = {
  active: { label: 'PAID UP', tone: 'success' },
  due_soon: { label: 'DUE SOON', tone: 'pendingDelivery' },
  overdue: { label: 'OVERDUE', tone: 'criticalSeverity' },
  not_set: { label: 'NO BILLING', tone: 'textMuted' },
};

/** Delete an institution behind the confirmation modal; `onDeleted` runs after success. */
function useInstitutionDeletion(onDeleted: () => void) {
  return useDeletion(item => deleteInstitution(String(item.id || item.schoolCode)), onDeleted, 'Institution deleted successfully.');
}

function DeleteInstitutionModal({ deletion }: { deletion: ReturnType<typeof useInstitutionDeletion> }) {
  const name = deletion.target?.schoolName ?? deletion.target?.name ?? '';
  return (
    <ConfirmModal
      visible={Boolean(deletion.target)}
      onClose={() => deletion.setTarget(null)}
      onConfirm={() => void deletion.confirm()}
      title="Delete Institution?"
      subtitle={`Are you sure you want to delete "${name}"? Its students, lecturers and representatives lose institutional access. This action cannot be undone.`}
      confirmText="Delete"
      loading={deletion.deleting}
    />
  );
}

export function InstitutionsList() {
  const { admin } = useSession();
  const { push } = useNavigation();
  const colors = useColors();
  const styles = useStyles();
  const list = usePagedList(getInstitutions);
  const deletion = useInstitutionDeletion(() => void list.refresh());
  const isSuperAdmin = admin.adminType === 'super_admin';
  const view = (item: Item) => push({ name: 'institutionDetail', id: String(item.id || item.schoolCode) });

  return (
    <>
      <PagedList
        title="iCampus Authorized Institutions"
        addLabel={isSuperAdmin ? 'Add School' : undefined}
        onAdd={isSuperAdmin ? () => push({ name: 'institutionForm' }) : undefined}
        list={list}
        emptyIcon="account-balance"
        emptyTitle="No authorized institutions yet"
        renderItem={item => {
          const tier = formatLabel(String(item.tier || 'basic'));
          return (
            <View style={styles.institutionCard}>
              <Pressable style={styles.institutionMain} onPress={() => view(item)} accessibilityRole="button" accessibilityLabel={`View ${item.schoolName || 'institution'}`}>
                {item.logo ? <Image source={{ uri: item.logo }} style={styles.logo} /> : <View style={[styles.logo, styles.logoPlaceholder]} />}
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <Text numberOfLines={1} style={styles.name}>{item.schoolName || item.name}</Text>
                    <Pill label={tier.toUpperCase()} color={colors.primary} />
                  </View>
                  <Text numberOfLines={1} style={styles.meta}>
                    {item.contactEmail || 'No contact email'} · Joined {formatDate(item.createdAt) || 'N/A'}
                  </Text>
                  {item.billing?.nextPaymentDue ? (
                    <Text style={styles.meta}>Plan renews {formatDate(item.billing.nextPaymentDue)}</Text>
                  ) : null}
                </View>
              </Pressable>
              <View style={styles.institutionActions}>
                <Button compact variant="soft" icon="visibility" title="View" onPress={() => view(item)} />
                {isSuperAdmin ? (
                  <>
                    <Button compact variant="outline" icon="edit" title="Edit" onPress={() => push({ name: 'institutionForm', item })} />
                    <IconButton
                      filled
                      size={19}
                      icon="delete-outline"
                      color={colors.criticalSeverity}
                      label={`Delete ${item.schoolName || 'institution'}`}
                      onPress={() => deletion.setTarget(item)}
                    />
                  </>
                ) : null}
              </View>
            </View>
          );
        }}
      />
      <DeleteInstitutionModal deletion={deletion} />
    </>
  );
}

const fullName = (person: Record<string, any>) =>
  [person.firstname, person.lastname].filter(Boolean).join(' ') || person.email || 'Unnamed representative';
const seatText = (seat?: { used: number; limit: number | null }) =>
  seat ? `${seat.used} of ${seat.limit ?? 'unlimited'}` : '—';
const levelText = (level: string) => (/^\d+$/.test(level) ? `${level}L` : level);

function RepRow({ rep, nested = false }: { rep: Record<string, any>; nested?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.repRow, nested && styles.repNested]}>
      <UserAvatar profilePic={rep.profilePic} firstName={rep.firstname} lastName={rep.lastname} size={nested ? 32 : 40} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={styles.repName}>{fullName(rep)}</Text>
        <Text numberOfLines={1} style={styles.meta}>
          {rep.email}
          {nested ? ` · ${rep.department || 'No department'}` : ''}
        </Text>
      </View>
      <Text style={styles.meta}>{rep.lastAccessed ? `Seen ${fromNow(rep.lastAccessed)}` : 'Never signed in'}</Text>
    </View>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.detailStat}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
      {sub ? <Text style={styles.meta}>{sub}</Text> : null}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.infoRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function InstitutionDetail({ id }: { id: string }) {
  const styles = useStyles();
  const colors = useColors();
  const toast = useToast();
  const { admin } = useSession();
  const { push, pop } = useNavigation();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const deletion = useInstitutionDeletion(pop);
  const isSuperAdmin = admin.adminType === 'super_admin';

  const load = useCallback(() => {
    setLoading(true);
    getSchoolDetails(id)
      .then(result => setData(result.data && !Array.isArray(result.data) ? result.data : result))
      .catch(reason => toast('error', errorMessage(reason), 'Fetch Error'))
      .finally(() => setLoading(false));
  }, [id, toast]);
  useEffect(load, [load]);

  if (loading && !data) return <Loading label="Loading institution..." />;
  if (!data) {
    return (
      <View style={styles.flex}>
        <PageHeader title="Institution" />
        <EmptyState icon="error-outline" title="Institution details unavailable" buttonText="Try again" buttonIcon="refresh" onPress={load} />
      </View>
    );
  }

  const billing = data.billing || {};
  const status = BILLING_STATUS[billing.status] ?? BILLING_STATUS.not_set;
  const students = data.students || {};
  const lecturers = data.lecturers || {};
  const repsA: Item[] = data.reps?.a ?? [];
  const unassignedB: Item[] = data.reps?.unassignedB ?? [];
  const byDepartment: Item[] = data.byDepartment ?? [];
  const byLevel: Item[] = data.byLevel ?? [];
  const editItem = { ...data, id: data.id || id };
  const daysLeft =
    billing.daysLeft == null ? '' : billing.daysLeft < 0 ? ` · ${Math.abs(billing.daysLeft)} days overdue` : ` · ${billing.daysLeft} days left`;

  return (
    <View style={styles.flex}>
      <PageHeader
        title={data.schoolName || 'Institution'}
        subtitle={`${data.schoolCode || id} · ${data.tierLabel || formatLabel(data.tier || 'basic')} plan`}
        right={
          isSuperAdmin ? (
            <View style={styles.headerActions}>
              <IconButton filled size={19} icon="edit" label="Edit institution" onPress={() => push({ name: 'institutionForm', item: editItem })} />
              <IconButton filled size={19} icon="delete-outline" color={colors.criticalSeverity} label="Delete institution" onPress={() => deletion.setTarget(editItem)} />
            </View>
          ) : undefined
        }
      />
      <ScrollPage contentContainerStyle={styles.detailPage}>
        <View style={styles.detailHero}>
          {data.logo ? <Image source={{ uri: data.logo }} style={styles.heroLogo} /> : <View style={[styles.heroLogo, styles.logoPlaceholder]} />}
          <View style={styles.flex}>
            <Text style={styles.heroName}>{data.schoolName}</Text>
            <Text style={styles.meta}>{data.contactEmail || 'No contact email'}</Text>
            <View style={styles.pillRow}>
              <Pill label={(data.tierLabel || 'Basic').toUpperCase()} icon="workspace-premium" color={colors.primary} />
              <Pill label={data.isOperational ? 'OPERATIONAL' : 'NOT OPERATIONAL'} icon={data.isOperational ? 'check-circle' : 'pause-circle'} color={data.isOperational ? colors.success : colors.textMuted} />
              <Pill label={status.label} icon="receipt-long" color={colors[status.tone]} />
            </View>
          </View>
          <IconButton filled size={19} icon="refresh" label="Refresh" onPress={load} />
        </View>

        <Card>
          <SectionHeader icon="groups" title="People" subtitle="Active = verified, not suspended and (students) not graduated" />
          <View style={styles.detailGrid}>
            <Stat label="Active students" value={formatCount(students.active ?? 0)} sub={`${formatCount(students.total ?? 0)} enrolled`} />
            <Stat label="Active lecturers" value={formatCount(lecturers.active ?? 0)} sub={`${formatCount(lecturers.total ?? 0)} enrolled`} />
            <Stat label="Unverified accounts" value={formatCount((students.unverified ?? 0) + (lecturers.unverified ?? 0))} />
            <Stat label="Suspended accounts" value={formatCount((students.suspended ?? 0) + (lecturers.suspended ?? 0))} />
            <Stat label="Alumni" value={formatCount(students.alumni ?? 0)} />
            <Stat label="Joined in last 30 days" value={formatCount(data.joinedLast30Days ?? 0)} />
            <Stat label="Courses this session" value={formatCount(data.courses?.thisSession ?? 0)} sub={data.courses?.session ? `${data.courses.session} · ${formatCount(data.courses.total)} all-time` : undefined} />
            <Stat label="Departments" value={formatCount(byDepartment.length)} />
          </View>
        </Card>

        <View style={styles.detailColumns}>
          <Card style={styles.detailColumn}>
            <SectionHeader icon="receipt-long" title="Plan & billing" />
            <InfoRow label="Tier" value={`${data.tierLabel || formatLabel(data.tier || 'basic')}${data.tierUpdatedAt ? ` · since ${formatDate(data.tierUpdatedAt)}` : ''}`} />
            <InfoRow label="Subscription fee" value={billing.amount ? `${formatMoney(billing.amount, billing.currency)}${billing.cycle ? ` / ${billing.cycle}` : ''}` : 'Not set'} />
            <InfoRow label="Payment expires" value={billing.nextPaymentDue ? `${formatDate(billing.nextPaymentDue)}${daysLeft}` : 'Not set'} />
            <InfoRow label="Last payment" value={formatDate(billing.lastPaidAt) || '—'} />
            {billing.note ? <InfoRow label="Billing note" value={billing.note} /> : null}
            <Text style={[styles.subTitle, styles.gapTop]}>Representative seats</Text>
            <MeterRow label="Institution reps (A)" value={data.seats?.a?.used ?? 0} max={data.seats?.a?.limit ?? Math.max(1, data.seats?.a?.used ?? 1)} unit={` · ${seatText(data.seats?.a)}`} color={colors.pendingDelivery} />
            <MeterRow label="Department reps (B)" value={data.seats?.b?.used ?? 0} max={data.seats?.b?.limit ?? Math.max(1, data.seats?.b?.used ?? 1)} unit={` · ${seatText(data.seats?.b)}`} color={colors.info} />
          </Card>
          <Card style={styles.detailColumn}>
            <SectionHeader icon="settings" title="Configuration" />
            <InfoRow label="School code" value={data.schoolCode || id} />
            <InfoRow label="Country" value={data.countryCode || '—'} />
            <InfoRow label="Verification" value={data.verificationMethod ? formatLabel(String(data.verificationMethod)) : '—'} />
            <InfoRow label="Email domains" value={(data.domainWhitelist || []).join(', ') || 'None'} />
            <InfoRow label="Date joined" value={formatDate(data.createdAt) || '—'} />
            <InfoRow label="Last updated" value={formatDate(data.updatedAt, true) || '—'} />
          </Card>
        </View>

        <Card>
          <SectionHeader icon="admin-panel-settings" title="Representatives" subtitle={`${repsA.length} institution · ${data.reps?.b?.length ?? 0} department`} />
          {repsA.length === 0 ? <Text style={styles.meta}>No institution representative yet.</Text> : null}
          {repsA.map(rep => (
            <View key={rep.uid} style={styles.repGroup}>
              <RepRow rep={rep} />
              <Text style={styles.repCaption}>
                {rep.departmentReps?.length ? `Department reps added (${rep.departmentReps.length})` : 'No department reps added yet'}
              </Text>
              {(rep.departmentReps ?? []).map((b: Item) => (
                <RepRow key={b.uid} rep={b} nested />
              ))}
            </View>
          ))}
          {unassignedB.length > 0 ? (
            <View style={styles.repGroup}>
              <Text style={styles.repCaption}>Department reps added by iCampus staff ({unassignedB.length})</Text>
              {unassignedB.map(b => (
                <RepRow key={b.uid} rep={b} nested />
              ))}
            </View>
          ) : null}
        </Card>

        {byDepartment.length > 0 ? (
          <View style={styles.detailColumns}>
            <Card style={styles.detailColumn}>
              <SectionHeader icon="account-tree" title="By department" subtitle="Students (active) and lecturers" />
              {byDepartment.map(d => (
                <MeterRow
                  key={d.department}
                  label={d.department}
                  value={d.students}
                  max={byDepartment[0].students || 1}
                  unit=" students"
                  color={colors.series1}
                  sub={`${formatCount(d.activeStudents)} active · ${formatCount(d.lecturers)} lecturers`}
                />
              ))}
            </Card>
            {byLevel.length > 0 ? (
              <Card style={styles.detailColumn}>
                <SectionHeader icon="stairs" title="Students by level" subtitle="Current students (alumni excluded)" />
                <BarChart color={colors.series3} data={byLevel.map(l => ({ label: levelText(l.level), value: l.students }))} />
              </Card>
            ) : null}
          </View>
        ) : null}

        <Card>
          <SectionHeader icon="history" title="Recent activity" subtitle="Last 25 actions by this school's representatives" />
          {(data.activity || []).length ? (
            data.activity.map((entry: Item) => (
              <View key={entry.id} style={styles.detailListRow}>
                <Text style={styles.detailActivityTitle}>
                  {entry.actorName || 'Administrator'} · {formatLabel(entry.action || '')}
                </Text>
                <Text style={styles.meta}>{formatDate(entry.createdAt, true)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.meta}>No recorded activity.</Text>
          )}
        </Card>
      </ScrollPage>
      <DeleteInstitutionModal deletion={deletion} />
    </View>
  );
}

type Tier = 'basic' | 'pro' | 'enterprise';
type VerificationMethod = 'SSO' | 'EXTERNAL_API' | 'SEEDED_DATABASE' | 'EMAIL_ONLY';

const PLAN_INFO: Record<Tier, { label: string; summary: string }> = {
  basic: {
    label: 'Basic',
    summary: 'Monthly enrolment & class trends, live lectures, attendance overview, announcements. 1 institution rep + 10 department reps.',
  },
  pro: {
    label: 'Professional (Pro)',
    summary: '+ Tests & exam proctoring, LMS activity, attendance by department/course, lecturer activity. 1 institution rep + 20 department reps.',
  },
  enterprise: {
    label: 'Enterprise',
    summary:
      '+ At-risk students, department comparison, engagement trends, lecture heatmap, integrity breakdown, dedicated support. Up to 5 institution reps, unlimited department reps.',
  },
};

const VERIFICATION_OPTIONS = [
  { value: 'EMAIL_ONLY', label: 'Email Only' },
  { value: 'SSO', label: 'SSO' },
  { value: 'EXTERNAL_API', label: 'External API' },
  { value: 'SEEDED_DATABASE', label: 'Seeded Database' },
] as const;

const emptyInstitution = {
  id: '',
  name: '',
  contactEmail: '',
  countryCode: 'NG',
  domainWhitelist: [] as string[],
  isOperational: false,
  verificationMethod: 'EMAIL_ONLY' as VerificationMethod,
  tier: 'basic' as Tier,
  logo: '',
  ssoConfig: { provider: 'OIDC' as 'OIDC' | 'SAML', issuerUrl: '', clientId: '', clientSecret: '' },
  externalApiConfig: { endpoint: '', sharedSecret: '', timeoutMs: 5000 },
};

/** Drops null/undefined so stored partial configs don't blank the form defaults. */
const defined = (value?: Record<string, any> | null) =>
  Object.fromEntries(Object.entries(value || {}).filter(([, v]) => v !== undefined && v !== null));

// Institutions arrive keyed as stored (`schoolName`); the details endpoint adds
// the config fields. Map both onto the form so editing doesn't start from blanks.
const toInstitutionForm = (item?: Item): typeof emptyInstitution =>
  item
    ? {
        ...emptyInstitution,
        id: String(item.id || item.schoolCode || ''),
        name: item.name || item.schoolName || '',
        contactEmail: item.contactEmail || '',
        countryCode: item.countryCode || emptyInstitution.countryCode,
        logo: item.logo || '',
        isOperational: item.isOperational === true,
        verificationMethod: (item.verificationMethod || emptyInstitution.verificationMethod) as VerificationMethod,
        domainWhitelist: Array.isArray(item.domainWhitelist) ? item.domainWhitelist : [],
        tier: (({ free: 'basic', professional: 'pro', premium: 'enterprise' } as Record<string, Tier>)[item.tier] ?? (['basic', 'pro', 'enterprise'].includes(item.tier) ? item.tier : 'basic')) as Tier,
        ssoConfig: { ...emptyInstitution.ssoConfig, ...defined(item.ssoConfig) },
        externalApiConfig: { ...emptyInstitution.externalApiConfig, ...defined(item.externalApiConfig) },
      }
    : emptyInstitution;

/** Secrets are never sent back by the server, so a blank one means "keep the stored value". */
const withoutBlankSecrets = (form: typeof emptyInstitution) => {
  const { clientSecret, ...sso } = form.ssoConfig;
  const { sharedSecret, ...api } = form.externalApiConfig;
  return {
    ...form,
    ssoConfig: clientSecret ? { ...sso, clientSecret } : sso,
    externalApiConfig: sharedSecret ? { ...api, sharedSecret } : api,
  };
};

/** Shared save flow for the create/edit forms: no-change guard, toast, go back. */
const useSaveForm = <T,>(original: T, editing: boolean, save: (form: T) => Promise<unknown>) => {
  const toast = useToast();
  const { pop } = useNavigation();
  const [saving, setSaving] = useState(false);
  const submit = async (form: T) => {
    if (editing && JSON.stringify(form) === JSON.stringify(original)) {
      toast('info', "You haven't modified any fields.", 'No Changes');
      return;
    }
    setSaving(true);
    try {
      await save(form);
      toast('success', 'Saved successfully.', 'Success');
      pop();
    } catch (reason) {
      toast('error', errorMessage(reason, 'Failed to save.'), 'Error');
    } finally {
      setSaving(false);
    }
  };
  return { saving, submit };
};

/**
 * Create or edit an institution. Editing first loads the full details, since
 * list rows don't carry the verification settings, operational flag or
 * domains, and saving blanks over them would switch a live school off.
 */
export function InstitutionForm({ item }: { item?: Item }) {
  const toast = useToast();
  const { pop } = useNavigation();
  const id = item ? String(item.id || item.schoolCode || '') : '';
  const hasConfig = Boolean(item && 'isOperational' in item && 'verificationMethod' in item);
  const [loaded, setLoaded] = useState<Item | null>(!item || hasConfig ? item ?? null : null);

  useEffect(() => {
    if (!item || hasConfig) return;
    getSchoolDetails(id)
      .then(details => setLoaded({ ...item, ...details, id }))
      .catch(reason => {
        toast('error', errorMessage(reason, "Couldn't load this institution's settings."), 'Fetch Error');
        pop();
      });
  }, [hasConfig, id, item, pop, toast]);

  if (item && !loaded) return <Loading label="Loading institution settings..." />;
  return <InstitutionFormBody item={loaded ?? undefined} />;
}

function InstitutionFormBody({ item }: { item?: Item }) {
  const styles = useStyles();
  const [original] = useState(() => toInstitutionForm(item));
  const [form, setForm] = useState(original);
  const [domains, setDomains] = useState(original.domainWhitelist.join(', '));
  const { saving, submit } = useSaveForm(original, Boolean(item), next =>
    saveInstitution(withoutBlankSecrets(next), item ? String(next.id) : undefined),
  );
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(previous => ({ ...previous, [key]: value }));

  return (
    <View style={styles.flex}>
      <PageHeader title={item ? 'Manage Authorized Institution' : 'Create Authorized Institution'} />
      <ScrollPage contentContainerStyle={styles.form}>
        <Text style={styles.groupTitle}>General Information</Text>
        <Field label="School Name" value={form.name} onChangeText={value => update('name', value)} />
        <Field label="Country Code" value={form.countryCode} onChangeText={value => update('countryCode', value.toUpperCase())} />
        <Field label="Contact Email" keyboardType="email-address" value={form.contactEmail} onChangeText={value => update('contactEmail', value)} />
        <Field label="Logo" keyboardType="url" placeholder="https://" value={form.logo} onChangeText={value => update('logo', value)} />
        <Field
          label="Domain Whitelist (comma separated)"
          value={domains}
          onChangeText={value => {
            setDomains(value);
            update('domainWhitelist', value.split(',').map(domain => domain.trim()).filter(Boolean));
          }}
        />
        <OptionPicker
          label="Analytics plan"
          hint={PLAN_INFO[form.tier].summary}
          value={form.tier}
          options={(Object.keys(PLAN_INFO) as Tier[]).map(tier => ({ value: tier, label: PLAN_INFO[tier].label }))}
          onChange={value => update('tier', value)}
        />
        <ToggleRow label="Is Operational" value={form.isOperational} onChange={value => update('isOperational', value)} />

        <Text style={styles.groupTitle}>Verification Settings</Text>
        <OptionPicker
          value={form.verificationMethod}
          options={VERIFICATION_OPTIONS}
          onChange={value => update('verificationMethod', value)}
        />
        {form.verificationMethod === 'SSO' ? (
          <>
            <OptionPicker
              label="SSO Provider"
              value={form.ssoConfig.provider}
              options={[
                { value: 'OIDC', label: 'OIDC' },
                { value: 'SAML', label: 'SAML' },
              ]}
              onChange={value => update('ssoConfig', { ...form.ssoConfig, provider: value })}
            />
            <Field label="Issuer URL" keyboardType="url" value={form.ssoConfig.issuerUrl} onChangeText={value => update('ssoConfig', { ...form.ssoConfig, issuerUrl: value })} />
            <Field label="Client ID" value={form.ssoConfig.clientId} onChangeText={value => update('ssoConfig', { ...form.ssoConfig, clientId: value })} />
            <Field
              label={item ? 'Client Secret (leave blank to keep the current one)' : 'Client Secret'}
              secureTextEntry
              value={form.ssoConfig.clientSecret}
              onChangeText={value => update('ssoConfig', { ...form.ssoConfig, clientSecret: value })}
            />
          </>
        ) : null}
        {form.verificationMethod === 'EXTERNAL_API' ? (
          <>
            <Field
              label="API Endpoint"
              keyboardType="url"
              value={form.externalApiConfig.endpoint}
              onChangeText={value => update('externalApiConfig', { ...form.externalApiConfig, endpoint: value })}
            />
            <Field
              label={item ? 'Shared Secret (leave blank to keep the current one)' : 'Shared Secret'}
              secureTextEntry
              value={form.externalApiConfig.sharedSecret}
              onChangeText={value => update('externalApiConfig', { ...form.externalApiConfig, sharedSecret: value })}
            />
          </>
        ) : null}
        <Button
          title={saving ? 'Saving...' : 'Save Configuration'}
          onPress={() => void submit(form)}
          loading={saving}
          disabled={!form.name.trim()}
          style={styles.submit}
        />
      </ScrollPage>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Drop-off stations
// ---------------------------------------------------------------------------

const CAROUSEL_SIZE = 96;

/** Station photos that advance every 8 seconds, as in the iCampus list. */
function ImageCarousel({ images }: { images: string[] }) {
  const styles = useStyles();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const index = useRef(0);
  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => {
      index.current = (index.current + 1) % images.length;
      scrollRef.current?.scrollTo({ x: index.current * CAROUSEL_SIZE, animated: true });
    }, 8000);
    return () => clearInterval(interval);
  }, [images.length]);

  if (images.length === 0) return <View style={[styles.carousel, styles.logoPlaceholder]} />;
  return (
    <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.carousel}>
      {images.map((uri, position) => (
        <Image key={`${uri}-${position}`} source={{ uri }} style={styles.carouselImage} />
      ))}
    </ScrollView>
  );
}

export function StationsList() {
  const { admin } = useSession();
  const { push } = useNavigation();
  const styles = useStyles();
  const list = usePagedList(getStations);
  const deletion = useDeletion(item => deleteStation(String(item.id)), () => void list.refresh(), 'Drop off station deleted successfully.');
  const isSuperAdmin = admin.adminType === 'super_admin';

  return (
    <>
      <PagedList
        title="iCampus Drop Off Stations"
        addLabel="Add Station"
        onAdd={() => push({ name: 'stationForm' })}
        list={list}
        emptyIcon="storefront"
        emptyTitle="No drop off stations yet"
        renderItem={item => (
          <View style={styles.itemCard}>
            <ImageCarousel images={Array.isArray(item.images) ? item.images : []} />
            <View style={styles.flex}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.metaStrong}>Address: {item.address}</Text>
              <View style={styles.sideBySide}>
                <Text style={styles.meta}>Call: {item.contactPerson}</Text>
                <Text style={styles.meta}>Joined: {formatDate(item.createdAt) || 'N/A'}</Text>
              </View>
            </View>
            {isSuperAdmin ? (
              <ItemActions
                name={item.name || 'station'}
                onEdit={() => push({ name: 'stationForm', item })}
                onDelete={() => deletion.setTarget(item)}
              />
            ) : null}
          </View>
        )}
      />
      <ConfirmModal
        visible={Boolean(deletion.target)}
        onClose={() => deletion.setTarget(null)}
        onConfirm={() => void deletion.confirm()}
        title="Delete Drop Off Station?"
        subtitle={`Are you sure you want to delete the drop off station "${deletion.target?.name ?? ''}"? This action cannot be undone.`}
        confirmText="Delete"
        loading={deletion.deleting}
      />
    </>
  );
}

const emptyStation = { id: '', name: '', address: '', contactPerson: '', latitude: '', longitude: '', agentId: '', images: [] as string[] };

export function StationForm({ item }: { item?: Item }) {
  const styles = useStyles();
  const [original] = useState(() => (item ? { ...emptyStation, ...item, images: Array.isArray(item.images) ? item.images : [] } : emptyStation));
  const [form, setForm] = useState(original);
  const [images, setImages] = useState(original.images.join(', '));
  const { saving, submit } = useSaveForm(original, Boolean(item), next => saveStation(next, item ? String(next.id) : undefined));
  const update = (key: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [key]: value }));

  return (
    <View style={styles.flex}>
      <PageHeader title={item ? 'Manage Authorized Drop Off Station' : 'Create Authorized Drop Off Station'} />
      <ScrollPage contentContainerStyle={styles.form}>
        <Field label="Station Name" value={form.name} onChangeText={value => update('name', value)} />
        <Field label="Address" value={form.address} onChangeText={value => update('address', value)} />
        <Field label="Contact Phone Number" value={form.contactPerson} onChangeText={value => update('contactPerson', value)} />
        <Field
          label="Station Images (comma separated)"
          value={images}
          onChangeText={value => {
            setImages(value);
            setForm(previous => ({ ...previous, images: value.split(',').map(url => url.trim()).filter(Boolean) }));
          }}
        />
        <View style={styles.formRow}>
          <Field label="Latitude" keyboardType="numeric" value={String(form.latitude)} onChangeText={value => update('latitude', value)} style={styles.flex} />
          <Field label="Longitude" keyboardType="numeric" value={String(form.longitude)} onChangeText={value => update('longitude', value)} style={styles.flex} />
        </View>
        <Field label="Agent's iCampus ID" value={form.agentId} onChangeText={value => update('agentId', value)} />
        <Button
          title={saving ? 'Saving...' : 'Save Configuration'}
          onPress={() => void submit(form)}
          loading={saving}
          disabled={!form.name.trim()}
          style={styles.submit}
        />
      </ScrollPage>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Advertisements
// ---------------------------------------------------------------------------

const AD_MIN_WIDTH = 340;
const AD_GAP = 16;

export function AdsList() {
  const { admin } = useSession();
  const { push } = useNavigation();
  const colors = useColors();
  const styles = useStyles();
  const { width, onLayout } = useMeasuredWidth();
  // The ads endpoint returns every active ad at once.
  const list = usePagedList(useCallback(async (page: number) => (page === 1 ? getAds() : []), []), Infinity);
  const deletion = useDeletion(item => deleteAd(item.id), () => void list.refresh(), 'Advertisement deleted successfully.');

  // Super admins manage platform ads; school administrators manage their own.
  const canManage = (ad: Item) =>
    admin.adminType === 'super_admin' ? !isSchoolAdminA(ad.creatorType) : ad.addedBy === admin.uid;

  const ads = list.items as AdItem[];
  const videos = ads.filter(ad => ad.type === 'video').length;
  const columns = Math.max(1, Math.floor((width + AD_GAP) / (AD_MIN_WIDTH + AD_GAP)));
  const cardWidth = width > 0 ? (width - AD_GAP * (columns - 1)) / columns : 0;

  return (
    <>
      <ScrollPage contentContainerStyle={styles.list}>
        <SectionHeader
          icon="campaign"
          title="Advertisement Banners"
          subtitle={list.loading ? 'Loading banners' : `${ads.length} active · ${ads.length - videos} image · ${videos} video`}
          right={
            <View style={styles.headerActions}>
              <IconButton filled size={19} icon="refresh" label="Refresh" onPress={() => void list.refresh()} />
              <Button compact icon="add" title="Add Advert" onPress={() => push({ name: 'adForm' })} />
            </View>
          }
        />
        {list.loading ? (
          <Loading />
        ) : ads.length === 0 ? (
          <EmptyState
            icon="campaign"
            title="No active advertisements"
            subtitle="Banners you add appear on the iCampus home feed."
            buttonText="Add Advert"
            buttonIcon="add"
            onPress={() => push({ name: 'adForm' })}
          />
        ) : (
          <View onLayout={onLayout} style={styles.adGrid}>
            {cardWidth > 0
              ? ads.map(ad => {
                  const manageable = canManage(ad);
                  const school = isSchoolAdminA(ad.creatorType);
                  return (
                    <View key={String(ad.id)} style={[styles.adCard, { width: cardWidth }]}>
                      <AdCard ad={ad} playing={false} height={200} />
                      <View style={styles.adBody}>
                        <View style={styles.adMetaRow}>
                          <Pill
                            label={school ? 'SCHOOL AD' : 'PLATFORM AD'}
                            icon={school ? 'school' : 'public'}
                            color={school ? colors.pendingDelivery : colors.info}
                          />
                          {ad.addedBy === admin.uid ? <Pill label="YOURS" icon="person" color={colors.primary} /> : null}
                        </View>
                        <View style={styles.adLinkRow}>
                          <Icon name="link" size={16} color={colors.textMuted} />
                          <Text numberOfLines={1} style={[styles.adLink, !ad.targetUrl && styles.adLinkMissing]}>
                            {displayDomain(ad.targetUrl) || 'No target link'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.adFooter}>
                        {manageable ? (
                          <>
                            <Button compact variant="soft" icon="edit" title="Edit" onPress={() => push({ name: 'adForm', item: ad })} style={styles.flex} />
                            <IconButton
                              filled
                              size={19}
                              icon="delete-outline"
                              color={colors.criticalSeverity}
                              label={`Delete ${ad.advertiserName}`}
                              onPress={() => deletion.setTarget(ad)}
                            />
                          </>
                        ) : (
                          <View style={styles.adLocked}>
                            <Icon name="lock-outline" size={15} color={colors.textMuted} />
                            <Text style={styles.meta}>Managed by {school ? 'the school administrator' : 'iCampus'}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              : null}
          </View>
        )}
      </ScrollPage>
      <ConfirmModal
        visible={Boolean(deletion.target)}
        onClose={() => deletion.setTarget(null)}
        onConfirm={() => void deletion.confirm()}
        title="Delete Advertisement?"
        subtitle={`Are you sure you want to delete the ad from "${deletion.target?.advertiserName ?? ''}"? This action cannot be undone.`}
        confirmText="Delete"
        loading={deletion.deleting}
      />
    </>
  );
}

const emptyAd = { type: 'image' as 'image' | 'video', mediaUrl: '', targetUrl: '', advertiserLogo: '', advertiserName: '', tagline: '' };

export function AdForm({ item }: { item?: Item }) {
  const styles = useStyles();
  const toast = useToast();
  const [original] = useState(() =>
    item
      ? (Object.fromEntries(Object.keys(emptyAd).map(key => [key, item[key] ?? emptyAd[key as keyof typeof emptyAd]])) as typeof emptyAd)
      : emptyAd,
  );
  const [form, setForm] = useState(original);
  const { saving, submit } = useSaveForm(original, Boolean(item), next => saveAd(next, item?.id));
  const update = (key: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [key]: value }));

  const save = () => {
    if (!form.mediaUrl || !form.advertiserName || !form.advertiserLogo) {
      toast('error', 'Please fill out all required fields (Media URL, Advertiser Name, Logo).', 'Validation Error');
      return;
    }
    void submit(form);
  };

  return (
    <View style={styles.flex}>
      <PageHeader
        title={item ? 'Edit Advertisement Banner' : 'Create Advertisement Banner'}
        subtitle={item ? `Managing ${form.advertiserName}` : 'Add a new sponsor slot'}
      />
      <ScrollPage contentContainerStyle={styles.form}>
        <OptionPicker
          label="Ad Type"
          value={form.type}
          options={[
            { value: 'image', label: 'Image' },
            { value: 'video', label: 'Video' },
          ]}
          onChange={value => update('type', value)}
        />
        <Field label="Media URL (Image or Video Link)" keyboardType="url" value={form.mediaUrl} onChangeText={value => update('mediaUrl', value)} />
        <Field label="Target Link (Redirect URL when clicked)" keyboardType="url" value={form.targetUrl} onChangeText={value => update('targetUrl', value)} />
        <Field label="Advertiser's Name" value={form.advertiserName} onChangeText={value => update('advertiserName', value)} />
        <Field label="Advertiser Logo URL" keyboardType="url" value={form.advertiserLogo} onChangeText={value => update('advertiserLogo', value)} />
        <Field label="Tagline (Optional short text)" value={form.tagline} onChangeText={value => update('tagline', value)} />
        <Button title={saving ? 'Saving...' : 'Save Changes'} onPress={save} loading={saving} style={styles.submit} />
      </ScrollPage>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tax entries
// ---------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(
  (label, index) => ({ label, value: String(index + 1).padStart(2, '0') }),
);
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: Math.max(5, currentYear - 2025 + 1) }, (_, index) => {
  const year = String(2026 + index);
  return { label: year, value: year };
});

export function TaxEntries() {
  const toast = useToast();
  const styles = useStyles();
  const totalPages = useRef(1);
  const fetchPage = useCallback(async (page: number) => {
    if (page > totalPages.current) return [];
    const result = await getTaxEntries(page, 10);
    totalPages.current = result.totalPages;
    return result.items;
  }, []);
  const list = usePagedList(fetchPage, 10);
  const [downloadVisible, setDownloadVisible] = useState(false);
  const [month, setMonth] = useState('01');
  const [year, setYear] = useState(YEARS[0].value);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      await requestTaxReport(month, year);
      setDownloadVisible(false);
      toast('success', 'The tax report has been generated and will be sent via email.');
    } catch (reason) {
      toast('error', errorMessage(reason, 'Error fetching tax entries, please retry'), 'Fetch Error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <PagedList
        title="iCampus Tax Entries"
        addLabel="Download"
        onAdd={() => setDownloadVisible(true)}
        list={list}
        emptyIcon="receipt-long"
        emptyTitle="No tax entries found."
        renderItem={item => (
          <View style={styles.taxCard}>
            <TaxEntryRow item={item} />
          </View>
        )}
      />
      <Sheet visible={downloadVisible} onClose={() => setDownloadVisible(false)}>
        <Text style={styles.sheetTitle}>Select Period to Download</Text>
        <OptionPicker label="Month" value={month} options={MONTHS} onChange={setMonth} />
        <OptionPicker label="Year" value={year} options={YEARS} onChange={setYear} />
        <Button title={downloading ? 'Downloading...' : 'Download'} icon="file-download" onPress={() => void download()} loading={downloading} />
      </Sheet>
    </>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    detailPage: { gap: 16, paddingBottom: 120, width: '100%', maxWidth: 1000, alignSelf: 'center' },
    detailHero: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.backgroundSecondary },
    heroLogo: { width: 64, height: 64, borderRadius: 32 },
    heroName: { fontSize: 20, fontWeight: '800', color: c.textDarker },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    detailColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    detailColumn: { flexGrow: 1, flexBasis: 320, minWidth: 0 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    infoValue: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: c.textDarker, textAlign: 'right' },
    subTitle: { fontSize: 13, fontWeight: '700', color: c.textDarker, marginBottom: 6 },
    gapTop: { marginTop: 14 },
    repGroup: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    repRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
    repNested: { marginLeft: 26, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: c.borderSubtle },
    repName: { fontSize: 14, fontWeight: '700', color: c.textDarker },
    repCaption: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: c.textMuted, marginTop: 6, marginLeft: 26 },
    institutionCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.backgroundSecondary },
    institutionMain: { flexDirection: 'row', alignItems: 'center', gap: 14, flexGrow: 1, flexBasis: 280, minWidth: 0 },
    institutionActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    detailStat: { flexGrow: 1, flexBasis: 180, padding: 14, borderRadius: 12, backgroundColor: c.backgroundSecondary },
    detailLabel: { fontSize: 12, color: c.textMuted },
    detailValue: { fontSize: 18, fontWeight: '800', color: c.textDarker, marginTop: 4 },
    detailListRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    detailActivityTitle: { fontSize: 13, fontWeight: '700', color: c.textDarker },
    list: { paddingBottom: 110 },
    listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
    footer: { marginVertical: 16 },
    itemCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
      borderRadius: 18,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      backgroundColor: c.backgroundSecondary,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    adGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: AD_GAP },
    adCard: {
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
    adBody: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
    adMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    adLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    adLink: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: c.text },
    adLinkMissing: { color: c.textMuted, fontStyle: 'italic' },
    adFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
    adLocked: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38 },
    logo: { width: 56, height: 56, borderRadius: 28 },
    logoPlaceholder: { backgroundColor: c.primary + '22' },
    name: { fontSize: 16, fontWeight: '700', color: c.textDarker, flexShrink: 1 },
    sideBySide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 4 },
    meta: { fontSize: 12, color: c.textMuted },
    metaStrong: { fontSize: 13, color: c.text, marginTop: 4 },
    actions: { flexDirection: 'row', alignItems: 'center' },
    carousel: { width: CAROUSEL_SIZE, height: CAROUSEL_SIZE, borderRadius: 12, flexGrow: 0 },
    carouselImage: { width: CAROUSEL_SIZE, height: CAROUSEL_SIZE },
    taxCard: { paddingHorizontal: 8, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.backgroundSecondary },
    form: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 40 },
    formRow: { flexDirection: 'row', gap: 12 },
    groupTitle: { fontSize: 16, fontWeight: '700', marginVertical: 12, color: c.textDarker },
    submit: { marginTop: 20 },
    sheetTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center', color: c.textDarker },
  }),
);
