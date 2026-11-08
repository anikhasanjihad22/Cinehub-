import React, {useCallback, useState} from 'react';
import {
  BackHandler,
  Image,
  Linking,
  ScrollView,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {MaterialIcons} from '@expo/vector-icons';
import {TVFocusable, TVFocusGuide} from '../../components/tv';
import SettingsSection from '../../components/ui/SettingsSection';
import SettingsRow from '../../components/ui/SettingsRow';
import SettingsSwitchRow from '../../components/ui/SettingsSwitchRow';
import {isTV} from '../../lib/tv';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {socialLinks} from '../../lib/constants';
import {
  APP_VERSION,
  UpdateInfo,
  checkForUpdate,
  downloadAndInstall,
  isCheckOnStartupEnabled,
  setCheckOnStartupEnabled,
} from '../../lib/services/appUpdate';
import {
  isDetailedLoggingEnabled,
  setDetailedLogging,
  shareLogs,
} from '../../lib/logging/cinehubLog';

type Phase = 'idle' | 'checking' | 'downloading';

const open = (url: string) =>
  Linking.openURL(url).catch(() =>
    ToastAndroid.show('Could not open the link', ToastAndroid.SHORT),
  );

const formatMb = (bytes: number) =>
  bytes > 0 ? ` · ${(bytes / (1024 * 1024)).toFixed(0)} MB` : '';

const About = ({navigation}: any) => {
  const colors = useM3Colors();
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState('');
  const [checkOnStartup, setCheckOnStartup] = useState(isCheckOnStartupEnabled);
  const [detailed, setDetailed] = useState(isDetailedLoggingEnabled);

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

  const runCheck = async () => {
    setPhase('checking');
    setError('');
    try {
      setInfo(await checkForUpdate());
    } catch (e) {
      setInfo(null);
      setError(e instanceof Error ? e.message : 'Could not check for updates');
    }
    setPhase('idle');
  };

  const install = async () => {
    if (!info) {
      return;
    }
    setPhase('downloading');
    setProgress(0);
    setError('');
    try {
      await downloadAndInstall(info, setProgress);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
      ToastAndroid.show('Opening the download page instead', ToastAndroid.LONG);
      open(info.pageUrl);
    }
    setPhase('idle');
  };

  const updateTitle =
    phase === 'checking'
      ? 'Checking…'
      : phase === 'downloading'
        ? `Downloading… ${Math.round(progress * 100)}%`
        : info?.available
          ? 'Update available'
          : 'Check for updates';

  const updateDescription = error
    ? error
    : info?.available
      ? `A new version is ready${formatMb(info.size)}`
      : info
        ? 'You are on the latest version'
        : 'Check if a newer version is available';

  return (
    <TVFocusGuide autoFocus trapFocusRight style={{flex: 1}}>
      <ScrollView
        focusable={false}
        style={{backgroundColor: colors.background}}
        contentContainerStyle={{padding: 20, paddingBottom: 60}}
        showsVerticalScrollIndicator={false}>
        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 24}}>
          <TVFocusable
            onPress={() => navigation.goBack()}
            borderRadius={22}
            style={{padding: 8, marginRight: 8}}>
            <MaterialIcons name="arrow-back" size={26} color={colors.onBackground} />
          </TVFocusable>
          <View>
            <Text style={{color: colors.onBackground, fontSize: 24, fontWeight: '800'}}>
              About CineHub
            </Text>
            <Text style={{color: colors.onSurfaceVariant, fontSize: 13}}>
              App information and updates
            </Text>
          </View>
        </View>

        <View style={{alignItems: 'center', marginBottom: 28}}>
          <Image
            source={require('../../../assets/logo.png')}
            style={{width: 96, height: 96, borderRadius: 24}}
          />
          <Text
            style={{
              color: colors.onBackground,
              fontSize: 26,
              fontWeight: '900',
              letterSpacing: 4,
              marginTop: 14,
            }}>
            CINE<Text style={{color: '#E50914'}}>HUB</Text>
          </Text>
          <Text style={{color: colors.onSurfaceVariant, marginTop: 6}}>
            Version {APP_VERSION}
          </Text>
        </View>

        <SettingsSection title="Updates">
          <SettingsRow
            title={updateTitle}
            description={updateDescription}
            icon={info?.available ? 'download-outline' : 'update'}
            onPress={
              phase !== 'idle'
                ? undefined
                : info?.available
                  ? install
                  : runCheck
            }
          />
          {info?.available && !!info.notes && (
            <View style={{paddingHorizontal: 16, paddingBottom: 14}}>
              <Text style={{color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 19}}>
                {info.notes.slice(0, 500)}
              </Text>
            </View>
          )}
          <SettingsSwitchRow
            title="Check on startup"
            description="Look for a new release when CineHub opens"
            value={checkOnStartup}
            onValueChange={value => {
              setCheckOnStartupEnabled(value);
              setCheckOnStartup(value);
            }}
            divider={false}
          />
        </SettingsSection>

        <SettingsSection title="Project">
          <SettingsRow
            title="Support group"
            description="Get help on Telegram"
            icon="support"
            onPress={() => open(socialLinks.telegram)}
            divider={false}
          />
        </SettingsSection>

        <SettingsSection title="Troubleshooting">
          <SettingsSwitchRow
            title="Detailed logging"
            description="Records more detail for bug reports. Turns off after 24 hours."
            value={detailed}
            onValueChange={value => {
              setDetailedLogging(value);
              setDetailed(value);
            }}
          />
          <SettingsRow
            title="Export logs"
            description="Share recent app logs with the developer. Links and sign-in data are removed."
            icon="file-document-outline"
            onPress={() =>
              shareLogs().catch(e =>
                ToastAndroid.show(
                  e instanceof Error ? e.message : 'Could not export logs',
                  ToastAndroid.LONG,
                ),
              )
            }
            divider={false}
          />
        </SettingsSection>
      </ScrollView>
    </TVFocusGuide>
  );
};

export default About;
