/**
 * BAIA Cafe — single source of truth for hours & location.
 *
 * Change hours HERE. Any element with a matching data attribute is filled
 * from these values at runtime (see src/components/openStatus.js):
 *   data-hours="cafe" | "cafeCompact" | "kitchen" | "cottage"
 *   data-open-status  (live "Open now / Closed" text; the nearest
 *                      [data-open-state] ancestor gets open|closing-soon|closed)
 *
 * The raw HTML that crawlers and link previews read is filled from this file
 * too, at dev/build time (src/utils/injectSiteInfo.js via vite.config.js):
 * {{tokens}} in the meta description / JSON-LD, and the fallback text inside
 * the data-hours / data-open-status elements.
 */

export const TIME_ZONE = 'Asia/Manila';

// 24h "HH:MM" strings, same for every day of the week.
export const HOURS = {
  cafe: { opens: '11:00', closes: '22:00' },
  kitchen: { closes: '21:00' },
  cottage: { opens: '07:00', closes: '18:00' } // per the official cottage rate card
};

export const LOCATION = {
  short: 'Laurente Beach, Burias Island',
  full: 'Barangay Laurente, San Pascual, Burias Island, Masbate',
  plusCode: '42PF+G8',
  mapsUrl: 'https://maps.app.goo.gl/vNYohzy8UWbM4d5P6'
};

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** "22:00" -> "10 PM", "11:30" -> "11:30 AM" */
export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "22:00" -> "10pm" — for tight spots like stat counters */
const formatTimeCompact = (hhmm) => formatTime(hhmm).replace(' ', '').toLowerCase();

export const HOURS_TEXT = {
  cafe: `${formatTime(HOURS.cafe.opens)} – ${formatTime(HOURS.cafe.closes)}`,
  cafeCompact: `${formatTimeCompact(HOURS.cafe.opens)}–${formatTimeCompact(HOURS.cafe.closes)}`,
  kitchen: `until ${formatTime(HOURS.kitchen.closes)}`,
  cottage: `${formatTime(HOURS.cottage.opens)} – ${formatTime(HOURS.cottage.closes)}`
};

/** Minutes since midnight in Manila, regardless of the visitor's own time zone. */
function manilaMinutesNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23'
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return get('hour') * 60 + get('minute');
}

/**
 * Regular-hours status. Does not know about one-off closures (weather etc.);
 * those are announced via the Drops section.
 * @returns {{ state: 'open' | 'closing-soon' | 'closed', label: string }}
 */
export function getOpenStatus(now = new Date()) {
  const mins = manilaMinutesNow(now);
  const opens = toMinutes(HOURS.cafe.opens);
  const closes = toMinutes(HOURS.cafe.closes);

  if (mins >= opens && mins < closes) {
    if (closes - mins <= 60) {
      return { state: 'closing-soon', label: `Closing soon · until ${formatTime(HOURS.cafe.closes)}` };
    }
    return { state: 'open', label: `Open now · until ${formatTime(HOURS.cafe.closes)}` };
  }
  const when = mins < opens ? 'today' : 'tomorrow';
  return { state: 'closed', label: `Closed · opens ${formatTime(HOURS.cafe.opens)} ${when}` };
}
