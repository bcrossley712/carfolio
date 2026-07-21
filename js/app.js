import { store } from './store.js';
import { SERVICE_TYPES, getServiceType, getVehicleReminders, getPrimaryReminder, formatDueDate, estimateAnnualMileage } from './reminders.js';
import { renderGauge, gaugeLabel } from './gauge.js';
import { buildICS, downloadICS } from './ics.js';
import { confirmDialog, alertDialog } from './dialogs.js';
import { initPWA } from './pwa.js';

initPWA();

const appEl = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');

// ============================================================================
// Router — simple hash-based routing, no framework, no build step.
// ============================================================================
function router() {
  const hash = window.location.hash || '#/';
  const vehicleMatch = hash.match(/^#\/vehicle\/([^/]+)$/);
  if (vehicleMatch) {
    renderVehicleDetail(vehicleMatch[1]);
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

  appEl.innerHTML = `
    <div class="vehicle-grid">
      ${vehicles.map(v => vehicleCardHTML(v)).join('')}
    </div>
  `;

  vehicles.forEach(v => {
    document.getElementById(`card-${v.id}`).addEventListener('click', () => {
      window.location.hash = `#/vehicle/${v.id}`;
    });
  });
}

function vehicleCardHTML(vehicle) {
  const reminder = getPrimaryReminder(vehicle);
  const status = reminder ? reminder.status : 'empty';
  const percent = reminder ? reminder.percentElapsed : 0;
  const statusClass = status === 'overdue' ? 'status-rust' : status === 'soon' ? 'status-amber' : status === 'empty' ? 'status-empty' : '';
  const statusText = !reminder
    ? 'No services logged yet'
    : status === 'overdue'
      ? `${reminder.typeName} overdue`
      : `${reminder.typeName} due ${formatDueDate(reminder.dueDate)}`;

  const sub = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');

  return `
    <article class="vehicle-card" id="card-${vehicle.id}" tabindex="0">
      <div class="vehicle-card-top">
        <div class="gauge-wrap">
          ${renderGauge(percent, status)}
          <div class="gauge-label">${gaugeLabel(status, percent)}</div>
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
// Vehicle detail
// ============================================================================
function renderVehicleDetail(vehicleId) {
  const vehicle = store.getVehicle(vehicleId);
  if (!vehicle) {
    window.location.hash = '#/';
    return;
  }

  const reminders = getVehicleReminders(vehicle).sort((a, b) => b.percentElapsed - a.percentElapsed);
  const history = vehicle.services.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const sub = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  const annualEstimate = estimateAnnualMileage(vehicle);

  appEl.innerHTML = `
    <a href="#/" class="back-link">&larr; All vehicles</a>
    <div class="detail-header">
      <div>
        <h1 class="detail-title">${escapeHTML(vehicle.name)}</h1>
        <p class="detail-sub">${escapeHTML(sub || 'No details added')} &middot; ${vehicle.currentOdometer.toLocaleString()} mi as of ${formatDueDate(vehicle.odometerAsOfDate)} &middot; ~${annualEstimate.toLocaleString()} mi/yr estimated</p>
      </div>
      <div class="detail-actions">
        <button class="btn btn-secondary" id="edit-vehicle-btn">Edit vehicle</button>
        <button class="btn btn-primary" id="log-service-btn">Log service</button>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">Upcoming reminders</h3>
      ${reminders.length === 0
        ? `<p class="field-hint">Log a service below and Carfolio will start estimating what's due next.</p>`
        : `<div class="reminder-list">${reminders.map(r => reminderRowHTML(vehicle, r)).join('')}</div>`
      }
    </div>

    <div class="section">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <h3 class="section-title">Service history</h3>
      </div>
      ${history.length === 0
        ? `<p class="field-hint">No services logged yet.</p>`
        : `<div class="history-list">${history.map(h => historyRowHTML(vehicle, h)).join('')}</div>`
      }
    </div>

    <div class="section">
      <button class="btn btn-danger" id="delete-vehicle-btn">Delete this vehicle</button>
    </div>
  `;

  document.getElementById('log-service-btn').addEventListener('click', () => openLogServiceModal(vehicle.id));
  document.getElementById('edit-vehicle-btn').addEventListener('click', () => openEditVehicleModal(vehicle.id));
  document.getElementById('delete-vehicle-btn').addEventListener('click', async () => {
    const ok = await confirmDialog(
      `Delete ${escapeHTML(vehicle.name)} and all its service history? This can't be undone.`,
      { title: 'Delete vehicle', confirmText: 'Delete', danger: true }
    );
    if (ok) {
      store.deleteVehicle(vehicle.id);
      window.location.hash = '#/';
    }
  });

  reminders.forEach(r => {
    const btn = document.getElementById(`ics-${r.typeId}`);
    if (btn) {
      btn.addEventListener('click', () => {
        const ics = buildICS({
          title: `${vehicle.name}: ${r.typeName}`,
          description: `Estimated by Carfolio based on your driving habits. Update the date in your calendar if you know the exact due date.`,
          dueDate: r.dueDate,
          uidSeed: `${vehicle.id}-${r.typeId}-${r.dueDate}`,
        });
        downloadICS(`${vehicle.name.replace(/\s+/g, '_')}-${r.typeId}.ics`, ics);
      });
    }
  });

  history.forEach(h => {
    const btn = document.getElementById(`delete-history-${h.id}`);
    if (btn) {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog('Delete this service record?', { title: 'Delete entry', confirmText: 'Delete', danger: true });
        if (ok) {
          store.deleteService(vehicle.id, h.id);
          renderVehicleDetail(vehicle.id);
        }
      });
    }
  });
}

function reminderRowHTML(vehicle, r) {
  const dueClass = r.status === 'overdue' ? 'due-rust' : r.status === 'soon' ? 'due-amber' : '';
  const dueText = r.status === 'overdue' ? `Overdue since ${formatDueDate(r.dueDate)}` : `Due ${formatDueDate(r.dueDate)}`;
  const mileageText = r.estimatedDueMileage ? ` (~${r.estimatedDueMileage.toLocaleString()} mi)` : '';
  return `
    <div class="reminder-row">
      <div class="gauge-wrap" style="width:48px;height:48px;">
        ${renderGauge(r.percentElapsed, r.status)}
      </div>
      <div class="reminder-row-info">
        <div class="reminder-row-name">${r.icon} ${escapeHTML(r.typeName)}</div>
        <div class="reminder-row-due ${dueClass}">${dueText}${mileageText}</div>
      </div>
      <div class="reminder-row-actions">
        <button class="btn btn-secondary" id="ics-${r.typeId}">Add to calendar</button>
      </div>
    </div>
  `;
}

function historyRowHTML(vehicle, entry) {
  const type = getServiceType(entry.typeId);
  const costText = entry.cost != null ? `$${entry.cost.toLocaleString()}` : '';
  return `
    <div class="history-row">
      <div class="history-row-icon">${type.icon}</div>
      <div class="history-row-info">
        <div class="history-row-name">${escapeHTML(entry.typeName)}</div>
        <div class="history-row-meta">
          <span>${formatDueDate(entry.date)}</span>
          <span class="mono">${entry.mileage.toLocaleString()} mi</span>
        </div>
        ${entry.notes ? `<div class="history-row-notes">${escapeHTML(entry.notes)}</div>` : ''}
      </div>
      <div class="history-row-cost">${costText}</div>
      <button class="btn btn-ghost" id="delete-history-${entry.id}" aria-label="Delete entry">✕</button>
    </div>
  `;
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
function openAddVehicleModal() {
  openModal(`
    <div class="modal-header">
      <h2 class="modal-title">Add a vehicle</h2>
      <button class="modal-close" id="modal-close">&times;</button>
    </div>
    <form id="vehicle-form">
      <div class="field">
        <label for="v-name">Nickname</label>
        <input type="text" id="v-name" placeholder="e.g. Mom's Civic" required />
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
        <button type="submit" class="btn btn-primary">Add vehicle</button>
      </div>
    </form>
  `);

  wireChoiceGroups();
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('vehicle-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const vehicle = store.addVehicle({
      name: document.getElementById('v-name').value.trim() || 'My vehicle',
      year: document.getElementById('v-year').value.trim(),
      make: document.getElementById('v-make').value.trim(),
      model: document.getElementById('v-model').value.trim(),
      isPrimaryCommuter: document.querySelector('input[name="commuter"]:checked').value === 'yes',
      drivingFrequency: document.querySelector('input[name="frequency"]:checked').value,
      currentOdometer: document.getElementById('v-odometer').value || 0,
      odometerAsOfDate: document.getElementById('v-odometer-date').value || todayStr(),
    });
    closeModal();
    window.location.hash = `#/vehicle/${vehicle.id}`;
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
      year: document.getElementById('v-year').value.trim(),
      make: document.getElementById('v-make').value.trim(),
      model: document.getElementById('v-model').value.trim(),
      isPrimaryCommuter: document.querySelector('input[name="commuter"]:checked').value === 'yes',
      drivingFrequency: document.querySelector('input[name="frequency"]:checked').value,
      currentOdometer: Number(document.getElementById('v-odometer').value) || 0,
      odometerAsOfDate: document.getElementById('v-odometer-date').value || todayStr(),
    });
    closeModal();
    renderVehicleDetail(vehicleId);
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
function openLogServiceModal(vehicleId) {
  const vehicle = store.getVehicle(vehicleId);
  if (!vehicle) return;

  openModal(`
    <div class="modal-header">
      <h2 class="modal-title">Log a service</h2>
      <button class="modal-close" id="modal-close">&times;</button>
    </div>
    <form id="service-form">
      <div class="field">
        <label for="s-type">Service type</label>
        <select id="s-type">
          ${SERVICE_TYPES.map(t => `<option value="${t.id}">${t.icon} ${t.name}</option>`).join('')}
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
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Save entry</button>
      </div>
    </form>
  `);

  const typeSelect = document.getElementById('s-type');
  const customField = document.getElementById('custom-name-field');
  typeSelect.addEventListener('change', () => {
    customField.style.display = typeSelect.value === 'custom' ? 'block' : 'none';
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('service-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const typeId = typeSelect.value;
    const type = getServiceType(typeId);
    const customName = document.getElementById('s-custom-name').value.trim();
    store.addService(vehicleId, {
      typeId,
      typeName: typeId === 'custom' && customName ? customName : type.name,
      date: document.getElementById('s-date').value,
      mileage: document.getElementById('s-mileage').value,
      cost: document.getElementById('s-cost').value,
      notes: document.getElementById('s-notes').value.trim(),
      intervalMiles: type.intervalMiles,
      intervalMonths: type.intervalMonths,
    });
    closeModal();
    renderVehicleDetail(vehicleId);
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
// Utilities
// ============================================================================
function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
document.getElementById('add-vehicle-btn').addEventListener('click', openAddVehicleModal);
document.getElementById('footer-backup-link').addEventListener('click', (e) => {
  e.preventDefault();
  openBackupModal();
});
