// ============================================================================
// reminders.js — turns "every 5,000 miles" into an actual date.
//
// Most people don't know their exact annual mileage, so we estimate it from
// two quick questions asked when a vehicle is added (primary commuter? how
// often is it driven?). That estimate converts every mileage-based interval
// into a calendar date under the hood, which is what makes calendar export
// and simple "due soon" badges possible without ever asking for real-time
// GPS or odometer syncing.
// ============================================================================

// Common service types with sensible default intervals.
// intervalMiles / intervalMonths: whichever comes first triggers the reminder.
export const SERVICE_TYPES = [
  { id: 'oil_change', name: 'Oil change', icon: '🛢️', intervalMiles: 5000, intervalMonths: 6 },
  { id: 'tire_rotation', name: 'Tire rotation', icon: '🔄', intervalMiles: 6000, intervalMonths: 6 },
  { id: 'air_filter', name: 'Air filter', icon: '💨', intervalMiles: 15000, intervalMonths: 12 },
  { id: 'brake_service', name: 'Brake inspection/service', icon: '🛑', intervalMiles: 12000, intervalMonths: 12 },
  { id: 'battery', name: 'Battery check', icon: '🔋', intervalMiles: null, intervalMonths: 24 },
  { id: 'coolant', name: 'Coolant flush', icon: '❄️', intervalMiles: 30000, intervalMonths: 24 },
  { id: 'wiper_blades', name: 'Wiper blades', icon: '🌧️', intervalMiles: null, intervalMonths: 12 },
  { id: 'registration', name: 'Registration renewal', icon: '📋', intervalMiles: null, intervalMonths: 12 },
  { id: 'inspection', name: 'State inspection / emissions', icon: '✅', intervalMiles: null, intervalMonths: 12 },
  { id: 'custom', name: 'Custom service', icon: '🔧', intervalMiles: null, intervalMonths: null },
];

export function getServiceType(id) {
  return SERVICE_TYPES.find(t => t.id === id) || SERVICE_TYPES[SERVICE_TYPES.length - 1];
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
  const intervalMiles = lastService?.intervalMiles ?? type.intervalMiles;
  const intervalMonths = lastService?.intervalMonths ?? type.intervalMonths;

  const lastDate = lastService?.date || vehicle.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
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

  const today = new Date().toISOString().slice(0, 10);
  const totalWindowDays = Math.max(daysBetween(lastDate, dueDate), 1);
  const elapsedDays = daysBetween(lastDate, today);
  const percentElapsed = Math.max(0, elapsedDays / totalWindowDays);

  let status = 'ok';
  if (percentElapsed >= 1) status = 'overdue';
  else if (percentElapsed >= 0.8) status = 'soon';

  const estimatedDueMileage = intervalMiles ? lastMileage + intervalMiles : null;

  return {
    typeId: type.id,
    typeName: type.name,
    icon: type.icon,
    dueDate,
    estimatedDueMileage,
    percentElapsed,
    status,
    intervalMiles,
    intervalMonths,
  };
}

// Build the list of "next due" reminders for a vehicle: one per service type
// that has ever been logged, based on the most recent entry of each type.
// Types never logged aren't shown until first logged, keeping the list
// relevant instead of a wall of defaults.
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

export function formatDueDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
