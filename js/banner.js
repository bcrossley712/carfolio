// ============================================================================
// banner.js — shared helper for small dismissible banners stacked at the
// bottom of the screen. Used by both the update-available prompt and the
// install prompt, so if both are relevant at once they stack cleanly
// instead of overlapping.
// ============================================================================

export function getBannerStack() {
  let stack = document.getElementById('banner-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'banner-stack';
    stack.className = 'banner-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

// Returns the banner element, or null if one with this id is already showing.
export function showBanner(id, html, wire) {
  if (document.getElementById(id)) return null;
  const el = document.createElement('div');
  el.className = 'app-banner';
  el.id = id;
  el.innerHTML = html;
  getBannerStack().appendChild(el);
  wire(el);
  return el;
}
