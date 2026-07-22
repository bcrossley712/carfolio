// ============================================================================
// quickchecks.js — the stuff a mechanic won't catch for you.
//
// Different in kind from the maintenance checklist: no mileage math, no
// interval schedule, just "does someone glance at this every so often."
// Status is driven by elapsed days since last checked, with a loose grace
// window rather than a strict monthly deadline — roughly "every fill-up
// or two" without pretending the app knows anyone's fuel schedule.
// ============================================================================

import { localDateStr } from './dateutil.js';

export const QUICK_CHECK_TYPES = [
  { id: 'coolant', name: 'Coolant', icon: '🌡️', tip: 'Check the reservoir tank (not the radiator cap) when the engine is cold — level should sit between MIN and MAX.' },
  { id: 'oil_level', name: 'Oil level', icon: '🛢️', tip: 'Pull the dipstick, wipe it, reinsert, then check the level and whether the oil looks clean or dark and gritty.' },
  { id: 'tire_pressure', name: 'Tire pressure', icon: '🛞', tip: 'Check all four tires plus the spare. Use the PSI on the door-jamb sticker, not the number on the tire itself.' },
  { id: 'tire_tread', name: 'Tire tread', icon: '👟', tip: 'Penny test: insert a penny into the tread head-first. If you can see the top of Lincoln\u2019s head, it\u2019s time to replace.' },
  { id: 'washer_fluid', name: 'Washer fluid', icon: '💧', tip: 'Top off the washer fluid reservoir under the hood \u2014 cheap and easy to forget.' },
  { id: 'wiper_blades', name: 'Wiper blades', icon: '🌧️', tip: 'Run the wipers \u2014 streaking or chattering means the blades are due for a swap.' },
  { id: 'lights', name: 'Lights', icon: '💡', tip: 'Check headlights, brake lights, and turn signals. Easiest with a second person, or facing a reflective surface.' },
  { id: 'dash_warnings', name: 'Dashboard warning lights', icon: '⚠️', tip: 'Start the car and look for any warning lights lit up that shouldn\u2019t be.' },
  { id: 'battery', name: 'Battery terminals', icon: '🔋', tip: 'Look at the battery terminals for white or greenish corrosion buildup.' },
];

function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

// Grace windows: green under ~30 days, amber 30-60, rust past 60 (or never
// checked at all). Loosely matches "every fill-up or two" without needing
// to know anyone's actual driving/fueling schedule.
export function getQuickCheckStatus(lastCheckedDate) {
  if (!lastCheckedDate) return { status: 'rust', daysSince: null };
  const daysSince = Math.max(0, daysBetween(lastCheckedDate, localDateStr()));
  let status = 'ok';
  if (daysSince >= 60) status = 'rust';
  else if (daysSince >= 30) status = 'amber';
  return { status, daysSince };
}

// Merges the fixed catalog with a vehicle's own last-checked state.
export function getVehicleQuickChecks(vehicle) {
  const state = vehicle.quickChecks || {};
  return QUICK_CHECK_TYPES.map(type => {
    const lastCheckedDate = state[type.id]?.lastCheckedDate || null;
    const { status, daysSince } = getQuickCheckStatus(lastCheckedDate);
    return { ...type, lastCheckedDate, daysSince, status };
  });
}

// Section-level status is driven by the stalest item, not an average, so a
// neglected item can't hide behind the others being current.
export function getQuickChecksStatus(vehicle) {
  const items = getVehicleQuickChecks(vehicle);
  if (items.some(i => i.status === 'rust')) return 'rust';
  if (items.some(i => i.status === 'amber')) return 'amber';
  return 'ok';
}
