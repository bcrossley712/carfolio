// ============================================================================
// vehicle-lookup.js — optional VIN decoding via NHTSA's free vPIC API.
// No key required, no rate-limit headaches for personal use — this is a
// stable, long-running U.S. government API, which is why it's the one live
// network dependency wired into vehicle setup. Everything else in Carfolio
// works fully offline. If this call fails (no internet, API down, invalid
// VIN), setup still works fine via manual entry — this is purely additive.
// ============================================================================

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i; // VIN spec excludes I, O, Q

export function isValidVINFormat(vin) {
  return VIN_REGEX.test((vin || '').trim());
}

export async function decodeVIN(vin) {
  const clean = (vin || '').trim().toUpperCase();
  if (!isValidVINFormat(clean)) {
    throw new Error("That doesn't look like a valid 17-character VIN.");
  }

  const url = `https://vpic.nhtsa.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(clean)}?format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Could not reach the vehicle lookup service. You can still fill this in manually.');
  }
  const data = await res.json();
  const r = data && data.Results && data.Results[0];
  if (!r || (!r.Make && !r.Model)) {
    throw new Error('No data found for that VIN. You can still fill this in manually.');
  }

  return {
    year: r.ModelYear || '',
    make: r.Make || '',
    model: r.Model || '',
    powertrain: categorizePowertrain(r),
  };
}

function categorizePowertrain(r) {
  const elec = (r.ElectrificationLevel || '').toLowerCase();
  const fuelPrimary = (r.FuelTypePrimary || '').toLowerCase();
  const fuelSecondary = (r.FuelTypeSecondary || '').toLowerCase();

  const hasCombustion = fuelPrimary.includes('gasoline') || fuelPrimary.includes('diesel') || fuelPrimary.includes('flex');

  if ((elec.includes('bev') || fuelPrimary.includes('electric')) && !hasCombustion) {
    return 'electric';
  }
  if (elec.includes('phev') || elec.includes('hev') || fuelSecondary.includes('electric')) {
    return 'hybrid';
  }
  if (fuelPrimary.includes('diesel')) {
    return 'diesel';
  }
  if (fuelPrimary.includes('gasoline') || fuelPrimary.includes('flex')) {
    return 'gasoline';
  }
  return null; // Unknown — caller should fall back to asking manually.
}
