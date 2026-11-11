import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AcademicCalendar,
  CalendarSession,
  dismissSessionSuggestion,
  getAcademicCalendar,
  SessionSource,
  startAcademicSession,
  undoAcademicSession,
  updateAcademicSession,
  updateCalendarSettings,
} from '../api';
import { errorMessage, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { makeStyles, useColors } from '../theme';
import {
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  Field,
  formatDate,
  fromNow,
  Loading,
  OptionPicker,
  PageHeader,
  Pill,
  ScrollPage,
  SectionHeader,
  Sheet,
} from '../ui';

/**
 * The institution's academic calendar. Schools start and end sessions at
 * different times (and strikes stretch them), so the institution rep (A)
 * sets them here. Uploaded registration and allocation forms only suggest a
 * new session. Department reps (B) can view but not change it.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const SOURCE_TEXT: Record<SessionSource, string> = {
  admin: 'Set by your institution rep',
  detected: 'Estimated from uploaded forms',
  legacy: 'Estimated from earlier uploads',
  courses: 'Estimated from course records',
  default: 'Estimated from the usual start month',
};

// ---- Dates: typed as YYYY-MM-DD, sent as the start of that day locally ------

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const toInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** ISO string for a typed date, null when blank, undefined when invalid. */
const fromInput = (value: string): string | null | undefined => {
  const text = value.trim();
  if (!text) return null;
  const match = text.match(DATE_PATTERN);
  if (!match) return undefined;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date.toISOString() : undefined;
};
const todayInput = () => toInput(new Date().toISOString());

const range = (s: Pick<CalendarSession, 'startsAt' | 'endsAt'>, open = 'ongoing') =>
  `${formatDate(s.startsAt) || '—'} → ${s.endsAt ? formatDate(s.endsAt) : open}`;

/** Next label after "2026/2027" → "2027/2028"; after "2026" → "2027"; otherwise blank. */
const nextLabel = (label?: string | null) => {
  const pair = label?.match(/^(\d{4})\/(\d{4})$/);
  if (pair) return `${Number(pair[1]) + 1}/${Number(pair[2]) + 1}`;
  const year = label?.match(/^(\d{4})$/);
  return year ? String(Number(year[1]) + 1) : '';
};

type FormMode = { kind: 'start'; label?: string } | { kind: 'edit' };

function SessionForm({
  mode,
  calendar,
  onClose,
  onSubmit,
}: {
  mode: FormMode;
  calendar: AcademicCalendar;
  onClose: () => void;
  onSubmit: (values: { label: string; startsAt: string; endsAt: string | null }) => Promise<void>;
}) {
  const styles = useStyles();
  const editing = mode.kind === 'edit';
  const current = calendar.current;
  const [label, setLabel] = useState(editing ? current?.label ?? '' : mode.label || nextLabel(current?.label ?? calendar.inUse.label));
  const [startsAt, setStartsAt] = useState(editing ? toInput(current?.startsAt) : todayInput());
  const [endsAt, setEndsAt] = useState(editing ? toInput(current?.endsAt) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const start = fromInput(startsAt);
    const end = fromInput(endsAt);
    if (label.trim().length < 2) return setError('Enter the session name, e.g. 2026/2027.');
    if (!start) return setError('Enter the start date as YYYY-MM-DD.');
    if (end === undefined) return setError('Enter the end date as YYYY-MM-DD, or leave it blank.');
    if (end && end <= start) return setError('The end date must be after the start date.');
    setError(null);
    setSaving(true);
    try {
      await onSubmit({ label: label.trim(), startsAt: start, endsAt: end });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible onClose={() => !saving && onClose()} variant="dialog" maxWidth={480}>
      <Text style={styles.sheetTitle}>{editing ? `Edit ${current?.label}` : 'Start a new session'}</Text>
      {!editing && current ? (
        <Text style={styles.sheetNote}>
          {current.label} will close when the new session starts. Dashboards switch to the new session straight away; {current.label} stays in the
          session picker.
        </Text>
      ) : null}
      <Field label="Session name" placeholder="e.g. 2026/2027, 2027, Fall 2026" value={label} onChangeText={setLabel} />
      <Field label="Starts on" placeholder="YYYY-MM-DD" value={startsAt} onChangeText={setStartsAt} />
      <Field label="Planned end (optional)" placeholder="YYYY-MM-DD — leave blank if unknown" value={endsAt} onChangeText={setEndsAt} />
      <Text style={styles.sheetNote}>
        The session stays current until you start the next one, even past its planned end, so a strike or extension never cuts it short.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.sheetActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} disabled={saving} style={styles.flex} />
        <Button title={editing ? 'Save changes' : 'Start session'} onPress={() => void submit()} loading={saving} style={styles.flex} />
      </View>
    </Sheet>
  );
}

function Notice({ icon, color, title, body, children }: { icon: IconName; color: string; title: string; body: string; children?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={[styles.notice, { borderLeftColor: color, backgroundColor: color + '12' }]}>
      <Icon name={icon} size={20} color={color} />
      <View style={styles.flex}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.muted}>{body}</Text>
        {children ? <View style={styles.noticeActions}>{children}</View> : null}
      </View>
    </View>
  );
}

export function AcademicCalendarScreen({ schoolCode, prefill }: { schoolCode?: string; prefill?: string }) {
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormMode | null>(prefill ? { kind: 'start', label: prefill } : null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCalendar(await getAcademicCalendar(schoolCode));
    } catch (reason) {
      toast('error', errorMessage(reason), 'Fetch Error');
    } finally {
      setLoading(false);
    }
  }, [schoolCode, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  /** Runs a change, shows the server's message and the calendar it returns. */
  const apply = async (change: () => Promise<AcademicCalendar>) => {
    const next = await change();
    setCalendar(next);
    if (next.message) toast('success', next.message, 'Academic calendar');
  };
  const quick = async (change: () => Promise<AcademicCalendar>) => {
    setBusy(true);
    try {
      await apply(change);
    } catch (reason) {
      toast('error', errorMessage(reason), 'Academic calendar');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !calendar) return <Loading label="Loading academic calendar..." />;
  if (!calendar) {
    return (
      <View style={styles.flex}>
        <PageHeader title="Academic calendar" />
        <EmptyState icon="event-busy" title="Couldn't load the calendar" buttonText="Try again" buttonIcon="refresh" onPress={() => void load()} />
      </View>
    );
  }

  const { status, current, inUse, canManage } = calendar;
  const suggestion = status.suggestion;
  const who = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <View style={styles.flex}>
      <PageHeader title="Academic calendar" subtitle={calendar.schoolName} />
      <ScrollPage contentContainerStyle={styles.page}>
        {!status.isSet ? (
          <Notice
            icon="event-busy"
            color={colors.pendingDelivery}
            title="Your academic calendar isn't set"
            body={`Dashboards are using ${inUse.label} (${SOURCE_TEXT[inUse.source].toLowerCase()}) with estimated dates, so session figures may not match your real session.${
              canManage ? ' Set the session your institution is in now.' : ' Your institution representative can set it.'
            }`}
          >
            {canManage ? <Button compact icon="event" title={`Set ${inUse.label}`} onPress={() => setForm({ kind: 'start', label: inUse.label })} /> : null}
          </Notice>
        ) : null}

        {status.overdue && current ? (
          <Notice
            icon="schedule"
            color={colors.criticalSeverity}
            title={`${current.label} was planned to end ${formatDate(current.endsAt)}`}
            body="It stays current until a new session is started. If it has been extended, update the planned end date; otherwise start the next session."
          >
            {canManage ? (
              <>
                <Button compact icon="add" title="Start next session" onPress={() => setForm({ kind: 'start' })} />
                <Button compact variant="outline" icon="edit" title="Extend" onPress={() => setForm({ kind: 'edit' })} />
              </>
            ) : null}
          </Notice>
        ) : null}

        {suggestion ? (
          <Notice
            icon="tips-and-updates"
            color={colors.info}
            title={`${suggestion.label} forms are being uploaded`}
            body={`${who(suggestion.reporters, 'person')} (${who(suggestion.lecturers, 'lecturer')}) uploaded registration or allocation forms for ${suggestion.label}${
              suggestion.lastSeenAt ? `, most recently ${fromNow(suggestion.lastSeenAt)}` : ''
            }. Has it started?`}
          >
            {canManage ? (
              <>
                <Button compact icon="play-arrow" title={`Start ${suggestion.label}`} onPress={() => setForm({ kind: 'start', label: suggestion.label })} />
                <Button
                  compact
                  variant="outline"
                  icon="close"
                  title="Not yet"
                  disabled={busy}
                  onPress={() => void quick(() => dismissSessionSuggestion(suggestion.label, schoolCode))}
                />
              </>
            ) : null}
          </Notice>
        ) : null}

        <Card>
          <SectionHeader icon="event" title="Current session" subtitle={SOURCE_TEXT[inUse.source]} />
          <View style={styles.currentRow}>
            <View style={styles.flex}>
              <Text style={styles.currentLabel}>{inUse.label}</Text>
              <Text style={styles.muted}>{range(inUse, 'until the next session starts')}</Text>
              {current?.endsAt ? <Text style={styles.muted}>Planned end {formatDate(current.endsAt)}</Text> : null}
            </View>
            <Pill
              label={status.isSet ? 'OFFICIAL' : 'ESTIMATED'}
              icon={status.isSet ? 'verified' : 'help-outline'}
              color={status.isSet ? colors.success : colors.pendingDelivery}
            />
          </View>
          {canManage ? (
            <View style={styles.actions}>
              <Button compact icon="add" title="Start new session" onPress={() => setForm({ kind: 'start' })} />
              {current ? <Button compact variant="outline" icon="edit" title="Edit current" onPress={() => setForm({ kind: 'edit' })} /> : null}
              {current ? (
                <Button compact variant="outline" icon="undo" title="Undo last start" onPress={() => setConfirmUndo(true)} disabled={busy} />
              ) : null}
            </View>
          ) : (
            <View style={styles.lockedRow}>
              <Icon name="lock-outline" size={15} color={colors.textMuted} />
              <Text style={styles.muted}>Only your institution representative can change the academic calendar.</Text>
            </View>
          )}
        </Card>

        <Card>
          <SectionHeader icon="history" title="Past sessions" subtitle="Shown in the dashboard's session picker" />
          {calendar.history.length === 0 ? <Text style={styles.muted}>No past sessions on the calendar yet.</Text> : null}
          {calendar.history.map(s => (
            <View key={s.label} style={styles.row}>
              <Text style={styles.rowTitle}>{s.label}</Text>
              <Text style={styles.muted}>{range(s)}</Text>
            </View>
          ))}
        </Card>

        <Card>
          <SectionHeader icon="upload-file" title="Sessions on uploaded forms" subtitle="From students' registration and lecturers' allocation forms" />
          <Text style={[styles.muted, styles.gapBottom]}>
            A new session is suggested once {calendar.thresholds.reporters} people or {calendar.thresholds.lecturers} lecturers upload forms for it. Uploads never
            change the calendar by themselves, and misread years are ignored.
          </Text>
          {calendar.detected.length === 0 ? <Text style={styles.muted}>No forms uploaded yet.</Text> : null}
          {calendar.detected.map(d => (
            <View key={d.label} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{d.label}</Text>
                <Text style={styles.muted}>
                  {who(d.reporters, 'person')} · {who(d.lecturers, 'lecturer')}
                  {d.lastSeenAt ? ` · last ${fromNow(d.lastSeenAt)}` : ''}
                </Text>
              </View>
              {d.matchesCurrent ? (
                <Pill label="CURRENT" color={colors.success} />
              ) : d.dismissed ? (
                <Pill label="DISMISSED" color={colors.textMuted} />
              ) : (
                <Pill label="OTHER SESSION" color={colors.pendingDelivery} />
              )}
            </View>
          ))}
        </Card>

        <Card>
          <SectionHeader icon="settings" title="Usual start month" subtitle="Only used to estimate dates for sessions nobody has set" />
          {canManage ? (
            <OptionPicker
              value={String(calendar.defaultStartMonth)}
              options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))}
              onChange={value => void quick(() => updateCalendarSettings({ defaultStartMonth: Number(value) }, schoolCode))}
            />
          ) : (
            <Text style={styles.rowTitle}>{MONTH_NAMES[calendar.defaultStartMonth - 1]}</Text>
          )}
        </Card>
      </ScrollPage>

      {form ? (
        <SessionForm
          mode={form}
          calendar={calendar}
          onClose={() => setForm(null)}
          onSubmit={async values => {
            await apply(() =>
              form.kind === 'edit' ? updateAcademicSession(values, schoolCode) : startAcademicSession(values, schoolCode),
            );
            setForm(null);
          }}
        />
      ) : null}
      <ConfirmModal
        visible={confirmUndo}
        onClose={() => setConfirmUndo(false)}
        onConfirm={() => void quick(() => undoAcademicSession(schoolCode)).then(() => setConfirmUndo(false))}
        title={`Remove ${current?.label ?? 'this session'}?`}
        subtitle={
          calendar.history[0]
            ? `${calendar.history[0].label} becomes the current session again. Use this if a session was started by mistake.`
            : 'The calendar becomes unset and dashboards go back to estimated dates.'
        }
        confirmText="Remove"
        loading={busy}
      />
    </View>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    page: { gap: 16, width: '100%', maxWidth: 820, alignSelf: 'center', paddingBottom: 100 },
    muted: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
    notice: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, borderLeftWidth: 4 },
    noticeTitle: { fontSize: 14, fontWeight: '800', color: c.textDarker, marginBottom: 3 },
    noticeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    currentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    currentLabel: { fontSize: 26, fontWeight: '800', color: c.textDarker },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
    lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
    rowTitle: { fontSize: 14, fontWeight: '700', color: c.textDarker },
    gapBottom: { marginBottom: 8 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: c.textDarker, marginBottom: 8 },
    sheetNote: { fontSize: 12.5, color: c.textMuted, lineHeight: 18, marginBottom: 14 },
    sheetActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
    error: { fontSize: 13, color: c.criticalSeverity, marginBottom: 10 },
  }),
);
