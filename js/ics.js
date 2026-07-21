// ============================================================================
// ics.js — generates a calendar event file for a reminder.
//
// This is the part of Carfolio designed to outlive Carfolio itself. Once a
// reminder is added to your phone's calendar app, it will keep notifying you
// on schedule forever — no app permissions to lose, nothing that can be
// revoked for inactivity, no dependency on this project still being
// maintained.
// ============================================================================

function toICSDate(dateStr) {
  // All-day event format: YYYYMMDD
  return dateStr.replace(/-/g, '');
}

function escapeICSText(text) {
  return String(text).replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
}

export function buildICS({ title, description, dueDate, uidSeed }) {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `${uidSeed}@carfolio.local`;
  const dateVal = toICSDate(dueDate);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Carfolio//Vehicle Maintenance Tracker//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dateVal}`,
    `DTEND;VALUE=DATE:${dateVal}`,
    `SUMMARY:${escapeICSText(title)}`,
    `DESCRIPTION:${escapeICSText(description)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-P1D', // fires a day before, in addition to the all-day event itself
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadICS(filename, icsContent) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
