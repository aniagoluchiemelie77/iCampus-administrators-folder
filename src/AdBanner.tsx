import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from './theme';

export type AdItem = {
  id: string | number;
  type: 'image' | 'video';
  mediaUrl: string;
  targetUrl?: string;
  advertiserLogo: string;
  advertiserName: string;
  tagline?: string;
  addedBy?: string;
  creatorType?: 'school_administrator' | 'super_admin';
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

function Dot({ active }: { active: boolean }) {
  const colors = useColors();
  const width = useRef(new Animated.Value(active ? 22 : 6)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: active ? 22 : 6, duration: 250, useNativeDriver: false }).start();
  }, [active, width]);
  return <Animated.View style={[styles.dot, { width, backgroundColor: active ? colors.primary : colors.border }]} />;
}

/** Auto-advancing advertisement carousel from the iCampus app. */
export function AdBanner({ ads, width }: { ads: AdItem[]; width: number }) {
  const colors = useColors();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (ads.length <= 1 || width <= 0) return;
    const timer = setInterval(() => {
      setCurrentIndex(previous => {
        const next = (previous + 1) % ads.length;
        scrollRef.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, AUTOPLAY_INTERVAL);
    return () => clearInterval(timer);
  }, [ads.length, width]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    if (index >= 0 && index < ads.length) setCurrentIndex(index);
  };

  if (ads.length === 0 || width <= 0) return null;
  return (
    <View style={styles.wrapper}>
      <View style={[styles.container, { width, backgroundColor: colors.backgroundSecondary }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          onScroll={Platform.OS === 'web' ? handleScroll : undefined}
          scrollEventThrottle={64}
        >
          {ads.map((ad, index) => (
            <Pressable
              key={String(ad.id)}
              accessibilityRole="link"
              onPress={() => ad.targetUrl && void Linking.openURL(ad.targetUrl)}
              style={[styles.slide, { width }]}
            >
              {ad.type === 'video' ? (
                <AdVideo uri={ad.mediaUrl} playing={currentIndex === index} style={styles.media} />
              ) : (
                <Image source={{ uri: ad.mediaUrl }} style={styles.media} />
              )}
              <View style={styles.shade} />
              <View style={[styles.detail, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <Image source={{ uri: ad.advertiserLogo }} style={styles.logo} />
                <View style={styles.detailText}>
                  <Text numberOfLines={1} style={[styles.advertiser, { color: colors.text }]}>{ad.advertiserName}</Text>
                  <Text numberOfLines={1} style={[styles.tagline, { color: colors.text }]}>{ad.tagline || 'Tap to learn more'}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {ads.length > 1 ? (
        <View style={styles.dots}>
          {ads.map((ad, index) => <Dot key={String(ad.id)} active={currentIndex === index} />)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginVertical: 12, alignItems: 'center' },
  container: {
    height: 210,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  slide: { height: 210 },
  media: { width: '100%', height: '100%' },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  detail: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    maxWidth: '82%',
    borderWidth: 1,
  },
  logo: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#eee' },
  detailText: { marginLeft: 10, flexShrink: 1 },
  advertiser: { fontSize: 13, fontWeight: '700' },
  tagline: { fontSize: 11, opacity: 0.75, marginTop: 2 },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  dot: { height: 6, borderRadius: 3, marginHorizontal: 3 },
});
