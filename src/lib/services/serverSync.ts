import {supabase, CineHubServer} from '../supabase';
import {extensionManager} from './ExtensionManager';
import {
  extensionStorage,
  ProviderExtension,
  ProviderSource,
} from '../storage/extensionStorage';
import {createProviderSource} from '../utils/helpers';
import useContentStore from '../zustand/contentStore';

/**
 * Servers are managed by the CineHub admin (Supabase table `cinehub_servers`).
 * Every managed source gets an internal author key with this prefix, so the app
 * can tell them apart from anything else and clean them up when the admin
 * removes or disables a server.
 */
const MANAGED_PREFIX = 'cinehub-';
export const managedAuthor = (id: string) => `${MANAGED_PREFIX}${id.replace(/-/g, '').slice(0, 10)}`;

export interface SyncResult {
  servers: number;
  providers: number;
  errors: string[];
}

let running: Promise<SyncResult> | null = null;

export const fetchServers = async (
  includeDisabled = false,
): Promise<CineHubServer[]> => {
  let query = supabase
    .from('cinehub_servers')
    .select('*')
    .order('position', {ascending: true})
    .order('created_at', {ascending: true});
  if (!includeDisabled) {
    query = query.eq('enabled', true);
  }
  const {data, error} = await query;
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as CineHubServer[];
};

const toSource = (server: CineHubServer): ProviderSource => {
  const parsed = createProviderSource(server.source_url.trim());
  const manifestUrl = server.manifest_url?.trim() || parsed.manifestUrl;
  return {
    author: managedAuthor(server.id),
    url: parsed.url,
    ...(manifestUrl ? {manifestUrl} : {}),
  };
};

/** Fetches a source's manifest without installing anything (Admin "Test"). */
export const testServerSource = async (
  sourceUrl: string,
  manifestUrl?: string,
): Promise<ProviderExtension[]> => {
  const parsed = createProviderSource(sourceUrl.trim());
  const manifest = manifestUrl?.trim() || parsed.manifestUrl;
  return extensionManager.fetchManifest(
    {
      author: 'cinehub-test',
      url: parsed.url,
      ...(manifest ? {manifestUrl: manifest} : {}),
    },
    true,
  );
};

const labelFor = (label: string, index: number, total: number): string =>
  total > 1 ? `${label} ${index + 1}` : label;

const run = async (): Promise<SyncResult> => {
  const result: SyncResult = {servers: 0, providers: 0, errors: []};

  // If this throws (offline etc.) we keep whatever is already installed.
  const servers = await fetchServers(false);
  result.servers = servers.length;

  const wantedAuthors = new Set(servers.map(s => managedAuthor(s.id)));

  // 1) Remove everything that is not (or no longer) an admin-managed server.
  for (const source of extensionStorage.getProviderSources()) {
    if (!wantedAuthors.has(source.author)) {
      for (const p of extensionStorage.getInstalledProviders()) {
        if (p.source?.author === source.author) {
          extensionManager.uninstallProvider(p.value, source.author);
        }
      }
      extensionStorage.removeProviderSource(source.author);
    }
  }
  // Providers that have no source at all (old data) are dropped as well.
  for (const p of extensionStorage.getInstalledProviders()) {
    if (!p.source?.author || !wantedAuthors.has(p.source.author)) {
      extensionManager.uninstallProvider(p.value, p.source?.author);
    }
  }

  // 2) Add / update each managed server.
  for (const server of servers) {
    try {
      const source = toSource(server);
      extensionStorage.addProviderSources(
        source.author,
        source.url,
        source.manifestUrl,
      );

      let manifest = await extensionManager.fetchManifest(source, true);
      manifest = manifest.filter(p => !p.disabled);
      if (server.provider_value?.trim()) {
        manifest = manifest.filter(p => p.value === server.provider_value!.trim());
      }
      const hidden = new Set(server.hidden_providers ?? []);
      if (hidden.size > 0) {
        manifest = manifest.filter(p => !hidden.has(p.value));
      }

      const total = manifest.length;
      const keep = new Set<string>();

      for (let i = 0; i < manifest.length; i += 1) {
        const remote = manifest[i];
        const display_name = labelFor(server.label, i, total);
        const provider: ProviderExtension = {...remote, display_name};
        keep.add(provider.value);

        const installed = extensionStorage
          .getInstalledProviders()
          .find(
            p => p.value === provider.value && p.source?.author === source.author,
          );

        if (!installed) {
          await extensionManager.installProvider(provider);
        } else if (installed.version !== provider.version) {
          await extensionManager.updateProvider(provider);
        }
        result.providers += 1;
      }

      // Rename + drop providers that vanished from the manifest.
      const current = extensionStorage.getInstalledProviders();
      const next: ProviderExtension[] = [];
      for (const p of current) {
        if (p.source?.author !== source.author) {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${server.label}: ${message}`);
      console.warn('[CineHub] Server sync failed for', server.label, error);
    }
  }

  // 3) Refresh the UI store and make sure a valid server is selected.
  const store = useContentStore.getState();
  const installed = extensionStorage.getInstalledProviders();
  store.setInstalledProviders(installed);
  const selected = store.provider;
  const stillValid = installed.some(
    p => p.value === selected?.value && p.source?.author === selected?.source?.author,
  );
  if (!stillValid) {
    const first = useContentStore.getState().installedProviders[0];
    if (first) {
      store.setProvider(first);
    }
  }
  return result;
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
};
