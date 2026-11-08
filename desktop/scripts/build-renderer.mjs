// @ts-check
import {build} from 'esbuild';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'src', 'renderer');

await build({
  entryPoints: [join(root, 'js', 'main.js')],
  outfile: join(root, 'dist', 'app.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome128', // Electron 33
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});
