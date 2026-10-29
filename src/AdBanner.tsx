import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './icons';
import { useColors } from './theme';
import { GradientShade } from './ui';

export type AdItem = {
  id: string | number;
  type: 'image' | 'video';
  mediaUrl: string;
  targetUrl?: string;
  advertiserLogo: string;
  advertiserName: string;
  tagline?: string;
  addedBy?: string;
  creatorType?: 'school_admin_a' | 'school_administrator' | 'super_admin';
};

const AUTOPLAY_INTERVAL = 6000;

/** Muted looping video; react-native-video's role in the iCampus app. */
export function AdVideo({ uri, playing, style }: { uri: string; playing: boolean; style: object }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (playing) void ref.current?.play().catch(() => {});
    else ref.current?.pause();
  }, [playing]);
  if (Platform.OS !== 'web') return <Image source={{ uri }} style={style as any} />;
  return React.createElement('video', {
    ref,
    src: uri,
    muted: true,
    loop: true,
    playsInline: true,
    autoPlay: playing,
    style: { width: '100%', height: '100%', objectFit: 'cover' },
  });
}

/** "https://www.shop.com/deals" → "shop.com". */
export const displayDomain = (url?: string) => {
  if (!url) return '';
  const match = /^(?:[a-z]+:\/\/)?(?:www\.)?([^/?#]+)/i.exec(url.trim());
  return match ? match[1] : url;
};

/** One advertisement as a photo card with the advertiser overlaid. */
export function AdCard({
  ad,
  playing,
  height = 230,
  onHoverChange,
}: {
  ad: AdItem;
  playing: boolean;
  height?: number;
  onHoverChange?: (hovered: boolean) => void;
}) {
  const lift = useRef(new Animated.Value(0)).current;
  const hover = (toValue: number) => {
    onHoverChange?.(toValue === 1);
    Animated.timing(lift, { toValue, duration: 220, useNativeDriver: true }).start();
  };
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${ad.advertiserName}${ad.tagline ? `: ${ad.tagline}` : ''}`}
      disabled={!ad.targetUrl}
      onPress={() => ad.targetUrl && void Linking.openURL(ad.targetUrl)}
      onHoverIn={() => hover(1)}
      onHoverOut={() => hover(0)}
      style={[styles.card, { height }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }] }]}>
        {ad.type === 'video' ? (
          <AdVideo uri={ad.mediaUrl} playing={playing} style={styles.media} />
        ) : (
          <Image source={{ uri: ad.mediaUrl }} resizeMode="cover" style={styles.media} />
        )}
      </Animated.View>
      <GradientShade from={0.05} to={0.85} />
      <View style={styles.topRow}>
        <View style={styles.glassPill}>
          <Icon name="campaign" size={13} color="#fff" />
          <Text style={styles.glassText}>Sponsored</Text>
        </View>
        {ad.type === 'video' ? (
          <View style={styles.glassPill}>
            <Icon name="play-arrow" size={14} color="#fff" />
            <Text style={styles.glassText}>Video</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Image source={{ uri: ad.advertiserLogo }} style={styles.logo} />
        <View style={styles.footerText}>
          <Text numberOfLines={1} style={styles.advertiser}>{ad.advertiserName}</Text>
          <Text numberOfLines={2} style={styles.tagline}>{ad.tagline || 'Tap to learn more'}</Text>
        </View>
        {ad.targetUrl ? (
          <View style={styles.visit}>
            <Icon name="arrow-outward" size={18} color="#1d1a18" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function PageDot({ active, onPress }: { active: boolean; onPress: () => void }) {
  const colors = useColors();
  const width = useRef(new Animated.Value(active ? 24 : 8)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: active ? 24 : 8, duration: 250, useNativeDriver: false }).start();
  }, [active, width]);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} hitSlop={6}>
      <Animated.View style={[styles.dot, { width, backgroundColor: active ? colors.primary : colors.primary + '33' }]} />
    </Pressable>
  );
}

/**
 * Advertisements shown `perPage` at a time; every few seconds the set slides
 * out and the next set slides in. Hovering pauses the rotation.
 */
export function AdBanner({ ads, perPage = 2 }: { ads: AdItem[]; perPage?: number }) {
  const colors = useColors();
  const visible = Math.max(1, Math.min(perPage, ads.length));
  const pageCount = Math.ceil(ads.length / visible);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);

  const goTo = useCallback(
    (next: number, direction = 1) => {
      if (animating.current || pageCount <= 1) return;
      animating.current = true;
      Animated.timing(slide, { toValue: -direction, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
        setPage(((next % pageCount) + pageCount) % pageCount);
        slide.setValue(direction);
        Animated.timing(slide, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
          animating.current = false;
        });
      });
    },
    [pageCount, slide],
  );

  useEffect(() => {
    if (pageCount <= 1 || paused) return;
    const timer = setInterval(() => goTo(page + 1), AUTOPLAY_INTERVAL);
    return () => clearInterval(timer);
  }, [goTo, page, pageCount, paused]);

  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  if (ads.length === 0) return null;
  // The last set wraps around to the start so every set is full.
  const items = Array.from({ length: visible }, (_, offset) => ads[(page * visible + offset) % ads.length]);
  return (
    <View>
      <Animated.View
        style={[
          styles.row,
          {
            opacity: slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
            transform: [{ translateX: slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [-48, 0, 48] }) }],
          },
        ]}
      >
        {items.map((ad, offset) => (
          <View key={`${ad.id}-${offset}`} style={styles.cell}>
            <AdCard ad={ad} playing onHoverChange={setPaused} />
          </View>
        ))}
      </Animated.View>
      {pageCount > 1 ? (
        <View style={styles.controls}>
          <Pressable
            accessibilityLabel="Previous advertisements"
            onPress={() => goTo(page - 1, -1)}
            style={({ hovered }: any) => [styles.control, { borderColor: colors.borderSubtle }, hovered && { backgroundColor: colors.primary + '12' }]}
          >
            <Icon name="chevron-left" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.dots}>
            {Array.from({ length: pageCount }, (_, index) => (
              <PageDot key={index} active={index === page} onPress={() => index !== page && goTo(index, index > page ? 1 : -1)} />
            ))}
          </View>
          <Pressable
            accessibilityLabel="Next advertisements"
            onPress={() => goTo(page + 1)}
            style={({ hovered }: any) => [styles.control, { borderColor: colors.borderSubtle }, hovered && { backgroundColor: colors.primary + '12' }]}
          >
            <Icon name="chevron-right" size={20} color={colors.text} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 16 },
  cell: { flex: 1, minWidth: 0 },
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#2a2a2e' },
  media: { width: '100%', height: '100%' },
  topRow: { position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row', gap: 8 },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  glassText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  footer: { position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
  footerText: { flex: 1, minWidth: 0 },
  advertiser: { color: '#fff', fontSize: 16, fontWeight: '800' },
  tagline: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  visit: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 16 },
  control: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
});
