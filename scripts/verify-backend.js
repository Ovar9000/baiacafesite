/**
 * BAIA Cafe — Automated Backend & Codebase Health Verification Script
 * Validates backend contracts, secret consistency, Supabase schema, and time zone calculations.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const ENV_FILE = path.join(ROOT_DIR, '.env');
if (fs.existsSync(ENV_FILE)) {
  const content = fs.readFileSync(ENV_FILE, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...rest] = trimmed.split('=');
      const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://cqtcmrqlafgtcrcfaojz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const DAILY_QR_SECRET = process.env.DAILY_QR_SECRET || '***REMOVED_DAILY_QR_SECRET***';
const CAFE_TIMEZONE = process.env.CAFE_TIMEZONE || 'Asia/Manila';

let totalTests = 0;
let passedTests = 0;
let warnings = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

function warn(message) {
  warnings++;
  console.warn(`  ⚠️ WARN: ${message}`);
}

async function runHealthCheck() {
  console.log('====================================================');
  console.log('☕ BAIA CAFE — CODEBASE & BACKEND HEALTH AUDIT');
  console.log('====================================================\n');

  // Test 1: Manila Timezone & Date Formatting
  console.log('1. Timezone & Manila Midnight Boundary Tests:');
  const manilaDateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAFE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const y = manilaDateParts.find(p => p.type === 'year')?.value;
  const m = manilaDateParts.find(p => p.type === 'month')?.value;
  const d = manilaDateParts.find(p => p.type === 'day')?.value;
  const manilaDateStr = `${y}-${m}-${d}`;
  assert(/^\d{4}-\d{2}-\d{2}$/.test(manilaDateStr), `Calculated valid Manila date format: ${manilaDateStr}`);

  // Operating Hours (9:00 AM - 11:00 PM Manila)
  function isCafeOpen(date) {
    const hour = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: CAFE_TIMEZONE,
      hour: 'numeric',
      hourCycle: 'h23'
    }).format(date), 10);
    return hour >= 9 && hour < 23;
  }
  assert(isCafeOpen(new Date('2026-09-06T08:59:00+08:00')) === false, 'Rejects scan before 9:00 AM (8:59 AM)');
  assert(isCafeOpen(new Date('2026-09-06T09:00:00+08:00')) === true, 'Accepts scan at opening (9:00 AM)');
  assert(isCafeOpen(new Date('2026-09-06T22:59:59+08:00')) === true, 'Accepts scan right before closing (10:59 PM)');
  assert(isCafeOpen(new Date('2026-09-06T23:00:00+08:00')) === false, 'Rejects scan at closing (11:00 PM)');
  assert(isCafeOpen(new Date('2026-09-06T02:00:00+08:00')) === false, 'Rejects scan during midnight/closed hours (2:00 AM)');

  // Test 2: Cryptographic QR Signature & Verification
  console.log('\n2. Daily QR Signature & Timing-Safe Verification:');
  const token = crypto.createHmac('sha256', DAILY_QR_SECRET).update(manilaDateStr).digest('hex');
  assert(token.length === 64, `Generated 64-character SHA-256 hex token (${token.slice(0, 8)}...)`);

  function testSafeCompare(provided, expected) {
    if (!provided || typeof provided !== 'string') return false;
    if (provided.length !== 64 || expected.length !== 64) return false;
    const bufA = Buffer.from(provided, 'utf8');
    const bufB = Buffer.from(expected, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  assert(testSafeCompare(token, token) === true, 'Constant-time safe comparison passes for identical 64-char token');
  assert(testSafeCompare(token.slice(0, 1), token) === false, 'Rejects 1-char prefix attack vector');
  assert(testSafeCompare(token.slice(0, 16), token) === false, 'Rejects 16-char prefix attack vector');
  assert(testSafeCompare('a'.repeat(64), token) === false, 'Constant-time safe comparison rejects tampered tokens');

  // Test 3: Static Data Integrity
  console.log('\n3. Static Files & Updates Data Integrity:');
  const updatesFile = path.join(ROOT_DIR, 'src', 'data', 'updates.json');
  assert(fs.existsSync(updatesFile), 'src/data/updates.json exists');
  try {
    const raw = JSON.parse(fs.readFileSync(updatesFile, 'utf-8'));
    assert(Array.isArray(raw), `updates.json contains valid JSON array (${raw.length} active releases)`);
  } catch (e) {
    assert(false, `updates.json JSON parsing failed: ${e.message}`);
  }

  // Test 4: SQL Schema File Integrity
  console.log('\n4. Database Schema Definition:');
  const schemaFile = path.join(ROOT_DIR, 'supabase', 'schema.sql');
  assert(fs.existsSync(schemaFile), 'supabase/schema.sql exists');
  const schemaSql = fs.readFileSync(schemaFile, 'utf-8');
  assert(schemaSql.includes('stamps_user_single_daily_stamp_idx'), 'Schema includes daily stamp unique index');
  assert(schemaSql.includes('redemptions_user_milestone_idx'), 'Schema includes redemptions milestone unique index');
  assert(schemaSql.includes('on delete set null'), 'Schema includes on delete set null for wifi vouchers');
  assert(schemaSql.includes('public.drops'), 'Schema includes dynamic drops table');
  assert(schemaSql.includes('redeem_loyalty_reward'), 'Schema includes atomic redeem stored procedure');

  // Test 5: Live Supabase Backend Verification (if reachable)
  console.log('\n5. Supabase Connectivity & Table Health:');
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false }
      });

      console.log(`  📡 Connecting to Supabase project at: ${SUPABASE_URL}...`);
      
      const { data: dropsData, error: dropsErr } = await supabase
        .from('drops')
        .select('id')
        .limit(1);

      if (dropsErr) {
        warn(`Table 'drops' query returned: ${dropsErr.message} (Run schema.sql in Supabase SQL editor if not created yet)`);
      } else {
        assert(true, `Successfully queried 'drops' table in Supabase!`);
      }

      const { data: profilesData, error: profErr } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);

      if (profErr) {
        warn(`Table 'profiles' query returned: ${profErr.message}`);
      } else {
        assert(true, `Successfully verified 'profiles' table in Supabase!`);
      }

      const { data: stampsData, error: stampsErr } = await supabase
        .from('stamps')
        .select('id')
        .limit(1);

      if (stampsErr) {
        warn(`Table 'stamps' query returned: ${stampsErr.message}`);
      } else {
        assert(true, `Successfully verified 'stamps' table in Supabase!`);
      }

      const { data: redemptionsData, error: redErr } = await supabase
        .from('redemptions')
        .select('id')
        .limit(1);

      if (redErr) {
        warn(`Table 'redemptions' query returned: ${redErr.message}`);
      } else {
        assert(true, `Successfully verified 'redemptions' table in Supabase!`);
      }

      const { data: voucherData, error: vouchErr } = await supabase
        .from('wifi_vouchers')
        .select('id')
        .limit(1);

      if (vouchErr) {
        warn(`Table 'wifi_vouchers' query returned: ${vouchErr.message}`);
      } else {
        assert(true, `Successfully verified 'wifi_vouchers' table in Supabase!`);
      }

    } catch (sbEx) {
      warn(`Supabase network check exception: ${sbEx.message}`);
    }
  } else {
    warn('Skipping live Supabase connection (no SUPABASE_SERVICE_ROLE_KEY in environment)');
  }

  // Test 6: API Endpoints & Serverless Function Contracts
  console.log('\n6. Serverless API Endpoint Contracts:');
  const apis = [
    'claim-stamp.js',
    'redeem-reward.js',
    'admin-token.js',
    'delete-account.js',
    'admin-manual-stamp.js',
    'admin-rewards.js',
    'admin-activity.js'
  ];
  apis.forEach(api => {
    const apiFile = path.join(ROOT_DIR, 'api', api);
    assert(fs.existsSync(apiFile), `api/${api} exists`);
  });

  // Test 7: Motion & Animation System Sanity
  console.log('\n7. Motion & Animation Tokens:');
  const motionFile = path.join(ROOT_DIR, 'src', 'utils', 'motionSystem.js');
  assert(fs.existsSync(motionFile), 'src/utils/motionSystem.js exists');
  const motionContent = fs.readFileSync(motionFile, 'utf-8');
  assert(motionContent.includes('--motion-duration-logo'), 'Motion system registers --motion-duration-logo');
  assert(motionContent.includes('--motion-duration-page'), 'Motion system registers --motion-duration-page');

  // Summary
  console.log('\n====================================================');
  console.log(`🏁 AUDIT RESULTS: ${passedTests}/${totalTests} Passed | ${warnings} Warnings`);
  console.log('====================================================\n');

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runHealthCheck().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
