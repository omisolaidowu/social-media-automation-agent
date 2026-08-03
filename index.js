/**
 * index.js — Main entry point for the TestMu AI Social Poster Agent.
 *
 * Usage:
 *   node index.js --platform=linkedin
 *   node index.js --platform=x
 *   node index.js --platform=both
 *
 * Requires a .env file — copy .env.example and fill in your credentials.
 */

import 'dotenv/config';
import { Browser } from '@testmuai/browser-cloud';
import { postToLinkedIn } from './src/linkedin.js';
import { postToX } from './src/x-twitter.js';

// ── Parse CLI flag ────────────────────────────────────────────────────────────
const platformArg = process.argv.find(a => a.startsWith('--platform='));
const platform    = platformArg ? platformArg.split('=')[1] : 'linkedin';

// ── Post content (from .env or hard-coded for a quick test) ──────────────────
const POST_CONTENT = {
  text: process.env.POST_TEXT
    ?? 'Just shipped a browser automation agent using TestMu AI Browser Cloud + Puppeteer 🚀\n\n#automation #ai #devtools',
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
if (platform === 'linkedin' || platform === 'both')
  assertEnv('LINKEDIN_EMAIL', 'LINKEDIN_PASSWORD');
if (platform === 'x' || platform === 'both')
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
  //    profileId persists login state — after the first run you won't need
  //    to log in again unless the session cookie expires.
  const session = await client.sessions.create({
    adapter: 'puppeteer',
    stealthConfig: {
      humanizeInteractions: true,   // random delays on click / type
      randomizeUserAgent:   true,   // rotate realistic UA strings
      randomizeViewport:    true,   // ±20px viewport jitter
    },
    profileId: `social-poster-${platform}`,  // persists cookies per platform
    timeout:   600_000,                       // 10-minute session max
    lambdatestOptions: {
      build: 'Social Poster Agent',
      name:  `${platform} Post — ${new Date().toISOString()}`,
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

  const results = {};

  try {
    // 4. Run the platform-specific agent(s)
    if (platform === 'linkedin' || platform === 'both') {
      results.linkedin = await postToLinkedIn(page, POST_CONTENT);
    }

    if (platform === 'x' || platform === 'both') {
      // For "both", navigate back to a neutral page before switching platforms
      if (platform === 'both') await page.goto('about:blank');
      results.x = await postToX(page, POST_CONTENT);
    }

    // 5. Report results
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🎉  Run complete — results:');
    for (const [plt, res] of Object.entries(results)) {
      const icon = res.success ? '✅' : '❌';
      console.log(`  ${icon}  ${plt.padEnd(10)} ${res.postUrl ?? 'no URL captured'}`);
    }
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
  console.error('\n❌  Fatal error:', err.message);
  process.exit(1);
});
