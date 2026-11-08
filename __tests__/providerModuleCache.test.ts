const mockValues = new Map<string, unknown>();
const mockReads = new Map<string, number>();
jest.mock('react-native-mmkv-storage', () => ({
  MMKVLoader: class {
    withInstanceID() {
      return this;
    }
    initialize() {
      return {
        getString: (key: string) => {
          mockReads.set(key, (mockReads.get(key) || 0) + 1);
          return mockValues.get(key);
        },
        setString: (key: string, value: string) => mockValues.set(key, value),
        getBool: (key: string) => mockValues.get(key),
        setBool: (key: string, value: boolean) => mockValues.set(key, value),
        getInt: (key: string) => mockValues.get(key),
        setInt: (key: string, value: number) => mockValues.set(key, value),
        removeItem: (key: string) => mockValues.delete(key),
        clearStore: () => mockValues.clear(),
      };
    }
  },
}));
jest.mock('../src/lib/storage/sourceTokenStorage', () => ({
  sourceTokenStorage: {delete: jest.fn()},
}));
import {mainStorage} from '../src/lib/storage/StorageService';
import {
  ExtensionStorage,
  ExtensionKeys,
  ProviderModule,
} from '../src/lib/storage/extensionStorage';

const moduleFixture = (author: string, version = '1'): ProviderModule => ({
  value: 'same-id',
  sourceAuthor: author,
  version,
  modules: {posts: 'code-' + author + version},
  cachedAt: Number(version),
});

beforeEach(() => {
  mainStorage.clearAll();
  mockReads.clear();
});

it('reads the module store once for repeated warm scoped lookups', () => {
  mainStorage.setArray(ExtensionKeys.PROVIDER_MODULES, [
    moduleFixture('a'),
    moduleFixture('b'),
  ]);
  const storage = new ExtensionStorage();
  for (let i = 0; i < 20; i++) {
    expect(storage.getProviderModules('same-id', 'a')?.modules.posts).toBe(
      'code-a1',
    );
    expect(storage.getProviderModules('same-id', 'b')?.modules.posts).toBe(
      'code-b1',
    );
  }
  expect(mockReads.get(ExtensionKeys.PROVIDER_MODULES)).toBe(1);
});

it('invalidates on updates, removals, raw restore writes, and storage reset', () => {
  const storage = new ExtensionStorage();
  storage.cacheProviderModules(moduleFixture('a'));
  expect(storage.getProviderModules('same-id', 'a')?.version).toBe('1');
  storage.cacheProviderModules(moduleFixture('a', '2'));
  expect(storage.getProviderModules('same-id', 'a')?.version).toBe('2');
  storage.removeProviderModules('same-id', 'a');
  expect(storage.getProviderModules('same-id', 'a')).toBeUndefined();
  mainStorage.setString(
    ExtensionKeys.PROVIDER_MODULES,
    JSON.stringify([moduleFixture('b', '3')]),
  );
  expect(storage.getProviderModules('same-id', 'b')?.version).toBe('3');
  expect(storage.getProviderModules('same-id', 'a')).toBeUndefined();
  mainStorage.clearAll();
  expect(storage.getProviderModules('same-id', 'b')).toBeUndefined();
});

it('reselects the default source without reloading unchanged module code', () => {
  const storage = new ExtensionStorage();
  storage.addProviderSources('a', 'https://a.example');
  storage.addProviderSources('b', 'https://b.example');
  mainStorage.setArray(ExtensionKeys.PROVIDER_MODULES, [
    moduleFixture('a'),
    moduleFixture('b'),
  ]);
  expect(storage.getProviderModules('same-id')?.sourceAuthor).toBe('a');
  storage.setDefaultProviderSource('b');
  expect(storage.getProviderModules('same-id')?.sourceAuthor).toBe('b');
  expect(mockReads.get(ExtensionKeys.PROVIDER_MODULES)).toBe(1);
});
