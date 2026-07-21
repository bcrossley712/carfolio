// ============================================================================
// install-prompt.js — custom "Install Carfolio" banner, replacing the
// browser's native install UI. Handles the Chrome/Edge/Android programmatic
// flow and a manual hint for iOS Safari, which never exposes a programmatic
// install prompt at all — Apple only allows install via a manual
// Share -> Add to Home Screen action, no matter what a site does.
// ============================================================================

import { showBanner } from './banner.js';

const DISMISS_KEY = 'carfolio.installDismissedAt';
const DISMISS_COOLDOWN_DAYS = 14;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isDismissedRecently() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const days = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24);
  return days < DISMISS_COOLDOWN_DAYS;
}

function recordDismissal() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* private browsing, etc. */ }
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function initInstallPrompt() {
  if (isStandalone() || isDismissedRecently()) return;

  if (isIOS()) {
    // iOS never fires beforeinstallprompt — show the manual hint once.
    showBanner('install-banner', `
      <span>Install Carfolio: tap <strong>Share</strong> &rarr; <strong>Add to Home Screen</strong>.</span>
      <button class="btn btn-ghost" id="install-dismiss-btn" aria-label="Dismiss">&times;</button>
    `, (el) => {
      el.querySelector('#install-dismiss-btn').addEventListener('click', () => {
        recordDismissal();
        el.remove();
      });
    });
    return;
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    showBanner('install-banner', `
      <span>Install Carfolio for quicker access and offline use.</span>
      <button class="btn btn-primary" id="install-accept-btn">Install</button>
      <button class="btn btn-ghost" id="install-dismiss-btn" aria-label="Dismiss">&times;</button>
    `, (el) => {
      el.querySelector('#install-accept-btn').addEventListener('click', async () => {
        el.remove();
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
      });
      el.querySelector('#install-dismiss-btn').addEventListener('click', () => {
        recordDismissal();
        el.remove();
      });
    });
  });

  window.addEventListener('appinstalled', () => {
    const el = document.getElementById('install-banner');
    if (el) el.remove();
    try { localStorage.removeItem(DISMISS_KEY); } catch (e) { /* ignore */ }
  });
}
