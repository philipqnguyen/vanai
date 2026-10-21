// The one Playwright loader for the repo's browser tools (tools/qa, tools/assets,
// tools/music). Playwright is a pinned devDependency of the client, so it is
// resolved from client/node_modules even though these scripts live outside it.
//
//   import { chromium, CHANNEL, GL_ARGS, QA_BASE, API_BASE } from './lib/playwright.mjs';
//   const browser = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
//
// or, for new scripts, `await launchChromium({ headless: true })`.
//
// WebGL needs a real GL backend in headless Chrome, and which one exists is the
// platform's: Metal on macOS, D3D11 on Windows, Vulkan on Linux with a GPU and
// SwiftShader (CPU, slow, colours close rather than exact; CLOUD.md) without one.
// The system Chrome is used when it is installed, because the GPU paths above
// were measured on it; otherwise Playwright's own Chromium
// (`npx playwright install chromium`).
//
// Overrides:
//   VANAI_PLAYWRIGHT_PATH  a Playwright package directory to load instead
//   VANAI_QA_GL_ARGS       the GL flags, space-separated ('' for none)
//   VANAI_QA_CHANNEL       a browser channel (chrome, chrome-beta, msedge), or
//                          'none' for Playwright's bundled Chromium
//   VANAI_QA_BASE          the dev client, default http://localhost:5173
//                          (VANAI_QA_URL is the older name and still read)
//   VANAI_API_BASE         the Rails server, default http://localhost:3000
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function load() {
  const env = process.env.VANAI_PLAYWRIGHT_PATH || process.env.PLAYWRIGHT_MODULE;
  if (env) return createRequire(import.meta.url)(env);
  try { return createRequire(join(ROOT, 'client', 'package.json'))('playwright'); } catch { /* not installed in client/ */ }
  try { return createRequire(import.meta.url)('playwright'); } catch { /* not on the module path */ }
  try { return createRequire(import.meta.url)(join(execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim(), 'playwright')); }
  catch { throw new Error('Playwright not found: run `npm install` in client/, or set VANAI_PLAYWRIGHT_PATH to its package directory.'); }
}

export const playwright = load();
export const { chromium, webkit, firefox } = playwright;

function defaultGlArgs() {
  if (process.platform === 'darwin') return ['--use-gl=angle', '--use-angle=metal'];
  if (process.platform === 'win32') return ['--use-gl=angle', '--use-angle=d3d11'];
  // a render node means a GPU driver is there to take Vulkan
  if (existsSync('/dev/dri/renderD128')) return ['--use-gl=angle', '--use-angle=vulkan'];
  return ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
}

export const GL_ARGS = process.env.VANAI_QA_GL_ARGS !== undefined
  ? process.env.VANAI_QA_GL_ARGS.split(/\s+/).filter(Boolean)
  : defaultGlArgs();

// Playwright's own install locations for the stable Chrome channel
function chromeInstalled() {
  if (process.platform === 'darwin') return existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  if (process.platform === 'win32') {
    return ['LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)']
      .some((v) => process.env[v] && existsSync(join(process.env[v], 'Google', 'Chrome', 'Application', 'chrome.exe')));
  }
  return existsSync('/opt/google/chrome/chrome');
}

const channel = process.env.VANAI_QA_CHANNEL !== undefined
  ? (['', 'none'].includes(process.env.VANAI_QA_CHANNEL) ? null : process.env.VANAI_QA_CHANNEL)
  : (chromeInstalled() ? 'chrome' : null);

// spread into launch options: {channel} or nothing
export const CHANNEL = channel ? { channel } : {};

export const QA_BASE = process.env.VANAI_QA_BASE || process.env.VANAI_QA_URL || 'http://localhost:5173';
export const API_BASE = process.env.VANAI_API_BASE || 'http://localhost:3000';

// Launch options with the channel and GL flags; a script's own args follow them.
export function chromiumOptions(opts = {}) {
  return { ...CHANNEL, ...opts, args: [...GL_ARGS, ...(opts.args ?? [])] };
}

export function launchChromium(opts = {}) {
  return chromium.launch(chromiumOptions(opts));
}
