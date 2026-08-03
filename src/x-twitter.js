/**
 * x-twitter.js — Logs into X (Twitter), composes a post (text + image),
 * publishes it, then verifies it went live.
 *
 * DOM facts confirmed from live inspection (July 2026):
 * Note that selectors may change: consider adding AI auto-healing
 */

import { resolve } from 'path';
import { screenshot, randomDelay, retry } from './utils.js';
import { hasSavedCookies, injectXCookies } from '../scripts/load-cookies.js';

const COOKIE_PATH = './cookies/x-cookies.json';

const SEL = {
  loggedInProbe:     '[data-testid="SideNav_NewTweet_Button"]',
  composeTrigger:    '[data-testid="SideNav_NewTweet_Button"]',
  composeFallback:   '[data-testid="tweetTextarea_0_label"]',
  tweetTextarea:     'div[data-testid="tweetTextarea_0"]',
  mediaUploadButton: 'input[data-testid="fileInput"]',
  tweetSubmitButton: '[data-testid="tweetButton"]',
  profileLink:       'a[data-testid="AppTabBar_Profile_Link"]',
  firstTweet:        'article[data-testid="tweet"]:first-of-type',
};

const settle = (ms) => new Promise(r => setTimeout(r, ms));

// ── Cookie banner ─────────────────────────────────────────────────────────────

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

// Login helpers

async function waitForLoginForm(page) {
  await page.waitForFunction(() => {
    const hasContinue = [...document.querySelectorAll('p')]
      .some(p => p.textContent.trim() === 'Continue');
    if (!hasContinue) return false;
    const un = document.querySelector('#jf-input-username_or_email');
    const pw = document.querySelector('#jf-input-password');
    return (un && !un.inert) || (pw && !pw.inert);
  }, { timeout: 20_000 });
}

async function detectLoginState(page) {
  return page.evaluate(() => {
    if (document.querySelector('[data-testid="SideNav_NewTweet_Button"]')) return 'done';
    const body = document.body?.innerText ?? '';
    if (/temporarily limited your login/i.test(body)) return 'rate_limited';
    const challenge = document.querySelector('input[data-testid="ocfEnterTextTextInput"]');
    if (challenge && !challenge.inert && challenge.offsetParent) return 'challenge';
    const pw = document.querySelector('#jf-input-password');
    if (pw && !pw.inert && pw.offsetParent) return 'password';
    const un = document.querySelector('#jf-input-username_or_email');
    if (un && !un.inert && un.offsetParent) return 'username';
    return 'unknown';
  });
}

async function typeIntoLoginField(page, fieldId, text) {
  await page.evaluate((id) => {
    const continueP = [...document.querySelectorAll('p')]
      .find(p => p.textContent.trim() === 'Continue');
    let input;
    if (continueP) {
      let ancestor = continueP.parentElement;
      while (ancestor && ancestor !== document.body) {
        input = ancestor.parentElement?.querySelector(`#${id}:not([inert])`);
        if (input) break;
        ancestor = ancestor.parentElement;
      }
    }
    (input || document.getElementById(id))?.focus();
  }, fieldId);
  await settle(150);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.type(`#${fieldId}`, text, { delay: Math.floor(Math.random() * 60) + 40 });
}

async function clickContinueButton(page) {
  await settle(400);

  // Strategy 1: Puppeteer v22+ XPath syntax
  try {
    const btn = await page.$(
      '::-p-xpath(//p[normalize-space(text())="Continue"]/parent::*/parent::*/parent::*)'
    );
    if (btn) {
      const box = await btn.boundingBox();
      if (box?.width > 0 && box?.height > 0) {
        await btn.click();
        console.log('  → Clicked Continue (XPath)');
        return;
      }
    }
  } catch (e) {
    console.warn(`  ⚠️  XPath strategy failed: ${e.message}`);
  }

  // Strategy 2: DOM walk — 3 levels up from <p>Continue</p>
  const clicked = await page.evaluate(() => {
    const p = [...document.querySelectorAll('p')]
      .find(el => el.textContent.trim() === 'Continue');
    if (!p) return false;
    const target = p.parentElement?.parentElement?.parentElement;
    if (target) { target.click(); return true; }
    return false;
  });
  if (clicked) { console.log('  → Clicked Continue (DOM walk)'); return; }

  await screenshot(page, '00-x-no-continue-button');
  throw new Error('Could not find Continue button — see screenshots/00-x-no-continue-button-*.png');
}

async function loginToX(page) {
  console.log(`  ⚠️  No cookie file — falling back to form login.`);
  console.log(`     To skip this, export cookies to: ${COOKIE_PATH}`);

  await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle(1500);
  await dismissCookieBanner(page);

  console.log('  → Waiting for login form…');
  await waitForLoginForm(page);
  await screenshot(page, '00-x-login-ready');

  for (let step = 0; step < 8; step++) {
    const state = await detectLoginState(page);
    console.log(`  → Login step ${step + 1}: ${state}`);
    await screenshot(page, `00-x-login-step${step + 1}-${state}`);

    if (state === 'done') { console.log('  ✅ Logged in'); return; }

    if (state === 'rate_limited') {
      await screenshot(page, '00-x-rate-limited');
      throw new Error(
        `X has temporarily limited login — datacenter IP block, not an account issue.\n` +
        `Export your browser cookies to ${COOKIE_PATH} to bypass this permanently.`
      );
    }

    if (state === 'username') {
      await typeIntoLoginField(page, 'jf-input-username_or_email', process.env.X_USERNAME);
      await randomDelay(400, 800);
      await clickContinueButton(page);
      await waitForLoginForm(page).catch(() => {});
      await settle(1000);
      continue;
    }

    if (state === 'password') {
      await typeIntoLoginField(page, 'jf-input-password', process.env.X_PASSWORD);
      await randomDelay(400, 800);
      await clickContinueButton(page);
      await settle(3500);
      continue;
    }

    if (state === 'challenge') {
      console.log('  → Email challenge — entering email…');
      await page.type('input[data-testid="ocfEnterTextTextInput"]', process.env.X_EMAIL, { delay: 50 });
      await clickContinueButton(page);
      await settle(2500);
      continue;
    }

    const snap = await page.evaluate(() => ({
      inputs: [...document.querySelectorAll('input')].map(e => ({
        id: e.id, name: e.name, inert: e.hasAttribute('inert'), visible: !!e.offsetParent,
      })),
      pTexts: [...document.querySelectorAll('p')].map(p => p.textContent.trim())
        .filter(Boolean).slice(0, 15),
    }));
    console.warn('  ⚠️  Unknown — inputs:', JSON.stringify(snap.inputs));
    console.warn('  ⚠️  <p> texts:', JSON.stringify(snap.pTexts));
    await settle(4000);
  }
  throw new Error('X login did not complete after 8 steps.');
}

export async function postToX(page, { text, imagePath }) {
  console.log('\n🐦 X Agent starting…');

  // Inject cookies BEFORE any navigation so they are present on first request
  if (hasSavedCookies()) {
    console.log(`  → Injecting cookies from ${COOKIE_PATH}…`);
    await injectXCookies(page);
  } else {
    console.log(`  ℹ️  No cookie file at ${COOKIE_PATH} — will use form login`);
  }

  // Navigate once (cookies already set above)
  console.log('  → Navigating to x.com/home…');
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle(1500);
  await dismissCookieBanner(page);

  const loggedIn = await page
    .waitForSelector(SEL.loggedInProbe, { visible: true, timeout: 15_000 })
    .then(() => true).catch(() => false);

  if (!loggedIn) {
    if (hasSavedCookies()) {
      throw new Error(
        'Cookies injected but X still shows logged-out.\n' +
        'Session has likely expired — re-export from Cookie-Editor and try again.'
      );
    }
    await loginToX(page);
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(SEL.loggedInProbe, { visible: true, timeout: 30_000 });
  } else {
    console.log('  → Authenticated ✅');
  }

  await screenshot(page, '01-x-home');

  // Open compose
  console.log('  → Opening compose box…');
  try {
    await page.waitForSelector(SEL.composeTrigger, { visible: true, timeout: 8_000 });
    await page.click(SEL.composeTrigger);
  } catch {
    console.log('  ℹ️  Sidebar button unavailable — trying feed compose…');
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

  // Verify the file exists before attempting upload
  const absImagePath = resolve(imagePath);
  const { existsSync } = await import('fs');
  if (!existsSync(absImagePath)) {
    throw new Error(`Image file not found: ${absImagePath}\nCheck POST_IMAGE_PATH in your .env`);
  }

  // Click the "Add photos or video" button to activate X's upload state.
  const mediaBtn = await page.$('button[aria-label="Add photos or video"]');
  if (!mediaBtn) throw new Error('"Add photos or video" button not found in compose toolbar');
  await mediaBtn.click();
  await settle(400);

  // Upload via Puppeteer CDP (works in cloud — no OS dialog needed).
  const fileInput = await page.$('input[data-testid="fileInput"]');
  if (!fileInput) throw new Error('fileInput not found after clicking media button');
  await fileInput.uploadFile(absImagePath);

  // Manually dispatch React-compatible change/input events.
  await page.evaluate(() => {
    const input = document.querySelector('input[data-testid="fileInput"]');
    if (!input) return;
    input.dispatchEvent(new Event('input',  { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  });

  // Wait for the upload preview to appear.
  const previewAppeared = await page.waitForFunction(() => {
    return !!(
      document.querySelector('[data-testid="attachments"]') ||
      document.querySelector('[data-testid="tweetPhoto"]') ||
      document.querySelector('img[src^="blob:"]') ||
      document.querySelector('[data-testid="media-viewer-clip-container"]')
    );
  }, { timeout: 30_000 }).then(() => true).catch(() => false);

  if (!previewAppeared) {
    console.warn('  ⚠️  Upload preview not detected — continuing anyway (file may still be attached)');
  }

  await randomDelay(1000, 2000);
  await screenshot(page, '03-x-image-attached');
  console.log('  ✅ Image upload attempted');

  // Post — single click only, no retry.
  console.log('  → Posting tweet…');
  await page.waitForSelector(SEL.tweetSubmitButton, { visible: true, timeout: 10_000 });
  await page.click(SEL.tweetSubmitButton);

  // After clicking Post, X closes the modal and returns to the home feed.
  await settle(6000);
  await screenshot(page, '04-x-posted');
  console.log('  ✅ Tweet submitted');

  // Verify
  console.log('  → Verifying tweet went live…');
  await page.waitForSelector(SEL.profileLink, { visible: true, timeout: 10_000 });
  await page.click(SEL.profileLink);
  await page.waitForSelector(SEL.firstTweet, { visible: true, timeout: 25_000 });
  await randomDelay(1000, 2000);
  await screenshot(page, '05-x-verified');

  const postUrl = await page.evaluate(() => {
    const a = document.querySelector(
      'article[data-testid="tweet"]:first-of-type a[href*="/status/"]'
    );
    return a ? `https://x.com${a.getAttribute('href')}` : null;
  });

  console.log(`  ✅ Verified! Tweet URL: ${postUrl ?? '(see screenshot)'}`);
  return { success: true, postUrl };
}