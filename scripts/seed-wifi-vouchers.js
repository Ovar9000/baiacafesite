import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...rest] = trimmed.split('=');
      const v = rest.join('=').trim().replace(/^["']|["']$/g, '');
      if (!process.env[k.trim()]) {
        process.env[k.trim()] = v;
      }
    }
  });
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

async function seed() {
  const csvPath = path.resolve(process.cwd(), 'supabase', 'wifi_vouchers.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('❌ wifi_vouchers.csv not found at:', csvPath);
    process.exit(1);
  }

  const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
  const rows = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(',');
    if (parts.length >= 6) {
      rows.push({
        code: parts[0].trim(),
        duration_hours: parseInt(parts[1], 10) || 1,
        device_limit: parseInt(parts[2], 10) || 2,
        valid_from: parts[3].trim(),
        valid_until: parts[4].trim(),
        is_claimed: parts[5].trim() === 'true'
      });
    }
  }

  console.log(`📡 Preparing to insert ${rows.length} Omada Wi-Fi vouchers into Supabase...`);

  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from('wifi_vouchers')
      .upsert(batch, { onConflict: 'code', ignoreDuplicates: true });

    if (error) {
      console.error(`❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
      console.log('💡 Tip: Make sure you have created the wifi_vouchers table in Supabase first using supabase/wifi_vouchers_schema.sql!');
      process.exit(1);
    }

    totalInserted += batch.length;
    process.stdout.write(`✅ Uploaded ${totalInserted}/${rows.length} vouchers...\r`);
  }

  console.log(`\n🎉 Success! All ${rows.length} vouchers seeded into public.wifi_vouchers.`);
}

seed().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
