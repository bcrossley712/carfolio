// ============================================================================
// reminders.js — turns "every 5,000 miles" into an actual date, and defines
// what's recommended for a vehicle based on its powertrain category.
//
// Most people don't know their exact annual mileage, so we estimate it from
// two quick questions asked when a vehicle is added (primary commuter? how
// often is it driven?). That estimate converts every mileage-based interval
// into a calendar date under the hood, which is what makes calendar export
// and simple "due soon" badges possible without ever asking for real-time
// GPS or odometer syncing.
//
// Service intervals below are informed general guidance, not a specific
// manufacturer's published schedule (no free, durable API provides that —
// see PROJECT_NOTES.md for why). They vary by powertrain category, which
// is detected via optional VIN decode (see vehicle-lookup.js) or asked
// directly if no VIN is provided.
// ============================================================================

import { localDateStr } from './dateutil.js';

// Catalog of all known service types — names/icons only, no intervals here.
// Intervals live in CATEGORY_SCHEDULES since they vary by vehicle type.
export const SERVICE_CATALOG = {
  oil_change: { name: 'Oil change', icon: '🛢️' },
  tire_rotation: { name: 'Tire rotation', icon: '🔄' },
  air_filter: { name: 'Engine air filter', icon: '💨' },
  cabin_air_filter: { name: 'Cabin air filter', icon: '🌬️' },
  brake_service: { name: 'Brake inspection/service', icon: '🛑' },
  battery_12v: { name: '12V battery check', icon: '🔋' },
  ev_battery_health: { name: 'EV/hybrid battery health check', icon: '🔌' },
  coolant: { name: 'Coolant flush', icon: '❄️' },
  diesel_fuel_filter: { name: 'Diesel fuel filter', icon: '⛽' },
  wiper_blades: { name: 'Wiper blades', icon: '🌧️' },
  registration: { name: 'Registration renewal', icon: '📋' },
  inspection: { name: 'State inspection / emissions', icon: '✅' },
  custom: { name: 'Custom service', icon: '🔧' },
};

// The full dropdown list for logging a service (every catalog entry).
export const SERVICE_TYPES = Object.entries(SERVICE_CATALOG).map(([id, t]) => ({ id, ...t }));

export function getServiceType(id) {
  const entry = SERVICE_CATALOG[id];
  return entry ? { id, ...entry } : { id, ...SERVICE_CATALOG.custom };
}

// Recommended schedule per powertrain category. 'unknown' is the fallback
// used for vehicles added before this feature existed, or when someone
// picks "not sure" — it matches the original generic defaults so existing
// vehicles behave exactly as before.
export const CATEGORY_SCHEDULES = {
  gasoline: [
    { typeId: 'oil_change', intervalMiles: 5000, intervalMonths: 6 },
    { typeId: 'tire_rotation', intervalMiles: 6000, intervalMonths: 6 },
    { typeId: 'air_filter', intervalMiles: 15000, intervalMonths: 12 },
    { typeId: 'cabin_air_filter', intervalMiles: 12000, intervalMonths: 12 },
    { typeId: 'brake_service', intervalMiles: 12000, intervalMonths: 12 },
    { typeId: 'battery_12v', intervalMiles: null, intervalMonths: 24 },
    { typeId: 'coolant', intervalMiles: 30000, intervalMonths: 24 },
    { typeId: 'wiper_blades', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'registration', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'inspection', intervalMiles: null, intervalMonths: 12 },
  ],
  diesel: [
    { typeId: 'oil_change', intervalMiles: 7500, intervalMonths: 6 },
    { typeId: 'tire_rotation', intervalMiles: 6000, intervalMonths: 6 },
    { typeId: 'air_filter', intervalMiles: 15000, intervalMonths: 12 },
    { typeId: 'cabin_air_filter', intervalMiles: 12000, intervalMonths: 12 },
    { typeId: 'diesel_fuel_filter', intervalMiles: 15000, intervalMonths: 12 },
    { typeId: 'brake_service', intervalMiles: 12000, intervalMonths: 12 },
    { typeId: 'battery_12v', intervalMiles: null, intervalMonths: 24 },
    { typeId: 'coolant', intervalMiles: 30000, intervalMonths: 24 },
    { typeId: 'wiper_blades', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'registration', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'inspection', intervalMiles: null, intervalMonths: 12 },
  ],
  hybrid: [
    { typeId: 'oil_change', intervalMiles: 7500, intervalMonths: 6 },
    { typeId: 'tire_rotation', intervalMiles: 6000, intervalMonths: 6 },
    { typeId: 'air_filter', intervalMiles: 15000, intervalMonths: 12 },
    { typeId: 'cabin_air_filter', intervalMiles: 12000, intervalMonths: 12 },
    { typeId: 'brake_service', intervalMiles: 20000, intervalMonths: 24 },
    { typeId: 'battery_12v', intervalMiles: null, intervalMonths: 24 },
    { typeId: 'ev_battery_health', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'coolant', intervalMiles: 30000, intervalMonths: 24 },
    { typeId: 'wiper_blades', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'registration', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'inspection', intervalMiles: null, intervalMonths: 12 },
  ],
  electric: [
    { typeId: 'tire_rotation', intervalMiles: 6000, intervalMonths: 6 },
    { typeId: 'cabin_air_filter', intervalMiles: 12000, intervalMonths: 12 },
    { typeId: 'brake_service', intervalMiles: 20000, intervalMonths: 24 },
    { typeId: 'battery_12v', intervalMiles: null, intervalMonths: 24 },
    { typeId: 'ev_battery_health', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'coolant', intervalMiles: 50000, intervalMonths: 48 },
    { typeId: 'wiper_blades', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'registration', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'inspection', intervalMiles: null, intervalMonths: 12 },
  ],
  unknown: [
    { typeId: 'oil_change', intervalMiles: 5000, intervalMonths: 6 },
    { typeId: 'tire_rotation', intervalMiles: 6000, intervalMonths: 6 },
    { typeId: 'air_filter', intervalMiles: 15000, intervalMonths: 12 },
    { typeId: 'brake_service', intervalMiles: 12000, intervalMonths: 12 },
    { typeId: 'battery_12v', intervalMiles: null, intervalMonths: 24 },
    { typeId: 'coolant', intervalMiles: 30000, intervalMonths: 24 },
    { typeId: 'wiper_blades', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'registration', intervalMiles: null, intervalMonths: 12 },
    { typeId: 'inspection', intervalMiles: null, intervalMonths: 12 },
  ],
};

export function getCategorySchedule(powertrain) {
  return CATEGORY_SCHEDULES[powertrain] || CATEGORY_SCHEDULES.unknown;
}

function getDefaultInterval(vehicle, typeId) {
  const schedule = getCategorySchedule(vehicle.powertrain);
  const entry = schedule.find(s => s.typeId === typeId);
  return entry
    ? { intervalMiles: entry.intervalMiles, intervalMonths: entry.intervalMonths }
    : { intervalMiles: null, intervalMonths: null };
}

// Estimated annual mileage based on the quick questionnaire.
const FREQUENCY_TO_ANNUAL_MILES = {
  daily: 12000,   // primary commuter, driven most days
  average: 6000,  // driven a few times a week
  rarely: 2500,   // occasional / weekend use
};

export function estimateAnnualMileage(vehicle) {
  const base = FREQUENCY_TO_ANNUAL_MILES[vehicle.drivingFrequency] || FREQUENCY_TO_ANNUAL_MILES.average;
  // A primary commuter nudges the estimate up a bit even within the same frequency bucket.
  return vehicle.isPrimaryCommuter ? Math.round(base * 1.1) : base;
}

function milesPerDay(vehicle) {
  return estimateAnnualMileage(vehicle) / 365;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

// Given a vehicle and a completed (or never-done) service, compute:
// - dueDate: best estimate of when the next one is due
// - percentElapsed: 0-1+ (over 1 means overdue), used to drive the gauge
// - status: 'ok' | 'soon' | 'overdue'
export function computeReminder(vehicle, serviceTypeId, lastService) {
  const type = getServiceType(serviceTypeId);
  const defaults = getDefaultInterval(vehicle, serviceTypeId);
  const intervalMiles = lastService?.intervalMiles ?? defaults.intervalMiles;
  const intervalMonths = lastService?.intervalMonths ?? defaults.intervalMonths;

  const lastDate = lastService?.date || (vehicle.createdAt ? localDateStr(new Date(vehicle.createdAt)) : localDateStr());
  const lastMileage = lastService?.mileage ?? vehicle.currentOdometer ?? 0;

  let dueDateFromMiles = null;
  if (intervalMiles) {
    const mpd = milesPerDay(vehicle) || 1;
    const daysUntilMileageDue = intervalMiles / mpd;
    dueDateFromMiles = addDays(lastDate, daysUntilMileageDue);
  }

  let dueDateFromTime = null;
  if (intervalMonths) {
    dueDateFromTime = addMonths(lastDate, intervalMonths);
  }

  // Whichever comes first wins — matches how real maintenance schedules work.
  let dueDate;
  if (dueDateFromMiles && dueDateFromTime) {
    dueDate = dueDateFromMiles < dueDateFromTime ? dueDateFromMiles : dueDateFromTime;
  } else {
    dueDate = dueDateFromMiles || dueDateFromTime || addMonths(lastDate, 12);
  }

  const today = localDateStr();
  const totalWindowDays = Math.max(daysBetween(lastDate, dueDate), 1);
  const elapsedDays = daysBetween(lastDate, today);
  const percentElapsed = Math.max(0, elapsedDays / totalWindowDays);

  let status = 'ok';
  if (percentElapsed >= 1) status = 'overdue';
  else if (percentElapsed >= 0.8) status = 'soon';

  const estimatedDueMileage = intervalMiles ? lastMileage + intervalMiles : null;

  return {
    typeId: type.id,
    typeName: (lastService && lastService.typeName) || type.name,
    icon: type.icon,
    dueDate,
    estimatedDueMileage,
    percentElapsed,
    status,
    intervalMiles,
    intervalMonths,
    intervalDays: totalWindowDays,
  };
}

// Build the list of "next due" reminders for a vehicle: one per service type
// that has ever been logged, based on the most recent entry of each type.
// Used for the dashboard gauge, which needs a real "last serviced" date.
export function getVehicleReminders(vehicle) {
  const byType = {};
  for (const s of vehicle.services) {
    if (!byType[s.typeId] || s.date > byType[s.typeId].date) {
      byType[s.typeId] = s;
    }
  }
  return Object.keys(byType).map(typeId => computeReminder(vehicle, typeId, byType[typeId]));
}

// The single most urgent reminder for a vehicle, used for the dashboard gauge.
export function getPrimaryReminder(vehicle) {
  const reminders = getVehicleReminders(vehicle);
  if (reminders.length === 0) return null;
  return reminders.slice().sort((a, b) => b.percentElapsed - a.percentElapsed)[0];
}

// The full maintenance checklist for a vehicle: every recommended service,
// including ones never logged yet (shown as "not started" rather than
// omitted entirely) — this is what answers "where do I stand on maintaining
// this vehicle," not just "what's overdue."
export function getVehicleChecklist(vehicle) {
  const recommendedIds = vehicle.recommendedServiceIds != null
    ? vehicle.recommendedServiceIds
    : getCategorySchedule(vehicle.powertrain).map(s => s.typeId);

  const items = recommendedIds.map(typeId => {
    const logs = vehicle.services.filter(s => s.typeId === typeId);
    if (logs.length === 0) {
      const catalog = getServiceType(typeId);
      return { typeId, typeName: catalog.name, icon: catalog.icon, status: 'unlogged', percentElapsed: 0 };
    }
    const last = logs.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return computeReminder(vehicle, typeId, last);
  });

  return items.sort((a, b) => {
    if (a.status === 'unlogged' && b.status !== 'unlogged') return 1;
    if (b.status === 'unlogged' && a.status !== 'unlogged') return -1;
    return b.percentElapsed - a.percentElapsed;
  });
}

// ============================================================================
// Cost / budgeting
// ============================================================================

// Actual $ spent — no smoothing, exactly what was logged. Used for the
// "this year" / "all time" figures and the year-by-year history list.
export function getCostHistory(vehicle) {
  const byYear = {};
  let allTime = 0;
  for (const s of vehicle.services) {
    if (s.cost == null) continue;
    allTime += s.cost;
    const year = s.date.slice(0, 4);
    byYear[year] = (byYear[year] || 0) + s.cost;
  }
  const currentYear = localDateStr().slice(0, 4);
  const years = Object.keys(byYear).sort((a, b) => b - a); // newest first
  return {
    thisYear: byYear[currentYear] || 0,
    allTime,
    byYear: years.map(year => ({ year, total: byYear[year] })),
  };
}

// Estimated annual budget: for every service type with a real recurring
// interval (from the category schedule, or a custom service's own
// interval) and at least one logged cost, spreads its average cost across
// that interval to get a $/year figure, summed across types. A $600 tire
// replacement every 5 years becomes "$120/year," which is what's actually
// useful for setting aside money — instead of one alarming spike in a
// single year's actual total.
//
// One-time entries (no interval ever set) are left out here — there's no
// basis to predict them forward — but they still count in getCostHistory.
export function getAnnualBudgetEstimate(vehicle) {
  const byType = {};
  for (const s of vehicle.services) {
    (byType[s.typeId] = byType[s.typeId] || []).push(s);
  }

  const breakdown = [];
  for (const [typeId, logs] of Object.entries(byType)) {
    const costed = logs.filter(s => s.cost != null);
    if (costed.length === 0) continue;

    const last = logs.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const reminder = computeReminder(vehicle, typeId, last);
    // Only annualize items with a genuine interval — computeReminder falls
    // back to a 12-month window internally when neither is set, which
    // would wrongly treat a one-time cost as a recurring yearly one.
    if (!reminder.intervalMiles && !reminder.intervalMonths) continue;

    const avgCost = costed.reduce((sum, s) => sum + s.cost, 0) / costed.length;
    const annualCost = avgCost * (365 / reminder.intervalDays);
    const catalog = getServiceType(typeId);

    breakdown.push({
      typeId,
      typeName: last.typeName || catalog.name,
      icon: catalog.icon,
      avgCost,
      intervalDays: reminder.intervalDays,
      annualCost,
    });
  }

  breakdown.sort((a, b) => b.annualCost - a.annualCost);
  const total = breakdown.reduce((sum, b) => sum + b.annualCost, 0);
  return { total, breakdown };
}

export function formatDueDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
