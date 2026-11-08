const fs = require('fs');
const path = require('path');

const androidGoogleServicesFile = './google-services.json';
const iosGoogleServicesFile = './GoogleService-Info.plist';
const hasAndroidGoogleServices = fs.existsSync(
  path.resolve(__dirname, androidGoogleServicesFile),
);
const hasIosGooglePlist = fs.existsSync(
  path.resolve(__dirname, iosGoogleServicesFile),
);
// Set by the GitHub workflow (run number) so every release is newer than the last.
const buildNumber = Number(process.env.APP_BUILD_NUMBER) || 1;
const tmdbApiKey =
  process.env.TMDB_API_KEY || process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
const proxyApiUrl =
  process.env.PROXY_API_URL ||
  process.env.EXPO_PUBLIC_PROXY_API_URL ||
  process.env.META_PROXY_URL ||
  '';

module.exports = () => {
  const IS_PLAYSTORE = process.env.APP_VARIANT === 'playstore';
  const IS_TV = process.env.EXPO_TV === '1' || process.env.APP_VARIANT === 'tv';
  const HAS_FIREBASE =
    !IS_PLAYSTORE && (hasAndroidGoogleServices || hasIosGooglePlist);
  const PACKAGE_NAME = IS_PLAYSTORE ? 'cinehub.app' : 'com.cinehub';
  const APP_SCHEME = IS_PLAYSTORE ? 'cinehubapp' : 'com.cinehub';
  const plugins = [
    './plugins/with-custom-native-modules.js',
      [
        'expo-camera',
        {
          cameraPermission: 'Allow CineHub to scan receiver QR codes.',
          recordAudioAndroid: false,
        },
      ],
    './plugins/android-native-config.js',
    './plugins/with-saf-copy-module.js',
    './plugins/with-uri-permission-module.js',
    './plugins/with-proguard-rules.js',
    './plugins/with-jvm-args.js',
    './plugins/with-android-notification-icons.js',
    './plugins/with-notifee-service.js',
    './plugins/with-android-release-gradle.js',
    './plugins/with-native-scroll-performance.js',
    './plugins/with-android-signing.js',
    './plugins/with-android-okhttp.js',
    ...(HAS_FIREBASE ? ['@react-native-firebase/app'] : []),
    ...(HAS_FIREBASE ? ['@react-native-firebase/crashlytics'] : []),
    [
      'react-native-video',
      {
        enableNotificationControls: true,
        enableAndroidPictureInPicture: true,
        androidExtensions: {
          useExoplayerRtsp: false,
          useExoplayerSmoothStreaming: true,
          useExoplayerHls: true,
          useExoplayerDash: true,
        },
      },
    ],
    [
      'react-native-google-cast',
      {
        // Avoid unreviewed SDK upgrades requiring a newer compileSdk/AGP/Kotlin.
        androidPlayServicesCastFrameworkVersion: '22.3.1',
        expandedController: true,
      },
    ],
    'react-native-edge-to-edge',
    // Manifest mods execute in reverse order: configure TV before moving its
    // launcher intent onto the color aliases.
    './plugins/with-dynamic-launcher-splash.js',
    [
      'react-native-bootsplash',
      {
        assetsDir: 'assets/bootsplash',
        android: {
          parentTheme: 'EdgeToEdge',
        },
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // libtorrent4j's native library is built for API 28 and calls libc
          // functions (getentropy, aligned_alloc) missing before Android 9.
          minSdkVersion: 28,
          usePrecompiledHeaders: true,
          // ByeDPI and WARP run bundled binaries from nativeLibraryDir, so the
          // .so files must be extracted on install.
          useLegacyPackaging: true,
          extraMavenRepos: [
            '../../node_modules/@notifee/react-native/android/libs',
          ],
          enableProguardInReleaseBuilds: true,
          splits: {
            abi: {
              enable: true,
              reset: false,
              include: ['armeabi-v7a', 'arm64-v8a'],
              universalApk: true,
            },
          },
          buildVariants: {
            release: {
              minifyEnabled: true,
              shrinkResources: true,
              splits: {
                abi: {
                  enable: true,
                  reset: false,
                  include: ['armeabi-v7a', 'arm64-v8a'],
                },
              },
            },
            debug: {minifyEnabled: false, debuggable: true},
          },
        },
        ios: {},
      },
    ],

    [
      'expo-dev-client',
      {
        launchMode: 'most-recent',
      },
    ],
    'expo-font',
    'expo-status-bar',
    ...(IS_TV
      ? [
          [
            '@react-native-tvos/config-tv',
            {
              isTV: true,
              androidTVBanner: './assets/tv-banner.png',
            },
          ],
        ]
      : []),
  ];
  return {
    expo: {
      name: 'CineHub',
      scheme: [APP_SCHEME, 'cinehub-cast'],
      displayName: 'CineHub',
      jsEngine: 'hermes',
      newArchEnabled: true,
      autolinking: {exclude: ['expo-splash-screen']},
      plugins,
      slug: 'cinehub',
      version: '1.0.0',
      userInterfaceStyle: 'dark',
      icon: './assets/icon.png',
      updates: {enabled: false},
      experiments: {
        reactCompiler: true,
      },
      android: {
        ...(!IS_PLAYSTORE && hasAndroidGoogleServices
          ? {googleServicesFile: androidGoogleServicesFile}
          : {}),
        package: PACKAGE_NAME,
        versionCode: buildNumber,
        permissions: [
          'FOREGROUND_SERVICE',
          'FOREGROUND_SERVICE_DATA_SYNC',
          'FOREGROUND_SERVICE_MEDIA_PLAYBACK',
          'ACCESS_NETWORK_STATE',
          'ACCESS_WIFI_STATE',
          'CHANGE_WIFI_MULTICAST_STATE',
          'INTERNET',
          'WRITE_SETTINGS',
          'WAKE_LOCK',
          'POST_NOTIFICATIONS',
          // Lets the in-app updater open Android's installer (not on Play Store).
          ...(IS_PLAYSTORE ? [] : ['REQUEST_INSTALL_PACKAGES']),
        ],
        blockedPermissions: [
          // Casting uses WebRTC data channels, not microphone capture.
          'android.permission.RECORD_AUDIO',
          'android.permission.MANAGE_EXTERNAL_STORAGE',
          'android.permission.READ_EXTERNAL_STORAGE',
          'android.permission.READ_MEDIA_VIDEO',
          'android.permission.WRITE_EXTERNAL_STORAGE',
          ...(IS_PLAYSTORE
            ? [
                'android.permission.REQUEST_INSTALL_PACKAGES',
                'com.google.android.gms.permission.AD_ID',
              ]
            : []),
        ],
        queries: [
          {action: 'VIEW', data: {scheme: 'http'}},
          {action: 'VIEW', data: {scheme: 'https'}},
          {action: 'VIEW', data: {scheme: 'vlc'}},
        ],
        allowBackup: true,
        adaptiveIcon: {
          foregroundImage: './assets/adaptive_icon.png',
          backgroundColor: '#000000',
        },
        launchMode: 'singleTask',
        supportsPictureInPicture: true,
      },
      ios: {
        ...(!IS_PLAYSTORE && hasIosGooglePlist
          ? {googleServicesFile: iosGoogleServicesFile}
          : {}),
      },
      platforms: ['ios', 'android'],
      extra: {
        // Cast-to-web service is not used in CineHub.
        cinehubCastServiceUrl: '',
        // Optional STUN/TURN servers. Use short-lived TURN credentials in builds;
        // never commit a permanent relay secret. Empty means same-LAN ICE only.
        cinehubCastIceServers: JSON.parse(
          process.env.CINEHUB_CAST_ICE_SERVERS || '[]',
        ),
        supabaseUrl:
          process.env.SUPABASE_URL ||
          'https://brggwbhrdxozibqesbpu.supabase.co',
        // Publishable (public) key. Safe to ship inside the app.
        supabaseKey:
          process.env.SUPABASE_PUBLISHABLE_KEY ||
          'sb_publishable_miJxKvI3j4onueq7LX5R7g_bdrgDlFl',
        hasFirebase: HAS_FIREBASE,
        isPlayStore: IS_PLAYSTORE,
        isTV: IS_TV,
        tmdbApiKey,
        buildNumber,
        proxyApiUrl,
      },
    },
  };
};
