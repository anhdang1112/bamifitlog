# FitLog

Single-user workout planner/tracker PWA. No build step, no dependencies. Data stays in the phone's `localStorage` (use Settings → Export JSON for backups).

## Run locally
```
python -m http.server 8080
```
Open http://localhost:8080 in Chrome.

## Install on Android
Chrome only offers "Install app" over **HTTPS** (localhost is the only exception), so host the folder on any static host, e.g. GitHub Pages, Netlify or Cloudflare Pages. Then open the URL in Chrome on the phone → ⋮ → **Install app / Add to Home screen**.

To test on a USB-connected phone without hosting: enable USB debugging, run `adb reverse tcp:8080 tcp:8080`, and open http://localhost:8080 on the phone.

## Updating
After changing any file, bump `CACHE` in `sw.js` (e.g. `fitlog-v2`) so installed copies refresh.

## Regenerate icons
```
python tools/make_icons.py
```
