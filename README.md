# Carfolio

A private, ad-free vehicle maintenance tracker. Log oil changes, tire rotations,
and everything else — get reminders, add them to your calendar, done.

No accounts. No ads. No tracking. Your data lives only in your browser.

## What it does

- Track multiple vehicles (nickname, year/make/model, current mileage)
- Log service history: type, date, mileage, cost, notes
- A quick two-question estimate (primary commuter? how often driven?) converts
  mileage-based intervals (like "every 5,000 miles") into an actual estimated
  date, so you don't need to track exact mileage day to day
- "Add to calendar" turns any reminder into a real event (with a built-in alert)
  in your phone's native calendar app — so reminders keep working forever,
  even if you never open Carfolio again
- Manual backup/restore to a JSON file, so clearing your browser or switching
  devices doesn't mean losing your history

## Deploying to GitHub Pages

Deployment is automatic via `.github/workflows/deploy.yml` — every push to
`main` builds the site and publishes it, stamping a fresh cache version into
the service worker each time (so the "update available" banner always works,
with no manual step).

One-time setup:

1. Create a new GitHub repository (e.g. `carfolio`) and push everything in
   this folder to it.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to **"GitHub Actions"**
   (not "Deploy from a branch").
4. Push to `main` (or re-run the workflow from the **Actions** tab). GitHub
   gives you a URL like `https://yourusername.github.io/carfolio/` — share
   that link with family. Everyone who opens it gets their own local copy of
   the app; nobody's data is shared with anyone else unless they explicitly
   export/send a backup file.

Only `index.html`, `manifest.json`, `css/`, `js/`, `icons/`, and
`service-worker.js` get published — `README.md`, `PROJECT_NOTES.md`, and
`.github/` stay out of the live site.

No build step beyond that one version-stamping line, no `npm install`, no
dependencies to go stale — it's plain HTML/CSS/JS that will keep working
exactly as long as browsers support the standard web platform, which is to
say: a very long time.

## Project structure

```
index.html          Page shell, loads styles and app.js
css/styles.css       All visual design — colors, type, layout, the gauge, modals
js/store.js          Data layer (localStorage). See the comment at the top —
                      this is the seam where an optional backend would plug in.
js/reminders.js      Service type defaults + mileage-to-date estimation logic
js/gauge.js           Renders the arc gauge (the app's signature visual element)
js/ics.js             Builds and downloads .ics calendar files for reminders
js/app.js             Routing, rendering, and all event wiring
```

## Adding a backend later (optional)

The app is fully functional with zero backend. If you ever want optional
cloud backup (so a family member can restore their history on a new device
without hunting for a backup file), the recommended approach discussed
during design was:

- **Cloudflare Workers + KV** (free tier), not GitHub Actions — Cloudflare's
  Cron Triggers don't get disabled after a period of repo inactivity, unlike
  GitHub Actions scheduled workflows (which auto-disable after 60 days of
  inactivity). That matters for anything meant to keep working if the project
  goes untouched for a while.
- No accounts — a random backup code (like `carfolio-8f3k-2p9x`) maps to a
  small JSON blob in KV. Entering the code on any device pulls the data back.
- Keep it strictly additive: the app should never wait on or require the
  backend to function. `js/store.js` documents exactly where this would hook in.

## Browser support note

Uses standard ES modules, `localStorage`, and the Blob/File APIs — supported
by all modern browsers (Chrome, Safari, Firefox, Edge) with no polyfills.
