/**
 * index.js — Main entry point for the TestMu AI Social Poster Agent.
 *
 * Usage:
 *   node index.js --platform=x
 *
 * Requires a .env file — copy .env.example and fill in your credentials.
 */

import 'dotenv/config';
import { Browser } from '@testmuai/browser-cloud';
import { postToX } from './src/x-twitter.js';

// ── Parse CLI flag ────────────────────────────────────────────────────────────
const platformArg = process.argv.find(a => a.startsWith('--platform='));
const platform    = platformArg ? platformArg.split('=')[1] : 'x';

if (platform !== 'x') {
  console.error(`❌  Unsupported platform: "${platform}". This build only supports --platform=x`);
  process.exit(1);
}

// ── Post content (from .env or hard-coded for a quick test) ──────────────────
const POST_CONTENT = {
  text: process.env.POST_TEXT
    ?? 'Just shipped a browser automation tool using TestMu AI Browser Cloud + Puppeteer 🚀\n\n#automation #devtools',
  imagePath: process.env.POST_IMAGE_PATH ?? './assets/post-image.png',
};

// ── Validate required env vars ────────────────────────────────────────────────
function assertEnv(...vars) {
  const missing = vars.filter(v => !process.env[v]);
  if (missing.length) {
    console.error(`❌  Missing required environment variables: ${missing.join(', ')}`);
    console.error('    Copy .env.example → .env and fill in your credentials.');
    process.exit(1);
  }
}

assertEnv('LT_USERNAME', 'LT_ACCESS_KEY');
assertEnv('X_USERNAME', 'X_PASSWORD', 'X_EMAIL');

// ── Main orchestration ────────────────────────────────────────────────────────
async function main() {
  console.log('🤖 TestMu AI Social Poster Agent');
  console.log(`   Platform : ${platform}`);
  console.log(`   Post text: ${POST_CONTENT.text.slice(0, 60)}…`);
  console.log(`   Image    : ${POST_CONTENT.imagePath}\n`);

  // 1. Initialise the TestMu AI Browser SDK client
  const client = new Browser();

  // 2. Create a cloud session with stealth enabled
  //    profileId persists cookies between runs — cookies are also injected
  //    directly from cookies/x-cookies.json to bypass login entirely.
  const session = await client.sessions.create({
    adapter: 'puppeteer',
    stealthConfig: {
      humanizeInteractions: true,   // random delays on click / type
      randomizeUserAgent:   true,   // rotate realistic UA strings
      randomizeViewport:    true,   // ±20px viewport jitter
    },
    profileId: 'social-poster-x',
    timeout:   600_000,             // 10-minute session max
    lambdatestOptions: {
      build: 'Social Poster Agent',
      name:  `X Post — ${new Date().toISOString()}`,
      'LT:Options': {
        username:  process.env.LT_USERNAME,
        accessKey: process.env.LT_ACCESS_KEY,
      },
    },
  });

  console.log(`🔗 Live session viewer: ${session.sessionViewerUrl}`);
  console.log('   (Open this URL in your browser to watch the agent in real time)\n');

  // 3. Connect — returns a standard Puppeteer Browser object
  const browser = await client.puppeteer.connect(session);
  const page    = (await browser.pages())[0];
  await page.setViewport({ width: 1280, height: 800 });

  let result;

  try {
    // 4. Run the X post flow
    result = await postToX(page, POST_CONTENT);

    // 5. Report result
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🎉  Run complete:');
    const icon = result.success ? '✅' : '❌';
    console.log(`  ${icon}  x   ${result.postUrl ?? 'no URL captured'}`);
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('📸  All step screenshots saved to ./screenshots/');

  } finally {
    // 6. Always close browser and release the cloud session
    await browser.close();
    await client.sessions.release(session.id);
    console.log('🏁  Session released. Done.');
  }
}

main().catch(err => {
  console.error('\n Fatal error:', err.message);
  process.exit(1);
});