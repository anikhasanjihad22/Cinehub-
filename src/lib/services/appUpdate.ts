import axios from 'axios';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import {Linking, Platform, ToastAndroid} from 'react-native';
import {mainStorage} from '../storage/StorageService';
import {showAppDialog} from '../zustand/appDialogStore';

export const GITHUB_OWNER = 'anikhasanjihad';
export const GITHUB_REPO = 'Cinebox';
export const GITHUB_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_URL = `${GITHUB_URL}/releases`;
export const ISSUES_URL = `${GITHUB_URL}/issues`;

const CHECK_ON_STARTUP_KEY = 'cinehub.update.checkOnStartup';
const LAST_CHECK_KEY = 'cinehub.update.lastCheck';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

/** Version name and build number of the installed app. */
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
export const APP_BUILD = Number(extra.buildNumber) || 1;

export interface UpdateInfo {
  available: boolean;
  currentBuild: number;
  latestBuild: number;
  tag: string;
  name: string;
  notes: string;
  apkUrl: string | null;
  size: number;
  pageUrl: string;
  publishedAt: string;
}

export const isCheckOnStartupEnabled = (): boolean =>
  mainStorage.getBool(CHECK_ON_STARTUP_KEY, true);

export const setCheckOnStartupEnabled = (enabled: boolean): void =>
  mainStorage.setBool(CHECK_ON_STARTUP_KEY, enabled);

// The workflow publishes tags like "build-12"; the number is the build.
const buildFromTag = (tag: string): number => {
  const match = tag.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : 0;
};

/** Compares the installed build with the latest GitHub release. */
export const checkForUpdate = async (): Promise<UpdateInfo> => {
  let release: any;
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        timeout: 15000,
        headers: {Accept: 'application/vnd.github+json'},
      },
    );
    release = response.data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      throw new Error('No release has been published yet.');
    }
    if (error?.response?.status === 403) {
      throw new Error('GitHub is limiting requests. Try again in a few minutes.');
    }
    throw new Error('Could not reach GitHub. Check your internet connection.');
  }
  const tag = String(release?.tag_name ?? '');
  const latestBuild = buildFromTag(tag);
  const apk = (release?.assets ?? []).find((a: any) =>
    String(a?.name ?? '').toLowerCase().endsWith('.apk'),
  );
  mainStorage.setNumber(LAST_CHECK_KEY, Date.now());
  return {
    available: latestBuild > APP_BUILD,
    currentBuild: APP_BUILD,
    latestBuild,
    tag,
    name: String(release?.name || tag),
    notes: String(release?.body ?? '').trim(),
    apkUrl: apk?.browser_download_url ?? null,
    size: Number(apk?.size) || 0,
    pageUrl: String(release?.html_url || RELEASES_URL),
    publishedAt: String(release?.published_at ?? ''),
  };
};

/**
 * Downloads the APK and opens Android's installer. Android always asks the
 * user to confirm an install, and the first time it also asks to allow
 * installs from CineHub.
 */
export const downloadAndInstall = async (
  info: UpdateInfo,
  onProgress?: (fraction: number) => void,
): Promise<void> => {
  if (Platform.OS !== 'android' || !info.apkUrl) {
    await Linking.openURL(info.pageUrl);
    return;
  }
  const target = `${FileSystem.cacheDirectory}CineHub-update.apk`;
  await FileSystem.deleteAsync(target, {idempotent: true});
  const download = FileSystem.createDownloadResumable(
    info.apkUrl,
    target,
    {},
    progress => {
      const total = progress.totalBytesExpectedToWrite || info.size || 0;
      if (total > 0) {
        onProgress?.(Math.min(1, progress.totalBytesWritten / total));
      }
    },
  );
  const result = await download.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error('Download failed. Please try again.');
  }
  onProgress?.(1);
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
};

let startupChecked = false;

const installFromDialog = (info: UpdateInfo) => {
  ToastAndroid.show('Downloading update…', ToastAndroid.SHORT);
  downloadAndInstall(info).catch(() => {
    ToastAndroid.show(
      'Could not install here. Opening the download page.',
      ToastAndroid.LONG,
    );
    Linking.openURL(info.pageUrl).catch(() => {});
  });
};

/** Quiet check when the app opens. Only speaks up if there is an update. */
export const checkForUpdateOnStartup = async (): Promise<void> => {
  if (startupChecked || !isCheckOnStartupEnabled()) {
    return;
  }
  startupChecked = true;
  const last = mainStorage.getNumber(LAST_CHECK_KEY) ?? 0;
  if (Date.now() - last < CHECK_INTERVAL_MS) {
    return;
  }
  try {
    await new Promise(resolve => setTimeout(resolve, 4000));
    const info = await checkForUpdate();
    if (!info.available) {
      return;
    }
    showAppDialog({
      title: 'Update available',
      message: `A new version of CineHub is ready.${
        info.notes ? `\n\n${info.notes.slice(0, 400)}` : ''
      }`,
      variant: 'info',
      actions: [
        {label: 'Later'},
        {
          label: 'Update',
          variant: 'primary',
          onPress: () => installFromDialog(info),
        },
      ],
    });
  } catch {
    // Offline or rate limited: stay silent, About has a manual check.
  }
};
