/** Shared XSS-safe helpers for innerHTML rendering paths. */

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const ALLOWED_URL_RE = /^(https:\/\/|mailto:|tel:|\/|\.\/|#)/i;
const FACEBOOK_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.me',
  'instagram.com',
  'maps.google.com'
]);

export function sanitizeUrl(url, fallback = '#') {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!ALLOWED_URL_RE.test(trimmed)) return fallback;
  try {
    const parsed = new URL(trimmed, window.location.origin);
    // Allow same-origin + https + specific external hosts
    if (parsed.origin === window.location.origin) return trimmed;
    if (parsed.protocol !== 'https:') return fallback;
    const host = parsed.hostname.toLowerCase();
    if (
      host === window.location.hostname ||
      host.endsWith('.fbcdn.net') ||
      host.endsWith('.facebook.com') ||
      FACEBOOK_HOSTS.has(host)
    ) {
      return trimmed;
    }
    // Allow any https image for drops? No — restrict to known CDNs + fallback
    // For generic links, allow https but strip javascript:/data: already rejected above
    return trimmed;
  } catch {
    return fallback;
  }
}

export function sanitizeImageUrl(url, fallback = './images/Baia%20skimboard%20and%20coffee.webp') {
  if (!url || typeof url !== 'string') return fallback;
  const t = url.trim();
  if (t.startsWith('/') || t.startsWith('./') || t.startsWith('images/')) return t;
  if (!t.startsWith('https://')) return fallback;
  try {
    const parsed = new URL(t);
    if (parsed.protocol !== 'https:') return fallback;
    return t;
  } catch {
    return fallback;
  }
}
