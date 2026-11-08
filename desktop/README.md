# CineHub for Windows (PC / laptop)

Electron app. Same login, same admin-managed servers, same TMDB catalogue and Live TV
list as the Android app. The Android code is untouched: this folder only *reads*
`../src/lib/sandbox` (provider sandbox), `helpers.ts`, `providerCookieJar.ts` and
`liveTv.ts` at build time (`npm run prepare:assets`).

## Get the .exe
Push the repo to GitHub → **Actions → "Build Windows desktop app (.exe)" → Run workflow**.
Download artifact **CineHub-Windows**: `CineHub-1.0.0-x64-nsis.exe` (installer) and
`CineHub-1.0.0-x64-portable.exe` (no install).

Or on a Windows PC with Node 20: `cd desktop && npm install && npm run dist` → `release/`.
Dev run: `npm start`.

## Player rules
* Every non-live video is **silent for its first 5 seconds**; mute/volume are locked
  during that time and cannot unmute it. Sound returns automatically at 5s.
* Seeking back into the first 5 seconds mutes again (same result however you get there).
* Live TV is exempt. Rule lives in `src/renderer/js/introMute.js` (`INTRO_MUTE_SECONDS`).

## Known limits
* MKV / unusual codecs may not play (Chromium player). HLS, DASH and MP4/WebM do.
* Sources that need a browser challenge (`openWebView`) are not supported yet.
* No admin panel, downloads, or Chromecast on desktop.
