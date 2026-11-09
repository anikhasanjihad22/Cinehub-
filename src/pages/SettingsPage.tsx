import React from "react";
import {isTauriRuntime} from "../platform/host";
import useThemeStore from "../lib/zustand/themeStore";
import { themes } from "../lib/constants";
import {
  LuMonitor as Monitor,
  LuCheck as Check,
  LuPlay as Play,
  LuCaptions as Captions,
  LuSlidersHorizontal as Sliders,
  LuInfo as Info,
} from "react-icons/lu";
import { PlayerSettings } from "../components/settings/PlayerSettings";
import { SubtitleSettings } from "../components/settings/SubtitleSettings";
import { PreferencesSettings } from "../components/settings/PreferencesSettings";
import useAuthStore from "../lib/zustand/authStore";
import { syncServers, clearManagedServers, useServerStatus } from "../lib/services/serverSync";
import { checkAppUpdates } from "../lib/hooks/useAppUpdater";
import { FocusableButton } from "../components/layout/FocusableButton";
import { Switch } from "../components/ui/switch";
import { settingsStorage } from "../lib/storage";
import {
  exportLogs,
  isDetailedLoggingEnabled,
  setDetailedLogging,
} from "../lib/logging/vegaLog";
import { toast } from "../lib/zustand/toastStore";

import {exportBackup, pickBackup, restoreBackup} from "../lib/backup";
import "./SettingsPage.css";
import {CustomSelect} from '../components/CustomSelect';

export const SettingsPage: React.FC = () => {
  const { primary, setPrimary } = useThemeStore();
  const [uiScale, setUiScale] = React.useState(() => settingsStorage.getUiScale());
  React.useEffect(() => {
    const update = () => setUiScale(settingsStorage.getUiScale());
    window.addEventListener('vega-ui-scale-change', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('vega-ui-scale-change', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  const [appVersion, setAppVersion] = React.useState("Loading...");
  const authUser = useAuthStore((state) => state.user);
  const authProfile = useAuthStore((state) => state.profile);
  const signOutNow = () => useAuthStore.getState().signOut();
  const serverStatuses = useServerStatus((state) => state.statuses);
  const serversSyncing = useServerStatus((state) => state.syncing);
  const [infoPageDynamicTheme, setInfoPageDynamicTheme] = React.useState(() =>
    settingsStorage.isInfoPageDynamicThemeEnabled(),
  );
  const [showContinueWatching, setShowContinueWatching] = React.useState(() =>
    settingsStorage.showContinueWatching(),
  );
  const [detailedLogging, setDetailedLoggingState] = React.useState(
    isDetailedLoggingEnabled,
  );
  const [exportingLogs, setExportingLogs] = React.useState(false);

  const [backupBusy, setBackupBusy] = React.useState(false);
  const handleBackup = async (action: "export" | "import") => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      if (action === "export") {
        if (await exportBackup()) toast("Backup exported");
      } else {
        const backup = await pickBackup();
        if (!backup) return;
        const {ask} = await import("@tauri-apps/plugin-dialog");
        if (!await ask("This replaces your settings and installed providers, and your library if included. CineHub will reload after restoring.", {title: "Restore backup?", kind: "warning"})) return;
        restoreBackup(backup);
        window.location.reload();
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not process backup");
    } finally {
      setBackupBusy(false);
    }
  };

  const handleExportLogs = async () => {
    setExportingLogs(true);
    try {
      if (await exportLogs()) toast("Logs exported");
    } catch (error: any) {
      toast(String(error?.message || error || "Could not export logs"));
    } finally {
      setExportingLogs(false);
    }
  };

  React.useEffect(() => {
    if (!isTauriRuntime()) {setAppVersion("Web application"); return;}
    import("@tauri-apps/api/app")
      .then((app) => app.getVersion())
      .then((v) => setAppVersion(`Version ${v}`))
      .catch(() => setAppVersion("Version 1.0.0"));
  }, []);

  return (
    <div className="settings-page">
      <header className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">Settings</h1>
        </div>
      </header>

      <div className="settings-content">
        {/* Account Group */}
        <section className="settings-group">
          <h2 className="title-md flex items-center gap-2" style={{ marginBottom: "8px" }}>
            <Info size={20} /> Account
          </h2>
          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-info">
                <h3 className="label-lg">{authProfile?.display_name || authUser?.email?.split("@")[0] || "CineHub"}</h3>
                <p className="body-md text-muted">{authUser?.email || ""}</p>
              </div>
              <FocusableButton className="theme-toggle-btn active" onClick={() => void signOutNow()}>
                Sign out
              </FocusableButton>
            </div>
          </div>
        </section>

        {/* Servers Group */}
        <section className="settings-group">
          <h2 className="title-md flex items-center gap-2" style={{ marginBottom: "8px" }}>
            <Info size={20} /> Servers
          </h2>
          <div className="settings-card">
            {serverStatuses.length === 0 && (
              <div className="settings-row">
                <div className="settings-info">
                  <p className="body-md text-muted">
                    {serversSyncing ? "Loading servers…" : "No servers yet. Servers are added by the CineHub admin."}
                  </p>
                </div>
              </div>
            )}
            {serverStatuses.map((server) => (
              <React.Fragment key={server.id}>
                <div className="settings-row">
                  <div className="settings-info">
                    <h3 className="label-lg">{server.label}</h3>
                    <p className="body-md text-muted">
                      {server.ok
                        ? `${server.providers} ready${server.error ? " (using saved copy)" : ""}`
                        : server.error || "Not available"}
                    </p>
                  </div>
                </div>
                <div className="settings-divider" />
              </React.Fragment>
            ))}
            <div className="settings-row">
              <div className="settings-info">
                <p className="body-md text-muted">
                  Servers refresh by themselves. Use these if one is missing.
                </p>
              </div>
              <FocusableButton
                className="theme-toggle-btn active"
                disabled={serversSyncing}
                onClick={() => void syncServers()}
              >
                {serversSyncing ? "Refreshing…" : "Refresh"}
              </FocusableButton>
              <FocusableButton
                className="theme-toggle-btn active"
                disabled={serversSyncing}
                onClick={() => {
                  clearManagedServers();
                  void syncServers();
                }}
              >
                Reset
              </FocusableButton>
            </div>
          </div>
        </section>

        {/* Appearance Group */}
        <section className="settings-group">
          <h2
            className="title-md flex items-center gap-2"
            style={{ marginBottom: "8px" }}
          >
            <Monitor size={20} /> Appearance
          </h2>
          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-info">
                <h3 className="label-lg">UI Scale</h3>
                <p className="body-md text-muted">Adjust the size of menus, text, and controls.</p>
              </div>
              <CustomSelect
                value={String(uiScale)}
                options={[75, 85, 90, 100, 110, 125, 150, 175, 200].map(value => ({value: String(value), label: value === 100 ? '100% (Default)' : `${value}%`}))}
                onChange={value => settingsStorage.setUiScale(Number(value))}
              />
            </div>
            <div className="settings-divider" />
            {/* Accent Color */}
            <div className="settings-row">
              <div className="settings-info">
                <h3 className="label-lg">Accent Color</h3>
                <p className="body-md text-muted">
                  Choose your preferred primary color
                </p>
              </div>
              <div className="accent-color-grid">
                {themes.map((t) => {
                  const isMatch =
                    primary?.toLowerCase() === t.color?.toLowerCase();
                  return (
                    <FocusableButton
                      key={t.name}
                      className={`accent-color-btn ${isMatch ? "active" : ""}`}
                      style={{ backgroundColor: t.color }}
                      onClick={() => setPrimary(t.color)}
                      title={t.name}
                      aria-label={`Set accent color to ${t.name}`}
                    >
                      {isMatch && (
                        <Check
                          size={16}
                          color={t.color === "#FFFFFF" ? "#000" : "#FFF"}
                        />
                      )}
                    </FocusableButton>
                  );
                })}
              </div>
            </div>

            <div className="settings-divider" />

            <div className="settings-row">
              <div className="settings-info">
                <h3 className="label-lg">Dynamic Info Page Theme</h3>
                <p className="body-md text-muted">
                  Derive the info page colors from the title artwork
                </p>
              </div>
              <Switch
                checked={infoPageDynamicTheme}
                onCheckedChange={(enabled) => {
                  setInfoPageDynamicTheme(enabled);
                  settingsStorage.setInfoPageDynamicThemeEnabled(enabled);
                }}
                aria-label="Use artwork colors on info pages"
              />
            </div>

            <div className="settings-divider" />

            <div className="settings-row">
              <div className="settings-info">
                <h3 className="label-lg">Continue Watching</h3>
                <p className="body-md text-muted">
                  Show the Continue Watching row on Home. Playback positions
                  are still saved.
                </p>
              </div>
              <Switch
                checked={showContinueWatching}
                onCheckedChange={(enabled) => {
                  setShowContinueWatching(enabled);
                  settingsStorage.setShowContinueWatching(enabled);
                }}
                aria-label="Show Continue Watching on Home"
              />
            </div>
          </div>
        </section>

        {/* Player Group */}
        <section className="settings-group">
          <h2
            className="title-md flex items-center gap-2"
            style={{ marginBottom: "8px" }}
          >
            <Play size={20} /> Player
          </h2>
          <div className="settings-card">
            <PlayerSettings />
          </div>
        </section>

        {/* Subtitles Group */}
        <section className="settings-group">
          <h2
            className="title-md flex items-center gap-2"
            style={{ marginBottom: "8px" }}
          >
            <Captions size={20} /> Subtitles
          </h2>
          <div className="settings-card">
            <SubtitleSettings />
          </div>
        </section>

        {/* Preferences Group */}
        <section className="settings-group">
          <h2
            className="title-md flex items-center gap-2"
            style={{ marginBottom: "8px" }}
          >
            <Sliders size={20} /> Preferences
          </h2>
          <div className="settings-card">
            <PreferencesSettings />
          </div>
        </section>

        {/* About Group */}
        <section className="settings-group">
          <h2
            className="title-md flex items-center gap-2"
            style={{ marginBottom: "8px" }}
          >
            <Info size={20} /> About
          </h2>
          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-info">
                <h3 className="label-lg">CineHub</h3>
                <p className="body-md text-muted">{appVersion}</p>
              </div>
            </div>
            {isTauriRuntime() && <><div className="settings-divider" />
            <div className="settings-row">
              <div className="settings-info">
                <h3 className="label-lg">Detailed Logging</h3>
                <p className="body-md text-muted">
                  Records more detail for bug reports. Keeps up to 4 MB of
                  logs. Turns off after 24 hours.
                </p>
              </div>
              <Switch
                checked={detailedLogging}
                onCheckedChange={(next) => {
                  setDetailedLoggingState(next);
                  setDetailedLogging(next);
                }}
                aria-label="Enable detailed logging"
              />
            </div>
            <div className="settings-divider" />
            <div className="settings-row">
              <div className="settings-info">
                <h3 className="label-lg">Export Logs</h3>
                <p className="body-md text-muted">
                  Save recent app logs to a file to attach to a bug report.
                  Links and sign-in data are removed.
                </p>
              </div>
              <FocusableButton
                className="theme-toggle-btn active"
                onClick={exportingLogs ? undefined : handleExportLogs}
                disabled={exportingLogs}
              >
                {exportingLogs ? "Exporting..." : "Export"}
              </FocusableButton>
            </div>
            <div className="settings-divider" />
            <div className="settings-divider" />
            </>}
          </div>
        </section>
      </div>
    </div>
  );
};
