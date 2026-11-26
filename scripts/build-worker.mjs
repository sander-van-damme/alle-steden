import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogPaths, workerPaths } from '../worker/router.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const wranglerVersion = '4.168.0';
const output = resolve(root, 'worker/dist');
const generated = resolve(root, 'worker/.generated');
const run = (command, args, env = process.env) => {
  const process = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (process.error) throw process.error;
  if (process.status !== 0) throw new Error(command + ' eindigde met code ' + (process.status ?? process.signal));
};

const pages = JSON.parse(await readFile(resolve(root, 'site/_routes.json'), 'utf8'));
if (pages.exclude.length || pages.include.length !== workerPaths.length ||
  !pages.include.every((route) => workerPaths.includes(route))) {
  throw new Error('De Worker-routes komen niet overeen met de Pages-routes.');
}

run(process.execPath, ['scripts/build.mjs']);
const catalogs = Object.fromEntries(await Promise.all(catalogPaths.map(async (pathname) => {
  const bytes = await readFile(resolve(root, 'dist', '.' + pathname), 'utf8');
  const data = JSON.parse(bytes);
  if (!data || Array.isArray(data) || typeof data !== 'object' || !Object.keys(data).length) {
    throw new Error('Lege catalogus voor Worker: ' + pathname);
  }
  return [pathname, bytes];
})));
await mkdir(generated, { recursive: true });
await writeFile(resolve(generated, 'catalogs.js'), 'export const catalogs = ' + JSON.stringify(catalogs) + ';\n');
await rm(output, { recursive: true, force: true });

const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_API_KEY, CF_API_TOKEN, CF_API_KEY,
  CLOUDFLARE_ACCOUNT_ID, CF_ACCOUNT_ID, UIT_API_KEY, ...environment } = process.env;
const env = { ...environment, WRANGLER_SEND_METRICS: 'false' };
// The exact pinned version only runs the bundler; no login, deployment or route changes.
run(npm, ['exec', '--yes', '--package=wrangler@' + wranglerVersion, '--',
  'wrangler', 'deploy', '--dry-run', '--config', 'worker/wrangler.jsonc', '--outdir', output], env);
