/*
 * DOM facts confirmed from live inspection (July 2026):
 * Selectors may change if the platform updates its markup. Consider adding automated
 * selector recovery if this is extended beyond a single-platform build.
 */

import { resolve } from 'path';
import { screenshot, randomDelay, retry } from './utils.js';
import { hasSavedCookies, injectXCookies } from '../scripts/load-cookies.js';

const COOKIE_PATH = './cookies/x-cookies.json';

// define the selectors
const SEL = {
  loggedInProbe:     '[data-testid="SideNav_NewTweet_Button"]',
  composeTrigger:    '[data-testid="SideNav_NewTweet_Button"]',
  composeFallback:   '[data-testid="tweetTextarea_0_label"]',
  tweetTextarea:     'div[data-testid="tweetTextarea_0"]',
  mediaButton:       'button[aria-label="Add photos or video"]',
  fileInput:         'input[data-testid="fileInput"]',
  uploadPreview: [
    '[data-testid="attachments"]',
    '[data-testid="tweetPhoto"]',
    'img[src^="blob:"]',
    '[data-testid="media-viewer-clip-container"]',
  ],
  tweetSubmitButton: '[data-testid="tweetButton"]',
  profileLink:       'a[data-testid="AppTabBar_Profile_Link"]',
  firstTweet:        'article[data-testid="tweet"]:first-of-type',
  permalinkSuffix:   'a[href*="/status/"]',
};

const settle = (ms) => new Promise(r => setTimeout(r, ms));

// Cookie banner

async function dismissCookieBanner(page) {
  try {
    const dismissed = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      const target =
        btns.find(b => /refuse|decline|reject/i.test(b.textContent)) ||
        btns.find(b => /accept all/i.test(b.textContent));
      if (target) { target.click(); return target.textContent.trim(); }
      return null;
    });
    if (dismissed) {
      console.log(`  → Cookie banner dismissed: "${dismissed.slice(0, 40)}"`);
      await settle(800);
    }
  } catch { }
}

export async function postToX(page, { text, imagePath }) {
  console.log('\n X Agent starting…');

  // Cookie injection is the only supported authentication path
  if (!hasSavedCookies()) {
    throw new Error(
      `No cookie file found at ${COOKIE_PATH}.\n` +
      'Export your X session cookies with the Cookie-Editor extension and ' +
      `save them to ${COOKIE_PATH} before running this agent. See README.md ` +
      'for the export steps. Form-based login is not supported in this build.'
    );
  }

  console.log(`  → Injecting cookies from ${COOKIE_PATH}…`);
  await injectXCookies(page);

  console.log('  → Navigating to x.com/home…');
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle(1500);
  await dismissCookieBanner(page);

  const loggedIn = await page
    .waitForSelector(SEL.loggedInProbe, { visible: true, timeout: 15_000 })
    .then(() => true).catch(() => false);

  if (!loggedIn) {
    throw new Error(
      'Cookies were injected but X still shows logged-out.\n' +
      'Your session has likely expired — re-export from Cookie-Editor and try again.'
    );
  }

  console.log('  → Authenticated');
  await screenshot(page, '01-x-home');

  // Open compose
  console.log('  → Opening compose box…');
  try {
    await page.waitForSelector(SEL.composeTrigger, { visible: true, timeout: 8_000 });
    await page.click(SEL.composeTrigger);
  } catch {
    console.log('  Sidebar button unavailable — trying feed compose…');
    await page.waitForSelector(SEL.composeFallback, { visible: true, timeout: 10_000 });
    await page.click(SEL.composeFallback);
  }
  await page.waitForSelector(SEL.tweetTextarea, { visible: true, timeout: 15_000 });
  await randomDelay();
  await screenshot(page, '02-x-compose-open');

  // Type
  console.log('  → Typing tweet…');
  await page.focus(SEL.tweetTextarea);
  await page.keyboard.type(text, { delay: Math.floor(Math.random() * 55) + 35 });
  await randomDelay(800, 1500);

  // Attach image
  console.log('  → Attaching image…');

  const absImagePath = resolve(imagePath);
  const { existsSync } = await import('fs');
  if (!existsSync(absImagePath)) {
    throw new Error(`Image file not found: ${absImagePath}\nCheck POST_IMAGE_PATH in your .env`);
  }

  // Click the "Add photos or video" button to activate X's upload state
  const mediaBtn = await page.$(SEL.mediaButton);
  if (!mediaBtn) throw new Error('"Add photos or video" button not found in compose toolbar');
  await mediaBtn.click();
  await settle(400);

  // Upload via Puppeteer CDP
  const fileInput = await page.$(SEL.fileInput);
  if (!fileInput) throw new Error('fileInput not found after clicking media button');
  await fileInput.uploadFile(absImagePath);

  // Manually dispatch React-compatible change/input events
  await page.evaluate((sel) => {
    const input = document.querySelector(sel);
    if (!input) return;
    input.dispatchEvent(new Event('input',  { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }, SEL.fileInput);

  // Wait for the upload preview to appear
  const previewAppeared = await page.waitForFunction((selectors) => {
    return selectors.some((s) => document.querySelector(s));
  }, { timeout: 30_000 }, SEL.uploadPreview).then(() => true).catch(() => false);

  if (!previewAppeared) {
    console.warn('  Upload preview not detected — continuing anyway (file may still be attached)');
  }

  await randomDelay(1000, 2000);
  await screenshot(page, '03-x-image-attached');
  console.log('  Image upload attempted');

  // Post — single click only, no retry
  console.log('  → Posting tweet…');
  await page.waitForSelector(SEL.tweetSubmitButton, { visible: true, timeout: 10_000 });
  await page.click(SEL.tweetSubmitButton);

  // After clicking Post, X closes the modal and returns to the home feed
  await settle(6000);
  await screenshot(page, '04-x-posted');
  console.log('  Tweet submitted');

  // Verify
  console.log('  → Verifying tweet went live…');
  await page.waitForSelector(SEL.profileLink, { visible: true, timeout: 10_000 });
  await page.click(SEL.profileLink);
  await page.waitForSelector(SEL.firstTweet, { visible: true, timeout: 25_000 });
  await randomDelay(1000, 2000);
  await screenshot(page, '05-x-verified');

  const postUrl = await page.evaluate((firstTweetSel, permalinkSel) => {
    const a = document.querySelector(`${firstTweetSel} ${permalinkSel}`);
    return a ? `https://x.com${a.getAttribute('href')}` : null;
  }, SEL.firstTweet, SEL.permalinkSuffix);

  console.log(`  Verified! Tweet URL: ${postUrl ?? '(see screenshot)'}`);
  return { success: true, postUrl };
}