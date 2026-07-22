// ============================================================================
// store.js — Carfolio's data layer.
//
// Everything the app knows lives here. Right now it reads/writes the
// browser's localStorage, which means each family member's data stays on
// their own device, with no account and no server.
//
// FUTURE BACKEND HOOK:
// If you ever add optional cloud backup (e.g. a Cloudflare Worker + KV,
// as discussed), that piece should live ALONGSIDE this file, not replace it.
// The pattern would be:
//   1. Keep every function below exactly as-is (local is always the source
//      of truth the app reads from instantly, with no network wait).
//   2. Add a separate backup.js with pushBackup(data) / pullBackup(code)
//      that calls your Worker's HTTP endpoint.
//   3. Call pushBackup() after writes, on a timer, or on a manual
//      "Back up now" button — never make rendering wait on it.
// This keeps the backend purely additive: if it disappears, nothing here
// breaks, because this file never depended on it.
// ============================================================================

import { localDateStr } from './dateutil.js';
import { getCategorySchedule } from './reminders.js';

const STORAGE_KEY = 'carfolio.v1';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { vehicles: [] };
    const parsed = JSON.parse(raw);
    if (!parsed.vehicles) parsed.vehicles = [];
    return parsed;
  } catch (err) {
    console.error('Carfolio: could not read local data, starting fresh.', err);
    return { vehicles: [] };
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('Carfolio: could not save local data.', err);
    return false;
  }
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const store = {
  // ---- Vehicles ----
  getVehicles() {
    return readAll().vehicles;
  },

  getVehicle(id) {
    return readAll().vehicles.find(v => v.id === id) || null;
  },

  addVehicle(vehicle) {
    const data = readAll();
    const newVehicle = {
      id: uid(),
      name: vehicle.name,
      year: vehicle.year || '',
      make: vehicle.make || '',
      model: vehicle.model || '',
      vin: vehicle.vin || '',
      powertrain: vehicle.powertrain || null, // 'gasoline' | 'diesel' | 'hybrid' | 'electric' | null (unknown)
      recommendedServiceIds: vehicle.recommendedServiceIds || [],
      isPrimaryCommuter: !!vehicle.isPrimaryCommuter,
      drivingFrequency: vehicle.drivingFrequency || 'average', // 'daily' | 'average' | 'rarely'
      currentOdometer: Number(vehicle.currentOdometer) || 0,
      odometerAsOfDate: vehicle.odometerAsOfDate || localDateStr(),
      createdAt: new Date().toISOString(),
      services: [], // array of { id, typeId, typeName, date, mileage, cost, notes, intervalMiles, intervalMonths }
    };
    data.vehicles.push(newVehicle);
    writeAll(data);
    return newVehicle;
  },

  updateVehicle(id, updates) {
    const data = readAll();
    const v = data.vehicles.find(v => v.id === id);
    if (!v) return null;
    Object.assign(v, updates);
    writeAll(data);
    return v;
  },

  // Removes a single service type from the tracked checklist. If the
  // vehicle has never had recommendedServiceIds explicitly set (older
  // vehicles, or ones relying on the implicit category default), this
  // materializes that default list first so the removal has something
  // real to subtract from — otherwise there'd be nothing to distinguish
  // "never customized" from "customized down to zero."
  untrackService(id, typeId) {
    const data = readAll();
    const v = data.vehicles.find(v => v.id === id);
    if (!v) return null;
    const current = v.recommendedServiceIds != null
      ? v.recommendedServiceIds
      : getCategorySchedule(v.powertrain).map(s => s.typeId);
    v.recommendedServiceIds = current.filter(t => t !== typeId);
    writeAll(data);
    return v;
  },

  deleteVehicle(id) {
    const data = readAll();
    data.vehicles = data.vehicles.filter(v => v.id !== id);
    writeAll(data);
  },

  // ---- Service entries ----
  addService(vehicleId, entry) {
    const data = readAll();
    const v = data.vehicles.find(v => v.id === vehicleId);
    if (!v) return null;
    const newEntry = {
      id: uid(),
      typeId: entry.typeId,
      typeName: entry.typeName,
      date: entry.date,
      mileage: Number(entry.mileage) || 0,
      cost: entry.cost === '' || entry.cost == null ? null : Number(entry.cost),
      notes: entry.notes || '',
      intervalMiles: entry.intervalMiles || null,
      intervalMonths: entry.intervalMonths || null,
    };
    v.services.push(newEntry);
    // keep the vehicle's known odometer current if this entry is newer
    if (newEntry.mileage > (v.currentOdometer || 0)) {
      v.currentOdometer = newEntry.mileage;
      v.odometerAsOfDate = newEntry.date;
    }
    writeAll(data);
    return newEntry;
  },

  deleteService(vehicleId, serviceId) {
    const data = readAll();
    const v = data.vehicles.find(v => v.id === vehicleId);
    if (!v) return;
    v.services = v.services.filter(s => s.id !== serviceId);
    writeAll(data);
  },

  // ---- Backup / restore (local file, always available regardless of any backend) ----
  exportJSON() {
    return JSON.stringify(readAll(), null, 2);
  },

  importJSON(jsonString) {
    const parsed = JSON.parse(jsonString);
    if (!parsed || !Array.isArray(parsed.vehicles)) {
      throw new Error('That file doesn\'t look like a Carfolio backup.');
    }
    writeAll(parsed);
  },
};
