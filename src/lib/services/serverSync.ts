// @ts-nocheck
import {create} from 'zustand';
import {supabase} from '../supabase';
import type {CineHubServer} from '../supabase';
import {extensionManager} from './ExtensionManager';
import {extensionStorage} from '../storage/extensionStorage';
import type {ProviderExtension, ProviderSource} from '../storage/extensionStorage';
import {createProviderSource} from '../utils/helpers';
import useContentStore from '../zustand/contentStore';

/**
 * Servers are managed by the CineHub admin (Supabase table `cinehub_servers`).
 * Every managed source gets an internal author key with this prefix, so the app
 * can tell them apart and clean up when the admin removes or disables one.
 */
const MANAGED_PREFIX = 'cinehub-';
export const managedAuthor = (id: string) => `${MANAGED_PREFIX}${id.replace(/-/g, '').slice(0, 10)}`;

export interface ServerStatus {
  id: string;
  label: string;
  ok: boolean;
  providers: number;
  error?: string;
}

export interface SyncResult {
  servers: number;
  providers: number;
  errors: string[];
  statuses: ServerStatus[];
}

interface StatusState {
  statuses: ServerStatus[];
  syncing: boolean;
  lastSyncAt: number;
  set: (patch: Partial<StatusState>) => void;
}

/** What the Settings page shows: every admin server and whether it is ready. */
export const useServerStatus = create<StatusState>(set => ({
  statuses: [],
  syncing: false,
  lastSyncAt: 0,
  set: patch => set(patch),
}));

let running: Promise<SyncResult> | null = null;

export const fetchServers = async (): Promise<CineHubServer[]> => {
  const {data, error} = await supabase
    .from('cinehub_servers')
    .select('*')
    .eq('enabled', true)
    .order('position', {ascending: true})
    .order('created_at', {ascending: true});
  if (error) throw new Error(error.message);
  return (data ?? []) as CineHubServer[];
};

const toSource = (server: CineHubServer): ProviderSource => {
  const parsed = createProviderSource(server.source_url.trim());
  const manifestUrl = (server.manifest_url && server.manifest_url.trim()) || parsed.manifestUrl;
  return {
    author: managedAuthor(server.id),
    url: parsed.url,
    ...(manifestUrl ? {manifestUrl} : {}),
  };
};

const labelFor = (label: string, index: number, total: number): string =>
  total > 1 ? `${label} ${index + 1}` : label;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Installs / updates one server's providers. Returns how many it has. */
const syncOne = async (server: CineHubServer): Promise<number> => {
  const source = toSource(server);
  extensionStorage.addProviderSources(source.author, source.url, source.manifestUrl);

  let manifest = await extensionManager.fetchManifest(source, true);
  manifest = manifest.filter(p => !p.disabled);
  if (server.provider_value && server.provider_value.trim()) {
    manifest = manifest.filter(p => p.value === server.provider_value!.trim());
  }
  const hidden = new Set(server.hidden_providers ?? []);
  if (hidden.size > 0) manifest = manifest.filter(p => !hidden.has(p.value));
  if (manifest.length === 0) throw new Error('This server has no providers');

  const total = manifest.length;
  const keep = new Set<string>();
  let installedCount = 0;
  let firstProviderError: unknown = null;

  for (let i = 0; i < manifest.length; i += 1) {
    const remote = manifest[i];
    const provider: ProviderExtension = {...remote, display_name: labelFor(server.label, i, total)};
    keep.add(provider.value);
    try {
      const installed = extensionStorage
        .getInstalledProviders()
        .find(p => p.value === provider.value && p.source && p.source.author === source.author);
      if (!installed) {
        await extensionManager.installProvider(provider);
      } else if (installed.version !== provider.version) {
        await extensionManager.updateProvider(provider);
      }
      installedCount += 1;
    } catch (error) {
      // One broken provider must not hide the rest of the server.
      if (!firstProviderError) firstProviderError = error;
      console.warn('[CineHub] Provider install failed:', provider.value, error);
    }
  }
  if (installedCount === 0 && firstProviderError) throw firstProviderError;

  // Rename providers of this server and drop the ones that vanished.
  const next: ProviderExtension[] = [];
  for (const p of extensionStorage.getInstalledProviders()) {
    if (!p.source || p.source.author !== source.author) {
      next.push(p);
      continue;
    }
    if (!keep.has(p.value)) {
      extensionStorage.removeProviderModules(p.value, source.author);
      continue;
    }
    const idx = manifest.findIndex(m => m.value === p.value);
    next.push({...p, display_name: labelFor(server.label, idx, total)});
  }
  extensionStorage.setInstalledProviders(next);
  return installedCount;
};

const run = async (): Promise<SyncResult> => {
  const result: SyncResult = {servers: 0, providers: 0, errors: [], statuses: []};
  useServerStatus.getState().set({syncing: true});

  try {
    // If this throws (offline etc.) whatever is installed stays as it is.
    const servers = await fetchServers();
    result.servers = servers.length;
    const wantedAuthors = new Set(servers.map(s => managedAuthor(s.id)));

    // 1) Remove everything that is not (or no longer) an admin-managed server.
    for (const source of extensionStorage.getProviderSources()) {
      if (!wantedAuthors.has(source.author)) {
        for (const p of extensionStorage.getInstalledProviders()) {
          if (p.source && p.source.author === source.author) {
            extensionStorage.uninstallProvider(p.value, source.author);
          }
        }
        extensionStorage.removeProviderSource(source.author);
      }
    }
    for (const p of extensionStorage.getInstalledProviders()) {
      if (!p.source || !p.source.author || !wantedAuthors.has(p.source.author)) {
        extensionStorage.uninstallProvider(p.value, p.source && p.source.author);
      }
    }

    // 2) Add / update each managed server. A failing server is retried and
    //    never stops the others.
    for (const server of servers) {
      let count = 0;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          count = await syncOne(server);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.warn('[CineHub] Server sync failed:', server.label, 'attempt', attempt + 1, error);
          if (attempt < 2) await wait(1200 * (attempt + 1));
        }
      }
      if (lastError) {
        // Providers installed earlier keep working from the cache.
        const kept = extensionStorage
          .getInstalledProviders()
          .filter(p => p.source && p.source.author === managedAuthor(server.id)).length;
        const message = errorText(lastError);
        result.errors.push(`${server.label}: ${message}`);
        result.statuses.push({id: server.id, label: server.label, ok: kept > 0, providers: kept, error: message});
        result.providers += kept;
      } else {
        result.statuses.push({id: server.id, label: server.label, ok: true, providers: count});
        result.providers += count;
      }
    }

    // 3) Refresh the UI store and make sure a valid server is selected.
    const store = useContentStore.getState();
    const installed = extensionStorage.getInstalledProviders();
    store.setInstalledProviders(installed);
    const selected = store.provider;
    const stillValid = installed.some(
      p => p.value === (selected && selected.value) && p.source && selected.source && p.source.author === selected.source.author,
    );
    if (!stillValid) {
      const first = useContentStore.getState().installedProviders[0];
      if (first) store.setProvider(first);
    } else if (selected && selected.source && selected.source.author) {
      // Re-apply so lookups by provider id use the selected server's code.
      store.setProvider(installed.find(p => p.value === selected.value && p.source && p.source.author === selected.source.author) || selected);
    }
    return result;
  } finally {
    useServerStatus.getState().set({syncing: false, lastSyncAt: Date.now(), statuses: result.statuses});
  }
};

/** Pulls the admin's server list and installs/updates/removes to match it. */
export const syncServers = (): Promise<SyncResult> => {
  if (!running) {
    running = run().finally(() => {
      running = null;
    });
  }
  return running;
};

/** Called on sign-out so the next account starts clean. */
export const clearManagedServers = (): void => {
  extensionStorage.clearAll();
  useContentStore.getState().setInstalledProviders([]);
  useServerStatus.getState().set({statuses: [], lastSyncAt: 0});
};
