/**
 * Build-time hours injection for index.html (wired up in vite.config.js).
 *
 * Crawlers, Google and Facebook link previews read the raw HTML without running
 * JS, so the hours there must already be correct. This fills them from
 * src/data/siteInfo.js so there is nothing to update by hand:
 *   - {{cafeHoursMeta}}, {{cafeOpens}}, {{cafeCloses}} tokens (meta + JSON-LD)
 *   - fallback text of <span data-hours="key">…</span>
 *   - fallback text of <span data-open-status>…</span>
 * The live "Open now / Closed" state is still computed in the browser.
 */

import { HOURS, HOURS_TEXT } from '../data/siteInfo.js';

const compact = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const time = m === 0 ? `${h12}` : `${h12}:${String(m).padStart(2, '0')}`;
  return `${time}${h >= 12 ? 'PM' : 'AM'}`;
};

export const SITE_INFO_TOKENS = {
  cafeHoursMeta: `${compact(HOURS.cafe.opens)}–${compact(HOURS.cafe.closes)}`,
  cafeOpens: HOURS.cafe.opens,
  cafeCloses: HOURS.cafe.closes
};

export function injectSiteInfo(html) {
  let out = html.replace(/\{\{(\w+)\}\}/g, (all, key) =>
    key in SITE_INFO_TOKENS ? SITE_INFO_TOKENS[key] : all
  );

  out = out.replace(
    /(<span\b[^>]*\bdata-hours="(\w+)"[^>]*>)[^<]*(<\/span>)/g,
    (all, open, key, close) => (key in HOURS_TEXT ? `${open}${HOURS_TEXT[key]}${close}` : all)
  );

  out = out.replace(
    /(<span\b[^>]*\bdata-open-status\b[^>]*>)[^<]*(<\/span>)/g,
    (all, open, close) => `${open}Open daily ${HOURS_TEXT.cafe}${close}`
  );

  const leftover = out.match(/\{\{\w+\}\}/);
  if (leftover) {
    throw new Error(`injectSiteInfo: unknown token ${leftover[0]} in index.html`);
  }
  return out;
}
