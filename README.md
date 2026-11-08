# CineHub Desktop

CineHub for Windows, macOS and Linux (Tauri + React). Same account, servers,
TMDB home, Live TV and Watch Together as the Android and TV apps.

## Get the installers (no PC setup needed)

Push this repo to GitHub. The **Build CineHub Desktop** workflow runs on
Windows, macOS and Linux. When it finishes, open **Actions → the run →
Artifacts** and download:

- `CineHub-windows-latest` → the `.exe` installer
- `CineHub-macos-latest` → the `.dmg`
- `CineHub-ubuntu-22.04` → `.deb`, `.rpm` and `.AppImage`

## Build on your own PC

    npm install
    npm run tauri dev      # run
    npm run tauri build    # installers in src-tauri/target/release/bundle

Needs Node 20+, Rust (stable) and the Tauri prerequisites for your OS.

## What CineHub changes compared with the original

- Sign in / sign up / forgot password with an emailed code (Supabase)
- Opening animation on every launch, poster wall on the sign-in screen
- Servers are managed by the admin (Supabase table `cinehub_servers`)
- Home rows come from TMDB using the admin's key
- Live TV tab (links added by the admin in the phone app's admin panel)
- Watch Together (works with the phone and TV apps)
- First 5 seconds of every video (not Live TV) play without sound
- Provider website / verification windows are blocked
- No Web or Explore buttons, no update checker, no GitHub links
