import React, {useCallback, useState} from 'react';
import {
  BackHandler,
  Linking,
  ScrollView,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {MaterialIcons} from '@expo/vector-icons';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {SettingsStackParamList} from '../../App';
import {TVFocusable, TVFocusGuide} from '../../components/tv';
import {isTV} from '../../lib/tv';
import {useM3Colors} from '../../theme/M3PaletteContext';
import useAuthStore from '../../lib/zustand/authStore';
import {showAppDialog} from '../../lib/zustand/appDialogStore';
import {clearManagedServers} from '../../lib/services/serverSync';
import {socialLinks} from '../../lib/constants';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Profile'>;

const RED = '#E50914';
const AVATAR_COLORS = ['#E50914', '#F5A623', '#46D369', '#2D9CDB', '#9B51E0', '#EB5757', '#00B8A9', '#8A8A8A'];

export const Avatar = ({
  name,
  color,
  size = 64,
}: {
  name?: string | null;
  color?: string | null;
  size?: number;
}) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.22,
      backgroundColor: color || RED,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
    <Text style={{color: '#fff', fontSize: size * 0.46, fontWeight: '800'}}>
      {(name || '?').trim().charAt(0).toUpperCase() || '?'}
    </Text>
  </View>
);

const Profile = ({navigation}: Props) => {
  const colors = useM3Colors();
  const profile = useAuthStore(s => s.profile);
  const user = useAuthStore(s => s.user);
  const isAdmin = useAuthStore(s => s.isAdmin);
  const updateProfile = useAuthStore(s => s.updateProfile);
  const signOut = useAuthStore(s => s.signOut);

  const [name, setName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!isTV) {
        return;
      }
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        navigation.goBack();
        return true;
      });
      return () => sub.remove();
    }, [navigation]),
  );

  const color = profile?.avatar_color || RED;
  const dirty = name.trim() !== (profile?.display_name ?? '') && name.trim().length > 0;

  const saveName = async () => {
    setSaving(true);
    try {
      await updateProfile({display_name: name.trim()});
      ToastAndroid.show('Profile updated', ToastAndroid.SHORT);
    } catch (e) {
      ToastAndroid.show(e instanceof Error ? e.message : 'Could not save', ToastAndroid.LONG);
    } finally {
      setSaving(false);
    }
  };

  const pickColor = async (c: string) => {
    try {
      await updateProfile({avatar_color: c});
    } catch {
      ToastAndroid.show('Could not change colour', ToastAndroid.SHORT);
    }
  };

  const confirmSignOut = () =>
    showAppDialog({
      title: 'Sign out?',
      message: 'You will need to sign in again to keep watching.',
      actions: [
        {label: 'Cancel'},
        {
          label: 'Sign out',
          variant: 'destructive',
          onPress: async () => {
            clearManagedServers();
            await signOut();
          },
        },
      ],
    });

  const row = (
    icon: React.ComponentProps<typeof MaterialIcons>['name'],
    title: string,
    onPress: () => void,
    tint?: string,
  ) => (
    <TVFocusable
      onPress={onPress}
      borderRadius={16}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        backgroundColor: colors.surfaceContainerLow,
        marginBottom: 10,
      }}>
      <MaterialIcons name={icon} size={22} color={tint || colors.onSurface} />
      <Text style={{color: tint || colors.onSurface, fontSize: 16, marginLeft: 14, flex: 1, fontWeight: '600'}}>
        {title}
      </Text>
      <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
    </TVFocusable>
  );

  return (
    <TVFocusGuide autoFocus trapFocusRight style={{flex: 1}}>
      <ScrollView
        focusable={false}
        style={{backgroundColor: colors.background}}
        contentContainerStyle={{padding: 20, paddingBottom: 60}}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 22}}>
          <TVFocusable onPress={() => navigation.goBack()} borderRadius={22} style={{padding: 8, marginRight: 8}}>
            <MaterialIcons name="arrow-back" size={26} color={colors.onBackground} />
          </TVFocusable>
          <Text style={{color: colors.onBackground, fontSize: 24, fontWeight: '800'}}>Profile</Text>
        </View>

        <View style={{alignItems: 'center', marginBottom: 24}}>
          <Avatar name={profile?.display_name || user?.email} color={color} size={92} />
          <Text style={{color: colors.onBackground, fontSize: 22, fontWeight: '800', marginTop: 14}}>
            {profile?.display_name || 'CineHub user'}
          </Text>
          <Text style={{color: colors.onSurfaceVariant, fontSize: 14, marginTop: 2}}>
            {user?.email}
          </Text>
          {isAdmin && (
            <View
              style={{
                marginTop: 10,
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 20,
                backgroundColor: 'rgba(229,9,20,0.18)',
              }}>
              <Text style={{color: '#ff6b73', fontWeight: '800', fontSize: 12, letterSpacing: 1}}>
                ADMIN
              </Text>
            </View>
          )}
        </View>

        <Text style={{color: colors.onSurfaceVariant, fontSize: 12, marginBottom: 6}}>Display name</Text>
        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 18}}>
          <TextInput
            value={name}
            onChangeText={setName}
            selectionColor={RED}
            cursorColor={RED}
            maxLength={30}
            style={{
              flex: 1,
              color: colors.onSurface,
              backgroundColor: colors.surfaceContainerHigh,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: isTV ? 14 : 11,
              fontSize: isTV ? 18 : 15,
              marginRight: 10,
            }}
          />
          <TVFocusable
            onPress={saveName}
            disabled={!dirty || saving}
            borderRadius={12}
            style={{
              paddingHorizontal: 18,
              paddingVertical: 13,
              borderRadius: 12,
              backgroundColor: dirty ? RED : 'rgba(255,255,255,0.09)',
            }}>
            <Text style={{color: '#fff', fontWeight: '700'}}>{saving ? '…' : 'Save'}</Text>
          </TVFocusable>
        </View>

        <Text style={{color: colors.onSurfaceVariant, fontSize: 12, marginBottom: 8}}>Avatar colour</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', marginBottom: 24}}>
          {AVATAR_COLORS.map(c => (
            <TVFocusable
              key={c}
              onPress={() => pickColor(c)}
              borderRadius={20}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: c,
                marginRight: 10,
                marginBottom: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: color === c ? 3 : 0,
                borderColor: '#fff',
              }}>
              {color === c ? <MaterialIcons name="check" size={20} color="#fff" /> : <View />}
            </TVFocusable>
          ))}
        </View>

        {isAdmin && row('admin-panel-settings', 'Admin Panel', () => navigation.navigate('AdminPanel'), '#ff6b73')}
        {row('support-agent', 'Support group', () => Linking.openURL(socialLinks.telegram))}
        {row('logout', 'Sign out', confirmSignOut)}
      </ScrollView>
    </TVFocusGuide>
  );
};

export default Profile;
