# Farkle: Dice Duel 🎲

A single-page Farkle game (with an embedded "Dice Duel" mini-game) packaged as an
installable Progressive Web App (PWA). Play solo against AI opponents with real
3D-rolled dice, or pass-and-play locally.

## What's in this repo

```
.
├── index.html              ← entry point (lean — logic lives in /js)
├── manifest.webmanifest    ← PWA manifest (name, icons, colors)
├── service-worker.js       ← offline caching
├── css/
│   └── styles.css          ← all game styles
├── js/
│   ├── app-part1.js        ← audio engine (procedural music)
│   ├── app-part2.js        ← dice-roll sound synthesis
│   ├── app-part3.js        ← main game logic, AI opponents, UI (largest file)
│   └── app-part4.js        ← trailing init/wiring
├── data/
│   └── wdata.b64           ← precomputed physics lookup table for dice rolls
│                              (base64 Float32Array, fetched at runtime)
├── assets/
│   └── images/              ← every avatar portrait + the logo/watermark SVGs,
│                              extracted from the original single-file build
└── icons/
    ├── icon-16.png / icon-32.png / favicon.ico   ← browser tab icon
    ├── icon-180.png                               ← iOS home-screen icon
    ├── icon-192.png / icon-512.png                ← Android/PWA icons
    └── icon-maskable-512.png                      ← Android adaptive icon (safe-zone padded)

```

> **Note on the icon:** the current icon set is generated from a placeholder
> Farkle App Store icon you supplied — it isn't the final "Dice Duel" artwork,
> but it's a fine stand-in until you swap in real branding. To replace it,
> just overwrite the files in `icons/` (keep the same filenames/sizes) and,
> if you change the image's dominant color, update `theme_color` /
> `background_color` in `manifest.webmanifest` and `<meta name="theme-color">`
> in `index.html` to match.

## How this differs from the old single-file build

The game used to live in one ~3 MB HTML file with every image and the dice
physics table embedded as base64 text. That's fine for emailing a file around,
but it's heavy to host on GitHub Pages and git doesn't diff binary-as-text well.
This version keeps `index.html` at ~30 KB and moves everything else — CSS, JS,
~180 avatar images, the two SVG logo/watermark graphics, and the dice physics
table — into their own files that the browser loads normally and the service
worker caches for offline play.

Nothing about the game itself changed — same mechanics, same AI, same art,
just reorganized.

## Running it locally

Because the page fetches its own JS/CSS/data files, you can't just double-click
`index.html` — browsers block `fetch()` on `file://` URLs. Serve it over HTTP
instead. From this folder, pick one:

```bash
# Python 3 (built into most systems)
python3 -m http.server 8000

# Node (if you have it)
npx serve .
```

Then open **http://localhost:8000** in your browser.

## Deploying to GitHub Pages

1. Create a new repository on GitHub (or use an existing one).
2. Upload the **contents of this folder** to the repo root — not the folder
   itself. `index.html` should sit at the repo root, e.g.
   `https://github.com/you/dice-duel/index.html`, not
   `.../dice-duel/dice-duel-pwa/index.html`.
   - Easiest way: unzip this archive, then drag all the files/folders into the
     GitHub web UI's "upload files" box, or `git add .` from inside the
     unzipped folder if you're using the command line.
3. In the repo settings, go to **Settings → Pages**, set **Source** to
   "Deploy from a branch", pick your branch (usually `main`) and the `/ (root)`
   folder, then save.
4. GitHub will give you a URL like `https://you.github.io/dice-duel/` —
   that's your live, installable PWA.

Because `index.html` uses relative paths (`css/styles.css`, `js/app-part1.js`,
etc.) rather than absolute ones, it works correctly whether it's served from
a repo root (`you.github.io/`) or a project path
(`you.github.io/dice-duel/`) — no path edits needed either way.

## Updating the app after deploy

Browsers aggressively cache service workers, so if you edit any of the
cached files (`index.html`, `css/styles.css`, any `js/app-part*.js`, or
`data/wdata.b64`) and want returning players to pick up the change promptly:

1. Open `service-worker.js`.
2. Bump the version string at the top:
   ```js
   const CACHE_VERSION = 'v1';   // change to 'v2', 'v3', etc.
   ```
3. Commit and push. The next time someone opens the page, the browser will
   fetch the new service worker, see the cache name changed, install a fresh
   cache in the background, and swap over automatically.

Images in `assets/images/` and `icons/` are cached the first time they're
requested (runtime caching) rather than precached by name, so adding new
avatar images doesn't require a version bump — only edits to existing,
already-cached files do.

## Testing the "installable" part

- **Desktop Chrome/Edge:** visit the page, look for an install icon (⊕) in the
  address bar, or Menu → "Install Dice Duel…".
- **Android Chrome:** visit the page, you should get an "Add to Home screen"
  banner, or use the menu.
- **iOS Safari:** visit the page, tap Share → "Add to Home Screen". (iOS
  doesn't support the install banner or most manifest fields, but the
  `apple-touch-icon` and `apple-mobile-web-app-*` meta tags in `index.html`
  cover the home-screen icon and status-bar styling.)

Once installed, the service worker lets the game load and play fully offline
after the first visit (dice rolls, sounds, and AI are all client-side; there's
no server/backend at all).

## Browser support notes

- Procedural music/sound uses the Web Audio API; if a browser blocks audio
  until a user gesture (most mobile browsers), the game starts music on the
  first tap/keypress, same as before.
- The dice physics table (`data/wdata.b64`) is fetched asynchronously now
  instead of being read synchronously from an inline `<script>` tag. This is
  functionally identical but means there's a (normally imperceptible) network
  request on first load; the service worker caches it after that.
