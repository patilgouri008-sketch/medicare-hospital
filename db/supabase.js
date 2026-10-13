const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const rawUrl = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.trim() : '';
// Strip trailing /rest/v1 or trailing slashes if present
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
// Supports the newer SUPABASE_SECRET_KEY naming convention as well as SUPABASE_SERVICE_ROLE_KEY
const supabaseSecretKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

let supabase = null;
const isConfigured = Boolean(
  supabaseUrl &&
  supabaseSecretKey &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseSecretKey.includes('your-supabase-secret')
);

if (isConfigured) {
  try {
    supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err.message);
    supabase = null;
  }
} else {
  console.warn(
    '[Supabase] Warning: SUPABASE_URL or SUPABASE_SECRET_KEY is missing or using placeholder values in .env. Database queries are paused until credentials are set.'
  );
}

/**
 * Perform a real lightweight query against Supabase to verify connectivity.
 * Fulfills requirement: Do not report connected until configuration and a real query have been tested.
 */
async function testConnection() {
  if (!isConfigured || !supabase) {
    return {
      connected: false,
      status: 'unconfigured',
      message: 'SUPABASE_URL or SUPABASE_SECRET_KEY is not configured in .env',
    };
  }

  try {
    // Attempt a lightweight real query on the doctors table
    const { data, error } = await supabase.from('doctors').select('id').limit(1);

    if (error) {
      // If table doesn't exist yet, connection credentials reached Supabase but schema isn't applied yet
      if (error.code === '42P01') {
        return {
          connected: false,
          status: 'schema_missing',
          message: 'Connected to Supabase, but "doctors" table is missing. Run database/schema.sql in Supabase SQL Editor.',
          error: error.message,
        };
      }
      return {
        connected: false,
        status: 'error',
        message: 'Supabase query error',
        error: error.message,
      };
    }

    return {
      connected: true,
      status: 'connected',
      message: 'Successfully connected and verified query with Supabase PostgreSQL',
    };
  } catch (err) {
    return {
      connected: false,
      status: 'error',
      message: 'Unexpected network or connection error',
      error: err.message,
    };
  }
}

module.exports = {
  supabase,
  isConfigured,
  testConnection,
};
