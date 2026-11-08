import React, {useEffect, useMemo, useState} from 'react';
import {Image, View, StyleSheet, useWindowDimensions} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import {isTV} from '../../lib/tv';
import {
  getCachedLoginPosters,
  refreshLoginPosters,
} from '../../lib/loginPosters';

// Abstract "poster wall" that slowly drifts like Netflix's sign-in backdrop.
// Pure gradients, so it needs no network and no image assets.
const PALETTE: [string, string][] = [
  ['#1a0508', '#8a111d'],
  ['#0d1018', '#2b3556'],
  ['#161616', '#3b3b3b'],
  ['#240a0a', '#b3172a'],
  ['#0b1717', '#1f4d4d'],
  ['#170f22', '#4d2c70'],
  ['#1f1305', '#7a4a10'],
];

const GAP = 10;

interface ColumnProps {
  index: number;
  tileW: number;
  tileH: number;
  tiles: number;
  posters: string[];
}

const Column = React.memo(({index, tileW, tileH, tiles, posters}: ColumnProps) => {
  const setHeight = tiles * (tileH + GAP);
  const y = useSharedValue(index % 2 === 0 ? 0 : -setHeight);

  useEffect(() => {
    const goingUp = index % 2 === 0;
    y.value = goingUp ? 0 : -setHeight;
    y.value = withRepeat(
      withTiming(goingUp ? -setHeight : 0, {
        duration: 42000 + (index % 3) * 9000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [index, setHeight, y]);

  const style = useAnimatedStyle(() => ({transform: [{translateY: y.value}]}));

  const items = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let round = 0; round < 2; round += 1) {
      for (let i = 0; i < tiles; i += 1) {
        const colors = PALETTE[(index * 3 + i * 5) % PALETTE.length];
        if (posters.length > 0) {
          const uri = posters[(index * 7 + i * 3) % posters.length];
          out.push(
            <View
              key={`${round}-${i}`}
              style={{
                width: tileW,
                height: tileH,
                borderRadius: 10,
                marginBottom: GAP,
                overflow: 'hidden',
                backgroundColor: colors[0],
              }}>
              <Image
                source={{uri}}
                resizeMode="cover"
                style={{width: tileW, height: tileH}}
              />
            </View>,
          );
          continue;
        }
        out.push(
          <LinearGradient
            key={`${round}-${i}`}
            colors={colors}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 1}}
            style={{
              width: tileW,
              height: tileH,
              borderRadius: 10,
              marginBottom: GAP,
            }}
          />,
        );
      }
    }
    return out;
  }, [index, tiles, tileW, tileH, posters]);

  return (
    <Animated.View style={[{width: tileW, marginRight: GAP}, style]}>
      {items}
    </Animated.View>
  );
});

const PosterWall = () => {
  const {width, height} = useWindowDimensions();
  const [posters, setPosters] = useState<string[]>(() => getCachedLoginPosters());

  useEffect(() => {
    let alive = true;
    refreshLoginPosters().then(urls => {
      if (alive && urls.length && urls.join() !== posters.join()) {
        setPosters(urls);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tileW = isTV ? 210 : 116;
  const tileH = Math.round(tileW * 1.5);
  const diagonal = Math.sqrt(width * width + height * height);
  const columns = Math.ceil(diagonal / (tileW + GAP)) + 1;
  const tiles = Math.ceil(diagonal / (tileH + GAP)) + 1;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={{
          position: 'absolute',
          width: diagonal,
          height: diagonal,
          left: (width - diagonal) / 2,
          top: (height - diagonal) / 2,
          flexDirection: 'row',
          overflow: 'hidden',
          opacity: posters.length ? 0.8 : 0.55,
          transform: [{rotate: '-14deg'}],
        }}>
        {Array.from({length: columns}).map((_, i) => (
          <Column
            key={i}
            index={i}
            tileW={tileW}
            tileH={tileH}
            tiles={tiles}
            posters={posters}
          />
        ))}
      </View>
      {/* vignette: keeps the form readable and gives the Netflix fade-to-black */}
      <LinearGradient
        colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(229,9,20,0.22)', 'rgba(229,9,20,0)']}
        start={{x: 0.5, y: 1}}
        end={{x: 0.5, y: 0.35}}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
};

export default React.memo(PosterWall);
