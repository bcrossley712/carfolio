Read this first if you're picking this project up in a new chat. It's context for you (the next Claude), not end-user documentation — that lives in the README files.

Usage-efficiency expectations for Claude
Assume the code in this conversation is current unless I say otherwise. Don't re-pull the full repo/tarball if it's already been fetched this session — re-fetch only when I tell you something changed outside our conversation, or at the very start of a new session.
Pull or view only what the task touches. Grep for the specific function/selector/section first, then view a targeted range — don't read whole files (or the whole repo) to make a small, well-scoped change.
Match verification effort to the change. Only run a test suite (or extend it) when a change touches actual logic. Skip it for CSS, copy, layout, or other changes it can't meaningfully verify.
Don't build throwaway tooling (scratch repro files, sandboxes, etc.) to double-check something reasoning from the code and docs can already answer — only build a repro when there's a real, otherwise unresolvable uncertainty.
Keep the project notes file itself lean. Record current state and the why behind decisions, not a session-by-session diary of how each bug was found and fixed — that history belongs in git commits, not here. If this file starts creeping back up in size, trim it rather than let it compound.
Deliver only the files that actually changed, not a full re-zip of the project.
Check in before packaging/shipping — confirm the plan or show the diff before finalizing files, even for a single-file change, unless I've clearly told you to just go ahead.
Batch related changes into one pass rather than iterating file-by-file across separate turns when the scope is already clear.

Working agreements with this user
Confirm before starting new builds/changes — don't just proceed on a big feature without checking scope/direction first, especially when there's real ambiguity in how to design something.
Confirm before packaging/sending files — and when sending, only include the files actually touched by the change, not the whole repo. The user uses their own "download all" zip option when they want everything.
When packaging, include only files changed since the last actual delivery to the user — i.e. since files were last handed over via download, not since the last git push (those are two different events; a file can be delivered for local testing well before it's pushed). Don't re-include a file that was already delivered and hasn't changed since. Don't drop a file that changed but was never actually delivered (e.g. packaging got deferred a few turns back) — it's still owed. Tracking what's been delivered vs. pushed is the user's own responsibility, not something to log here.
Prefer vanilla JS with separate CSS/JS/HTML files over a framework, for projects this size.
PWAs: include an "update available, click to refresh" prompt (custom-styled, not a native browser popup).
Replace default browser popups (alert/confirm) with custom in-app dialogs, styled to match the app.

---

## What Carfolio is

A private, ad-free vehicle maintenance tracker. Log oil changes, tire rotations,
etc.; get reminders. No accounts, no ads, no tracking, no backend required.
Hosted as a static site (GitHub Pages), shared with family as a link — each
person's data stays local to their own device/browser.

## Architecture

- Plain HTML/CSS/vanilla JS (ES modules), no build step, no framework, no dependencies.
- `js/store.js` — data layer, currently `localStorage`-backed. Has a documented
  seam for adding an optional backend later (see comment at top of that file).
- `js/reminders.js` — converts mileage-based service intervals into estimated
  calendar dates, using a 2-question estimate (primary commuter? driving
  frequency?) taken when a vehicle is added. This is what makes calendar
  export and simple due/overdue badges possible without real mileage tracking.
- `js/gauge.js` — the 270° arc gauge, the app's one signature visual element,
  reused at both dashboard and detail level.
- `js/ics.js` — generates `.ics` calendar files. This is the durable reminder
  mechanism: once added to a phone's calendar, it keeps firing forever, with
  no dependency on this app, a backend, or notification permissions staying
  granted.
- `js/dialogs.js` — custom confirm/alert modals (Promise-based), replacing
  native `confirm()`/`alert()`.
- `js/pwa.js` + `service-worker.js` — installable PWA with offline support and
  a custom "update available" banner (not the browser's native update flow).

## Key decisions and why

- **No push notifications.** Real push (arriving even when the app/browser is
  closed) requires a server to trigger the push at the right time — there's
  no way around that with a static site. Decided against adding a backend
  just for this; `.ics` calendar export solves "remind me later" without one.
- **No accounts, no shared/synced data.** Each family member's data lives only
  in their own browser. Deliberate simplicity tradeoff — see manual JSON
  backup/restore in the Backup modal as the mitigation for browser data loss.
- **Optional backend, if ever added:** Cloudflare Workers + KV, not GitHub
  Actions — Cloudflare Cron Triggers don't get disabled after repo
  inactivity, unlike GitHub Actions scheduled workflows (auto-disabled after
  60 days idle). Should stay strictly additive: the app must never block on
  or require it to function.
- **Service worker cache versioning is automatic**, via
  `.github/workflows/deploy.yml`. It stamps `service-worker.js`'s
  `__CACHE_VERSION__` placeholder with the short commit SHA on every push to
  `main` before deploying, so the file's bytes always change on deploy and
  browsers reliably detect updates. GitHub Pages must be set to "Source:
  GitHub Actions" (not "Deploy from a branch") for this to run — one-time
  repo settings change, documented in README. Local testing outside the
  workflow won't auto-bump the version (see comment in `service-worker.js`).

## Current state

Core app built and locally sanity-checked (JS syntax-checked with `node --check`,
reminder date-math logic verified with a throwaway test script, not committed).
Not yet deployed to GitHub Pages by the user. PWA layer (manifest, service
worker, install icons, update banner) and custom dialogs added but not yet
tested in an actual browser/device by the user.

Icons were generated programmatically (Pillow) from the in-app brand mark
(circle + tick + amber needle on slate background) rather than hand-designed —
fine for now, easy to swap later if a real logo gets made.
