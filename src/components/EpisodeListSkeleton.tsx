import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useM3Colors} from '../theme/M3PaletteContext';
import {LEGACY_TERTIARY_BACKGROUND} from '../theme/seeds';
import SkeletonLoader from './Skeleton';

// Downloads use the shared native shimmer; season placeholders remain static.
const EpisodeListSkeleton = ({downloaded = false}: {downloaded?: boolean}) => {
  const colors = useM3Colors();
  const fill = downloaded ? colors.surfaceContainerHighest : '#333333';
  if (downloaded) {
    const block = (width: number | string, height: number, radius: number) => (
      <SkeletonLoader width={width} height={height} marginVertical={0}
        baseColor={colors.surfaceContainerHighest}
        highlightColor={colors.outlineVariant}
        style={{borderRadius: radius}} />
    );
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Checking downloaded files" accessibilityState={{busy: true}}>
        {[0, 1, 2].map(index => (
          <View key={index} style={[styles.row, {marginBottom: 12}]}>
            <View style={[styles.card, {height: 64, borderWidth: 0, borderRadius: 20, paddingHorizontal: 16, backgroundColor: colors.surfaceContainerHigh}]}>
              {block(80, 45, 12)}
              <View style={styles.text}>
                {block('78%', 16, 4)}
                <View style={{marginTop: 8}}>{block('56%', 12, 4)}</View>
              </View>
            </View>
            {block(64, 64, 20)}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={downloaded ? 'Checking downloaded files' : 'Loading episodes'} accessibilityState={{busy: true}}>
      {[0, 1, 2].map(index => (
        <View key={index} style={[styles.row, {marginVertical: downloaded ? 0 : 6, marginBottom: downloaded ? 12 : 6}]}>
          <View style={[styles.card, {
            height: downloaded ? 64 : 76,
            borderRadius: downloaded ? 20 : 14,
            paddingHorizontal: downloaded ? 16 : 12,
            backgroundColor: downloaded ? colors.surfaceContainerHigh : LEGACY_TERTIARY_BACKGROUND,
            borderColor: downloaded ? colors.outlineVariant : 'rgba(255,255,255,0.08)',
          }]}>
            <View style={{width: downloaded ? 80 : 88, height: downloaded ? 45 : 56, borderRadius: downloaded ? 12 : 4, backgroundColor: fill}} />
            <View style={styles.text}>
              <View style={{width: '78%', height: 16, borderRadius: 4, backgroundColor: fill}} />
              <View style={{width: '56%', height: 12, marginTop: 8, borderRadius: 4, backgroundColor: fill}} />
            </View>
            {!downloaded && <View style={{width: 32, height: 32, borderRadius: 16, backgroundColor: fill}} />}
          </View>
          {downloaded && <View style={{width: 64, height: 64, borderRadius: 20, backgroundColor: colors.errorContainer}} />}
        </View>
      ))}
    </View>
  );
};
const styles = StyleSheet.create({
  row: {width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8},
  card: {flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1},
  text: {flex: 1, minWidth: 0, marginHorizontal: 12},
});
export default React.memo(EpisodeListSkeleton);
