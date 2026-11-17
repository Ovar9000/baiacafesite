/**
 * fetchWithRetry: one dropped connection must not fail the scheduled sync,
 * but token/auth errors (4xx) must still fail fast.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry } from '../scripts/fetch-retry.js';

const noWait = async () => {};
const opts = (fetchImpl) => ({ delays: [1, 1], fetchImpl, wait: noWait });
const res = (status) => ({ status, ok: status < 400 });

function scripted(...steps) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return res(step);
  };
  return { fetchImpl, calls };
}

test('retries a network error, then succeeds', async () => {
  const { fetchImpl, calls } = scripted(new TypeError('fetch failed'), 200);
  const r = await fetchWithRetry('https://graph.facebook.com/x?access_token=secret', undefined, opts(fetchImpl));
  assert.equal(r.status, 200);
  assert.equal(calls.length, 2);
});

test('retries 5xx and 429', async () => {
  const { fetchImpl, calls } = scripted(503, 429, 200);
  const r = await fetchWithRetry('u', undefined, opts(fetchImpl));
  assert.equal(r.status, 200);
  assert.equal(calls.length, 3);
});

test('does not retry 400 (expired token, bad field)', async () => {
  const { fetchImpl, calls } = scripted(400, 200);
  const r = await fetchWithRetry('u', undefined, opts(fetchImpl));
  assert.equal(r.status, 400);
  assert.equal(calls.length, 1);
});

test('throws the network error after the last attempt', async () => {
  const { fetchImpl, calls } = scripted(new TypeError('fetch failed'));
  await assert.rejects(fetchWithRetry('u', undefined, opts(fetchImpl)), /fetch failed/);
  assert.equal(calls.length, 3);
});

test('returns the last 5xx response when retries run out', async () => {
  const { fetchImpl, calls } = scripted(502);
  const r = await fetchWithRetry('u', undefined, opts(fetchImpl));
  assert.equal(r.status, 502);
  assert.equal(calls.length, 3);
});
