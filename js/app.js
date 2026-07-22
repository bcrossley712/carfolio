import { store, uid } from './store.js';
import { SERVICE_TYPES, getServiceType, getVehicleChecklist, getPrimaryReminder, formatDueDate, estimateAnnualMileage, getCategorySchedule, getCostHistory, getAnnualBudgetEstimate } from './reminders.js';
import { getVehicleQuickChecks, getQuickChecksStatus } from './quickchecks.js';
import { renderGauge, gaugeLabel } from './gauge.js';
import { buildICS, downloadICS } from './ics.js';
import { confirmDialog, alertDialog, remindMeDialog } from './dialogs.js';
import { initPWA } from './pwa.js';
import { initInstallPrompt } from './install-prompt.js';
import { decodeVIN, isValidVINFormat } from './vehicle-lookup.js';
import { localDateStr } from './dateutil.js';

initPWA();
initInstallPrompt();

const appEl = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');

const VALID_TABS = ['home', 'checklist', 'quickchecks', 'history', 'budget'];
const TABS = [
  { id: 'checklist', icon: '\uD83D\uDCCB', label: 'Checklist' },
  { id: 'quickchecks', icon: '\uD83D\uDD0D', label: 'Checks' },
  { id: 'home', icon: '\uD83C\uDFE0', label: 'Home', home: true },
  { id: 'history', icon: '\uD83D\uDCC3', label: 'History' },
  { id: 'budget', icon: '\uD83D\uDCB8', label: 'Budget' },
];

// ============================================================================
// Router — simple hash-based routing, no framework, no build step.
// #/                       -> dashboard (or straight into the vehicle if
//                             there's only one — no pointless extra screen)
// #/vehicle/:id/:tab?      -> a single vehicle, scoped to one of the tabs
// #/all/:tab?              -> every vehicle combined, same set of tabs
// ============================================================================
function router() {
  const hash = window.location.hash || '#/';
  const vehicleMatch = hash.match(/^#\/vehicle\/([^/]+)(?:\/([a-z]+))?\/?$/);
  const allMatch = hash.match(/^#\/all(?:\/([a-z]+))?\/?$/);

  if (vehicleMatch) {
    const [, id, tabRaw] = vehicleMatch;
    renderVehicleScope(id, VALID_TABS.includes(tabRaw) ? tabRaw : 'home');
  } else if (allMatch) {
    const [, tabRaw] = allMatch;
    renderAllScope(VALID_TABS.includes(tabRaw) ? tabRaw : 'home');
  } else {
    renderDashboard();
  }
}
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

// ============================================================================
// Dashboard
// ============================================================================
function renderDashboard() {
  document.body.classList.remove('scoped-view');
  const vehicles = store.getVehicles();

  if (vehicles.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <h2>No vehicles yet</h2>
        <p>Add your first vehicle to start tracking oil changes, tire rotations, and everything else.</p>
        <button class="btn btn-primary" id="empty-add-vehicle">Add your first vehicle</button>
      </div>
    `;
    document.getElementById('empty-add-vehicle').addEventListener('click', openAddVehicleModal);
    return;
  }

  // One vehicle means there's nothing to choose between — skip straight to
  // its own tabs rather than showing a list of one.
  if (vehicles.length === 1) {
    window.location.hash = `#/vehicle/${vehicles[0].id}/home`;
    return;
  }

  appEl.innerHTML = `
    <div class="vehicle-grid">
      ${allVehiclesCardHTML()}
      ${vehicles.map(v => vehicleCardHTML(v)).join('')}
      ${addVehicleCardHTML()}
    </div>
  `;

  document.getElementById('card-all').addEventListener('click', () => {
    window.location.hash = '#/all/home';
  });
  document.getElementById('card-add-vehicle').addEventListener('click', openAddVehicleModal);
  vehicles.forEach(v => {
    document.getElementById(`card-${v.id}`).addEventListener('click', () => {
      window.location.hash = `#/vehicle/${v.id}/home`;
    });
  });
}

function addVehicleCardHTML() {
  return `
    <button type="button" class="vehicle-card add-vehicle-card" id="card-add-vehicle">
      <span class="add-vehicle-plus">+</span>
      <span>Add vehicle</span>
    </button>
  `;
}

function allVehiclesCardHTML() {
  return `
    <article class="vehicle-card all-vehicles-card" id="card-all" tabindex="0">
      <div class="vehicle-card-top">
        <div class="all-vehicles-icon">\uD83D\uDD00</div>
        <div class="vehicle-card-info">
          <div class="vehicle-card-name">All Vehicles</div>
          <div class="vehicle-card-sub">See everything together</div>
        </div>
      </div>
    </article>
  `;
}

function vehicleCardHTML(vehicle) {
  const view = buildVehicleView(vehicle);
  const reminder = getPrimaryReminder(vehicle);
  const overallStatus = worstOf(view.checklistStatus, view.quickChecksStatus);
  const statusClass = overallStatus === 'rust' ? 'status-rust' : overallStatus === 'amber' ? 'status-amber' : (!reminder ? 'status-empty' : '');

  let statusText;
  if (reminder && reminder.status !== 'ok') {
    statusText = reminder.status === 'overdue' ? `${reminder.typeName} overdue` : `${reminder.typeName} due ${formatDueDate(reminder.dueDate)}`;
  } else if (view.quickChecksStatus !== 'ok') {
    const stale = view.quickChecks.slice().sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))[0];
    statusText = stale.daysSince == null ? `${stale.name} never checked` : `${stale.name} \u2014 ${stale.daysSince}d ago`;
  } else if (!reminder) {
    statusText = 'No services logged yet';
  } else {
    statusText = `${reminder.typeName} due ${formatDueDate(reminder.dueDate)}`;
  }

  const percent = reminder ? reminder.percentElapsed : 0;
  const gaugeStatus = reminder ? reminder.status : 'empty';
  const sub = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');

  return `
    <article class="vehicle-card" id="card-${vehicle.id}" tabindex="0">
      <div class="vehicle-card-top">
        <div class="gauge-wrap">
          ${renderGauge(percent, gaugeStatus)}
          <div class="gauge-label">${gaugeLabel(gaugeStatus, percent)}</div>
        </div>
        <div class="vehicle-card-info">
          <div class="vehicle-card-name">${escapeHTML(vehicle.name)}</div>
          <div class="vehicle-card-sub">${escapeHTML(sub || 'No details added')}</div>
        </div>
      </div>
      <div class="vehicle-card-status ${statusClass}">
        <span class="status-dot"></span>
        <span>${escapeHTML(statusText)}</span>
      </div>
    </article>
  `;
}

// ============================================================================
// Shared view-model helpers — used by the dashboard cards, both scoped
// views (single vehicle and All Vehicles), and the Home tab's priority engine.
// ============================================================================
function worstOf(...statuses) {
  if (statuses.includes('rust') || statuses.includes('overdue')) return 'rust';
  if (statuses.includes('amber') || statuses.includes('soon')) return 'amber';
  return 'ok';
}

function checklistWorstStatus(checklist) {
  if (checklist.some(r => r.status === 'overdue')) return 'rust';
  if (checklist.some(r => r.status === 'soon')) return 'amber';
  return 'ok';
}

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

function buildVehicleView(vehicle) {
  const checklist = getVehicleChecklist(vehicle);
  const quickChecks = getVehicleQuickChecks(vehicle);
  const quickChecksStatus = getQuickChecksStatus(vehicle);
  const checklistStatus = checklistWorstStatus(checklist);
  const history = vehicle.services.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const costHistory = getCostHistory(vehicle);
  const budget = getAnnualBudgetEstimate(vehicle);
  return {
    vehicle, checklist, quickChecks, quickChecksStatus, checklistStatus,
    overallStatus: worstOf(checklistStatus, quickChecksStatus),
    history, costHistory, budget,
  };
}

// The Home tab's single headline: overdue maintenance beats a stale quick
// check beats something coming up soon beats "all clear." Only one thing
// is ever surfaced, on purpose — this is meant to answer "what do I do
// next," not summarize everything at once.
function getNextAction(view) {
  const overdue = view.checklist.filter(r => r.status === 'overdue').sort((a, b) => b.percentElapsed - a.percentElapsed);
  if (overdue.length) {
    const r = overdue[0];
    return { tone: 'rust', text: `${r.icon} ${r.typeName} overdue since ${formatDueDate(r.dueDate)}`, cta: 'See checklist', tab: 'checklist' };
  }
  if (view.quickChecksStatus === 'rust') {
    const stale = view.quickChecks.slice().sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))[0];
    return {
      tone: 'rust',
      text: `${stale.icon} ${stale.name} ${stale.daysSince == null ? 'has never been checked' : `hasn\u2019t been checked in ${stale.daysSince} days`}`,
      cta: 'Check it now', tab: 'quickchecks',
    };
  }
  const soon = view.checklist.filter(r => r.status === 'soon').sort((a, b) => b.percentElapsed - a.percentElapsed);
  if (soon.length) {
    const r = soon[0];
    return { tone: 'amber', text: `${r.icon} ${r.typeName} due ${formatDueDate(r.dueDate)}`, cta: 'See checklist', tab: 'checklist' };
  }
  if (view.quickChecksStatus === 'amber') {
    const stale = view.quickChecks.slice().sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))[0];
    return { tone: 'amber', text: `${stale.icon} ${stale.name} \u2014 ${stale.daysSince}d ago`, cta: 'Take a look', tab: 'quickchecks' };
  }
  return { tone: 'ok', text: 'Everything\u2019s up to date', cta: null, tab: 'home' };
}

function getAllNextAction(views) {
  const rank = { rust: 2, amber: 1, ok: 0 };
  const worst = views.slice().sort((a, b) => rank[b.overallStatus] - rank[a.overallStatus])[0];
  const action = getNextAction(worst);
  return { ...action, place: worst.vehicle.name };
}

function headlineCardHTML(action, place) {
  const toneLabel = action.tone === 'rust' ? 'Needs attention' : action.tone === 'amber' ? 'Coming up' : 'All clear';
  return `
    <div class="headline-card tone-${action.tone}">
      <div class="headline-eyebrow">${toneLabel}</div>
      <div class="headline-text">${place ? `<span class="place">${escapeHTML(place)}</span>` : ''}${escapeHTML(action.text)}</div>
      ${action.cta ? `<button type="button" class="btn headline-btn" data-tab="${action.tab}">${escapeHTML(action.cta)}</button>` : ''}
    </div>
  `;
}

function summaryCardsHTML(counts) {
  return `
    <div class="summary-grid">
      <button type="button" class="summary-card" data-tab="checklist">
        <div class="summary-card-top"><span class="summary-card-icon">\uD83D\uDCCB</span><span class="dot ${counts.checklistStatus}"></span></div>
        <div class="summary-card-label">Checklist</div>
        <div class="summary-card-value">${counts.dueSoon} item${counts.dueSoon === 1 ? '' : 's'} due soon</div>
      </button>
      <button type="button" class="summary-card" data-tab="quickchecks">
        <div class="summary-card-top"><span class="summary-card-icon">\uD83D\uDD0D</span><span class="dot ${counts.quickChecksStatus}"></span></div>
        <div class="summary-card-label">Quick checks</div>
        <div class="summary-card-value">${counts.overdueQC ? counts.overdueQC + ' need a look' : 'all recently checked'}</div>
      </button>
      <button type="button" class="summary-card" data-tab="history">
        <div class="summary-card-top"><span class="summary-card-icon">\uD83D\uDCC3</span></div>
        <div class="summary-card-label">History</div>
        <div class="summary-card-value">${counts.historyCount} service${counts.historyCount === 1 ? '' : 's'} logged</div>
      </button>
      <button type="button" class="summary-card" data-tab="budget">
        <div class="summary-card-top"><span class="summary-card-icon">\uD83D\uDCB8</span></div>
        <div class="summary-card-label">Budget</div>
        <div class="summary-card-value">${money(counts.thisYear)} this year</div>
      </button>
    </div>
  `;
}

function tabBarHTML(scopePrefix, activeTab) {
  return `
    <nav class="tab-bar">
      ${TABS.map(t => t.home ? `
        <a class="tab-item home-tab ${activeTab === t.id ? 'active' : ''}" href="${scopePrefix}/${t.id}">
          <span class="tab-icon-wrap"><span class="tab-icon">${t.icon}</span></span>
          <span class="tab-label">${t.label}</span>
        </a>
      ` : `
        <a class="tab-item ${activeTab === t.id ? 'active' : ''}" href="${scopePrefix}/${t.id}">
          <span class="tab-icon">${t.icon}</span><span class="tab-label">${t.label}</span>
        </a>
      `).join('')}
    </nav>
  `;
}

// Wires the bits every scoped view shares: the Home tab's headline CTA and
// summary cards (data-tab, relative to the current scope), and any
// tap-through row (data-goto, an absolute hash — used by the All Vehicles
// budget breakdown to jump into one vehicle's own tab).
function wireGenericNav(scopePrefix) {
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', () => { window.location.hash = `${scopePrefix}/${el.getAttribute('data-tab')}`; });
  });
  document.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => { window.location.hash = el.getAttribute('data-goto'); });
  });
}

// The vehicle name in the header doubles as a switcher: jump straight to
// another vehicle or All Vehicles, or add a new one — all without backing
// out to the dashboard first. This is also now the only place vehicles get
// added, so the chevron shows even when there's just one vehicle.
function wireSwitcher(vehicles, currentId) {
  const titleBtn = document.getElementById('top-title-btn');
  const container = document.getElementById('switcher-container');
  if (!titleBtn || !container) return;

  const close = () => { container.innerHTML = ''; };

  titleBtn.addEventListener('click', () => {
    if (container.innerHTML) { close(); return; }

    const options = [];
    if (vehicles.length > 1) {
      options.push({ id: 'all', icon: '\uD83D\uDD00', label: 'All Vehicles' });
    }
    vehicles.forEach(v => options.push({ id: v.id, icon: '\uD83D\uDE97', label: v.name }));

    container.innerHTML = `
      <div class="switcher-backdrop" id="switcher-backdrop"></div>
      <div class="switcher-sheet">
        ${options.map(o => `
          <button type="button" class="switch-option ${currentId === o.id ? 'current' : ''}" data-switch="${o.id}">
            <span>${o.icon}</span><span class="switch-option-label">${escapeHTML(o.label)}</span>
          </button>
        `).join('')}
        <div class="switcher-divider"></div>
        <button type="button" class="switch-option switch-option-add" id="switcher-add-vehicle">
          <span>+</span><span class="switch-option-label">Add vehicle</span>
        </button>
      </div>
    `;

    document.getElementById('switcher-backdrop').addEventListener('click', close);
    document.querySelectorAll('[data-switch]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-switch');
        window.location.hash = id === 'all' ? '#/all/home' : `#/vehicle/${id}/home`;
      });
    });
    document.getElementById('switcher-add-vehicle').addEventListener('click', () => {
      close();
      openAddVehicleModal();
    });
  });
}

// ============================================================================
// Contextual first-visit tips — shown once per tab, dismissible, never
// nagging again once closed. Separate from the onboarding tour: the tour
// is a one-time walkthrough of the whole app, these are quiet explanations
// that show up right where they're relevant.
// ============================================================================
const TIP_KEY_PREFIX = 'carfolio.tipDismissed.';

function isTipDismissed(key) {
  try { return localStorage.getItem(TIP_KEY_PREFIX + key) === '1'; } catch (e) { return false; }
}
function dismissTip(key) {
  try { localStorage.setItem(TIP_KEY_PREFIX + key, '1'); } catch (e) { /* private browsing, etc. */ }
}
function tipBannerHTML(key, text) {
  if (isTipDismissed(key)) return '';
  return `
    <div class="tip-banner" id="tip-banner-${key}">
      <span class="tip-banner-icon">\uD83D\uDCA1</span>
      <span class="tip-banner-text">${text}</span>
      <button type="button" class="tip-banner-close" id="tip-close-${key}" aria-label="Dismiss tip">&times;</button>
    </div>
  `;
}
function wireTipBanner(key) {
  const btn = document.getElementById(`tip-close-${key}`);
  if (btn) {
    btn.addEventListener('click', () => {
      dismissTip(key);
      document.getElementById(`tip-banner-${key}`)?.remove();
    });
  }
}

// ============================================================================
// Single-vehicle scope
// ============================================================================
function renderVehicleScope(vehicleId, tab) {
  const vehicle = store.getVehicle(vehicleId);
  if (!vehicle) {
    window.location.hash = '#/';
    return;
  }
  document.body.classList.add('scoped-view');

  const view = buildVehicleView(vehicle);
  const vehicles = store.getVehicles();
  const scopePrefix = `#/vehicle/${vehicle.id}`;
  const sub = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');

  let content;
  if (tab === 'checklist') content = renderChecklistTab(view);
  else if (tab === 'quickchecks') content = renderQuickChecksTab(view);
  else if (tab === 'history') content = renderHistoryTab(view);
  else if (tab === 'budget') content = renderBudgetTab(view);
  else content = renderVehicleHomeTab(view);

  appEl.innerHTML = `
    <div class="top-header">
      ${vehicles.length > 1 ? `<a href="#/" class="back-btn" aria-label="All vehicles">&lsaquo;</a>` : ''}
      <button type="button" class="top-title-btn" id="top-title-btn">
        <div class="top-title">
          <h2>${escapeHTML(vehicle.name)}</h2>
          <div class="top-title-sub">${escapeHTML(sub || 'No details added')}</div>
        </div>
        <span class="switch-chevron">&#9662;</span>
      </button>
      <div id="switcher-container"></div>
      <div class="top-header-actions">
        <button class="btn btn-secondary" id="edit-vehicle-btn">Edit</button>
        <button class="btn btn-primary" id="log-service-btn">Log service</button>
      </div>
    </div>
    ${content}
    ${tabBarHTML(scopePrefix, tab)}
  `;

  document.getElementById('edit-vehicle-btn').addEventListener('click', () => openEditVehicleModal(vehicle.id));
  document.getElementById('log-service-btn').addEventListener('click', () => openLogServiceModal(vehicle.id));
  wireSwitcher(vehicles, vehicle.id);

  const delBtn = document.getElementById('delete-vehicle-btn');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const ok = await confirmDialog(
        `Delete ${escapeHTML(vehicle.name)} and all its service history? This can't be undone.`,
        { title: 'Delete vehicle', confirmText: 'Delete', danger: true }
      );
      if (ok) {
        store.deleteVehicle(vehicle.id);
        window.location.hash = '#/';
      }
    });
  }

  if (tab === 'checklist') view.checklist.forEach(r => wireChecklistRow(vehicle, r));
  if (tab === 'quickchecks') { wireQuickChecksTabEvents(vehicle, view.quickChecks); wireTipBanner('quickchecks'); }
  if (tab === 'history') view.history.forEach(h => wireHistoryRow(vehicle, h));
  if (tab === 'budget') wireTipBanner('budget');

  wireGenericNav(scopePrefix);
}

function renderVehicleHomeTab(view) {
  const { vehicle } = view;
  const annualEstimate = estimateAnnualMileage(vehicle);
  const powertrainLabel = { gasoline: 'Gasoline', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Electric' }[vehicle.powertrain];
  const action = getNextAction(view);
  const counts = {
    checklistStatus: view.checklistStatus,
    dueSoon: view.checklist.filter(r => r.status === 'overdue' || r.status === 'soon').length,
    quickChecksStatus: view.quickChecksStatus,
    overdueQC: view.quickChecks.filter(i => i.status === 'rust').length,
    historyCount: view.history.length,
    thisYear: view.costHistory.thisYear,
  };
  return `
    <div class="section">
      <p class="field-hint" style="margin-bottom:14px;">${powertrainLabel ? `${powertrainLabel} \u00b7 ` : ''}${vehicle.currentOdometer.toLocaleString()} mi as of ${formatDueDate(vehicle.odometerAsOfDate)} \u00b7 ~${annualEstimate.toLocaleString()} mi/yr estimated</p>
      ${headlineCardHTML(action, null)}
      ${summaryCardsHTML(counts)}
      <button class="btn btn-danger" id="delete-vehicle-btn">Delete this vehicle</button>
    </div>
  `;
}

function renderChecklistTab(view) {
  return `
    <div class="section">
      <h3 class="section-title">Maintenance checklist</h3>
      ${view.checklist.length === 0
        ? `<p class="field-hint">No recommended services set for this vehicle yet.</p>`
        : `<div class="reminder-list">${view.checklist.map(r => reminderRowHTML(view.vehicle, r)).join('')}</div>`
      }
    </div>
  `;
}

function renderQuickChecksTab(view) {
  return quickChecksSectionHTML(view.vehicle);
}

function renderHistoryTab(view) {
  return `
    <div class="section">
      <h3 class="section-title">Service history</h3>
      ${view.history.length === 0
        ? `<p class="field-hint">No services logged yet.</p>`
        : `<div class="history-list">${view.history.map(h => historyRowHTML(view.vehicle, h)).join('')}</div>`
      }
    </div>
  `;
}

function renderBudgetTab(view) {
  return budgetSectionHTML(view.vehicle);
}

// ============================================================================
// All Vehicles scope
// ============================================================================
function renderAllScope(tab) {
  const vehicles = store.getVehicles();
  if (vehicles.length < 2) {
    window.location.hash = '#/';
    return;
  }
  document.body.classList.add('scoped-view');

  const views = vehicles.map(buildVehicleView);
  const scopePrefix = '#/all';

  let content;
  if (tab === 'checklist') content = renderAllChecklistTab(views);
  else if (tab === 'quickchecks') content = renderAllQuickChecksTab(views);
  else if (tab === 'history') content = renderAllHistoryTab(views);
  else if (tab === 'budget') content = renderAllBudgetTab(views);
  else content = renderAllHomeTab(views);

  appEl.innerHTML = `
    <div class="top-header">
      <a href="#/" class="back-btn" aria-label="Back">&lsaquo;</a>
      <button type="button" class="top-title-btn" id="top-title-btn">
        <div class="top-title">
          <h2>All Vehicles</h2>
          <div class="top-title-sub">${vehicles.length} vehicles</div>
        </div>
        <span class="switch-chevron">&#9662;</span>
      </button>
      <div id="switcher-container"></div>
    </div>
    ${content}
    ${tabBarHTML(scopePrefix, tab)}
  `;

  wireSwitcher(vehicles, 'all');

  if (tab === 'checklist') views.forEach(v => v.checklist.forEach(r => wireChecklistRow(v.vehicle, r)));
  if (tab === 'quickchecks') views.forEach(v => wireQuickChecksTabEvents(v.vehicle, v.quickChecks, { grouped: true }));
  if (tab === 'history') views.forEach(v => v.history.forEach(h => wireHistoryRow(v.vehicle, h)));

  wireGenericNav(scopePrefix);
}

function renderAllHomeTab(views) {
  const action = getAllNextAction(views);
  const counts = {
    checklistStatus: worstOf(...views.map(v => v.checklistStatus)),
    dueSoon: sum(views.map(v => v.checklist.filter(r => r.status === 'overdue' || r.status === 'soon').length)),
    quickChecksStatus: worstOf(...views.map(v => v.quickChecksStatus)),
    overdueQC: sum(views.map(v => v.quickChecks.filter(i => i.status === 'rust').length)),
    historyCount: sum(views.map(v => v.history.length)),
    thisYear: sum(views.map(v => v.costHistory.thisYear)),
  };
  return `
    <div class="section">
      ${headlineCardHTML(action, action.place)}
      ${summaryCardsHTML(counts)}
    </div>
  `;
}

function checklistRank(status) { return status === 'overdue' ? 3 : status === 'soon' ? 2 : status === 'unlogged' ? 1 : 0; }

function renderAllChecklistTab(views) {
  const rows = [];
  views.forEach(v => v.checklist.forEach(r => rows.push({ vehicle: v.vehicle, r })));
  rows.sort((a, b) => checklistRank(b.r.status) - checklistRank(a.r.status));
  return `
    <div class="section">
      <h3 class="section-title">Maintenance checklist</h3>
      ${rows.length === 0
        ? `<p class="field-hint">No recommended services set yet.</p>`
        : `<div class="reminder-list">${rows.map(x => reminderRowHTML(x.vehicle, x.r, { tag: x.vehicle.name })).join('')}</div>`
      }
    </div>
  `;
}

function renderAllQuickChecksTab(views) {
  return `
    <div class="section">
      <h3 class="section-title">Quick checks</h3>
      <p class="field-hint" style="margin-bottom:14px;">Grouped by vehicle \u2014 tap a car to see its full list.</p>
      ${views.map(v => qcGroupHTML(v.vehicle, v.quickChecks, v.quickChecksStatus)).join('')}
    </div>
  `;
}

function qcGroupHTML(vehicle, items, status) {
  const stale = items.slice().sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))[0];
  const statusText = status === 'ok'
    ? 'All recently checked'
    : `${stale.icon} ${escapeHTML(stale.name)} ${stale.daysSince == null ? '\u2014 never checked' : `\u2014 ${stale.daysSince}d ago`}`;
  return `
    <details class="qc-group">
      <summary class="qc-group-summary">
        <span class="dot ${status}"></span>
        <div class="qc-group-info">
          <div class="qc-group-name">${escapeHTML(vehicle.name)}</div>
          <div class="qc-group-status ${status}">${statusText}</div>
        </div>
        <button type="button" class="qc-group-mark" id="qc-mark-all-${vehicle.id}">Mark done</button>
        <span class="qc-group-chevron">\u203a</span>
      </summary>
      <div class="qc-group-items">${items.map(i => qcRowHTML(vehicle, i)).join('')}</div>
    </details>
  `;
}

function renderAllHistoryTab(views) {
  const rows = [];
  views.forEach(v => v.history.forEach(h => rows.push({ vehicle: v.vehicle, entry: h })));
  rows.sort((a, b) => (a.entry.date < b.entry.date ? 1 : -1));
  return `
    <div class="section">
      <h3 class="section-title">Service history</h3>
      ${rows.length === 0
        ? `<p class="field-hint">No services logged yet.</p>`
        : `<div class="history-list">${rows.map(x => historyRowHTML(x.vehicle, x.entry, { tag: x.vehicle.name })).join('')}</div>`
      }
    </div>
  `;
}

function renderAllBudgetTab(views) {
  const thisYear = sum(views.map(v => v.costHistory.thisYear));
  const allTime = sum(views.map(v => v.costHistory.allTime));
  const annual = sum(views.map(v => v.budget.total));
  return `
    <div class="section">
      <h3 class="section-title">Budgeting</h3>
      <div class="budget-stats">
        <div class="budget-stat"><div class="budget-stat-label">This year</div><div class="budget-stat-value">${money(thisYear)}</div></div>
        <div class="budget-stat"><div class="budget-stat-label">All time</div><div class="budget-stat-value">${money(allTime)}</div></div>
        <div class="budget-stat budget-stat-highlight"><div class="budget-stat-label">Estimated annual budget</div><div class="budget-stat-value">${money(annual)}</div></div>
      </div>
      <div class="budget-breakdown">
        <div class="budget-panel-title">By vehicle</div>
        ${views.map(v => `
          <button type="button" class="budget-line-btn" data-goto="#/vehicle/${v.vehicle.id}/budget">
            <div class="budget-row"><span>${escapeHTML(v.vehicle.name)}<span class="budget-row-detail">${money(v.costHistory.thisYear)} this year</span></span><span>${money(v.budget.total)}/yr</span></div>
          </button>
        `).join('')}
      </div>
      <p class="field-hint" style="margin-top:10px;">Tap a vehicle to see its own cost breakdown.</p>
    </div>
  `;
}

function reminderRowHTML(vehicle, r, opts = {}) {
  const key = `${vehicle.id}__${r.typeId}`;
  const tagHTML = opts.tag ? `<div class="reminder-row-tag">${escapeHTML(opts.tag)}</div>` : '';

  if (r.status === 'unlogged') {
    return `
      <div class="reminder-row">
        <div class="gauge-wrap" style="width:48px;height:48px;">
          ${renderGauge(0, 'empty')}
        </div>
        <div class="reminder-row-info">
          <div class="reminder-row-name">${r.icon} ${escapeHTML(r.typeName)}</div>
          ${tagHTML}
          <div class="reminder-row-due">Not logged yet</div>
        </div>
        <div class="reminder-row-actions">
          <button class="btn btn-secondary" id="log-now-${key}">Log now</button>
          <button class="btn btn-icon" id="untrack-${key}" title="Stop tracking ${escapeHTML(r.typeName)}" aria-label="Stop tracking ${escapeHTML(r.typeName)}">&times;</button>
        </div>
      </div>
    `;
  }

  const dueClass = r.status === 'overdue' ? 'due-rust' : r.status === 'soon' ? 'due-amber' : '';
  const dueText = r.status === 'overdue' ? `Overdue since ${formatDueDate(r.dueDate)}` : `Due ${formatDueDate(r.dueDate)}`;
  const mileageText = r.estimatedDueMileage ? ` (~${r.estimatedDueMileage.toLocaleString()} mi)` : '';
  const calendarBtn = r.status === 'overdue'
    ? `<button class="btn btn-secondary" id="remind-${key}">Remind me again</button>`
    : `<button class="btn btn-secondary" id="ics-${key}">Add to calendar</button>`;
  return `
    <div class="reminder-row">
      <div class="gauge-wrap" style="width:48px;height:48px;">
        ${renderGauge(r.percentElapsed, r.status)}
      </div>
      <div class="reminder-row-info">
        <div class="reminder-row-name">${r.icon} ${escapeHTML(r.typeName)}</div>
        ${tagHTML}
        <div class="reminder-row-due ${dueClass}">${dueText}${mileageText}</div>
      </div>
      <div class="reminder-row-actions">
        <button class="btn btn-secondary" id="log-now-${key}">Log now</button>
        ${calendarBtn}
        <button class="btn btn-icon" id="untrack-${key}" title="Stop tracking ${escapeHTML(r.typeName)}" aria-label="Stop tracking ${escapeHTML(r.typeName)}">&times;</button>
      </div>
    </div>
  `;
}

function wireChecklistRow(vehicle, r) {
  const key = `${vehicle.id}__${r.typeId}`;

  const icsBtn = document.getElementById(`ics-${key}`);
  if (icsBtn) {
    icsBtn.addEventListener('click', () => {
      const ics = buildICS({
        title: `${vehicle.name}: ${r.typeName} due`,
        description: `Estimated by Carfolio based on your driving habits. Update the date in your calendar if you know the exact due date.`,
        dueDate: r.dueDate,
        uidSeed: `${vehicle.id}-${r.typeId}-${r.dueDate}`,
      });
      downloadICS(`${vehicle.name.replace(/\s+/g, '_')}-${r.typeId}.ics`, ics);
    });
  }

  const remindBtn = document.getElementById(`remind-${key}`);
  if (remindBtn) {
    remindBtn.addEventListener('click', async () => {
      const date = await remindMeDialog({
        title: 'Remind me again',
        message: `When should we remind you about ${escapeHTML(r.typeName)}?`,
      });
      if (date) {
        const ics = buildICS({
          title: `${vehicle.name}: ${r.typeName} \u2014 reminder`,
          description: `You snoozed this from Carfolio. It was overdue as of ${formatDueDate(r.dueDate)}.`,
          dueDate: date,
          uidSeed: `${vehicle.id}-${r.typeId}-remind-${date}`,
        });
        downloadICS(`${vehicle.name.replace(/\s+/g, '_')}-${r.typeId}-reminder.ics`, ics);
      }
    });
  }

  const logBtn = document.getElementById(`log-now-${key}`);
  if (logBtn) {
    logBtn.addEventListener('click', () => openLogServiceModal(vehicle.id, r.typeId));
  }

  const untrackBtn = document.getElementById(`untrack-${key}`);
  if (untrackBtn) {
    untrackBtn.addEventListener('click', async () => {
      const ok = await confirmDialog(
        `Stop tracking ${escapeHTML(r.typeName)}? Its service history stays intact — you can add it back anytime from Edit vehicle.`,
        { title: 'Stop tracking', confirmText: 'Stop tracking' }
      );
      if (ok) {
        store.untrackService(vehicle.id, r.typeId);
        router();
      }
    });
  }
}

function money(n) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatInterval(days) {
  const years = days / 365;
  if (years >= 1.5) return `${Math.round(years)} yr`;
  const months = days / 30.44;
  if (months >= 1.5) return `${Math.round(months)} mo`;
  return `${Math.round(days)} days`;
}

function budgetSectionHTML(vehicle) {
  const costHistory = getCostHistory(vehicle);
  const budget = getAnnualBudgetEstimate(vehicle);

  if (costHistory.allTime === 0) {
    return `
      <div class="section">
        <h3 class="section-title">Budgeting</h3>
        <p class="field-hint">Log a service with a cost to start tracking spend and an annual budget estimate.</p>
      </div>
    `;
  }

  const byYearHTML = costHistory.byYear.map(y => `
    <div class="budget-row"><span>${y.year}</span><span>${money(y.total)}</span></div>
  `).join('');

  const breakdownHTML = budget.breakdown.length
    ? budget.breakdown.map(b => `
        <div class="budget-row">
          <span>${b.icon} ${escapeHTML(b.typeName)} <span class="budget-row-detail">avg ${money(b.avgCost)} every ${formatInterval(b.intervalDays)}</span></span>
          <span>${money(b.annualCost)}/yr</span>
        </div>
      `).join('')
    : `<p class="field-hint">No recurring costed services yet — one-time costs don't factor into the annual estimate.</p>`;

  return `
    <div class="section">
      <h3 class="section-title">Budgeting</h3>
      ${tipBannerHTML('budget', 'The estimated annual budget spreads out irregular costs \u2014 like tires every few years \u2014 into a $/year figure, so it\u2019s not just a surprise spike in one year\u2019s total.')}
      <div class="budget-stats">
        <div class="budget-stat">
          <div class="budget-stat-label">This year</div>
          <div class="budget-stat-value">${money(costHistory.thisYear)}</div>
        </div>
        <div class="budget-stat">
          <div class="budget-stat-label">All time</div>
          <div class="budget-stat-value">${money(costHistory.allTime)}</div>
        </div>
        <div class="budget-stat budget-stat-highlight">
          <div class="budget-stat-label">Estimated annual budget</div>
          <div class="budget-stat-value">${money(budget.total)}</div>
        </div>
      </div>
      <details class="budget-breakdown">
        <summary>See where that comes from</summary>
        ${breakdownHTML}
      </details>
      ${byYearHTML ? `<details class="budget-breakdown"><summary>By year</summary>${byYearHTML}</details>` : ''}
    </div>
  `;
}

function qcRowHTML(vehicle, i) {
  const key = `${vehicle.id}__${i.id}`;
  return `
    <div class="qc-row">
      <div class="qc-row-icon">${i.icon}</div>
      <div class="qc-row-info">
        <div class="qc-row-name">${escapeHTML(i.name)}</div>
        <div class="qc-row-tip">${escapeHTML(i.tip)}</div>
      </div>
      <div class="qc-row-status ${i.status}">${i.daysSince == null ? 'Never checked' : `${i.daysSince}d ago`}</div>
      <button class="btn btn-icon qc-row-check" id="qc-check-${key}" title="Mark ${escapeHTML(i.name)} checked today" aria-label="Mark ${escapeHTML(i.name)} checked today">&check;</button>
    </div>
  `;
}

function quickChecksSectionHTML(vehicle) {
  const items = getVehicleQuickChecks(vehicle);
  const sectionStatus = getQuickChecksStatus(vehicle);
  const staleItem = items.slice().sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))[0];
  const heroText = sectionStatus === 'ok'
    ? 'Checked recently \u2014 nice work'
    : `${staleItem.icon} ${escapeHTML(staleItem.name)} ${staleItem.daysSince == null ? 'has never been checked' : `\u2014 ${staleItem.daysSince}d ago`}`;

  return `
    <div class="section">
      <h3 class="section-title">Quick checks</h3>
      ${tipBannerHTML('quickchecks', 'These are checks you do yourself \u2014 no mechanic needed. A couple minutes, every fill-up or two.')}
      <p class="field-hint" style="margin-bottom:14px;">The stuff a mechanic won't catch for you.</p>
      <div class="qc-hero tone-${sectionStatus}">
        <div class="qc-hero-text">
          <div class="qc-hero-label">Last full walkaround</div>
          <div class="qc-hero-value">${heroText}</div>
        </div>
        <button class="btn btn-primary" id="qc-mark-all-${vehicle.id}">Mark walkaround done</button>
      </div>
      <div class="qc-list">
        ${items.map(i => qcRowHTML(vehicle, i)).join('')}
      </div>
      <button class="btn btn-ghost" id="qc-remind-me-${vehicle.id}" style="margin-top:10px;">Remind me to do a walkaround</button>
    </div>
  `;
}

// Wires a vehicle's quick-checks controls. Used both for the single-vehicle
// tab (where the "Mark done" button lives in a hero card) and, with
// grouped: true, for a collapsed <details> group in the All Vehicles tab —
// same ids either way, just skips the remind-me link there since one
// walkaround reminder per vehicle belongs on that vehicle's own tab.
function wireQuickChecksTabEvents(vehicle, items, opts = {}) {
  const markAllBtn = document.getElementById(`qc-mark-all-${vehicle.id}`);
  if (markAllBtn) {
    markAllBtn.addEventListener('click', (e) => {
      if (opts.grouped) { e.preventDefault(); e.stopPropagation(); } // don't toggle the <details> it sits inside
      store.markAllQuickChecks(vehicle.id);
      router();
    });
  }

  items.forEach(i => {
    const key = `${vehicle.id}__${i.id}`;
    const btn = document.getElementById(`qc-check-${key}`);
    if (btn) {
      btn.addEventListener('click', () => {
        store.markQuickCheck(vehicle.id, i.id);
        router();
      });
    }
  });

  const remindBtn = document.getElementById(`qc-remind-me-${vehicle.id}`);
  if (remindBtn) {
    remindBtn.addEventListener('click', async () => {
      const date = await remindMeDialog({
        title: 'Remind me',
        message: `When should we remind you to do a quick walkaround on ${escapeHTML(vehicle.name)}?`,
      });
      if (date) {
        const ics = buildICS({
          title: `${vehicle.name}: Quick checks walkaround`,
          description: `Coolant, oil level, tire pressure and tread, lights, and the rest \u2014 a couple minutes, no mechanic needed.`,
          dueDate: date,
          uidSeed: `${vehicle.id}-quickchecks-${date}`,
        });
        downloadICS(`${vehicle.name.replace(/\s+/g, '_')}-quickchecks-reminder.ics`, ics);
      }
    });
  }
}

function historyRowHTML(vehicle, entry, opts = {}) {
  const type = getServiceType(entry.typeId);
  const costText = entry.cost != null ? `$${entry.cost.toLocaleString()}` : '';
  const tagHTML = opts.tag ? `<span>\u00b7 ${escapeHTML(opts.tag)}</span>` : '';
  return `
    <div class="history-row">
      <div class="history-row-icon">${type.icon}</div>
      <div class="history-row-info">
        <div class="history-row-name">${escapeHTML(entry.typeName)}</div>
        <div class="history-row-meta">
          <span>${formatDueDate(entry.date)}</span>
          <span class="mono">${entry.mileage.toLocaleString()} mi</span>
          ${tagHTML}
        </div>
        ${entry.notes ? `<div class="history-row-notes">${escapeHTML(entry.notes)}</div>` : ''}
      </div>
      <div class="history-row-cost">${costText}</div>
      <button class="btn btn-ghost" id="delete-history-${entry.id}" aria-label="Delete entry">✕</button>
    </div>
  `;
}

function wireHistoryRow(vehicle, entry) {
  const btn = document.getElementById(`delete-history-${entry.id}`);
  if (btn) {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog('Delete this service record?', { title: 'Delete entry', confirmText: 'Delete', danger: true });
      if (ok) {
        store.deleteService(vehicle.id, entry.id);
        router();
      }
    });
  }
}

// ============================================================================
// Modal helpers
// ============================================================================
function openModal(innerHTML) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true">${innerHTML}</div>
    </div>
  `;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
  document.addEventListener('keydown', escToClose);
}
function escToClose(e) {
  if (e.key === 'Escape') closeModal();
}
function closeModal() {
  modalRoot.innerHTML = '';
  document.removeEventListener('keydown', escToClose);
}

// ============================================================================
// Add / Edit vehicle modal (with the mileage-estimating questionnaire)
// ============================================================================
function powertrainOptionsHTML(selected) {
  const options = [
    { value: 'gasoline', label: 'Gasoline' },
    { value: 'diesel', label: 'Diesel' },
    { value: 'hybrid', label: 'Hybrid' },
    { value: 'electric', label: 'Electric' },
    { value: '', label: "Not sure" },
  ];
  return options.map(o => `
    <label class="choice-option">
      <input type="radio" name="powertrain" value="${o.value}" ${o.value === (selected || '') ? 'checked' : ''} /> ${o.label}
    </label>
  `).join('');
}

function checklistStepHTML(powertrainValue) {
  const schedule = getCategorySchedule(powertrainValue || 'unknown');
  return schedule.map(entry => {
    const type = getServiceType(entry.typeId);
    const intervalHint = [
      entry.intervalMiles ? `~${entry.intervalMiles.toLocaleString()} mi` : null,
      entry.intervalMonths ? `${entry.intervalMonths} mo` : null,
    ].filter(Boolean).join(' / ');
    return `
      <label class="choice-option">
        <input type="checkbox" name="checklist-item" value="${entry.typeId}" checked />
        ${type.icon} ${escapeHTML(type.name)}
        <span class="field-hint" style="margin:0 0 0 auto;">${intervalHint}</span>
      </label>
    `;
  }).join('');
}

function openAddVehicleModal() {
  let step = 1;

  openModal(`
    <div class="modal-header">
      <h2 class="modal-title">Add a vehicle</h2>
      <button class="modal-close" id="modal-close">&times;</button>
    </div>
    <div class="step-indicator">
      <div class="step-dot active" id="step-dot-1"></div>
      <div class="step-dot" id="step-dot-2"></div>
    </div>
    <form id="vehicle-form">
      <div id="wizard-step-1">
        <div class="field">
          <label for="v-name">Nickname</label>
          <input type="text" id="v-name" placeholder="e.g. Mom's Civic" required />
        </div>

        <div class="field">
          <label for="v-vin">VIN (optional)</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="v-vin" placeholder="17-character VIN" maxlength="17" style="flex:1; text-transform:uppercase;" />
            <button type="button" class="btn btn-secondary" id="vin-decode-btn">Look up</button>
          </div>
          <p class="field-hint" id="vin-status"></p>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="v-year">Year</label>
            <input type="text" id="v-year" placeholder="2019" inputmode="numeric" />
          </div>
          <div class="field">
            <label for="v-make">Make</label>
            <input type="text" id="v-make" placeholder="Honda" />
          </div>
        </div>
        <div class="field">
          <label for="v-model">Model</label>
          <input type="text" id="v-model" placeholder="Civic" />
        </div>

        <div class="field">
          <label>Vehicle type</label>
          <div class="choice-group" id="powertrain-group">
            ${powertrainOptionsHTML(null)}
          </div>
          <p class="field-hint" id="powertrain-hint">Used to recommend the right maintenance checklist. A VIN look-up will fill this in automatically.</p>
        </div>

        <div class="field">
          <label>Is this the primary commuter?</label>
          <div class="choice-group" id="commuter-group">
            <label class="choice-option"><input type="radio" name="commuter" value="yes" /> Yes, driven most days</label>
            <label class="choice-option"><input type="radio" name="commuter" value="no" checked /> No, it's a secondary vehicle</label>
          </div>
        </div>

        <div class="field">
          <label>How often does it get driven?</label>
          <div class="choice-group" id="frequency-group">
            <label class="choice-option"><input type="radio" name="frequency" value="daily" /> Daily or almost daily</label>
            <label class="choice-option"><input type="radio" name="frequency" value="average" checked /> A few times a week</label>
            <label class="choice-option"><input type="radio" name="frequency" value="rarely" /> Occasionally / weekends only</label>
          </div>
          <p class="field-hint">We use this to estimate mileage over time, so reminders can be based on a real date &mdash; no need to track exact miles.</p>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="v-odometer">Current odometer (mi)</label>
            <input type="number" id="v-odometer" placeholder="45000" min="0" />
          </div>
          <div class="field">
            <label for="v-odometer-date">As of</label>
            <input type="date" id="v-odometer-date" value="${todayStr()}" />
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="next-btn">Next: review checklist</button>
        </div>
      </div>

      <div id="wizard-step-2" style="display:none;">
        <p class="field-hint" style="margin-bottom:14px;">Recommended for this vehicle type &mdash; uncheck anything you don't want tracked. You can adjust individual items anytime after adding the vehicle.</p>
        <div class="choice-group" id="checklist-group">
          ${checklistStepHTML(null)}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="back-btn">Back</button>
          <button type="submit" class="btn btn-primary">Add vehicle</button>
        </div>
      </div>
    </form>
  `);

  wireChoiceGroups();
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);

  const vinInput = document.getElementById('v-vin');
  const vinStatus = document.getElementById('vin-status');
  document.getElementById('vin-decode-btn').addEventListener('click', async () => {
    const vin = vinInput.value.trim();
    if (!isValidVINFormat(vin)) {
      vinStatus.textContent = "That doesn't look like a valid 17-character VIN.";
      return;
    }
    vinStatus.textContent = 'Looking it up…';
    try {
      const result = await decodeVIN(vin);
      document.getElementById('v-year').value = result.year || document.getElementById('v-year').value;
      document.getElementById('v-make').value = result.make || document.getElementById('v-make').value;
      document.getElementById('v-model').value = result.model || document.getElementById('v-model').value;
      if (result.powertrain) {
        const radio = document.querySelector(`input[name="powertrain"][value="${result.powertrain}"]`);
        if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
        vinStatus.textContent = `Found it — filled in details and detected: ${result.powertrain}.`;
      } else {
        vinStatus.textContent = 'Found the vehicle, but could not determine the powertrain — please select it below.';
      }
    } catch (err) {
      vinStatus.textContent = err.message || 'Could not look up that VIN.';
    }
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    if (!document.getElementById('v-name').value.trim()) {
      document.getElementById('v-name').focus();
      return;
    }
    const powertrain = document.querySelector('input[name="powertrain"]:checked')?.value || null;
    document.getElementById('checklist-group').innerHTML = checklistStepHTML(powertrain);
    wireChoiceGroups();
    document.getElementById('wizard-step-1').style.display = 'none';
    document.getElementById('wizard-step-2').style.display = 'block';
    document.getElementById('step-dot-1').classList.remove('active');
    document.getElementById('step-dot-2').classList.add('active');
    step = 2;
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    document.getElementById('wizard-step-1').style.display = 'block';
    document.getElementById('wizard-step-2').style.display = 'none';
    document.getElementById('step-dot-1').classList.add('active');
    document.getElementById('step-dot-2').classList.remove('active');
    step = 1;
  });

  document.getElementById('vehicle-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (step !== 2) return; // Enter key on step 1 shouldn't submit early
    const recommendedServiceIds = Array.from(document.querySelectorAll('input[name="checklist-item"]:checked')).map(i => i.value);
    const vehicle = store.addVehicle({
      name: document.getElementById('v-name').value.trim() || 'My vehicle',
      vin: vinInput.value.trim(),
      year: document.getElementById('v-year').value.trim(),
      make: document.getElementById('v-make').value.trim(),
      model: document.getElementById('v-model').value.trim(),
      powertrain: document.querySelector('input[name="powertrain"]:checked')?.value || null,
      recommendedServiceIds,
      isPrimaryCommuter: document.querySelector('input[name="commuter"]:checked').value === 'yes',
      drivingFrequency: document.querySelector('input[name="frequency"]:checked').value,
      currentOdometer: document.getElementById('v-odometer').value || 0,
      odometerAsOfDate: document.getElementById('v-odometer-date').value || todayStr(),
    });
    closeModal();
    window.location.hash = `#/vehicle/${vehicle.id}/home`;
  });
}

function openEditVehicleModal(vehicleId) {
  const vehicle = store.getVehicle(vehicleId);
  if (!vehicle) return;

  openModal(`
    <div class="modal-header">
      <h2 class="modal-title">Edit vehicle</h2>
      <button class="modal-close" id="modal-close">&times;</button>
    </div>
    <form id="vehicle-form">
      <div class="field">
        <label for="v-name">Nickname</label>
        <input type="text" id="v-name" value="${escapeAttr(vehicle.name)}" required />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="v-year">Year</label>
          <input type="text" id="v-year" value="${escapeAttr(vehicle.year)}" />
        </div>
        <div class="field">
          <label for="v-make">Make</label>
          <input type="text" id="v-make" value="${escapeAttr(vehicle.make)}" />
        </div>
      </div>
      <div class="field">
        <label for="v-model">Model</label>
        <input type="text" id="v-model" value="${escapeAttr(vehicle.model)}" />
      </div>
      <div class="field">
        <label for="v-vin">VIN (optional)</label>
        <input type="text" id="v-vin" value="${escapeAttr(vehicle.vin || '')}" maxlength="17" style="text-transform:uppercase;" />
      </div>
      <div class="field">
        <label>Vehicle type</label>
        <div class="choice-group" id="powertrain-group">
          ${powertrainOptionsHTML(vehicle.powertrain)}
        </div>
      </div>
      <div class="field">
        <label>Is this the primary commuter?</label>
        <div class="choice-group" id="commuter-group">
          <label class="choice-option"><input type="radio" name="commuter" value="yes" ${vehicle.isPrimaryCommuter ? 'checked' : ''} /> Yes, driven most days</label>
          <label class="choice-option"><input type="radio" name="commuter" value="no" ${!vehicle.isPrimaryCommuter ? 'checked' : ''} /> No, it's a secondary vehicle</label>
        </div>
      </div>
      <div class="field">
        <label>How often does it get driven?</label>
        <div class="choice-group" id="frequency-group">
          <label class="choice-option"><input type="radio" name="frequency" value="daily" ${vehicle.drivingFrequency === 'daily' ? 'checked' : ''} /> Daily or almost daily</label>
          <label class="choice-option"><input type="radio" name="frequency" value="average" ${vehicle.drivingFrequency === 'average' ? 'checked' : ''} /> A few times a week</label>
          <label class="choice-option"><input type="radio" name="frequency" value="rarely" ${vehicle.drivingFrequency === 'rarely' ? 'checked' : ''} /> Occasionally / weekends only</label>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="v-odometer">Current odometer (mi)</label>
          <input type="number" id="v-odometer" value="${vehicle.currentOdometer}" min="0" />
        </div>
        <div class="field">
          <label for="v-odometer-date">As of</label>
          <input type="date" id="v-odometer-date" value="${vehicle.odometerAsOfDate}" />
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Save changes</button>
      </div>
    </form>
  `);

  wireChoiceGroups();
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('vehicle-form').addEventListener('submit', (e) => {
    e.preventDefault();
    store.updateVehicle(vehicleId, {
      name: document.getElementById('v-name').value.trim() || vehicle.name,
      vin: document.getElementById('v-vin').value.trim(),
      powertrain: document.querySelector('input[name="powertrain"]:checked')?.value || null,
      year: document.getElementById('v-year').value.trim(),
      make: document.getElementById('v-make').value.trim(),
      model: document.getElementById('v-model').value.trim(),
      isPrimaryCommuter: document.querySelector('input[name="commuter"]:checked').value === 'yes',
      drivingFrequency: document.querySelector('input[name="frequency"]:checked').value,
      currentOdometer: Number(document.getElementById('v-odometer').value) || 0,
      odometerAsOfDate: document.getElementById('v-odometer-date').value || todayStr(),
    });
    closeModal();
    router();
  });
}

function wireChoiceGroups() {
  document.querySelectorAll('.choice-group').forEach(group => {
    const sync = () => {
      group.querySelectorAll('.choice-option').forEach(opt => {
        const input = opt.querySelector('input');
        opt.classList.toggle('selected', input.checked);
      });
    };
    group.addEventListener('change', sync);
    sync();
  });
}

// ============================================================================
// Log service modal
// ============================================================================
function openLogServiceModal(vehicleId, preselectTypeId) {
  const vehicle = store.getVehicle(vehicleId);
  if (!vehicle) return;

  // Is this a repeat log of a previously-created recurring custom service?
  // (Its typeId won't be in the static catalog — it was generated on first log.)
  const isKnownType = SERVICE_TYPES.some(t => t.id === preselectTypeId);
  const isRepeatCustom = preselectTypeId && !isKnownType;
  let repeatCustomName = '';
  let repeatCustomLastEntry = null;
  if (isRepeatCustom) {
    const logs = vehicle.services.filter(s => s.typeId === preselectTypeId);
    repeatCustomLastEntry = logs.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
    repeatCustomName = repeatCustomLastEntry?.typeName || 'Custom service';
  }

  const typeOptionsHTML = isRepeatCustom
    ? `<option value="${preselectTypeId}" selected>🔧 ${escapeHTML(repeatCustomName)}</option>`
    : SERVICE_TYPES.map(t => `<option value="${t.id}" ${t.id === preselectTypeId ? 'selected' : ''}>${t.icon} ${t.name}</option>`).join('');

  openModal(`
    <div class="modal-header">
      <h2 class="modal-title">Log a service</h2>
      <button class="modal-close" id="modal-close">&times;</button>
    </div>
    <form id="service-form">
      <div class="field">
        <label for="s-type">Service type</label>
        <select id="s-type" ${isRepeatCustom ? 'disabled' : ''}>
          ${typeOptionsHTML}
        </select>
      </div>
      <div class="field" id="custom-name-field" style="display:none;">
        <label for="s-custom-name">Describe the service</label>
        <input type="text" id="s-custom-name" placeholder="e.g. Replaced serpentine belt" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="s-date">Date</label>
          <input type="date" id="s-date" value="${todayStr()}" required />
        </div>
        <div class="field">
          <label for="s-mileage">Mileage</label>
          <input type="number" id="s-mileage" value="${vehicle.currentOdometer}" min="0" required />
        </div>
      </div>
      <div class="field">
        <label for="s-cost">Cost (optional)</label>
        <input type="number" id="s-cost" placeholder="45.00" min="0" step="0.01" />
      </div>
      <div class="field">
        <label for="s-notes">Notes (optional)</label>
        <textarea id="s-notes" placeholder="Shop, parts used, anything worth remembering"></textarea>
      </div>
      <div class="field" id="reminder-field">
        <label>Remind me again in</label>
        <div class="field-row">
          <div class="field">
            <input type="number" id="s-interval-miles" placeholder="e.g. 5000" min="0" value="${repeatCustomLastEntry?.intervalMiles || ''}" />
            <p class="field-hint">miles</p>
          </div>
          <div class="field">
            <input type="number" id="s-interval-months" placeholder="e.g. 6" min="0" value="${repeatCustomLastEntry?.intervalMonths || ''}" />
            <p class="field-hint">months</p>
          </div>
        </div>
        <p class="field-hint">Leave both blank to log this as a one-time thing with no reminder. Set either (or both — whichever comes first wins) to track it going forward.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Save entry</button>
      </div>
    </form>
  `);

  const typeSelect = document.getElementById('s-type');
  const customField = document.getElementById('custom-name-field');
  const reminderField = document.getElementById('reminder-field');
  const syncFieldVisibility = () => {
    const isCustom = typeSelect.value === 'custom';
    customField.style.display = isCustom ? 'block' : 'none';
    // Only custom services (new or repeat) get manual interval fields —
    // catalog types use the automatic category-based schedule.
    reminderField.style.display = (isCustom || isRepeatCustom) ? 'block' : 'none';
  };
  typeSelect.addEventListener('change', syncFieldVisibility);
  syncFieldVisibility();

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('service-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const intervalMilesRaw = document.getElementById('s-interval-miles').value;
    const intervalMonthsRaw = document.getElementById('s-interval-months').value;
    const intervalMiles = intervalMilesRaw ? Number(intervalMilesRaw) : null;
    const intervalMonths = intervalMonthsRaw ? Number(intervalMonthsRaw) : null;

    let typeId, typeName;
    if (isRepeatCustom) {
      typeId = preselectTypeId;
      typeName = repeatCustomName;
    } else if (typeSelect.value === 'custom') {
      const customName = document.getElementById('s-custom-name').value.trim();
      if (!customName) {
        document.getElementById('s-custom-name').focus();
        return;
      }
      // Brand-new custom service — gets its own id so it can be tracked
      // separately from every other custom entry, not lumped together.
      typeId = `custom_${uid()}`;
      typeName = customName;
    } else {
      typeId = typeSelect.value;
      typeName = getServiceType(typeId).name;
    }

    store.addService(vehicleId, {
      typeId,
      typeName,
      date: document.getElementById('s-date').value,
      mileage: document.getElementById('s-mileage').value,
      cost: document.getElementById('s-cost').value,
      notes: document.getElementById('s-notes').value.trim(),
      intervalMiles,
      intervalMonths,
    });

    // A brand-new custom service only joins the tracked checklist if a
    // reminder interval was actually set — otherwise it's just a one-off
    // history entry, matching the "leave blank for one-time" hint above.
    if (!isRepeatCustom && typeId.startsWith('custom_') && (intervalMiles || intervalMonths)) {
      const fresh = store.getVehicle(vehicleId);
      // If recommendedServiceIds is empty, it's relying on the implicit
      // category-default fallback (older vehicles, or ones added before
      // this checklist feature existed) — materialize that list explicitly
      // before appending, so adding a custom item doesn't wipe out the
      // standard ones that were only "on" via the empty-array fallback.
      const baseIds = fresh.recommendedServiceIds != null
        ? fresh.recommendedServiceIds
        : getCategorySchedule(fresh.powertrain).map(s => s.typeId);
      store.updateVehicle(vehicleId, {
        recommendedServiceIds: [...baseIds, typeId],
      });
    }

    closeModal();
    router();
  });
}

// ============================================================================
// Backup / restore modal
// ============================================================================
function openBackupModal() {
  openModal(`
    <div class="modal-header">
      <h2 class="modal-title">Back up or restore</h2>
      <button class="modal-close" id="modal-close">&times;</button>
    </div>
    <p class="field-hint" style="margin-bottom:16px;">Your data lives only in this browser. Download a backup file before clearing your browser data or switching devices, and restore it here whenever you need to.</p>
    <div class="field">
      <button class="btn btn-secondary btn-block" id="download-backup-btn">Download backup file</button>
    </div>
    <div class="field">
      <label for="restore-input">Restore from a backup file</label>
      <input type="file" id="restore-input" accept="application/json" />
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" id="cancel-btn">Close</button>
    </div>
  `);

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('download-backup-btn').addEventListener('click', () => {
    const json = store.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carfolio-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  document.getElementById('restore-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const ok = await confirmDialog('Restoring will replace all data currently in this browser. Continue?', { title: 'Restore backup', confirmText: 'Restore', danger: true });
      if (!ok) return;
      try {
        store.importJSON(reader.result);
        closeModal();
        router();
      } catch (err) {
        await alertDialog(err.message || 'Could not read that backup file.', { title: 'Restore failed' });
      }
    };
    reader.readAsText(file);
  });
}

// ============================================================================
// Onboarding tour — one-time on first launch, replayable anytime from the
// "?" button in the header. Skip is visible immediately on every slide, and
// once dismissed (skipped or completed) it never triggers itself again.
// ============================================================================
const TOUR_SEEN_KEY = 'carfolio.tourSeen';
const ONBOARD_SLIDES = [
  { icon: '\uD83D\uDE97', title: 'Welcome to Carfolio', desc: 'One place to keep every car in the family running \u2014 what\u2019s due, what to glance at, and what it\u2019s costing.' },
  { icon: '\uD83E\uDDED', title: 'Your Home tab', desc: 'Always leads with the one thing to do next \u2014 no digging through menus to figure out what matters right now.' },
  { icon: '\uD83D\uDC40', title: 'Quick Checks', desc: 'The stuff a mechanic won\u2019t catch for you \u2014 coolant, tire pressure, lights. A couple minutes, every fill-up or two.' },
  { icon: '\uD83D\uDCB8', title: 'Budgeting', desc: 'See what maintenance actually costs per year, so nothing\u2019s a surprise.' },
];

function openOnboardingTour() {
  let step = 0;
  const onKey = (e) => { if (e.key === 'Escape') finish(); };
  document.addEventListener('keydown', onKey);

  function finish() {
    modalRoot.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch (e) { /* private browsing, etc. */ }
  }

  function render() {
    const s = ONBOARD_SLIDES[step];
    const isLast = step === ONBOARD_SLIDES.length - 1;
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal modal-small modal-tour" role="dialog" aria-modal="true">
          <button type="button" class="onboard-skip" id="onboard-skip">Skip</button>
          <div class="onboard-body">
            <div class="onboard-icon">${s.icon}</div>
            <h2 class="onboard-title">${escapeHTML(s.title)}</h2>
            <p class="onboard-desc">${escapeHTML(s.desc)}</p>
          </div>
          <div class="onboard-footer">
            <div class="onboard-dots">
              ${ONBOARD_SLIDES.map((_, i) => `<span class="onboard-dot ${i === step ? 'active' : ''}"></span>`).join('')}
            </div>
            <button type="button" class="btn btn-primary btn-block" id="onboard-next">${isLast ? 'Get started' : 'Next'}</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modal-backdrop') finish();
    });
    document.getElementById('onboard-skip').addEventListener('click', finish);
    document.getElementById('onboard-next').addEventListener('click', () => {
      if (isLast) { finish(); } else { step += 1; render(); }
    });
  }

  render();
}

function maybeShowOnboardingTour() {
  let seen = false;
  try { seen = localStorage.getItem(TOUR_SEEN_KEY) === '1'; } catch (e) { /* private browsing, etc. */ }
  if (!seen) openOnboardingTour();
}

// ============================================================================
// Utilities
// ============================================================================
function todayStr() {
  return localDateStr();
}
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
function escapeAttr(str) {
  return escapeHTML(str).replace(/"/g, '&quot;');
}

// ============================================================================
// Global wiring
// ============================================================================
document.getElementById('help-btn').addEventListener('click', openOnboardingTour);
document.getElementById('footer-backup-link').addEventListener('click', (e) => {
  e.preventDefault();
  openBackupModal();
});
window.addEventListener('DOMContentLoaded', maybeShowOnboardingTour);
