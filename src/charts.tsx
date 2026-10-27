import React, { useCallback, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

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

/**
 * Tiny trend line used on the iCampus dashboard summary cards. Drawn directly
 * with SVG: chart-kit reserves fixed label padding that leaves an 80×30 chart
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
