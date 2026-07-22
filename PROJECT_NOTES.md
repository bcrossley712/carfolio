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
Deliver changed files individually, not zipped together.

---

## What Carfolio is

A private, ad-free vehicle maintenance tracker. Log oil changes, tire rotations,
etc.; get reminders. No accounts, no ads, no tracking, no backend required.
Hosted as a static site (GitHub Pages), shared with family as a link — each
person's data stays local to their own device/browser.

## Architecture

- Plain HTML/CSS/vanilla JS (ES modules), no build step, no framework, no dependencies.
- `js/app.js` — entry point, rendering, and hash router. Routes are
  `#/vehicle/:id/:tab?` and `#/all/:tab?` (tab one of `home` / `services` /
  `quickchecks` / `history` / `budget`, defaults to `home` — the tab id is
  `services` even though the underlying data functions are still named
  `getVehicleChecklist()` etc., since that's describing the data model, not
  the nav label). `#/` is never rendered directly — it's a pure redirect to
  wherever you last were (`localStorage` key `carfolio.lastScope`, updated
  on every navigation into a vehicle or All Vehicles): that vehicle if it
  still exists, else "Your Vehicles" if 2+ vehicles exist, else the sole
  vehicle, else the empty state. There is no dashboard/vehicle-list screen —
  the header switcher (vehicle name + chevron, always present, including
  with just one vehicle) replaced it, including being the only place to add
  a vehicle. "All Vehicles" is a first-class selectable context, not a
  separate section — same five tabs, aggregated across every vehicle.
- The persistent header (`#app-header` shell in `index.html`, rendered by
  `renderHeader()`) shows vehicle info instead of the app's own name/logo —
  one sticky bar now, not two (the old brand bar and per-scope title bar
  were merged). Shows "Add vehicle" when there are no vehicles yet.
  Backup/restore moved into the switcher menu, since there's no page for a
  persistent footer to live on anymore.
- `js/store.js` — data layer, currently `localStorage`-backed. Has a documented
  seam for adding an optional backend later (see comment at top of that file).
  Also owns Quick Checks state (`vehicle.quickChecks`, keyed by check id) and
  `untrackService()` for removing a single checklist item.
- `js/reminders.js` — converts mileage-based service intervals into estimated
  calendar dates, using a 2-question estimate (primary commuter? driving
  frequency?) taken when a vehicle is added. Also defines `CATEGORY_SCHEDULES`
  — recommended maintenance checklists that vary by powertrain (gasoline /
  diesel / hybrid / electric / unknown), e.g. electric vehicles skip oil
  changes and get an EV battery health check instead. `getVehicleChecklist()`
  returns every recommended item for a vehicle, including ones never logged
  yet (shown as "Not logged yet"), which is what drives the "where do I
  stand on this vehicle" checklist view — not just overdue items.
  `getCostHistory()` / `getAnnualBudgetEstimate()` power the Budget tab (see
  Key decisions below for the amortization approach).
- `js/vehicle-lookup.js` — optional VIN decoding via NHTSA's free vPIC API
  (no key required). Auto-fills year/make/model and detects powertrain
  category when a VIN is provided; purely additive, setup works fine without
  one via the manual "vehicle type" question.
- `js/gauge.js` — the 270° arc gauge, the app's one signature visual element,
  reused at both dashboard and detail level.
- `js/ics.js` — generates `.ics` calendar files. This is the durable reminder
  mechanism: once added to a phone's calendar, it keeps firing forever, with
  no dependency on this app, a backend, or notification permissions staying
  granted.
- `js/quickchecks.js` — the self-check catalog (coolant, oil level, tire
  pressure/tread, wipers, lights, dash warnings, battery terminals, etc.).
  Different in kind from `reminders.js`: no mileage math, just elapsed days
  since last checked, with a grace window (green <30 days, amber 30-60,
  rust 60+/never checked). A vehicle's Quick Checks section status is the
  *worst* item, not an average, so one neglected item can't hide behind the
  others being current.
- `js/dialogs.js` — custom confirm/alert modals (Promise-based), replacing
  native `confirm()`/`alert()`. Also `remindMeDialog()` (presets + custom
  date), shared by overdue-maintenance "Remind me again" and the Quick
  Checks walkaround reminder — both export a `.ics` for the chosen date via
  `ics.js`, same as the primary reminders.
- `js/banner.js` — shared helper for small dismissible banners stacked at
  the bottom of the screen, used by both `pwa.js` and `install-prompt.js`.
- `js/pwa.js` + `service-worker.js` — installable PWA with offline support and
  a custom "update available" banner (not the browser's native update flow).
- `js/install-prompt.js` — custom "Install Carfolio" banner. Captures
  Chrome/Edge/Android's `beforeinstallprompt` to show our own styled button;
  shows a manual "tap Share" hint on iOS Safari, which never exposes a
  programmatic install prompt at all. Dismissal is remembered for 14 days.

## Key decisions and why

- **No push notifications.** Real push (arriving even when the app/browser is
  closed) requires a server to trigger the push at the right time — there's
  no way around that with a static site. Decided against adding a backend
  just for this; `.ics` calendar export solves "remind me later" without one.
- **No manufacturer-exact maintenance schedules.** There's no free, durable
  API for that — it lives in PDF owner's manuals, not structured data, and
  scraping manufacturer sites would be exactly the kind of fragile
  dependency this project avoids. Instead: NHTSA's free VIN decoder (stable
  government API) detects powertrain category, and `CATEGORY_SCHEDULES` in
  `reminders.js` gives category-appropriate defaults (gas/diesel/hybrid/EV).
  Honest tradeoff — general guidance, not the owner's exact numbers.
- **Custom services can now recur.** Logging a custom service optionally
  takes a mileage and/or month interval; if either is set, it becomes a
  real tracked checklist item (own dynamic `typeId` like `custom_abc123`,
  added to `recommendedServiceIds`) with the same gauge/due-date/calendar-export
  treatment as any catalog service. Blank interval = one-time, history-only.
- **"Untracked" is a real state, not the same as "never set."**
  `recommendedServiceIds == null` means "use the category defaults";
  `recommendedServiceIds == []` means "explicitly tracking nothing" (e.g.
  after untracking every item). These used to be conflated — an emptied
  list silently fell back to showing everything again — fixed in both
  `getVehicleChecklist()` and the custom-service-adds-to-checklist path in
  `app.js`.
- **Annual budget estimate amortizes irregular costs.** Rather than a raw
  calendar-year sum (which turns a $600-every-5-years tire replacement into
  one alarming spike and four zero years), each recurring item's average
  logged cost is spread across its real interval — same "mileage or time,
  whichever's sooner" logic that drives due-date estimates — and summed.
  One-time costs (no interval ever set) are left out of the estimate but
  still count toward the plain this-year/all-time totals.
- **Edits/deletes to history recompute the odometer honestly.** Same
  trust-the-correction principle as Edit Vehicle: `store.js`'s
  `updateService()`/`deleteService()` reset `currentOdometer` to whichever
  remaining/edited entry now has the highest mileage — allowed to move it
  down, not just up. Previously only `addService` touched the odometer, and
  only ever forward, which left it stale after an edit or delete of the
  entry that had been the high-water mark.
- **Home tab surfaces one action, not a summary.** Deliberate for the
  target audience (family members who don't think about cars much):
  overdue maintenance beats a stale Quick Check beats something due soon
  beats "all clear" — only the single highest-priority thing is ever
  headlined, with a secondary summary-card grid below for anyone who wants
  the fuller picture.
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

Live at GitHub Pages (bcrossley712/carfolio) is **behind** what's described
in this file. Everything below is finished, tested, and delivered to the
user as individual files, but not yet pushed:
- Narrow-screen overlap/horizontal-scroll fixes in the checklist and Quick
  Checks rows (rigid flex siblings replaced with wrapping layouts)
- Untrack a checklist item; edit a logged service entry (pencil next to
  delete) — both `store.js` methods, edit reuses the log-service form
- Budgeting tab (this-year / all-time / amortized annual estimate, by-year
  and by-service breakdowns)
- Quick Checks feature end to end: status-colored check button (not just
  adjacent text), grace-window staleness, per-item and per-vehicle "remind
  me" reminders, matching "Remind me again" swap on overdue maintenance
- Full navigation rebuild: five-tab shell (Checklist renamed **Services**,
  now also where "Log service" lives, sticky as you scroll), Home tab with
  the single-action priority engine, All Vehicles context, onboarding tour
  + contextual tips
- Header/dashboard rebuilt around vehicle info instead of the app's own
  name — single persistent header (no separate brand bar), no more
  dashboard/vehicle-list screen (`#/` redirects to last-viewed scope or a
  sensible default), switcher is the only way to change vehicles, add one,
  or reach backup/restore (see `js/app.js` architecture note above)
Next step is the user pushing these to `main`; nothing here should be
assumed live until that's confirmed.

Known gaps, not yet built: no standalone "update odometer" action separate
from logging a service, annual mileage estimate never recalculates from
actual logged data, no save-confirmation toast. The All Vehicles Budget tab
shows a by-vehicle rollup with tap-through rather than a merged line-item
breakdown (mixing different vehicles' service types didn't make sense to
combine).

Icons were generated programmatically (Pillow) from the in-app brand mark
(circle + tick + amber needle on slate background) rather than hand-designed —
fine for now, easy to swap later if a real logo gets made.
