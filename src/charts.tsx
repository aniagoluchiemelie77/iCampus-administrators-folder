import React, { useCallback, useId, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Polyline, Stop } from 'react-native-svg';
import { makeStyles, useColors } from './theme';

/** Width of a container, for charts that need an explicit pixel width. */
export const useMeasuredWidth = () => {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    setWidth(current => (Math.abs(current - next) > 1 ? next : current));
  }, []);
  return { width, onLayout };
};

export const finiteNumbers = (data: unknown) =>
  Array.isArray(data) ? data.map(Number).filter(Number.isFinite) : [];

const fmt = (value: number | null | undefined, unit = '') =>
  value == null ? '—' : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`;

/** A round axis maximum (1, 2, 2.5, 5 × 10ⁿ) at or above `value`. */
const niceMax = (value: number) => {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find(s => s * power >= value) ?? 10;
  return step * power;
};

/**
 * Tiny trend line used on the dashboard summary cards. Drawn directly with
 * SVG: chart-kit reserves fixed label padding that leaves an 80×30 chart
 * almost no plotting area.
 */
export function Sparkline({
  data,
  color,
  width = 80,
  height = 30,
}: {
  data?: unknown;
  color: string;
  width?: number;
  height?: number;
}) {
  const values = finiteNumbers(data);
  const series = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...series);
  const range = Math.max(...series) - min || 1;
  const inset = 2;
  const points = series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * width;
      const y = inset + (1 - (value - min) / range) * (height - inset * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/** Smooth path through the points (Catmull-Rom as cubic Béziers). */
const smoothPath = (points: Array<[number, number]>) => {
  if (points.length < 2) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i - 1] ?? points[i];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[i + 2] ?? points[i + 1];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
  }
  return d;
};

export type ChartSeries = { name: string; color: string; values: Array<number | null> };

function Tooltip({ title, rows, left, width }: { title: string; rows: Array<{ color?: string; label: string; value: string }>; left: number; width: number }) {
  const styles = useChartStyles();
  const boxWidth = 150;
  const x = Math.min(Math.max(0, left - boxWidth / 2), Math.max(0, width - boxWidth));
  return (
    <View pointerEvents="none" style={[styles.tooltip, { left: x, width: boxWidth }]}>
      <Text style={styles.tooltipTitle}>{title}</Text>
      {rows.map(row => (
        <View key={row.label} style={styles.tooltipRow}>
          {row.color ? <View style={[styles.tooltipSwatch, { backgroundColor: row.color }]} /> : null}
          <Text numberOfLines={1} style={styles.tooltipLabel}>{row.label}</Text>
          <Text style={styles.tooltipValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Line / area chart with a hover crosshair. One series is drawn as an area
 * in its own colour; several are drawn as lines and get a legend.
 */
export function AreaChart({
  labels,
  series,
  height = 190,
  unit = '',
  max,
}: {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  unit?: string;
  /** Fixed y maximum (e.g. 100 for percentages). */
  max?: number;
}) {
  const colors = useColors();
  const styles = useChartStyles();
  const gradientId = useId().replace(/:/g, '');
  const { width, onLayout } = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);
  const axisWidth = 34;
  const top = 10;
  const bottom = 24;
  const plotWidth = Math.max(0, width - axisWidth - 8);
  const plotHeight = height - top - bottom;
  const all = series.flatMap(s => s.values).filter((v): v is number => v != null);
  const yMax = max ?? niceMax(Math.max(1, ...all));
  const x = (i: number) => axisWidth + (labels.length <= 1 ? plotWidth / 2 : (i / (labels.length - 1)) * plotWidth);
  const y = (v: number) => top + (1 - v / yMax) * plotHeight;
  const area = series.length === 1;

  // Null values break the line into separate runs.
  const runs = (values: Array<number | null>) => {
    const out: Array<Array<[number, number]>> = [];
    let run: Array<[number, number]> = [];
    values.forEach((v, i) => {
      if (v == null) {
        if (run.length) out.push(run);
        run = [];
      } else run.push([x(i), y(v)]);
    });
    if (run.length) out.push(run);
    return out;
  };

  return (
    <View>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 ? (
          <>
            <Svg width={width} height={height}>
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={series[0]?.color} stopOpacity={0.28} />
                  <Stop offset="1" stopColor={series[0]?.color} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {[0, 0.5, 1].map(f => (
                <Line key={f} x1={axisWidth} x2={axisWidth + plotWidth} y1={y(yMax * f)} y2={y(yMax * f)} stroke={colors.gridLine} strokeWidth={1} />
              ))}
              {series.map(s =>
                runs(s.values).map((run, ri) => (
                  <React.Fragment key={`${s.name}-${ri}`}>
                    {area && run.length > 1 ? (
                      <Path
                        d={`${smoothPath(run)} L${run[run.length - 1][0]},${top + plotHeight} L${run[0][0]},${top + plotHeight} Z`}
                        fill={`url(#${gradientId})`}
                      />
                    ) : null}
                    {run.length > 1 ? (
                      <Path d={smoothPath(run)} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" />
                    ) : (
                      <Circle cx={run[0][0]} cy={run[0][1]} r={4} fill={s.color} />
                    )}
                  </React.Fragment>
                )),
              )}
              {hover !== null ? (
                <>
                  <Line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotHeight} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="3 3" />
                  {series.map(s =>
                    s.values[hover] != null ? (
                      <Circle key={s.name} cx={x(hover)} cy={y(s.values[hover] as number)} r={5} fill={s.color} stroke={colors.backgroundSecondary} strokeWidth={2} />
                    ) : null,
                  )}
                </>
              ) : null}
            </Svg>
            {[0, 0.5, 1].map(f => (
              <Text key={f} style={[styles.axisLabel, { top: y(yMax * f) - 7, width: axisWidth - 6 }]}>
                {fmt(yMax * f)}
              </Text>
            ))}
            {labels.map((label, i) => (
              <Text
                key={`${label}-${i}`}
                numberOfLines={1}
                style={[styles.xLabel, { left: x(i) - 30, top: top + plotHeight + 6, opacity: hover === null || hover === i ? 1 : 0.5 }]}
              >
                {label}
              </Text>
            ))}
            {/* Hit areas: one column per point, wider than the mark. */}
            <View style={[styles.hitRow, { left: axisWidth - plotWidth / Math.max(1, labels.length - 1) / 2, width: plotWidth + plotWidth / Math.max(1, labels.length - 1), top, height: plotHeight }]}>
              {labels.map((label, i) => (
                <Pressable
                  key={`${label}-hit-${i}`}
                  accessibilityLabel={`${label}: ${series.map(s => `${s.name} ${fmt(s.values[i], unit)}`).join(', ')}`}
                  onHoverIn={() => setHover(i)}
                  onHoverOut={() => setHover(current => (current === i ? null : current))}
                  onPressIn={() => setHover(i)}
                  style={styles.hit}
                />
              ))}
            </View>
            {hover !== null ? (
              <Tooltip
                title={labels[hover]}
                left={x(hover)}
                width={width}
                rows={series.map(s => ({ color: series.length > 1 ? s.color : undefined, label: s.name, value: fmt(s.values[hover], unit) }))}
              />
            ) : null}
          </>
        ) : null}
      </View>
      {series.length > 1 ? <Legend items={series.map(s => ({ color: s.color, label: s.name }))} /> : null}
    </View>
  );
}

/** Vertical bars for one measure over categories, with hover values. */
export function BarChart({
  data,
  color,
  height = 170,
  unit = '',
  max,
}: {
  data: Array<{ label: string; value: number | null }>;
  color: string;
  height?: number;
  unit?: string;
  max?: number;
}) {
  const colors = useColors();
  const styles = useChartStyles();
  const { width, onLayout } = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(1, max ?? niceMax(Math.max(0, ...data.map(d => d.value ?? 0))));
  const plot = height - 22;
  return (
    <View onLayout={onLayout} style={{ height }}>
      <View style={[styles.bars, { height: plot, borderBottomColor: colors.gridLine }]}>
        {data.map((d, i) => {
          const h = d.value == null ? 0 : Math.max(d.value > 0 ? 3 : 0, (d.value / top) * plot);
          return (
            <Pressable
              key={`${d.label}-${i}`}
              accessibilityLabel={`${d.label}: ${fmt(d.value, unit)}`}
              onHoverIn={() => setHover(i)}
              onHoverOut={() => setHover(current => (current === i ? null : current))}
              onPressIn={() => setHover(i)}
              style={styles.barSlot}
            >
              <View style={[styles.bar, { height: h, backgroundColor: color, opacity: hover === null || hover === i ? 1 : 0.45 }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.barLabels}>
        {data.map((d, i) => (
          <Text key={`${d.label}-l-${i}`} numberOfLines={1} style={styles.barLabel}>{d.label}</Text>
        ))}
      </View>
      {hover !== null && width > 0 ? (
        <Tooltip title={data[hover].label} rows={[{ label: 'Value', value: fmt(data[hover].value, unit) }]} left={((hover + 0.5) / data.length) * width} width={width} />
      ) : null}
    </View>
  );
}

/** Labelled horizontal meter: one row per category. */
export function MeterRow({
  label,
  value,
  max = 100,
  unit = '%',
  color,
  sub,
}: {
  label: string;
  value: number | null;
  max?: number;
  unit?: string;
  color: string;
  sub?: string;
}) {
  const colors = useColors();
  const styles = useChartStyles();
  return (
    <View style={styles.meter}>
      <View style={styles.meterHead}>
        <Text numberOfLines={1} style={styles.meterLabel}>{label}</Text>
        <Text style={styles.meterValue}>{fmt(value, unit)}</Text>
      </View>
      <View style={[styles.meterTrack, { backgroundColor: colors.gridLine }]}>
        <View style={[styles.meterFill, { width: `${Math.min(100, ((value ?? 0) / (max || 1)) * 100)}%`, backgroundColor: color }]} />
      </View>
      {sub ? <Text style={styles.meterSub}>{sub}</Text> : null}
    </View>
  );
}

/** Ring gauge for a single percentage, value in the middle. */
export function RingGauge({ value, color, size = 132, label }: { value: number | null; color: string; size?: number; label?: string }) {
  const colors = useColors();
  const styles = useChartStyles();
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.min(100, Math.max(0, value ?? 0));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.gridLine} strokeWidth={stroke} fill="none" />
        {value != null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(shown / 100) * circumference} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <Text style={styles.ringValue}>{fmt(value, '%')}</Text>
        {label ? <Text style={styles.ringLabel}>{label}</Text> : null}
      </View>
    </View>
  );
}

/** Day × hour grid, one hue light → dark by count. */
export function Heatmap({ rows, columns, counts, color }: { rows: string[]; columns: string[]; counts: number[][]; color: string }) {
  const colors = useColors();
  const styles = useChartStyles();
  const [hover, setHover] = useState<[number, number] | null>(null);
  const top = Math.max(1, ...counts.flat());
  // Six-step opacity ramp of the one hue; 0 stays on the neutral track.
  const alpha = (n: number) => (n === 0 ? null : ['26', '40', '5C', '80', 'B3', 'FF'][Math.min(5, Math.floor((n / top) * 5.999))]);
  return (
    <View>
      {rows.map((row, r) => (
        <View key={row} style={styles.heatRow}>
          <Text style={styles.heatRowLabel}>{row}</Text>
          {columns.map((column, c) => {
            const n = counts[r]?.[c] ?? 0;
            const a = alpha(n);
            const active = hover?.[0] === r && hover?.[1] === c;
            return (
              <Pressable
                key={column}
                accessibilityLabel={`${row} ${column}: ${n} lectures`}
                onHoverIn={() => setHover([r, c])}
                onHoverOut={() => setHover(null)}
                onPressIn={() => setHover([r, c])}
                style={[styles.heatCell, { backgroundColor: a ? color + a : colors.gridLine }, active && { borderColor: colors.textDarker }]}
              />
            );
          })}
        </View>
      ))}
      <View style={styles.heatRow}>
        <Text style={styles.heatRowLabel} />
        {columns.map((column, c) => (
          <Text key={column} style={styles.heatColLabel}>{c % 2 === 0 ? column : ''}</Text>
        ))}
      </View>
      <Text style={styles.heatCaption}>
        {hover ? `${rows[hover[0]]} ${columns[hover[1]]} — ${counts[hover[0]][hover[1]]} lectures` : 'Hover a cell for the count. Darker = more lectures.'}
      </Text>
    </View>
  );
}

/**
 * Stacked vertical bars: parts of a whole per category (e.g. physical vs
 * online lectures per month). 2px surface gap between segments, rounded top,
 * hover tooltip with every part and the total, legend below.
 */
export function StackedBarChart({
  labels,
  series,
  height = 190,
  unit = '',
  formatValue,
}: {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  unit?: string;
  formatValue?: (value: number) => string;
}) {
  const colors = useColors();
  const styles = useChartStyles();
  const { width, onLayout } = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);
  const show = (v: number | null) => (v == null ? '—' : formatValue ? formatValue(v) : fmt(v, unit));
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const top = niceMax(Math.max(1, ...totals));
  const axisWidth = 34;
  const plot = height - 22;
  return (
    <View>
      <View onLayout={onLayout} style={{ height }}>
        {[0, 0.5, 1].map(f => (
          <React.Fragment key={f}>
            <View style={[styles.gridRule, { left: axisWidth, top: plot - plot * f, backgroundColor: colors.gridLine }]} />
            <Text style={[styles.axisLabel, { top: plot - plot * f - 7, width: axisWidth - 6 }]}>{fmt(top * f)}</Text>
          </React.Fragment>
        ))}
        <View style={[styles.bars, { height: plot, marginLeft: axisWidth, borderBottomColor: colors.gridLine }]}>
          {labels.map((label, i) => (
            <Pressable
              key={`${label}-${i}`}
              accessibilityLabel={`${label}: ${series.map(s => `${s.name} ${show(s.values[i])}`).join(', ')}`}
              onHoverIn={() => setHover(i)}
              onHoverOut={() => setHover(current => (current === i ? null : current))}
              onPressIn={() => setHover(i)}
              style={styles.barSlot}
            >
              <View style={[styles.stack, { opacity: hover === null || hover === i ? 1 : 0.45 }]}>
                {/* Drawn top-down, so the first series ends up on the baseline. */}
                {[...series].reverse().map((s, si, stacked) => {
                  const v = s.values[i] ?? 0;
                  if (v <= 0) return null;
                  const isTop = stacked.slice(0, si).every(prev => (prev.values[i] ?? 0) <= 0);
                  return (
                    <View
                      key={s.name}
                      style={{
                        height: Math.max(3, (v / top) * plot),
                        backgroundColor: s.color,
                        borderTopLeftRadius: isTop ? 4 : 0,
                        borderTopRightRadius: isTop ? 4 : 0,
                        marginTop: isTop ? 0 : 2,
                      }}
                    />
                  );
                })}
              </View>
            </Pressable>
          ))}
        </View>
        <View style={[styles.barLabels, { marginLeft: axisWidth }]}>
          {labels.map((label, i) => (
            <Text key={`${label}-l-${i}`} numberOfLines={1} style={styles.barLabel}>{label}</Text>
          ))}
        </View>
        {hover !== null && width > 0 ? (
          <Tooltip
            title={labels[hover]}
            left={axisWidth + ((hover + 0.5) / labels.length) * (width - axisWidth)}
            width={width}
            rows={[
              ...series.map(s => ({ color: s.color, label: s.name, value: show(s.values[hover]) })),
              { label: 'Total', value: show(totals[hover]) },
            ]}
          />
        ) : null}
      </View>
      <Legend items={series.map(s => ({ color: s.color, label: s.name }))} />
    </View>
  );
}

/**
 * Donut for a part-to-whole split of a few categories (≤ 5). The centre shows
 * the total (or the hovered part); the legend carries labels and values so
 * identity is never colour alone.
 */
export function DonutChart({
  segments,
  size = 150,
  centerLabel = 'total',
  formatValue,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  size?: number;
  centerLabel?: string;
  formatValue?: (value: number) => string;
}) {
  const colors = useColors();
  const styles = useChartStyles();
  const [hover, setHover] = useState<number | null>(null);
  const show = (v: number) => (formatValue ? formatValue(v) : fmt(v));
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // 2px surface gap between segments, measured along the ring.
  const gap = segments.filter(s => s.value > 0).length > 1 ? 2 : 0;
  let offset = 0;
  const arcs = segments.map(s => {
    const length = total > 0 ? (Math.max(0, s.value) / total) * circumference : 0;
    const arc = { ...s, length: Math.max(0, length - gap), offset };
    offset += length;
    return arc;
  });
  const focus = hover !== null ? segments[hover] : null;
  return (
    <View style={styles.donutWrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.gridLine} strokeWidth={stroke} fill="none" />
          {arcs.map((arc, i) =>
            arc.length > 0 ? (
              <Circle
                key={arc.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={arc.color}
                strokeOpacity={hover === null || hover === i ? 1 : 0.35}
                strokeWidth={hover === i ? stroke + 4 : stroke}
                fill="none"
                strokeDasharray={`${arc.length} ${circumference}`}
                strokeDashoffset={-arc.offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            ) : null,
          )}
        </Svg>
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={styles.ringValue}>{show(focus ? focus.value : total)}</Text>
          <Text numberOfLines={1} style={styles.ringLabel}>{focus ? focus.label : centerLabel}</Text>
        </View>
      </View>
      <View style={styles.donutLegend}>
        {segments.map((s, i) => (
          <Pressable
            key={s.label}
            accessibilityLabel={`${s.label}: ${show(s.value)}`}
            onHoverIn={() => setHover(i)}
            onHoverOut={() => setHover(current => (current === i ? null : current))}
            onPressIn={() => setHover(i)}
            style={[styles.donutRow, hover === i && { backgroundColor: colors.gridLine }]}
          >
            <View style={[styles.donutSwatch, { backgroundColor: s.color }]} />
            <Text numberOfLines={1} style={styles.donutLabel}>{s.label}</Text>
            <Text style={styles.donutValue}>{show(s.value)}</Text>
            <Text style={styles.donutShare}>{total > 0 ? `${Math.round((s.value / total) * 100)}%` : '—'}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Legend({ items }: { items: Array<{ color: string; label: string }> }) {
  const styles = useChartStyles();
  return (
    <View style={styles.legend}>
      {items.map(item => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
          <Text style={styles.legendText}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Change against the previous period: ▲ 12% / ▼ 4% / no change. */
export function Delta({
  current,
  previous,
  suffix = 'vs last month',
  invert = false,
}: {
  current: number;
  previous: number;
  suffix?: string;
  /** Rising is bad (e.g. cancellations): ▲ shows in the critical tone. */
  invert?: boolean;
}) {
  const colors = useColors();
  const styles = useChartStyles();
  const change = useMemo(() => {
    if (previous === 0) return current === 0 ? 0 : null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }, [current, previous]);
  const up = (change ?? 1) > 0;
  const flat = change === 0;
  const tone = flat ? colors.textMuted : up !== invert ? colors.success : colors.criticalSeverity;
  return (
    <View style={styles.delta}>
      <View style={[styles.deltaPill, { backgroundColor: tone + '1A' }]}>
        <Text style={[styles.deltaText, { color: tone }]}>
          {flat ? '— 0%' : change === null ? '▲ new' : `${up ? '▲' : '▼'} ${Math.abs(change)}%`}
        </Text>
      </View>
      <Text style={styles.deltaSuffix}>{suffix}</Text>
    </View>
  );
}

const useChartStyles = makeStyles(c =>
  StyleSheet.create({
    axisLabel: { position: 'absolute', left: 0, textAlign: 'right', fontSize: 10.5, color: c.textMuted },
    xLabel: { position: 'absolute', width: 60, textAlign: 'center', fontSize: 10.5, color: c.textMuted },
    hitRow: { position: 'absolute', flexDirection: 'row' },
    hit: { flex: 1, height: '100%' },
    tooltip: {
      position: 'absolute',
      top: 0,
      padding: 10,
      borderRadius: 10,
      backgroundColor: c.backgroundSecondary,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      gap: 4,
    },
    tooltipTitle: { fontSize: 12, fontWeight: '800', color: c.textDarker },
    tooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tooltipSwatch: { width: 8, height: 8, borderRadius: 2 },
    tooltipLabel: { flex: 1, fontSize: 11.5, color: c.text },
    tooltipValue: { fontSize: 12, fontWeight: '800', color: c.textDarker },
    bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1 },
    barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
    bar: { width: '78%', maxWidth: 46, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
    barLabels: { flexDirection: 'row', gap: 2, marginTop: 6 },
    barLabel: { flex: 1, textAlign: 'center', fontSize: 10.5, color: c.textMuted },
    meter: { marginBottom: 12 },
    meterHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 5 },
    meterLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: c.textDarker },
    meterValue: { fontSize: 13, fontWeight: '800', color: c.textDarker },
    meterTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    meterFill: { height: '100%', borderRadius: 4 },
    meterSub: { fontSize: 11, marginTop: 3, color: c.textMuted },
    ringCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
    ringValue: { fontSize: 24, fontWeight: '900', color: c.textDarker, letterSpacing: -0.5 },
    ringLabel: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    heatRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
    heatRowLabel: { width: 34, fontSize: 10.5, color: c.textMuted },
    heatCell: { flex: 1, height: 22, borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
    heatColLabel: { flex: 1, fontSize: 9.5, textAlign: 'center', color: c.textMuted },
    heatCaption: { fontSize: 11.5, color: c.textMuted, marginTop: 6 },
    gridRule: { position: 'absolute', right: 0, height: 1 },
    stack: { width: '78%', maxWidth: 46 },
    donutWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 },
    donutLegend: { flexGrow: 1, flexBasis: 180, gap: 2 },
    donutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8 },
    donutSwatch: { width: 10, height: 10, borderRadius: 3 },
    donutLabel: { flex: 1, fontSize: 12.5, fontWeight: '600', color: c.text },
    donutValue: { fontSize: 12.5, fontWeight: '800', color: c.textDarker },
    donutShare: { width: 38, textAlign: 'right', fontSize: 11.5, color: c.textMuted },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendSwatch: { width: 12, height: 4, borderRadius: 2 },
    legendText: { fontSize: 12, fontWeight: '600', color: c.text },
    delta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    deltaPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
    deltaText: { fontSize: 11.5, fontWeight: '800' },
    deltaSuffix: { fontSize: 11.5, color: c.textMuted },
  }),
);
