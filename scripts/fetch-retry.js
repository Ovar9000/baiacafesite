/**
 * fetch() with a few retries for transient failures.
 *
 * The scheduled sync once failed on a single dropped connection
 * (`TypeError: fetch failed`) while the token and API were fine. Retries cover:
 *  - network errors (fetch throws: DNS, reset, timeout)
 *  - HTTP 429 and 5xx (Facebook rate limit / server hiccup)
 * Any other 4xx (expired token, bad field) is returned at once, so auth
 * problems still fail fast and show the real Facebook error.
 */

const RETRY_DELAYS_MS = [2000, 5000];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

/** Strip access_token from a URL so it never lands in CI logs. */
function redact(url) {
  return String(url).replace(/access_token=[^&]+/g, 'access_token=***');
}

export async function fetchWithRetry(url, options, { delays = RETRY_DELAYS_MS, fetchImpl = fetch, wait = sleep } = {}) {
  for (let attempt = 0; ; attempt++) {
    const retriesLeft = attempt < delays.length;
    try {
      const res = await fetchImpl(url, options);
      if (!retriesLeft || !isRetryableStatus(res.status)) return res;
      console.warn(`⚠️ [Retry] HTTP ${res.status} from ${redact(url).split('?')[0]}; retrying in ${delays[attempt] / 1000}s...`);
    } catch (err) {
      if (!retriesLeft) throw err;
      const cause = err.cause?.code || err.cause?.message || '';
      console.warn(`⚠️ [Retry] ${err.message}${cause ? ` (${cause})` : ''} from ${redact(url).split('?')[0]}; retrying in ${delays[attempt] / 1000}s...`);
    }
    await wait(delays[attempt]);
  }
}
