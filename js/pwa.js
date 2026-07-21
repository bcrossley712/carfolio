// ============================================================================
// pwa.js — registers the service worker and shows a custom "update available"
// banner instead of relying on the browser to handle it silently. Deliberately
// not a native dialog, per the "replace default browser popups" preference —
// this is a small dismissible banner styled to match the rest of the app.
// ============================================================================

import { showBanner } from './banner.js';

function showUpdateBanner(onRefresh) {
  showBanner('update-banner', `
    <span>A new version of Carfolio is available.</span>
    <button class="btn btn-primary" id="update-refresh-btn">Refresh</button>
    <button class="btn btn-ghost" id="update-dismiss-btn" aria-label="Dismiss">&times;</button>
  `, (el) => {
    el.querySelector('#update-refresh-btn').addEventListener('click', onRefresh);
    el.querySelector('#update-dismiss-btn').addEventListener('click', () => el.remove());
  });
}

export function initPWA() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then((registration) => {
      // Case 1: an update was already waiting from a previous visit.
      if (registration.waiting) {
        showUpdateBanner(() => activateWaitingWorker(registration));
      }

      // Case 2: a new worker starts installing during this visit.
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // installed + there's already an active controller means this is
            // an update, not the first install.
            showUpdateBanner(() => activateWaitingWorker(registration));
          }
        });
      });
    }).catch((err) => {
      console.error('Carfolio: service worker registration failed.', err);
    });

    // Reload once the new worker actually takes control.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}

function activateWaitingWorker(registration) {
  if (registration.waiting) {
    registration.waiting.postMessage('SKIP_WAITING');
  }
}
