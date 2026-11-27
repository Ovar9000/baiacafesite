import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 
  import.meta.env.VITE_SUPABASE_URL || 
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://cqtcmrqlafgtcrcfaojz.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ''; // Publishable key must be set in Vercel env (VITE_SUPABASE_ANON_KEY). No secret fallback.

if (!supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_ANON_KEY — set it in Vercel environment variables.');
}

// Capture before createClient(), which may strip auth callback params via replaceState.
export const IS_AUTH_CALLBACK = typeof window !== 'undefined' && (
  window.location.search.includes('code=') ||
  window.location.search.includes('token_hash=') ||
  window.location.hash.includes('access_token=')
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});
