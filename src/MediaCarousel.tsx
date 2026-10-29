import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AdVideo } from './AdBanner';
import { useMeasuredWidth } from './charts';
import { Icon, IconName } from './icons';
import { useColors } from './theme';

function Arrow({ icon, label, side, onPress }: { icon: IconName; label: string; side: 'left' | 'right'; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // Stops the tap from also opening the post the carousel sits in.
      onPress={event => {
        event.stopPropagation?.();
        onPress();
      }}
      style={({ hovered, pressed }: any) => [
        styles.arrow,
        side === 'left' ? styles.arrowLeft : styles.arrowRight,
        (hovered || pressed) && styles.arrowActive,
        pressed && { transform: [{ scale: 0.92 }] },
      ]}
    >
      <Icon name={icon} size={24} color="#1d1a18" />
    </Pressable>
  );
}

/** Swipes between a post's images or videos with arrow buttons, a counter and dots. */
export function MediaCarousel({
  uris,
  type = 'image',
  height = 320,
}: {
  uris: string[];
  type?: 'image' | 'video';
  height?: number;
}) {
  const colors = useColors();
  const { width, onLayout } = useMeasuredWidth();
  const [index, setIndex] = useState(0);
  const offset = useRef(new Animated.Value(0)).current;
  const count = uris.length;

  useEffect(() => {
    Animated.timing(offset, { toValue: -index * width, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [index, offset, width]);

  if (count === 0) return null;
  const go = (step: number) => setIndex(current => (current + step + count) % count);

  return (
    <View onLayout={onLayout} style={[styles.frame, { height, backgroundColor: colors.background }]}>
      {width > 0 ? (
        <Animated.View style={[styles.track, { width: width * count, transform: [{ translateX: offset }] }]}>
          {uris.map((uri, position) => (
            <View key={`${uri}-${position}`} style={{ width, height }}>
              {type === 'video' ? (
                <AdVideo uri={uri} playing={position === index} style={styles.media} />
              ) : (
                <Image source={{ uri }} resizeMode="cover" style={styles.media} />
              )}
            </View>
          ))}
        </Animated.View>
      ) : null}
      {count > 1 ? (
        <>
          <Arrow icon="chevron-left" label="Previous media" side="left" onPress={() => go(-1)} />
          <Arrow icon="chevron-right" label="Next media" side="right" onPress={() => go(1)} />
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {index + 1} / {count}
            </Text>
          </View>
          <View style={styles.dots}>
            {uris.map((uri, position) => (
              <Pressable
                key={`${uri}-dot-${position}`}
                accessibilityLabel={`Show media ${position + 1}`}
                onPress={event => {
                  event.stopPropagation?.();
                  setIndex(position);
                }}
                style={[styles.dot, position === index && styles.dotActive]}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  track: { flexDirection: 'row', height: '100%' },
  media: { width: '100%', height: '100%' },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  arrowLeft: { left: 12 },
  arrowRight: { right: 12 },
  arrowActive: { backgroundColor: '#ffffff' },
  counter: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  dots: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotActive: { width: 20, backgroundColor: '#ffffff' },
});
