// Supabase client initialization
require('dotenv').config();
const supabase = require('@supabase/supabase-js');

// Environment configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// Validate URL format
try {
  new URL(supabaseUrl);
} catch (e) {
  throw new Error(`Invalid Supabase URL format: ${supabaseUrl}`);
}

// Create and export client instance with enhanced config
const client = supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

console.log('✓ Supabase client initialized');
console.log(`  URL: ${supabaseUrl.substring(0, 50)}...`);

module.exports = client;
