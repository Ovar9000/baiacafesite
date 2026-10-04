/**
 * Make the scheduled GitHub Actions sync fail loudly instead of "succeeding"
 * while doing nothing (missing secret, expired Facebook token, Supabase down).
 * A red run triggers GitHub's failure email; a silent green one hid a month of
 * stale drops in Sep–Oct 2026.
 *
 * Local runs keep the forgiving behaviour (warn and continue).
 */

export const IN_CI = process.env.GITHUB_ACTIONS === 'true';

/** In CI: print the reason and exit non-zero. Locally: just warn. */
export function failInCi(message) {
  if (IN_CI) {
    console.error(`\n❌ [CI] ${message}\n`);
    process.exit(1);
  }
  console.warn(`⚠️ ${message}`);
}

/** In CI, every named value must be present (pass { NAME: value }). */
export function requireCiSecrets(values) {
  if (!IN_CI) return;
  const missing = Object.entries(values)
    .filter(([, v]) => !v || !String(v).trim())
    .map(([k]) => k);
  if (missing.length > 0) {
    failInCi(
      `Missing GitHub Actions secret(s): ${missing.join(', ')}. ` +
      'Add them under the repo Settings → Secrets and variables → Actions.'
    );
  }
}
