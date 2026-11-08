import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Share,
  Switch,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import type {SettingsStackParamList} from '../../App';
import {TVFocusable, TVFocusGuide} from '../../components/tv';
import AppText from '../../components/ui/Text';
import usePartyStore, {normalizeCode} from '../../lib/watchParty/watchParty';
import {isTV} from '../../lib/tv';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {Avatar} from '../profile/Profile';

type Props = NativeStackScreenProps<SettingsStackParamList, 'WatchTogether'>;

const RED = '#E50914';

const WatchTogether = ({navigation}: Props) => {
  const colors = useM3Colors();
  const {
    code,
    status,
    isHost,
    hostOnly,
    members,
    content,
    chat,
    createRoom,
    joinRoom,
    leaveRoom,
    setHostOnly,
    sendChat,
  } = usePartyStore();

  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const chatScroll = useRef<ScrollView>(null);

  const run = async (kind: 'create' | 'join') => {
    if (busy) {
      return;
    }
    setError('');
    setBusy(kind);
    try {
      if (kind === 'create') {
        await createRoom();
      } else {
        await joinRoom(joinCode);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const share = () => {
    if (!code) {
      return;
    }
    Share.share({
      message: `Watch with me on CineHub! Open Settings → Watch Together → Join and enter this code: ${code}`,
    }).catch(() => {});
  };

  const button = (
    label: string,
    onPress: () => void,
    opts: {primary?: boolean; loading?: boolean; icon?: string} = {},
  ) => (
    <TVFocusable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!!busy}
      borderRadius={14}
      style={{
        alignItems: 'center',
        backgroundColor: opts.primary ? RED : colors.surfaceContainerHigh,
        borderRadius: 14,
        flexDirection: 'row',
        gap: 8,
        height: 52,
        justifyContent: 'center',
        paddingHorizontal: 18,
      }}>
      {opts.loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          {opts.icon && (
            <MaterialCommunityIcons
              name={opts.icon as any}
              size={20}
              color={opts.primary ? '#fff' : colors.onSurface}
            />
          )}
          <AppText
            role="labelLargeEmphasized"
            style={{color: opts.primary ? '#fff' : colors.onSurface, fontSize: 16}}>
            {label}
          </AppText>
        </>
      )}
    </TVFocusable>
  );

  const header = (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 18,
        marginTop: isTV ? 16 : 10,
      }}>
      <TVFocusable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => navigation.goBack()}
        borderRadius={20}
        style={{padding: 8}}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onBackground} />
      </TVFocusable>
      <AppText role="headlineMediumEmphasized" style={{color: colors.onBackground}}>
        Watch Together
      </AppText>
    </View>
  );

  // ───────────── not in a room ─────────────
  if (!code) {
    return (
      <TVFocusGuide style={{flex: 1, backgroundColor: colors.background}}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{padding: 16, paddingBottom: 40}}>
          {header}
          <View style={{alignItems: 'center', marginBottom: 22}}>
            <View
              style={{
                alignItems: 'center',
                backgroundColor: 'rgba(229,9,20,0.15)',
                borderRadius: 40,
                height: 80,
                justifyContent: 'center',
                width: 80,
              }}>
              <MaterialCommunityIcons name="account-group" size={42} color={RED} />
            </View>
            <AppText
              role="bodyLarge"
              style={{
                color: colors.onSurfaceVariant,
                marginTop: 14,
                maxWidth: 320,
                textAlign: 'center',
              }}>
              Watch the same movie or show at the same time with family and friends. Play, pause and
              seek stay in sync.
            </AppText>
          </View>

          {button('Create a room', () => run('create'), {
            primary: true,
            loading: busy === 'create',
            icon: 'plus-circle-outline',
          })}

          <AppText
            role="labelLarge"
            style={{color: colors.onSurfaceVariant, marginVertical: 18, textAlign: 'center'}}>
            or join a friend
          </AppText>

          <TextInput
            value={joinCode}
            onChangeText={t => setJoinCode(normalizeCode(t))}
            placeholder="ROOM CODE"
            placeholderTextColor={colors.onSurfaceVariant}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            cursorColor={RED}
            selectionColor={RED}
            style={{
              backgroundColor: colors.surfaceContainerHigh,
              borderRadius: 14,
              color: colors.onSurface,
              fontSize: 24,
              fontWeight: '800',
              height: 60,
              letterSpacing: 8,
              marginBottom: 12,
              textAlign: 'center',
            }}
          />
          {button('Join room', () => run('join'), {
            loading: busy === 'join',
            icon: 'login-variant',
          })}

          {!!error && (
            <AppText
              role="bodyMedium"
              style={{color: '#ff6b73', marginTop: 16, textAlign: 'center'}}>
              {error}
            </AppText>
          )}
        </ScrollView>
      </TVFocusGuide>
    );
  }

  // ───────────── in a room ─────────────
  return (
    <TVFocusGuide style={{flex: 1, backgroundColor: colors.background}}>
      <KeyboardAvoidingView style={{flex: 1}} behavior={isTV ? undefined : 'padding'}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{padding: 16, paddingBottom: 24}}>
          {header}

          <View
            style={{
              alignItems: 'center',
              backgroundColor: colors.surfaceContainerHigh,
              borderRadius: 18,
              marginBottom: 14,
              padding: 18,
            }}>
            <AppText role="labelLarge" style={{color: colors.onSurfaceVariant}}>
              {status === 'connected' ? 'ROOM CODE' : 'CONNECTING…'}
            </AppText>
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                marginVertical: 12,
                width: '100%',
                justifyContent: 'center',
              }}>
              {code.split('').map((ch, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    maxWidth: 52,
                    aspectRatio: 0.8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.surfaceContainer,
                    borderColor: colors.outlineVariant,
                    borderRadius: 12,
                    borderWidth: 1,
                  }}>
                  <AppText
                    style={{
                      color: colors.onSurface,
                      fontSize: 28,
                      fontWeight: '900',
                      includeFontPadding: false,
                    }}>
                    {ch}
                  </AppText>
                </View>
              ))}
            </View>
            <View style={{flexDirection: 'row', gap: 10, marginTop: 6}}>
              {button('Share code', share, {icon: 'share-variant'})}
            </View>
          </View>

          <View
            style={{
              backgroundColor: colors.surfaceContainerHigh,
              borderRadius: 18,
              marginBottom: 14,
              padding: 16,
            }}>
            <AppText role="labelLarge" style={{color: colors.onSurfaceVariant}}>
              NOW PLAYING
            </AppText>
            <AppText
              role="titleMediumEmphasized"
              numberOfLines={2}
              style={{color: colors.onSurface, marginTop: 4}}>
              {content?.title ||
                (isHost
                  ? 'Open any movie or episode and press play. Everyone joins automatically.'
                  : 'Waiting for the host to pick something…')}
            </AppText>
          </View>

          <View
            style={{
              backgroundColor: colors.surfaceContainerHigh,
              borderRadius: 18,
              marginBottom: 14,
              padding: 16,
            }}>
            <AppText role="labelLarge" style={{color: colors.onSurfaceVariant, marginBottom: 10}}>
              WATCHING ({members.length})
            </AppText>
            {members.map(m => (
              <View
                key={m.key}
                style={{alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 6}}>
                <Avatar name={m.name} color={m.color} size={36} />
                <AppText role="bodyLarge" style={{color: colors.onSurface, flex: 1}}>
                  {m.name}
                </AppText>
                {m.host && (
                  <View
                    style={{
                      backgroundColor: 'rgba(229,9,20,0.2)',
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}>
                    <AppText role="labelSmall" style={{color: RED, fontWeight: '800'}}>
                      HOST
                    </AppText>
                  </View>
                )}
              </View>
            ))}
            {isHost ? (
              <View
                style={{
                  alignItems: 'center',
                  borderTopColor: colors.outlineVariant,
                  borderTopWidth: 1,
                  flexDirection: 'row',
                  marginTop: 8,
                  paddingTop: 12,
                }}>
                <View style={{flex: 1, paddingRight: 12}}>
                  <AppText role="bodyLarge" style={{color: colors.onSurface}}>
                    Only host controls playback
                  </AppText>
                  <AppText role="bodySmall" style={{color: colors.onSurfaceVariant}}>
                    Off: anyone can pause or seek for everyone.
                  </AppText>
                </View>
                <Switch
                  value={hostOnly}
                  onValueChange={setHostOnly}
                  trackColor={{true: RED, false: colors.surfaceContainerHighest}}
                  thumbColor="#fff"
                />
              </View>
            ) : (
              <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 8}}>
                {hostOnly ? 'Only the host controls playback.' : 'Anyone can pause or seek.'}
              </AppText>
            )}
          </View>

          <View
            style={{
              backgroundColor: colors.surfaceContainerHigh,
              borderRadius: 18,
              marginBottom: 14,
              padding: 16,
            }}>
            <AppText role="labelLarge" style={{color: colors.onSurfaceVariant, marginBottom: 8}}>
              CHAT
            </AppText>
            <ScrollView
              ref={chatScroll}
              nestedScrollEnabled
              style={{maxHeight: 200}}
              onContentSizeChange={() => chatScroll.current?.scrollToEnd({animated: true})}>
              {chat.length === 0 ? (
                <AppText role="bodyMedium" style={{color: colors.onSurfaceVariant}}>
                  No messages yet.
                </AppText>
              ) : (
                chat.map(m => (
                  <AppText key={m.id} role="bodyMedium" style={{color: colors.onSurface, marginBottom: 4}}>
                    <AppText role="labelLargeEmphasized" style={{color: m.mine ? RED : colors.primary}}>
                      {m.mine ? 'You' : m.name}:{' '}
                    </AppText>
                    {m.text}
                  </AppText>
                ))
              )}
            </ScrollView>
            <View style={{alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 10}}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Say something…"
                placeholderTextColor={colors.onSurfaceVariant}
                maxLength={300}
                returnKeyType="send"
                onSubmitEditing={() => {
                  sendChat(message);
                  setMessage('');
                }}
                cursorColor={RED}
                selectionColor={RED}
                style={{
                  backgroundColor: colors.surfaceContainer,
                  borderRadius: 22,
                  color: colors.onSurface,
                  flex: 1,
                  fontSize: 15,
                  height: 44,
                  paddingHorizontal: 16,
                }}
              />
              <TVFocusable
                accessibilityRole="button"
                accessibilityLabel="Send"
                onPress={() => {
                  sendChat(message);
                  setMessage('');
                }}
                borderRadius={22}
                style={{
                  alignItems: 'center',
                  backgroundColor: RED,
                  borderRadius: 22,
                  height: 44,
                  justifyContent: 'center',
                  width: 44,
                }}>
                <MaterialCommunityIcons name="send" size={20} color="#fff" />
              </TVFocusable>
            </View>
          </View>

          {button('Leave room', async () => {
            await leaveRoom();
            ToastAndroid.show('You left the room', ToastAndroid.SHORT);
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </TVFocusGuide>
  );
};

export default WatchTogether;
