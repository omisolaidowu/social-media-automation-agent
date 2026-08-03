import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, '..', 'screenshots');

// Ensure screenshots directory exists on first import
mkdirSync(SCREENSHOT_DIR, { recursive: true });

/**
 * Capture a labelled screenshot to ./screenshots/<label>-<timestamp>.png
 * @param {import('puppeteer').Page} page
 * @param {string} label  Human-readable step name, e.g. "02-after-login"
 */
export async function screenshot(page, label) {
  const filename = `${label}-${Date.now()}.png`;
  const filepath = join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`  📸 Screenshot saved → screenshots/${filename}`);
  return filepath;
}

/**
 * Human-like random delay between min and max milliseconds.
 * @param {number} min  Minimum wait in ms (default 800)
 * @param {number} max  Maximum wait in ms (default 2200)
 */
export async function randomDelay(min = 800, max = 2200) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async operation up to `attempts` times with exponential back-off.
 * @template T
 * @param {() => Promise<T>} fn         Async function to attempt
 * @param {number}           attempts   Max attempts (default 3)
 * @param {number}           baseMs     Base delay in ms (default 1500)
 * @returns {Promise<T>}
 */
export async function retry(fn, attempts = 3, baseMs = 1500) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const wait = baseMs * 2 ** i;
      console.warn(`  ⚠️  Attempt ${i + 1}/${attempts} failed — retrying in ${wait}ms…`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastError;
}

/**
 * Wait for a selector, then click it. Consolidates the common waitFor+click pair.
 * @param {import('puppeteer').Page} page
 * @param {string} selector
 * @param {number} timeout
 */
export async function waitAndClick(page, selector, timeout = 15_000) {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.click(selector);
}

/**
 * Type into a field character by character with a random per-keystroke delay,
 * mimicking a real user. Requires humanizeInteractions to be false at the SDK
 * level so we control the timing explicitly here.
 * @param {import('puppeteer').Page} page
 * @param {string} selector
 * @param {string} text
 */
export async function humanType(page, selector, text) {
  await page.waitForSelector(selector, { visible: true });
  await page.focus(selector);
  await page.type(selector, text, { delay: Math.floor(Math.random() * 60) + 40 });
}
