import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  Switch,
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
import ProviderIcon from '../../components/ProviderIcon';
import {isTV} from '../../lib/tv';
import {supabase, CineHubServer} from '../../lib/supabase';
import useAuthStore from '../../lib/zustand/authStore';
import {showAppDialog} from '../../lib/zustand/appDialogStore';
import {
  fetchServers,
  managedAuthor,
  syncServers,
  testServerSource,
} from '../../lib/services/serverSync';
import {
  extensionStorage,
  ProviderExtension,
} from '../../lib/storage/extensionStorage';
import {
  fetchLiveTvSources,
  fetchTmdbApiKeyForAdmin,
  saveLiveTvSources,
  saveTmdbApiKey,
} from '../../lib/services/remoteConfig';
import type {LiveSource} from '../../lib/liveTv/liveTv';
import {validateTmdbKey} from '../../lib/tmdbHome';

type Props = NativeStackScreenProps<SettingsStackParamList, 'AdminPanel'>;

// iOS "inset grouped" look (dark appearance).
const IOS = {
  bg: '#000000',
  group: '#1C1C1E',
  separator: 'rgba(84,84,88,0.65)',
  label: '#FFFFFF',
  secondary: 'rgba(235,235,245,0.6)',
  tertiary: 'rgba(235,235,245,0.3)',
  tint: '#E50914',
  blue: '#0A84FF',
  green: '#34C759',
  orange: '#FF9F0A',
  purple: '#BF5AF2',
  red: '#FF453A',
};

interface Draft {
  id?: string;
  label: string;
  source_url: string;
  manifest_url: string;
  provider_value: string;
  enabled: boolean;
  hidden: string[];
}

const EMPTY: Draft = {
  label: '',
  source_url: '',
  manifest_url: '',
  provider_value: '',
  enabled: true,
  hidden: [],
};

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/* ───────────────────────────── building blocks ───────────────────────────── */

const Group = ({
  header,
  footer,
  inset = 16,
  children,
}: {
  header?: string;
  footer?: string;
  inset?: number;
  children: React.ReactNode;
}) => {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{marginBottom: 26}}>
      {!!header && (
        <Text
          style={{
            color: IOS.secondary,
            fontSize: 13,
            letterSpacing: 0.3,
            marginBottom: 7,
            marginLeft: 32,
            textTransform: 'uppercase',
          }}>
          {header}
        </Text>
      )}
      <View
        style={{
          backgroundColor: IOS.group,
          borderRadius: 12,
          marginHorizontal: 16,
          overflow: 'hidden',
        }}>
        {items.map((child, index) => (
          <View key={index}>
            {child}
            {index < items.length - 1 && (
              <View
                style={{
                  backgroundColor: IOS.separator,
                  height: 0.5,
                  marginLeft: inset,
                }}
              />
            )}
          </View>
        ))}
      </View>
      {!!footer && (
        <Text
          style={{
            color: IOS.secondary,
            fontSize: 13,
            lineHeight: 18,
            marginHorizontal: 32,
            marginTop: 7,
          }}>
          {footer}
        </Text>
      )}
    </View>
  );
};

const Badge = ({
  icon,
  color,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
}) => (
  <View
    style={{
      alignItems: 'center',
      backgroundColor: color,
      borderRadius: 7,
      height: 30,
      justifyContent: 'center',
      marginRight: 12,
      width: 30,
    }}>
    <MaterialIcons name={icon} size={18} color="#fff" />
  </View>
);

const Row = ({
  leading,
  title,
  subtitle,
  value,
  trailing,
  chevron,
  onPress,
  tint,
  disabled,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  tint?: string;
  disabled?: boolean;
}) => {
  const content = (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        minHeight: 52,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}>
      {leading}
      <View style={{flex: 1, marginRight: 8}}>
        <Text
          numberOfLines={1}
          style={{color: tint ?? IOS.label, fontSize: 17}}>
          {title}
        </Text>
        {!!subtitle && (
          <Text
            numberOfLines={1}
            style={{color: IOS.secondary, fontSize: 13, marginTop: 2}}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!value && (
        <Text style={{color: IOS.secondary, fontSize: 17, marginRight: 6}}>
          {value}
        </Text>
      )}
      {trailing}
      {chevron && (
        <MaterialIcons name="chevron-right" size={22} color={IOS.tertiary} />
      )}
    </View>
  );
  if (!onPress) {
    return content;
  }
  return (
    <TVFocusable
      onPress={onPress}
      disabled={disabled}
      borderRadius={12}
      style={{opacity: disabled ? 0.5 : 1}}>
      {content}
    </TVFocusable>
  );
};

const IosSwitch = ({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
}) => (
  <Switch
    value={value}
    onValueChange={onValueChange}
    trackColor={{true: IOS.green, false: '#39393D'}}
    thumbColor="#fff"
  />
);

const InputRow = ({
  value,
  onChangeText,
  placeholder,
  secure,
  trailing,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  trailing?: React.ReactNode;
}) => (
  <View
    style={{
      alignItems: 'center',
      flexDirection: 'row',
      minHeight: 48,
      paddingHorizontal: 16,
    }}>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={IOS.tertiary}
      autoCapitalize="none"
      autoCorrect={false}
      secureTextEntry={secure}
      selectionColor={IOS.tint}
      cursorColor={IOS.tint}
      style={{
        color: IOS.label,
        flex: 1,
        fontSize: 17,
        paddingVertical: isTV ? 14 : 10,
      }}
    />
    {trailing}
  </View>
);

const Sheet = ({
  visible,
  title,
  doneLabel = 'Save',
  doneDisabled,
  busy,
  onCancel,
  onDone,
  children,
}: {
  visible: boolean;
  title: string;
  doneLabel?: string;
  doneDisabled?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onDone: () => void;
  children: React.ReactNode;
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="slide"
    statusBarTranslucent
    onRequestClose={onCancel}>
    <View style={{backgroundColor: 'rgba(0,0,0,0.45)', flex: 1}}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          backgroundColor: IOS.bg,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          flex: 1,
          marginTop: (StatusBar.currentHeight ?? 24) + 14,
          overflow: 'hidden',
        }}>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            height: 56,
            justifyContent: 'space-between',
            paddingHorizontal: 8,
          }}>
          <TVFocusable
            onPress={onCancel}
            borderRadius={10}
            style={{paddingHorizontal: 10, paddingVertical: 10}}>
            <Text style={{color: IOS.tint, fontSize: 17}}>Cancel</Text>
          </TVFocusable>
          <Text
            numberOfLines={1}
            style={{
              color: IOS.label,
              flex: 1,
              fontSize: 17,
              fontWeight: '600',
              textAlign: 'center',
            }}>
            {title}
          </Text>
          <TVFocusable
            onPress={onDone}
            disabled={doneDisabled || busy}
            borderRadius={10}
            style={{
              minWidth: 60,
              opacity: doneDisabled ? 0.4 : 1,
              paddingHorizontal: 10,
              paddingVertical: 10,
            }}>
            {busy ? (
              <ActivityIndicator color={IOS.tint} />
            ) : (
              <Text
                style={{
                  color: IOS.tint,
                  fontSize: 17,
                  fontWeight: '600',
                  textAlign: 'right',
                }}>
                {doneLabel}
              </Text>
            )}
          </TVFocusable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{paddingBottom: 280, paddingTop: 12}}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  </Modal>
);

/* ─────────────────────────────────── screen ─────────────────────────────────── */

const AdminPanel = ({navigation}: Props) => {
  const isAdmin = useAuthStore(s => s.isAdmin);

  const [servers, setServers] = useState<CineHubServer[]>([]);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<ProviderExtension[] | null>(null);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState('');

  const [tmdbOpen, setTmdbOpen] = useState(false);
  const [tmdbSaved, setTmdbSaved] = useState('');
  const [tmdbDraft, setTmdbDraft] = useState('');
  const [tmdbShow, setTmdbShow] = useState(false);
  const [tmdbBusy, setTmdbBusy] = useState(false);

  const [liveOpen, setLiveOpen] = useState(false);
  const [liveSaved, setLiveSaved] = useState<LiveSource[]>([]);
  const [liveDraft, setLiveDraft] = useState<LiveSource[]>([]);
  const [liveBusy, setLiveBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!isTV) {
        return;
      }
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (draft) {
          setDraft(null);
        } else if (tmdbOpen) {
          setTmdbOpen(false);
        } else if (liveOpen) {
          setLiveOpen(false);
        } else {
          navigation.goBack();
        }
        return true;
      });
      return () => sub.remove();
    }, [navigation, draft, tmdbOpen, liveOpen]),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setServers(await fetchServers(true));
      const {count} = await supabase
        .from('profiles')
        .select('id', {count: 'exact', head: true});
      setUserCount(count ?? null);
      fetchTmdbApiKeyForAdmin()
        .then(setTmdbSaved)
        .catch(() => {});
      fetchLiveTvSources()
        .then(setLiveSaved)
        .catch(() => {});
    } catch (e) {
      ToastAndroid.show(
        e instanceof Error ? e.message : 'Could not load servers',
        ToastAndroid.LONG,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void load();
    }
  }, [isAdmin, load]);

  // How many providers each server gave this device (what users get).
  const installedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of extensionStorage.getInstalledProviders()) {
      const author = p.source?.author;
      if (author) {
        counts.set(author, (counts.get(author) ?? 0) + 1);
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers, syncing]);

  if (!isAdmin) {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: IOS.bg,
          flex: 1,
          justifyContent: 'center',
        }}>
        <MaterialIcons name="lock-outline" size={44} color={IOS.secondary} />
        <Text style={{color: IOS.label, fontSize: 17, marginTop: 12}}>
          Admins only
        </Text>
      </View>
    );
  }

  /* ── provider list inside a server ── */

  const loadProviders = async (source: string, manifest: string) => {
    if (!source.trim()) {
      setProvidersError('Enter the source URL first.');
      return;
    }
    setProvidersLoading(true);
    setProvidersError('');
    try {
      const list = await testServerSource(source, manifest);
      setProviders(list.filter(p => !p.disabled));
    } catch (e) {
      setProviders(null);
      setProvidersError(
        e instanceof Error ? e.message : 'Source not reachable',
      );
    } finally {
      setProvidersLoading(false);
    }
  };

  const startAdd = () => {
    setProviders(null);
    setProvidersError('');
    setDraft({...EMPTY, label: `Server ${servers.length + 1}`});
  };

  const startEdit = (s: CineHubServer) => {
    const next: Draft = {
      id: s.id,
      label: s.label,
      source_url: s.source_url,
      manifest_url: s.manifest_url ?? '',
      provider_value: s.provider_value ?? '',
      enabled: s.enabled,
      hidden: s.hidden_providers ?? [],
    };
    setProviders(null);
    setProvidersError('');
    setDraft(next);
    void loadProviders(next.source_url, next.manifest_url);
  };

  const toggleHidden = (value: string, shown: boolean) => {
    if (!draft) {
      return;
    }
    const hidden = shown
      ? draft.hidden.filter(v => v !== value)
      : [...draft.hidden, value];
    setDraft({...draft, hidden});
  };

  const save = async () => {
    if (!draft) {
      return;
    }
    if (!draft.label.trim() || !draft.source_url.trim()) {
      ToastAndroid.show('Name and Source URL are required', ToastAndroid.SHORT);
      return;
    }
    setSaving(true);
    const row = {
      label: draft.label.trim(),
      source_url: draft.source_url.trim(),
      manifest_url: draft.manifest_url.trim() || null,
      provider_value: draft.provider_value.trim() || null,
      enabled: draft.enabled,
      hidden_providers: draft.hidden,
    };
    const result = draft.id
      ? await supabase.from('cinehub_servers').update(row).eq('id', draft.id)
      : await supabase
          .from('cinehub_servers')
          .insert({...row, position: servers.length});
    setSaving(false);
    if (result.error) {
      const message = result.error.message;
      ToastAndroid.show(
        message.includes('hidden_providers')
          ? 'Run supabase/migration-v2.sql in Supabase first'
          : message,
        ToastAndroid.LONG,
      );
      return;
    }
    setDraft(null);
    await load();
    ToastAndroid.show('Saved. Users get it automatically.', ToastAndroid.SHORT);
    void syncServers().catch(() => {});
  };

  const toggle = async (s: CineHubServer, enabled: boolean) => {
    setServers(prev => prev.map(x => (x.id === s.id ? {...x, enabled} : x)));
    const {error} = await supabase
      .from('cinehub_servers')
      .update({enabled})
      .eq('id', s.id);
    if (error) {
      ToastAndroid.show(error.message, ToastAndroid.LONG);
      await load();
    } else {
      void syncServers().catch(() => {});
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const other = index + dir;
    if (other < 0 || other >= servers.length) {
      return;
    }
    const a = servers[index];
    const b = servers[other];
    const next = [...servers];
    next[index] = {...b, position: index};
    next[other] = {...a, position: other};
    setServers(next);
    setDraft(null);
    const results = await Promise.all([
      supabase.from('cinehub_servers').update({position: other}).eq('id', a.id),
      supabase.from('cinehub_servers').update({position: index}).eq('id', b.id),
    ]);
    if (results.some(r => r.error)) {
      ToastAndroid.show('Could not reorder', ToastAndroid.SHORT);
    }
    void syncServers().catch(() => {});
  };

  const remove = (s: CineHubServer) => {
    showAppDialog({
      title: `Delete “${s.label}”?`,
      message: 'Users will lose this server the next time the app syncs.',
      variant: 'error',
      actions: [
        {label: 'Cancel'},
        {
          label: 'Delete',
          variant: 'destructive',
          onPress: async () => {
            const {error} = await supabase
              .from('cinehub_servers')
              .delete()
              .eq('id', s.id);
            if (error) {
              ToastAndroid.show(error.message, ToastAndroid.LONG);
              return;
            }
            setDraft(null);
            await load();
            void syncServers().catch(() => {});
          },
        },
      ],
    });
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await syncServers();
      ToastAndroid.show(
        r.errors.length
          ? `Synced with ${r.errors.length} error(s): ${r.errors[0]}`
          : `Synced ${r.providers} provider(s) from ${r.servers} server(s)`,
        ToastAndroid.LONG,
      );
    } catch (e) {
      ToastAndroid.show(
        e instanceof Error ? e.message : 'Sync failed',
        ToastAndroid.LONG,
      );
    } finally {
      setSyncing(false);
    }
  };

  /* ── TMDB key ── */

  const openTmdb = () => {
    setTmdbDraft(tmdbSaved);
    setTmdbShow(false);
    setTmdbOpen(true);
  };

  const saveTmdb = async () => {
    const key = tmdbDraft.trim();
    setTmdbBusy(true);
    try {
      if (key && !(await validateTmdbKey(key))) {
        ToastAndroid.show(
          'TMDB rejected this key. Check it and retry.',
          ToastAndroid.LONG,
        );
        return;
      }
      await saveTmdbApiKey(key);
      setTmdbSaved(key);
      setTmdbOpen(false);
      ToastAndroid.show(
        key ? 'TMDB key saved for all users' : 'TMDB key removed',
        ToastAndroid.SHORT,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save';
      ToastAndroid.show(
        message.includes('app_settings')
          ? 'Run supabase/migration-v2.sql in Supabase first'
          : message,
        ToastAndroid.LONG,
      );
    } finally {
      setTmdbBusy(false);
    }
  };

  /* ── Live TV links ── */

  const openLive = () => {
    setLiveDraft(
      liveSaved.length
        ? liveSaved.map(x => ({...x}))
        : [{id: `s${Date.now()}`, label: '', url: ''}],
    );
    setLiveOpen(true);
  };

  const updateLive = (id: string, patch: Partial<LiveSource>) =>
    setLiveDraft(list => list.map(x => (x.id === id ? {...x, ...patch} : x)));

  const saveLive = async () => {
    const bad = liveDraft.find(
      x => x.url.trim() && !/^https?:\/\//i.test(x.url.trim()),
    );
    if (bad) {
      ToastAndroid.show('Every link must start with http:// or https://', ToastAndroid.LONG);
      return;
    }
    const clean = liveDraft
      .map(x => ({...x, label: x.label.trim(), url: x.url.trim()}))
      .filter(x => x.url);
    setLiveBusy(true);
    try {
      await saveLiveTvSources(clean);
      setLiveSaved(clean);
      setLiveOpen(false);
      ToastAndroid.show(
        clean.length ? 'Live TV saved for all users' : 'Live TV links removed',
        ToastAndroid.SHORT,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save';
      ToastAndroid.show(
        message.includes('app_settings')
          ? 'Run supabase/migration-v2.sql in Supabase first'
          : message,
        ToastAndroid.LONG,
      );
    } finally {
      setLiveBusy(false);
    }
  };

  const liveValue = liveSaved.length
    ? `${liveSaved.length} ${liveSaved.length === 1 ? 'link' : 'links'}`
    : 'Not set';

  const maskedKey = tmdbSaved ? `••••${tmdbSaved.slice(-4)}` : 'Not set';

  const draftIndex = draft?.id ? servers.findIndex(s => s.id === draft.id) : -1;
  const draftServer = draftIndex >= 0 ? servers[draftIndex] : null;

  const statTile = (
    icon: React.ComponentProps<typeof MaterialIcons>['name'],
    color: string,
    label: string,
    value: string | number,
    marginRight = 0,
  ) => (
    <View
      style={{
        backgroundColor: IOS.group,
        borderRadius: 16,
        flex: 1,
        marginRight,
        padding: 14,
      }}>
      <View
        style={{
          alignItems: 'center',
          backgroundColor: color,
          borderRadius: 15,
          height: 30,
          justifyContent: 'center',
          width: 30,
        }}>
        <MaterialIcons name={icon} size={17} color="#fff" />
      </View>
      <Text
        style={{
          color: IOS.label,
          fontSize: 32,
          fontWeight: '700',
          marginTop: 10,
        }}>
        {value}
      </Text>
      <Text style={{color: IOS.secondary, fontSize: 13}}>{label}</Text>
    </View>
  );

  return (
    <TVFocusGuide autoFocus trapFocusRight style={{flex: 1}}>
      <ScrollView
        focusable={false}
        style={{backgroundColor: IOS.bg}}
        contentContainerStyle={{paddingBottom: 80, paddingTop: 8}}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <TVFocusable
          onPress={() => navigation.goBack()}
          borderRadius={12}
          style={{
            alignItems: 'center',
            alignSelf: 'flex-start',
            flexDirection: 'row',
            marginLeft: 6,
            paddingHorizontal: 6,
            paddingVertical: 8,
          }}>
          <MaterialIcons name="chevron-left" size={30} color={IOS.tint} />
          <Text style={{color: IOS.tint, fontSize: 17, marginLeft: -2}}>
            Settings
          </Text>
        </TVFocusable>
        <Text
          style={{
            color: IOS.label,
            fontSize: 34,
            fontWeight: '700',
            marginBottom: 18,
            marginLeft: 20,
            marginTop: 4,
          }}>
          Admin Panel
        </Text>

        <View
          style={{flexDirection: 'row', marginBottom: 26, marginHorizontal: 16}}>
          {statTile('dns', IOS.tint, 'Servers', servers.length, 12)}
          {statTile('people', IOS.blue, 'Users', userCount ?? '–')}
        </View>

        {loading && servers.length === 0 ? (
          <ActivityIndicator color={IOS.tint} style={{marginVertical: 30}} />
        ) : (
          <Group
            header="Servers"
            inset={58}
            footer="Users see each provider as “Server 1 1”, “Server 1 2”… Real provider names are visible to you only.">
            {servers.map((s, i) => {
              const count = installedCounts.get(managedAuthor(s.id)) ?? 0;
              return (
                <Row
                  key={s.id}
                  leading={
                    <View
                      style={{
                        alignItems: 'center',
                        backgroundColor: s.enabled ? IOS.tint : '#48484A',
                        borderRadius: 7,
                        height: 30,
                        justifyContent: 'center',
                        marginRight: 12,
                        width: 30,
                      }}>
                      <Text
                        style={{color: '#fff', fontSize: 15, fontWeight: '700'}}>
                        {i + 1}
                      </Text>
                    </View>
                  }
                  title={s.label}
                  subtitle={`${hostOf(s.source_url)}${
                    count ? ` · ${count} provider${count > 1 ? 's' : ''}` : ''
                  }`}
                  trailing={
                    <IosSwitch
                      value={s.enabled}
                      onValueChange={v => toggle(s, v)}
                    />
                  }
                  onPress={() => startEdit(s)}
                />
              );
            })}
            <Row
              leading={<Badge icon="add" color={IOS.green} />}
              title="Add Server"
              tint={IOS.tint}
              onPress={startAdd}
            />
          </Group>
        )}

        <Group
          header="Metadata"
          inset={58}
          footer="Powers the Home page, details and trailers in every user’s app. Users never see or edit this.">
          <Row
            leading={<Badge icon="movie" color={IOS.blue} />}
            title="TMDB API Key"
            value={maskedKey}
            chevron
            onPress={openTmdb}
          />
        </Group>

        <Group
          header="Live TV"
          inset={58}
          footer="Add links to a channel list (JSON or M3U). Channels are grouped by the category inside each list; a channel with no category goes under the link’s name. Users see the changes when they open or refresh Live TV.">
          <Row
            leading={<Badge icon="live-tv" color={IOS.red} />}
            title="Live TV Links"
            value={liveValue}
            chevron
            onPress={openLive}
          />
        </Group>

        <Group
          header="Actions"
          inset={58}
          footer="Sync applies the server list to this device. Users pick up changes on their own when they open the app.">
          <Row
            leading={<Badge icon="sync" color={IOS.orange} />}
            title="Sync Now"
            tint={IOS.tint}
            disabled={syncing}
            trailing={
              syncing ? <ActivityIndicator color={IOS.tint} /> : undefined
            }
            onPress={syncNow}
          />
          <Row
            leading={<Badge icon="refresh" color={IOS.purple} />}
            title="Reload"
            tint={IOS.tint}
            onPress={load}
          />
        </Group>
      </ScrollView>

      {/* ───── server sheet ───── */}
      <Sheet
        visible={!!draft}
        title={draft?.id ? 'Edit Server' : 'New Server'}
        busy={saving}
        onCancel={() => setDraft(null)}
        onDone={save}>
        {draft && (
          <>
            <Group header="Name users see">
              <InputRow
                value={draft.label}
                placeholder="Server 1"
                onChangeText={v => setDraft({...draft, label: v})}
              />
            </Group>
            <Group header="Provider source URL">
              <InputRow
                value={draft.source_url}
                placeholder="https://github.com/you/your-providers"
                onChangeText={v => setDraft({...draft, source_url: v})}
              />
            </Group>
            <Group
              header="Manifest URL (optional)"
              footer="Only if manifest.json lives somewhere else.">
              <InputRow
                value={draft.manifest_url}
                placeholder="https://…/manifest.json"
                onChangeText={v => setDraft({...draft, manifest_url: v})}
              />
            </Group>
            <Group
              header="Only this provider (optional)"
              footer="Provider value from the manifest. Blank means all providers.">
              <InputRow
                value={draft.provider_value}
                placeholder="e.g. vegamovies"
                onChangeText={v => setDraft({...draft, provider_value: v})}
              />
            </Group>
            <Group>
              <Row
                title="Visible to users"
                trailing={
                  <IosSwitch
                    value={draft.enabled}
                    onValueChange={v => setDraft({...draft, enabled: v})}
                  />
                }
              />
            </Group>

            <Group
              header={providers ? `Providers · ${providers.length}` : 'Providers'}
              inset={58}
              footer={
                providersError
                  ? providersError
                  : providers
                    ? 'Switch off a provider to hide it from users. Applies when you tap Save.'
                    : undefined
              }>
              {providers && providers.length > 0 ? (
                providers.map(p => (
                  <Row
                    key={p.value}
                    leading={
                      <View style={{marginRight: 12}}>
                        <ProviderIcon
                          uri={p.icon}
                          name={p.display_name}
                          size={30}
                          background="#3A3A3C"
                          color="#fff"
                        />
                      </View>
                    }
                    title={p.display_name}
                    subtitle={`${p.value} · v${p.version}`}
                    trailing={
                      <IosSwitch
                        value={!draft.hidden.includes(p.value)}
                        onValueChange={v => toggleHidden(p.value, v)}
                      />
                    }
                  />
                ))
              ) : (
                <Row
                  leading={<Badge icon="cloud-download" color={IOS.blue} />}
                  title={
                    providersLoading
                      ? 'Loading providers…'
                      : providers
                        ? 'No providers found'
                        : 'Load Providers'
                  }
                  tint={IOS.tint}
                  disabled={providersLoading}
                  trailing={
                    providersLoading ? (
                      <ActivityIndicator color={IOS.tint} />
                    ) : undefined
                  }
                  onPress={() =>
                    loadProviders(draft.source_url, draft.manifest_url)
                  }
                />
              )}
            </Group>

            {draftServer && (
              <>
                <Group>
                  <Row
                    title="Move Up"
                    tint={draftIndex === 0 ? IOS.tertiary : IOS.tint}
                    disabled={draftIndex === 0}
                    onPress={() => move(draftIndex, -1)}
                  />
                  <Row
                    title="Move Down"
                    tint={
                      draftIndex === servers.length - 1
                        ? IOS.tertiary
                        : IOS.tint
                    }
                    disabled={draftIndex === servers.length - 1}
                    onPress={() => move(draftIndex, 1)}
                  />
                </Group>
                <Group>
                  <Row
                    title="Delete Server"
                    tint={IOS.red}
                    onPress={() => remove(draftServer)}
                  />
                </Group>
              </>
            )}
          </>
        )}
      </Sheet>

      {/* ───── TMDB sheet ───── */}
      <Sheet
        visible={tmdbOpen}
        title="TMDB API Key"
        busy={tmdbBusy}
        onCancel={() => setTmdbOpen(false)}
        onDone={saveTmdb}>
        <Group
          header="API key (v3)"
          footer="Get it free at themoviedb.org → Settings → API. The key is checked with TMDB before saving. Leave it empty and save to remove it; Home then falls back to each provider’s own catalog.">
          <InputRow
            value={tmdbDraft}
            placeholder="Paste TMDB API v3 key"
            secure={!tmdbShow}
            onChangeText={setTmdbDraft}
            trailing={
              <TVFocusable
                onPress={() => setTmdbShow(v => !v)}
                borderRadius={16}
                style={{padding: 6}}>
                <MaterialIcons
                  name={tmdbShow ? 'visibility-off' : 'visibility'}
                  size={22}
                  color={IOS.secondary}
                />
              </TVFocusable>
            }
          />
        </Group>
      </Sheet>

      {/* ───── Live TV sheet ───── */}
      <Sheet
        visible={liveOpen}
        title="Live TV Links"
        busy={liveBusy}
        onCancel={() => setLiveOpen(false)}
        onDone={saveLive}>
        {liveDraft.map((src, i) => (
          <Group
            key={src.id}
            header={`Link ${i + 1}`}
            footer={
              i === liveDraft.length - 1
                ? 'Name is optional. It becomes the category for channels that have none. Leave a link empty and save to remove it.'
                : undefined
            }>
            <InputRow
              value={src.label}
              placeholder="Name (e.g. Sports)"
              onChangeText={v => updateLive(src.id, {label: v})}
            />
            <InputRow
              value={src.url}
              placeholder="https://…/channels.json"
              onChangeText={v => updateLive(src.id, {url: v})}
              trailing={
                <TVFocusable
                  accessibilityLabel="Remove link"
                  onPress={() =>
                    setLiveDraft(list =>
                      list.length > 1
                        ? list.filter(x => x.id !== src.id)
                        : [{...src, label: '', url: ''}],
                    )
                  }
                  borderRadius={16}
                  style={{padding: 6}}>
                  <MaterialIcons name="delete-outline" size={22} color={IOS.red} />
                </TVFocusable>
              }
            />
          </Group>
        ))}
        <Group>
          <Row
            leading={<Badge icon="add" color={IOS.green} />}
            title="Add Link"
            tint={IOS.tint}
            onPress={() =>
              setLiveDraft(list => [
                ...list,
                {id: `s${Date.now()}`, label: '', url: ''},
              ])
            }
          />
        </Group>
      </Sheet>
    </TVFocusGuide>
  );
};

export default AdminPanel;
