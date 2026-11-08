// @ts-check
/**
 * Builds the desktop app's generated files from the Android app's own sources,
 * so both apps share one provider sandbox, one source-URL parser, one cookie jar
 * and one Live TV channel parser. Nothing in ../src is modified.
 *
 * Output: desktop/src/main/generated/*
 */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, '..');
const app = join(desktop, '..');
const out = join(desktop, 'src', 'main', 'generated');
mkdirSync(out, {recursive: true});

const require = createRequire(import.meta.url);
const ts = require('typescript');

const compile = (source, fileName) =>
  ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

// 1) Provider sandbox runtime (HTML document + worker, one JS string).
{
  const src = readFileSync(
    join(app, 'src/lib/sandbox/generated/sandboxRuntime.generated.ts'),
    'utf8',
  );
  const match = /export const SANDBOX_RUNTIME = ("(?:[^"\\]|\\[\s\S])*");/.exec(src);
  if (!match) throw new Error('Could not read SANDBOX_RUNTIME');
  writeFileSync(join(out, 'sandbox-runtime.js'), JSON.parse(match[1]));
}

// 2) Provider source parser (github / gitlab / custom manifest URLs).
{
  const src = readFileSync(join(app, 'src/lib/utils/helpers.ts'), 'utf8').replace(
    /import \{ProviderSource\} from [^\n]+\n/,
    'type ProviderSource = {author: string; url: string; manifestUrl?: string; isDefault?: boolean};\n',
  );
  writeFileSync(join(out, 'helpers.cjs'), compile(src, 'helpers.ts'));
}

// 3) Per-author cookie jar, backed by the desktop key-value store.
{
  const src = readFileSync(
    join(app, 'src/lib/sandbox/providerCookieJar.ts'),
    'utf8',
  )
    .replace(
      /import \{providerCookieStorage\} from [^\n]+\n/,
      "import {providerCookieStorage} from '../storage-shim';\n",
    )
    .replace(
      /import \{providerAuthor\} from [^\n]+\n/,
      "const providerAuthor = (a?: string | null): string => a?.trim() || 'local';\n",
    );
  writeFileSync(join(out, 'cookieJar.cjs'), compile(src, 'providerCookieJar.ts'));
}

// 4) Live TV channel list parsing (JSON + M3U).
{
  const src = readFileSync(join(app, 'src/lib/liveTv/liveTv.ts'), 'utf8');
  const cut = src.indexOf('const fetchText');
  if (cut < 0) throw new Error('liveTv.ts layout changed');
  const head = src
    .slice(0, cut)
    .replace(/import \{mainStorage\}[^\n]+\n/, '')
    .replace(/import type \{RootStackParamList\}[^\n]+\n/, '');
  writeFileSync(join(out, 'liveParse.cjs'), compile(head, 'liveParse.ts'));
}

console.log('desktop: generated files written to', out);
