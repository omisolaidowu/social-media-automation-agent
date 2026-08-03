# Social Media Posting Agent — TestMu AI Browser Cloud + Puppeteer

A deterministic browser automation tool that logs into X, composes a post with text and an image, publishes it, and verifies it went live — all running inside a TestMu AI stealth cloud browser session.

> This is a **browser automation tool**, not an AI agent. It executes a fixed sequence reliably. To make it agentic, expose `post_to_x` as an MCP tool and connect it to a model like Claude — the model reasons and decides what to post; this script handles the browser execution.

**Full walkthrough:** [testmuai.com/blog/...](#)

---

## Prerequisites

- Node.js 18+
- A TestMu AI account — [testmuai.com/register](https://www.testmuai.com/register)
- `LT_USERNAME` and `LT_ACCESS_KEY` from your [Credentials page](https://accounts.lambdatest.com/security)
- An X account with session cookies exported via Cookie-Editor (see below)

---

## Install

```bash
npm install @testmuai/browser-cloud dotenv
```

> `npm install -g @testmuai/browser-cloud` installs the CLI for ad-hoc tasks. The local package above is the SDK used inside scripts.

---

## Configure

```bash
cp .env.example .env
```

```env
LT_USERNAME=your_testmu_username
LT_ACCESS_KEY=your_testmu_access_key

X_USERNAME=your_x_handle
X_PASSWORD=your_x_password
X_EMAIL=you@example.com

POST_TEXT="Just shipped something with TestMu AI Browser Cloud + Puppeteer 🚀"
POST_IMAGE_PATH=./assets/post-image.png
```

---

## Export your X cookies (required)

X blocks login attempts from cloud datacenter IPs. Cookie injection bypasses this — auth cookies are IP-independent once issued.

1. Log into x.com in your real Chrome browser
2. Install [Cookie-Editor](https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm)
3. Click the extension on any x.com page → **Export → Export as JSON**
4. Save as `cookies/x-cookies.json`

The three cookies that matter: `auth_token`, `ct0`, `twid`. The `cookies/` folder is in `.gitignore`.

---

## Run

```bash
node index.js --platform=x
```

Expected output:

```
🤖 TestMu AI Social Poster Agent
   Platform : x
   Post text: Just shipped something with TestMu AI Browser Cloud + Puppet…
   Image    : ./assets/post-image.png

🔗 Live session viewer: https://automation.lambdatest.com/logs/...

🐦 X Agent starting…
  → Injecting cookies from ./cookies/x-cookies.json…
  ✅ Injected 9 cookies (key: auth_token, ct0, twid)
  → Navigating to x.com/home…
  → Authenticated ✅
  → Opening compose box…
  → Typing tweet…
  → Attaching image…
  ✅ Image upload attempted
  → Posting tweet…
  ✅ Tweet submitted
  → Verifying tweet went live…
  ✅ Verified! Tweet URL: https://x.com/username/status/...

🎉  Run complete:
  ✅  x   https://x.com/username/status/...

🏁  Session released. Done.
```

---

## How the TestMu AI connection works

The only difference from local Puppeteer is two lines:

```js
// Local Puppeteer
const browser = await puppeteer.launch({ headless: 'new' });

// TestMu AI Browser Cloud
import { Browser } from '@testmuai/browser-cloud';

const client  = new Browser();
const session = await client.sessions.create({
  adapter: 'puppeteer',
  stealthConfig: {
    humanizeInteractions: true,
    randomizeUserAgent:   true,
    randomizeViewport:    true,
  },
  profileId: 'social-poster-x',
  lambdatestOptions: {
    'LT:Options': {
      username:  process.env.LT_USERNAME,
      accessKey: process.env.LT_ACCESS_KEY,
    },
  },
});

const browser = await client.puppeteer.connect(session);
// Everything after this is standard Puppeteer
```

The SDK handles stealth fingerprint patching, humanized interaction delays, and cross-session profile persistence automatically.

---

## Project structure

```
testmu-social-poster/
├── index.js                 ← session creation, orchestration, teardown
├── src/
│   ├── x-twitter.js         ← full X post flow
│   ├── linkedin.js          ← LinkedIn post flow (untested)
│   └── utils.js             ← screenshot(), randomDelay(), retry()
├── scripts/
│   └── load-cookies.js      ← cookie injection utility
├── cookies/
│   └── x-cookies.json       ← your exported session (git-ignored)
├── assets/
│   └── post-image.png       ← image to attach (add this yourself)
├── screenshots/             ← timestamped step screenshots
├── .env
├── .env.example
└── package.json
```

---

## Limitations

- **Cookie expiry.** X session cookies expire in ~30 days. Re-export from Cookie-Editor when they do.
- **X only (tested).** LinkedIn support is in `src/linkedin.js` but was not verified end-to-end.
- **DOM drift.** X updates its frontend frequently. Selectors in `x-twitter.js` may need updating after major X redesigns.
- **No CAPTCHA handling.** A CAPTCHA challenge stops the run. Established accounts with active cookies do not typically see them.
- **No scheduling.** The tool posts once per run. Wrap in a cron job or queue worker for recurring posts.

---

## What you can build from here

- **Scheduled posting** — wrap in a cron job or BullMQ worker
- **AI-generated content** — pipe post text from a language model before the run
- **MCP tool** — expose `post_to_x` as an MCP server so a model like Claude can call it conversationally, making the whole system genuinely agentic
- **Multi-account rotation** — vary `profileId` across runs to manage multiple accounts
- **Screenshot reporting** — upload step screenshots to S3 or attach to a Slack notification

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Injected 9 cookies` but still logged out | Cookies expired | Re-export from Cookie-Editor |
| `"Add photos or video" button not found` | Compose modal not open | Check `02-x-compose-open-*.png` screenshot |
| Post submitted but no verified URL | Verification selector failed | Check `05-x-verified-*.png` screenshot |
| Session viewer URL 404 | Invalid credentials | Check `LT_USERNAME` and `LT_ACCESS_KEY` |

---

## References

- [TestMu AI Browser Cloud docs](https://testmuai.com/support/docs/what-is-browser-cloud/)
- [browser-cloud-cookbook](https://github.com/SparshKesari/browser-cloud-cookbook) — official starter patterns
- [Cookie-Editor extension](https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm)