// load-cookies.js — Inject X auth cookies from a local JSON file

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIE_FILE = join(__dirname, '..', 'cookies', 'x-cookies.json');

export function hasSavedCookies() {
  return existsSync(COOKIE_FILE);
}

export async function injectXCookies(page) {
  if (!existsSync(COOKIE_FILE)) {
    throw new Error(
      `Cookie file not found: ${COOKIE_FILE}\n` +
      'See scripts/load-cookies.js for export instructions.'
    );
  }

  const raw = readFileSync(COOKIE_FILE, 'utf8');
  let cookies;
  try { cookies = JSON.parse(raw); }
  catch { throw new Error(`${COOKIE_FILE} is not valid JSON — re-export from Cookie-Editor`); }

  if (!Array.isArray(cookies))
    throw new Error('Cookie file must be a JSON array — use Cookie-Editor → Export as JSON');

  const puppeteerCookies = cookies
    .filter(c => c.name && c.value)
    .map(c => ({
      name:     c.name,
      value:    c.value,
      domain:   c.domain?.startsWith('.') ? c.domain : `.${c.domain ?? 'x.com'}`,
      path:     c.path  ?? '/',
      secure:   c.secure   ?? true,
      httpOnly: c.httpOnly ?? false,
      sameSite: c.sameSite ?? 'None',
      expires:  c.expirationDate ?? c.expires
                ?? Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    }));

  const KEY = ['auth_token', 'ct0', 'twid'];
  const present = puppeteerCookies.map(c => c.name);
  const missing = KEY.filter(k => !present.includes(k));
  if (missing.length)
    console.warn(`  Missing key X cookies: ${missing.join(', ')} — re-export while logged in`);

  // Navigate to x.com first so setCookie accepts the domain
  await page.goto('https://x.com', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.setCookie(...puppeteerCookies);

  const found = KEY.filter(k => present.includes(k));
  console.log(`  Injected ${puppeteerCookies.length} cookies (key: ${found.join(', ')})`);
}