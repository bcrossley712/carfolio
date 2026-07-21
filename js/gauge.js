// ============================================================================
// gauge.js — renders the 270° arc gauge used throughout the app to show
// progress toward a vehicle's next due service. This is Carfolio's one
// signature visual element, reused everywhere rather than one-off decoration.
// ============================================================================

const STATUS_COLORS = {
  ok: '#4C7A5E',
  soon: '#E8A33D',
  overdue: '#C1503F',
  empty: '#C9C5BB',
};

// Polar -> cartesian helper for building the arc path.
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Describes an SVG arc path from startAngle to endAngle (in degrees, 0 = top).
function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

// percent: 0-1+ (values over 1 clamp visually but the label can still say "overdue")
// status: 'ok' | 'soon' | 'overdue' | 'empty' (no services logged yet)
export function renderGauge(percent, status = 'ok') {
  const cx = 38, cy = 38, r = 30;
  // Speedometer-style sweep: 270 degrees total, starting at -135 (bottom-left)
  // and ending at 135 (bottom-right), leaving a gap at the bottom.
  const startAngle = -135;
  const endAngle = 135;
  const fullSweep = endAngle - startAngle;
  const clamped = Math.min(Math.max(percent, 0), 1);
  const valueAngle = startAngle + fullSweep * clamped;

  const color = STATUS_COLORS[status] || STATUS_COLORS.ok;
  const trackPath = describeArc(cx, cy, r, startAngle, endAngle);
  const valuePath = clamped > 0.01 ? describeArc(cx, cy, r, startAngle, valueAngle) : '';

  return `
    <svg viewBox="0 0 76 76" role="img" aria-hidden="true">
      <path d="${trackPath}" fill="none" stroke="#E4E1DA" stroke-width="7" stroke-linecap="round"/>
      ${valuePath ? `<path d="${valuePath}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>` : ''}
    </svg>
  `;
}

export function gaugeLabel(status, percent) {
  if (status === 'empty') return '—';
  if (status === 'overdue') return 'Due';
  return `${Math.round((1 - Math.min(percent, 1)) * 100)}%`;
}
