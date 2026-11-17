import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, query } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('🚀 Running database migrations...');
  await initDb();

  // Create migrations table if not exists
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const files = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const existing = await query('SELECT id FROM migrations WHERE name = $1', [file]);
    if (existing.rows.length === 0) {
      console.log(`📦 Applying migration: ${file}...`);
      const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
      
      // Robust SQL statement splitting
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        // Skip comment-only chunks
        const cleaned = stmt.replace(/--.*$/gm, '').trim();
        if (cleaned.length > 0) {
          try {
            await query(cleaned);
          } catch (err) {
            if (!err.message.includes('already exists')) {
              console.error(`Error in statement: ${cleaned.substring(0, 100)}...`);
              throw err;
            }
          }
        }
      }

      await query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      console.log(`✅ Applied migration: ${file}`);
    } else {
      console.log(`⏩ Migration already applied: ${file}`);
    }
  }

  console.log('🎉 All migrations completed successfully.');
}

// Run directly if invoked from CLI
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().then(() => process.exit(0)).catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
}
