import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {StatusBar} from 'expo-status-bar';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {RootStackParamList} from '../../App';
import {TVFocusable, TVFocusGuide} from '../../components/tv';
import AppText from '../../components/ui/Text';
import {
  liveChannelPlayerParams,
  loadLiveChannels,
  readCachedChannels,
  writeCachedChannels,
  type LiveChannel,
} from '../../lib/liveTv/liveTv';
import {fetchLiveTvSources} from '../../lib/services/remoteConfig';
import {isTV} from '../../lib/tv';
import {useTVFocusBorderColor} from '../../lib/tv/useTVFocusBorderColor';
import {useM3Colors} from '../../theme/M3PaletteContext';

const REFRESH_AFTER_MS = 10 * 60 * 1000;

interface CardProps {
  channel: LiveChannel;
  width: number;
  preferredFocus: boolean;
  onPress: (channel: LiveChannel) => void;
}

const ChannelCard = React.memo(
  ({channel, width, preferredFocus, onPress}: CardProps) => {
    const colors = useM3Colors();
    const focusBorderColor = useTVFocusBorderColor();
    const [logoFailed, setLogoFailed] = useState(false);
    const showLogo = !!channel.logo && !logoFailed;
    return (
      <TVFocusable
        accessibilityRole="button"
        accessibilityLabel={`Play ${channel.name}`}
        hasTVPreferredFocus={preferredFocus}
        onPress={() => onPress(channel)}
        borderRadius={14}
        focusScale={1.05}
        focusBorderColor={focusBorderColor}
        style={{
          width,
          backgroundColor: colors.surfaceContainerHigh,
          borderColor: colors.outlineVariant,
          borderRadius: 14,
          borderWidth: 1,
          overflow: 'hidden',
        }}>
        <View
          style={{
            alignItems: 'center',
            backgroundColor: colors.surfaceContainer,
            height: width * 0.62,
            justifyContent: 'center',
            padding: 10,
          }}>
          {showLogo ? (
            <Image
              source={{uri: channel.logo}}
              resizeMode="contain"
              onError={() => setLogoFailed(true)}
              style={{width: '100%', height: '100%'}}
            />
          ) : (
            <MaterialCommunityIcons
              name="television-classic"
              size={width * 0.28}
              color={colors.onSurfaceVariant}
            />
          )}
          <View
            style={{
              alignItems: 'center',
              backgroundColor: '#E50914',
              borderRadius: 6,
              flexDirection: 'row',
              gap: 4,
              left: 6,
              paddingHorizontal: 6,
              paddingVertical: 2,
              position: 'absolute',
              top: 6,
            }}>
            <View
              style={{backgroundColor: '#fff', borderRadius: 3, height: 5, width: 5}}
            />
            <AppText role="labelSmall" style={{color: '#fff', fontWeight: '800'}}>
              LIVE
            </AppText>
          </View>
        </View>
        <View style={{paddingHorizontal: 10, paddingVertical: 9}}>
          <AppText
            role="labelLargeEmphasized"
            numberOfLines={2}
            style={{color: colors.onSurface, minHeight: 36}}>
            {channel.name}
          </AppText>
        </View>
      </TVFocusable>
    );
  },
);

interface Section {
  name: string;
  channels: LiveChannel[];
}

const SectionRow = React.memo(
  ({
    section,
    cardWidth,
    firstRow,
    onPress,
  }: {
    section: Section;
    cardWidth: number;
    firstRow: boolean;
    onPress: (channel: LiveChannel) => void;
  }) => {
    const colors = useM3Colors();
    return (
      <View style={{marginBottom: 18}}>
        <View
          style={{
            alignItems: 'baseline',
            flexDirection: 'row',
            gap: 8,
            marginBottom: 10,
            paddingLeft: isTV ? 12 : 6,
          }}>
          <AppText
            role="titleLargeEmphasized"
            numberOfLines={1}
            style={{color: colors.onBackground, flexShrink: 1}}>
            {section.name}
          </AppText>
          <AppText role="labelMedium" style={{color: colors.onSurfaceVariant}}>
            {section.channels.length}
          </AppText>
        </View>
        <FlatList
          horizontal
          data={section.channels}
          keyExtractor={item => item.id}
          showsHorizontalScrollIndicator={false}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          contentContainerStyle={{
            gap: 10,
            paddingLeft: isTV ? 12 : 6,
            paddingRight: isTV ? 48 : 6,
          }}
          renderItem={({item, index}) => (
            <ChannelCard
              channel={item}
              width={cardWidth}
              preferredFocus={isTV && firstRow && index === 0}
              onPress={onPress}
            />
          )}
        />
      </View>
    );
  },
);

const LiveTv = () => {
  const insets = useSafeAreaInsets();
  const colors = useM3Colors();
  const focusBorderColor = useTVFocusBorderColor();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [channels, setChannels] = useState<LiveChannel[]>(() => readCachedChannels());
  const [loading, setLoading] = useState(channels.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(0);
  const [noSources, setNoSources] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const lastLoad = useRef(0);

  const load = useCallback(async (manual: boolean) => {
    if (manual) {
      setRefreshing(true);
    }
    setError('');
    try {
      const sources = await fetchLiveTvSources();
      setNoSources(sources.length === 0);
      if (sources.length === 0) {
        setChannels([]);
        setFailed(0);
        writeCachedChannels([]);
      } else {
        const result = await loadLiveChannels(sources);
        setFailed(result.failed);
        // Keep the previous list if every link is down right now.
        if (result.channels.length > 0) {
          setChannels(result.channels);
          writeCachedChannels(result.channels);
        }
      }
      lastLoad.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load channels');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // Coming back to the tab after a while quietly refreshes the list.
  useFocusEffect(
    useCallback(() => {
      if (lastLoad.current && Date.now() - lastLoad.current > REFRESH_AFTER_MS) {
        load(false);
      }
    }, [load]),
  );

  // One slider per category, in the order they appear in the lists.
  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, LiveChannel[]>();
    channels.forEach(c => {
      if (q && !c.name.toLowerCase().includes(q)) {
        return;
      }
      const list = map.get(c.category);
      if (list) {
        list.push(c);
      } else {
        map.set(c.category, [c]);
      }
    });
    return [...map.entries()].map(([name, list]) => ({name, channels: list}));
  }, [channels, query]);

  const play = useCallback(
    (channel: LiveChannel) => {
      navigation.navigate('Player', liveChannelPlayerParams(channel));
    },
    [navigation],
  );

  const cardWidth = isTV ? 190 : 140;

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={{alignItems: 'center', paddingTop: 80}}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    const title = error
      ? 'Could not load channels'
      : noSources
        ? 'No channels yet'
        : query
          ? 'No matching channels'
          : failed > 0
            ? 'Channels are unavailable'
            : 'No channels yet';
    const message = error
      ? error
      : noSources
        ? 'Live channels are added by the CineHub admin.'
        : query
          ? 'Try another channel name.'
          : 'The channel list could not be reached. Check your internet connection and try again.';
    return (
      <View style={{alignItems: 'center', paddingHorizontal: 32, paddingTop: 80}}>
        <MaterialCommunityIcons
          name="television-off"
          size={64}
          color={colors.onSurfaceVariant}
        />
        <AppText
          role="titleLargeEmphasized"
          style={{color: colors.onSurface, marginTop: 16, textAlign: 'center'}}>
          {title}
        </AppText>
        <AppText
          role="bodyMedium"
          style={{color: colors.onSurfaceVariant, marginTop: 8, textAlign: 'center'}}>
          {message}
        </AppText>
        {!query && (
          <TVFocusable
            accessibilityRole="button"
            onPress={() => {
              setLoading(true);
              load(false);
            }}
            hasTVPreferredFocus={isTV}
            borderRadius={22}
            focusBorderColor={focusBorderColor}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 22,
              marginTop: 20,
              paddingHorizontal: 26,
              paddingVertical: 11,
            }}>
            <AppText role="labelLargeEmphasized" style={{color: colors.onPrimary}}>
              Retry
            </AppText>
          </TVFocusable>
        )}
      </View>
    );
  };

  return (
    <TVFocusGuide
      trapFocusRight={true}
      trapFocusDown={true}
      trapFocusUp={true}
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: isTV ? 0 : insets.top,
      }}>
      <StatusBar />
      <View style={{flex: 1, paddingHorizontal: 6}}>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 12,
            marginTop: isTV ? 16 : 22,
            paddingLeft: isTV ? 12 : 6,
            paddingRight: isTV ? 48 : 6,
          }}>
          <AppText
            role="headlineLargeEmphasized"
            style={{color: colors.onBackground}}>
            Live TV
          </AppText>
          <TVFocusable
            accessibilityRole="button"
            accessibilityLabel="Refresh channels"
            onPress={() => load(true)}
            borderRadius={20}
            focusScale={1.1}
            focusBorderColor={focusBorderColor}
            style={{
              alignItems: 'center',
              borderRadius: 20,
              justifyContent: 'center',
              minHeight: 40,
              minWidth: 40,
            }}>
            {refreshing ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <MaterialCommunityIcons name="refresh" size={26} color={colors.onSurfaceVariant} />
            )}
          </TVFocusable>
        </View>

        {channels.length > 0 && (
          <View
            style={{
              alignItems: 'center',
              backgroundColor: colors.surfaceContainerHigh,
              borderRadius: 26,
              flexDirection: 'row',
              height: isTV ? 52 : 48,
              marginBottom: 16,
              marginHorizontal: isTV ? 12 : 6,
              paddingHorizontal: 14,
            }}>
            <MaterialCommunityIcons name="magnify" size={22} color={colors.onSurfaceVariant} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search channels"
              placeholderTextColor={colors.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              cursorColor={colors.primary}
              selectionColor={colors.primary}
              style={{color: colors.onSurface, flex: 1, fontSize: 16, marginLeft: 10, paddingVertical: 0}}
            />
            {!!query && (
              <TVFocusable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setQuery('')}
                borderRadius={16}
                style={{padding: 4}}>
                <MaterialCommunityIcons name="close-circle" size={20} color={colors.onSurfaceVariant} />
              </TVFocusable>
            )}
          </View>
        )}

        <FlatList
          data={sections}
          keyExtractor={item => item.name}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{paddingBottom: 24}}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          keyboardShouldPersistTaps="handled"
          onRefresh={isTV ? undefined : () => load(true)}
          refreshing={refreshing}
          ListEmptyComponent={renderEmpty}
          renderItem={({item, index}) => (
            <SectionRow
              section={item}
              cardWidth={cardWidth}
              firstRow={index === 0}
              onPress={play}
            />
          )}
        />
      </View>
    </TVFocusGuide>
  );
};

export default LiveTv;
