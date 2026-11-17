import pg from 'pg';
import crypto from 'crypto';
import { ENV } from './env.js';

const { Pool } = pg;

let pool = null;
let memDbInstance = null;

export async function initDb() {
  if (pool) {
    return pool;
  }

  if (ENV.DATABASE_URL) {
    console.log('🔗 Connecting to PostgreSQL via DATABASE_URL...');
    const isSsl = !ENV.DATABASE_URL.includes('localhost') && !ENV.DATABASE_URL.includes('127.0.0.1');
    pool = new Pool({
      connectionString: ENV.DATABASE_URL,
      ssl: isSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    // Test connection
    const res = await pool.query('SELECT NOW() as now');
    console.log('✅ Connected to PostgreSQL:', res.rows[0].now);
    return pool;
  } else {
    if (ENV.NODE_ENV === 'production') {
      console.warn('⚠️ [Production Warning]: DATABASE_URL not set. Running with self-contained in-memory database fallback. Provide a persistent PostgreSQL DATABASE_URL (e.g. from Neon.tech) to retain data across restarts.');
    }
    console.log('⚡ DATABASE_URL not set. Initializing self-contained in-memory PostgreSQL engine (pg-mem)...');
    const { newDb } = await import('pg-mem');
    memDbInstance = newDb();
    
    // Register custom Postgres functions / types needed
    memDbInstance.public.registerFunction({
      name: 'gen_random_uuid',
      impure: true,
      implementation: () => crypto.randomUUID(),
    });

    const adapter = memDbInstance.adapters.createPg();
    pool = new adapter.Pool();
    console.log('✅ In-memory PostgreSQL engine ready.');
    return pool;
  }
}

export function getPool() {
  if (!pool) {
    throw new Error('Database pool has not been initialized. Call initDb() first.');
  }
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}

export async function getClient() {
  const p = getPool();
  return p.connect();
}

export async function withTransaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closeDb() {
  if (pool) {
    try {
      await pool.end();
    } catch (e) {
      // ignore
    }
    pool = null;
    memDbInstance = null;
  }
}
