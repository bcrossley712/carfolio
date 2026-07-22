// ============================================================================
// dateutil.js — local-calendar-date helpers.
//
// new Date().toISOString() always returns UTC. Naively slicing that for
// "today" silently rolls over to tomorrow's date in the evening for anyone
// west of UTC (e.g. after ~5-7pm in US Mountain time, since MDT/MST is
// several hours behind UTC). Every place that needs "today" — or any other
// date — as the calendar day the user is actually experiencing must go
// through localDateStr(), not a raw toISOString() slice.
// ============================================================================

export function localDateStr(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}
