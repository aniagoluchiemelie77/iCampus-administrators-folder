import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Attachment, ExportResult, uploadAttachment } from './api';
import { Delta, Sparkline } from './charts';
import { errorMessage, useSession, useToast } from './context';
import { Icon, IconName } from './icons';
import { makeStyles, useColors } from './theme';
import { Button, formatCount, Sheet } from './ui';

/**
 * Pieces shared by the role dashboards (finance, super admin, support,
 * school): headline stat cards, tile rows, the export sheet and the image
 * attachment picker for notifications.
 */

export function StatCard({
  icon,
  label,
  value,
  tone,
  hint,
  trend,
  delta,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone: string;
  hint?: string;
  trend?: number[];
  delta?: { current: number; previous: number; suffix?: string; invert?: boolean };
  onPress?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ hovered }: any) => [styles.stat, hovered && onPress && { borderColor: tone + '66' }]}
    >
      <View style={[styles.statGlow, { backgroundColor: tone + '10' }]} />
      <View style={styles.statTop}>
        <View style={[styles.statIcon, { backgroundColor: tone + '1A' }]}>
          <Icon name={icon} size={22} color={tone} />
        </View>
        {trend && trend.length > 1 ? <Sparkline data={trend} color={tone} width={100} height={36} /> : null}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.statValue}>{value}</Text>
      {delta ? <Delta current={delta.current} previous={delta.previous} suffix={delta.suffix} invert={delta.invert} /> : null}
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
      {onPress ? (
        <View style={styles.statLink}>
          <Text style={[styles.statLinkText, { color: colors.primary }]}>View details</Text>
          <Icon name="arrow-forward" size={14} color={colors.primary} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.statRow}>{children}</View>;
}

export type TileItem = { label: string; value: string; tone?: string; icon?: IconName };

export function Tiles({ items }: { items: TileItem[] }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.tiles}>
      {items.map(item => (
        <View key={item.label} style={styles.tile}>
          {item.icon ? <Icon name={item.icon} size={16} color={item.tone || colors.textMuted} /> : null}
          <Text numberOfLines={1} style={[styles.tileValue, item.tone ? { color: item.tone } : null]}>{item.value}</Text>
          <Text style={styles.tileLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Two-up responsive row of cards. */
export function Grid({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.grid}>{children}</View>;
}
export function Cell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const styles = useStyles();
  return <View style={wide ? styles.cellWide : styles.cell}>{children}</View>;
}

export const fmtCount = formatCount;
export const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type ExportOption = { value: string; label: string; personal?: boolean; hint?: string };

/**
 * "Export" button + sheet. Exports are emailed as branded Excel workbooks to the admin's own
 * account email (never a typed address), and anything with personal data
 * says so before it's sent.
 */
export function ExportButton({
  title,
  options,
  multiple = false,
  scopeNote,
  onExport,
}: {
  title: string;
  options: ExportOption[];
  /** Let the admin tick several files into one email. */
  multiple?: boolean;
  scopeNote?: string;
  onExport: (values: string[]) => Promise<ExportResult>;
}) {
  const { admin } = useSession();
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([options[0]?.value].filter(Boolean) as string[]);
  const [sending, setSending] = useState(false);
  const personal = options.some(o => o.personal && selected.includes(o.value));

  const toggle = (value: string) =>
    setSelected(current =>
      multiple ? (current.includes(value) ? current.filter(v => v !== value) : [...current, value]) : [value],
    );

  const send = async () => {
    setSending(true);
    try {
      const result = await onExport(selected);
      toast('success', result.message, 'Export sent');
      setOpen(false);
    } catch (reason) {
      toast('error', errorMessage(reason), 'Export failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button compact variant="soft" icon="file-download" title="Export" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => !sending && setOpen(false)} variant="dialog" maxWidth={520}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <Text style={styles.sheetText}>
          An Excel workbook with the iCampus header is emailed to <Text style={styles.bold}>{admin.email || 'your account email'}</Text>.
          Exports only go to your own account address.
        </Text>
        {scopeNote ? <Text style={styles.sheetMeta}>{scopeNote}</Text> : null}
        <View style={styles.options}>
          {options.map(option => {
            const active = selected.includes(option.value);
            return (
              <Pressable
                key={option.value}
                accessibilityRole={multiple ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: active }}
                onPress={() => toggle(option.value)}
                style={[styles.option, { borderColor: active ? colors.primary : colors.borderSubtle, backgroundColor: active ? colors.primary + '10' : colors.surfaceRaised }]}
              >
                <Icon
                  name={multiple ? (active ? 'check-box' : 'check-box-outline-blank') : active ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={20}
                  color={active ? colors.primary : colors.textMuted}
                />
                <View style={styles.flex}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  {option.hint ? <Text style={styles.sheetMeta}>{option.hint}</Text> : null}
                </View>
                {option.personal ? <Icon name="badge" size={16} color={colors.textMuted} /> : null}
              </Pressable>
            );
          })}
        </View>
        {personal ? (
          <View style={[styles.notice, { borderLeftColor: colors.primary, backgroundColor: colors.primary + '0D' }]}>
            <Icon name="privacy-tip" size={18} color={colors.primary} />
            <Text style={[styles.sheetText, styles.flex]}>
              This includes personal data (names and ID numbers). Keep the file secure, share it only with people who need it, and
              delete it when you're done. The export is recorded in the audit log.
            </Text>
          </View>
        ) : null}
        <View style={styles.sheetActions}>
          <Button title="Cancel" variant="outline" onPress={() => setOpen(false)} disabled={sending} style={styles.flex} />
          <Button title="Email export" icon="send" onPress={() => void send()} loading={sending} disabled={!selected.length} style={styles.flex} />
        </View>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Image attachments for notifications
// ---------------------------------------------------------------------------

/** Opens the browser's file chooser (web only). */
export const pickFile = (accept: string) =>
  new Promise<File | null>(resolve => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });

export const MAX_ATTACHMENTS = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Memo images: up to four, uploaded as they're picked, with removable thumbnails. */
export function AttachmentPicker({ value, onChange }: { value: Attachment[]; onChange: (next: Attachment[]) => void }) {
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const [uploading, setUploading] = useState(false);

  const add = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('error', 'Choose an image file (JPG, PNG or WebP).', 'Not an image');
    if (file.size > MAX_IMAGE_BYTES) return toast('error', 'Images must be 8 MB or smaller.', 'Too large');
    setUploading(true);
    try {
      const url = await uploadAttachment(file);
      onChange([...value, { url, type: 'image', fileName: file.name }]);
    } catch (reason) {
      toast('error', errorMessage(reason, 'The image could not be uploaded.'), 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.attachments}>
      <Text style={styles.optionLabel}>Images {value.length ? `(${value.length}/${MAX_ATTACHMENTS})` : '(optional)'}</Text>
      <View style={styles.thumbs}>
        {value.map(item => (
          <View key={item.url} style={styles.thumb}>
            <Image source={{ uri: item.url }} style={styles.thumbImage} />
            <Pressable
              accessibilityLabel={`Remove ${item.fileName || 'image'}`}
              onPress={() => onChange(value.filter(other => other.url !== item.url))}
              style={styles.thumbRemove}
            >
              <Icon name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {value.length < MAX_ATTACHMENTS ? (
          <Button compact variant="outline" icon="add-photo-alternate" title={uploading ? 'Uploading…' : 'Add image'} loading={uploading} onPress={() => void add()} />
        ) : null}
      </View>
      <Text style={styles.sheetMeta}>Scanned memos and posters show full-size in the app and as the push notification picture.</Text>
    </View>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    bold: { fontWeight: '800', color: c.textDarker },
    statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 16 },
    stat: {
      flexGrow: 1,
      flexBasis: 240,
      padding: 20,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      backgroundColor: c.backgroundSecondary,
      overflow: 'hidden',
      gap: 4,
    },
    statGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -60, top: -70 },
    statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    statIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    statLabel: { fontSize: 13, fontWeight: '700', color: c.textMuted },
    statValue: { fontSize: 32, fontWeight: '900', color: c.textDarker, letterSpacing: -0.8 },
    statHint: { fontSize: 11.5, color: c.textMuted, marginTop: 4 },
    statLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
    statLinkText: { fontSize: 12, fontWeight: '800' },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    tile: { flexGrow: 1, flexBasis: 120, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderSubtle, gap: 2 },
    tileValue: { fontSize: 20, fontWeight: '900', color: c.textDarker },
    tileLabel: { fontSize: 11.5, color: c.textMuted },
    grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
    cell: { flexGrow: 1, flexBasis: 380, minWidth: 0 },
    cellWide: { flexGrow: 3, flexBasis: 480, minWidth: 0 },
    sheetTitle: { fontSize: 18, fontWeight: '900', color: c.textDarker, marginBottom: 8 },
    sheetText: { fontSize: 13.5, color: c.text, lineHeight: 20 },
    sheetMeta: { fontSize: 12, color: c.textMuted, marginTop: 3, lineHeight: 17 },
    options: { gap: 8, marginVertical: 14 },
    option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
    optionLabel: { fontSize: 13.5, fontWeight: '700', color: c.textDarker },
    notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 10, borderLeftWidth: 4, marginBottom: 14 },
    sheetActions: { flexDirection: 'row', gap: 10 },
    attachments: { marginBottom: 16, gap: 8 },
    thumbs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
    thumb: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderSubtle },
    thumbImage: { width: '100%', height: '100%' },
    thumbRemove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000aa' },
  }),
);
